/**
 * Client workspace demo login — credentials validated via POST /api/demo/portal-login only.
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
    }).then(function (r) {
      return r.text().then(function (text) {
        var j = parseJsonResponse(text);
        if (!r.ok) {
          var err = new Error((j && j.error) || 'Invalid credentials.');
          err.status = r.status;
          throw err;
        }
        if (!j || !j.slug || !j.business) {
          throw new Error('Unexpected server response.');
        }
        return { slug: String(j.slug), business: String(j.business) };
      });
    });
  }

  global.soDemoPortalLogin = loginDemoPortal;
})(typeof window !== 'undefined' ? window : globalThis);
