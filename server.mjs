/**
 * Static site + admin password sign-in + portal users (JSON store in DATA_DIR).
 */
import crypto from 'crypto';
import fs from 'fs';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { assertReportSlug, createUserStore, normalizeEmail, verifyPassword } from './clinic-store.mjs';
import { createPostgresUserStore, ensurePostgresUserSchema } from './postgres-user-store.mjs';
import {
  ensureSiteAppearanceSchema,
  deleteSiteUpload,
  getSiteUpload,
  insertSiteUpload,
  loadSiteAppearanceJson,
  saveSiteAppearanceJson,
} from './postgres-site-appearance.mjs';
import { createUserTelemetryStore, ensureUserTelemetrySchema } from './user-telemetry.mjs';
import { createLeadEventsStore, ensureLeadEventsSchema } from './lead-events.mjs';
import { searchTextAllPages } from './lib/google-places-search.mjs';

const processFatalLogHandlersKey = Symbol.for('serviceopera.server.processFatalLogHandlers');
if (!globalThis[processFatalLogHandlersKey]) {
  globalThis[processFatalLogHandlersKey] = true;
  process.on('uncaughtException', (err) => console.error('Uncaught:', err));
  process.on('unhandledRejection', (reason) => console.error('Unhandled:', reason));
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, 'public');
const placesLeadsOperatorHtmlPath = path.join(publicDir, 'operator', 'places-leads.html');
/** Short-lived JWT (`kind: places_page`) minted by POST /api/admin/places-page-token; required query `t` to load the Places HTML document. */
const PLACES_PAGE_DOCUMENT_TTL_MS = 60 * 60 * 1000;
const siteUploadsDir = path.join(publicDir, 'assets', 'site-uploads');
try {
  fs.mkdirSync(siteUploadsDir, { recursive: true });
} catch (e) {
  console.warn('[serviceopera] Could not create site-uploads directory:', e && e.message ? e.message : e);
}

let appVersion = '0.0.0';
try {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
  if (pkg && typeof pkg.version === 'string') appVersion = pkg.version;
} catch {
  /* keep default */
}
const dataDir = process.env.DATA_DIR || path.join(__dirname, 'data');
fs.mkdirSync(dataDir, { recursive: true });

/** Fail fast on Railway before DB work so deploy logs show the real blocker. */
const JWT_SECRET_FROM_ENV = (process.env.PORTAL_JWT_SECRET || process.env.ADMIN_JWT_SECRET || '').trim();
const JWT_SECRET = JWT_SECRET_FROM_ENV || crypto.randomBytes(32).toString('hex');
if (!JWT_SECRET_FROM_ENV) {
  console.warn(
    '[serviceopera] PORTAL_JWT_SECRET / ADMIN_JWT_SECRET is unset — using an ephemeral per-process JWT secret. ' +
      'Portal and admin sessions break after every deploy/restart; multiple replicas would disagree on signatures. ' +
      'Email confirmation links that still use JWT also fail across restarts. ' +
      'Set PORTAL_JWT_SECRET (or ADMIN_JWT_SECRET) to one long random string shared by all instances.'
  );
  if (String(process.env.RAILWAY_ENVIRONMENT || '').trim()) {
    console.error(
      '[serviceopera] Refusing to start on Railway without PORTAL_JWT_SECRET or ADMIN_JWT_SECRET. ' +
        'Railway → your Node service → Variables → add one secret (e.g. openssl rand -hex 32), redeploy.'
    );
    process.exit(1);
  }
}

async function initUserStore() {
  const adminEmail = (process.env.ADMIN_EMAIL || 'jack@serviceopera.to').trim().toLowerCase();
  const databaseUrl = (process.env.DATABASE_URL || '').trim();
  if (databaseUrl) {
    let pool = null;
    try {
      const { Pool } = await import('pg');
      const pgConnMs = Number(process.env.PG_CONNECTION_TIMEOUT_MS || 8000);
      pool = new Pool({
        connectionString: databaseUrl,
        connectionTimeoutMillis: Number.isFinite(pgConnMs) && pgConnMs > 0 ? pgConnMs : 8000,
        ssl:
          /sslmode=require/i.test(databaseUrl) || /railway/i.test(databaseUrl)
            ? { rejectUnauthorized: false }
            : undefined,
      });
      await ensurePostgresUserSchema(pool, adminEmail);
      await ensureUserTelemetrySchema(pool);
      await ensureLeadEventsSchema(pool);
      await ensureSiteAppearanceSchema(pool);
      return {
        userStore: createPostgresUserStore(pool),
        telemetryStore: createUserTelemetryStore({ pool }),
        leadEventsStore: createLeadEventsStore({ pool }),
        pgPool: pool,
      };
    } catch (err) {
      const msg = err && err.message ? err.message : String(err);
      console.error(
        '[serviceopera] PostgreSQL init failed; falling back to JSON files under DATA_DIR. Fix DATABASE_URL or networking. Error:',
        msg
      );
      try {
        if (pool && typeof pool.end === 'function') await pool.end();
      } catch {
        /* ignore */
      }
    }
  }
  return {
    userStore: createUserStore(dataDir, adminEmail),
    telemetryStore: createUserTelemetryStore({ dataDir }),
    leadEventsStore: createLeadEventsStore({ dataDir }),
    pgPool: null,
  };
}

const { userStore, telemetryStore, leadEventsStore, pgPool } = await initUserStore();

/** Presence of env var (may still fall back to JSON if init failed). */
const ENV_DATABASE_URL_CONFIGURED = Boolean((process.env.DATABASE_URL || '').trim());
const POSTGRES_POOL_ACTIVE = Boolean(pgPool);
/** True when DATABASE_URL was set but the pool is not usable — uploads must not silently use disk. */
const POSTGRES_CONFIGURED_BUT_POOL_MISSING = ENV_DATABASE_URL_CONFIGURED && !POSTGRES_POOL_ACTIVE;
const RAILWAY_DEPLOY = Boolean(String(process.env.RAILWAY_ENVIRONMENT || '').trim());

if (POSTGRES_CONFIGURED_BUT_POOL_MISSING) {
  console.error(
    '[serviceopera] DATABASE_URL is set but PostgreSQL did not initialize (see earlier "PostgreSQL init failed" log). ' +
      'Site appearance JSON and admin image uploads are not using Postgres until this is fixed.'
  );
}

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

function extractCatalogReportId(href, slug, itemId) {
  const rawId = itemId != null && itemId !== '' ? String(itemId).trim() : '';
  if (/^\d{3}$/.test(rawId)) return rawId;
  const slugRaw = typeof slug === 'string' ? slug.trim() : '';
  if (/^\d{3}$/.test(slugRaw)) return slugRaw;
  const m = String(href || '').match(/^\/(clinics|hotels)\/(\d{3})(?:\/|$)/i);
  if (m) return m[2];
  return null;
}

function formatReportCatalogTitle(catalogId, title) {
  const t = String(title || '').trim();
  if (!catalogId) return t || 'Untitled';
  if (/^Report\s+\d{3}\b/i.test(t)) return t;
  const stripped = t.replace(/^Report\s+\d{3}\s*[—–-]\s*/i, '').trim();
  return `Report ${catalogId} — ${stripped || t || 'Untitled'}`;
}

