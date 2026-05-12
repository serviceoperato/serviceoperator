/**
 * Static site + admin email OTP (Resend) + portal users (JSON store in DATA_DIR).
 */
import crypto from 'crypto';
import fs from 'fs';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { assertReportSlug, createUserStore, normalizeEmail } from './clinic-store.mjs';
import { createPostgresUserStore, ensurePostgresUserSchema } from './postgres-user-store.mjs';
import { searchTextAllPages } from './lib/google-places-search.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, 'public');

let appVersion = '0.0.0';
try {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
  if (pkg && typeof pkg.version === 'string') appVersion = pkg.version;
} catch {
  /* keep default */
}
const dataDir = process.env.DATA_DIR || path.join(__dirname, 'data');
fs.mkdirSync(dataDir, { recursive: true });

async function initUserStore() {
  const adminEmail = (process.env.ADMIN_EMAIL || 'jack@serviceopera.to').trim().toLowerCase();
  const databaseUrl = (process.env.DATABASE_URL || '').trim();
  if (databaseUrl) {
    const { Pool } = await import('pg');
    const pool = new Pool({
      connectionString: databaseUrl,
      ssl:
        /sslmode=require/i.test(databaseUrl) || /railway/i.test(databaseUrl)
          ? { rejectUnauthorized: false }
          : undefined,
    });
    await ensurePostgresUserSchema(pool, adminEmail);
    return createPostgresUserStore(pool);
  }
  return createUserStore(dataDir, adminEmail);
}

const userStore = await initUserStore();

const clinicDataDir = path.join(publicDir, 'clinics', 'data');

function statMtimeMs(filePath) {
  try {
    return fs.statSync(filePath).mtimeMs;
  } catch {
    return null;
  }
}

/** JSON blobs under public/clinics/data — one file per report slug. */
function listClinicReportJsonFiles() {
  if (!fs.existsSync(clinicDataDir)) return [];
  const out = [];
  for (const name of fs.readdirSync(clinicDataDir)) {
    if (!name.endsWith('.json')) continue;
    const slug = name.slice(0, -5);
    const full = path.join(clinicDataDir, name);
    out.push({
      slug,
      relPath: path.posix.join('clinics/data', name.replace(/\\/g, '/')),
      mtimeMs: statMtimeMs(full),
    });
  }
  return out.sort((a, b) => (b.mtimeMs || 0) - (a.mtimeMs || 0));
}

/** Site pages Jack commonly edits or ships — presence + last modified. */
const MANAGED_PAGE_FILES = [
  'index.html',
  'login.html',
  'register.html',
  'places-leads.html',
  'clinics/report.html',
  'admin.html',
];

async function buildAdminWorkQueue() {
  const pending = (await userStore.listPendingSummaries())
    .slice()
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  const users = (await userStore.listUsers())
    .slice()
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  const takenSlugs = new Set([
    ...users.map((u) => u.reportSlug),
    ...pending.map((p) => p.reportSlug),
  ]);
  const clinicReportFiles = listClinicReportJsonFiles();
  const orphanReportDataFiles = clinicReportFiles.filter((f) => !takenSlugs.has(f.slug));
  const managedPages = MANAGED_PAGE_FILES.map((rel) => {
    const full = path.join(publicDir, ...rel.split('/'));
    const mtimeMs = statMtimeMs(full);
    return {
      path: '/' + rel.replace(/\\/g, '/'),
      relPath: rel.replace(/\\/g, '/'),
      mtimeMs,
      exists: mtimeMs != null,
    };
  }).filter((p) => p.exists);

  return {
    pendingRegistrations: pending,
    users,
    /** @deprecated use `users` */
    clinicUsers: users,
    clinicReportFiles,
    orphanReportDataFiles,
    managedPages,
    generatedAt: new Date().toISOString(),
  };
}

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'jack@serviceopera.to').trim().toLowerCase();
const RESEND_API_KEY = (process.env.RESEND_API_KEY || '').trim();
const RESEND_FROM = (process.env.RESEND_FROM || 'ServiceOpera <onboarding@resend.dev>').trim();
const RESEND_FROM_USES_TEST_SENDER = /@resend\.dev>/i.test(RESEND_FROM) || /onboarding@resend\.dev/i.test(RESEND_FROM);
/** Public sign-up is on by default; set PORTAL_SELF_REGISTER=false or legacy CLINIC_SELF_REGISTER=false for invite-only. */
const PORTAL_SELF_REGISTER = (function () {
  const raw = process.env.PORTAL_SELF_REGISTER ?? process.env.CLINIC_SELF_REGISTER;
  if (raw === undefined || raw === '') return true;
  const s = String(raw).toLowerCase().trim();
  if (s === '0' || s === 'false' || s === 'no' || s === 'off') return false;
  return true;
})();
const JWT_SECRET = (process.env.ADMIN_JWT_SECRET || '').trim() || crypto.randomBytes(32).toString('hex');

