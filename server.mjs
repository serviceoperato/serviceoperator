/**
 * Static site + admin email OTP (Resend) + clinic report users (JSON store in DATA_DIR).
 */
import crypto from 'crypto';
import fs from 'fs';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { assertReportSlug, createClinicStore } from './clinic-store.mjs';

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
const clinicStore = createClinicStore(dataDir);

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'jack@serviceopera.to').trim().toLowerCase();
const RESEND_API_KEY = (process.env.RESEND_API_KEY || '').trim();
const RESEND_FROM = (process.env.RESEND_FROM || 'ServiceOpera <onboarding@resend.dev>').trim();
/** Public clinic sign-up is on by default; set CLINIC_SELF_REGISTER=false (or 0, no, off) for invite-only. */
const CLINIC_SELF_REGISTER = (function () {
  const raw = process.env.CLINIC_SELF_REGISTER;
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

/** @type {Map<string, { hash: string, exp: number }>} */
const otpByEmail = new Map();
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

function pruneSends(ip) {
  const now = Date.now();
  const arr = sendTimestampsByIp.get(ip) || [];
  const fresh = arr.filter((t) => now - t < SEND_WINDOW_MS);
  sendTimestampsByIp.set(ip, fresh);
  return fresh;
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
    const err = new Error('Resend HTTP ' + r.status + ': ' + text.slice(0, 400));
    err.status = r.status >= 500 ? 503 : 502;
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

app.get('/api/admin/capabilities', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({
    service: 'serviceopera',
    version: appVersion,
    otpEnabled: Boolean(RESEND_API_KEY),
    clinicUsersApi: true,
    clinicPasswordResetEmail: Boolean(RESEND_API_KEY),
  });
});

app.get('/api/auth/clinic-capabilities', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({
    service: 'serviceopera',
    version: appVersion,
    passwordResetEmail: Boolean(RESEND_API_KEY),
    selfRegister: Boolean(CLINIC_SELF_REGISTER),
    registrationConfirmEmail: Boolean(RESEND_API_KEY && CLINIC_SELF_REGISTER),
  });
});

app.post('/api/auth/clinic-register', async (req, res) => {
  if (!CLINIC_SELF_REGISTER) {
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
    pending = clinicStore.createPendingRegistration({ email, password });
  } catch (e) {
    const status = e.status || 400;
    return res.status(status).json({ error: e.message || 'Bad request' });
  }
  const verifyJwtToken = signJwt({
    v: 1,
    role: 'clinic_verify',
    sub: pending.id,
    email: pending.email,
    exp: Date.now() + CLINIC_VERIFY_JWT_MS,
  });
  const origin = publicOrigin(req);
  const link = `${origin}/login.html?verify=${encodeURIComponent(verifyJwtToken)}`;
  try {
    await sendResendEmail({
      to: pending.email,
      subject: 'ServiceOpera — confirm your clinic report account',
      html:
        '<p style="font-family:system-ui,sans-serif;font-size:15px;color:#111">Thanks for signing up for <strong>ServiceOpera.to</strong> clinic report access.</p>' +
        '<p style="font-family:system-ui,sans-serif;font-size:15px;color:#111"><a href="' +
        String(link).replace(/"/g, '&quot;') +
        '" style="color:#1e3a5f;font-weight:600">Confirm your email</a> (link expires in 48 hours.)</p>' +
        '<p style="font-family:system-ui,sans-serif;font-size:13px;color:#444">If you did not register, ignore this email.</p>',
    });
    sends.push(Date.now());
    sendTimestampsByIp.set(ip, sends);
  } catch (e) {
    const status = e.status || 502;
    return res.status(status).json({ error: 'Could not send confirmation email. Try again later or contact support.' });
  }
  return res.status(201).json({
    ok: true,
    message: 'Check your inbox for a confirmation link to activate your account.',
  });
});

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
    return res.status(status).json({ error: 'Could not send email. Check RESEND_FROM / domain and API key.' });
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

app.get('/api/clinic-users', requireAdmin, (_req, res) => {
  res.json({ users: clinicStore.listUsers() });
});

app.post('/api/clinic-users', requireAdmin, (req, res) => {
  try {
    const email = req.body?.email;
    const password = req.body?.password;
    const reportSlug = req.body?.reportSlug;
    const created = clinicStore.createUser({ email, password, reportSlug });
    return res.status(201).json(created);
  } catch (e) {
    const status = e.status || 400;
    return res.status(status).json({ error: e.message || 'Bad request' });
  }
});

app.post('/api/auth/clinic-login', (req, res) => {
  const email = typeof req.body?.email === 'string' ? req.body.email : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const user = clinicStore.verifyLogin(email, password);
  if (!user) return res.status(401).json({ error: 'Invalid email or password.' });
  const token = signJwt({
    v: 1,
    role: 'clinic',
    email: user.email,
    reportSlug: user.reportSlug,
    sub: user.id,
    exp: Date.now() + CLINIC_JWT_TTL_MS,
  });
  const reportUrl = '/clinics/report.html?slug=' + encodeURIComponent(user.reportSlug);
  return res.json({ ok: true, token, reportSlug: user.reportSlug, reportUrl });
});

app.post('/api/auth/clinic-request-reset', async (req, res) => {
  const generic = {
    ok: true,
    message: 'If that email is registered for a clinic report, we sent a link to reset your password. Check your inbox.',
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

  const user = email && email.includes('@') ? clinicStore.getUserByEmail(email) : null;
  if (!user) {
    return res.json(generic);
  }

  const resetToken = signJwt({
    v: 1,
    role: 'clinic_reset',
    sub: user.id,
    email: user.email,
    exp: Date.now() + CLINIC_RESET_JWT_MS,
  });
  const origin = publicOrigin(req);
  const link = `${origin}/login.html?reset=${encodeURIComponent(resetToken)}`;

  try {
    await sendResendEmail({
      to: user.email,
      subject: 'ServiceOpera — reset your clinic report password',
      html:
        '<p style="font-family:system-ui,sans-serif;font-size:15px;color:#111">You asked to reset the password for your <strong>ServiceOpera.to</strong> clinic report access.</p>' +
        '<p style="font-family:system-ui,sans-serif;font-size:15px;color:#111"><a href="' +
        String(link).replace(/"/g, '&quot;') +
        '" style="color:#1e3a5f;font-weight:600">Reset password</a> (link expires in one hour.)</p>' +
        '<p style="font-family:system-ui,sans-serif;font-size:13px;color:#444">If you did not request this, ignore this email.</p>',
    });
    sends.push(Date.now());
    sendTimestampsByIp.set(ip, sends);
  } catch (e) {
    const status = e.status || 502;
    return res.status(status).json({ error: 'Could not send email. Try again later or contact support.' });
  }

  return res.json(generic);
});

app.post('/api/auth/clinic-reset-password', (req, res) => {
  const token = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const p = verifyJwt(token);
  if (!p || p.role !== 'clinic_reset' || typeof p.sub !== 'string' || typeof p.email !== 'string') {
    return res.status(401).json({ error: 'Invalid or expired reset link. Request a new one from the login page.' });
  }
  const row = clinicStore.getUserByEmail(p.email);
  if (!row || row.id !== p.sub) {
    return res.status(401).json({ error: 'Invalid or expired reset link. Request a new one from the login page.' });
  }
  try {
    clinicStore.setPasswordForUser(p.sub, password);
  } catch (e) {
    const status = e.status || 400;
    return res.status(status).json({ error: e.message || 'Bad request' });
  }
  return res.json({ ok: true, message: 'Password updated. You can sign in now.' });
});

app.post('/api/auth/clinic-verify-email', (req, res) => {
  const token = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
  const p = verifyJwt(token);
  if (!p || p.role !== 'clinic_verify' || typeof p.sub !== 'string' || typeof p.email !== 'string') {
    return res
      .status(401)
      .json({ error: 'Invalid or expired confirmation link. Register again from the login page.' });
  }
  try {
    const created = clinicStore.finalizePendingRegistration(p.sub, p.email);
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

app.get('/api/auth/clinic-session', (req, res) => {
  const p = verifyJwt(getBearer(req));
  if (!p || p.role !== 'clinic' || typeof p.reportSlug !== 'string') return res.status(401).json({ ok: false });
  return res.json({ ok: true, email: p.email, reportSlug: p.reportSlug });
});

app.get('/api/clinics/report-data', (req, res) => {
  const slug = typeof req.query.slug === 'string' ? req.query.slug.trim() : '';
  try {
    assertReportSlug(slug);
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
  const p = verifyJwt(getBearer(req));
  if (!p || p.role !== 'clinic' || p.reportSlug !== slug) {
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
      if (
        filePath.endsWith('client.html') ||
        filePath.endsWith('login.html') ||
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
    RESEND_API_KEY
      ? '[serviceopera] Resend: RESEND_API_KEY is set (admin OTP + clinic forgot-password).'
      : '[serviceopera] Resend: RESEND_API_KEY missing — set it on this Railway service and redeploy.'
  );
  console.log(
    CLINIC_SELF_REGISTER
      ? '[serviceopera] Clinic self-register: enabled (default; set CLINIC_SELF_REGISTER=false for invite-only).'
      : '[serviceopera] Clinic self-register: off (invite-only; unset env or remove CLINIC_SELF_REGISTER=false to enable).'
  );
});