function normalizeReportLink(item) {
  if (!item || typeof item.href !== 'string' || !item.href.trim()) return null;
  const href = item.href.trim();
  const slug = typeof item.slug === 'string' && item.slug.trim() ? item.slug.trim() : null;
  const catalogId = extractCatalogReportId(href, slug, item.id);
  const title = formatReportCatalogTitle(catalogId, item.title || href);
  return {
    id: catalogId,
    title,
    href,
    slug,
    kind: typeof item.kind === 'string' && item.kind.trim() ? item.kind.trim() : null,
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
  try {
    const users = await userStore.listUsers();
    for (const u of users) {
      const slug = typeof u.reportSlug === 'string' ? u.reportSlug.trim() : '';
      if (!slug) continue;
      const href = `/clinics/report.html?slug=${encodeURIComponent(slug)}`;
      const meta = readSlugReportMeta(slug);
      const display =
        (typeof u.displayName === 'string' && u.displayName.trim()) ||
        (typeof u.email === 'string' && u.email.trim()) ||
        slug;
      const title = `${display} · ${slug}`;
      buckets[meta.vertical].push({ title, href, slug });
    }
  } catch {
    /* user store unavailable */
  }
  return {
    clinics: dedupeReportLinks(buckets.clinics),
    hotels: dedupeReportLinks(buckets.hotels),
    properties: dedupeReportLinks(buckets.properties),
  };
}

function extractSlugFromReportHref(href) {
  if (typeof href !== 'string') return null;
  const m = /[?&]slug=([^&]+)/.exec(href);
  if (!m) return null;
  try {
    const s = decodeURIComponent(m[1]).trim();
    return s || null;
  } catch {
    return null;
  }
}

/** Best-effort mtime for a published static path (e.g. /clinics/foo/ or /hotels/bar/). */
function publicArtifactMtimeMs(href) {
  if (typeof href !== 'string' || !href.startsWith('/')) return null;
  const q = href.indexOf('?');
  const pathOnly = (q >= 0 ? href.slice(0, q) : href).replace(/\/+$/, '');
  const rel = pathOnly.replace(/^\/+/, '');
  const segments = rel.split('/').filter(Boolean);
  if (!segments.length) return null;
  const asDir = path.join(publicDir, ...segments);
  const directFile = statMtimeMs(asDir);
  if (directFile != null) return directFile;
  const indexUnder = statMtimeMs(path.join(asDir, 'index.html'));
  if (indexUnder != null) return indexUnder;
  return null;
}

/**
 * Flat list of audit/report entries for operator management UI.
 * Sources: public/reports/index.json, public/clinics/data/*.json, portal users with reportSlug.
 */
async function buildAuditReportsIndex() {
  const catalog = await buildReportCatalog();
  let users = [];
  try {
    users = await userStore.listUsers();
  } catch {
    users = [];
  }
  const slugToPortalUser = new Map();
  for (const u of users) {
    const slug = typeof u.reportSlug === 'string' ? u.reportSlug.trim() : '';
    if (!slug || slugToPortalUser.has(slug)) continue;
    slugToPortalUser.set(slug, u);
  }

  const rows = [];
  const seenHref = new Set();
  const usedCatalogIds = new Set();
  for (const vertical of ['clinics', 'hotels', 'properties']) {
    for (const item of catalog[vertical] || []) {
      const id = extractCatalogReportId(item.href, item.slug, item.id);
      if (id) usedCatalogIds.add(id);
    }
  }
  let nextPortalCatalogId = 100;

  for (const vertical of ['clinics', 'hotels', 'properties']) {
    const items = catalog[vertical] || [];
    for (const item of items) {
      const href = item.href;
      if (!href || seenHref.has(href)) continue;
      seenHref.add(href);

      const slug = item.slug || extractSlugFromReportHref(href);
      let catalogId = extractCatalogReportId(href, slug, item.id);
      if (!catalogId && href.includes('report.html') && slug && !/^\d{3}$/.test(slug)) {
        while (usedCatalogIds.has(String(nextPortalCatalogId).padStart(3, '0'))) {
          nextPortalCatalogId += 1;
        }
        catalogId = String(nextPortalCatalogId).padStart(3, '0');
        usedCatalogIds.add(catalogId);
        nextPortalCatalogId += 1;
      }
      const jsonPath = slug ? path.join(clinicDataDir, `${slug}.json`) : null;
      const jsonExists = Boolean(jsonPath && fs.existsSync(jsonPath));

      const meta = slug ? readSlugReportMeta(slug) : { title: item.title, vertical };
      const displayTitle = formatReportCatalogTitle(catalogId, item.title || href);

      const mtimeFromJson = jsonExists ? statMtimeMs(jsonPath) : null;
      const mtimeFromPublic = publicArtifactMtimeMs(href);
      const updatedMs = Math.max(mtimeFromJson || 0, mtimeFromPublic || 0) || null;

      const user = slug ? slugToPortalUser.get(slug) : undefined;
      let subject = '—';
      if (user) {
        subject =
          (typeof user.displayName === 'string' && user.displayName.trim()) ||
          (typeof user.email === 'string' && user.email.trim()) ||
          slug;
      } else {
        const t = String(item.title || '').trim();
        const parts = t.split('·').map((s) => s.trim()).filter(Boolean);
        if (parts.length >= 2) subject = parts[0];
        else if (slug && meta.title && meta.title !== slug) subject = String(meta.title);
      }

      let status = 'Listed';
      if (href.includes('report.html') && href.includes('slug=')) {
        status = jsonExists ? 'Portal report · JSON' : 'Portal report';
      } else if (/^\/(clinics|hotels|properties)\//i.test(href.split('?')[0])) {
        status = 'Published static page';
      }

      const artifacts = [];
      if (jsonExists && slug) {
        artifacts.push({ label: 'JSON', href: `/clinics/data/${slug}.json` });
      }
      const pathOnly = href.split('?')[0].replace(/\/+$/, '');
      if (pathOnly.startsWith('/') && !href.includes('report.html')) {
        const segs = pathOnly.split('/').filter(Boolean);
        if (segs.length) {
          const mdPath = path.join(publicDir, ...segs, 'audit-report.md');
          if (fs.existsSync(mdPath)) {
            artifacts.push({ label: 'Markdown', href: `${pathOnly}/audit-report.md` });
          }
        }
      }

      rows.push({
        id: `${vertical}:${href}`,
        catalogId,
        vertical,
        title: displayTitle,
        subject,
        slug: slug || null,
        status,
        primaryHref: href,
        updatedAt: updatedMs ? new Date(updatedMs).toISOString() : null,
        artifacts,
      });
    }
  }

  rows.sort((a, b) => {
    const na = a.catalogId ? Number.parseInt(a.catalogId, 10) : Number.NaN;
    const nb = b.catalogId ? Number.parseInt(b.catalogId, 10) : Number.NaN;
    if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
    if (Number.isFinite(na) !== Number.isFinite(nb)) return Number.isFinite(na) ? -1 : 1;
    const ta = a.updatedAt ? Date.parse(a.updatedAt) : 0;
    const tb = b.updatedAt ? Date.parse(b.updatedAt) : 0;
    if (tb !== ta) return tb - ta;
    return String(a.title).localeCompare(String(b.title));
  });

  return rows;
}

/** Site pages Jack commonly edits or ships — presence + last modified. */
const MANAGED_PAGE_FILES = [
  'index.html',
  'login.html',
  'admin.html',
  'register.html',
  'operator/places-leads.html',
  'clinics/report.html',
  'property.html',
  'clinics.html',
  'hotels.html',
  'pricing.html',
  'pricing-inquiry.html',
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

/** Public homepage Jack portrait — default URL only when the file is shipped under `public/assets/`. */
function defaultJackAvatarUrlFromDisk() {
  try {
    const p = path.join(publicDir, 'assets', 'jack-avatar.png');
    return fs.existsSync(p) ? '/assets/jack-avatar.png' : '';
  } catch {
    return '';
  }
}

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
  navLogoAlt: 'www.serviceopera.to',
  heroDecoTopRightUrl: '/assets/hero-corner-arc.svg',
  heroDecoBottomLeftUrl: '/assets/hero-corner-arc-bl.svg',
  heroDecoTopRightOpacity: 0.12,
  heroDecoBottomLeftOpacity: 0.12,
};

function readSiteAppearanceRawFromFile() {
  try {
    return JSON.parse(fs.readFileSync(siteAppearancePath, 'utf8'));
  } catch {
    return {};
  }
}

/** When PostgreSQL is available, read (and optionally one-time migrate from file). Otherwise JSON under DATA_DIR. */
async function readSiteAppearanceRawAsync() {
  if (pgPool) {
    try {
      let raw = await loadSiteAppearanceJson(pgPool);
      if (raw && typeof raw === 'object' && Object.keys(raw).length > 0) {
        return raw;
      }
      const disk = readSiteAppearanceRawFromFile();
      if (disk && typeof disk === 'object' && Object.keys(disk).length > 0) {
        try {
          await saveSiteAppearanceJson(pgPool, disk);
        } catch (e) {
          console.warn(
            '[serviceopera] site appearance: could not migrate from file to Postgres:',
            e && e.message ? e.message : e
          );
        }
        return disk;
      }
      return {};
    } catch (e) {
      console.error('[serviceopera] site appearance PG read failed:', e && e.message ? e.message : e);
    }
  }
  return readSiteAppearanceRawFromFile();
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

const DEFAULT_HERO_DECO_OPACITY = 0.12;

/** Optional homepage hero corner SVG/image URL: absent key → default URL; present empty string → hidden. */
function mergeHeroDecoImageUrl(raw, key, defaultUrl) {
  if (!(key in raw)) return defaultUrl;
  const v = typeof raw[key] === 'string' ? raw[key].trim() : '';
  if (!v) return '';
  const u = rewriteLegacyImagesUrl(v);
  return isSafePropertyPageImageUrl(u) ? u : defaultUrl;
}

function mergeHeroDecoOpacity(raw, key) {
  if (!(key in raw)) return DEFAULT_HERO_DECO_OPACITY;
  const n = Number(raw[key]);
  if (!Number.isFinite(n)) return DEFAULT_HERO_DECO_OPACITY;
  return Math.min(1, Math.max(0, n));
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
  const diskJackUrl = defaultJackAvatarUrlFromDisk();
  /** Non-empty URL from JSON wins; missing or blank falls back to bundled file when present (blank no longer overrides disk). */
  let jackAvatarUrl = '';
  if (typeof raw.jackAvatarUrl === 'string' && raw.jackAvatarUrl.trim()) {
    const ju = rewriteLegacyImagesUrl(raw.jackAvatarUrl.trim());
    jackAvatarUrl = isSafePropertyPageImageUrl(ju) ? ju : diskJackUrl;
  } else {
    jackAvatarUrl = diskJackUrl;
  }
  const jackAltRaw = typeof raw.jackAvatarAlt === 'string' ? raw.jackAvatarAlt.trim() : '';
  const jackAvatarAlt = jackAltRaw
    ? jackAltRaw.slice(0, 180).replace(/[\u0000-\u001f\u007f]/g, '')
    : '';
  const icons = mergeIconsMap(raw.icons);
  const heroDecoTopRightUrl = mergeHeroDecoImageUrl(
    raw,
    'heroDecoTopRightUrl',
    defaultSiteAppearance.heroDecoTopRightUrl
  );
  const heroDecoBottomLeftUrl = mergeHeroDecoImageUrl(
    raw,
    'heroDecoBottomLeftUrl',
    defaultSiteAppearance.heroDecoBottomLeftUrl
  );
  const heroDecoTopRightOpacity = mergeHeroDecoOpacity(raw, 'heroDecoTopRightOpacity');
  const heroDecoBottomLeftOpacity = mergeHeroDecoOpacity(raw, 'heroDecoBottomLeftOpacity');
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
    jackAvatarUrl,
    jackAvatarAlt,
    heroDecoTopRightUrl,
    heroDecoBottomLeftUrl,
    heroDecoTopRightOpacity,
    heroDecoBottomLeftOpacity,
    icons,
  };
}

function sniffWritableSiteImage(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 12) return null;
  const sniffUtf8 = buf.slice(0, Math.min(512, buf.length)).toString('utf8').trimStart();
  if (/^<\?xml/i.test(sniffUtf8) || /^<svg[\s/>]/i.test(sniffUtf8)) return { ext: 'svg' };
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return { ext: 'png' };
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { ext: 'jpg' };
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38 && (buf[4] === 0x37 || buf[4] === 0x39))
    return { ext: 'gif' };
  const ascii12 = buf.slice(0, 12).toString('ascii');
  if (ascii12.startsWith('RIFF') && ascii12.slice(8, 12) === 'WEBP') return { ext: 'webp' };
  return null;
}

function mimeTypeForWritableSiteImageExt(ext) {
  const e = String(ext || '').toLowerCase();
  if (e === 'png') return 'image/png';
  if (e === 'jpg') return 'image/jpeg';
  if (e === 'gif') return 'image/gif';
  if (e === 'webp') return 'image/webp';
  if (e === 'svg') return 'image/svg+xml';
  return 'application/octet-stream';
}

const SITE_UPLOAD_API_PREFIX = '/api/site-uploads/';
const SITE_UPLOAD_DB_ID_IN_PATH_RE = /^\/api\/site-uploads\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/?$/i;

function isStableSiteUploadApiPath(candidate) {
  const s = String(candidate || '').trim();
  return SITE_UPLOAD_DB_ID_IN_PATH_RE.test(s.split('?')[0].split('#')[0].replace(/\/+/g, '/'));
}

const SITE_UPLOAD_PUBLIC_PREFIX = '/assets/site-uploads/';
/** Only names minted by POST …/upload (`su-<timestamp>-<8 hex>.<ext>`). No directory segments, no traversal. */
const SITE_UPLOAD_DELETABLE_BASENAME_RE = /^su-\d+-[a-f0-9]{8}\.(png|jpe?g|gif|webp|svg)$/i;

