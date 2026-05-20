/**
 * Overrides legacy so-api.js on split Railway frontend / serviceopera.to so /api/*
 * stays same-origin (HttpOnly operator cookies). Load immediately after so-api.js.
 */
(function (g) {
  'use strict';

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

  if (!usesSameOriginProxiedApi()) return;

  g.soApiOrigin = function () {
    return '';
  };

  g.soApiUrl = function (path) {
    var p = typeof path === 'string' ? path : '';
    if (!p || p.charAt(0) !== '/') return p;
    return p;
  };

  g.soApiCredentials = function () {
    return 'include';
  };

  g.soUsesSameOriginProxiedApi = usesSameOriginProxiedApi;
  g.soIsMarketingNodeHost = usesSameOriginProxiedApi;
})(typeof window !== 'undefined' ? window : globalThis);