const OTP_TTL_MS = 10 * 60 * 1000;
const JWT_TTL_MS = 8 * 60 * 60 * 1000;
const CLINIC_JWT_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const CLINIC_RESET_JWT_MS = 60 * 60 * 1000;
/** Email confirmation link after self-registration (pending row finalized on click). */
const CLINIC_VERIFY_JWT_MS = 48 * 60 * 60 * 1000;
const SEND_WINDOW_MS = 15 * 60 * 1000;
const MAX_SENDS_PER_WINDOW = 4;

// Accept both the correct and a legacy misspelling env var.
const GOOGLE_MAPS_API_KEY = (process.env.GOOGLE_MAPS_API_KEY || process.env.GOGLE_MAPS_API_KEY || '').trim();
const PLACES_API_MIN_GAP_MS = Number(process.env.PLACES_API_MIN_GAP_MS || 400);

/** Minimum spacing between outbound Google Places HTTP calls (same process). */
let lastPlacesOutboundAt = 0;
async function throttlePlacesOutbound() {
  const gap = Number.isFinite(PLACES_API_MIN_GAP_MS) && PLACES_API_MIN_GAP_MS >= 0 ? PLACES_API_MIN_GAP_MS : 400;
  const now = Date.now();
  const elapsed = now - lastPlacesOutboundAt;
  if (elapsed < gap) {
    await new Promise((r) => setTimeout(r, gap - elapsed));
  }
  lastPlacesOutboundAt = Date.now();
}

const PLACES_IP_WINDOW_MS = 15 * 60 * 1000;
const PLACES_IP_MAX = 60;
/** @type {Map<string, number[]>} */
const placesIpHits = new Map();

function allowPlacesSearchIp(ip) {
  const now = Date.now();
  const arr = (placesIpHits.get(ip) || []).filter((t) => now - t < PLACES_IP_WINDOW_MS);
  if (arr.length >= PLACES_IP_MAX) return false;
  arr.push(now);
  placesIpHits.set(ip, arr);
  return true;
}

/** @type {Map<string, { hash: string, exp: number }>} */
const otpByEmail = new Map();
/** Portal user sign-in OTP (not admin). Key: normalized email */
const portalOtpByEmail = new Map();

function isPortalSessionRole(role) {
  return role === 'user' || role === 'clinic';
}
function isPortalVerifyRole(role) {
  return role === 'user_verify' || role === 'clinic_verify';
}
function isPortalResetRole(role) {
  return role === 'user_reset' || role === 'clinic_reset';
}

function dualPost(pathNew, pathLegacy, handler) {
  app.post(pathNew, handler);
  app.post(pathLegacy, handler);
}
function dualGet(pathNew, pathLegacy, ...args) {
  app.get(pathNew, ...args);
  app.get(pathLegacy, ...args);
}
/** @type {Map<string, number[]>} */
const sendTimestampsByIp = new Map();

function sha256hex(s) {
  return crypto.createHash('sha256').update(s, 'utf8').digest('hex');
}

function timingEqual(a, b) {
  try {
    return crypto.timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
  } catch {
    return false;
  }
}

function signJwt(payload) {
  const exp = typeof payload.exp === 'number' ? payload.exp : Date.now() + JWT_TTL_MS;
  const body = Buffer.from(JSON.stringify({ ...payload, exp }), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', JWT_SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function verifyJwt(token) {
  if (!token || typeof token !== 'string') return null;
  const i = token.lastIndexOf('.');
  if (i <= 0) return null;
  const body = token.slice(0, i);
  const sig = token.slice(i + 1);
  const expected = crypto.createHmac('sha256', JWT_SECRET).update(body).digest('base64url');
  if (!timingEqual(sig, expected)) return null;
  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!payload || payload.v !== 1 || typeof payload.exp !== 'number' || payload.exp < Date.now()) return null;
  return payload;
}

function getBearer(req) {
  const h = req.headers.authorization || '';
  const m = typeof h === 'string' ? h.match(/^Bearer\s+(.+)$/i) : null;
  return m ? m[1].trim() : '';
}