function parseSiteUploadDeletableBasenameFromUrl(inputUrl) {
  const s = String(inputUrl || '').trim();
  if (!s) return null;
  let pathname = '';
  try {
    if (/^https?:\/\//i.test(s)) pathname = new URL(s).pathname || '';
    else pathname = s.startsWith('/') ? s : '/' + s;
  } catch {
    return null;
  }
  pathname = pathname.split('?')[0].split('#')[0].replace(/\/+/g, '/');
  if (!pathname.startsWith(SITE_UPLOAD_PUBLIC_PREFIX)) return null;
  const rest = pathname.slice(SITE_UPLOAD_PUBLIC_PREFIX.length);
  if (!rest || rest.includes('/')) return null;
  let base;
  try {
    base = decodeURIComponent(rest);
  } catch {
    return null;
  }
  if (base.includes('..') || base.includes('/') || base.includes('\\')) return null;
  if (!SITE_UPLOAD_DELETABLE_BASENAME_RE.test(base)) return null;
  return base;
}

/** UUID from `/api/site-uploads/<uuid>` (or full URL with that path). */
function parseSiteUploadDbIdFromUrl(inputUrl) {
  const s = String(inputUrl || '').trim();
  if (!s) return null;
  let pathname = '';
  try {
    if (/^https?:\/\//i.test(s)) pathname = new URL(s).pathname || '';
    else pathname = s.startsWith('/') ? s : '/' + s;
  } catch {
    return null;
  }
  pathname = pathname.split('?')[0].split('#')[0].replace(/\/+/g, '/');
  const m = pathname.match(SITE_UPLOAD_DB_ID_IN_PATH_RE);
  return m ? m[1].toLowerCase() : null;
}

/** Absolute path inside `siteUploadsDir`, or null if it would escape. */
function resolvedPathInsideSiteUploads(basename) {
  const safeBase = path.basename(basename);
  const full = path.join(siteUploadsDir, safeBase);
  const resolvedFile = path.resolve(full);
  const resolvedDir = path.resolve(siteUploadsDir);
  const rel = path.relative(resolvedDir, resolvedFile);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return null;
  return resolvedFile;
}

function isSafePropertyPageImageUrl(candidate) {
  const s = String(candidate || '').trim();
  if (!s || s.length > 2048) return false;
  if (/[\u0000-\u001f\u007f\s<>"]/.test(s)) return false;
  if (s.includes('..')) return false;
  if (s.startsWith('/')) {
    if (s.startsWith('//')) return false;
    if (isStableSiteUploadApiPath(s)) return true;
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

const SO_ICON_KEY_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/i;
const SO_ICON_MAX_KEYS = 48;
const SO_ICON_SVG_MAX_BYTES = 49152;

function normalizeSiteIconKey(k) {
  const s = String(k || '').trim().toLowerCase();
  if (!s || !SO_ICON_KEY_RE.test(s)) return '';
  return s;
}

/** Strip common XSS vectors from admin-supplied inline SVG (stored JSON is admin-only but served on public GET). */
function sanitizeSiteIconSvgMarkup(html) {
  let t = String(html || '').trim();
  if (!t || t.length > SO_ICON_SVG_MAX_BYTES) return '';
  if (!/<svg[\s/>]/i.test(t)) return '';
  t = t.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '');
  t = t.replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  t = t.replace(/javascript:/gi, '');
  return t;
}

function mergeIconsMap(rawIcons) {
  const out = {};
  if (!rawIcons || typeof rawIcons !== 'object' || Array.isArray(rawIcons)) return out;
  for (const [k0, v0] of Object.entries(rawIcons)) {
    const k = normalizeSiteIconKey(k0);
    if (!k) continue;
    let v = String(v0 ?? '').trim();
    if (!v) continue;
    if (/<svg[\s/>]/i.test(v)) {
      v = sanitizeSiteIconSvgMarkup(v);
      if (!v) continue;
    } else if (!isSafePropertyPageImageUrl(v)) {
      continue;
    }
    out[k] = v;
    if (Object.keys(out).length >= SO_ICON_MAX_KEYS) break;
  }
  return out;
}

function normalizePageImageAlt(s, fallback) {
  const t = String(s ?? '').trim().slice(0, 500).replace(/[\u0000-\u001f\u007f]/g, '');
  return t || fallback;
}

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'jack@serviceopera.to').trim().toLowerCase();
/** scrypt hash in the same `salt:hex` format as portal passwords (`clinic-store.mjs` / `scripts/hash-admin-password.mjs`). */
const ADMIN_PASSWORD_HASH = (process.env.ADMIN_PASSWORD_HASH || '').trim();
const RESEND_API_KEY = (process.env.RESEND_API_KEY || '').trim();
const RESEND_FROM = (process.env.RESEND_FROM || 'ServiceOpera <onboarding@resend.dev>').trim();
const RESEND_FROM_USES_TEST_SENDER = /@resend\.dev>/i.test(RESEND_FROM) || /onboarding@resend\.dev/i.test(RESEND_FROM);
/** Sole operator identity string in portal email copy and user-facing contact errors. */
const OPERATOR_IDENTITY = 'Jack from ServiceOpera.to';
const OPERATOR_CONTACT_EMAIL = 'jack@serviceopera.to';
function operatorContactForErrors() {
  return OPERATOR_IDENTITY + ' (' + OPERATOR_CONTACT_EMAIL + ')';
}
/** Public sign-up is on by default; set PORTAL_SELF_REGISTER=false or legacy CLINIC_SELF_REGISTER=false for invite-only. */
const PORTAL_SELF_REGISTER = (function () {
  const raw = process.env.PORTAL_SELF_REGISTER ?? process.env.CLINIC_SELF_REGISTER;
  if (raw === undefined || raw === '') return true;
  const s = String(raw).toLowerCase().trim();
  if (s === '0' || s === 'false' || s === 'no' || s === 'off') return false;
  return true;
})();
const OTP_TTL_MS = 10 * 60 * 1000;
const JWT_TTL_MS = 8 * 60 * 60 * 1000;
const CLINIC_JWT_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const CLINIC_RESET_JWT_MS = 60 * 60 * 1000;
/** Email confirmation / onboarding link after self-registration (pending row consumed on completion). */
const CLINIC_VERIFY_JWT_MS = 48 * 60 * 60 * 1000;
const AUDIT_DDC_REPORT_SLUG = (process.env.AUDIT_DDC_REPORT_SLUG || '004').trim() || '004';
const AUDIT_DDC_MAGIC_TTL_MS_DEFAULT = 7 * 24 * 60 * 60 * 1000;
function auditDdcMagicTtlMs() {
  const ttlRaw = Number(process.env.AUDIT_DDC_MAGIC_TTL_MS || AUDIT_DDC_MAGIC_TTL_MS_DEFAULT);
  if (
    Number.isFinite(ttlRaw) &&
    ttlRaw >= 5 * 60 * 1000 &&
    ttlRaw <= 30 * 24 * 60 * 60 * 1000
  ) {
    return ttlRaw;
  }
  return AUDIT_DDC_MAGIC_TTL_MS_DEFAULT;
}
function mintAuditDdcMagicJwt(email) {
  const ttl = auditDdcMagicTtlMs();
  return signJwt({
    v: 1,
    role: 'audit_dd_magic',
    aud: 'audit-ddc',
    sub: normalizeEmail(email),
    exp: Date.now() + ttl,
  });
}
const PORTAL_REGISTER_OK_RESPONSE = {
  ok: true,
  message:
    'If this address can be used with ServiceOpera, check your inbox (and spam) for a link to continue registration. The link expires in 48 hours.',
};
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

/** Portal user sign-in OTP. Key: normalized email */
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
function isPortalOnboardRole(role) {
  return role === 'user_onboard' || role === 'clinic_onboard';
}

function isAuditDdMagicJwtPayload(p) {
  return (
    p &&
    p.role === 'audit_dd_magic' &&
    p.aud === 'audit-ddc' &&
    typeof p.sub === 'string' &&
    p.sub.includes('@')
  );
}

/** @type {Map<string, number[]>} */
const auditMagicExchangeTimestampsByIp = new Map();
const AUDIT_MAGIC_EXCHANGE_WINDOW_MS = SEND_WINDOW_MS;
const AUDIT_MAGIC_EXCHANGE_MAX_PER_WINDOW = 30;
function pruneAuditMagicExchange(ip) {
  const now = Date.now();
  const arr = (auditMagicExchangeTimestampsByIp.get(ip) || []).filter((t) => now - t < AUDIT_MAGIC_EXCHANGE_WINDOW_MS);
  auditMagicExchangeTimestampsByIp.set(ip, arr);
  return arr;
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

/** Anonymous funnel / navigation beacons (IP + path + tier intent). */
const LEAD_EVENT_TRACKING_WINDOW_MS = SEND_WINDOW_MS;
const LEAD_EVENT_MAX_PER_IP = 90;
/** @type {Map<string, number[]>} */
const leadEventHitsByIp = new Map();

function pruneLeadEventHits(ip) {
  const now = Date.now();
  const arr = (leadEventHitsByIp.get(ip) || []).filter((t) => now - t < LEAD_EVENT_TRACKING_WINDOW_MS);
  leadEventHitsByIp.set(ip, arr);
  return arr;
}

const PRICING_INQUIRY_WINDOW_MS = SEND_WINDOW_MS;
const PRICING_INQUIRY_MAX_PER_IP = 12;
/** @type {Map<string, number[]>} */
const pricingInquiryHitsByIp = new Map();

function prunePricingInquiryHits(ip) {
  const now = Date.now();
  const arr = (pricingInquiryHitsByIp.get(ip) || []).filter((t) => now - t < PRICING_INQUIRY_WINDOW_MS);
  pricingInquiryHitsByIp.set(ip, arr);
  return arr;
}

function isValidInquiryEmail(email) {
  const em = normalizeEmail(email);
  if (!em || em.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em);
}

function parsePricingTier(raw) {
  const s = String(raw || '')
    .toLowerCase()
    .trim();
  if (s === 'free' || s === 'free_audit' || s === 'audit') return 'free';
  if (s === 'operator') return 'operator';
  if (s === 'white' || s === 'white-glove' || s === 'white_glove') return 'white';
  return null;
}

/** Marketing / pricing request forms: canonical sector slug. */
function normalizeInquirySector(raw) {
  const s = String(raw || '')
    .toLowerCase()
    .trim();
  if (s === 'hotels' || s === 'hotel') return 'hotels';
  if (s === 'clinics' || s === 'clinic') return 'clinics';
  if (s === 'property' || s === 'properties' || s === 'real_estate' || s === 'real-estate') return 'property';
  if (s === 'other') return 'other';
  return null;
}

function inquirySectorLabel(slug) {
  if (slug === 'hotels') return 'Hotels';
  if (slug === 'clinics') return 'Clinics';
  if (slug === 'property') return 'Property';
  if (slug === 'other') return 'Other';
  return slug || '';
}

function inquiryHoneypotTripped(body) {
  const v = typeof body?.company_url === 'string' ? body.company_url.trim() : '';
  return Boolean(v);
}

function clipImproveFirst(body) {
  return clipFreeText(body?.improveFirst ?? body?.improvement, 2000);
}

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

const ADMIN_JWT_COOKIE = 'so_admin_jwt';

function getCookie(req, name) {
  const raw = req.headers.cookie;
  if (typeof raw !== 'string' || !raw) return '';
  for (const part of raw.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    const k = part.slice(0, idx).trim();
    if (k === name) return decodeURIComponent(part.slice(idx + 1).trim());
  }
  return '';
}

/** Admin JWT from Authorization header or HttpOnly cookie (HTML report pages). */
function getAdminJwtFromRequest(req) {
  const bearer = getBearer(req);
  if (bearer) return bearer;
  return getCookie(req, ADMIN_JWT_COOKIE);
}

function getVerifiedAdmin(req) {
  const p = verifyJwt(getAdminJwtFromRequest(req));
  if (!p || p.role !== 'admin' || typeof p.email !== 'string') return null;
  return p;
}

function setAdminJwtCookie(res, token) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  const maxAge = Math.floor(JWT_TTL_MS / 1000);
  res.setHeader(
    'Set-Cookie',
    `${ADMIN_JWT_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`
  );
}

function clearAdminJwtCookie(res) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader(
    'Set-Cookie',
    `${ADMIN_JWT_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`
  );
}

function requireAdmin(req, res, next) {
  const p = getVerifiedAdmin(req);
  if (!p) {
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

/** Rate-limit POST /api/auth/user-complete-onboarding by IP (token brute-force / abuse). */
const onboardingPostTimestampsByIp = new Map();
const MAX_ONBOARDING_POSTS_PER_WINDOW = 12;
function pruneOnboardingPosts(ip) {
  const now = Date.now();
  const arr = (onboardingPostTimestampsByIp.get(ip) || []).filter((t) => now - t < SEND_WINDOW_MS);
  onboardingPostTimestampsByIp.set(ip, arr);
  return arr;
}

const ADMIN_LOGIN_WINDOW_MS = SEND_WINDOW_MS;
const ADMIN_LOGIN_MAX_ATTEMPTS = 15;
/** @type {Map<string, number[]>} */
const adminLoginFailTimestampsByIp = new Map();

function pruneAdminLoginFails(ip) {
  const now = Date.now();
  const arr = (adminLoginFailTimestampsByIp.get(ip) || []).filter((t) => now - t < ADMIN_LOGIN_WINDOW_MS);
  adminLoginFailTimestampsByIp.set(ip, arr);
  return arr;
}

function recordAdminLoginFailure(ip) {
  const arr = pruneAdminLoginFails(ip);
  arr.push(Date.now());
  adminLoginFailTimestampsByIp.set(ip, arr);
}

const ADMIN_USER_PROFILING_WINDOW_MS = 60_000;
const ADMIN_USER_PROFILING_MAX_PER_WINDOW = 45;
/** @type {Map<string, number[]>} */
const adminUserProfilingGetTimestampsByIp = new Map();

function pruneAdminUserProfilingGets(ip) {
  const now = Date.now();
  const arr = (adminUserProfilingGetTimestampsByIp.get(ip) || []).filter(
    (t) => now - t < ADMIN_USER_PROFILING_WINDOW_MS
  );
  adminUserProfilingGetTimestampsByIp.set(ip, arr);
  return arr;
}

const USER_PROFILING_ONLINE_MINUTES = 5;

async function buildPortalUserProfilingRows() {
  const onlineWindowMs = USER_PROFILING_ONLINE_MINUTES * 60 * 1000;
  const now = Date.now();
  const users = await userStore.listUsers();
  let byId = {};
  if (telemetryStore && typeof telemetryStore.listTelemetryProfilingByUser === 'function') {
    byId = await telemetryStore.listTelemetryProfilingByUser();
  }
  const rows = users.map((u) => {
    const t = byId[u.id] || {};
    const telemetryMs = t.lastActivityAt ? Date.parse(t.lastActivityAt) : 0;
    const lastSeenMs = u.lastSeenAt ? Date.parse(u.lastSeenAt) : 0;
    const lastLoginMs = u.lastLoginAt ? Date.parse(u.lastLoginAt) : 0;
    const bestTelemetryMs = Number.isFinite(telemetryMs) ? telemetryMs : 0;
    const bestMs = Math.max(bestTelemetryMs, lastSeenMs, lastLoginMs);
    const lastActivityIso = bestMs > 0 ? new Date(bestMs).toISOString() : null;
    const currentOnline = bestMs > 0 && now - bestMs <= onlineWindowMs;
    const engagedMinutes =
      typeof t.pageLeaveMs === 'number' && t.pageLeaveMs > 0
        ? Math.round((t.pageLeaveMs / 60000) * 10) / 10
        : 0;
    const cityT = t.lastSessionCity || u.lastLoginCity;
    const regT = t.lastSessionRegion || u.lastLoginRegion;
    const ctry = t.lastSessionCountry || u.country;
    const locParts = [];
    if (cityT) locParts.push(cityT);
    if (regT && regT !== cityT) locParts.push(regT);
    if (ctry) locParts.push(ctry);
    const lastLocation = locParts.length ? locParts.join(', ') : null;
    const lastIp = t.lastSessionIp || u.lastLoginIp || null;
    return {
      id: u.id,
      email: u.email,
      displayName: u.displayName,
      reportSlug: u.reportSlug,
      gender: u.gender || null,
      createdAt: u.createdAt,
      lastLoginAt: u.lastLoginAt,
      firstTelemetryAt: t.firstSessionAt || null,
      lastActivityAt: lastActivityIso,
      currentOnline,
      sessionCount: t.sessionCount || 0,
      pageViews: t.pageViews || 0,
      engagedMinutes,
      lastIp,
      lastLocation,
      loginCount: u.loginCount || 0,
    };
  });
  rows.sort((a, b) => {
    const ta = a.lastActivityAt ? Date.parse(a.lastActivityAt) : 0;
    const tb = b.lastActivityAt ? Date.parse(b.lastActivityAt) : 0;
    if (tb !== ta) return tb - ta;
    return String(a.email).localeCompare(String(b.email));
  });
  return rows;
}

function emailsEqualTiming(a, b) {
  const x = normalizeEmail(a);
  const y = normalizeEmail(b);
  if (x.length !== y.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(x, 'utf8'), Buffer.from(y, 'utf8'));
  } catch {
    return false;
  }
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

/** Human-signed footer for outbound portal transactional mail (registration, OTP, password reset). */
function portalTransactionalEmailHtml(bodyHtml) {
  return (
    bodyHtml +
    '<p style="font-family:system-ui,sans-serif;font-size:13px;color:#444;margin-top:1.25em;padding-top:0.75em;border-top:1px solid #e5e7eb">— ' +
    escapeHtml(OPERATOR_IDENTITY) +
    '</p>'
  );
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

/** Public site origins when marketing is on a custom domain and API is on Railway (so-api.js cross-origin). */
const DEFAULT_MARKETING_CORS_ORIGINS = ['https://www.serviceopera.to', 'https://serviceopera.to'];

function isAllowedPortalCorsOrigin(origin) {
  if (!origin || typeof origin !== 'string') return false;
  const o = origin.trim().replace(/\/$/, '');
  if (!o) return false;
  if (PORTAL_CORS_ORIGINS.includes(o)) return true;
  if (DEFAULT_MARKETING_CORS_ORIGINS.includes(o)) return true;
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
app.use((req, res, next) => {
  const bigJson =
    (req.method === 'POST' && req.path === '/api/admin/site-appearance/upload') ||
    (req.method === 'PUT' && req.path === '/api/admin/site-appearance');
  express.json({ limit: bigJson ? '12mb' : '48kb' })(req, res, next);
});

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

app.get('/api/site-appearance', async (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    res.json(mergeSiteAppearance(await readSiteAppearanceRawAsync()));
  } catch (e) {
    res.status(500).json({ error: e.message || 'Could not load site appearance.' });
  }
});

/** Public image bytes for admin “Site appearance” uploads when `DATABASE_URL` is set (Postgres `site_uploads`). */
app.get('/api/site-uploads/:id', async (req, res) => {
  const id = String(req.params.id || '').trim().toLowerCase();
  if (!pgPool) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(404).type('text/plain').send('Not found');
  }
  try {
    const row = await getSiteUpload(pgPool, id);
    if (!row || !row.bytes) {
      res.setHeader('Cache-Control', 'no-store');
      return res.status(404).end();
    }
    res.setHeader('Content-Type', row.mimeType || 'application/octet-stream');
    res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return res.send(row.bytes);
  } catch (e) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(500).type('text/plain').send(e.message || 'Error');
  }
});

/**
 * First-time audit portal handoff (Dental Design Center). Values from env only; when the
 * portal user exists and no longer has passwordMustChange, credentials are omitted so the
 * temporary password is not served after first-time setup.
 */
app.get('/api/public/audit-ddc-first-access', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const reportPath = '/clinics/' + AUDIT_DDC_REPORT_SLUG + '/';
  const rawEmail = (process.env.AUDIT_DDC_EMAIL || '').trim();
  const tempPassword = (process.env.AUDIT_DDC_TEMP_PASSWORD || '').trim();
  if (!rawEmail || !rawEmail.includes('@') || !tempPassword) {
    return res.json({ ok: true, state: 'unconfigured', reportPath });
  }
  const email = normalizeEmail(rawEmail);
  let user;
  try {
    user = await userStore.getUserByEmail(email);
    if (user && user.passwordMustChange !== true) {
      return res.json({ ok: true, state: 'completed', reportPath });
    }
  } catch {
    /* If the store is unavailable, avoid returning secrets. */
    return res.json({ ok: true, state: 'unconfigured', reportPath });
  }
  const ttl = auditDdcMagicTtlMs();
  const activationExpiresAt = new Date(Date.now() + ttl).toISOString();
  let activationUrl = null;
  if (user && user.active !== false && user.reportSlug === AUDIT_DDC_REPORT_SLUG) {
    const origin = publicOriginForEmail(req);
    const token = mintAuditDdcMagicJwt(email);
    activationUrl = `${origin}${reportPath}?access=${encodeURIComponent(token)}`;
  }
  return res.json({
    ok: true,
    state: 'credentials',
    reportPath,
    email,
    tempPassword,
    activationUrl,
    activationExpiresAt,
  });
});

/**
 * Exchange a short-lived signed magic JWT for a normal portal session JWT (same storage keys as
 * login.html). Token is minted offline via scripts/mint-audit-ddc-magic-link.mjs using PORTAL_JWT_SECRET.
 * Not single-use: valid until exp; rotating PORTAL_JWT_SECRET revokes all outstanding links.
 */
app.post('/api/auth/audit-ddc-magic', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const ip = clientIp(req);
  const hits = pruneAuditMagicExchange(ip);
  if (hits.length >= AUDIT_MAGIC_EXCHANGE_MAX_PER_WINDOW) {
    return res.status(429).json({ error: 'Too many requests. Try again later.' });
  }
  const token = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
  if (!token) {
    return res.status(400).json({ error: 'Missing token.' });
  }
  const p = verifyJwt(token);
  if (!isAuditDdMagicJwtPayload(p)) {
    return res.status(401).json({ error: 'Invalid or expired access link.' });
  }
  const email = normalizeEmail(p.sub);
  let user;
  try {
    user = await userStore.getUserByEmail(email);
  } catch {
    return res.status(503).json({ error: 'Sign-in is temporarily unavailable. Try again later.' });
  }
  if (!user || user.active === false) {
    return res.status(401).json({ error: 'Invalid or expired access link.' });
  }
  if (user.reportSlug !== AUDIT_DDC_REPORT_SLUG) {
    return res.status(403).json({ error: 'This access link is not valid for your account.' });
  }
  hits.push(Date.now());
  auditMagicExchangeTimestampsByIp.set(ip, hits);
  const sessionId = await recordPortalLogin(req, user);
  const portalToken = signPortalUserJwt(user);
  const reportPath = '/clinics/' + AUDIT_DDC_REPORT_SLUG + '/';
  return res.json({
    ok: true,
    token: portalToken,
    sessionId,
    reportSlug: user.reportSlug,
    reportUrl: reportPath,
    passwordMustChange: Boolean(user.passwordMustChange),
  });
});

app.get('/api/debug/user-store', async (req, res) => {
  allowDebugCors(req, res);
  res.setHeader('Cache-Control', 'no-store');
  try {
    const storage = await userStore.getStorageSummary();
    return res.json({
      ok: true,
      service: 'serviceopera',
      version: appVersion,
      storage,
      deploy: {
        databaseUrlConfigured: ENV_DATABASE_URL_CONFIGURED,
        postgresPoolActive: POSTGRES_POOL_ACTIVE,
        postgresConfiguredButUnavailable: POSTGRES_CONFIGURED_BUT_POOL_MISSING,
        dataDir,
        portalSelfRegister: Boolean(PORTAL_SELF_REGISTER),
        resendConfigured: Boolean(RESEND_API_KEY),
        registrationConfirmEmail: Boolean(RESEND_API_KEY && PORTAL_SELF_REGISTER),
        adminEmailConfigured: Boolean((process.env.ADMIN_EMAIL || '').trim()),
        nodeVersion: process.version,
        userStoreBackend:
          storage.backend || userStore.backend || (ENV_DATABASE_URL_CONFIGURED ? 'postgres' : 'json-files'),
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
    /** @deprecated Admin email OTP removed; always false. */
    otpEnabled: false,
    adminPasswordConfigured: Boolean(ADMIN_PASSWORD_HASH),
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
    return res.status(403).json({ error: 'Self-registration is disabled. Contact ' + operatorContactForErrors() + ' for access.' });
  }
  if (!RESEND_API_KEY) {
    return res.status(503).json({
      error:
        'Email confirmation requires RESEND_API_KEY on this server. Contact ' +
        operatorContactForErrors() +
        ' or ask your administrator to configure Resend.',
    });
  }
  const email = typeof req.body?.email === 'string' ? normalizeEmail(req.body.email) : '';
  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'Enter a valid email address.' });
  }
  const ip = clientIp(req);
  const sends = pruneSends(ip);
  if (sends.length >= MAX_SENDS_PER_WINDOW) {
    return res.status(429).json({ error: 'Too many requests. Try again later.' });
  }

  const existingUser = await userStore.getUserByEmail(email);
  if (existingUser) {
    return res.status(201).json(PORTAL_REGISTER_OK_RESPONSE);
  }

  let pending;
  try {
    pending = await userStore.createPendingRegistration({ email });
  } catch (e) {
    if (e.status === 409 && /already registered/i.test(String(e.message || ''))) {
      return res.status(201).json(PORTAL_REGISTER_OK_RESPONSE);
    }
    const status = e.status || 400;
    return res.status(status).json({ error: e.message || 'Bad request' });
  }

  const onboardJwt = signJwt({
    v: 1,
    role: 'user_onboard',
    sub: pending.id,
    email: pending.email,
    exp: Date.now() + CLINIC_VERIFY_JWT_MS,
  });
  const origin = publicOriginForEmail(req);
  const link = `${origin}/register.html?onboard=${encodeURIComponent(onboardJwt)}`;
  try {
    await sendResendEmail({
      to: pending.email,
      subject: 'ServiceOpera — continue your registration',
      html: portalTransactionalEmailHtml(
        '<p style="font-family:system-ui,sans-serif;font-size:15px;color:#111">Thanks for starting an account on <strong>www.serviceopera.to</strong>.</p>' +
          '<p style="font-family:system-ui,sans-serif;font-size:15px;color:#111"><a href="' +
          String(link).replace(/"/g, '&quot;') +
          '" style="color:#1e3a5f;font-weight:600">Continue registration</a> — choose your password and business type (link expires in 48 hours).</p>' +
          '<p style="font-family:system-ui,sans-serif;font-size:13px;color:#444">If you did not request this, you can ignore this email.</p>'
      ),
    });
    sends.push(Date.now());
    sendTimestampsByIp.set(ip, sends);
  } catch (e) {
    const status = e.status || 502;
    return res.status(status).json({
      error: resendFailureMessage(
        e,
        'Could not send confirmation email. Try again later or contact ' + operatorContactForErrors() + '.'
      ),
    });
  }
  return res.status(201).json({
    ok: true,
    message:
      'Check your inbox for a secure link. Open it to choose your password and business type, then you will be signed in.',
  });
}

app.post('/api/auth/user-register', handlePortalRegister);
app.post('/api/auth/clinic-register', handlePortalRegister);

app.post('/api/admin/login', (req, res) => {
  const ip = clientIp(req);
  const fails = pruneAdminLoginFails(ip);
  if (fails.length >= ADMIN_LOGIN_MAX_ATTEMPTS) {
    return res.status(429).json({ error: 'Too many sign-in attempts. Try again later.' });
  }
  if (!ADMIN_PASSWORD_HASH) {
    return res.status(503).json({
      error:
        'Admin password sign-in is not configured (missing ADMIN_PASSWORD_HASH). See README: generate a hash with `node scripts/hash-admin-password.mjs` and set the env var on this service.',
    });
  }
  const email = typeof req.body?.email === 'string' ? req.body.email : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const passOk = verifyPassword(password, ADMIN_PASSWORD_HASH);
  const emailOk = emailsEqualTiming(email, ADMIN_EMAIL);
  if (!emailOk || !passOk) {
    recordAdminLoginFailure(ip);
    return res.status(401).json({ error: 'Invalid email or password.' });
  }
  adminLoginFailTimestampsByIp.delete(ip);
  const token = signJwt({ v: 1, role: 'admin', email: ADMIN_EMAIL, exp: Date.now() + JWT_TTL_MS });
  setAdminJwtCookie(res, token);
  return res.json({ ok: true, token, expiresInMs: JWT_TTL_MS });
});

app.post('/api/admin/logout', (_req, res) => {
  clearAdminJwtCookie(res);
  return res.json({ ok: true });
});

app.get('/api/admin/session', (req, res) => {
  const p = getVerifiedAdmin(req);
  if (!p) return res.status(401).json({ ok: false });
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

/** Mint a short-lived token so GET /operator/places-leads.html?t=… can load the operator Places UI (no API keys in HTML). */
app.post('/api/admin/places-page-token', requireAdmin, (_req, res) => {
  const pageToken = signJwt({
    v: 1,
    kind: 'places_page',
    exp: Date.now() + PLACES_PAGE_DOCUMENT_TTL_MS,
  });
  res.setHeader('Cache-Control', 'no-store');
  return res.json({ ok: true, page_token: pageToken, expires_in_ms: PLACES_PAGE_DOCUMENT_TTL_MS });
});

async function listPortalUsersForAdmin(_req, res) {
  res.json({ users: await userStore.listUsers() });
}
app.get('/api/user-accounts', requireAdmin, listPortalUsersForAdmin);
app.get('/api/clinic-users', requireAdmin, listPortalUsersForAdmin);

app.get('/api/admin/user-profiling', requireAdmin, async (_req, res) => {
  const ip = clientIp(_req);
  const arr = pruneAdminUserProfilingGets(ip);
  if (arr.length >= ADMIN_USER_PROFILING_MAX_PER_WINDOW) {
    return res.status(429).json({ error: 'Too many requests. Try again later.' });
  }
  arr.push(Date.now());
  adminUserProfilingGetTimestampsByIp.set(ip, arr);
  try {
    const rows = await buildPortalUserProfilingRows();
    res.setHeader('Cache-Control', 'no-store');
    return res.json({
      ok: true,
      generatedAt: new Date().toISOString(),
      onlineWithinMinutes: USER_PROFILING_ONLINE_MINUTES,
      rows,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Failed to load user profiling.' });
  }
});

app.get('/api/admin/work-queue', requireAdmin, async (_req, res) => {
  try {
    res.json(await buildAdminWorkQueue());
  } catch (e) {
    res.status(500).json({ error: e.message || 'Failed to build work queue' });
  }
});

app.get('/api/admin/site-appearance', requireAdmin, async (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const merged = mergeSiteAppearance(await readSiteAppearanceRawAsync());
    res.json({
      ok: true,
      ...merged,
      serverHints: {
        databaseUrlConfigured: ENV_DATABASE_URL_CONFIGURED,
        postgresPoolActive: POSTGRES_POOL_ACTIVE,
        postgresConfiguredButUnavailable: POSTGRES_CONFIGURED_BUT_POOL_MISSING,
        siteImageUploadTarget: POSTGRES_POOL_ACTIVE ? 'postgres' : 'disk',
        runningOnRailway: RAILWAY_DEPLOY,
      },
    });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Could not load site appearance.' });
  }
});

app.put('/api/admin/site-appearance', requireAdmin, async (req, res) => {
  const body = req.body || {};
  let cur;
  try {
    cur = mergeSiteAppearance(await readSiteAppearanceRawAsync());
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Could not load current site appearance.' });
  }

  /* Each field: if the key is present in body with the expected type (string for image URLs), body wins for that field; omitted keys keep `cur`. Empty required hero URLs fall back to shipped defaults; optional hero-deco URLs may be cleared with "". */
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

  const jackUrlIn =
    'jackAvatarUrl' in body && typeof body.jackAvatarUrl === 'string'
      ? body.jackAvatarUrl.trim()
      : cur.jackAvatarUrl;
  let jackAvatarUrl = jackUrlIn === '' ? '' : rewriteLegacyImagesUrl(jackUrlIn);
  if (jackAvatarUrl && !isSafePropertyPageImageUrl(jackAvatarUrl)) {
    return res.status(400).json({
      error: 'Invalid jackAvatarUrl. Use a path on this site (starting with /) or an https:// image URL.',
    });
  }
  const jackAvatarAlt =
    'jackAvatarAlt' in body
      ? String(body.jackAvatarAlt ?? '')
          .trim()
          .slice(0, 180)
          .replace(/[\u0000-\u001f\u007f]/g, '')
      : cur.jackAvatarAlt;

  const heroDecoTrIn =
    'heroDecoTopRightUrl' in body && typeof body.heroDecoTopRightUrl === 'string'
      ? body.heroDecoTopRightUrl.trim()
      : cur.heroDecoTopRightUrl;
  let heroDecoTopRightUrl = heroDecoTrIn === '' ? '' : rewriteLegacyImagesUrl(heroDecoTrIn);
  if (heroDecoTopRightUrl && !isSafePropertyPageImageUrl(heroDecoTopRightUrl)) {
    return res.status(400).json({
      error:
        'Invalid heroDecoTopRightUrl. Use a path on this site (starting with /) or an https:// image URL, or clear the field to hide.',
    });
  }

  const heroDecoBlIn =
    'heroDecoBottomLeftUrl' in body && typeof body.heroDecoBottomLeftUrl === 'string'
      ? body.heroDecoBottomLeftUrl.trim()
      : cur.heroDecoBottomLeftUrl;
  let heroDecoBottomLeftUrl = heroDecoBlIn === '' ? '' : rewriteLegacyImagesUrl(heroDecoBlIn);
  if (heroDecoBottomLeftUrl && !isSafePropertyPageImageUrl(heroDecoBottomLeftUrl)) {
    return res.status(400).json({
      error:
        'Invalid heroDecoBottomLeftUrl. Use a path on this site (starting with /) or an https:// image URL, or clear the field to hide.',
    });
  }

  function clampHeroDecoOpacityField(bodyVal, curVal) {
    const n = Number(bodyVal);
    if (!Number.isFinite(n)) return curVal;
    return Math.min(1, Math.max(0, n));
  }
  const heroDecoTopRightOpacity =
    'heroDecoTopRightOpacity' in body
      ? clampHeroDecoOpacityField(body.heroDecoTopRightOpacity, cur.heroDecoTopRightOpacity)
      : cur.heroDecoTopRightOpacity;
  const heroDecoBottomLeftOpacity =
    'heroDecoBottomLeftOpacity' in body
      ? clampHeroDecoOpacityField(body.heroDecoBottomLeftOpacity, cur.heroDecoBottomLeftOpacity)
      : cur.heroDecoBottomLeftOpacity;

  let nextIcons = cur.icons && typeof cur.icons === 'object' ? { ...cur.icons } : {};
  if ('icons' in body) {
    const incoming = body.icons;
    if (incoming === null) {
      nextIcons = {};
    } else if (typeof incoming === 'object' && incoming !== null && !Array.isArray(incoming)) {
      for (const [k0, v0] of Object.entries(incoming)) {
        const k = normalizeSiteIconKey(k0);
        if (!k) {
          return res.status(400).json({
            error: `Invalid icon key "${String(k0).slice(0, 80)}". Use letters, digits, hyphen, underscore (max 64 chars).`,
          });
        }
        const vs = String(v0 ?? '').trim();
        if (!vs) {
          delete nextIcons[k];
          continue;
        }
        if (/<svg[\s/>]/i.test(vs)) {
          const cleaned = sanitizeSiteIconSvgMarkup(vs);
          if (!cleaned) {
            return res.status(400).json({
              error: `Invalid or disallowed SVG for icon "${k}" (max ${SO_ICON_SVG_MAX_BYTES} bytes, must include an <svg> root).`,
            });
          }
          nextIcons[k] = cleaned;
        } else if (isSafePropertyPageImageUrl(vs)) {
          nextIcons[k] = vs;
        } else {
          return res.status(400).json({
            error: `Invalid icon value for "${k}". Use a path starting with / (no spaces) or an https:// image URL, or inline <svg>… markup.`,
          });
        }
        if (Object.keys(nextIcons).length > SO_ICON_MAX_KEYS) {
          return res.status(400).json({ error: `Too many icon keys (max ${SO_ICON_MAX_KEYS}).` });
        }
      }
    }
  }

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
    jackAvatarUrl,
    jackAvatarAlt,
    heroDecoTopRightUrl,
    heroDecoBottomLeftUrl,
    heroDecoTopRightOpacity,
    heroDecoBottomLeftOpacity,
    icons: nextIcons,
  };
  try {
    if (pgPool) {
      await saveSiteAppearanceJson(pgPool, next);
    } else {
      fs.writeFileSync(siteAppearancePath, JSON.stringify(next, null, 2) + '\n', 'utf8');
    }
    return res.json({ ok: true, ...next });
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Could not save site appearance.' });
  }
});

app.post('/api/admin/site-appearance/upload', requireAdmin, async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const rawB64 =
    typeof req.body?.imageBase64 === 'string'
      ? req.body.imageBase64.trim()
      : typeof req.body?.data === 'string'
        ? req.body.data.trim()
        : '';
  const cleaned = rawB64.replace(/^data:image\/\w+;base64,/i, '').replace(/\s/g, '');
  let buf;
  try {
    buf = Buffer.from(cleaned, 'base64');
  } catch {
    return res.status(400).json({ error: 'Invalid base64 image payload.' });
  }
  const maxBytes = 6 * 1024 * 1024;
  if (!buf.length || buf.length > maxBytes) {
    return res.status(400).json({ error: 'Image too large (max 6 MB).' });
  }
  const sniffed = sniffWritableSiteImage(buf);
  if (!sniffed) {
    return res.status(400).json({ error: 'Unsupported image type. Use PNG, JPEG, GIF, WebP, or SVG.' });
  }
  if (pgPool) {
    const id = crypto.randomUUID();
    const mimeType = mimeTypeForWritableSiteImageExt(sniffed.ext);
    try {
      await insertSiteUpload(pgPool, id, mimeType, buf);
      return res.json({ ok: true, url: `${SITE_UPLOAD_API_PREFIX}${id}`, bytes: buf.length });
    } catch (e) {
      return res.status(500).json({ error: e.message || 'Could not save uploaded file.' });
    }
  }
  if (POSTGRES_CONFIGURED_BUT_POOL_MISSING) {
    console.error(
      '[serviceopera] Site appearance upload refused: DATABASE_URL is set but Postgres pool is inactive. ' +
        'Fix startup DB errors, redeploy, then upload again (target: /api/site-uploads/<uuid>).'
    );
    return res.status(503).json({
      error:
        'Image uploads require a working database connection: DATABASE_URL is set but PostgreSQL failed at server startup. Check deploy logs for PostgreSQL init errors, fix DATABASE_URL or networking, redeploy, then try again.',
    });
  }
  console.warn(
    '[serviceopera] Site appearance upload: saving to public/assets/site-uploads/ (no active Postgres pool). ' +
      (RAILWAY_DEPLOY
        ? 'Railway’s filesystem is ephemeral — these files disappear on redeploy. Set DATABASE_URL on this Node service and redeploy so bytes live in site_uploads and URLs use /api/site-uploads/<uuid>.'
        : 'Without DATABASE_URL, new deploys or hosts without a volume will lose these files.')
  );
  const stamp = Date.now();
  const rand = crypto.randomBytes(4).toString('hex');
  const base = `su-${stamp}-${rand}.${sniffed.ext}`;
  const full = path.join(siteUploadsDir, base);
  try {
    fs.mkdirSync(siteUploadsDir, { recursive: true });
    fs.writeFileSync(full, buf);
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Could not save uploaded file.' });
  }
  return res.json({ ok: true, url: `${SITE_UPLOAD_PUBLIC_PREFIX}${base}`, bytes: buf.length });
});

/** Remove an upload: Postgres row (`/api/site-uploads/<uuid>`) when configured, else disk file under `public/assets/site-uploads/` (`su-*` only). */
app.post('/api/admin/site-appearance/delete-upload', requireAdmin, async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const url = typeof req.body?.url === 'string' ? req.body.url.trim() : '';
  const dbId = parseSiteUploadDbIdFromUrl(url);
  if (dbId && pgPool) {
    try {
      const deletedFromDatabase = await deleteSiteUpload(pgPool, dbId);
      return res.json({
        ok: true,
        deletedFromDisk: false,
        deletedFromDatabase,
        path: `${SITE_UPLOAD_API_PREFIX}${dbId}`,
      });
    } catch (e) {
      return res.status(500).json({ error: e.message || 'Could not delete upload.' });
    }
  }
  if (dbId && !pgPool) {
    return res.json({ ok: true, deletedFromDisk: false, deletedFromDatabase: false, reason: 'no_database' });
  }
  const base = parseSiteUploadDeletableBasenameFromUrl(url);
  if (!base) {
    return res.json({ ok: true, deletedFromDisk: false, reason: 'not_site_upload' });
  }
  const full = resolvedPathInsideSiteUploads(base);
  if (!full) return res.status(400).json({ error: 'Invalid upload path.' });
  let deletedFromDisk = false;
  try {
    if (fs.existsSync(full)) {
      fs.unlinkSync(full);
      deletedFromDisk = true;
    }
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Could not delete file.' });
  }
  return res.json({
    ok: true,
    deletedFromDisk,
    path: `${SITE_UPLOAD_PUBLIC_PREFIX}${base}`,
  });
});

app.get('/api/admin/report-catalog', requireAdmin, async (_req, res) => {
  try {
    const catalog = await buildReportCatalog();
    res.json({ ok: true, ...catalog });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Failed to load report catalog.' });
  }
});

app.get('/api/admin/audit-reports', requireAdmin, async (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const reports = await buildAuditReportsIndex();
    res.json({ ok: true, reports, generatedAt: new Date().toISOString() });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Failed to load audit reports.' });
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
          'This email has a registration in progress. Open the latest link from ServiceOpera in your inbox to finish choosing your password, or use “Resend registration link” on the registration page.',
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
      html: portalTransactionalEmailHtml(
        '<p style="font-family:system-ui,sans-serif;font-size:15px;color:#111">Your sign-in code for <strong>www.serviceopera.to</strong>:</p>' +
          '<p style="font-family:ui-monospace,monospace;font-size:28px;font-weight:700;letter-spacing:0.15em;color:#111">' +
          code +
          '</p>' +
          '<p style="font-family:system-ui,sans-serif;font-size:13px;color:#444">This code expires in 10 minutes. If you did not request it, you can ignore this email.</p>'
      ),
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
    return res.status(403).json({ error: 'Self-registration is disabled. Contact ' + operatorContactForErrors() + ' for access.' });
  }
  if (!RESEND_API_KEY) {
    return res.status(503).json({
      error:
        'Email confirmation requires RESEND_API_KEY on this server. Contact ' +
        operatorContactForErrors() +
        ' or ask your administrator to configure Resend.',
    });
  }
  const email = typeof req.body?.email === 'string' ? normalizeEmail(req.body.email) : '';
  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'Invalid email.' });
  }
  const pending = await userStore.findPendingByEmail(email);
  const generic = {
    ok: true,
    message: 'If that address has a pending registration, we sent a fresh link.',
  };
  if (!pending) {
    return res.json(generic);
  }
  const ip = clientIp(req);
  const sends = pruneSends(ip);
  if (sends.length >= MAX_SENDS_PER_WINDOW) {
    return res.status(429).json({ error: 'Too many requests. Try again later.' });
  }

  if (typeof userStore.issuePendingVerificationToken === 'function') {
    await userStore.issuePendingVerificationToken(pending.id);
  }
  const onboardJwt = signJwt({
    v: 1,
    role: 'user_onboard',
    sub: pending.id,
    email: pending.email,
    exp: Date.now() + CLINIC_VERIFY_JWT_MS,
  });
  const origin = publicOriginForEmail(req);
  const link = `${origin}/register.html?onboard=${encodeURIComponent(onboardJwt)}`;
  try {
    await sendResendEmail({
      to: pending.email,
      subject: 'ServiceOpera — continue your registration',
      html: portalTransactionalEmailHtml(
        '<p style="font-family:system-ui,sans-serif;font-size:15px;color:#111">Here is a fresh link to continue your <strong>www.serviceopera.to</strong> registration.</p>' +
          '<p style="font-family:system-ui,sans-serif;font-size:15px;color:#111"><a href="' +
          String(link).replace(/"/g, '&quot;') +
          '" style="color:#1e3a5f;font-weight:600">Continue registration</a> (link expires in 48 hours.)</p>' +
          '<p style="font-family:system-ui,sans-serif;font-size:13px;color:#444">If you did not register, ignore this email.</p>'
      ),
    });
    sends.push(Date.now());
    sendTimestampsByIp.set(ip, sends);
  } catch (e) {
    const status = e.status || 502;
    return res.status(status).json({
      error: resendFailureMessage(
        e,
        'Could not send confirmation email. Try again later or contact ' + operatorContactForErrors() + '.'
      ),
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
        'Password reset by email is not available on this server. Please contact ' +
        operatorContactForErrors() +
        ' to set a new password.',
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
      html: portalTransactionalEmailHtml(
        '<p style="font-family:system-ui,sans-serif;font-size:15px;color:#111">You asked to reset the password for your <strong>www.serviceopera.to</strong> account.</p>' +
          '<p style="font-family:system-ui,sans-serif;font-size:15px;color:#111"><a href="' +
          String(link).replace(/"/g, '&quot;') +
          '" style="color:#1e3a5f;font-weight:600">Reset password</a> (link expires in one hour.)</p>' +
          '<p style="font-family:system-ui,sans-serif;font-size:13px;color:#444">If you did not request this, ignore this email.</p>'
      ),
    });
    sends.push(Date.now());
    sendTimestampsByIp.set(ip, sends);
  } catch (e) {
    const status = e.status || 502;
    return res.status(status).json({
      error: resendFailureMessage(
        e,
        'Could not send email. Try again later or contact ' + operatorContactForErrors() + '.'
      ),
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

dualPost('/api/auth/user-complete-onboarding', '/api/auth/clinic-complete-onboarding', async (req, res) => {
  const token = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const confirm =
    typeof req.body?.confirmPassword === 'string'
      ? req.body.confirmPassword
      : typeof req.body?.confirm === 'string'
        ? req.body.confirm
        : '';
  const businessVertical =
    typeof req.body?.businessVertical === 'string'
      ? req.body.businessVertical
      : typeof req.body?.businessType === 'string'
        ? req.body.businessType
        : typeof req.body?.vertical === 'string'
          ? req.body.vertical
          : '';

  const p = verifyJwt(token);
  if (!p || !isPortalOnboardRole(p.role) || typeof p.sub !== 'string' || typeof p.email !== 'string') {
    return res.status(401).json({
      error: 'Invalid or expired registration link. Request a new link from the registration page.',
    });
  }

  const ip = clientIp(req);
  const posts = pruneOnboardingPosts(ip);
  if (posts.length >= MAX_ONBOARDING_POSTS_PER_WINDOW) {
    return res.status(429).json({ error: 'Too many requests. Try again later.' });
  }
  posts.push(Date.now());
  onboardingPostTimestampsByIp.set(ip, posts);

  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  }
  if (confirm && password !== confirm) {
    return res.status(400).json({ error: 'Passwords do not match.' });
  }
  if (typeof userStore.completePendingOnboarding !== 'function') {
    return res.status(501).json({ error: 'Registration onboarding is not available on this server.' });
  }
  try {
    const created = await userStore.completePendingOnboarding(p.sub, p.email, password, businessVertical);
    const sessionUser = {
      id: created.id,
      email: created.email,
      reportSlug: created.reportSlug,
      passwordMustChange: Boolean(created.passwordMustChange),
    };
    const sessionId = await recordPortalLogin(req, sessionUser);
    const portalToken = signPortalUserJwt(sessionUser);
    const reportUrl = '/clinics/report.html?slug=' + encodeURIComponent(sessionUser.reportSlug);
    return res.status(201).json({
      ok: true,
      token: portalToken,
      reportSlug: sessionUser.reportSlug,
      reportUrl,
      sessionId,
      passwordMustChange: false,
      message: 'Welcome — your account is ready.',
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
    if (!p || !isPortalSessionRole(p.role) || typeof p.email !== 'string')
      return res.status(401).json({ ok: false });
    const slug = typeof p.reportSlug === 'string' ? p.reportSlug : '';
    return res.json({
      ok: true,
      email: p.email,
      reportSlug: slug,
      passwordMustChange: Boolean(p.passwordMustChange),
    });
  }
);

/**
 * TODO(global-nav): optional access log for every anonymous HTML hit (today: POST
 * /api/marketing/lead-event for pricing funnel views, POST /api/auth/user-activity after portal login).
 */
/** Anonymous funnel beacon (pricing form views, etc.). Rate-limited per IP. */
app.post('/api/marketing/lead-event', async (req, res) => {
  const ip = clientIp(req);
  const hits = pruneLeadEventHits(ip);
  if (hits.length >= LEAD_EVENT_MAX_PER_IP) {
    return res.status(429).json({ error: 'Too many requests. Try again later.' });
  }
  const eventType = clipFreeText(req.body?.eventType, 120);
  const tier = clipFreeText(req.body?.tier, 40);
  const pagePath = clipFreeText(req.body?.path, 500);
  if (!eventType) {
    return res.status(400).json({ error: 'Missing eventType.' });
  }
  hits.push(Date.now());
  leadEventHitsByIp.set(ip, hits);
  try {
    await leadEventsStore.appendEvent({
      eventType,
      ip,
      pagePath: pagePath || null,
      tier: tier || null,
      userId: null,
      userAgent: clientUserAgent(req),
      detail: { ref: clipFreeText(req.body?.referrer, 500) },
    });
  } catch (e) {
    console.warn('[serviceopera] lead-event:', e && e.message ? e.message : e);
  }
  return res.json({ ok: true });
});

/**
 * Pricing tier request: lead-only — emails ops via Resend, logs lead_events.
 * Does not create a portal user or return a JWT (use /register or login separately).
 * POST /api/marketing/pricing-inquiry
 * Body: { plan, email, sector, improveFirst, source?, company_url? (honeypot) }
 * Legacy: improvement (alias for improveFirst); sector values property/properties accepted.
 */
app.post('/api/marketing/pricing-inquiry', async (req, res) => {
  if (inquiryHoneypotTripped(req.body)) {
    return res.json({
      ok: true,
      message: 'Thanks — your request was sent. ' + OPERATOR_IDENTITY + ' will follow up shortly.',
    });
  }
  if (!RESEND_API_KEY) {
    return res.status(503).json({
      error:
        'Request delivery is not configured on this server (missing RESEND_API_KEY). Try again after deploy or email ' +
        operatorContactForErrors() +
        '.',
    });
  }

  const ip = clientIp(req);
  const piHits = prunePricingInquiryHits(ip);
  if (piHits.length >= PRICING_INQUIRY_MAX_PER_IP) {
    return res.status(429).json({ error: 'Too many pricing requests from this network. Try again later.' });
  }
  piHits.push(Date.now());
  pricingInquiryHitsByIp.set(ip, piHits);

  const tier = parsePricingTier(req.body?.plan);
  if (!tier) {
    return res.status(400).json({ error: 'Invalid or missing plan (use free, operator, or white).' });
  }

  const emailRaw = typeof req.body?.email === 'string' ? req.body.email : '';
  if (!isValidInquiryEmail(emailRaw)) {
    return res.status(400).json({ error: 'Enter a valid work email address.' });
  }

  const sectorSlug = normalizeInquirySector(req.body?.sector);
  if (!sectorSlug) {
    return res.status(400).json({ error: 'Choose a sector: hotels, clinics, property, or other.' });
  }

  const improveFirst = clipImproveFirst(req.body);
  if (!improveFirst) {
    return res.status(400).json({ error: 'Tell us what we should improve first.' });
  }

  const source = clipFreeText(req.body?.source, 200);
  const email = normalizeEmail(emailRaw);

  const tierLabel =
    tier === 'free' ? 'Free Audit' : tier === 'operator' ? 'Operator' : 'White-Glove';
  const sectorHuman = inquirySectorLabel(sectorSlug);
  const subject = `ServiceOpera request · ${tierLabel} · ${email}`;
  const html =
    '<div style="font-family:system-ui,sans-serif;font-size:15px;color:#111;line-height:1.55">' +
    '<p><strong>Pricing / tier request</strong> · ' +
    escapeHtml(tierLabel) +
    '</p>' +
    '<p><strong>Work email:</strong> ' +
    escapeHtml(email) +
    '</p>' +
    '<p><strong>Sector:</strong> ' +
    escapeHtml(sectorHuman) +
    '</p>' +
    '<p><strong>What should we improve first?</strong><br>' +
    escapeHtml(improveFirst).replace(/\n/g, '<br>') +
    '</p>' +
    (source ? '<p><strong>Source:</strong> ' + escapeHtml(source) + '</p>' : '') +
    '<p style="font-size:13px;color:#444">IP: ' +
    escapeHtml(ip) +
    '</p>' +
    '</div>';

  const sends = pruneSends(ip);
  if (sends.length >= MAX_SENDS_PER_WINDOW) {
    return res.status(429).json({ error: 'Too many outbound emails from this network. Try again in a few minutes.' });
  }

  let emailedAdmin = false;
  try {
    await sendResendEmail({ to: ADMIN_EMAIL, subject, html });
    sends.push(Date.now());
    sendTimestampsByIp.set(ip, sends);
    emailedAdmin = true;
  } catch (e) {
    const status = e.status || 502;
    return res.status(status).json({
      error: resendFailureMessage(
        e,
        'Could not send your request. Try again later or contact ' + operatorContactForErrors() + '.'
      ),
    });
  }

  try {
    await leadEventsStore.appendEvent({
      eventType: 'pricing_inquiry_success',
      ip,
      pagePath: '/pricing/inquiry',
      tier,
      userId: null,
      userAgent: clientUserAgent(req),
      detail: { emailedAdmin, sector: sectorSlug, tier },
    });
  } catch (e) {
    console.warn('[serviceopera] pricing-inquiry success log:', e && e.message ? e.message : e);
  }

  return res.json({
    ok: true,
    emailedAdmin,
    message: 'Thanks — your request was sent. ' + OPERATOR_IDENTITY + ' will follow up shortly.',
  });
});

/**
 * Site marketing inquiry (reports.html, vertical pages): lead email to admin only.
 * POST /api/marketing/inquiry
 * Body: { email, sector, improveFirst, topic?, source?, company_url? (honeypot) }
 * Legacy: improvement (alias for improveFirst).
 */
app.post('/api/marketing/inquiry', async (req, res) => {
  if (inquiryHoneypotTripped(req.body)) {
    return res.json({
      ok: true,
      message: 'Thanks — your inquiry was sent. ' + OPERATOR_IDENTITY + ' will follow up shortly.',
    });
  }
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

  const emailRaw = typeof req.body?.email === 'string' ? req.body.email : '';
  if (!isValidInquiryEmail(emailRaw)) {
    return res.status(400).json({ error: 'Enter a valid work email address.' });
  }

  const sectorSlug = normalizeInquirySector(req.body?.sector);
  if (!sectorSlug) {
    return res.status(400).json({ error: 'Choose a sector: hotels, clinics, property, or other.' });
  }

  const improveFirst = clipImproveFirst(req.body);
  if (!improveFirst) {
    return res.status(400).json({ error: 'Tell us what we should improve first.' });
  }

  const topic = clipFreeText(req.body?.topic, 120);
  const source = clipFreeText(req.body?.source, 200);
  const email = normalizeEmail(emailRaw);
  const sectorHuman = inquirySectorLabel(sectorSlug);

  const subject = topic ? `ServiceOpera inquiry: ${topic} · ${email}` : `ServiceOpera inquiry · ${email}`;
  const html =
    '<div style="font-family:system-ui,sans-serif;font-size:15px;color:#111;line-height:1.55">' +
    '<p><strong>New site inquiry</strong></p>' +
    '<p><strong>Work email:</strong> ' +
    escapeHtml(email) +
    '</p>' +
    '<p><strong>Sector:</strong> ' +
    escapeHtml(sectorHuman) +
    '</p>' +
    '<p><strong>What should we improve first?</strong><br>' +
    escapeHtml(improveFirst).replace(/\n/g, '<br>') +
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

  try {
    await leadEventsStore.appendEvent({
      eventType: 'site_inquiry_success',
      ip,
      pagePath: source || null,
      tier: null,
      userId: null,
      userAgent: clientUserAgent(req),
      detail: { topic: topic || null, sector: sectorSlug },
    });
  } catch (e) {
    console.warn('[serviceopera] site inquiry lead log:', e && e.message ? e.message : e);
  }

  return res.json({
    ok: true,
    message: 'Thanks — your inquiry was sent. ' + OPERATOR_IDENTITY + ' will follow up shortly.',
  });
});

/**
 * Google Places API (New) — Text Search lead collector (API key server-side only).
 * POST /api/places/search { "query": "...", "category": "clinic" | "hotel" | "real_estate" }
 * Requires admin JWT (same as other /api/admin/* tools).
 */
app.post('/api/places/search', requireAdmin, async (req, res) => {
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

app.get('/logo.png', async (_req, res) => {
  try {
    const merged = mergeSiteAppearance(await readSiteAppearanceRawAsync());
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

/** Clean URL — express.static does not map `/pricing` to `pricing.html`. */
app.get(['/pricing', '/pricing/'], (_req, res) => {
  res.sendFile(path.join(publicDir, 'pricing.html'));
});

/** Pricing tier inquiry form (`?plan=free|operator|white`). */
app.get(['/pricing/inquiry', '/pricing/inquiry/'], (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.sendFile(path.join(publicDir, 'pricing-inquiry.html'));
});

/** SEO hub: AI operations verticals (same document as long filename; canonical `/ai-operations/`). */
app.get(['/ai-operations', '/ai-operations/'], (_req, res) => {
  res.sendFile(path.join(publicDir, 'ai-operations-for-hotels-clinics-property.html'));
});

app.get('/ai-operations-for-hotels-clinics-property.html', (_req, res) => {
  res.redirect(301, '/ai-operations/');
});

/** Retired marketing page — bookmarks and external links go to canonical pricing. */
app.get(['/engagement.html', '/engagement', '/engagement/'], (_req, res) => {
  res.redirect(301, '/pricing');
});

/** Operator console: path-based sections (same document as admin.html; see public/admin.js). */
const adminHtmlPath = path.join(publicDir, 'admin.html');
function sendAdminHtml(_req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.sendFile(adminHtmlPath);
}
app.get(['/admin', '/admin/'], (_req, res) => {
  res.redirect(302, '/admin/users');
});
app.get(
  [
    '/admin/users',
    '/admin/users/',
    '/admin/activity',
    '/admin/activity/',
    '/admin/deploy-log',
    '/admin/deploy-log/',
    '/admin/site-appearance',
    '/admin/site-appearance/',
    '/admin/icons',
    '/admin/icons/',
    '/admin/user-reports',
    '/admin/user-reports/',
    '/admin/user-profiling',
    '/admin/user-profiling/',
    '/admin/report-catalog',
    '/admin/report-catalog/',
  ],
  sendAdminHtml
);

const operatorReportsHtmlPath = path.join(publicDir, 'operator', 'reports.html');
app.get(['/operator/reports', '/operator/reports/'], (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.sendFile(operatorReportsHtmlPath);
});

/** Retired public path — Places tooling is admin-only (see /operator/places-leads.html + admin nav). */
app.get(['/places-leads.html', '/places-leads', '/places-leads/'], (_req, res) => {
  const p404 = path.join(publicDir, '404.html');
  if (fs.existsSync(p404)) return res.status(404).sendFile(p404);
  return res.status(404).type('text/plain').send('Not found');
});

function isValidPlacesPageDocumentJwt(token) {
  const p = verifyJwt(token);
  return Boolean(p && p.kind === 'places_page');
}

app.get(['/operator/places-leads.html', '/operator/places-leads', '/operator/places-leads/'], (req, res) => {
  const raw = typeof req.query.t === 'string' ? req.query.t.trim() : '';
  if (!raw || !isValidPlacesPageDocumentJwt(raw)) {
    const p404 = path.join(publicDir, '404.html');
    if (fs.existsSync(p404)) return res.status(404).sendFile(p404);
    return res.status(404).type('text/plain').send('Not found');
  }
  if (!fs.existsSync(placesLeadsOperatorHtmlPath)) {
    return res.status(500).type('text/plain').send('Places tool page missing on server.');
  }
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  return res.sendFile(placesLeadsOperatorHtmlPath);
});

/** Legacy report slugs → numbered catalog IDs (301). */
const LEGACY_REPORT_REDIRECTS = [
  ['/clinics/sample-ai-automation-audit', '/clinics/001/'],
  ['/clinics/sea-clinic-audit', '/clinics/002/'],
  ['/clinics/2026-05-15-audit', '/clinics/003/'],
  ['/clinics/dental-design-center-audit', '/clinics/004/'],
  ['/clinics/demo.html', '/clinics/005/'],
  ['/clinics/ai-automation-audit-sample-bangkok.html', '/clinics/006/'],
  ['/clinics/operato-clinic-audit-sample.html', '/clinics/007/'],
  ['/clinics/case-study-lumina-dental-group', '/clinics/008/'],
  ['/hotels/melia-pattaya-audit', '/hotels/009/'],
  ['/clinics/sample-audit-teaser', '/clinics/010/'],
  ['/clinics/sample-audit-teaser-011', '/clinics/011/'],
];
for (const [from, to] of LEGACY_REPORT_REDIRECTS) {
  app.get([from, `${from}/`], (_req, res) => res.redirect(301, to));
}

/** Numbered audit reports — admin session required on Node. 010 is public (home funnel “See what you'll get”). */
const PRIVATE_CLINIC_REPORT_IDS = new Set(['001', '002', '003', '004', '005', '006', '007', '008', '011']);
const PRIVATE_HOTEL_REPORT_IDS = new Set(['009']);

function matchPrivateNumberedReportPath(pathname) {
  const c = pathname.match(/^\/clinics\/(\d{3})(\/.*)?$/);
  if (c && PRIVATE_CLINIC_REPORT_IDS.has(c[1])) {
    return { vertical: 'clinics', id: c[1] };
  }
  const h = pathname.match(/^\/hotels\/(\d{3})(\/.*)?$/);
  if (h && PRIVATE_HOTEL_REPORT_IDS.has(h[1])) {
    return { vertical: 'hotels', id: h[1] };
  }
  return null;
}

function sendPrivateReportNotFound(res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  const p404 = path.join(publicDir, '404.html');
  if (fs.existsSync(p404)) return res.status(404).sendFile(p404);
  return res.status(404).type('text/plain').send('Not found');
}

function denyPrivateNumberedReport(req, res) {
  const accept = String(req.headers.accept || '');
  const wantsHtml = req.method === 'GET' && accept.includes('text/html');
  const targetPath = req.originalUrl || req.path || '/';
  if (wantsHtml) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    const next = encodeURIComponent(targetPath);
    return res.redirect(302, `/admin/users?next=${next}`);
  }
  return sendPrivateReportNotFound(res);
}

app.use((req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  if (!matchPrivateNumberedReportPath(req.path)) return next();
  if (!getVerifiedAdmin(req)) return denyPrivateNumberedReport(req, res);
  return next();
});

function isNoindexClinicsOrHotelsPath(norm) {
  return norm.includes('/clinics/') || norm.includes('/hotels/');
}

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
        filePath.endsWith('admin.html') ||
        filePath.endsWith('admin.js') ||
        norm.endsWith('app-version.json') ||
        norm.endsWith('operator/places-leads.html') ||
        filePath.endsWith('places-leads.html') ||
        filePath.endsWith('pricing-inquiry.html') ||
        norm.includes('/clinics/report.html') ||
        isNoindexClinicsOrHotelsPath(norm) ||
        norm.includes('/operator/') ||
        norm.includes('/reports/catalog.html')
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
      ? '[serviceopera] Resend: RESEND_API_KEY is set (portal email: sign-up / forgot-password / optional login OTP).'
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
      ? '[serviceopera] Google Places: GOOGLE_MAPS_API_KEY is set (POST /api/places/search, admin JWT only).'
      : '[serviceopera] Google Places: GOOGLE_MAPS_API_KEY missing — /api/places/search will return 503 until set.'
  );
});
