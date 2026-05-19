/**
 * Client workspace demo login — credentials validated via POST /api/demo/portal-login only.
 * Session is an HttpOnly cookie; use fetchDemoPortalSession() to read signed-in state.
 */
(function (global) {
  'use strict';

  function apiUrl(path) {
    return typeof global.soApiUrl === 'function' ? global.soApiUrl(path) : path;
  }

  function parseJsonResponse(text) {
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }

  function readJsonResponse(r) {
    return r.text().then(function (text) {
      return { ok: r.ok, status: r.status, json: parseJsonResponse(text) };
    });
  }

  /**
   * @returns {Promise<{ slug: string, business: string } | null>}
   */
  function fetchDemoPortalSession() {
    return fetch(apiUrl('/api/demo/portal-session'), {
      method: 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
    })
      .then(readJsonResponse)
      .then(function (x) {
        if (!x.ok || !x.json || !x.json.ok || !x.json.slug || !x.json.business) return null;
        return { slug: String(x.json.slug), business: String(x.json.business) };
      })
      .catch(function () {
        return null;
      });
  }

  /**
   * @returns {Promise<{ slug: string, business: string }>}
   */
  function loginDemoPortal(username, password) {
    return fetch(apiUrl('/api/demo/portal-login'), {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: String(username || '').trim(),
        password: String(password || ''),
      }),
    })
      .then(readJsonResponse)
      .then(function (x) {
        var j = x.json;
        if (!x.ok) {
          var err = new Error((j && j.error) || 'Invalid credentials.');
          err.status = x.status;
          throw err;
        }
        if (!j || !j.slug || !j.business) {
          throw new Error('Unexpected server response.');
        }
        return { slug: String(j.slug), business: String(j.business) };
      });
  }

  function logoutDemoPortal() {
    return fetch(apiUrl('/api/demo/portal-logout'), {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
    }).catch(function () {});
  }

  global.soDemoPortalLogin = loginDemoPortal;
  global.soFetchDemoPortalSession = fetchDemoPortalSession;
  global.soLogoutDemoPortal = logoutDemoPortal;
})(typeof window !== 'undefined' ? window : globalThis);