function requireAdmin(req, res, next) {
  const p = verifyJwt(getBearer(req));
  if (!p || p.role !== 'admin' || typeof p.email !== 'string') {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  req.admin = p;
  next();
}

function clientIp(req) {
  const xf = req.headers['x-forwarded-for'];
  if (typeof xf === 'string' && xf.length) return xf.split(',')[0].trim();
  return req.socket.remoteAddress || 'unknown';
}

function clientCountry(req) {
  const candidates = [
    req.headers['cf-ipcountry'],
    req.headers['x-vercel-ip-country'],
    req.headers['cloudfront-viewer-country'],
  ];
  for (const value of candidates) {
    if (typeof value === 'string' && value.trim() && value.trim() !== 'XX') {
      return value.trim().toUpperCase();
    }
  }
  return null;
}

async function recordPortalLogin(req, user) {
  if (!user || typeof user.id !== 'string' || !user.id) return;
  if (typeof userStore.recordLogin !== 'function') return;
  try {
    await userStore.recordLogin(user.id, { ip: clientIp(req), country: clientCountry(req) });
  } catch {
    /* login should still succeed if audit write fails */
  }
}

function pruneSends(ip) {
  const now = Date.now();
  const arr = sendTimestampsByIp.get(ip) || [];
  const fresh = arr.filter((t) => now - t < SEND_WINDOW_MS);
  sendTimestampsByIp.set(ip, fresh);
  return fresh;
}

function resendFailureMessage(err, fallback) {
  const detailRaw = String(err?.resendDetail || err?.message || '');
  const detail = detailRaw.toLowerCase();
  const docDomains = 'https://resend.com/docs/dashboard/domains/introduction';
  if (
    detail.includes('only send') ||
    detail.includes('testing emails') ||
    detail.includes('test emails') ||
    detail.includes('sandbox')
  ) {
    return (
      'Resend blocked this send: RESEND_FROM is still using the sandbox / test sender (e.g. onboarding@resend.dev).\n\n' +
      '▸ Meaning · In test mode Resend delivers only to the mailbox tied to your Resend account—not arbitrary addresses.\n\n' +
      '▸ Fix · Add & verify your real domain under Resend (Domains → DNS records), then set RESEND_FROM on Railway to e.g. "ServiceOpera <noreply@yourdomain.com>" and redeploy.\n\n' +
      '▸ Docs · ' +
      docDomains
    );
  }
  if (detail.includes('domain') && (detail.includes('verify') || detail.includes('verified'))) {
    return (
      'Resend blocked this send: the domain (or mailbox) used in RESEND_FROM is not verified in your Resend project.\n\n' +
      '▸ Fix · Open Resend → Domains, add `yourdomain`, add the SPF/DKIM/verification DNS records until status is verified.\n\n' +
      '▸ Then · Set Railway `RESEND_FROM` to an address @ that domain (matching a verified sender in Resend), save, redeploy this service.\n\n' +
      '▸ Check · Deploy logs still show `[serviceopera] Resend: RESEND_FROM=…`; if the variable isn’t picked up, trigger a redeploy.\n\n' +
      '▸ Docs · ' +
      docDomains
    );
  }
  if (detail.includes('invalid api key') || detail.includes('unauthorized') || detail.includes('api key')) {
    return (
      'Resend rejected this request: invalid or unauthorised API credential.\n\n' +
      '▸ Fix · In Railway open the Node service → Variables → regenerate or paste a fresh RESEND_API_KEY from Resend (API Keys), redeploy.'
    );
  }
  return fallback;
}

async function sendResendEmail({ to, subject, html }) {
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + RESEND_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: RESEND_FROM, to: [to], subject, html }),
  });
  const text = await r.text();
  if (!r.ok) {
    let resendDetail = text.slice(0, 400);
    try {
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed.message === 'string') resendDetail = parsed.message;
    } catch {
      /* keep raw body */
    }
    const err = new Error('Resend HTTP ' + r.status + ': ' + resendDetail);
    err.status = r.status >= 500 ? 503 : 502;
    err.resendDetail = resendDetail;
    console.error('[serviceopera] Resend failed:', r.status, resendDetail);
    throw err;
  }
}

function publicOrigin(req) {
  const fromEnv = (process.env.PUBLIC_ORIGIN || '').trim().replace(/\/$/, '');
  if (fromEnv) return fromEnv;
  const host = req.get('host') || 'localhost';
  const xfProto = req.headers['x-forwarded-proto'];
  const proto =
    typeof xfProto === 'string' && xfProto.length ? xfProto.split(',')[0].trim() : req.protocol || 'http';
  return `${proto}://${host}`.replace(/\/$/, '');
}

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(express.json({ limit: '48kb' }));

app.use((req, res, next) => {
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  next();
});

app.get('/api/version', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ version: appVersion });
});

app.get('/api/debug/user-store', async (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const storage = await userStore.getStorageSummary();
    const databaseUrlConfigured = Boolean((process.env.DATABASE_URL || '').trim());
    return res.json({
      ok: true,
      service: 'serviceopera',
      version: appVersion,
      storage,
      deploy: {
        databaseUrlConfigured,
        dataDir,
        portalSelfRegister: Boolean(PORTAL_SELF_REGISTER),
        resendConfigured: Boolean(RESEND_API_KEY),
        registrationConfirmEmail: Boolean(RESEND_API_KEY && PORTAL_SELF_REGISTER),
        adminEmailConfigured: Boolean((process.env.ADMIN_EMAIL || '').trim()),
        nodeVersion: process.version,
        userStoreBackend: storage.backend || userStore.backend || (databaseUrlConfigured ? 'postgres' : 'json-files'),
      },
    });
  } catch (e) {
    return res.status(500).json({
      ok: false,
      service: 'serviceopera',
      error: e.message || 'Failed to read user store.',
    });
  }
});

