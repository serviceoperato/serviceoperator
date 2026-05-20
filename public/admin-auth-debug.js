/**
 * Operator / portal auth diagnostics — live probes for HttpOnly cookie issues.
 */
(function () {
  'use strict';

  var USER_JWT_KEY = 'so_user_jwt';
  var LEGACY_JWT_KEY = 'so_clinic_jwt';
  var ADMIN_JWT_KEY = 'so_admin_jwt';

  function api(path) {
    return typeof soApiUrl === 'function' ? soApiUrl(path) : path;
  }

  function cred() {
    return typeof soApiCredentials === 'function' ? soApiCredentials() : 'include';
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function readPortalJwt() {
    try {
      return (
        localStorage.getItem(USER_JWT_KEY) ||
        localStorage.getItem(LEGACY_JWT_KEY) ||
        sessionStorage.getItem(USER_JWT_KEY) ||
        sessionStorage.getItem(LEGACY_JWT_KEY) ||
        ''
      );
    } catch (e) {
      return '';
    }
  }

  function readAdminJwt() {
    try {
      return localStorage.getItem(ADMIN_JWT_KEY) || sessionStorage.getItem(ADMIN_JWT_KEY) || '';
    } catch (e) {
      return '';
    }
  }

  function decodeJwtPayload(token) {
    try {
      var parts = String(token || '').split('.');
      var seg = parts.length === 2 ? parts[0] : parts.length >= 3 ? parts[1] : '';
      if (!seg) return null;
      var payload = seg.replace(/-/g, '+').replace(/_/g, '/');
      while (payload.length % 4) payload += '=';
      return JSON.parse(atob(payload));
    } catch (e) {
      return null;
    }
  }

  function statusClass(ok) {
    if (ok === true) return 'auth-debug__status--ok';
    if (ok === false) return 'auth-debug__status--fail';
    return 'auth-debug__status--warn';
  }

  function row(label, value, ok) {
    return (
      '<tr><th scope="row">' +
      esc(label) +
      '</th><td class="' +
      statusClass(ok) +
      '"><code>' +
      esc(value) +
      '</code></td></tr>'
    );
  }

  function fetchJson(url, opts) {
    opts = opts || {};
    var headers = opts.headers || {};
    return fetch(url, {
      method: opts.method || 'GET',
      credentials: cred(),
      cache: 'no-store',
      headers: headers,
    })
      .then(function (r) {
        return r.text().then(function (text) {
          var j = null;
          try {
            j = text ? JSON.parse(text) : null;
          } catch (e) {
            j = { _parseError: true, _raw: text.slice(0, 400) };
          }
          return { ok: r.ok, status: r.status, json: j };
        });
      })
      .catch(function (err) {
        return { ok: false, status: 0, json: { error: String(err && err.message ? err.message : err) } };
      });
  }

  function clientSnapshot() {
    var pageHost = '';
    var pageOrigin = '';
    try {
      pageHost = location.hostname || '';
      pageOrigin = location.origin || '';
    } catch (e) {}

    var apiOrigin = '';
    try {
      apiOrigin = typeof soApiOrigin === 'function' ? String(soApiOrigin() || '') : '(no soApiOrigin)';
    } catch (e2) {
      apiOrigin = 'error';
    }

    var credMode = typeof soApiCredentials === 'function' ? soApiCredentials() : 'include';
    var sampleUrl = api('/api/admin/session');
    var crossOrigin = false;
    if (apiOrigin && apiOrigin.indexOf('http') === 0) {
      try {
        crossOrigin = new URL(apiOrigin).origin !== pageOrigin;
      } catch (e3) {}
    }

    var portalJwt = readPortalJwt();
    var adminJwt = readAdminJwt();
    var portalPayload = portalJwt ? decodeJwtPayload(portalJwt) : null;

    return {
      pageHost: pageHost,
      pageOrigin: pageOrigin,
      apiOrigin: apiOrigin || '(empty → same-origin /api)',
      credMode: credMode,
      sampleSessionUrl: sampleUrl,
      crossOriginApi: crossOrigin,
      shimLoaded: typeof soUsesSameOriginProxiedApi === 'function',
      proxiedApiFn: typeof soUsesSameOriginProxiedApi === 'function' ? soUsesSameOriginProxiedApi() : null,
      documentCookieVisible: document.cookie || '(empty — HttpOnly cookies never appear here)',
      portalJwtLen: portalJwt ? portalJwt.length : 0,
      portalIsOperator: !!(portalPayload && portalPayload.isOperator === true),
      portalEmail: portalPayload && portalPayload.email ? String(portalPayload.email) : '',
      adminJwtLen: adminJwt ? adminJwt.length : 0,
      portalJwt: portalJwt,
      adminJwt: adminJwt || portalJwt,
    };
  }

  function renderReport(snapshot, caps, authProbe, sessionCookie, sessionBearer, bootstrap) {
    var lines = [];
    var fix = [];

    if (snapshot.crossOriginApi) {
      fix.push(
        'API calls go to a different host than this page — HttpOnly cookies cannot stick. soApiOrigin() must be empty on Railway frontend (load so-api-same-origin-shim.js).'
      );
    }
    if (snapshot.credMode === 'omit') {
      fix.push('fetch credentials are omit — cookies will not be sent or stored. Expected include or same-origin.');
    }
    if (authProbe && authProbe.json && !authProbe.json.hasAdminCookie && sessionCookie && !sessionCookie.ok) {
      fix.push(
        'No so_admin_jwt HttpOnly cookie on this host. Run bootstrap-from-portal with an operator portal JWT, or sign in at /admin/users with the operator password.'
      );
    }
    if (bootstrap && bootstrap.ok && authProbe && authProbe.json && !authProbe.json.hasAdminCookie) {
      fix.push(
        'Bootstrap returned OK but server still sees no admin cookie — proxy may be dropping Set-Cookie, or the request did not hit this host’s /api.'
      );
    }

    var html =
      '<section class="auth-debug__section">' +
      '<h2>Summary</h2>' +
      (fix.length
        ? '<ul class="auth-debug__fixes">' + fix.map(function (f) { return '<li>' + esc(f) + '</li>'; }).join('') + '</ul>'
        : '<p class="auth-debug__ok">No obvious client routing issue detected. If /admin still fails, use operator password on <a href="/admin/users">/admin/users</a>.</p>') +
      '</section>';

    html +=
      '<section class="auth-debug__section"><h2>Client routing</h2><table class="auth-debug__table"><tbody>' +
      row('Page host', snapshot.pageHost, true) +
      row('Page origin', snapshot.pageOrigin, true) +
      row('soApiOrigin()', snapshot.apiOrigin, !snapshot.crossOriginApi) +
      row('soApiCredentials()', snapshot.credMode, snapshot.credMode !== 'omit') +
      row('GET session URL', snapshot.sampleSessionUrl, !snapshot.crossOriginApi) +
      row('Cross-origin API', snapshot.crossOriginApi ? 'yes — BUG' : 'no', !snapshot.crossOriginApi) +
      row('Same-origin shim fn', snapshot.shimLoaded ? String(snapshot.proxiedApiFn) : '(not loaded)', snapshot.shimLoaded && snapshot.proxiedApiFn) +
      row('document.cookie', snapshot.documentCookieVisible, null) +
      '</tbody></table></section>';

    html +=
      '<section class="auth-debug__section"><h2>Storage (non-HttpOnly)</h2><table class="auth-debug__table"><tbody>' +
      row('Portal JWT length', String(snapshot.portalJwtLen), snapshot.portalJwtLen > 0) +
      row('Portal isOperator (JWT)', snapshot.portalIsOperator ? 'yes' : 'no', snapshot.portalIsOperator) +
      row('Portal email (JWT)', snapshot.portalEmail || '(none)', null) +
      row('Admin JWT length', String(snapshot.adminJwtLen), snapshot.adminJwtLen > 0) +
      '</tbody></table></section>';

    if (caps) {
      html +=
        '<section class="auth-debug__section"><h2>GET /api/admin/capabilities</h2><table class="auth-debug__table"><tbody>' +
        row('HTTP', String(caps.status), caps.ok) +
        row('proxiedApi', caps.json && caps.json.proxiedApi != null ? String(caps.json.proxiedApi) : 'n/a', null) +
        row('apiUpstream', caps.json && caps.json.apiUpstream ? String(caps.json.apiUpstream) : '(local /api)', null) +
        row('version', caps.json && caps.json.version ? String(caps.json.version) : 'n/a', null) +
        '</tbody></table></section>';
    }

    if (authProbe) {
      var ap = authProbe.json || {};
      html +=
        '<section class="auth-debug__section"><h2>GET /api/debug/auth-probe (server sees cookies)</h2><table class="auth-debug__table"><tbody>' +
        row('HTTP', String(authProbe.status), authProbe.ok) +
        row('request host', ap.host || 'n/a', null) +
        row('hasAdminCookie', ap.hasAdminCookie != null ? String(ap.hasAdminCookie) : 'n/a', !!ap.hasAdminCookie) +
        row('adminCookieValid', ap.adminCookieValid != null ? String(ap.adminCookieValid) : 'n/a', !!ap.adminCookieValid) +
        row('hasPortalCookie', ap.hasPortalCookie != null ? String(ap.hasPortalCookie) : 'n/a', !!ap.hasPortalCookie) +
        row('portalCookieValid', ap.portalCookieValid != null ? String(ap.portalCookieValid) : 'n/a', !!ap.portalCookieValid) +
        row('operator via', ap.operator ? ap.operator.via + ' · ' + (ap.operator.email || '') : '(none)', !!ap.operator) +
        row('server proxiedApi', ap.proxiedApi != null ? String(ap.proxiedApi) : 'n/a', null) +
        row('server apiUpstream', ap.apiUpstream || '(local)', null) +
        '</tbody></table></section>';
    }

    if (sessionCookie) {
      html +=
        '<section class="auth-debug__section"><h2>GET /api/admin/session (cookies only)</h2><table class="auth-debug__table"><tbody>' +
        row('HTTP', String(sessionCookie.status), sessionCookie.ok) +
        row('ok', sessionCookie.json && sessionCookie.json.ok != null ? String(sessionCookie.json.ok) : 'n/a', !!(sessionCookie.json && sessionCookie.json.ok)) +
        row('via', sessionCookie.json && sessionCookie.json.via ? String(sessionCookie.json.via) : '(none)', null) +
        '</tbody></table></section>';
    }

    if (sessionBearer) {
      html +=
        '<section class="auth-debug__section"><h2>GET /api/admin/session (Authorization bearer)</h2><table class="auth-debug__table"><tbody>' +
        row('HTTP', String(sessionBearer.status), sessionBearer.ok) +
        row('ok', sessionBearer.json && sessionBearer.json.ok != null ? String(sessionBearer.json.ok) : 'n/a', !!(sessionBearer.json && sessionBearer.json.ok)) +
        '</tbody></table></section>';
    }

    if (bootstrap) {
      html +=
        '<section class="auth-debug__section"><h2>POST /api/admin/bootstrap-from-portal</h2><table class="auth-debug__table"><tbody>' +
        row('HTTP', String(bootstrap.status), bootstrap.ok) +
        row('token returned', bootstrap.json && bootstrap.json.token ? 'yes (len ' + bootstrap.json.token.length + ')' : 'no', !!(bootstrap.json && bootstrap.json.token)) +
        row('error', bootstrap.json && bootstrap.json.error ? String(bootstrap.json.error) : '(none)', !bootstrap.json || !bootstrap.json.error) +
        '</tbody></table></section>';
    }

    return html;
  }

  function runProbes(includeBootstrap) {
    var out = document.getElementById('authDebugOut');
    var status = document.getElementById('authDebugStatus');
    if (!out) return Promise.resolve();
    if (status) status.textContent = 'Running probes…';

    var snapshot = clientSnapshot();
    var bearer = snapshot.adminJwt;

    var chain = Promise.all([
      fetchJson(api('/api/admin/capabilities')),
      fetchJson(api('/api/debug/auth-probe')),
      fetchJson(api('/api/admin/session')),
      bearer
        ? fetchJson(api('/api/admin/session'), { headers: { Authorization: 'Bearer ' + bearer } })
        : Promise.resolve(null),
    ]);

    if (includeBootstrap && bearer) {
      chain = chain.then(function (parts) {
        return fetchJson(api('/api/admin/bootstrap-from-portal'), {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + bearer, 'Content-Type': 'application/json' },
        }).then(function (boot) {
          parts.push(boot);
          return parts;
        });
      });
    }

    return chain
      .then(function (parts) {
        var caps = parts[0];
        var authProbe = parts[1];
        var sessionCookie = parts[2];
        var sessionBearer = parts[3];
        var bootstrap = includeBootstrap && parts[4] ? parts[4] : null;

        if (includeBootstrap && bootstrap && bootstrap.ok) {
          return fetchJson(api('/api/debug/auth-probe')).then(function (authProbe2) {
            out.innerHTML = renderReport(snapshot, caps, authProbe2, sessionCookie, sessionBearer, bootstrap);
            if (status) status.textContent = 'Updated ' + new Date().toLocaleTimeString();
          });
        }

        out.innerHTML = renderReport(snapshot, caps, authProbe, sessionCookie, sessionBearer, bootstrap);
        if (status) status.textContent = 'Updated ' + new Date().toLocaleTimeString();
      })
      .catch(function (err) {
        out.innerHTML = '<p class="auth-debug__fail">' + esc(String(err && err.message ? err.message : err)) + '</p>';
        if (status) status.textContent = 'Probe error';
      });
  }

  function bind() {
    var refresh = document.getElementById('authDebugRefresh');
    var bootstrapBtn = document.getElementById('authDebugBootstrap');
    if (refresh) {
      refresh.addEventListener('click', function () {
        runProbes(false);
      });
    }
    if (bootstrapBtn) {
      bootstrapBtn.addEventListener('click', function () {
        runProbes(true);
      });
    }
    runProbes(false);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind);
  } else {
    bind();
  }

  window.soAuthDebugRun = runProbes;
})();
