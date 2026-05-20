/**
 * When the marketing site is static-only on one hostname and the Node API runs on another,
 * set the API base so /api/* requests hit the backend. Override with window.__SO_API_ORIGIN__
 * or <meta name="so-api-origin" content="https://your-api.example"> before this script.
 */
(function (g) {
  'use strict';

  /**
   * Hosts where server.mjs serves HTML and proxies /api/* on the same origin (split Railway
   * frontend, or apex Node). HttpOnly operator/portal cookies must use same-origin /api here.
   */
  function usesSameOriginProxiedApi() {
    try {
      var h = g.location && g.location.hostname ? String(g.location.hostname).toLowerCase() : '';
      if (!h) return false;
      if (h === 'serviceopera.to' || h === 'www.serviceopera.to') return true;
      if (h === 'serviceoperato-frontend-production.up.railway.app') return true;
      return /^[\w-]+-frontend[\w.-]*\.up\.railway\.app$/.test(h);
    } catch (e) {
      return false;
    }
  }

  /** @deprecated alias */
  function isMarketingNodeHost() {
    return usesSameOriginProxiedApi();
  }

  function metaOrigin() {
    try {
      if (usesSameOriginProxiedApi()) return '';
      var m = document.querySelector('meta[name="so-api-origin"]');
      if (m && m.getAttribute('content')) {
        var c = m.getAttribute('content').trim();
        if (c) return c.replace(/\/+$/, '');
      }
    } catch (e) {}
    return '';
  }

  function origin() {
    if (typeof g.__SO_API_ORIGIN__ === 'string' && g.__SO_API_ORIGIN__.trim()) {
      return g.__SO_API_ORIGIN__.trim().replace(/\/+$/, '');
    }
    if (usesSameOriginProxiedApi()) return '';
    var mo = metaOrigin();
    if (mo) return mo;
    return '';
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
    if (!o) return 'include';
    try {
      if (new URL(o).origin === g.location.origin) return 'include';
    } catch (e) {}
    return 'omit';
  };

  g.soUsesSameOriginProxiedApi = usesSameOriginProxiedApi;
  g.soIsMarketingNodeHost = isMarketingNodeHost;
})(typeof window !== 'undefined' ? window : globalThis);