app.get('/api/admin/capabilities', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({
    service: 'serviceopera',
    version: appVersion,
    otpEnabled: Boolean(RESEND_API_KEY),
    userAccountsApi: true,
    userPasswordResetEmail: Boolean(RESEND_API_KEY),
    /** @deprecated */
    clinicUsersApi: true,
    clinicPasswordResetEmail: Boolean(RESEND_API_KEY),
  });
});

function sendPortalCapabilities(_req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.json({
    service: 'serviceopera',
    version: appVersion,
    passwordResetEmail: Boolean(RESEND_API_KEY),
    selfRegister: Boolean(PORTAL_SELF_REGISTER),
    registrationConfirmEmail: Boolean(RESEND_API_KEY && PORTAL_SELF_REGISTER),
    resendTestSender: Boolean(RESEND_API_KEY && RESEND_FROM_USES_TEST_SENDER),
  });
}

app.get('/api/auth/user-capabilities', sendPortalCapabilities);
app.get('/api/auth/clinic-capabilities', sendPortalCapabilities);

async function handlePortalRegister(req, res) {
  if (!PORTAL_SELF_REGISTER) {
    return res.status(403).json({ error: 'Self-registration is disabled. Contact jack@serviceopera.to for access.' });
  }
  if (!RESEND_API_KEY) {
    return res.status(503).json({
      error:
        'Email confirmation requires RESEND_API_KEY on this server. Contact jack@serviceopera.to or ask your administrator to configure Resend.',
    });
  }
  const email = typeof req.body?.email === 'string' ? req.body.email : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const ip = clientIp(req);
  const sends = pruneSends(ip);
  if (sends.length >= MAX_SENDS_PER_WINDOW) {
    return res.status(429).json({ error: 'Too many requests. Try again later.' });
  }
  let pending;
  try {
    pending = await userStore.createPendingRegistration({ email, password });
  } catch (e) {
    const status = e.status || 400;
    return res.status(status).json({ error: e.message || 'Bad request' });
  }
  const verifyJwtToken = signJwt({
    v: 1,
    role: 'user_verify',
    sub: pending.id,
    email: pending.email,
    exp: Date.now() + CLINIC_VERIFY_JWT_MS,
  });
  const origin = publicOrigin(req);
  const link = `${origin}/login.html?verify=${encodeURIComponent(verifyJwtToken)}`;
  try {
    await sendResendEmail({
      to: pending.email,
      subject: 'ServiceOpera — confirm your account',
      html:
        '<p style="font-family:system-ui,sans-serif;font-size:15px;color:#111">Thanks for signing up for <strong>ServiceOpera.to</strong>.</p>' +
        '<p style="font-family:system-ui,sans-serif;font-size:15px;color:#111"><a href="' +
        String(link).replace(/"/g, '&quot;') +
        '" style="color:#1e3a5f;font-weight:600">Confirm your email</a> (link expires in 48 hours.)</p>' +
        '<p style="font-family:system-ui,sans-serif;font-size:13px;color:#444">If you did not register, ignore this email.</p>',
    });
    sends.push(Date.now());
    sendTimestampsByIp.set(ip, sends);
  } catch (e) {
    const status = e.status || 502;
    return res.status(status).json({
      error: resendFailureMessage(
        e,
        'Could not send confirmation email. Try again later or contact jack@serviceopera.to.'
      ),
    });
  }
  return res.status(201).json({
    ok: true,
    message: 'Check your inbox for a confirmation link to activate your account.',
  });
}

app.post('/api/auth/user-register', handlePortalRegister);
app.post('/api/auth/clinic-register', handlePortalRegister);

app.post('/api/admin/send-code', async (req, res) => {
  if (!RESEND_API_KEY) {
    return res.status(503).json({ error: 'Email sign-in is not configured (missing RESEND_API_KEY).' });
  }
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const ip = clientIp(req);
  const sends = pruneSends(ip);
  if (sends.length >= MAX_SENDS_PER_WINDOW) {
    return res.status(429).json({ error: 'Too many requests. Try again later.' });
  }

  const generic = { ok: true, message: 'If that address is authorised, an email with a sign-in code was sent.' };

  if (email !== ADMIN_EMAIL) {
    return res.json(generic);
  }

  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  otpByEmail.set(ADMIN_EMAIL, { hash: sha256hex(code), exp: Date.now() + OTP_TTL_MS });

  try {
    await sendResendEmail({
      to: ADMIN_EMAIL,
      subject: 'ServiceOpera — admin sign-in code',
      html:
        '<p style="font-family:system-ui,sans-serif;font-size:15px;color:#111">Your admin sign-in code is:</p>' +
        '<p style="font-family:ui-monospace,monospace;font-size:28px;font-weight:700;letter-spacing:0.15em;color:#111">' +
        code +
        '</p>' +
        '<p style="font-family:system-ui,sans-serif;font-size:13px;color:#444">This code expires in 10 minutes. If you did not request it, ignore this email.</p>',
    });
    sends.push(Date.now());
    sendTimestampsByIp.set(ip, sends);
  } catch (e) {
    otpByEmail.delete(ADMIN_EMAIL);
    const status = e.status || 502;
    return res.status(status).json({
      error: resendFailureMessage(e, 'Could not send email. Check RESEND_FROM / domain and API key.'),
    });
  }

  return res.json(generic);
});

app.post('/api/admin/verify-code', (req, res) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const code = typeof req.body?.code === 'string' ? req.body.code.trim().replace(/\s/g, '') : '';
  if (email !== ADMIN_EMAIL) {
    return res.status(401).json({ error: 'Invalid email or code.' });
  }
  const row = otpByEmail.get(ADMIN_EMAIL);
  if (!row || row.exp < Date.now()) {
    return res.status(401).json({ error: 'Code expired or not found. Request a new code.' });
  }
  if (!/^\d{6}$/.test(code) || row.hash !== sha256hex(code)) {
    return res.status(401).json({ error: 'Invalid email or code.' });
  }
  otpByEmail.delete(ADMIN_EMAIL);
  const token = signJwt({ v: 1, role: 'admin', email: ADMIN_EMAIL, exp: Date.now() + JWT_TTL_MS });
  return res.json({ ok: true, token, expiresInMs: JWT_TTL_MS });
});

