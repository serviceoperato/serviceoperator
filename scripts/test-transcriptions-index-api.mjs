#!/usr/bin/env node
/**
 * Probe GET /api/admin/transcriptions/index (and legacy fallback).
 *
 * Usage:
 *   node scripts/test-transcriptions-index-api.mjs
 *   node scripts/test-transcriptions-index-api.mjs https://www.serviceopera.to
 *   ADMIN_JWT=eyJ... node scripts/test-transcriptions-index-api.mjs http://127.0.0.1:3000
 *
 * Expected (200): JSON with ok, items[], totals/counts, generatedAt.
 */
const base = (process.argv[2] || 'http://127.0.0.1:3000').replace(/\/+$/, '');
const token = (process.env.ADMIN_JWT || process.env.SO_ADMIN_JWT || '').trim();

const paths = ['/api/admin/transcriptions/index', '/api/admin/transcriptions-index'];

async function probe(path) {
  const url = base + path;
  const headers = token ? { Authorization: 'Bearer ' + token } : {};
  const t0 = Date.now();
  let res;
  try {
    res = await fetch(url, { headers, cache: 'no-store' });
  } catch (err) {
    console.log('FAIL', path, 'network', err.message || err);
    return;
  }
  const ms = Date.now() - t0;
  let body = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  const items = body && Array.isArray(body.items) ? body.items.length : 'n/a';
  const total =
    body && body.totals && body.totals.total != null
      ? body.totals.total
      : body && body.counts && body.counts.total != null
        ? body.counts.total
        : 'n/a';
  console.log(
    res.ok ? 'OK  ' : 'ERR ',
    path,
    'HTTP',
    res.status,
    ms + 'ms',
    'items=' + items,
    'totals.total=' + total,
    body && body.error ? 'error=' + body.error : ''
  );
}

console.log('Base:', base, token ? '(Bearer set)' : '(no ADMIN_JWT — expect 401)');
for (const p of paths) {
  await probe(p);
}
