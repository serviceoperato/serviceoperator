/**
 * Portal post-auth routing: Login/Register → Workspace (default) → Report.
 * Preserves safe ?next= deep links; never loops through login/register/workspace.
 */
(function (g) {
  'use strict';

  var WORKSPACE_PATH = '/workspace.html';
  var WORKSPACE_CANONICAL = '/workspace';

  function normalizePath(p) {
    var s = String(p || '').trim();
    if (!s) return '';
    return s.charAt(0) === '/' ? s : '/' + s;
  }

  function isLoopPath(path) {
    var nl = String(path || '').toLowerCase();
    return (
      /^\/login(\.html)?(\/|$|\?|#)/.test(nl) ||
      /^\/register(\.html)?(\/|$|\?|#)/.test(nl) ||
      /^\/workspace(\.html)?(\/|$|\?|#)/.test(nl)
    );
  }

  function isSafeNextPath(path) {
    if (!path || path.charAt(0) !== '/' || path.indexOf('//') === 0) return false;
    return !isLoopPath(path);
  }

  function reportUrlFromLj(lj, slugHint) {
    var slug =
      (lj && lj.reportSlug ? String(lj.reportSlug).trim() : '') ||
      (slugHint ? String(slugHint).trim() : '');
    if (lj && lj.reportUrl) {
      var u = String(lj.reportUrl).trim();
      if (u) return normalizePath(u);
    }
    if (slug) return '/clinics/report.html?slug=' + encodeURIComponent(slug);
    return '';
  }

  function isBrokenReportDest(dest) {
    if (dest.indexOf('/clinics/report.html') !== 0) return false;
    var m = /[?&]slug=([^&]+)/.exec(dest);
    return !m || !String(m[1] || '').trim() || m[1] === 'undefined';
  }

  /**
   * @param {{ reportSlug?: string, reportUrl?: string }} lj Login/onboarding JSON
   * @param {{ nextPath?: string, slugHint?: string }} opts
   * @returns {string} Same-origin path (and query/hash when present on next)
   */
  function resolvePostLoginDestination(lj, opts) {
    opts = opts || {};
    var nextPath = (opts.nextPath || '').trim();
    var slugHint = (opts.slugHint || '').trim();
    var dest = '';

    if (isSafeNextPath(nextPath)) {
      if (/^\/admin\.html$/i.test(nextPath) || /^\/admin(\/|$)/i.test(nextPath)) {
        var reportAdminNext = reportUrlFromLj(lj, slugHint);
        return reportAdminNext && !isBrokenReportDest(reportAdminNext)
          ? reportAdminNext
          : WORKSPACE_PATH;
      }
      dest = nextPath;
    } else {
      dest = WORKSPACE_PATH;
    }

    dest = normalizePath(dest);
    if (isBrokenReportDest(dest)) dest = WORKSPACE_PATH;
    return dest;
  }

  function loginHrefWithNext(targetPath) {
    var next =
      targetPath ||
      (typeof g.location !== 'undefined'
        ? g.location.pathname + g.location.search + g.location.hash
        : '');
    try {
      var base =
        typeof g.location !== 'undefined' ? g.location.href : 'https://serviceopera.to/';
      var u = new URL('/login.html', base);
      if (next && isSafeNextPath(next)) u.searchParams.set('next', next);
      return u.pathname + u.search;
    } catch (e) {
      return '/login.html';
    }
  }

  g.soPortalWorkspacePath = function () {
    return WORKSPACE_PATH;
  };

  g.soPortalWorkspaceCanonical = function () {
    return WORKSPACE_CANONICAL;
  };

  g.soPortalResolvePostLogin = resolvePostLoginDestination;
  g.soPortalReportUrl = reportUrlFromLj;
  g.soPortalIsSafeNextPath = isSafeNextPath;
  g.soPortalLoginHrefWithNext = loginHrefWithNext;
})(typeof window !== 'undefined' ? window : globalThis);
