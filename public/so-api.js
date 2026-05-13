/**
 * When the marketing site is static-only on one hostname and the Node API runs on another,
 * set the API base so /api/* requests hit the backend. Override with window.__SO_API_ORIGIN__
 * or <meta name="so-api-origin" content="https://your-api.example"> before this script.
 */
(function (g) {
  'use strict';

  function metaOrigin() {
    try {
      var m = document.querySelector('meta[name="so-api-origin"]');
      if (m && m.getAttribute('content')) {
        var c = m.getAttribute('content').trim();
        if (c) return c.replace(/\/+$/, '');
      }
    } catch (e) {}
    return '';
  }

  function inferRailwaySplit() {
    try {
      var h = g.location && g.location.hostname ? String(g.location.hostname) : '';
      if (/^serviceoperato-frontend-production\.up\.railway\.app$/i.test(h)) {
        return 'https://serviceoperato-backend-production.up.railway.app';
      }
    } catch (e2) {}
    return '';
  }

  function origin() {
    if (typeof g.__SO_API_ORIGIN__ === 'string' && g.__SO_API_ORIGIN__.trim()) {
      return g.__SO_API_ORIGIN__.trim().replace(/\/+$/, '');
    }
    var mo = metaOrigin();
    if (mo) return mo;
    return inferRailwaySplit();
  }

  g.soApiOrigin = function () {
    return origin();
  };

  g.soApiUrl = function (path) {
    var p = typeof path === 'string' ? path : '';
    if (!p || p.charAt(0) !== '/') return p;
    var o = origin();
    if (!o) return p;
    return o + p;
  };

  g.soApiCredentials = function () {
    var o = origin();
    if (!o) return 'same-origin';
    try {
      if (new URL(o).origin === g.location.origin) return 'same-origin';
    } catch (e) {}
    return 'omit';
  };
})(typeof window !== 'undefined' ? window : globalThis);
