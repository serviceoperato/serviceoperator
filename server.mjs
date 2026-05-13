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
import { createUserTelemetryStore, ensureUserTelemetrySchema } from './user-telemetry.mjs';
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
    await ensureUserTelemetrySchema(pool);
    return {
      userStore: createPostgresUserStore(pool),
      telemetryStore: createUserTelemetryStore({ pool }),
    };
  }
  return {
    userStore: createUserStore(dataDir, adminEmail),
    telemetryStore: createUserTelemetryStore({ dataDir }),
  };
}

const { userStore, telemetryStore } = await initUserStore();

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

function loadReportManifest() {
  const filePath = path.join(publicDir, 'reports', 'index.json');
  if (!fs.existsSync(filePath)) {
    return { clinics: [], hotels: [], properties: [] };
  }
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return {
      clinics: Array.isArray(raw.clinics) ? raw.clinics : [],
      hotels: Array.isArray(raw.hotels) ? raw.hotels : [],
      properties: Array.isArray(raw.properties) ? raw.properties : [],
    };
  } catch {
    return { clinics: [], hotels: [], properties: [] };
  }
}

function normalizeReportVertical(value) {
  const s = String(value || '')
    .toLowerCase()
    .trim();
  if (s === 'hotel' || s === 'hotels') return 'hotels';
  if (s === 'property' || s === 'properties' || s === 'real_estate' || s === 'real-estate') {
    return 'properties';
  }
  return 'clinics';
}

function readSlugReportMeta(slug) {
  const candidates = [path.join(clinicDataDir, `${slug}.json`)];
  for (const full of candidates) {
    if (!fs.existsSync(full)) continue;
    try {
      const data = JSON.parse(fs.readFileSync(full, 'utf8'));
      const title = data.business_name || data.title || data.name || slug;
      const vertical = normalizeReportVertical(data.vertical || data.category || 'clinics');
      return { title: String(title), vertical };
    } catch {
      /* try next */
    }
  }
  return { title: slug, vertical: 'clinics' };
}

function normalizeReportLink(item) {
  if (!item || typeof item.href !== 'string' || !item.href.trim()) return null;
  return {
    title: String(item.title || item.href).trim(),
    href: item.href.trim(),
    slug: typeof item.slug === 'string' && item.slug.trim() ? item.slug.trim() : null,
  };
}

function dedupeReportLinks(items) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const normalized = normalizeReportLink(item);
    if (!normalized) continue;
    if (seen.has(normalized.href)) continue;
    seen.add(normalized.href);
    out.push(normalized);
  }
  return out;
}

async function buildReportCatalog() {
  const manifest = loadReportManifest();
  const buckets = {
    clinics: manifest.clinics.map(normalizeReportLink).filter(Boolean),
    hotels: manifest.hotels.map(normalizeReportLink).filter(Boolean),
    properties: manifest.properties.map(normalizeReportLink).filter(Boolean),
  };
  for (const file of listClinicReportJsonFiles()) {
    const meta = readSlugReportMeta(file.slug);
    const href = `/clinics/report.html?slug=${encodeURIComponent(file.slug)}`;
    buckets[meta.vertical].push({ title: meta.title, href, slug: file.slug });
  }
  return {
    clinics: dedupeReportLinks(buckets.clinics),
    hotels: dedupeReportLinks(buckets.hotels),
    properties: dedupeReportLinks(buckets.properties),
  };
}