app.get('/api/admin/session', (req, res) => {
  const p = verifyJwt(getBearer(req));
  if (!p || p.role !== 'admin') return res.status(401).json({ ok: false });
  return res.json({ ok: true, email: p.email });
});

app.post('/api/admin/bootstrap-from-portal', (req, res) => {
  const p = verifyJwt(getBearer(req));
  if (!p || !isPortalSessionRole(p.role) || typeof p.email !== 'string') {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }
  if (p.email.trim().toLowerCase() !== ADMIN_EMAIL) {
    return res.status(403).json({ ok: false, error: 'Forbidden' });
  }
  const token = signJwt({ v: 1, role: 'admin', email: ADMIN_EMAIL, exp: Date.now() + JWT_TTL_MS });
  return res.json({ ok: true, token, expiresInMs: JWT_TTL_MS });
});

async function listPortalUsersForAdmin(_req, res) {
  res.json({ users: await userStore.listUsers() });
}
app.get('/api/user-accounts', requireAdmin, listPortalUsersForAdmin);
app.get('/api/clinic-users', requireAdmin, listPortalUsersForAdmin);

app.get('/api/admin/work-queue', requireAdmin, async (_req, res) => {
  try {
    res.json(await buildAdminWorkQueue());
  } catch (e) {
    res.status(500).json({ error: e.message || 'Failed to build work queue' });
  }
});

async function createPortalUserAdmin(req, res) {
  try {
    const email = req.body?.email;
    const password = req.body?.password;
    const reportSlug = req.body?.reportSlug;
    const created = await userStore.createUser({ email, password, reportSlug });
    return res.status(201).json(created);
  } catch (e) {
    const status = e.status || 400;
    return res.status(status).json({ error: e.message || 'Bad request' });
  }
}
app.post('/api/user-accounts', requireAdmin, createPortalUserAdmin);
app.post('/api/clinic-users', requireAdmin, createPortalUserAdmin);

async function updatePortalUserAdmin(req, res) {
  if (typeof userStore.updateUserProfile !== 'function') {
    return res.status(501).json({ error: 'Profile updates are not available on this server.' });
  }
  try {
    const updated = await userStore.updateUserProfile(req.params.id, req.body || {});
    return res.json(updated);
  } catch (e) {
    const status = e.status || 400;
    return res.status(status).json({ error: e.message || 'Bad request' });
  }
}
app.patch('/api/user-accounts/:id', requireAdmin, updatePortalUserAdmin);
app.patch('/api/clinic-users/:id', requireAdmin, updatePortalUserAdmin);

dualPost('/api/auth/user-login', '/api/auth/clinic-login', async (req, res) => {
  const email = typeof req.body?.email === 'string' ? req.body.email : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const user = await userStore.verifyLogin(email, password);
  if (!user) {
    const pending = await userStore.findPendingByEmail(email);
    if (pending) {
      return res.status(403).json({
        error:
          'This email is waiting for confirmation. Open the link from your signup email, then sign in. You can also use “Resend confirmation link” below.',
      });
    }
    return res.status(401).json({ error: 'Invalid email or password.' });
  }
  await recordPortalLogin(req, user);
  const token = signJwt({
    v: 1,
    role: 'user',
    email: user.email,
    reportSlug: user.reportSlug,
    sub: user.id,
    exp: Date.now() + CLINIC_JWT_TTL_MS,
  });
  const reportUrl = '/clinics/report.html?slug=' + encodeURIComponent(user.reportSlug);
  return res.json({ ok: true, token, reportSlug: user.reportSlug, reportUrl });
});

