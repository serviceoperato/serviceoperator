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

  /** Production Node API (Railway). Marketing static/custom domains must point /api here or use meta / __SO_API_ORIGIN__. */
  var SO_PRODUCTION_API_ORIGIN = 'https://serviceoperato-backend-production.up.railway.app';

  function inferRailwaySplit() {
    try {
      var h = g.location && g.location.hostname ? String(g.location.hostname).toLowerCase() : '';
      if (!h) return '';
      if (h === 'serviceoperato-frontend-production.up.railway.app') {
        return SO_PRODUCTION_API_ORIGIN;
      }
      /*
       * Any Railway frontend service on *.up.railway.app matching *-frontend*… → sibling *-backend*…
       * (e.g. preview deploys or renamed services; production pair still matched above).
       */
      var split = /^([\w-]+)-frontend([\w.-]*)\.up\.railway\.app$/.exec(h);
      if (split) {
        return 'https://' + split[1] + '-backend' + (split[2] || '') + '.up.railway.app';
      }
      /*
       * serviceopera.to / www.serviceopera.to run Node (server.mjs) on the same host as HTML.
       * Use same-origin /api so admin login sets the HttpOnly cookie on this host (required for
       * private /clinics/NNN/ HTML after ?next= redirect). Static-only Netlify on a custom domain:
       * add <meta name="so-api-origin" content="https://your-node-host"> before so-api.js.
       */
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
