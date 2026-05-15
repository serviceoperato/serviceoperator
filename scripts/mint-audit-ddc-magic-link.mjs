#!/usr/bin/env node
/**
 * Mint a signed magic-link JWT for the Dental Design Center audit portal user.
 * Uses the same algorithm and secret as server.mjs (PORTAL_JWT_SECRET or ADMIN_JWT_SECRET).
 *
 * Usage:
 *   PORTAL_JWT_SECRET=... node scripts/mint-audit-ddc-magic-link.mjs user@example.com
 *   PUBLIC_ORIGIN=https://www.serviceopera.to node scripts/mint-audit-ddc-magic-link.mjs user@example.com
 *
 * Env:
 *   PORTAL_JWT_SECRET | ADMIN_JWT_SECRET — required (same as production API)
 *   PUBLIC_ORIGIN — optional; prefix for the printed URL (default https://www.serviceopera.to)
 *   AUDIT_DDC_MAGIC_TTL_MS — optional override (default 7d, max 30d enforced on mint)
 *   AUDIT_DDC_REPORT_SLUG — must match the portal user's reportSlug (default 004)
 */
import crypto from 'crypto';

function signJwt(secret, payload) {
  const exp =
    typeof payload.exp === 'number' ? payload.exp : Date.now() + 8 * 60 * 60 * 1000;
  const body = Buffer.from(JSON.stringify({ ...payload, exp }), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function normalizeEmail(s) {
  return String(s || '')
    .trim()
    .toLowerCase();
}

const secret = (process.env.PORTAL_JWT_SECRET || process.env.ADMIN_JWT_SECRET || '').trim();
if (!secret) {
  console.error('[mint-audit-ddc-magic-link] Set PORTAL_JWT_SECRET or ADMIN_JWT_SECRET.');
  process.exit(1);
}

const emailArg = process.argv[2];
const email = normalizeEmail(emailArg || process.env.AUDIT_DDC_EMAIL || '');
if (!email || !email.includes('@')) {
  console.error('[mint-audit-ddc-magic-link] Usage: node scripts/mint-audit-ddc-magic-link.mjs <email>');
  process.exit(1);
}

const slug = (process.env.AUDIT_DDC_REPORT_SLUG || '004').trim() || '004';
const ttlRaw = Number(process.env.AUDIT_DDC_MAGIC_TTL_MS || 7 * 24 * 60 * 60 * 1000);
const ttl =
  Number.isFinite(ttlRaw) && ttlRaw >= 5 * 60 * 1000 && ttlRaw <= 30 * 24 * 60 * 60 * 1000
    ? ttlRaw
    : 7 * 24 * 60 * 60 * 1000;

const payload = {
  v: 1,
  role: 'audit_dd_magic',
  aud: 'audit-ddc',
  sub: email,
  exp: Date.now() + ttl,
};

const token = signJwt(secret, payload);
const origin = (process.env.PUBLIC_ORIGIN || 'https://www.serviceopera.to').trim().replace(/\/$/, '');
const path = `/clinics/${slug}/`;
const url = `${origin}${path}?access=${encodeURIComponent(token)}`;

console.log('');
console.log('Magic link (expires in', Math.round(ttl / 86400000), 'days unless AUDIT_DDC_MAGIC_TTL_MS set):');
console.log(url);
console.log('');
console.log('Notes: link is not single-use; anyone with the URL can sign in until expiry or JWT secret rotation.');
console.log('');