dualPost('/api/auth/user-otp/send', '/api/auth/clinic-otp/send', async (req, res) => {
  if (!RESEND_API_KEY) {
    return res.status(503).json({ error: 'Email sign-in is not configured (missing RESEND_API_KEY).' });
  }
  const email = typeof req.body?.email === 'string' ? normalizeEmail(req.body.email) : '';
  const ip = clientIp(req);
  const sends = pruneSends(ip);
  if (sends.length >= MAX_SENDS_PER_WINDOW) {
    return res.status(429).json({ error: 'Too many requests. Try again later.' });
  }

  const generic = { ok: true, message: 'If that email is registered, a sign-in code was sent.' };

  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'Invalid email.' });
  }

  const user = await userStore.getUserByEmail(email);
  if (!user) {
    return res.json(generic);
  }

  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  portalOtpByEmail.set(email, { hash: sha256hex(code), exp: Date.now() + OTP_TTL_MS });

  try {
    await sendResendEmail({
      to: user.email,
      subject: 'ServiceOpera — your sign-in code',
      html:
        '<p style="font-family:system-ui,sans-serif;font-size:15px;color:#111">Your sign-in code for <strong>ServiceOpera.to</strong>:</p>' +
        '<p style="font-family:ui-monospace,monospace;font-size:28px;font-weight:700;letter-spacing:0.15em;color:#111">' +
        code +
        '</p>' +
        '<p style="font-family:system-ui,sans-serif;font-size:13px;color:#444">This code expires in 10 minutes. If you did not request it, you can ignore this email.</p>',
    });
    sends.push(Date.now());
    sendTimestampsByIp.set(ip, sends);
  } catch (e) {
    portalOtpByEmail.delete(email);
    const status = e.status || 502;
    return res.status(status).json({
      error: resendFailureMessage(e, 'Could not send sign-in email. Try again later.'),
    });
  }

  return res.json(generic);
});

dualPost('/api/auth/user-login-otp', '/api/auth/clinic-login-otp', async (req, res) => {
  const email = typeof req.body?.email === 'string' ? normalizeEmail(req.body.email) : '';
  const otp =
    typeof req.body?.otp === 'string'
      ? req.body.otp.trim().replace(/\s/g, '')
      : typeof req.body?.code === 'string'
        ? req.body.code.trim().replace(/\s/g, '')
        : '';
  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'Invalid email.' });
  }
  const user = await userStore.getUserByEmail(email);
  if (!user || user.active === false) {
    return res.status(401).json({ error: 'Invalid email or code.' });
  }
  const row = portalOtpByEmail.get(email);
  if (!row || row.exp < Date.now()) {
    return res.status(401).json({ error: 'Code expired or not found. Request a new code.' });
  }
  if (!/^\d{6}$/.test(otp) || row.hash !== sha256hex(otp)) {
    return res.status(401).json({ error: 'Invalid email or code.' });
  }
  portalOtpByEmail.delete(email);
  await recordPortalLogin(req, user);
  const token = signJwt({
    v: 1,
    role: 'user',
    email: user.email,
    reportSlug: user.reportSlug,
    sub: user.id,
    exp: Date.now() + CLINIC_JWT_TTL_MS,
  });
  const reportUrl = '/clinics/report.html?slug=' + encodeURIComponent(user.reportSlug);
  return res.json({ ok: true, token, reportSlug: user.reportSlug, reportUrl });
});

dualPost('/api/auth/user-resend-confirmation', '/api/auth/clinic-resend-confirmation', async (req, res) => {
  if (!PORTAL_SELF_REGISTER) {
    return res.status(403).json({ error: 'Self-registration is disabled. Contact jack@serviceopera.to for access.' });
  }
  if (!RESEND_API_KEY) {
    return res.status(503).json({
      error:
        'Email confirmation requires RESEND_API_KEY on this server. Contact jack@serviceopera.to or ask your administrator to configure Resend.',
    });
  }
  const email = typeof req.body?.email === 'string' ? normalizeEmail(req.body.email) : '';
  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'Invalid email.' });
  }
  const pending = await userStore.findPendingByEmail(email);
  const generic = {
    ok: true,
    message: 'If that address has a pending sign-up, a new confirmation link was sent.',
  };
  if (!pending) {
    return res.json(generic);
  }
  const ip = clientIp(req);
  const sends = pruneSends(ip);
  if (sends.length >= MAX_SENDS_PER_WINDOW) {
    return res.status(429).json({ error: 'Too many requests. Try again later.' });
  }

  const verifyJwtToken = signJwt({
    v: 1,
    role: 'user_verify',
    sub: pending.id,
    email: pending.email,
    exp: Date.now() + CLINIC_VERIFY_JWT_MS,
  });
  const origin = publicOrigin(req);
  const link = `${origin}/login.html?verify=${encodeURIComponent(verifyJwtToken)}`;
  try {
    await sendResendEmail({
      to: pending.email,
      subject: 'ServiceOpera — confirm your account',
      html:
        '<p style="font-family:system-ui,sans-serif;font-size:15px;color:#111">Thanks for signing up for <strong>ServiceOpera.to</strong>.</p>' +
        '<p style="font-family:system-ui,sans-serif;font-size:15px;color:#111"><a href="' +
        String(link).replace(/"/g, '&quot;') +
        '" style="color:#1e3a5f;font-weight:600">Confirm your email</a> (link expires in 48 hours.)</p>' +
        '<p style="font-family:system-ui,sans-serif;font-size:13px;color:#444">If you did not register, ignore this email.</p>',
    });
    sends.push(Date.now());
    sendTimestampsByIp.set(ip, sends);
  } catch (e) {
    const status = e.status || 502;
    return res.status(status).json({
      error: resendFailureMessage(e, 'Could not send confirmation email. Try again later or contact jack@serviceopera.to.'),
    });
  }
  return res.json(generic);
});

