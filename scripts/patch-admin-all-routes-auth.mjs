import fs from 'fs';
import path from 'path';

const root = path.resolve(import.meta.dirname, '..');

function patchAdminJs() {
  const file = path.join(root, 'public', 'admin.js');
  let c = fs.readFileSync(file, 'utf8');
  let changed = false;

  const probeOld = `      .then(function (r) {
        return r.ok;
      })
      .catch(function () {
        return false;
      });
  }

  /** Bearer in storage but no cookie yet — mint HttpOnly cookie before full-page report navigation. */`;

  const probeNew = `      .then(function (r) {
        if (!r.ok) return false;
        return r
          .json()
          .then(function (j) {
            return Boolean(j && j.ok);
          })
          .catch(function () {
            return true;
          });
      })
      .catch(function () {
        return false;
      });
  }

  /** Bearer in storage but no cookie yet — mint HttpOnly cookie before full-page report navigation. */`;

  if (c.includes(probeOld)) {
    c = c.replace(probeOld, probeNew);
    changed = true;
  }

  const apiCredBlock = `  function apiCred() {
    return typeof soApiCredentials === 'function' ? soApiCredentials() : 'same-origin';
  }

  function loadTfVersion() {`;

  const apiCredNew = `  function apiCred() {
    return typeof soApiCredentials === 'function' ? soApiCredentials() : 'same-origin';
  }

  /** Bearer when present; HttpOnly operator cookie alone is enough for /api/admin/* on same origin. */
  function adminAuthHeaders() {
    var headers = {};
    var token = getAdminBearer();
    if (token) headers.Authorization = 'Bearer ' + token;
    return headers;
  }

  var ADMIN_AUTH_LOOP_KEY = 'so_admin_auth_redirect_count';

  function clearAdminAuthRedirectLoop() {
    try {
      sessionStorage.removeItem(ADMIN_AUTH_LOOP_KEY);
    } catch (e) {}
  }

  function noteAdminAuthRedirectLoop() {
    try {
      var n = Number(sessionStorage.getItem(ADMIN_AUTH_LOOP_KEY) || '0') + 1;
      sessionStorage.setItem(ADMIN_AUTH_LOOP_KEY, String(n));
      return n;
    } catch (e) {
      return 0;
    }
  }

  function loadTfVersion() {`;

  if (c.includes(apiCredBlock) && !c.includes('function adminAuthHeaders()')) {
    c = c.replace(apiCredBlock, apiCredNew);
    changed = true;
  }

  const showWsOld = `  function showWorkspace() {
    redirectClinicHotelLoginNextIfPresent().then(function (didRedirect) {`;
  const showWsNew = `  function showWorkspace() {
    clearAdminAuthRedirectLoop();
    redirectClinicHotelLoginNextIfPresent().then(function (didRedirect) {`;
  if (c.includes(showWsOld) && !c.includes('clearAdminAuthRedirectLoop();\n    redirectClinicHotelLoginNextIfPresent')) {
    c = c.replace(showWsOld, showWsNew);
    changed = true;
  }

  const initOld = `  Promise.all([fetchCapabilitiesData(), fetchAdminVersionProbe()])
    .then(function () {
      applyCapabilities();
    })
    .then(function () {
      return tryRestoreJwtSession();
    })
    .then(function (restored) {
      if (restored) return true;
      return tryRestorePortalOperatorSession();
    })
    .then(function (restored) {
      if (restored) return true;
      return tryRestoreCookieOnlyOperatorSession();
    })
    .then(function (restored) {
      if (restored) {
        revealAdminBootAfterPaint();
        return;
      }
      if (capabilitiesFromOurServer && capabilitiesHttpOk) {
        redirectToUnifiedLogin();
        return;
      }
      showAdminLoginGate();
      revealAdminBootAfterPaint();
    })
    .catch(function () {
      try {
        if (capabilitiesFromOurServer && capabilitiesHttpOk) redirectToUnifiedLogin();
        else showAdminLoginGate();
      } catch (e) {}
      revealAdminBootAfterPaint();
    })`;

  const initNew = `  function tryRedirectToUnifiedLogin() {
    return mintAdminCookieFromStoredJwt()
      .then(function () {
        return probeAdminCookieSession();
      })
      .then(function (ok) {
        if (ok) {
          showWorkspace();
          revealAdminBootAfterPaint();
          return;
        }
        redirectToUnifiedLogin();
      });
  }

  Promise.all([fetchCapabilitiesData(), fetchAdminVersionProbe()])
    .then(function () {
      applyCapabilities();
    })
    .then(function () {
      return tryRestoreCookieOnlyOperatorSession();
    })
    .then(function (restored) {
      if (restored) return true;
      return tryRestoreJwtSession();
    })
    .then(function (restored) {
      if (restored) return true;
      return tryRestorePortalOperatorSession();
    })
    .then(function (restored) {
      if (restored) {
        revealAdminBootAfterPaint();
        return;
      }
      if (capabilitiesFromOurServer && capabilitiesHttpOk) {
        return tryRedirectToUnifiedLogin();
      }
      showAdminLoginGate();
      revealAdminBootAfterPaint();
    })
    .catch(function () {
      try {
        if (capabilitiesFromOurServer && capabilitiesHttpOk) tryRedirectToUnifiedLogin();
        else showAdminLoginGate();
      } catch (e) {}
      revealAdminBootAfterPaint();
    })`;

  if (c.includes(initOld)) {
    c = c.replace(initOld, initNew);
    changed = true;
  }

  const redirectOld = `  function redirectToUnifiedLogin() {
    var next = window.location.pathname + window.location.search + window.location.hash;`;
  const redirectNew = `  function redirectToUnifiedLogin() {
    if (noteAdminAuthRedirectLoop() >= 3) {
      clearAdminAuthRedirectLoop();
      showAdminLoginGate();
      revealAdminBootAfterPaint();
      return;
    }
    var next = window.location.pathname + window.location.search + window.location.hash;`;
  if (c.includes(redirectOld) && !c.includes('noteAdminAuthRedirectLoop() >= 3')) {
    c = c.replace(redirectOld, redirectNew);
    changed = true;
  }

  const wqOld = `    var token = getAdminBearer();
    if (!token) {
      if (hint) {
        hint.textContent =
          'Sign in on the live Node server (operator password) to load pending registrations, report files, and page timestamps.';
        hint.className = 'admin-inbox__hint mono';
      }
      body.innerHTML =
        '<p class="admin-inbox__empty">Operations inbox requires an admin JWT from the server.</p>';
      renderTfUsersTable({ users: [], pendingRegistrations: [] });
      return;
    }
    if (hint) {
      hint.textContent = 'Loading…';
      hint.className = 'admin-inbox__hint mono';
    }
    fetch(api('/api/admin/work-queue'), {
      method: 'GET',
      credentials: apiCred(),
      headers: { Authorization: 'Bearer ' + token },
    })`;

  const wqNew = `    if (hint) {
      hint.textContent = 'Loading…';
      hint.className = 'admin-inbox__hint mono';
    }
    fetch(api('/api/admin/work-queue'), {
      method: 'GET',
      credentials: apiCred(),
      headers: adminAuthHeaders(),
    })`;

  if (c.includes(wqOld)) {
    c = c.replace(wqOld, wqNew);
    changed = true;
  }

  if (changed) {
    fs.writeFileSync(file, c);
    console.log('admin.js patched');
  } else {
    console.log('admin.js already up to date');
  }
}

function patchServer() {
  const file = path.join(root, 'server.mjs');
  let c = fs.readFileSync(file, 'utf8');
  const oldFn = `function getAdminJwtFromRequest(req) {
  const bearer = getBearer(req);
  if (bearer) return bearer;
  return getCookie(req, ADMIN_JWT_COOKIE);
}`;
  const newFn = `function getAdminJwtFromRequest(req) {
  const bearer = getBearer(req);
  const fromCookie = getCookie(req, ADMIN_JWT_COOKIE);
  if (bearer) {
    const p = verifyJwt(bearer);
    if (p && p.role === 'admin') return bearer;
  }
  if (fromCookie) {
    const p = verifyJwt(fromCookie);
    if (p && p.role === 'admin') return fromCookie;
  }
  return bearer || fromCookie;
}`;
  if (c.includes(oldFn)) {
    c = c.replace(oldFn, newFn);
    fs.writeFileSync(file, c);
    console.log('server.mjs patched');
  } else {
    console.log('server.mjs already up to date');
  }
}

patchAdminJs();
patchServer();
