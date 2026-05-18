import crypto from 'crypto';

function safeEqualString(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/**
 * Map username → { password, slug, business } from DEMO_PORTAL_ACCOUNTS (JSON object).
 * Never commit passwords; set on Railway / local env only.
 */
export function loadDemoPortalAccounts() {
  const raw = (process.env.DEMO_PORTAL_ACCOUNTS || '').trim();
  if (!raw) return null;
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.error('[serviceopera] DEMO_PORTAL_ACCOUNTS is not valid JSON');
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const map = new Map();
  for (const [username, entry] of Object.entries(parsed)) {
    const key = String(username).trim().toLowerCase();
    if (!key || !entry || typeof entry !== 'object') continue;
    const password = String(entry.password || '').trim();
    const slug = String(entry.slug || key).trim();
    const business = String(entry.business || '').trim();
    if (!password || !business) continue;
    map.set(key, { password, slug, business });
  }
  return map.size ? map : null;
}

export function isDemoPortalConfigured(accounts) {
  return Boolean(accounts && accounts.size > 0);
}

/** @returns {{ slug: string, business: string } | null} */
export function verifyDemoPortalLogin(accounts, username, password) {
  if (!accounts) return null;
  const key = String(username || '').trim().toLowerCase();
  const rec = accounts.get(key);
  if (!rec) return null;
  if (!safeEqualString(rec.password, String(password || '').trim())) return null;
  return { slug: rec.slug, business: rec.business };
}