dualPost('/api/auth/user-request-reset', '/api/auth/clinic-request-reset', async (req, res) => {
  const generic = {
    ok: true,
    message: 'If that email is registered, we sent a link to reset your password. Check your inbox.',
  };
  if (!RESEND_API_KEY) {
    return res.status(503).json({
      error:
        'Password reset by email is not available on this server. Please contact your administrator (Jack) to set a new password.',
    });
  }
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const ip = clientIp(req);
  const sends = pruneSends(ip);
  if (sends.length >= MAX_SENDS_PER_WINDOW) {
    return res.status(429).json({ error: 'Too many requests. Try again later.' });
  }

  const user = email && email.includes('@') ? await userStore.getUserByEmail(email) : null;
  if (!user) {
    return res.json(generic);
  }

  const resetToken = signJwt({
    v: 1,
    role: 'user_reset',
    sub: user.id,
    email: user.email,
    exp: Date.now() + CLINIC_RESET_JWT_MS,
  });
  const origin = publicOrigin(req);
  const link = `${origin}/login.html?reset=${encodeURIComponent(resetToken)}`;

  try {
    await sendResendEmail({
      to: user.email,
      subject: 'ServiceOpera — reset your password',
      html:
        '<p style="font-family:system-ui,sans-serif;font-size:15px;color:#111">You asked to reset the password for your <strong>ServiceOpera.to</strong> account.</p>' +
        '<p style="font-family:system-ui,sans-serif;font-size:15px;color:#111"><a href="' +
        String(link).replace(/"/g, '&quot;') +
        '" style="color:#1e3a5f;font-weight:600">Reset password</a> (link expires in one hour.)</p>' +
        '<p style="font-family:system-ui,sans-serif;font-size:13px;color:#444">If you did not request this, ignore this email.</p>',
    });
    sends.push(Date.now());
    sendTimestampsByIp.set(ip, sends);
  } catch (e) {
    const status = e.status || 502;
    return res.status(status).json({
      error: resendFailureMessage(e, 'Could not send email. Try again later or contact jack@serviceopera.to.'),
    });
  }

  return res.json(generic);
});

dualPost('/api/auth/user-reset-password', '/api/auth/clinic-reset-password', async (req, res) => {
  const token = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const p = verifyJwt(token);
  if (!p || !isPortalResetRole(p.role) || typeof p.sub !== 'string' || typeof p.email !== 'string') {
    return res.status(401).json({ error: 'Invalid or expired reset link. Request a new one from the login page.' });
  }
  const row = await userStore.getUserByEmail(p.email);
  if (!row || row.id !== p.sub) {
    return res.status(401).json({ error: 'Invalid or expired reset link. Request a new one from the login page.' });
  }
  try {
    await userStore.setPasswordForUser(p.sub, password);
  } catch (e) {
    const status = e.status || 400;
    return res.status(status).json({ error: e.message || 'Bad request' });
  }
  return res.json({ ok: true, message: 'Password updated. You can sign in now.' });
});

dualPost('/api/auth/user-verify-email', '/api/auth/clinic-verify-email', async (req, res) => {
  const token = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
  const p = verifyJwt(token);
  if (!p || !isPortalVerifyRole(p.role) || typeof p.sub !== 'string' || typeof p.email !== 'string') {
    return res
      .status(401)
      .json({ error: 'Invalid or expired confirmation link. Register again from the login page.' });
  }
  try {
    const created = await userStore.finalizePendingRegistration(p.sub, p.email);
    return res.status(201).json({
      ok: true,
      message: 'Email confirmed. You can sign in below.',
      email: created.email,
      reportSlug: created.reportSlug,
    });
  } catch (e) {
    const status = e.status || 400;
    return res.status(status).json({ error: e.message || 'Bad request' });
  }
});

dualGet(
  '/api/auth/user-session',
  '/api/auth/clinic-session',
  (req, res) => {
    const p = verifyJwt(getBearer(req));
    if (!p || !isPortalSessionRole(p.role) || typeof p.reportSlug !== 'string')
      return res.status(401).json({ ok: false });
    return res.json({ ok: true, email: p.email, reportSlug: p.reportSlug });
  }
);

/**
 * Google Places API (New) — Text Search lead collector (API key server-side only).
 * POST /api/places/search { "query": "...", "category": "clinic" | "hotel" | "real_estate" }
 */
app.post('/api/places/search', async (req, res) => {
  if (!GOOGLE_MAPS_API_KEY) {
    return res.status(503).json({
      error:
        'GOOGLE_MAPS_API_KEY is not set on this server. Add it to .env and restart (key must never ship to the browser).',
    });
  }
  const ip = clientIp(req);
  if (!allowPlacesSearchIp(ip)) {
    return res.status(429).json({ error: 'Too many Places searches from this IP. Try again in a few minutes.' });
  }

  const query = typeof req.body?.query === 'string' ? req.body.query.trim() : '';
  const category = typeof req.body?.category === 'string' ? req.body.category.trim() : '';
  if (!query || query.length > 500) {
    return res.status(400).json({ error: 'Invalid or missing "query" (required, max 500 characters).' });
  }
  if (!category || category.length > 64) {
    return res.status(400).json({ error: 'Invalid or missing "category".' });
  }

  try {
    const { rows, collectedAt } = await searchTextAllPages({
      apiKey: GOOGLE_MAPS_API_KEY,
      textQuery: query,
      category,
      onBeforeRequest: throttlePlacesOutbound,
    });
    res.setHeader('Cache-Control', 'no-store');
    return res.json({
      ok: true,
      query,
      category,
      count: rows.length,
      collected_at: collectedAt,
      rows,
    });
  } catch (e) {
    const status = Number(e.status) >= 400 && Number(e.status) < 600 ? Number(e.status) : 502;
    return res.status(status).json({
      error: typeof e.message === 'string' ? e.message : 'Places API request failed',
    });
  }
});

app.get('/api/clinics/report-data', (req, res) => {
  const slug = typeof req.query.slug === 'string' ? req.query.slug.trim() : '';
  try {
    assertReportSlug(slug);
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
  const p = verifyJwt(getBearer(req));
  if (!p || !isPortalSessionRole(p.role) || p.reportSlug !== slug) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const specific = path.join(publicDir, 'clinics', 'data', slug + '.json');
  const fallback = path.join(publicDir, 'clinics', '_data.json');
  let file = null;
  if (fs.existsSync(specific)) file = specific;
  else if (fs.existsSync(fallback)) file = fallback;
  if (!file) return res.status(404).json({ error: 'Report data not found for this slug.' });
  try {
    const json = JSON.parse(fs.readFileSync(file, 'utf8'));
    return res.json(json);
  } catch {
    return res.status(500).json({ error: 'Invalid report JSON on server.' });
  }
});

app.use(
  express.static(publicDir, {
    index: ['index.html'],
    setHeaders(res, filePath) {
      const norm = filePath.split(path.sep).join('/');
      if (filePath.endsWith('sw.js') || filePath.endsWith('sw-register.js')) {
        res.setHeader('Cache-Control', 'no-store');
        return;
      }
      if (
        filePath.endsWith('client.html') ||
        filePath.endsWith('login.html') ||
        filePath.endsWith('register.html') ||
        filePath.endsWith('admin.html') ||
        filePath.endsWith('places-leads.html') ||
        norm.includes('/clinics/report.html')
      ) {
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('X-Robots-Tag', 'noindex, nofollow');
      }
    },
  })
);

app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Not found' });
  }
  const p404 = path.join(publicDir, '404.html');
  if (fs.existsSync(p404)) {
    return res.status(404).sendFile(p404);
  }
  return res.status(404).type('text/plain').send('Not found');
});

