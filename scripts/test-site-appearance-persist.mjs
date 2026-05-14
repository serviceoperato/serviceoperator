/**
 * Regression tests for site appearance persistence semantics.
 * Run: node scripts/test-site-appearance-persist.mjs
 * (Also wired as npm run test:site-appearance)
 */
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

/** Mirrors public/admin.js `siteAppearanceResolveUrl` (upload paths → API origin when cross-origin). */
function siteAppearanceResolveUrlForTest(raw, ctx) {
  var u = String(raw || '').trim();
  if (!u) return '';
  if (/^https?:\/\//i.test(u)) return u;
  if (u.charAt(0) !== '/') return u;
  var prefixes = ['/assets/site-uploads/', '/api/site-uploads/'];
  var pageOrigin = ctx.pageOrigin || '';
  var apiOrigin = String(ctx.apiOrigin || '')
    .trim()
    .replace(/\/+$/, '');
  for (var i = 0; i < prefixes.length; i++) {
    if (u.indexOf(prefixes[i]) === 0 && apiOrigin && /^https?:\/\//i.test(apiOrigin) && pageOrigin) {
      if (new URL(apiOrigin).origin !== new URL(pageOrigin).origin) return apiOrigin + u;
    }
  }
  return pageOrigin + u;
}

/** Mirrors server.mjs PUT hero-deco URL merge (partial body must not clear the other corner). */
function mergeHeroDecoUrlsFromPut(cur, body) {
  const heroDecoTrIn =
    'heroDecoTopRightUrl' in body && typeof body.heroDecoTopRightUrl === 'string'
      ? body.heroDecoTopRightUrl.trim()
      : cur.heroDecoTopRightUrl;
  const heroDecoTopRightUrl = heroDecoTrIn === '' ? '' : heroDecoTrIn;
  const heroDecoBlIn =
    'heroDecoBottomLeftUrl' in body && typeof body.heroDecoBottomLeftUrl === 'string'
      ? body.heroDecoBottomLeftUrl.trim()
      : cur.heroDecoBottomLeftUrl;
  const heroDecoBottomLeftUrl = heroDecoBlIn === '' ? '' : heroDecoBlIn;
  return { heroDecoTopRightUrl, heroDecoBottomLeftUrl };
}

assert.equal(
  siteAppearanceResolveUrlForTest('/assets/site-uploads/su-1-abcdef00.png', {
    pageOrigin: 'https://www.example.com',
    apiOrigin: 'https://api.example.com',
  }),
  'https://api.example.com/assets/site-uploads/su-1-abcdef00.png'
);

assert.equal(
  siteAppearanceResolveUrlForTest('/api/site-uploads/550e8400-e29b-41d4-a716-446655440000', {
    pageOrigin: 'https://www.example.com',
    apiOrigin: 'https://api.example.com',
  }),
  'https://api.example.com/api/site-uploads/550e8400-e29b-41d4-a716-446655440000'
);

assert.equal(
  siteAppearanceResolveUrlForTest('/assets/hero-corner-arc.svg', {
    pageOrigin: 'https://www.example.com',
    apiOrigin: 'https://api.example.com',
  }),
  'https://www.example.com/assets/hero-corner-arc.svg'
);

const cur = {
  heroDecoTopRightUrl: 'https://cdn.example/tr.png',
  heroDecoBottomLeftUrl: 'https://cdn.example/bl-old.png',
};
const out = mergeHeroDecoUrlsFromPut(cur, { heroDecoBottomLeftUrl: 'https://cdn.example/bl-new.png' });
assert.equal(out.heroDecoTopRightUrl, 'https://cdn.example/tr.png');
assert.equal(out.heroDecoBottomLeftUrl, 'https://cdn.example/bl-new.png');

const cleared = mergeHeroDecoUrlsFromPut(cur, { heroDecoTopRightUrl: '' });
assert.equal(cleared.heroDecoTopRightUrl, '');
assert.equal(cleared.heroDecoBottomLeftUrl, cur.heroDecoBottomLeftUrl);

/* Simulated on-disk document: partial PUT updates one key, other hero URL preserved after rewrite. */
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'so-sa-appearance-'));
const fp = path.join(tmp, 'site-appearance.json');
const initial = {
  heroDecoTopRightUrl: 'https://cdn.example/tr.png',
  heroDecoBottomLeftUrl: 'https://cdn.example/bl-v1.png',
  navLogoUrl: '/assets/logo.png',
};
fs.writeFileSync(fp, JSON.stringify(initial, null, 2) + '\n', 'utf8');
const fromDisk = JSON.parse(fs.readFileSync(fp, 'utf8'));
const putBody = { heroDecoBottomLeftUrl: 'https://cdn.example/bl-v2.png' };
const mergedUrls = mergeHeroDecoUrlsFromPut(fromDisk, putBody);
const nextOnDisk = { ...fromDisk, ...mergedUrls };
fs.writeFileSync(fp, JSON.stringify(nextOnDisk, null, 2) + '\n', 'utf8');
const after = JSON.parse(fs.readFileSync(fp, 'utf8'));
assert.equal(after.heroDecoTopRightUrl, initial.heroDecoTopRightUrl);
assert.equal(after.heroDecoBottomLeftUrl, 'https://cdn.example/bl-v2.png');

console.log('test-site-appearance-persist: ok');
