/**
 * Portal post-auth routing: Login/Register → Workspace (default) → Report.
 * Preserves safe ?next= deep links; never loops through login/register/workspace.
 */
(function (g) {
  'use strict';

  var WORKSPACE_PATH = '/workspace.html';
  var WORKSPACE_CANONICAL = '/workspace';
  var ACCOUNT_SETTINGS_PATH = '/account-settings.html';
  var ACCOUNT_SETTINGS_CANONICAL = '/account-settings';

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
      /^\/workspace(\.html)?(\/|$|\?|#)/.test(nl) ||
      /^\/account-settings(\.html)?(\/|$|\?|#)/.test(nl)
    );
  }

  function isSafeNextPath(path) {
    if (!path || path.charAt(0) !== '/' || path.indexOf('//') === 0) return false;
    return !isLoopPath(path);
  }

  /** Operator console SPA (/admin/users, /admin/report-catalog, …) — never map to portal report URLs. */
  function isAdminShellNextPath(path) {
    var pathOnly = normalizePath(path).split('?')[0].split('#')[0];
    if (!pathOnly || pathOnly.charAt(0) !== '/') return false;
    if (pathOnly === '/admin' || /^\/admin\.html$/i.test(pathOnly)) return true;
    return /^\/admin\/[a-z0-9-]+/i.test(pathOnly);
  }

  function resolveAdminShellNextPath(path) {
    var pathOnly = normalizePath(path).split('?')[0].split('#')[0];
    if (/^\/admin\.html$/i.test(pathOnly) || pathOnly === '/admin') return '/admin/users';
    return path;
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
      if (isAdminShellNextPath(nextPath)) {
        return normalizePath(resolveAdminShellNextPath(nextPath));
      }
      dest = nextPath;
    } else if (nextPath && isAdminShellNextPath(nextPath)) {
      dest = resolveAdminShellNextPath(nextPath);
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

  g.soPortalAccountSettingsPath = function () {
    return ACCOUNT_SETTINGS_PATH;
  };

  g.soPortalAccountSettingsCanonical = function () {
    return ACCOUNT_SETTINGS_CANONICAL;
  };

  g.soPortalResolvePostLogin = resolvePostLoginDestination;
  g.soPortalReportUrl = reportUrlFromLj;
  g.soPortalIsSafeNextPath = isSafeNextPath;
  g.soPortalIsAdminShellNextPath = isAdminShellNextPath;
  g.soPortalLoginHrefWithNext = loginHrefWithNext;
})(typeof window !== 'undefined' ? window : globalThis);