const port = Number(process.env.PORT) || 8080;
app.listen(port, '0.0.0.0', () => {
  console.log(`[serviceopera] v${appVersion} listening on ${port} · public=${publicDir} · data=${dataDir}`);
  console.log(
    `[serviceopera] User store: ${(process.env.DATABASE_URL || '').trim() ? 'PostgreSQL (DATABASE_URL)' : `JSON files (${dataDir})`}`
  );
  console.log(
    RESEND_API_KEY
      ? '[serviceopera] Resend: RESEND_API_KEY is set (admin OTP + clinic forgot-password).'
      : '[serviceopera] Resend: RESEND_API_KEY missing — set it on this Railway service and redeploy.'
  );
  if (RESEND_API_KEY) {
    console.log(
      RESEND_FROM_USES_TEST_SENDER
        ? '[serviceopera] Resend: RESEND_FROM uses the test sender — only the Resend account mailbox can receive mail until you verify a domain.'
        : '[serviceopera] Resend: RESEND_FROM=' + RESEND_FROM
    );
  }
  console.log(
    PORTAL_SELF_REGISTER
      ? '[serviceopera] Clinic self-register: enabled (default; set PORTAL_SELF_REGISTER=false for invite-only).'
      : '[serviceopera] Clinic self-register: off (invite-only; unset env or remove PORTAL_SELF_REGISTER=false to enable).'
  );
  console.log(
    GOOGLE_MAPS_API_KEY
      ? '[serviceopera] Google Places: GOOGLE_MAPS_API_KEY is set (POST /api/places/search).'
      : '[serviceopera] Google Places: GOOGLE_MAPS_API_KEY missing — /api/places/search will return 503 until set.'
  );
});
