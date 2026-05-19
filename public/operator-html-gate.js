/**
 * Mint HttpOnly operator cookie before full-page /admin/* navigation.
 * Shared by user-account-menu, login.html, and admin.js — never bounce login.html in a loop.
 */
(function (g) {
  'use strict';

  var ADMIN_JWT_KEY = 'so_admin_jwt';
  var LOOP_KEY = 'so_operator_gate_loop';
  var LOOP_MS = 15000;

  function api(path) {
    return typeof g.soApiUrl === 'function' ? g.soApiUrl(path) : path;
  }

  function cred() {
    return typeof g.soApiCredentials === 'function' ? g.soApiCredentials() : 'same-origin';
  }

  function isAdminShellPath(path) {
    if (typeof g.soPortalIsAdminShellNextPath === 'function') {
      return g.soPortalIsAdminShellNextPath(path);
    }
    var pathOnly = String(path || '').split('?')[0].split('#')[0];
    if (!pathOnly || pathOnly.charAt(0) !== '/') return false;
    if (pathOnly === '/admin' || /^\/admin\.html$/i.test(pathOnly)) return true;
    return /^\/admin\/[a-z0-9-]+/i.test(pathOnly);
  }

  function storeAdminJwt(token) {
    if (!token) return;
    try {
      g.localStorage.setItem(ADMIN_JWT_KEY, token);
      g.sessionStorage.setItem(ADMIN_JWT_KEY, token);
    } catch (e) {
      try {
        g.sessionStorage.setItem(ADMIN_JWT_KEY, token);
      } catch (e2) {}
    }
  }

  function probeOperatorCookie() {
    return fetch(api('/api/admin/session'), {
      method: 'GET',
      credentials: cred(),
      cache: 'no-store',
    })
      .then(function (r) {
        return r.json().then(function (j) {
          return Boolean(r.ok && j && j.ok);
        });
      })
      .catch(function () {
        return false;
      });
  }

  function bootstrapFromPortal(bearer) {
    if (!bearer) return Promise.resolve(false);
    return fetch(api('/api/admin/bootstrap-from-portal'), {
      method: 'POST',
      credentials: cred(),
      cache: 'no-store',
      headers: { Authorization: 'Bearer ' + bearer, 'Content-Type': 'application/json' },
    })
      .then(function (r) {
        return r.json().then(function (j) {
          if (!r.ok || !j || !j.token) return false;
          storeAdminJwt(j.token);
          return true;
        });
      })
      .catch(function () {
        return false;
      });
  }

  function touchOperatorGateLoop(targetPath) {
    try {
      g.sessionStorage.setItem(
        LOOP_KEY,
        JSON.stringify({ path: String(targetPath || ''), at: Date.now() })
      );
    } catch (e) {}
  }

  function isOperatorGateLoop(targetPath) {
    try {
      var raw = g.sessionStorage.getItem(LOOP_KEY);
      if (!raw) return false;
      var rec = JSON.parse(raw);
      if (!rec || !rec.at) return false;
      if (Date.now() - Number(rec.at) > LOOP_MS) return false;
      return String(rec.path || '') === String(targetPath || '');
    } catch (e) {
      return false;
    }
  }

  function clearOperatorGateLoop() {
    try {
      g.sessionStorage.removeItem(LOOP_KEY);
    } catch (e) {}
  }

  /**
   * @param {string} bearer Portal or admin JWT
   * @returns {Promise<boolean>}
   */
  function ensureOperatorHtmlGate(bearer) {
    return probeOperatorCookie().then(function (ready) {
      if (ready) {
        clearOperatorGateLoop();
        return true;
      }
      if (!bearer) return false;
      return bootstrapFromPortal(bearer).then(function (booted) {
        if (!booted) return false;
        return fetch(api('/api/admin/session'), {
          method: 'GET',
          credentials: cred(),
          headers: { Authorization: 'Bearer ' + bearer },
          cache: 'no-store',
        })
          .then(function (r) {
            if (!r.ok) return probeOperatorCookie();
            return r.json().then(function () {
              return probeOperatorCookie();
            });
          })
          .catch(function () {
            return probeOperatorCookie();
          });
      });
    });
  }

  var GATE_FAIL_MSG =
    'Signed in to the clinic portal, but this browser did not receive an operator session cookie (required for /admin). Stay on this page — use the operator password below on /admin/users, or sign out, clear site data for serviceopera.to, and sign in again.';

  /**
   * Bootstrap cookie then navigate, or show one message — never redirect to login.html in a loop.
   * @param {string} targetPath Same-origin path
   * @param {string} bearer Portal or admin JWT
   * @param {{ onFail?: function(string): void }} [opts]
   * @returns {Promise<boolean>} true if navigation started
   */
  function navigateOperatorPath(targetPath, bearer, opts) {
    opts = opts || {};
    var path = String(targetPath || '').trim();
    if (!path || path.charAt(0) !== '/') path = '/admin/users';

    if (isOperatorGateLoop(path)) {
      var loopMsg =
        'Operator console navigation was blocked to prevent a sign-in loop. ' +
        'Open /admin/users and sign in with the operator password, or clear site data and try again.';
      if (typeof opts.onFail === 'function') opts.onFail(loopMsg);
      else g.alert(loopMsg);
      return Promise.resolve(false);
    }

    touchOperatorGateLoop(path);

    return ensureOperatorHtmlGate(bearer).then(function (ready) {
      if (!ready) {
        clearOperatorGateLoop();
        var msg = opts.failMessage || GATE_FAIL_MSG;
        if (typeof opts.onFail === 'function') opts.onFail(msg);
        else g.alert(msg);
        return false;
      }
      clearOperatorGateLoop();
      try {
        g.location.assign(path);
      } catch (eNav) {
        g.location.href = path;
      }
      return true;
    });
  }

  g.soOperatorHtmlGateIsAdminPath = isAdminShellPath;
  g.soEnsureOperatorHtmlGate = ensureOperatorHtmlGate;
  g.soNavigateOperatorPath = navigateOperatorPath;
  g.soClearOperatorGateLoop = clearOperatorGateLoop;
  g.soOperatorGateFailMessage = GATE_FAIL_MSG;
})(typeof window !== 'undefined' ? window : globalThis);