/** Site pages Jack commonly edits or ships — presence + last modified. */
const MANAGED_PAGE_FILES = [
  'index.html',
  'login.html',
  'register.html',
  'places-leads.html',
  'clinics/report.html',
  'property.html',
  'clinics.html',
  'hotels.html',
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

const siteAppearancePath = path.join(dataDir, 'site-appearance.json');
const defaultSiteAppearance = {
  propertyPageImageUrl: '/assets/property-page-hero.png',
  propertyPageImageAlt:
    'Dashboard preview: AI-assisted lead response, viewing bookings, and property operations for rental operators.',
  clinicPageImageUrl: '/assets/clinics-page-hero.png',
  clinicPageImageAlt:
    'Dashboard preview: multi-channel clinic inbox, AI suggested replies, follow-ups and reviews for wellness operators.',
  hotelPageImageUrl: '/assets/hotels-page-hero.png',
  hotelPageImageAlt:
    'Dashboard preview: AI hotel operations inbox, booking recovery, guest replies and demand insights.',
  homePageImageUrl: '/assets/home-page-hero.png',
  homePageImageAlt:
    'Dashboard preview: ServiceOpera AI inbox across hotels, clinics and property with regional market context.',
  navLogoUrl: '/assets/logo.png',
  navLogoAlt: 'ServiceOpera.to',
};

function readSiteAppearanceRaw() {
  try {
    return JSON.parse(fs.readFileSync(siteAppearancePath, 'utf8'));
  } catch {
    return {};
  }
}

/** Map legacy `/images/*` hero paths to `/assets/*` after the static folder consolidation. */
function rewriteLegacyImagesUrl(url) {
  if (typeof url !== 'string') return url;
  const t = url.trim();
  if (t.startsWith('/images/')) return '/assets/' + t.slice('/images/'.length);
  return t;
}

function normalizeNavLogoUrl(url) {
  const u = rewriteLegacyImagesUrl(typeof url === 'string' ? url.trim() : '');
  if (u === '/logo.png') return '/assets/logo.png';
  return u;
}

function mergeSiteAppearance(raw) {
  const propUrl = rewriteLegacyImagesUrl(
    typeof raw.propertyPageImageUrl === 'string' && raw.propertyPageImageUrl.trim()
      ? raw.propertyPageImageUrl.trim()
      : defaultSiteAppearance.propertyPageImageUrl
  );
  const propAltRaw = typeof raw.propertyPageImageAlt === 'string' ? raw.propertyPageImageAlt.trim() : '';
  const propAlt = propAltRaw
    ? propAltRaw.slice(0, 500).replace(/[\u0000-\u001f\u007f]/g, '')
    : defaultSiteAppearance.propertyPageImageAlt;
  const clinicUrl = rewriteLegacyImagesUrl(
    typeof raw.clinicPageImageUrl === 'string' && raw.clinicPageImageUrl.trim()
      ? raw.clinicPageImageUrl.trim()
      : defaultSiteAppearance.clinicPageImageUrl
  );
  const clinicAltRaw = typeof raw.clinicPageImageAlt === 'string' ? raw.clinicPageImageAlt.trim() : '';
  const clinicAlt = clinicAltRaw
    ? clinicAltRaw.slice(0, 500).replace(/[\u0000-\u001f\u007f]/g, '')
    : defaultSiteAppearance.clinicPageImageAlt;
  const hotelUrl = rewriteLegacyImagesUrl(
    typeof raw.hotelPageImageUrl === 'string' && raw.hotelPageImageUrl.trim()
      ? raw.hotelPageImageUrl.trim()
      : defaultSiteAppearance.hotelPageImageUrl
  );
  const hotelAltRaw = typeof raw.hotelPageImageAlt === 'string' ? raw.hotelPageImageAlt.trim() : '';
  const hotelAlt = hotelAltRaw
    ? hotelAltRaw.slice(0, 500).replace(/[\u0000-\u001f\u007f]/g, '')
    : defaultSiteAppearance.hotelPageImageAlt;
  const homeUrl = rewriteLegacyImagesUrl(
    typeof raw.homePageImageUrl === 'string' && raw.homePageImageUrl.trim()
      ? raw.homePageImageUrl.trim()
      : defaultSiteAppearance.homePageImageUrl
  );
  const homeAltRaw = typeof raw.homePageImageAlt === 'string' ? raw.homePageImageAlt.trim() : '';
  const homeAlt = homeAltRaw
    ? homeAltRaw.slice(0, 500).replace(/[\u0000-\u001f\u007f]/g, '')
    : defaultSiteAppearance.homePageImageAlt;
  const navLogoUrl = normalizeNavLogoUrl(
    typeof raw.navLogoUrl === 'string' && raw.navLogoUrl.trim()
      ? raw.navLogoUrl.trim()
      : defaultSiteAppearance.navLogoUrl
  );
  const navLogoAltRaw = typeof raw.navLogoAlt === 'string' ? raw.navLogoAlt.trim() : '';
  const navLogoAlt = navLogoAltRaw
    ? navLogoAltRaw.slice(0, 180).replace(/[\u0000-\u001f\u007f]/g, '')
    : defaultSiteAppearance.navLogoAlt;
  return {
    propertyPageImageUrl: propUrl,
    propertyPageImageAlt: propAlt,
    clinicPageImageUrl: clinicUrl,
    clinicPageImageAlt: clinicAlt,
    hotelPageImageUrl: hotelUrl,
    hotelPageImageAlt: hotelAlt,
    homePageImageUrl: homeUrl,
    homePageImageAlt: homeAlt,
    navLogoUrl,
    navLogoAlt,
  };
}

function isSafePropertyPageImageUrl(candidate) {
  const s = String(candidate || '').trim();
  if (!s || s.length > 2048) return false;
  if (/[\u0000-\u001f\u007f\s<>"]/.test(s)) return false;
  if (s.includes('..')) return false;
  if (s.startsWith('/')) {
    if (s.startsWith('//')) return false;
    return /^\/[\w./~$%-]+$/i.test(s);
  }
  try {
    const u = new URL(s);
    if (u.protocol !== 'https:') return false;
    return Boolean(u.hostname && u.hostname.length <= 253);
  } catch {
    return false;
  }
}

function normalizePageImageAlt(s, fallback) {
  const t = String(s ?? '').trim().slice(0, 500).replace(/[\u0000-\u001f\u007f]/g, '');
  return t || fallback;
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
if (!(process.env.ADMIN_JWT_SECRET || '').trim()) {
  console.warn(
    '[serviceopera] ADMIN_JWT_SECRET is unset — using an ephemeral per-process JWT secret. ' +
      'Email confirmation links that still use JWT will fail after a restart or on a different Railway instance. ' +
      'New sign-ups use a short database token in the link; set ADMIN_JWT_SECRET anyway for stable admin/session JWTs.'
  );
}

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

function clientCity(req) {
  const candidates = [
    req.headers['cf-ipcity'],
    req.headers['x-vercel-ip-city'],
    req.headers['cloudfront-viewer-city'],
  ];
  for (const value of candidates) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function clientRegion(req) {
  const candidates = [
    req.headers['cf-region'],
    req.headers['x-vercel-ip-country-region'],
    req.headers['cloudfront-viewer-country-region'],
  ];
  for (const value of candidates) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function clientUserAgent(req) {
  const ua = req.get('user-agent');
  return typeof ua === 'string' && ua.trim() ? ua.trim() : null;
}

async function lookupGeoFromIp(ip) {
  const trimmed = String(ip || '')
    .trim()
    .replace(/^::ffff:/, '');
  if (!trimmed || trimmed === 'unknown') return null;
  if (
    trimmed === '::1' ||
    /^127\./.test(trimmed) ||
    /^10\./.test(trimmed) ||
    /^192\.168\./.test(trimmed) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(trimmed)
  ) {
    return null;
  }
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    const response = await fetch(
      `http://ip-api.com/json/${encodeURIComponent(trimmed)}?fields=status,countryCode,city,regionName`,
      { signal: controller.signal }
    );
    clearTimeout(timer);
    if (!response.ok) return null;
    const json = await response.json();
    if (!json || json.status !== 'success') return null;
    return {
      country: typeof json.countryCode === 'string' ? json.countryCode.toUpperCase() : null,
      city: typeof json.city === 'string' ? json.city : null,
      region: typeof json.regionName === 'string' ? json.regionName : null,
    };
  } catch {
    return null;
  }
}

async function recordPortalLogin(req, user) {
  if (!user || typeof user.id !== 'string' || !user.id) return null;
  const meta = {
    ip: clientIp(req),
    country: clientCountry(req),
    city: clientCity(req),
    region: clientRegion(req),
    userAgent: clientUserAgent(req),
  };
  if (!meta.country || !meta.city) {
    const resolved = await lookupGeoFromIp(meta.ip);
    if (resolved) {
      meta.country = meta.country || resolved.country;
      meta.city = meta.city || resolved.city;
      meta.region = meta.region || resolved.region;
    }
  }
  if (typeof userStore.recordLogin === 'function') {
    try {
      await userStore.recordLogin(user.id, meta);
    } catch {
      /* login should still succeed if audit write fails */
    }
  }
  if (!telemetryStore || typeof telemetryStore.startLoginSession !== 'function') return null;
  try {
    return await telemetryStore.startLoginSession(user.id, meta);
  } catch {
    return null;
  }
}

function signPortalUserJwt(user) {
  return signJwt({
    v: 1,
    role: 'user',
    email: user.email,
    reportSlug: user.reportSlug,
    sub: user.id,
    passwordMustChange: Boolean(user.passwordMustChange),
    exp: Date.now() + CLINIC_JWT_TTL_MS,
  });
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

function clipFreeText(value, max) {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .trim()
    .slice(0, max);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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

/** Comma-separated absolute origins allowed to call this API from a browser (CORS + email links). */
const PORTAL_CORS_ORIGINS = (process.env.PORTAL_CORS_ORIGINS || process.env.PORTAL_FRONTEND_ORIGINS || '')
  .split(/[,;\s]+/)
  .map((s) => s.trim().replace(/\/$/, ''))
  .filter(Boolean);

function isAllowedPortalCorsOrigin(origin) {
  if (!origin || typeof origin !== 'string') return false;
  const o = origin.trim().replace(/\/$/, '');
  if (!o) return false;
  if (PORTAL_CORS_ORIGINS.includes(o)) return true;
  try {
    const u = new URL(o);
    if (/\.up\.railway\.app$/i.test(u.hostname)) return true;
  } catch {
    return false;
  }
  return false;
}

/** Links in outbound email (verify / reset) should open the public site, not the API host, when API is split. */
function publicOriginForEmail(req) {
  const fromEnv = (process.env.PUBLIC_ORIGIN || '').trim().replace(/\/$/, '');
  if (fromEnv) return fromEnv;
  const originHeader = (req.get('origin') || '').trim().replace(/\/$/, '');
  if (originHeader && isAllowedPortalCorsOrigin(originHeader)) return originHeader;
  return publicOrigin(req);
}

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(express.json({ limit: '48kb' }));

app.use((req, res, next) => {
  if (!req.path.startsWith('/api/')) return next();
  const origin = req.get('origin');
  if (origin && isAllowedPortalCorsOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Max-Age', '7200');
  }
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  next();
});

app.use((req, res, next) => {
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  next();
});

function allowDebugCors(req, res) {
  const origin = req.get('origin');
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Vary', 'Origin');
  }
}

app.options(['/api/debug/user-store', '/api/version'], (req, res) => {
  allowDebugCors(req, res);
  res.status(204).end();
});

app.get('/api/version', (req, res) => {
  allowDebugCors(req, res);
  res.setHeader('Cache-Control', 'no-store');
  res.json({ version: appVersion });
});

app.get('/api/site-appearance', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json(mergeSiteAppearance(readSiteAppearanceRaw()));
});

app.get('/api/debug/user-store', async (req, res) => {
  allowDebugCors(req, res);
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
  const verifyLinkValue =
    pending.verificationToken && typeof pending.verificationToken === 'string'
      ? pending.verificationToken
      : signJwt({
          v: 1,
          role: 'user_verify',
          sub: pending.id,
          email: pending.email,
          exp: Date.now() + CLINIC_VERIFY_JWT_MS,
        });
  const origin = publicOriginForEmail(req);
  const link = `${origin}/login.html?verify=${encodeURIComponent(verifyLinkValue)}`;
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

app.get('/api/admin/site-appearance', requireAdmin, (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ ok: true, ...mergeSiteAppearance(readSiteAppearanceRaw()) });
});

app.put('/api/admin/site-appearance', requireAdmin, (req, res) => {
  const body = req.body || {};
  const cur = mergeSiteAppearance(readSiteAppearanceRaw());

  const propUrlIn =
    'propertyPageImageUrl' in body && typeof body.propertyPageImageUrl === 'string'
      ? body.propertyPageImageUrl.trim()
      : cur.propertyPageImageUrl;
  let propUrl = propUrlIn || defaultSiteAppearance.propertyPageImageUrl;
  if (!isSafePropertyPageImageUrl(propUrl)) {
    return res.status(400).json({
      error: 'Invalid propertyPageImageUrl. Use a path on this site (starting with /) or an https:// image URL.',
    });
  }

  const clinicUrlIn =
    'clinicPageImageUrl' in body && typeof body.clinicPageImageUrl === 'string'
      ? body.clinicPageImageUrl.trim()
      : cur.clinicPageImageUrl;
  let clinicUrl = clinicUrlIn || defaultSiteAppearance.clinicPageImageUrl;
  if (!isSafePropertyPageImageUrl(clinicUrl)) {
    return res.status(400).json({
      error: 'Invalid clinicPageImageUrl. Use a path on this site (starting with /) or an https:// image URL.',
    });
  }

  const hotelUrlIn =
    'hotelPageImageUrl' in body && typeof body.hotelPageImageUrl === 'string'
      ? body.hotelPageImageUrl.trim()
      : cur.hotelPageImageUrl;
  let hotelUrl = hotelUrlIn || defaultSiteAppearance.hotelPageImageUrl;
  if (!isSafePropertyPageImageUrl(hotelUrl)) {
    return res.status(400).json({
      error: 'Invalid hotelPageImageUrl. Use a path on this site (starting with /) or an https:// image URL.',
    });
  }

  const homeUrlIn =
    'homePageImageUrl' in body && typeof body.homePageImageUrl === 'string'
      ? body.homePageImageUrl.trim()
      : cur.homePageImageUrl;
  let homeUrl = homeUrlIn || defaultSiteAppearance.homePageImageUrl;
  if (!isSafePropertyPageImageUrl(homeUrl)) {
    return res.status(400).json({
      error: 'Invalid homePageImageUrl. Use a path on this site (starting with /) or an https:// image URL.',
    });
  }

  const navLogoUrlIn =
    'navLogoUrl' in body && typeof body.navLogoUrl === 'string' ? body.navLogoUrl.trim() : cur.navLogoUrl;
  let navLogoUrl = normalizeNavLogoUrl(navLogoUrlIn || defaultSiteAppearance.navLogoUrl);
  if (!isSafePropertyPageImageUrl(navLogoUrl)) {
    return res.status(400).json({
      error: 'Invalid navLogoUrl. Use a path on this site (starting with /) or an https:// image URL.',
    });
  }

  const propAlt =
    'propertyPageImageAlt' in body
      ? normalizePageImageAlt(body.propertyPageImageAlt, defaultSiteAppearance.propertyPageImageAlt)
      : cur.propertyPageImageAlt;
  const clinicAlt =
    'clinicPageImageAlt' in body
      ? normalizePageImageAlt(body.clinicPageImageAlt, defaultSiteAppearance.clinicPageImageAlt)
      : cur.clinicPageImageAlt;
  const hotelAlt =
    'hotelPageImageAlt' in body
      ? normalizePageImageAlt(body.hotelPageImageAlt, defaultSiteAppearance.hotelPageImageAlt)
      : cur.hotelPageImageAlt;
  const homeAlt =
    'homePageImageAlt' in body
      ? normalizePageImageAlt(body.homePageImageAlt, defaultSiteAppearance.homePageImageAlt)
      : cur.homePageImageAlt;
  const navLogoAlt =
    'navLogoAlt' in body
      ? normalizePageImageAlt(body.navLogoAlt, defaultSiteAppearance.navLogoAlt).slice(0, 180)
      : cur.navLogoAlt;

  const next = {
    propertyPageImageUrl: propUrl,
    propertyPageImageAlt: propAlt,
    clinicPageImageUrl: clinicUrl,
    clinicPageImageAlt: clinicAlt,
    hotelPageImageUrl: hotelUrl,
    hotelPageImageAlt: hotelAlt,
    homePageImageUrl: homeUrl,
    homePageImageAlt: homeAlt,
    navLogoUrl,
    navLogoAlt,
  };
  try {
    fs.writeFileSync(siteAppearancePath, JSON.stringify(next, null, 2) + '\n', 'utf8');
    return res.json({ ok: true, ...next });
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Could not save site appearance.' });
  }
});

app.get('/api/admin/report-catalog', requireAdmin, async (_req, res) => {
  try {
    const catalog = await buildReportCatalog();
    res.json({ ok: true, ...catalog });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Failed to load report catalog.' });
  }
});

async function createPortalUserAdmin(req, res) {
  try {
    const email = req.body?.email;
    const password = req.body?.password;
    const reportSlug = req.body?.reportSlug;
    const passwordMustChange = Boolean(req.body?.passwordMustChange);
    const created = await userStore.createUser({ email, password, reportSlug, passwordMustChange });
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

app.get('/api/user-accounts/:id/telemetry', requireAdmin, async (req, res) => {
  if (!telemetryStore || typeof telemetryStore.getUserTelemetry !== 'function') {
    return res.status(501).json({ error: 'User telemetry is not available on this server.' });
  }
  try {
    const telemetry = await telemetryStore.getUserTelemetry(req.params.id);
    return res.json({ ok: true, ...telemetry });
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Failed to load user telemetry.' });
  }
});
app.get('/api/clinic-users/:id/telemetry', requireAdmin, async (req, res) => {
  if (!telemetryStore || typeof telemetryStore.getUserTelemetry !== 'function') {
    return res.status(501).json({ error: 'User telemetry is not available on this server.' });
  }
  try {
    const telemetry = await telemetryStore.getUserTelemetry(req.params.id);
    return res.json({ ok: true, ...telemetry });
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Failed to load user telemetry.' });
  }
});

dualPost('/api/auth/user-activity', '/api/auth/clinic-activity', async (req, res) => {
  const p = verifyJwt(getBearer(req));
  if (!p || !isPortalSessionRole(p.role) || typeof p.sub !== 'string') {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (!telemetryStore || typeof telemetryStore.appendEvents !== 'function') {
    return res.status(501).json({ error: 'User telemetry is not available on this server.' });
  }
  const sessionId = typeof req.body?.sessionId === 'string' ? req.body.sessionId.trim() : '';
  const events = Array.isArray(req.body?.events) ? req.body.events.slice(0, 25) : [];
  if (!sessionId || !events.length) {
    return res.status(400).json({ error: 'Missing sessionId or events.' });
  }
  try {
    const written = await telemetryStore.appendEvents(p.sub, sessionId, events);
    if (typeof userStore.touchLastSeen === 'function') {
      await userStore.touchLastSeen(p.sub);
    }
    return res.json({ ok: true, written });
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Failed to save activity.' });
  }
});

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
  const sessionId = await recordPortalLogin(req, user);
  const token = signPortalUserJwt(user);
  const reportUrl = '/clinics/report.html?slug=' + encodeURIComponent(user.reportSlug);
  return res.json({
    ok: true,
    token,
    reportSlug: user.reportSlug,
    reportUrl,
    sessionId,
    passwordMustChange: Boolean(user.passwordMustChange),
  });
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
  const sessionId = await recordPortalLogin(req, user);
  const token = signPortalUserJwt(user);
  const reportUrl = '/clinics/report.html?slug=' + encodeURIComponent(user.reportSlug);
  return res.json({
    ok: true,
    token,
    reportSlug: user.reportSlug,
    reportUrl,
    sessionId,
    passwordMustChange: Boolean(user.passwordMustChange),
  });
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

  const verifyLinkValue =
    typeof userStore.issuePendingVerificationToken === 'function'
      ? await userStore.issuePendingVerificationToken(pending.id)
      : signJwt({
          v: 1,
          role: 'user_verify',
          sub: pending.id,
          email: pending.email,
          exp: Date.now() + CLINIC_VERIFY_JWT_MS,
        });
  const origin = publicOriginForEmail(req);
  const link = `${origin}/login.html?verify=${encodeURIComponent(verifyLinkValue)}`;
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
  const origin = publicOriginForEmail(req);
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

dualPost('/api/auth/user-complete-password-setup', '/api/auth/clinic-complete-password-setup', async (req, res) => {
  const p = verifyJwt(getBearer(req));
  if (!p || !isPortalSessionRole(p.role) || typeof p.sub !== 'string') {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const confirm =
    typeof req.body?.confirmPassword === 'string'
      ? req.body.confirmPassword
      : typeof req.body?.confirm === 'string'
        ? req.body.confirm
        : '';
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  }
  if (confirm && password !== confirm) {
    return res.status(400).json({ error: 'Passwords do not match.' });
  }
  if (typeof userStore.getUserById !== 'function') {
    return res.status(501).json({ error: 'Password completion is not supported on this deployment.' });
  }
  const row = await userStore.getUserById(p.sub);
  if (!row) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (!row.passwordMustChange) {
    return res.status(400).json({ error: 'Password change is not required for this account.' });
  }
  try {
    await userStore.setPasswordForUser(p.sub, password);
  } catch (e) {
    const status = e.status || 400;
    return res.status(status).json({ error: e.message || 'Bad request' });
  }
  const refreshed = await userStore.getUserById(p.sub);
  const user = refreshed || { ...row, passwordMustChange: false };
  const token = signPortalUserJwt(user);
  const reportUrl = '/clinics/report.html?slug=' + encodeURIComponent(user.reportSlug);
  return res.json({
    ok: true,
    token,
    reportSlug: user.reportSlug,
    reportUrl,
    passwordMustChange: false,
    message: 'Password saved.',
  });
});

dualPost('/api/auth/user-verify-email', '/api/auth/clinic-verify-email', async (req, res) => {
  const tokenRaw = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
  let pendingId = null;
  let jwtEmail = null;

  if (tokenRaw && tokenRaw.includes('.')) {
    const p = verifyJwt(tokenRaw);
    if (p && isPortalVerifyRole(p.role) && typeof p.sub === 'string' && typeof p.email === 'string') {
      pendingId = p.sub;
      jwtEmail = p.email;
    }
  }

  if (!pendingId && tokenRaw && typeof userStore.findPendingByVerificationToken === 'function') {
    const row = await userStore.findPendingByVerificationToken(tokenRaw);
    if (row && typeof row.id === 'string' && typeof row.email === 'string') {
      pendingId = row.id;
      jwtEmail = row.email;
    }
  }

  if (!pendingId || typeof jwtEmail !== 'string' || !jwtEmail) {
    return res
      .status(401)
      .json({ error: 'Invalid or expired confirmation link. Register again from the login page.' });
  }
  try {
    const created = await userStore.finalizePendingRegistration(pendingId, jwtEmail);
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

app.post('/api/marketing/inquiry', async (req, res) => {
  if (!RESEND_API_KEY) {
    return res.status(503).json({
      error:
        'Inquiry delivery is not configured on this server (missing RESEND_API_KEY). Try again after deploy or book a call from the site.',
    });
  }
  const ip = clientIp(req);
  const sends = pruneSends(ip);
  if (sends.length >= MAX_SENDS_PER_WINDOW) {
    return res.status(429).json({ error: 'Too many requests. Try again later.' });
  }

  const name = clipFreeText(req.body?.name, 120);
  const business = clipFreeText(req.body?.business, 160);
  const sector = clipFreeText(req.body?.sector, 120);
  const improvement = clipFreeText(req.body?.improvement, 2000);
  const topic = clipFreeText(req.body?.topic, 120);
  const source = clipFreeText(req.body?.source, 200);

  if (!name || !business || !sector || !improvement) {
    return res.status(400).json({ error: 'Name, business, sector, and what you want to improve are required.' });
  }

  const subject = topic ? `ServiceOpera inquiry: ${topic}` : 'ServiceOpera inquiry';
  const html =
    '<div style="font-family:system-ui,sans-serif;font-size:15px;color:#111;line-height:1.55">' +
    '<p><strong>New site inquiry</strong></p>' +
    '<p><strong>Name:</strong> ' +
    escapeHtml(name) +
    '</p>' +
    '<p><strong>Business:</strong> ' +
    escapeHtml(business) +
    '</p>' +
    '<p><strong>Sector:</strong> ' +
    escapeHtml(sector) +
    '</p>' +
    '<p><strong>What to improve:</strong><br>' +
    escapeHtml(improvement).replace(/\n/g, '<br>') +
    '</p>' +
    (topic ? '<p><strong>Topic:</strong> ' + escapeHtml(topic) + '</p>' : '') +
    (source ? '<p><strong>Source:</strong> ' + escapeHtml(source) + '</p>' : '') +
    '<p style="font-size:13px;color:#444">IP: ' +
    escapeHtml(ip) +
    '</p>' +
    '</div>';

  try {
    await sendResendEmail({ to: ADMIN_EMAIL, subject, html });
    sends.push(Date.now());
    sendTimestampsByIp.set(ip, sends);
  } catch (e) {
    const status = e.status || 502;
    return res.status(status).json({
      error: resendFailureMessage(e, 'Could not send your inquiry. Try again later or book a call from the site.'),
    });
  }

  return res.json({
    ok: true,
    message: 'Thanks — your inquiry was sent. Jack will follow up shortly.',
  });
});

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

app.get('/logo.png', (_req, res) => {
  try {
    const merged = mergeSiteAppearance(readSiteAppearanceRaw());
    const rawTarget = String(merged.navLogoUrl || '').trim() || defaultSiteAppearance.navLogoUrl;
    const target = normalizeNavLogoUrl(rawTarget);
    if (/^https:/i.test(target)) {
      return res.redirect(302, target);
    }
    if (target.startsWith('/')) {
      return res.redirect(302, target);
    }
  } catch {
    /* fall through */
  }
  return res.redirect(302, '/assets/logo.png');
});

app.get(/^\/admin\.html$/i, (_req, res) => {
  res.redirect(302, '/login.html');
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
      if (norm.endsWith('demo-portal.json')) {
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('X-Robots-Tag', 'noindex, nofollow');
        return;
      }
      if (
        filePath.endsWith('client.html') ||
        filePath.endsWith('login.html') ||
        filePath.endsWith('register.html') ||
        filePath.endsWith('admin.js') ||
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
