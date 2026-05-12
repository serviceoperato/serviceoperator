/**
 * Example Cloudflare Worker: relay every request from your Workers/Pages hostname to Node (e.g. Railway).
 *
 * Use when the browser speaks to `*.workers.dev` but Express lives on another origin — **GET alone is not enough**:
 * you must preserve method + body (`fetch(destination, request)` or `new Request(destination, request)`).
 *
 * Wrangler secrets / vars:
 *   ORIGIN_URL = https://YOUR-SERVICE.up.railway.app   (no trailing slash)
 *
 * If **GET** `/api/auth/clinic-capabilities` succeeds but **POST** `/api/auth/clinic-register` returns **502** from
 * Cloudflare (HTML “Bad gateway”), common causes:
 * - Upstream fetch uses a truncated timeout while `clinic-register` waits on Resend (often a few seconds).
 * - Wrong `ORIGIN_URL`, TLS/DNS failures, or Railway sleeping (cold start) combined with impatient retries.
 * - Custom Worker code forwards GET but not POST/body correctly — compare against this minimal forwarder.
 */

export default {
  async fetch(request, env, ctx) {
    const base = String(env.ORIGIN_URL || env.RAILWAY_ORIGIN || '').trim().replace(/\/$/, '');
    if (!base) {
      return new Response('Worker misconfigured: set ORIGIN_URL to your Railway (or Node) base URL.', {
        status: 503,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }

    const incoming = new URL(request.url);
    const destination = new URL(incoming.pathname + incoming.search, base);

    const relay = new Request(destination.toString(), request);

    return fetch(relay, {
      cf: { cacheTtl: 0, cacheEverything: false },
    });
  },
};
