(function () {
  'use strict';

  var JWT_KEY = 'so_admin_jwt';
  var PORTAL_JWT_KEYS = ['so_user_jwt', 'so_clinic_jwt'];

  /** Admin bearer: mirror portal JWT storage (local + session) so sign-in is not re-prompted on new tabs until expiry. */
  function readStoredAdminJwt() {
    try {
      return localStorage.getItem(JWT_KEY) || sessionStorage.getItem(JWT_KEY) || '';
    } catch (e) {
      return '';
    }
  }
  function writeStoredAdminJwt(token) {
    try {
      if (token) {
        localStorage.setItem(JWT_KEY, token);
        sessionStorage.setItem(JWT_KEY, token);
      } else {
        localStorage.removeItem(JWT_KEY);
        sessionStorage.removeItem(JWT_KEY);
      }
    } catch (e) {
      try {
        if (token) sessionStorage.setItem(JWT_KEY, token);
        else sessionStorage.removeItem(JWT_KEY);
      } catch (e2) {}
    }
  }
  function clearStoredAdminJwt() {
    writeStoredAdminJwt('');
  }

  /** Safe same-origin `?next=` from login handoff or server redirect (path must start with /, no //). */
  function readAdminLoginNextParam() {
    try {
      var params = new URLSearchParams(window.location.search);
      var next = (params.get('next') || '').trim();
      if (!next || next.charAt(0) !== '/' || next.indexOf('//') === 0) return '';
      return next;
    } catch (e) {
      return '';
    }
  }

  function normalizeAdminShellPath(pathname) {
    var path = String(pathname || '').replace(/\/+$/, '') || '/';
    if (path === '/admin' || /\/admin\.html$/i.test(path)) return '/admin/users';
    return path;
  }

  /** Whitelist admin SPA paths allowed in `?next=` (must match getAdminRouteFromLocation). */
  function isAllowedAdminShellNextPath(pathOnly) {
    var norm = normalizeAdminShellPath(pathOnly);
    return (
      norm === '/admin/users' ||
      norm === '/admin/activity' ||
      norm === '/admin/deploy-log' ||
      norm === '/admin/site-appearance' ||
      norm === '/admin/icons' ||
      norm === '/admin/homepage-icons' ||
      norm === '/admin/report-catalog' ||
      norm === '/admin/user-reports' ||
      norm === '/admin/user-profiling' ||
      norm === '/admin/voice-recorder' ||
      norm === '/admin/transcriptions' ||
      /^\/admin\/transcriptions\/item\/[^/]+$/.test(norm)
    );
  }

  function isAllowedClinicHotelNextPath(pathOnly) {
    return /^\/(clinics|hotels)\/\d{3}(\/.*)?$/.test(pathOnly);
  }

  function stripAdminLoginNextQueryParam() {
    try {
      var params = new URLSearchParams(window.location.search);
      if (!params.has('next')) return;
      params.delete('next');
      var qs = params.toString();
      var url = window.location.pathname + (qs ? '?' + qs : '') + window.location.hash;
      history.replaceState(null, '', url);
    } catch (e) {}
  }

  /**
   * Private /clinics|hotels/NNN/ HTML is gated by HttpOnly cookie on full navigation (not Bearer).
   * Probe cookie-only session before leaving the admin shell to avoid /admin ↔ report redirect loops.
   */
  function probeAdminCookieSession() {
    return fetch(api('/api/admin/session'), {
      method: 'GET',
      credentials: apiCred(),
      cache: 'no-store',
    })
      .then(function (r) {
        return r.ok;
      })
      .catch(function () {
        return false;
      });
  }

  /** Bearer in storage but no cookie yet — mint HttpOnly cookie before full-page report navigation. */
  function mintAdminCookieFromStoredJwt() {
    var token = readStoredAdminJwt();
    if (!token) {
      token = getPortalJwt();
      if (!token || !decodeJwtIsOperator(token)) return Promise.resolve(false);
    }
    return fetch(api('/api/admin/session'), {
      method: 'GET',
      credentials: apiCred(),
      cache: 'no-store',
      headers: { Authorization: 'Bearer ' + token },
    })
      .then(function (r) {
        return r.ok;
      })
      .catch(function () {
        return false;
      });
  }

  /** Full-page redirect for numbered clinic/hotel reports after admin sign-in (cookie must be set). */
  function redirectClinicHotelLoginNextIfPresent() {
    var next = readAdminLoginNextParam();
    if (!next) return Promise.resolve(false);
    var pathOnly = next.split('?')[0].split('#')[0];
    if (!isAllowedClinicHotelNextPath(pathOnly)) return Promise.resolve(false);
    function doClinicHotelNextRedirect() {
      try {
        var u = new URL(next, window.location.origin);
        if (u.origin !== window.location.origin) return false;
        window.location.replace(u.pathname + u.search + u.hash);
        return true;
      } catch (e2) {
        return false;
      }
    }
    return probeAdminCookieSession().then(function (cookieOk) {
      if (cookieOk) return doClinicHotelNextRedirect();
      return mintAdminCookieFromStoredJwt().then(function (minted) {
        if (!minted) return false;
        return probeAdminCookieSession().then(function (cookieOk2) {
          if (!cookieOk2) return false;
          return doClinicHotelNextRedirect();
        });
      });
    });
  }

  function adminRouteIdFromShellPath(pathname) {
    var path = normalizeAdminShellPath(pathname);
    if (path === '/admin/activity') return 'activity';
    if (path === '/admin/deploy-log') return 'deploy-log';
    if (path === '/admin/site-appearance') return 'site-appearance';
    if (path === '/admin/icons') return 'icons';
    if (path === '/admin/homepage-icons') return 'homepage-icons';
    if (path === '/admin/report-catalog') return 'report-catalog';
    if (path === '/admin/user-reports') return 'user-reports';
    if (path === '/admin/user-profiling') return 'user-profiling';
    if (path === '/admin/voice-recorder') return 'voice-recorder';
    if (/^\/admin\/transcriptions\/item\/[^/]+$/.test(path)) return 'transcriptions-detail';
    if (path === '/admin/transcriptions') return 'transcriptions';
    if (path === '/admin/users') return 'users';
    if (/\/admin\.html$/i.test(path)) return 'users';
    return 'users';
  }

  /** Same-origin in-app admin paths only (not /operator/*). */
  function isAdminShellInAppHref(href) {
    var pathOnly = String(href || '').split('?')[0].split('#')[0];
    return isAllowedAdminShellNextPath(pathOnly);
  }

  /**
   * Client-side admin section change without carrying `?next=` (avoids redirect loops).
   * @param {boolean} [replace] use replaceState (post-login handoff) instead of pushState
   */
  function adminShellNavigate(href, ev, replace) {
    if (
      ev &&
      (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey || (ev.button != null && ev.button !== 0))
    ) {
      return false;
    }
    if (!isAdminShellInAppHref(href)) return false;
    try {
      var u = new URL(href, window.location.origin);
      if (u.origin !== window.location.origin) return false;
      var targetPath = normalizeAdminShellPath(u.pathname);
      var target = targetPath + (u.hash || '');
      if (ev && ev.preventDefault) ev.preventDefault();
      var curPath = normalizeAdminShellPath(window.location.pathname);
      if (curPath !== targetPath || window.location.search || window.location.hash !== (u.hash || '')) {
        if (replace) history.replaceState(null, '', target);
        else history.pushState(null, '', target);
      }
      stripAdminLoginNextQueryParam();
      if (workspace && !workspace.classList.contains('is-hidden')) {
        syncAdminRouteFromLocation();
      }
      return true;
    } catch (eNav) {
      return false;
    }
  }

  /** In-shell navigation for `?next=/admin/...` (e.g. transcriptions after auth redirect). */
  function applyAdminShellLoginNextIfPresent() {
    var next = readAdminLoginNextParam();
    if (!next) return false;
    var pathOnly = next.split('?')[0].split('#')[0];
    if (!isAllowedAdminShellNextPath(pathOnly)) return false;
    try {
      var u = new URL(next, window.location.origin);
      if (u.origin !== window.location.origin) return false;
      return adminShellNavigate(u.pathname + (u.hash || ''), null, true);
    } catch (e3) {
      return false;
    }
  }

  var serverPasswordAuth = false;
  var capabilitiesHttpOk = false;
  var capabilitiesFromOurServer = false;

  var gate = document.getElementById('adminGate');
  var workspace = document.getElementById('adminWorkspace');
  var bootEl = document.getElementById('adminBoot');
  var form = document.getElementById('adminGateForm');
  var hint = document.getElementById('adminGateHint');
  var tfNav = document.getElementById('tfAdminNavPills');
  var tfVerNum = document.getElementById('tfAdminVersionNum');
  var panel = document.getElementById('adminPanel');
  var panelTitle = document.getElementById('adminPanelTitle');
  var panelBody = document.getElementById('adminPanelBody');
  var configBanner = document.getElementById('adminConfigBanner');
  var gateLede = document.getElementById('adminGateLede');
  var passwordInput = document.getElementById('adminPasswordInput');
  var submitBtn = document.getElementById('adminSubmitBtn');
  var cachedUsers = [];
  var cachedPending = [];
  var usersFilter = 'all';
  var usersSort = 'recent';
  var usersSearch = '';
  var reportCatalog = null;
  var reportCatalogVertical = 'clinics';
  /** Grouped rows from GET /api/admin/audit-reports (preferred for catalog UI when signed in). */
  var auditReportsByVertical = null;
  /** idle | loading | ok | error */
  var userProfilingLoadState = 'idle';
  var userProfilingRows = [];
  /** idle | ok | error | skipped */
  var auditReportsLoadState = 'idle';
  /** Bumped each time Site appearance opens so late GET/PUT callbacks cannot touch a replaced panel. */
  var siteAppearancePanelGen = 0;

  function api(path) {
    return typeof soApiUrl === 'function' ? soApiUrl(path) : path;
  }
  function apiCred() {
    return typeof soApiCredentials === 'function' ? soApiCredentials() : 'same-origin';
  }

  function loadTfVersion() {
    if (!tfVerNum) return;
    var wrap = tfVerNum.closest ? tfVerNum.closest('.tf-admin-version') : null;
    var staticVer = '';
    var origin =
      typeof window !== 'undefined' && window.location && window.location.origin
        ? window.location.origin
        : '';
    var staticFetch = origin
      ? fetch(origin + '/app-version.json', { cache: 'no-store', credentials: 'same-origin' })
          .then(function (r) {
            return r.ok ? r.json() : null;
          })
          .then(function (j) {
            if (j && typeof j.version === 'string') staticVer = String(j.version).trim();
          })
          .catch(function () {})
      : Promise.resolve();
    var apiFetch = fetch(api('/api/version'), { cache: 'no-store', credentials: apiCred() })
      .then(function (r) {
        return r.json().then(function (j) {
          return { ok: r.ok, j: j };
        });
      })
      .catch(function () {
        return { ok: false, j: null };
      });
    Promise.all([staticFetch, apiFetch]).then(function (results) {
      var apiPack = results[1];
      var apiVer =
        apiPack && apiPack.j && apiPack.j.version ? String(apiPack.j.version).trim() : '';
      if (apiVer) {
        tfVerNum.textContent = apiVer;
        if (wrap) {
          if (staticVer && staticVer !== apiVer) {
            wrap.setAttribute(
              'title',
              'API reports ' +
                apiVer +
                '; this admin bundle is ' +
                staticVer +
                '. Redeploy the backend or check so-api origin if that is unexpected.'
            );
          } else {
            wrap.removeAttribute('title');
          }
        }
        return;
      }
      if (staticVer) {
        tfVerNum.textContent = staticVer;
        if (wrap) {
          wrap.setAttribute(
            'title',
            'Could not load /api/version from the configured API host; showing app-version.json from this page origin.'
          );
        }
        return;
      }
      tfVerNum.textContent = '(n/a)';
      if (wrap) wrap.removeAttribute('title');
    });
  }

  function shortDisplayId(raw) {
    var s = String(raw || '');
    if (/^\d+$/.test(s)) return s;
    var hex = s.replace(/-/g, '');
    if (hex.length >= 8) {
      var n = parseInt(hex.slice(0, 8), 16);
      if (isFinite(n)) return String(100000 + (n % 900000));
    }
    return s.slice(0, 8) || '—';
  }

  function displayNameFromEmail(email) {
    var e = String(email || '').trim();
    var at = e.indexOf('@');
    return at > 0 ? e.slice(0, at) : e || '—';
  }

  function decodeJwtEmail(token) {
    try {
      var parts = String(token || '').split('.');
      if (parts.length < 2) return '';
      var payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      while (payload.length % 4) payload += '=';
      var json = JSON.parse(atob(payload));
      return typeof json.email === 'string' ? json.email : '';
    } catch (e) {
      return '';
    }
  }

  function decodeJwtIsOperator(token) {
    try {
      var parts = String(token || '').split('.');
      if (parts.length < 2) return false;
      var payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      while (payload.length % 4) payload += '=';
      var json = JSON.parse(atob(payload));
      return json.isOperator === true;
    } catch (e) {
      return false;
    }
  }

  function isPortalAdminSignedIn() {
    return decodeJwtIsOperator(getPortalJwt());
  }

  function tryRestorePortalAdminWorkspace() {
    /* Portal JWT alone cannot open cookie-gated clinic/hotel HTML; bootstrap must succeed first. */
    return false;
  }

  function applyUsersView() {
    var users = cachedUsers.slice();
    var q = usersSearch.trim().toLowerCase();
    if (q) {
      users = users.filter(function (u) {
        var blob = [u.email, u.reportSlug, u.id, u.displayName, u.country, u.lastLoginIp]
          .join(' ')
          .toLowerCase();
        return blob.indexOf(q) >= 0;
      });
    }
    if (usersFilter === 'active') {
      users = users.filter(function (u) {
        return u.active !== false;
      });
    } else if (usersFilter === 'pending') {
      users = [];
    }
    if (usersSort === 'name') {
      users.sort(function (a, b) {
        return userDisplayName(a).localeCompare(userDisplayName(b));
      });
    } else {
      users.sort(function (a, b) {
        return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
      });
    }
    return users;
  }

  function userDisplayName(user) {
    if (user && user.displayName) return String(user.displayName);
    return displayNameFromEmail(user && user.email);
  }

  function yesNoLabel(value) {
    return value ? 'Yes' : 'No';
  }

  function formatSpendEarned(user) {
    var spend = Number(user && user.spend) || 0;
    var earned = Number(user && user.earned) || 0;
    return spend + ' / ' + earned;
  }

  function formatDurationMs(ms) {
    if (ms == null || !Number.isFinite(Number(ms))) return '—';
    var minutes = Math.max(1, Math.round(Number(ms) / 60000));
    return minutes + ' min';
  }

  function formatLocation(user) {
    var parts = [];
    if (user && user.lastLoginCity) parts.push(String(user.lastLoginCity));
    if (user && user.country) parts.push(String(user.country));
    if (user && user.lastLoginRegion && parts.indexOf(String(user.lastLoginRegion)) === -1) {
      parts.push(String(user.lastLoginRegion));
    }
    return parts.length ? parts.join(', ') : '—';
  }

  function renderUserTelemetryHtml(telemetry) {
    var sessions = (telemetry && telemetry.sessions) || [];
    var events = (telemetry && telemetry.events) || [];
    var sessionHtml = sessions.length
      ? '<ul class="tf-admin-telemetry__list">' +
        sessions
          .map(function (s) {
            return (
              '<li><strong>' +
              escapeHtml(formatAdminTs(s.startedAt) || '—') +
              '</strong> · ' +
              escapeHtml(formatDurationMs(s.durationMs)) +
              ' · IP ' +
              escapeHtml(s.ip || '—') +
              ' · ' +
              escapeHtml([s.city, s.region, s.country].filter(Boolean).join(', ') || '—') +
              (s.userAgent ? '<br /><span class="tf-admin-muted">' + escapeHtml(s.userAgent) + '</span>' : '') +
              '</li>'
            );
          })
          .join('') +
        '</ul>'
      : '<p class="tf-admin-muted">No login sessions recorded yet.</p>';
    var eventHtml = events.length
      ? '<ul class="tf-admin-telemetry__list">' +
        events
          .map(function (e) {
            return (
              '<li><strong>' +
              escapeHtml(e.type || 'event') +
              '</strong> · ' +
              escapeHtml(formatAdminTs(e.createdAt) || '—') +
              ' · ' +
              escapeHtml(e.pagePath || '—') +
              (e.durationMs != null ? ' · ' + escapeHtml(formatDurationMs(e.durationMs)) : '') +
              '</li>'
            );
          })
          .join('') +
        '</ul>'
      : '<p class="tf-admin-muted">No page activity recorded yet.</p>';
    return (
      '<section class="tf-admin-telemetry">' +
      '<h3 class="admin-panel__title mono">Login sessions</h3>' +
      sessionHtml +
      '<h3 class="admin-panel__title mono" style="margin-top:1.5rem">Page activity</h3>' +
      eventHtml +
      '</section>'
    );
  }

  function loadUserTelemetrySection(user) {
    var mount = document.getElementById('adminUserTelemetry');
    if (!mount || !user || !user.id) return;
    mount.innerHTML = '<p class="tf-admin-muted mono">Loading activity…</p>';
    fetch(api('/api/user-accounts/' + encodeURIComponent(user.id) + '/telemetry'), {
      method: 'GET',
      credentials: apiCred(),
      headers: { Authorization: 'Bearer ' + getAdminBearer() },
    })
      .then(function (r) {
        return r.json().then(function (j) {
          return { ok: r.ok, j: j };
        });
      })
      .then(function (x) {
        if (!x.ok) {
          mount.innerHTML =
            '<p class="tf-admin-muted mono">Activity is unavailable until the Node API is running on this host.</p>';
          return;
        }
        mount.innerHTML = renderUserTelemetryHtml(x.j);
      })
      .catch(function () {
        mount.innerHTML = '<p class="tf-admin-muted mono">Could not load activity.</p>';
      });
  }

  function openUserEditProfile(user) {
    if (!panel || !panelTitle || !panelBody) return;
    if (!user || !user.id) return;
    if (document.getElementById('adminMainDefault')) document.getElementById('adminMainDefault').classList.add('is-hidden');
    panelTitle.textContent = 'Edit profile';
    var adminToken = getAdminBearer();
    panelBody.innerHTML =
      (adminToken
        ? ''
        : '<p class="admin-panel__body mono is-error">Sign in on the Node host (email + password) to save profile changes.</p>') +
      '<p class="admin-panel__body mono">Portal user <strong>' +
      escapeHtml(user.email) +
      '</strong> · report slug <code>' +
      escapeHtml(user.reportSlug) +
      '</code> · logins <strong>' +
      escapeHtml(String(Number(user.loginCount) || 0)) +
      '</strong> · last seen <strong>' +
      escapeHtml(formatAdminTs(user.lastSeenAt) || '—') +
      '</strong>.</p>' +
      '<p class="admin-panel__body mono">Last login IP <code>' +
      escapeHtml(user.lastLoginIp || '—') +
      '</code> · location <strong>' +
      escapeHtml(formatLocation(user)) +
      '</strong>.</p>' +
      '<form id="adminUserProfileForm" class="portal-form" style="max-width: 32rem; margin-top: 1rem;">' +
      '<label><span class="mono">DISPLAY NAME</span><input type="text" name="displayName" required value="' +
      escapeHtml(userDisplayName(user)) +
      '" /></label>' +
      '<label><span class="mono">GENDER</span><input type="text" name="gender" placeholder="Optional" value="' +
      escapeHtml(user.gender || '') +
      '" /></label>' +
      '<label><span class="mono">COUNTRY</span><input type="text" name="country" maxlength="2" placeholder="e.g. US" value="' +
      escapeHtml(user.country || '') +
      '" /></label>' +
      '<label><span class="mono">LAST LOGIN CITY</span><input type="text" value="' +
      escapeHtml(user.lastLoginCity || '—') +
      '" readonly /></label>' +
      '<label><span class="mono">LAST LOGIN REGION</span><input type="text" value="' +
      escapeHtml(user.lastLoginRegion || '—') +
      '" readonly /></label>' +
      '<label><span class="mono">LAST USER AGENT</span><input type="text" value="' +
      escapeHtml(user.lastUserAgent || '—') +
      '" readonly /></label>' +
      '<label><span class="mono">ACTIVE</span><select name="active"><option value="true"' +
      (user.active !== false ? ' selected' : '') +
      '>Yes</option><option value="false"' +
      (user.active === false ? ' selected' : '') +
      '>No</option></select></label>' +
      '<label><span class="mono">ADMIN</span><select name="admin"><option value="false"' +
      (!user.admin ? ' selected' : '') +
      '>No</option><option value="true"' +
      (user.admin ? ' selected' : '') +
      '>Yes</option></select></label>' +
      '<label><span class="mono">PLUS</span><select name="plus"><option value="false"' +
      (!user.plus ? ' selected' : '') +
      '>No</option><option value="true"' +
      (user.plus ? ' selected' : '') +
      '>Yes</option></select></label>' +
      '<label><span class="mono">SPEND</span><input type="number" name="spend" min="0" step="1" value="' +
      escapeHtml(String(Number(user.spend) || 0)) +
      '" /></label>' +
      '<label><span class="mono">EARNED</span><input type="number" name="earned" min="0" step="1" value="' +
      escapeHtml(String(Number(user.earned) || 0)) +
      '" /></label>' +
      '<button type="submit" class="btn btn--primary">Save profile</button>' +
      '<p class="portal-form__hint mono" id="adminUserProfileHint"></p></form>' +
      '<div id="adminUserTelemetry" class="tf-admin-telemetry-wrap mono"></div>' +
      '<p class="admin-panel__actions"><button type="button" class="btn btn--ghost mono" id="stubBackToUsers">← Back to users</button></p>';
    var back = document.getElementById('stubBackToUsers');
    if (back) {
      back.addEventListener('click', function () {
        panel.classList.add('is-hidden');
        if (document.getElementById('adminMainDefault')) document.getElementById('adminMainDefault').classList.remove('is-hidden');
        window.scrollTo(0, 0);
      });
    }
    var profileForm = document.getElementById('adminUserProfileForm');
    var profileHint = document.getElementById('adminUserProfileHint');
    if (profileForm && !adminToken) {
      profileForm.querySelectorAll('input, select, button').forEach(function (el) {
        el.disabled = true;
      });
    }
    if (profileForm) {
      profileForm.addEventListener('submit', function (e) {
        e.preventDefault();
        if (profileHint) {
          profileHint.textContent = 'Saving…';
          profileHint.className = 'portal-form__hint mono';
        }
        var fd = new FormData(profileForm);
        var body = {
          displayName: (fd.get('displayName') || '').toString().trim(),
          gender: (fd.get('gender') || '').toString().trim() || null,
          country: (fd.get('country') || '').toString().trim(),
          active: (fd.get('active') || 'true') === 'true',
          admin: (fd.get('admin') || 'false') === 'true',
          plus: (fd.get('plus') || 'false') === 'true',
          spend: Number(fd.get('spend') || 0),
          earned: Number(fd.get('earned') || 0),
        };
        fetch(api('/api/user-accounts/' + encodeURIComponent(user.id)), {
          method: 'PATCH',
          credentials: apiCred(),
          headers: {
            Authorization: 'Bearer ' + getAdminBearer(),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        })
          .then(function (r) {
            return r.json().then(function (j) {
              return { ok: r.ok, j: j };
            });
          })
          .then(function (x) {
            if (!x.ok) {
              if (profileHint) {
                profileHint.textContent = (x.j && x.j.error) || 'Could not save profile.';
                profileHint.className = 'portal-form__hint mono is-error';
              }
              return;
            }
            if (profileHint) {
              profileHint.textContent = 'Profile saved.';
              profileHint.className = 'portal-form__hint mono is-ok';
            }
            loadWorkQueue();
          })
          .catch(function () {
            if (profileHint) {
              profileHint.textContent = 'Network error.';
              profileHint.className = 'portal-form__hint mono is-error';
            }
          });
      });
    }
    loadUserTelemetrySection(user);
    panel.classList.remove('is-hidden');
    window.scrollTo(0, 0);
  }

  function renderTfUsersTable(data) {
    var tb = document.getElementById('tfUsersTbody');
    var uh = document.getElementById('usersTableHint');
    var paging = document.getElementById('usersPaging');
    var pendEl = document.getElementById('pendingRegBody');
    if (!tb) return;
    var users = (data && (data.users || data.clinicUsers)) || [];
    var pending = (data && data.pendingRegistrations) || [];
    cachedUsers = users;
    cachedPending = pending;
    users = applyUsersView();
    if (uh) {
      uh.textContent =
        users.length === 0
          ? usersFilter === 'pending'
            ? 'Use the pending confirmations section below.'
            : 'No confirmed portal users yet.'
          : 'Confirmed portal users.';
    }
    if (paging) paging.textContent = users.length + ' users · page 1 / 1';
    if (!users.length) {
      tb.innerHTML =
        '<tr><td colspan="14" style="opacity:0.85">No users yet. Use <strong>User reports</strong> in the nav to add one.</td></tr>';
    } else {
      tb.innerHTML = users
        .map(function (u) {
          var idDisp = shortDisplayId(u.id);
          var reportUrl = '/clinics/report.html?slug=' + encodeURIComponent(u.reportSlug);
          var name = userDisplayName(u);
          return (
            '<tr>' +
            '<td>' +
            escapeHtml(idDisp) +
            '</td>' +
            '<td>' +
            escapeHtml(u.email) +
            '</td>' +
            '<td>' +
            escapeHtml(name) +
            '</td>' +
            '<td>' +
            escapeHtml(u.gender || '—') +
            '</td>' +
            '<td>' +
            escapeHtml(yesNoLabel(u.active !== false)) +
            '</td>' +
            '<td>' +
            escapeHtml(yesNoLabel(!!u.admin)) +
            '</td>' +
            '<td>' +
            escapeHtml(yesNoLabel(!!u.plus)) +
            '</td>' +
            '<td>' +
            escapeHtml(formatSpendEarned(u)) +
            '</td>' +
            '<td>' +
            escapeHtml(formatAdminTs(u.lastLoginAt) || '—') +
            '</td>' +
            '<td>' +
            escapeHtml(u.lastLoginIp || '—') +
            '</td>' +
            '<td>' +
            escapeHtml(formatLocation(u)) +
            '</td>' +
            '<td>' +
            escapeHtml(String(Number(u.loginCount) || 0)) +
            '</td>' +
            '<td>' +
            escapeHtml(formatAdminTs(u.createdAt)) +
            '</td>' +
            '<td><button type="button" class="tf-admin-toolbar__btn js-edit-user" data-user-id="' +
            escapeHtml(String(u.id)) +
            '">Edit profile</button> · <button type="button" class="tf-admin-toolbar__btn js-reset-user-pw" data-user-id="' +
            escapeHtml(String(u.id)) +
            '" data-user-email="' +
            escapeHtml(String(u.email || '')) +
            '">Reset password</button> · <a href="' +
            reportUrl +
            '">Open report</a></td>' +
            '</tr>'
          );
        })
        .join('');
      tb.querySelectorAll('.js-edit-user').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var uid = btn.getAttribute('data-user-id');
          var match = cachedUsers.filter(function (u) {
            return String(u.id) === String(uid);
          })[0];
          if (match) openUserEditProfile(match);
        });
      });
      tb.querySelectorAll('.js-reset-user-pw').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var uid = btn.getAttribute('data-user-id');
          var em = btn.getAttribute('data-user-email') || '';
          if (!uid) return;
          var pw = window.prompt(
            'New portal password for ' + (em || 'this user') + ' (min 8 characters):'
          );
          if (pw === null) return;
          pw = String(pw);
          if (pw.length < 8) {
            window.alert('Password must be at least 8 characters.');
            return;
          }
          var mustChange = window.confirm(
            'Require password change on next sign-in? OK = yes, Cancel = no.'
          );
          var token = getAdminBearer();
          if (!token) {
            window.alert('Sign in on the Node host with operator credentials first.');
            return;
          }
          btn.disabled = true;
          fetch(api('/api/user-accounts/' + encodeURIComponent(uid) + '/password'), {
            method: 'PUT',
            credentials: apiCred(),
            headers: {
              Authorization: 'Bearer ' + token,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ password: pw, passwordMustChange: mustChange }),
          })
            .then(function (r) {
              return r.json().then(function (j) {
                return { ok: r.ok, j: j };
              });
            })
            .then(function (x) {
              btn.disabled = false;
              if (!x.ok) {
                window.alert((x.j && x.j.error) || 'Could not reset password.');
                return;
              }
              window.alert(
                'Portal password updated for ' +
                  (em || 'user') +
                  '. They can sign in at /login.html' +
                  (mustChange ? ' and will be prompted to choose a new password.' : '.')
              );
            })
            .catch(function () {
              btn.disabled = false;
              window.alert('Network error while resetting password.');
            });
        });
      });
    }
    if (pendEl) {
      if (!pending.length) {
        pendEl.innerHTML = '<p class="tf-admin-muted">No pending confirmations.</p>';
      } else {
        pendEl.innerHTML =
          '<ul style="margin:0;padding-left:1.1rem;line-height:1.65;font-size:0.78rem">' +
          pending
            .map(function (p) {
              return (
                '<li><strong>' +
                escapeHtml(p.email) +
                '</strong> · slug <span style="color:var(--amber)">' +
                escapeHtml(p.reportSlug) +
                '</span> · ' +
                escapeHtml(formatAdminTs(p.createdAt)) +
                '</li>'
              );
            })
            .join('') +
          '</ul>';
      }
    }
  }

  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function openDeployLogPanel() {
    if (!panel || !panelTitle || !panelBody) return;
    if (document.getElementById('adminMainDefault')) document.getElementById('adminMainDefault').classList.add('is-hidden');
    panelTitle.textContent = 'Deploy log';
    panelBody.innerHTML =
      '<p class="admin-panel__body mono" id="deployLogStatus">Loading deployment status…</p>' +
      '<pre class="mono tf-admin-deploy-log" id="deployLogOut"></pre>' +
      '<p class="admin-panel__actions"><a href="/admin/users" class="btn btn--ghost mono">← Users & payouts</a></p>';
    panel.classList.remove('is-hidden');
    window.scrollTo(0, 0);

    var statusEl = document.getElementById('deployLogStatus');
    var outEl = document.getElementById('deployLogOut');
    var lines = [];
    lines.push('Page origin: ' + window.location.origin);
    lines.push('Loaded at: ' + new Date().toISOString());

    function finish() {
      if (outEl) outEl.textContent = lines.join('\n');
      if (statusEl) statusEl.textContent = 'Deployment status for this admin session.';
    }

    Promise.all([
      fetch(api('/api/version'), { cache: 'no-store', credentials: apiCred() }).then(function (r) {
        return r.json().then(function (j) {
          return { ok: r.ok, status: r.status, json: j };
        });
      }),
      fetch(api('/api/debug/user-store'), { cache: 'no-store', credentials: apiCred() }).then(function (r) {
        return r.json().then(function (j) {
          return { ok: r.ok, status: r.status, json: j };
        });
      }),
      fetch(api('/api/admin/work-queue'), {
        cache: 'no-store',
        credentials: apiCred(),
        headers: { Authorization: 'Bearer ' + getAdminBearer() },
      }).then(function (r) {
        return r.json().then(function (j) {
          return { ok: r.ok, status: r.status, json: j };
        });
      }),
    ])
      .then(function (results) {
        var version = results[0];
        var store = results[1];
        var queue = results[2];
        lines.push('GET /api/version: HTTP ' + version.status + (version.json && version.json.version ? ' · version=' + version.json.version : ''));
        lines.push('GET /api/debug/user-store: HTTP ' + store.status);
        if (store.json && store.json.storage) {
          lines.push('User store backend: ' + (store.json.storage.backend || 'n/a'));
          lines.push(
            'Users: confirmed=' +
              (store.json.storage.confirmedUserCount != null ? store.json.storage.confirmedUserCount : 'n/a') +
              ' · pending=' +
              (store.json.storage.pendingRegistrationCount != null ? store.json.storage.pendingRegistrationCount : 'n/a')
          );
          if (store.json.storage.tables && store.json.storage.tables.length) {
            lines.push('Postgres tables: ' + store.json.storage.tables.join(', '));
          }
        }
        if (store.json && store.json.deploy) {
          lines.push('DATABASE_URL on server: ' + (store.json.deploy.databaseUrlConfigured ? 'configured' : 'not set'));
          if (store.json.deploy.postgresPoolActive != null) {
            lines.push('Postgres pool active: ' + String(!!store.json.deploy.postgresPoolActive));
          }
          if (store.json.deploy.postgresConfiguredButUnavailable) {
            lines.push(
              'WARNING: DATABASE_URL is set but Postgres did not connect at startup. User/site data may be JSON fallback; site uploads to disk are refused until DB init succeeds.'
            );
          }
          lines.push('Node runtime: ' + (store.json.deploy.nodeVersion || 'n/a'));
          lines.push('DATA_DIR: ' + (store.json.deploy.dataDir || 'n/a'));
          lines.push('Self-register: ' + String(!!store.json.deploy.portalSelfRegister));
          lines.push('Resend configured: ' + String(!!store.json.deploy.resendConfigured));
        }
        lines.push('GET /api/admin/work-queue: HTTP ' + queue.status);
        if (queue.json && queue.json.generatedAt) {
          lines.push('Work queue generated at: ' + queue.json.generatedAt);
        }
        if (queue.json && Array.isArray(queue.json.managedPages)) {
          lines.push('Managed pages on this host:');
          queue.json.managedPages.forEach(function (page) {
            lines.push(
              '  · ' +
                (page.path || page.relPath || 'page') +
                (page.mtimeMs != null ? ' · mtime=' + formatAdminTs(new Date(page.mtimeMs).toISOString()) : '')
            );
          });
        } else if (queue.status === 401) {
          lines.push('Admin work queue requires a server-issued admin JWT (sign in with operator password on this host).');
        }
        finish();
      })
      .catch(function () {
        lines.push('Could not load deployment status from this host.');
        finish();
      });
  }

  function openBrandingPanel() {
    if (!panel || !panelTitle || !panelBody) return;
    siteAppearancePanelGen += 1;
    var appearanceMountGen = siteAppearancePanelGen;
    function isSiteAppearancePanelStale() {
      return appearanceMountGen !== siteAppearancePanelGen;
    }
    var siteAppearanceFormHydrated = false;
    if (document.getElementById('adminMainDefault')) document.getElementById('adminMainDefault').classList.add('is-hidden');
    panelTitle.textContent = 'Site appearance';
    panelBody.innerHTML =
      '<div class="so-site-appearance" id="soSiteAppearanceRoot">' +
      '<div class="so-site-appearance__cols-bar" role="toolbar" aria-label="Card grid columns">' +
      '<button type="button" class="tf-admin-toolbar__btn so-site-appearance__cols-btn" data-so-appearance-cols="4" aria-pressed="false">4</button>' +
      '<button type="button" class="tf-admin-toolbar__btn so-site-appearance__cols-btn" data-so-appearance-cols="5" aria-pressed="false">5</button>' +
      '<button type="button" class="tf-admin-toolbar__btn so-site-appearance__cols-btn" data-so-appearance-cols="6" aria-pressed="false">6</button>' +
      '<button type="button" class="tf-admin-toolbar__btn so-site-appearance__cols-btn" data-so-appearance-cols="7" aria-pressed="false">7</button>' +
      '</div>' +
      '<div class="so-site-appearance__bulk" role="toolbar" aria-label="Bulk actions for hero images">' +
      '<span class="so-site-appearance__bulk-label mono">Selection</span>' +
      '<button type="button" class="tf-admin-toolbar__btn" id="soSiteAppearSelectAll">Select all</button>' +
      '<button type="button" class="tf-admin-toolbar__btn" id="soSiteAppearSelectNone">Clear selection</button>' +
      '<button type="button" class="tf-admin-toolbar__btn" id="soSiteAppearClearSelected">Clear URLs for selected</button>' +
      '</div>' +
      '<div class="so-site-appearance__grid">' +
      '<article class="so-site-appearance__card">' +
      '<div class="so-site-appearance__preview">' +
      '<img id="soSiteNavLogoPreview" class="so-site-appearance__preview-img is-hidden" alt="" decoding="async" />' +
      '<div id="soSiteNavLogoPreviewEmpty" class="so-site-appearance__preview-empty">No preview</div>' +
      '</div>' +
      '<div class="so-site-appearance__card-fields">' +
      '<h3 class="so-site-appearance__card-title">Nav logo</h3>' +
      '<p class="so-site-appearance__card-meta mono">Header · <code>img.brand-logo</code> · default <code>/assets/logo.png</code></p>' +
      '<div class="so-site-appearance__field-actions">' +
      '<label class="so-site-appearance__pick"><input type="checkbox" class="so-site-appearance__cb" data-so-appearance-sel="nav" aria-label="Select nav logo" /> <span class="mono">Select</span></label>' +
      '<input type="file" accept="image/png,image/jpeg,image/jpg,image/webp,image/gif,image/heic,image/heif,.heic,.heif" class="is-hidden" id="soSiteNavLogoFile" />' +
      '<button type="button" class="tf-admin-toolbar__btn" id="soSiteNavLogoPickBtn">Upload…</button>' +
      '<button type="button" class="tf-admin-toolbar__btn" id="soSiteNavLogoClearBtn">Clear URL</button>' +
      '<button type="button" class="tf-admin-toolbar__btn" id="soSiteNavLogoDeleteBtn">Delete</button>' +
      '</div>' +
      '<label class="portal-form__label" for="soSiteNavLogoUrl">Nav logo URL</label>' +
      '<input class="portal-form__input mono" type="text" id="soSiteNavLogoUrl" autocomplete="off" placeholder="/assets/logo.png" />' +
      '<label class="portal-form__label" for="soSiteNavLogoAlt">Nav logo alt text</label>' +
      '<input class="portal-form__input" type="text" id="soSiteNavLogoAlt" maxlength="180" autocomplete="off" />' +
      '</div></article>' +
      '<article class="so-site-appearance__card">' +
      '<div class="so-site-appearance__preview">' +
      '<img id="soSiteJackAvatarPreview" class="so-site-appearance__preview-img is-hidden" alt="" decoding="async" />' +
      '<div id="soSiteJackAvatarPreviewEmpty" class="so-site-appearance__preview-empty">No preview</div>' +
      '</div>' +
      '<div class="so-site-appearance__card-fields">' +
      '<h3 class="so-site-appearance__card-title">Jack avatar</h3>' +
      '<p class="so-site-appearance__card-meta mono">index.html Jack block · <code>img.so-b2b__jack-photo</code> · default <code>/assets/jack-avatar.png</code> when that file exists on the server</p>' +
      '<div class="so-site-appearance__field-actions">' +
      '<label class="so-site-appearance__pick"><input type="checkbox" class="so-site-appearance__cb" data-so-appearance-sel="jack" aria-label="Select Jack avatar" /> <span class="mono">Select</span></label>' +
      '<input type="file" accept="image/png,image/jpeg,image/jpg,image/webp,image/gif,image/heic,image/heif,.heic,.heif" class="is-hidden" id="soSiteJackAvatarFile" />' +
      '<button type="button" class="tf-admin-toolbar__btn" id="soSiteJackAvatarPickBtn">Upload…</button>' +
      '<button type="button" class="tf-admin-toolbar__btn" id="soSiteJackAvatarClearBtn">Clear URL</button>' +
      '<button type="button" class="tf-admin-toolbar__btn" id="soSiteJackAvatarDeleteBtn">Delete</button>' +
      '</div>' +
      '<label class="portal-form__label" for="soSiteJackAvatarUrl">Jack avatar URL</label>' +
      '<input class="portal-form__input mono" type="text" id="soSiteJackAvatarUrl" autocomplete="off" placeholder="/assets/jack-avatar.png" />' +
      '<label class="portal-form__label" for="soSiteJackAvatarAlt">Jack avatar alt</label>' +
      '<input class="portal-form__input" type="text" id="soSiteJackAvatarAlt" maxlength="180" autocomplete="off" />' +
      '</div></article>' +
      '<article class="so-site-appearance__card">' +
      '<div class="so-site-appearance__preview">' +
      '<img id="soSiteHomeImgPreview" class="so-site-appearance__preview-img is-hidden" alt="" decoding="async" />' +
      '<div id="soSiteHomeImgPreviewEmpty" class="so-site-appearance__preview-empty">No preview</div>' +
      '</div>' +
      '<div class="so-site-appearance__card-fields">' +
      '<h3 class="so-site-appearance__card-title">Homepage hero</h3>' +
      '<p class="so-site-appearance__card-meta mono">index.html hero</p>' +
      '<div class="so-site-appearance__field-actions">' +
      '<label class="so-site-appearance__pick"><input type="checkbox" class="so-site-appearance__cb" data-so-appearance-sel="home" aria-label="Select homepage hero" /> <span class="mono">Select</span></label>' +
      '<input type="file" accept="image/png,image/jpeg,image/jpg,image/webp,image/gif,image/heic,image/heif,.heic,.heif" class="is-hidden" id="soSiteHomeImgFile" />' +
      '<button type="button" class="tf-admin-toolbar__btn" id="soSiteHomeImgPickBtn">Upload…</button>' +
      '<button type="button" class="tf-admin-toolbar__btn" id="soSiteHomeImgClearBtn">Clear URL</button>' +
      '<button type="button" class="tf-admin-toolbar__btn" id="soSiteHomeImgDeleteBtn">Delete</button>' +
      '</div>' +
      '<label class="portal-form__label" for="soSiteHomeImgUrl">Image URL</label>' +
      '<input class="portal-form__input mono" type="text" id="soSiteHomeImgUrl" autocomplete="off" />' +
      '<label class="portal-form__label" for="soSiteHomeImgAlt">Alt text</label>' +
      '<input class="portal-form__input" type="text" id="soSiteHomeImgAlt" maxlength="500" autocomplete="off" />' +
      '</div></article>' +
      '<article class="so-site-appearance__card">' +
      '<div class="so-site-appearance__preview">' +
      '<img id="soSiteHeroDecoTrPreview" class="so-site-appearance__preview-img is-hidden" alt="" decoding="async" />' +
      '<div id="soSiteHeroDecoTrPreviewEmpty" class="so-site-appearance__preview-empty">No preview</div>' +
      '</div>' +
      '<div class="so-site-appearance__card-fields">' +
      '<h3 class="so-site-appearance__card-title">Hero corner (top right)</h3>' +
      '<p class="so-site-appearance__card-meta mono">index.html · <code>.so-b2b__hero-deco--tr</code> · default <code>/assets/hero-corner-arc.svg</code> · clear URL to hide</p>' +
      '<div class="so-site-appearance__field-actions">' +
      '<label class="so-site-appearance__pick"><input type="checkbox" class="so-site-appearance__cb" data-so-appearance-sel="decoTr" aria-label="Select hero corner top-right" /> <span class="mono">Select</span></label>' +
      '<input type="file" accept="image/png,image/jpeg,image/jpg,image/webp,image/gif,image/svg+xml,.svg" class="is-hidden" id="soSiteHeroDecoTrFile" />' +
      '<button type="button" class="tf-admin-toolbar__btn" id="soSiteHeroDecoTrPickBtn">Upload…</button>' +
      '<button type="button" class="tf-admin-toolbar__btn" id="soSiteHeroDecoTrClearBtn">Clear URL</button>' +
      '<button type="button" class="tf-admin-toolbar__btn" id="soSiteHeroDecoTrDeleteBtn">Delete</button>' +
      '</div>' +
      '<label class="portal-form__label" for="soSiteHeroDecoTrUrl">Image URL</label>' +
      '<input class="portal-form__input mono" type="text" id="soSiteHeroDecoTrUrl" autocomplete="off" placeholder="/assets/hero-corner-arc.svg" />' +
      '<label class="portal-form__label" for="soSiteHeroDecoTrOp">Opacity (0–1)</label>' +
      '<input class="portal-form__input mono" type="number" id="soSiteHeroDecoTrOp" min="0" max="1" step="0.01" />' +
      '</div></article>' +
      '<article class="so-site-appearance__card">' +
      '<div class="so-site-appearance__preview so-site-appearance__preview--hero-deco-bl">' +
      '<img id="soSiteHeroDecoBlPreview" class="so-site-appearance__preview-img is-hidden" alt="" decoding="async" />' +
      '<div id="soSiteHeroDecoBlPreviewEmpty" class="so-site-appearance__preview-empty">No preview</div>' +
      '</div>' +
      '<div class="so-site-appearance__card-fields">' +
      '<h3 class="so-site-appearance__card-title">Hero corner (bottom left)</h3>' +
      '<p class="so-site-appearance__card-meta mono">index.html · <code>.so-b2b__hero-deco--bl</code> · default <code>/assets/hero-corner-arc-bl.svg</code> · clear URL to hide</p>' +
      '<div class="so-site-appearance__field-actions">' +
      '<label class="so-site-appearance__pick"><input type="checkbox" class="so-site-appearance__cb" data-so-appearance-sel="decoBl" aria-label="Select hero corner bottom-left" /> <span class="mono">Select</span></label>' +
      '<input type="file" accept="image/png,image/jpeg,image/jpg,image/webp,image/gif,image/svg+xml,.svg" class="is-hidden" id="soSiteHeroDecoBlFile" />' +
      '<button type="button" class="tf-admin-toolbar__btn" id="soSiteHeroDecoBlPickBtn">Upload…</button>' +
      '<button type="button" class="tf-admin-toolbar__btn" id="soSiteHeroDecoBlClearBtn">Clear URL</button>' +
      '<button type="button" class="tf-admin-toolbar__btn" id="soSiteHeroDecoBlDeleteBtn">Delete</button>' +
      '</div>' +
      '<label class="portal-form__label" for="soSiteHeroDecoBlUrl">Image URL</label>' +
      '<input class="portal-form__input mono" type="text" id="soSiteHeroDecoBlUrl" autocomplete="off" placeholder="/assets/hero-corner-arc-bl.svg" />' +
      '<label class="portal-form__label" for="soSiteHeroDecoBlOp">Opacity (0–1)</label>' +
      '<input class="portal-form__input mono" type="number" id="soSiteHeroDecoBlOp" min="0" max="1" step="0.01" />' +
      '</div></article>' +
      '<article class="so-site-appearance__card">' +
      '<div class="so-site-appearance__preview">' +
      '<img id="soSitePropImgPreview" class="so-site-appearance__preview-img is-hidden" alt="" decoding="async" />' +
      '<div id="soSitePropImgPreviewEmpty" class="so-site-appearance__preview-empty">No preview</div>' +
      '</div>' +
      '<div class="so-site-appearance__card-fields">' +
      '<h3 class="so-site-appearance__card-title">Property</h3>' +
      '<p class="so-site-appearance__card-meta mono">property.html hero</p>' +
      '<div class="so-site-appearance__field-actions">' +
      '<label class="so-site-appearance__pick"><input type="checkbox" class="so-site-appearance__cb" data-so-appearance-sel="prop" aria-label="Select property hero" /> <span class="mono">Select</span></label>' +
      '<input type="file" accept="image/png,image/jpeg,image/jpg,image/webp,image/gif,image/heic,image/heif,.heic,.heif" class="is-hidden" id="soSitePropImgFile" />' +
      '<button type="button" class="tf-admin-toolbar__btn" id="soSitePropImgPickBtn">Upload…</button>' +
      '<button type="button" class="tf-admin-toolbar__btn" id="soSitePropImgClearBtn">Clear URL</button>' +
      '<button type="button" class="tf-admin-toolbar__btn" id="soSitePropImgDeleteBtn">Delete</button>' +
      '</div>' +
      '<label class="portal-form__label" for="soSitePropImgUrl">Image URL</label>' +
      '<input class="portal-form__input mono" type="text" id="soSitePropImgUrl" autocomplete="off" />' +
      '<label class="portal-form__label" for="soSitePropImgAlt">Alt text</label>' +
      '<input class="portal-form__input" type="text" id="soSitePropImgAlt" maxlength="500" autocomplete="off" />' +
      '</div></article>' +
      '<article class="so-site-appearance__card">' +
      '<div class="so-site-appearance__preview">' +
      '<img id="soSiteClinicImgPreview" class="so-site-appearance__preview-img is-hidden" alt="" decoding="async" />' +
      '<div id="soSiteClinicImgPreviewEmpty" class="so-site-appearance__preview-empty">No preview</div>' +
      '</div>' +
      '<div class="so-site-appearance__card-fields">' +
      '<h3 class="so-site-appearance__card-title">Clinics</h3>' +
      '<p class="so-site-appearance__card-meta mono">clinics.html hero</p>' +
      '<div class="so-site-appearance__field-actions">' +
      '<label class="so-site-appearance__pick"><input type="checkbox" class="so-site-appearance__cb" data-so-appearance-sel="clinic" aria-label="Select clinics hero" /> <span class="mono">Select</span></label>' +
      '<input type="file" accept="image/png,image/jpeg,image/jpg,image/webp,image/gif,image/heic,image/heif,.heic,.heif" class="is-hidden" id="soSiteClinicImgFile" />' +
      '<button type="button" class="tf-admin-toolbar__btn" id="soSiteClinicImgPickBtn">Upload…</button>' +
      '<button type="button" class="tf-admin-toolbar__btn" id="soSiteClinicImgClearBtn">Clear URL</button>' +
      '<button type="button" class="tf-admin-toolbar__btn" id="soSiteClinicImgDeleteBtn">Delete</button>' +
      '</div>' +
      '<label class="portal-form__label" for="soSiteClinicImgUrl">Image URL</label>' +
      '<input class="portal-form__input mono" type="text" id="soSiteClinicImgUrl" autocomplete="off" />' +
      '<label class="portal-form__label" for="soSiteClinicImgAlt">Alt text</label>' +
      '<input class="portal-form__input" type="text" id="soSiteClinicImgAlt" maxlength="500" autocomplete="off" />' +
      '</div></article>' +
      '<article class="so-site-appearance__card">' +
      '<div class="so-site-appearance__preview">' +
      '<img id="soSiteHotelImgPreview" class="so-site-appearance__preview-img is-hidden" alt="" decoding="async" />' +
      '<div id="soSiteHotelImgPreviewEmpty" class="so-site-appearance__preview-empty">No preview</div>' +
      '</div>' +
      '<div class="so-site-appearance__card-fields">' +
      '<h3 class="so-site-appearance__card-title">Hotels</h3>' +
      '<p class="so-site-appearance__card-meta mono">hotels.html hero</p>' +
      '<div class="so-site-appearance__field-actions">' +
      '<label class="so-site-appearance__pick"><input type="checkbox" class="so-site-appearance__cb" data-so-appearance-sel="hotel" aria-label="Select hotels hero" /> <span class="mono">Select</span></label>' +
      '<input type="file" accept="image/png,image/jpeg,image/jpg,image/webp,image/gif,image/heic,image/heif,.heic,.heif" class="is-hidden" id="soSiteHotelImgFile" />' +
      '<button type="button" class="tf-admin-toolbar__btn" id="soSiteHotelImgPickBtn">Upload…</button>' +
      '<button type="button" class="tf-admin-toolbar__btn" id="soSiteHotelImgClearBtn">Clear URL</button>' +
      '<button type="button" class="tf-admin-toolbar__btn" id="soSiteHotelImgDeleteBtn">Delete</button>' +
      '</div>' +
      '<label class="portal-form__label" for="soSiteHotelImgUrl">Image URL</label>' +
      '<input class="portal-form__input mono" type="text" id="soSiteHotelImgUrl" autocomplete="off" />' +
      '<label class="portal-form__label" for="soSiteHotelImgAlt">Alt text</label>' +
      '<input class="portal-form__input" type="text" id="soSiteHotelImgAlt" maxlength="500" autocomplete="off" />' +
      '</div></article>' +
      '</div>' +
      '<div class="so-site-appearance__footer">' +
      '<p class="portal-form__hint mono" id="soSiteAppearanceHint" style="margin:0;flex:1;min-width:12rem"></p>' +
      '<div class="admin-panel__actions" style="margin:0">' +
      '<a href="/admin/users" class="btn btn--ghost mono" id="soSiteAppearanceBack">← Users & payouts</a>' +
      '</div></div></div>';
    panel.classList.remove('is-hidden');
    window.scrollTo(0, 0);

    (function initSiteAppearanceGridCols() {
      var LS_KEY = 'so-site-appearance-cols';
      var root = document.getElementById('soSiteAppearanceRoot');
      if (!root) return;
      var stored = null;
      try {
        stored = localStorage.getItem(LS_KEY);
      } catch (e) {}
      var parsed = parseInt(stored, 10);
      var cols = [4, 5, 6, 7].indexOf(parsed) !== -1 ? parsed : 4;
      function apply(next) {
        cols = next;
        root.style.setProperty('--so-appearance-cols', String(cols));
        root.querySelectorAll('[data-so-appearance-cols]').forEach(function (btn) {
          var v = parseInt(btn.getAttribute('data-so-appearance-cols'), 10);
          var on = v === cols;
          btn.classList.toggle('is-active', on);
          btn.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
        try {
          localStorage.setItem(LS_KEY, String(cols));
        } catch (e) {}
      }
      apply(cols);
      root.addEventListener('click', function (ev) {
        var el = ev.target;
        if (!el || !el.closest) return;
        var btn = el.closest('[data-so-appearance-cols]');
        if (!btn || !root.contains(btn)) return;
        var c = parseInt(btn.getAttribute('data-so-appearance-cols'), 10);
        if ([4, 5, 6, 7].indexOf(c) !== -1) apply(c);
      });
    })();

    function siteAppearanceResolveUrl(raw) {
      var u = String(raw || '').trim();
      if (!u) return '';
      if (/^https?:\/\//i.test(u)) {
        try {
          var abs = new URL(u);
          var absPath = abs.pathname + (abs.search || '');
          if (absPath.indexOf('/api/site-uploads/') === 0 || absPath.indexOf('/assets/site-uploads/') === 0) {
            u = absPath;
          } else {
            return u;
          }
        } catch (eAbs) {
          return u;
        }
      }
      if (u.charAt(0) === '/') {
        /*
         * Admin uploads: legacy disk files under /assets/site-uploads/, or Postgres-backed
         * GET /api/site-uploads/<uuid> on the Node host. Bundled marketing assets stay on the static origin.
         */
        var siteUploadPrefixes = ['/assets/site-uploads/', '/api/site-uploads/'];
        var needsApiOrigin = false;
        for (var pi = 0; pi < siteUploadPrefixes.length; pi++) {
          if (u.indexOf(siteUploadPrefixes[pi]) === 0) {
            needsApiOrigin = true;
            break;
          }
        }
        if (needsApiOrigin && typeof soApiOrigin === 'function') {
          try {
            var apiOrigin = String(soApiOrigin() || '')
              .trim()
              .replace(/\/+$/, '');
            if (apiOrigin && /^https?:\/\//i.test(apiOrigin)) {
              var pageOrigin = window.location && window.location.origin ? window.location.origin : '';
              if (pageOrigin && new URL(apiOrigin).origin !== new URL(pageOrigin).origin) {
                return apiOrigin + u;
              }
            }
          } catch (e) {}
        }
        if (needsApiOrigin) return u;
        return (window.location && window.location.origin ? window.location.origin : '') + u;
      }
      return u;
    }

    function wireSitePreview(urlInput, imgEl, emptyEl) {
      if (!urlInput || !imgEl) return;
      function sync() {
        var src = siteAppearanceResolveUrl(urlInput.value);
        if (!src) {
          imgEl.removeAttribute('src');
          imgEl.classList.add('is-hidden');
          if (emptyEl) {
            emptyEl.textContent = 'No preview';
            emptyEl.classList.remove('is-hidden');
          }
          return;
        }
        if (emptyEl) {
          emptyEl.textContent = 'Loading…';
          emptyEl.classList.remove('is-hidden');
        }
        imgEl.classList.add('is-hidden');
        imgEl.src = src;
      }
      imgEl.addEventListener('load', function () {
        if (!siteAppearanceResolveUrl(urlInput.value)) return;
        /* Do not require naturalWidth: some SVG (and occasional WebP) report 0×0 in <img> while still painting. */
        imgEl.classList.remove('is-hidden');
        if (emptyEl) emptyEl.classList.add('is-hidden');
      });
      imgEl.addEventListener('error', function () {
        imgEl.classList.add('is-hidden');
        if (emptyEl) {
          emptyEl.textContent = 'Could not load';
          emptyEl.classList.remove('is-hidden');
        }
      });
      urlInput.addEventListener('input', sync);
      urlInput.addEventListener('change', sync);
      sync();
    }

    wireSitePreview(
      document.getElementById('soSiteNavLogoUrl'),
      document.getElementById('soSiteNavLogoPreview'),
      document.getElementById('soSiteNavLogoPreviewEmpty')
    );
    wireSitePreview(
      document.getElementById('soSiteJackAvatarUrl'),
      document.getElementById('soSiteJackAvatarPreview'),
      document.getElementById('soSiteJackAvatarPreviewEmpty')
    );
    wireSitePreview(
      document.getElementById('soSiteHomeImgUrl'),
      document.getElementById('soSiteHomeImgPreview'),
      document.getElementById('soSiteHomeImgPreviewEmpty')
    );
    wireSitePreview(
      document.getElementById('soSitePropImgUrl'),
      document.getElementById('soSitePropImgPreview'),
      document.getElementById('soSitePropImgPreviewEmpty')
    );
    wireSitePreview(
      document.getElementById('soSiteClinicImgUrl'),
      document.getElementById('soSiteClinicImgPreview'),
      document.getElementById('soSiteClinicImgPreviewEmpty')
    );
    wireSitePreview(
      document.getElementById('soSiteHotelImgUrl'),
      document.getElementById('soSiteHotelImgPreview'),
      document.getElementById('soSiteHotelImgPreviewEmpty')
    );
    wireSitePreview(
      document.getElementById('soSiteHeroDecoTrUrl'),
      document.getElementById('soSiteHeroDecoTrPreview'),
      document.getElementById('soSiteHeroDecoTrPreviewEmpty')
    );
    wireSitePreview(
      document.getElementById('soSiteHeroDecoBlUrl'),
      document.getElementById('soSiteHeroDecoBlPreview'),
      document.getElementById('soSiteHeroDecoBlPreviewEmpty')
    );

    var navLogoUrlEl = document.getElementById('soSiteNavLogoUrl');
    var navLogoAltEl = document.getElementById('soSiteNavLogoAlt');
    var jackUrlEl = document.getElementById('soSiteJackAvatarUrl');
    var jackAltEl = document.getElementById('soSiteJackAvatarAlt');
    var homeUrlEl = document.getElementById('soSiteHomeImgUrl');
    var homeAltEl = document.getElementById('soSiteHomeImgAlt');
    var urlEl = document.getElementById('soSitePropImgUrl');
    var altEl = document.getElementById('soSitePropImgAlt');
    var clinicUrlEl = document.getElementById('soSiteClinicImgUrl');
    var clinicAltEl = document.getElementById('soSiteClinicImgAlt');
    var hotelUrlEl = document.getElementById('soSiteHotelImgUrl');
    var hotelAltEl = document.getElementById('soSiteHotelImgAlt');
    var heroDecoTrUrlEl = document.getElementById('soSiteHeroDecoTrUrl');
    var heroDecoBlUrlEl = document.getElementById('soSiteHeroDecoBlUrl');
    var heroDecoTrOpEl = document.getElementById('soSiteHeroDecoTrOp');
    var heroDecoBlOpEl = document.getElementById('soSiteHeroDecoBlOp');
    var hintEl = document.getElementById('soSiteAppearanceHint');
    var SITE_APPEARANCE_DEFAULTS = {
      navLogoUrl: '/assets/logo.png',
      navLogoAlt: 'www.serviceopera.to',
      jackAvatarUrl: '/assets/jack-avatar.png',
      jackAvatarAlt: '',
      homePageImageUrl: '/assets/home-page-hero.png',
      homePageImageAlt: 'www.serviceopera.to — home',
      propertyPageImageUrl: '/assets/property-page-hero.png',
      propertyPageImageAlt: 'Property — www.serviceopera.to',
      clinicPageImageUrl: '/assets/clinics-page-hero.png',
      clinicPageImageAlt: 'Clinics — www.serviceopera.to',
      hotelPageImageUrl: '/assets/hotels-page-hero.png',
      hotelPageImageAlt: 'Hotels — www.serviceopera.to',
      heroDecoTopRightUrl: '/assets/hero-corner-arc.svg',
      heroDecoBottomLeftUrl: '/assets/hero-corner-arc-bl.svg',
      heroDecoTopRightOpacity: 0.12,
      heroDecoBottomLeftOpacity: 0.12,
    };
    /**
     * Hydrate the panel from API JSON. When `opts.force` is false (default GET), do not overwrite a
     * non-empty input that differs from the payload — avoids a slow initial GET arriving after upload
     * + PUT and wiping the new URL before autosave runs.
     */
    function applySiteAppearanceMerge(apiJson, opts) {
      var force = opts && opts.force;
      var o = apiJson && typeof apiJson === 'object' ? apiJson : {};
      function setInputUnlessLocalConflict(el, nextVal) {
        if (!el) return;
        var next = nextVal != null ? String(nextVal) : '';
        if (!force) {
          var cur = String(el.value || '').trim();
          var nextTrim = String(next).trim();
          if (cur !== '' && cur !== nextTrim) return;
        }
        el.value = next;
      }
      function pick(k) {
        var v = o[k];
        var t = v != null && String(v).trim() ? String(v).trim() : '';
        return t || (SITE_APPEARANCE_DEFAULTS[k] != null ? SITE_APPEARANCE_DEFAULTS[k] : '');
      }
      setInputUnlessLocalConflict(navLogoUrlEl, pick('navLogoUrl'));
      setInputUnlessLocalConflict(navLogoAltEl, pick('navLogoAlt'));
      setInputUnlessLocalConflict(jackUrlEl, pick('jackAvatarUrl'));
      setInputUnlessLocalConflict(jackAltEl, pick('jackAvatarAlt'));
      setInputUnlessLocalConflict(homeUrlEl, pick('homePageImageUrl'));
      setInputUnlessLocalConflict(homeAltEl, pick('homePageImageAlt'));
      setInputUnlessLocalConflict(urlEl, pick('propertyPageImageUrl'));
      setInputUnlessLocalConflict(altEl, pick('propertyPageImageAlt'));
      setInputUnlessLocalConflict(clinicUrlEl, pick('clinicPageImageUrl'));
      setInputUnlessLocalConflict(clinicAltEl, pick('clinicPageImageAlt'));
      setInputUnlessLocalConflict(hotelUrlEl, pick('hotelPageImageUrl'));
      setInputUnlessLocalConflict(hotelAltEl, pick('hotelPageImageAlt'));
      function pickOptionalImageUrl(k, def) {
        if (!(k in o)) return def;
        if (o[k] == null) return '';
        return String(o[k]).trim();
      }
      if (heroDecoTrUrlEl) {
        setInputUnlessLocalConflict(
          heroDecoTrUrlEl,
          pickOptionalImageUrl('heroDecoTopRightUrl', SITE_APPEARANCE_DEFAULTS.heroDecoTopRightUrl)
        );
      }
      if (heroDecoBlUrlEl) {
        setInputUnlessLocalConflict(
          heroDecoBlUrlEl,
          pickOptionalImageUrl('heroDecoBottomLeftUrl', SITE_APPEARANCE_DEFAULTS.heroDecoBottomLeftUrl)
        );
      }
      function pickOpacity(k, def) {
        if (!(k in o)) return String(def);
        var n = typeof o[k] === 'number' ? o[k] : Number(o[k]);
        if (Number.isFinite(n)) return String(Math.min(1, Math.max(0, n)));
        return String(def);
      }
      if (heroDecoTrOpEl) {
        setInputUnlessLocalConflict(
          heroDecoTrOpEl,
          pickOpacity('heroDecoTopRightOpacity', SITE_APPEARANCE_DEFAULTS.heroDecoTopRightOpacity)
        );
      }
      if (heroDecoBlOpEl) {
        setInputUnlessLocalConflict(
          heroDecoBlOpEl,
          pickOpacity('heroDecoBottomLeftOpacity', SITE_APPEARANCE_DEFAULTS.heroDecoBottomLeftOpacity)
        );
      }
    }
    /**
     * After a successful PUT, sync only the fields that were in the request body.
     * A full forced merge would wipe in-progress edits in other inputs (e.g. upload auto-save while the
     * user is typing another hero URL).
     */
    function applySiteAppearanceMergePartial(apiJson, putKeys) {
      if (!putKeys || !putKeys.length) return;
      var o = apiJson && typeof apiJson === 'object' ? apiJson : {};
      var set = {};
      for (var i = 0; i < putKeys.length; i++) {
        var pk = putKeys[i];
        if (pk && pk !== 'ok') set[pk] = true;
      }
      function has(k) {
        return !!set[k];
      }
      if (has('navLogoUrl') && navLogoUrlEl && 'navLogoUrl' in o)
        navLogoUrlEl.value = String(o.navLogoUrl != null ? o.navLogoUrl : '');
      if (has('navLogoAlt') && navLogoAltEl && 'navLogoAlt' in o)
        navLogoAltEl.value = String(o.navLogoAlt != null ? o.navLogoAlt : '');
      if (has('jackAvatarUrl') && jackUrlEl && 'jackAvatarUrl' in o)
        jackUrlEl.value = String(o.jackAvatarUrl != null ? o.jackAvatarUrl : '');
      if (has('jackAvatarAlt') && jackAltEl && 'jackAvatarAlt' in o)
        jackAltEl.value = String(o.jackAvatarAlt != null ? o.jackAvatarAlt : '');
      if (has('homePageImageUrl') && homeUrlEl && 'homePageImageUrl' in o)
        homeUrlEl.value = String(o.homePageImageUrl != null ? o.homePageImageUrl : '');
      if (has('homePageImageAlt') && homeAltEl && 'homePageImageAlt' in o)
        homeAltEl.value = String(o.homePageImageAlt != null ? o.homePageImageAlt : '');
      if (has('propertyPageImageUrl') && urlEl && 'propertyPageImageUrl' in o)
        urlEl.value = String(o.propertyPageImageUrl != null ? o.propertyPageImageUrl : '');
      if (has('propertyPageImageAlt') && altEl && 'propertyPageImageAlt' in o)
        altEl.value = String(o.propertyPageImageAlt != null ? o.propertyPageImageAlt : '');
      if (has('clinicPageImageUrl') && clinicUrlEl && 'clinicPageImageUrl' in o)
        clinicUrlEl.value = String(o.clinicPageImageUrl != null ? o.clinicPageImageUrl : '');
      if (has('clinicPageImageAlt') && clinicAltEl && 'clinicPageImageAlt' in o)
        clinicAltEl.value = String(o.clinicPageImageAlt != null ? o.clinicPageImageAlt : '');
      if (has('hotelPageImageUrl') && hotelUrlEl && 'hotelPageImageUrl' in o)
        hotelUrlEl.value = String(o.hotelPageImageUrl != null ? o.hotelPageImageUrl : '');
      if (has('hotelPageImageAlt') && hotelAltEl && 'hotelPageImageAlt' in o)
        hotelAltEl.value = String(o.hotelPageImageAlt != null ? o.hotelPageImageAlt : '');
      if (has('heroDecoTopRightUrl') && heroDecoTrUrlEl && 'heroDecoTopRightUrl' in o)
        heroDecoTrUrlEl.value = String(o.heroDecoTopRightUrl != null ? o.heroDecoTopRightUrl : '');
      if (has('heroDecoBottomLeftUrl') && heroDecoBlUrlEl && 'heroDecoBottomLeftUrl' in o)
        heroDecoBlUrlEl.value = String(o.heroDecoBottomLeftUrl != null ? o.heroDecoBottomLeftUrl : '');
      if (has('heroDecoTopRightOpacity') && heroDecoTrOpEl && 'heroDecoTopRightOpacity' in o) {
        var tr = o.heroDecoTopRightOpacity;
        var trn = typeof tr === 'number' ? tr : parseFloat(String(tr != null ? tr : ''));
        heroDecoTrOpEl.value = Number.isFinite(trn) ? String(Math.min(1, Math.max(0, trn))) : '';
      }
      if (has('heroDecoBottomLeftOpacity') && heroDecoBlOpEl && 'heroDecoBottomLeftOpacity' in o) {
        var br = o.heroDecoBottomLeftOpacity;
        var brn = typeof br === 'number' ? br : parseFloat(String(br != null ? br : ''));
        heroDecoBlOpEl.value = Number.isFinite(brn) ? String(Math.min(1, Math.max(0, brn))) : '';
      }
    }
    /**
     * Preview sync listens on `input`, same as autosave. Synthetic `input` events after a PUT must not
     * re-queue autosave or the panel enters an infinite save → merge → bump → save loop.
     */
    var appearanceAutosaveSuppressDepth = 0;
    function withAppearanceAutosaveSuppressed(fn) {
      appearanceAutosaveSuppressDepth += 1;
      try {
        fn();
      } finally {
        appearanceAutosaveSuppressDepth -= 1;
      }
    }
    function bumpSiteAppearanceUrlPreviews() {
      withAppearanceAutosaveSuppressed(function () {
        [navLogoUrlEl, jackUrlEl, homeUrlEl, urlEl, clinicUrlEl, hotelUrlEl, heroDecoTrUrlEl, heroDecoBlUrlEl].forEach(
          function (el) {
            if (el) el.dispatchEvent(new Event('input', { bubbles: true }));
          }
        );
      });
    }
    /** Serialize PUTs so rapid uploads or debounced autosave do not race on site-appearance storage. */
    var appearancePutChain = Promise.resolve();

    /** Read persisted fields from live DOM (by id) for PUT payloads (autosave + uploads). */
    function collectSiteAppearancePayloadFromDom() {
      if (!document.getElementById('soSiteAppearanceRoot')) return null;
      function inputVal(id) {
        var el = document.getElementById(id);
        return el ? String(el.value != null ? el.value : '') : '';
      }
      function parseHeroDecoOpacity(id) {
        var el = document.getElementById(id);
        if (!el) return undefined;
        var s = String(el.value != null ? el.value : '').trim();
        if (s === '') return undefined;
        var n = parseFloat(s);
        return Number.isFinite(n) ? n : undefined;
      }
      var trOp = parseHeroDecoOpacity('soSiteHeroDecoTrOp');
      var blOp = parseHeroDecoOpacity('soSiteHeroDecoBlOp');
      var payload = {
        navLogoUrl: inputVal('soSiteNavLogoUrl'),
        navLogoAlt: inputVal('soSiteNavLogoAlt'),
        jackAvatarUrl: inputVal('soSiteJackAvatarUrl'),
        jackAvatarAlt: inputVal('soSiteJackAvatarAlt'),
        homePageImageUrl: inputVal('soSiteHomeImgUrl'),
        homePageImageAlt: inputVal('soSiteHomeImgAlt'),
        propertyPageImageUrl: inputVal('soSitePropImgUrl'),
        propertyPageImageAlt: inputVal('soSitePropImgAlt'),
        clinicPageImageUrl: inputVal('soSiteClinicImgUrl'),
        clinicPageImageAlt: inputVal('soSiteClinicImgAlt'),
        hotelPageImageUrl: inputVal('soSiteHotelImgUrl'),
        hotelPageImageAlt: inputVal('soSiteHotelImgAlt'),
        heroDecoTopRightUrl: inputVal('soSiteHeroDecoTrUrl'),
        heroDecoBottomLeftUrl: inputVal('soSiteHeroDecoBlUrl'),
      };
      if (trOp !== undefined) payload.heroDecoTopRightOpacity = trOp;
      if (blOp !== undefined) payload.heroDecoBottomLeftOpacity = blOp;
      return payload;
    }

    function stripOkFromSiteAppearanceJson(body) {
      var o = body && typeof body === 'object' ? body : {};
      var out = {};
      for (var k in o) {
        if (!Object.prototype.hasOwnProperty.call(o, k) || k === 'ok') continue;
        out[k] = o[k];
      }
      return out;
    }

    function executeSiteAppearancePut(body) {
      var putKeys = Object.keys(body && typeof body === 'object' ? body : {}).filter(function (k) {
        return k !== 'ok';
      });
      var tok = getAdminBearer();
      if (!tok) {
        return Promise.resolve({
          ok: false,
          j: { error: 'Not signed in as admin; cannot save site appearance.' },
        });
      }
      return fetch(api('/api/admin/site-appearance'), {
        method: 'PUT',
        credentials: apiCred(),
        cache: 'no-store',
        headers: {
          Authorization: 'Bearer ' + tok,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      })
        .then(function (r) {
          return r.json().then(function (j) {
            return { ok: r.ok, j: j };
          });
        })
        .then(function (x) {
          if (isSiteAppearancePanelStale()) return x;
          if (!x.ok || !x.j) return x;
          var tok = getAdminBearer();
          function mergeSavedIntoForm(j) {
            if (isSiteAppearancePanelStale()) return;
            if (j) {
              var cleaned = stripOkFromSiteAppearanceJson(j);
              if (putKeys.length) applySiteAppearanceMergePartial(cleaned, putKeys);
              else applySiteAppearanceMerge(j, { force: true });
            }
            bumpSiteAppearanceUrlPreviews();
          }
          if (!tok) {
            mergeSavedIntoForm(x.j);
            return x;
          }
          return fetch(api('/api/admin/site-appearance'), {
            method: 'GET',
            credentials: apiCred(),
            cache: 'no-store',
            headers: { Authorization: 'Bearer ' + tok },
          })
            .then(function (r) {
              return r.json().then(function (j) {
                return { ok: r.ok, j: j };
              });
            })
            .then(function (g) {
              if (isSiteAppearancePanelStale()) return x;
              if (g.ok && g.j) mergeSavedIntoForm(g.j);
              else mergeSavedIntoForm(x.j);
              return x;
            })
            .catch(function () {
              mergeSavedIntoForm(x.j);
              return x;
            });
        })
        .catch(function () {
          return { ok: false, j: { error: 'Network error on save.' } };
        });
    }
    function enqueueAppearancePersistPut(body) {
      var next = appearancePutChain.then(function () {
        return executeSiteAppearancePut(body);
      });
      appearancePutChain = next.catch(function () {
        return { ok: false, j: { error: 'Network error on save.' } };
      });
      return next;
    }
    /** Cancel pending debounced autosave and PUT the same full payload autosave uses (avoids races with navigation or a stale timer). */
    function flushSiteAppearanceSaveFromDom(priorityPatch) {
      if (appearanceAutosaveTimer) {
        clearTimeout(appearanceAutosaveTimer);
        appearanceAutosaveTimer = null;
      }
      if (isSiteAppearancePanelStale()) {
        return Promise.resolve({ ok: false, j: { error: 'Panel closed.' } });
      }
      var tok = getAdminBearer();
      if (!tok) {
        return Promise.resolve({
          ok: false,
          j: { error: 'Not signed in as admin; cannot save site appearance.' },
        });
      }
      var domPayload = collectSiteAppearancePayloadFromDom();
      if (!domPayload) return Promise.resolve({ ok: false, j: { error: 'Nothing to save.' } });
      if (priorityPatch && typeof priorityPatch === 'object') {
        for (var pk in priorityPatch) {
          if (Object.prototype.hasOwnProperty.call(priorityPatch, pk)) domPayload[pk] = priorityPatch[pk];
        }
      }
      return enqueueAppearancePersistPut(domPayload);
    }
    function bindAppearanceUpload(pickBtnId, fileInputId, urlInput, persistField) {
      var pick = document.getElementById(pickBtnId);
      var fin = document.getElementById(fileInputId);
      if (!pick || !fin || !urlInput) return;
      pick.addEventListener('click', function () {
        fin.click();
      });
      fin.addEventListener('change', function () {
        var file = fin.files && fin.files[0];
        if (!file) return;
        var tok = getAdminBearer();
        if (!tok) {
          if (hintEl) hintEl.textContent = 'Sign in as admin to upload images to this server.';
          fin.value = '';
          return;
        }
        if (hintEl) hintEl.textContent = 'Uploading…';

        function failRead(msg) {
          if (hintEl) hintEl.textContent = msg || 'Could not read file.';
          fin.value = '';
        }

        function postUpload(b64) {
          if (!b64) {
            failRead('Empty file.');
            return;
          }
          fetch(api('/api/admin/site-appearance/upload'), {
            method: 'POST',
            credentials: apiCred(),
            cache: 'no-store',
            headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' },
            body: JSON.stringify({ imageBase64: b64 }),
          })
            .then(function (r) {
              return r.json().then(function (j) {
                return { ok: r.ok, j: j };
              });
            })
            .then(function (x) {
              if (!x.ok || !x.j || !x.j.url) {
                if (hintEl) hintEl.textContent = (x.j && x.j.error) || 'Upload failed.';
                fin.value = '';
                return;
              }
              var uploadedUrl = x.j.url;
              var bytes = x.j.bytes;
              urlInput.value = uploadedUrl;
              urlInput.dispatchEvent(new Event('input', { bubbles: true }));
              if (hintEl) {
                hintEl.textContent =
                  'Uploaded ' + uploadedUrl + ' (' + String(bytes) + ' B). Saving to site config…';
              }
              var patch = {};
              patch[persistField] = uploadedUrl;
              var persistPromise = siteAppearanceFormHydrated
                ? flushSiteAppearanceSaveFromDom(patch)
                : enqueueAppearancePersistPut(patch);
              persistPromise.then(function (putX) {
                if (isSiteAppearancePanelStale()) return;
                if (!putX.ok) {
                  if (hintEl) {
                    hintEl.textContent =
                      (putX.j && putX.j.error) ||
                      'Uploaded but could not save to site config. Autosave will retry when you change a field.';
                  }
                  fin.value = '';
                  return;
                }
                if (hintEl) {
                  hintEl.textContent =
                    'Uploaded ' + uploadedUrl + ' (' + String(bytes) + ' B). Saved to site config.';
                }
                fin.value = '';
              });
            })
            .catch(function () {
              if (hintEl) hintEl.textContent = 'Upload network error.';
              fin.value = '';
            });
        }

        function uint8ToBase64(bytes) {
          var CHUNK = 0x8000;
          var binary = '';
          for (var i = 0; i < bytes.length; i += CHUNK) {
            binary += String.fromCharCode.apply(
              null,
              bytes.subarray(i, Math.min(i + CHUNK, bytes.length))
            );
          }
          return btoa(binary);
        }

        if (typeof file.arrayBuffer === 'function') {
          file
            .arrayBuffer()
            .then(function (buf) {
              if (!buf || buf.byteLength === 0) {
                failRead('Empty file.');
                return;
              }
              try {
                postUpload(uint8ToBase64(new Uint8Array(buf)));
              } catch (eEnc) {
                failRead(eEnc && eEnc.message ? eEnc.message : 'Could not encode file.');
              }
            })
            .catch(function (e) {
              failRead(
                e && (e.name || e.message)
                  ? 'Could not read file (' + (e.name || '') + (e.message ? ': ' + e.message : '') + ').'
                  : 'Could not read file.'
              );
            });
          return;
        }

        var reader = new FileReader();
        reader.onerror = function () {
          var er = reader.error;
          failRead(er && er.message ? 'Could not read file: ' + er.message : 'Could not read file.');
        };
        reader.onload = function () {
          var dataUrl = reader.result;
          var b64 =
            typeof dataUrl === 'string' && dataUrl.indexOf(',') >= 0 ? dataUrl.split(',')[1] : '';
          postUpload(b64);
        };
        reader.readAsDataURL(file);
      });
    }
    function bindClearUrl(btnId, urlInput) {
      var btn = document.getElementById(btnId);
      if (!btn || !urlInput) return;
      btn.addEventListener('click', function () {
        urlInput.value = '';
        urlInput.dispatchEvent(new Event('input', { bubbles: true }));
      });
    }
    function bindDeleteUpload(btnId, urlInput) {
      var btn = document.getElementById(btnId);
      if (!btn || !urlInput) return;
      btn.addEventListener('click', function () {
        var tok = getAdminBearer();
        if (!tok) {
          if (hintEl) hintEl.textContent = 'Sign in as admin to remove uploaded files from this server.';
          return;
        }
        var current = String(urlInput.value || '').trim();
        if (!current) {
          if (hintEl) hintEl.textContent = 'Nothing to delete.';
          return;
        }
        if (hintEl) hintEl.textContent = 'Removing…';
        fetch(api('/api/admin/site-appearance/delete-upload'), {
          method: 'POST',
          credentials: apiCred(),
          cache: 'no-store',
          headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: current }),
        })
          .then(function (r) {
            return r.json().then(function (j) {
              return { ok: r.ok, j: j };
            });
          })
          .then(function (x) {
            if (!x.ok || !x.j || !x.j.ok) {
              if (hintEl) hintEl.textContent = (x.j && x.j.error) || 'Delete request failed.';
              return;
            }
            urlInput.value = '';
            urlInput.dispatchEvent(new Event('input', { bubbles: true }));
            if (hintEl) {
              if (x.j.deletedFromDatabase) {
                hintEl.textContent = 'Removed upload from database. Saving empty URL…';
              } else if (x.j.deletedFromDisk) {
                hintEl.textContent = 'Removed file from server. Saving empty URL…';
              } else if (x.j.reason === 'not_site_upload') {
                hintEl.textContent =
                  'Cleared URL (not a removable site upload: use /assets/site-uploads/su-* or /api/site-uploads/<uuid>). Saving…';
              } else {
                hintEl.textContent =
                  'Cleared URL (upload file was already gone). Saving…';
              }
            }
          })
          .catch(function () {
            if (hintEl) hintEl.textContent = 'Delete network error.';
          });
      });
    }
    bindAppearanceUpload('soSiteNavLogoPickBtn', 'soSiteNavLogoFile', navLogoUrlEl, 'navLogoUrl');
    bindClearUrl('soSiteNavLogoClearBtn', navLogoUrlEl);
    bindDeleteUpload('soSiteNavLogoDeleteBtn', navLogoUrlEl);
    bindAppearanceUpload('soSiteJackAvatarPickBtn', 'soSiteJackAvatarFile', jackUrlEl, 'jackAvatarUrl');
    bindClearUrl('soSiteJackAvatarClearBtn', jackUrlEl);
    bindDeleteUpload('soSiteJackAvatarDeleteBtn', jackUrlEl);
    bindAppearanceUpload('soSiteHomeImgPickBtn', 'soSiteHomeImgFile', homeUrlEl, 'homePageImageUrl');
    bindClearUrl('soSiteHomeImgClearBtn', homeUrlEl);
    bindDeleteUpload('soSiteHomeImgDeleteBtn', homeUrlEl);
    bindAppearanceUpload('soSitePropImgPickBtn', 'soSitePropImgFile', urlEl, 'propertyPageImageUrl');
    bindClearUrl('soSitePropImgClearBtn', urlEl);
    bindDeleteUpload('soSitePropImgDeleteBtn', urlEl);
    bindAppearanceUpload('soSiteClinicImgPickBtn', 'soSiteClinicImgFile', clinicUrlEl, 'clinicPageImageUrl');
    bindClearUrl('soSiteClinicImgClearBtn', clinicUrlEl);
    bindDeleteUpload('soSiteClinicImgDeleteBtn', clinicUrlEl);
    bindAppearanceUpload('soSiteHotelImgPickBtn', 'soSiteHotelImgFile', hotelUrlEl, 'hotelPageImageUrl');
    bindClearUrl('soSiteHotelImgClearBtn', hotelUrlEl);
    bindDeleteUpload('soSiteHotelImgDeleteBtn', hotelUrlEl);
    bindAppearanceUpload('soSiteHeroDecoTrPickBtn', 'soSiteHeroDecoTrFile', heroDecoTrUrlEl, 'heroDecoTopRightUrl');
    bindClearUrl('soSiteHeroDecoTrClearBtn', heroDecoTrUrlEl);
    bindDeleteUpload('soSiteHeroDecoTrDeleteBtn', heroDecoTrUrlEl);
    bindAppearanceUpload('soSiteHeroDecoBlPickBtn', 'soSiteHeroDecoBlFile', heroDecoBlUrlEl, 'heroDecoBottomLeftUrl');
    bindClearUrl('soSiteHeroDecoBlClearBtn', heroDecoBlUrlEl);
    bindDeleteUpload('soSiteHeroDecoBlDeleteBtn', heroDecoBlUrlEl);
    var appearanceAutosaveTimer = null;
    function scheduleSiteAppearanceAutosave() {
      if (appearanceAutosaveSuppressDepth > 0) return;
      if (isSiteAppearancePanelStale() || !siteAppearanceFormHydrated) return;
      if (appearanceAutosaveTimer) clearTimeout(appearanceAutosaveTimer);
      appearanceAutosaveTimer = setTimeout(function () {
        appearanceAutosaveTimer = null;
        if (isSiteAppearancePanelStale() || !siteAppearanceFormHydrated) return;
        var tok = getAdminBearer();
        if (!tok) return;
        var domPayload = collectSiteAppearancePayloadFromDom();
        if (!domPayload) return;
        if (hintEl) hintEl.textContent = 'Saving…';
        enqueueAppearancePersistPut(domPayload).then(function (x) {
          if (isSiteAppearancePanelStale()) return;
          if (!hintEl) return;
          if (x && x.ok) {
            hintEl.textContent = 'Saved automatically. Public: GET /api/site-appearance';
          } else {
            hintEl.textContent = (x && x.j && x.j.error) || 'Save failed — fix the fields or check the network.';
          }
        });
      }, 550);
    }
    function wireSiteAppearanceAutosaveFields() {
      var ids = [
        'soSiteNavLogoUrl',
        'soSiteNavLogoAlt',
        'soSiteJackAvatarUrl',
        'soSiteJackAvatarAlt',
        'soSiteHomeImgUrl',
        'soSiteHomeImgAlt',
        'soSiteHeroDecoTrUrl',
        'soSiteHeroDecoTrOp',
        'soSiteHeroDecoBlUrl',
        'soSiteHeroDecoBlOp',
        'soSitePropImgUrl',
        'soSitePropImgAlt',
        'soSiteClinicImgUrl',
        'soSiteClinicImgAlt',
        'soSiteHotelImgUrl',
        'soSiteHotelImgAlt',
      ];
      ids.forEach(function (id) {
        var el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('input', scheduleSiteAppearanceAutosave);
        el.addEventListener('change', scheduleSiteAppearanceAutosave);
      });
    }
    var selAll = document.getElementById('soSiteAppearSelectAll');
    var selNone = document.getElementById('soSiteAppearSelectNone');
    var selClear = document.getElementById('soSiteAppearClearSelected');
    function appearanceCheckboxes() {
      return panelBody ? panelBody.querySelectorAll('.so-site-appearance__cb') : [];
    }
    function appearanceRowForSel(sel) {
      if (sel === 'nav') return { url: navLogoUrlEl };
      if (sel === 'jack') return { url: jackUrlEl };
      if (sel === 'home') return { url: homeUrlEl };
      if (sel === 'prop') return { url: urlEl };
      if (sel === 'clinic') return { url: clinicUrlEl };
      if (sel === 'hotel') return { url: hotelUrlEl };
      if (sel === 'decoTr') return { url: heroDecoTrUrlEl };
      if (sel === 'decoBl') return { url: heroDecoBlUrlEl };
      return null;
    }
    if (selAll) {
      selAll.addEventListener('click', function () {
        appearanceCheckboxes().forEach(function (cb) {
          cb.checked = true;
        });
      });
    }
    if (selNone) {
      selNone.addEventListener('click', function () {
        appearanceCheckboxes().forEach(function (cb) {
          cb.checked = false;
        });
      });
    }
    if (selClear) {
      selClear.addEventListener('click', function () {
        var n = 0;
        appearanceCheckboxes().forEach(function (cb) {
          if (!cb.checked) return;
          var row = appearanceRowForSel(cb.getAttribute('data-so-appearance-sel'));
          if (!row || !row.url) return;
          row.url.value = '';
          row.url.dispatchEvent(new Event('input', { bubbles: true }));
          n += 1;
        });
        if (hintEl) {
          hintEl.textContent =
            n > 0 ? 'Cleared ' + n + ' image URL(s). Saving…' : 'Select one or more fields first.';
        }
      });
    }
    wireSiteAppearanceAutosaveFields();

    function markSiteAppearanceFormReady() {
      if (isSiteAppearancePanelStale()) return;
      siteAppearanceFormHydrated = true;
    }

    var token = getAdminBearer();
    if (!token) {
      if (!isSiteAppearancePanelStale()) {
        applySiteAppearanceMerge({});
        bumpSiteAppearanceUrlPreviews();
      }
      if (hintEl) {
        hintEl.textContent =
          'Sign in as admin on the Node host to load saved URLs; changes save automatically when signed in. Below: suggested paths from /assets/ on this host.';
      }
      return;
    }
    if (hintEl) hintEl.textContent = 'Loading saved settings…';
    fetch(api('/api/admin/site-appearance'), {
      method: 'GET',
      credentials: apiCred(),
      cache: 'no-store',
      headers: { Authorization: 'Bearer ' + token },
    })
      .then(function (r) {
        return r.json().then(function (j) {
          return { ok: r.ok, status: r.status, j: j };
        });
      })
      .then(function (x) {
        if (isSiteAppearancePanelStale()) return;
        if (!x.ok || !x.j) {
          applySiteAppearanceMerge({});
          if (hintEl) {
            hintEl.textContent =
              'Could not load saved settings (HTTP ' +
              (x.status != null ? x.status : '?') +
              '). Showing defaults under /assets/… on this origin. Autosave needs the Node API (so-api.js → backend).';
          }
          bumpSiteAppearanceUrlPreviews();
          markSiteAppearanceFormReady();
          return;
        }
        applySiteAppearanceMerge(x.j);
        var baseHint = 'Loaded from API. Edits save automatically. Public: GET /api/site-appearance';
        var sh = x.j.serverHints;
        if (sh && sh.postgresConfiguredButUnavailable) {
          baseHint =
            'Warning: DATABASE_URL is set but PostgreSQL is not active (see Deploy log → Postgres pool / deploy logs). New image uploads are blocked until the DB connects. Existing /assets/site-uploads/* previews fail after redeploy.';
        } else if (sh && sh.siteImageUploadTarget === 'disk' && sh.runningOnRailway) {
          baseHint +=
            ' Uploads use ephemeral disk (/assets/site-uploads/) — add DATABASE_URL to this Node service, redeploy, then re-upload for /api/site-uploads/<uuid> URLs.';
        }
        if (hintEl) hintEl.textContent = baseHint;
        bumpSiteAppearanceUrlPreviews();
        markSiteAppearanceFormReady();
      })
      .catch(function () {
        if (isSiteAppearancePanelStale()) return;
        applySiteAppearanceMerge({});
        if (hintEl) {
          hintEl.textContent =
            'Network error calling the API. Showing /assets/… defaults. Deploy frontend with so-api.js so admin requests reach the backend.';
        }
        bumpSiteAppearanceUrlPreviews();
        markSiteAppearanceFormReady();
      });

  }

  var ICON_ROWS_NAV = [
    {
      key: 'theme-sun',
      title: 'Nav — theme (sun)',
      hint: 'When the site is in dark mode, the header toggle shows this control (switch to light). Applies on every page that includes theme.js.',
    },
    {
      key: 'theme-moon',
      title: 'Nav — theme (moon)',
      hint: 'When the site is in light mode, the toggle shows this control (switch to dark).',
    },
  ];

  var ICON_ROWS_HOMEPAGE = [
    {
      key: 'home-sector-hotels',
      title: 'Hotels sector card',
      hint: 'Sector grid: Hotels & serviced apartments icon area on the homepage.',
    },
    {
      key: 'home-sector-clinics',
      title: 'Clinics sector card',
      hint: 'Sector grid: Clinics, dental & wellness icon area on the homepage.',
    },
    {
      key: 'home-sector-property',
      title: 'Property sector card',
      hint: 'Sector grid: Property & rental operators icon area on the homepage.',
    },
    {
      key: 'home-markets',
      title: '“Markets” row icon',
      hint: 'Small icon beside “Thailand & International Markets” on the homepage.',
    },
  ];

  function openIconEditorPanel(opts) {
    if (!panel || !panelTitle || !panelBody) return;
    if (document.getElementById('adminMainDefault')) document.getElementById('adminMainDefault').classList.add('is-hidden');
    var title = opts && opts.title ? opts.title : 'Icons';
    var rows = opts && opts.rows ? opts.rows : ICON_ROWS_NAV.concat(ICON_ROWS_HOMEPAGE);
    var lede =
      opts && opts.lede
        ? opts.lede
        : 'Replace icons. Values persist in <code class="mono">site-appearance.json</code> as an <code class="mono">icons</code> map and are published on <code class="mono">GET /api/site-appearance</code>. Use a path on this site (<code class="mono">/assets/…</code>), a public <strong>https</strong> image URL, or full inline <strong>&lt;svg&gt;…&lt;/svg&gt;</strong> markup. Clear a field and save to remove that override.';
    var hintId = opts && opts.hintId ? opts.hintId : 'soIconsHint';
    var saveId = opts && opts.saveId ? opts.saveId : 'soIconsSave';
    panelTitle.textContent = title;
    var fieldsHtml = rows
      .map(function (row) {
        return (
          '<div class="portal-form" style="margin:0 0 1rem">' +
          '<label class="portal-form__label" for="soIcon-' +
          row.key +
          '">' +
          escapeHtml(row.title) +
          ' <span class="mono">(' +
          escapeHtml(row.key) +
          ')</span></label>' +
          '<p class="portal-form__hint tf-admin-muted" style="margin:0 0 0.35rem">' +
          escapeHtml(row.hint) +
          '</p>' +
          '<textarea class="portal-form__input mono" id="soIcon-' +
          row.key +
          '" rows="3" style="min-height:3.5rem;resize:vertical" spellcheck="false" autocomplete="off" placeholder="Paste /assets/… or https://… URL, or inline &lt;svg&gt;…"></textarea>' +
          '</div>'
        );
      })
      .join('');
    panelBody.innerHTML =
      '<div class="so-site-appearance">' +
      '<p class="tf-admin-muted so-site-appearance__lede">' +
      lede +
      '</p>' +
      fieldsHtml +
      '<div class="so-site-appearance__footer">' +
      '<p class="portal-form__hint mono" id="' +
      hintId +
      '" style="margin:0;flex:1;min-width:12rem"></p>' +
      '<div class="admin-panel__actions" style="margin:0">' +
      '<button type="button" class="btn btn--primary" id="' +
      saveId +
      '">Save icons</button> ' +
      '<a href="/admin/users" class="btn btn--ghost mono">← Users &amp; payouts</a>' +
      '</div></div></div>';
    panel.classList.remove('is-hidden');
    window.scrollTo(0, 0);

    var hintEl = document.getElementById(hintId);
    var serverIcons = {};
    var token = getAdminBearer();

    function fillFromServer() {
      rows.forEach(function (row) {
        var el = document.getElementById('soIcon-' + row.key);
        if (!el) return;
        var v = serverIcons[row.key];
        el.value = typeof v === 'string' ? v : '';
      });
    }

    if (!token) {
      if (hintEl) {
        hintEl.textContent =
          'Sign in as admin on the Node host to load and save. Visitors read overrides from GET /api/site-appearance.';
      }
      return;
    }

    fetch(api('/api/admin/site-appearance'), {
      method: 'GET',
      credentials: apiCred(),
      cache: 'no-store',
      headers: { Authorization: 'Bearer ' + token },
    })
      .then(function (r) {
        return r.json().then(function (j) {
          return { ok: r.ok, status: r.status, j: j };
        });
      })
      .then(function (x) {
        if (!x.ok || !x.j) {
          serverIcons = {};
          if (hintEl) {
            hintEl.textContent =
              'Could not load settings (HTTP ' + (x.status != null ? x.status : '?') + ').';
          }
          fillFromServer();
          return;
        }
        serverIcons = x.j.icons && typeof x.j.icons === 'object' ? x.j.icons : {};
        if (hintEl) hintEl.textContent = 'Loaded from API.';
        fillFromServer();
      })
      .catch(function () {
        serverIcons = {};
        if (hintEl) hintEl.textContent = 'Network error loading settings.';
        fillFromServer();
      });

    var saveBtn = document.getElementById(saveId);
    if (saveBtn) {
      saveBtn.addEventListener('click', function () {
        var next = Object.assign({}, serverIcons);
        rows.forEach(function (row) {
          var el = document.getElementById('soIcon-' + row.key);
          var v = el ? el.value.trim() : '';
          if (v) next[row.key] = v;
          else delete next[row.key];
        });
        if (hintEl) hintEl.textContent = 'Saving…';
        fetch(api('/api/admin/site-appearance'), {
          method: 'PUT',
          credentials: apiCred(),
          cache: 'no-store',
          headers: {
            Authorization: 'Bearer ' + getAdminBearer(),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ icons: next }),
        })
          .then(function (r) {
            return r.json().then(function (j) {
              return { ok: r.ok, j: j };
            });
          })
          .then(function (x) {
            if (!x.ok) {
              if (hintEl) hintEl.textContent = (x.j && x.j.error) || 'Save failed.';
              return;
            }
            serverIcons = x.j.icons && typeof x.j.icons === 'object' ? x.j.icons : next;
            if (hintEl) hintEl.textContent = 'Saved. Visitors pick this up on the next page load.';
          })
          .catch(function () {
            if (hintEl) hintEl.textContent = 'Network error on save.';
          });
      });
    }
  }

  function openIconsPanel() {
    openIconEditorPanel({
      title: 'Icons',
      rows: ICON_ROWS_NAV,
      lede:
        'Replace icons for the shared nav (theme toggle). Values persist in <code class="mono">site-appearance.json</code> as an <code class="mono">icons</code> map and are published on <code class="mono">GET /api/site-appearance</code>. Use a path on this site (<code class="mono">/assets/…</code>), a public <strong>https</strong> image URL, or full inline <strong>&lt;svg&gt;…&lt;/svg&gt;</strong> markup. Clear a field and save to remove that override. For homepage sector and markets icons, use <a href="/admin/homepage-icons">Homepage icons</a>.',
    });
  }

  function openHomepageIconsPanel() {
    openIconEditorPanel({
      title: 'Homepage icons',
      rows: ICON_ROWS_HOMEPAGE,
      hintId: 'soHomeIconsHint',
      saveId: 'soHomeIconsSave',
      lede:
        'Replace the small icons on the public homepage (sector cards and the “Markets” row). Values persist in <code class="mono">site-appearance.json</code> as an <code class="mono">icons</code> map and are published on <code class="mono">GET /api/site-appearance</code> (same document as hero images and the nav logo). Use a path on this site (<code class="mono">/assets/…</code>), a public <strong>https</strong> image URL, or full inline <strong>&lt;svg&gt;…&lt;/svg&gt;</strong> markup. Clear a field and save to remove that override. Nav theme icons are edited under <a href="/admin/icons">Icons</a>.',
    });
  }

  function renderUserProfilingTable() {
    var tbody = document.getElementById('userProfilingTbody');
    if (!tbody) return;
    if (userProfilingLoadState === 'loading') {
      tbody.innerHTML = '<tr><td colspan="12" class="tf-admin-muted">Loading…</td></tr>';
      return;
    }
    if (userProfilingLoadState === 'error') {
      tbody.innerHTML = '<tr><td colspan="12" class="tf-admin-muted">Could not load rows.</td></tr>';
      return;
    }
    if (!userProfilingRows.length) {
      tbody.innerHTML =
        '<tr><td colspan="12" class="tf-admin-muted">No portal users in the store yet.</td></tr>';
      return;
    }
    tbody.innerHTML = userProfilingRows
      .map(function (r) {
        var online = r.currentOnline ? 'Yes' : '—';
        return (
          '<tr>' +
          '<td class="mono">' +
          escapeHtml(shortDisplayId(r.id)) +
          '</td>' +
          '<td>' +
          escapeHtml(r.email || '') +
          '</td>' +
          '<td>' +
          escapeHtml(r.displayName || displayNameFromEmail(r.email)) +
          '</td>' +
          '<td>' +
          escapeHtml(r.gender || '—') +
          '</td>' +
          '<td><span class="' +
          (r.currentOnline ? 'mono tf-admin-pill tf-admin-pill--ok' : 'mono tf-admin-muted') +
          '">' +
          escapeHtml(online) +
          '</span></td>' +
          '<td class="mono">' +
          escapeHtml(formatAdminTs(r.lastActivityAt) || '—') +
          '</td>' +
          '<td class="mono">' +
          String(r.sessionCount != null ? r.sessionCount : 0) +
          '</td>' +
          '<td class="mono">' +
          (r.engagedMinutes != null && r.engagedMinutes > 0 ? String(r.engagedMinutes) : '—') +
          '</td>' +
          '<td class="mono">' +
          String(r.pageViews != null ? r.pageViews : 0) +
          '</td>' +
          '<td class="mono">' +
          String(r.loginCount != null ? r.loginCount : 0) +
          '</td>' +
          '<td class="mono">' +
          escapeHtml(r.lastIp || '—') +
          '</td>' +
          '<td>' +
          escapeHtml(r.lastLocation || '—') +
          '</td>' +
          '</tr>'
        );
      })
      .join('');
  }

  function loadUserProfiling() {
    var token = getAdminBearer();
    var hint = document.getElementById('userProfilingHint');
    if (!token) {
      if (hint) hint.textContent = 'Sign in with operator credentials on the Node host to load profiling.';
      userProfilingLoadState = 'error';
      userProfilingRows = [];
      renderUserProfilingTable();
      return;
    }
    userProfilingLoadState = 'loading';
    userProfilingRows = [];
    renderUserProfilingTable();
    if (hint) hint.textContent = 'Loading…';

    fetch(api('/api/admin/user-profiling'), {
      method: 'GET',
      credentials: apiCred(),
      cache: 'no-store',
      headers: { Authorization: 'Bearer ' + token },
    })
      .then(function (r) {
        return r.json().then(function (j) {
          return { ok: r.ok, j: j };
        });
      })
      .then(function (x) {
        if (!x.ok || !x.j || !x.j.ok) {
          userProfilingLoadState = 'error';
          userProfilingRows = [];
          if (hint) {
            hint.textContent = (x.j && x.j.error) || 'Could not load profiling.';
          }
          renderUserProfilingTable();
          return;
        }
        userProfilingLoadState = 'ok';
        userProfilingRows = Array.isArray(x.j.rows) ? x.j.rows : [];
        var metaMin = x.j.onlineWithinMinutes != null ? x.j.onlineWithinMinutes : 5;
        if (hint) {
          hint.innerHTML =
            'Merged from <code>portal_users</code> and session/activity telemetry. <strong>Online</strong> = last activity (telemetry, last seen, or login) within ' +
            escapeHtml(String(metaMin)) +
            ' min. <strong>Engaged min</strong> sums <code>page_leave</code> dwell from <code>user-activity.js</code> (tab hidden/closed). If telemetry is empty, counts stay at zero.';
        }
        renderUserProfilingTable();
      })
      .catch(function () {
        userProfilingLoadState = 'error';
        userProfilingRows = [];
        if (hint) hint.textContent = 'Network error.';
        renderUserProfilingTable();
      });
  }

  function getAdminRouteFromLocation() {
    var route = adminRouteIdFromShellPath(window.location.pathname || '');
    if (route !== 'users') return route;
    var pending = readAdminLoginNextParam();
    if (pending) {
      var pendingPath = pending.split('?')[0].split('#')[0];
      if (isAllowedAdminShellNextPath(pendingPath)) {
        return adminRouteIdFromShellPath(pendingPath);
      }
    }
    return route;
  }

  function makePlacesLeadsNavControl() {
    var a = document.createElement('a');
    a.href = '#';
    a.className = 'tf-admin-nav__pill';
    a.textContent = 'Places leads';
    a.setAttribute('aria-label', 'Open Google Places lead collector in a new tab');
    a.addEventListener('click', function (ev) {
      ev.preventDefault();
      var jwt = readStoredAdminJwt();
      if (!jwt) {
        window.location.href = '/admin/users';
        return;
      }
      fetch(api('/api/admin/places-page-token'), {
        method: 'POST',
        credentials: apiCred(),
        cache: 'no-store',
        headers: { Authorization: 'Bearer ' + jwt },
      })
        .then(function (r) {
          return r.json().then(function (j) {
            return { ok: r.ok, j: j };
          });
        })
        .then(function (pack) {
          if (!pack.ok || !pack.j || !pack.j.page_token) {
            var msg =
              (pack.j && (pack.j.error || pack.j.message)) || 'Could not open Places tool. Sign in again.';
            window.alert(String(msg));
            return;
          }
          var origin =
            typeof window !== 'undefined' && window.location && window.location.origin
              ? window.location.origin
              : '';
          var url = origin + '/operator/places-leads.html?t=' + encodeURIComponent(pack.j.page_token);
          window.open(url, '_blank', 'noopener,noreferrer');
        })
        .catch(function () {
          window.alert('Network error opening Places tool.');
        });
    });
    return a;
  }

  function makeNavLink(label, href, routeKey, activeRouteId) {
    var a = document.createElement('a');
    a.href = href;
    a.className = 'tf-admin-nav__pill';
    a.textContent = label;
    if (activeRouteId === routeKey) {
      a.classList.add('is-active');
      a.setAttribute('aria-current', 'page');
    }
    return a;
  }

  function buildTfNav(activeRouteId) {
    if (!tfNav) return;
    var id = activeRouteId != null ? activeRouteId : getAdminRouteFromLocation();
    tfNav.innerHTML = '';
    tfNav.className = 'tf-admin-nav__pills';

    tfNav.appendChild(makeNavLink('Users & payouts', '/admin/users', 'users', id));
    tfNav.appendChild(makeNavLink('Activity log', '/admin/activity', 'activity', id));
    tfNav.appendChild(makeNavLink('User profiling', '/admin/user-profiling', 'user-profiling', id));
    tfNav.appendChild(makeNavLink('Deploy log', '/admin/deploy-log', 'deploy-log', id));
    tfNav.appendChild(makeNavLink('Site appearance', '/admin/site-appearance', 'site-appearance', id));
    tfNav.appendChild(makeNavLink('Icons', '/admin/icons', 'icons', id));
    tfNav.appendChild(makeNavLink('Homepage icons', '/admin/homepage-icons', 'homepage-icons', id));
    tfNav.appendChild(makeNavLink('Reports', '/operator/reports', 'reports', id));
    tfNav.appendChild(makePlacesLeadsNavControl());
    tfNav.appendChild(makeNavLink('Report catalog', '/admin/report-catalog', 'report-catalog', id));
    tfNav.appendChild(makeNavLink('User reports', '/admin/user-reports', 'user-reports', id));
    tfNav.appendChild(makeNavLink('Voice Recorder', '/admin/voice-recorder', 'voice-recorder', id));
    tfNav.appendChild(makeNavLink('Transcriptions', '/admin/transcriptions', 'transcriptions', id));
  }

  function syncAdminRouteFromLocation() {
    var routeId = getAdminRouteFromLocation();
    var main = document.getElementById('adminMainDefault');
    var usersEl = document.getElementById('usersSection');
    var profilingEl = document.getElementById('userProfilingSection');
    var inboxEl = document.getElementById('adminInbox');
    var reportsEl = document.getElementById('reportCatalogSection');
    var voiceRecorderEl = document.getElementById('voiceRecorderSection');
    var transcriptionsEl = document.getElementById('transcriptionsSection');
    var transcriptionDetailEl = document.getElementById('transcriptionDetailSection');
    var transcriptionsDetailEl = document.getElementById('transcriptionsDetailSection');

    if (routeId === 'deploy-log') {
      if (main) main.classList.add('is-hidden');
      openDeployLogPanel();
      buildTfNav(routeId);
      window.scrollTo(0, 0);
      return;
    }
    if (routeId === 'site-appearance') {
      if (main) main.classList.add('is-hidden');
      openBrandingPanel();
      buildTfNav(routeId);
      window.scrollTo(0, 0);
      return;
    }
    if (routeId === 'icons') {
      if (main) main.classList.add('is-hidden');
      openIconsPanel();
      buildTfNav(routeId);
      window.scrollTo(0, 0);
      return;
    }
    if (routeId === 'homepage-icons') {
      if (main) main.classList.add('is-hidden');
      openHomepageIconsPanel();
      buildTfNav(routeId);
      window.scrollTo(0, 0);
      return;
    }
    if (routeId === 'user-reports') {
      if (main) main.classList.add('is-hidden');
      openUserReportsPanel({ id: 'user-reports', label: 'User report access' });
      buildTfNav(routeId);
      window.scrollTo(0, 0);
      return;
    }

    if (main) main.classList.remove('is-hidden');
    if (panel) panel.classList.add('is-hidden');
    if (usersEl) usersEl.classList.toggle('is-hidden', routeId !== 'users');
    if (profilingEl) profilingEl.classList.toggle('is-hidden', routeId !== 'user-profiling');
    if (inboxEl) inboxEl.classList.toggle('is-hidden', routeId !== 'activity');
    if (reportsEl) reportsEl.classList.toggle('is-hidden', routeId !== 'report-catalog');
    if (voiceRecorderEl) voiceRecorderEl.classList.toggle('is-hidden', routeId !== 'voice-recorder');
    if (transcriptionsEl) transcriptionsEl.classList.toggle('is-hidden', routeId !== 'transcriptions');
    if (transcriptionsDetailEl) {
      transcriptionsDetailEl.classList.toggle('is-hidden', routeId !== 'transcriptions-detail');
    }

    buildTfNav(routeId);
    window.scrollTo(0, 0);
    if (routeId === 'user-profiling') loadUserProfiling();
    if (routeId === 'voice-recorder') initVoiceRecorderPipelineUi();
    if (routeId === 'transcriptions' || routeId === 'transcriptions-detail') {
      ensureTranscriptionsDashboard(function () {
        if (routeId === 'transcriptions-detail') {
          if (typeof window.initAdminTranscriptionDetail === 'function') {
            window.initAdminTranscriptionDetail();
          } else {
            console.error('[transcriptions] initAdminTranscriptionDetail missing after dashboard load');
          }
          return;
        }
        if (typeof window.initAdminTranscriptions === 'function') {
          window.initAdminTranscriptions();
        } else {
          console.error('[transcriptions] initAdminTranscriptions missing after dashboard load');
          if (typeof window.soTxSetLoadHint === 'function') {
            window.soTxSetLoadHint(
              'Transcriptions dashboard script did not load. Hard refresh (Ctrl+Shift+R) or sign out and back in.',
              'error'
            );
          } else {
            var txHint = document.getElementById('txLoadHint');
            if (txHint) {
              txHint.textContent =
                'Transcriptions dashboard script did not load. Hard refresh (Ctrl+Shift+R) or sign out and back in.';
              txHint.classList.add('is-error');
            }
          }
        }
        scheduleTranscriptionsSafetyInit();
      });
    }
  }

  function ensureTranscriptionsDashboard(done) {
    var TX_DASH_MAX_RETRIES = 2;
    var attemptKey = 'so_tx_dash_reload_attempts';

    function isDashboardReady() {
      return (
        typeof window.initAdminTranscriptions === 'function' &&
        (window.TX_DASHBOARD_UI_REV == null || window.TX_DASHBOARD_UI_REV >= 6)
      );
    }
    if (isDashboardReady()) {
      try {
        sessionStorage.removeItem(attemptKey);
      } catch (eReady) {}
      done();
      return;
    }

    /* Legacy: stale sessionStorage blocked init after earlier cache-bust reloads. */
    try {
      sessionStorage.removeItem(attemptKey);
    } catch (eLegacy) {}

    var versionMeta = document.querySelector('meta[name="so-app-version"]');
    var version = (versionMeta && versionMeta.getAttribute('content')) || '';
    var attempts = 0;

    function stripDashboardScripts() {
      document
        .querySelectorAll(
          'script[data-tx-dashboard-bundle], script[src*="admin-transcriptions.js"], script[src*="admin-tx-dashboard.js"]'
        )
        .forEach(function (el) {
          el.remove();
        });
      try {
        delete window.TX_DASHBOARD_UI_REV;
        delete window.initAdminTranscriptions;
      } catch (err) {}
    }

    function finishOrRetryAfterLoad() {
      if (isDashboardReady()) {
        try {
          sessionStorage.removeItem(attemptKey);
        } catch (e) {}
        done();
        return;
      }
      if (typeof window.initAdminTranscriptions === 'function') {
        console.warn('[transcriptions] dashboard loaded without TX_DASHBOARD_UI_REV; continuing');
        done();
        return;
      }
      if (attempts >= TX_DASH_MAX_RETRIES) {
        console.error('[transcriptions] dashboard UI rev still < 6 after reload attempts');
        done();
        return;
      }
      attempts += 1;
      stripDashboardScripts();
      injectDashboardScript();
    }

    function injectDashboardScript() {
      var bust =
        (version ? encodeURIComponent(version) + '&' : '') + '_=' + String(Date.now());
      var s = document.createElement('script');
      s.src = '/admin-transcriptions.js?v=' + bust;
      s.async = false;
      s.setAttribute('data-tx-dashboard-bundle', '1');
      s.onload = finishOrRetryAfterLoad;
      s.onerror = function () {
        console.error('[transcriptions] could not load admin-transcriptions.js');
        var fallback = document.createElement('script');
        fallback.src = '/admin-tx-dashboard.js?v=' + bust;
        fallback.async = false;
        fallback.setAttribute('data-tx-dashboard-bundle', '1');
        fallback.onload = finishOrRetryAfterLoad;
        fallback.onerror = function () {
          console.error('[transcriptions] could not load admin-tx-dashboard.js');
          done();
        };
        document.head.appendChild(fallback);
      };
      document.head.appendChild(s);
    }

    function waitForDashboardScript(el) {
      if (!el) {
        injectDashboardScript();
        return;
      }
      if (!el.getAttribute('data-tx-dashboard-bundle')) {
        el.setAttribute('data-tx-dashboard-bundle', '1');
      }
      if (el.readyState === 'complete' || el.readyState === 'loaded') {
        finishOrRetryAfterLoad();
        return;
      }
      el.addEventListener(
        'load',
        function () {
          finishOrRetryAfterLoad();
        },
        { once: true }
      );
      el.addEventListener(
        'error',
        function () {
          console.error('[transcriptions] dashboard script failed:', el.src);
          finishOrRetryAfterLoad();
        },
        { once: true }
      );
    }

    var existing =
      document.querySelector('script[data-tx-dashboard-bundle]') ||
      document.querySelector(
        'script[src*="admin-transcriptions.js"], script[src*="admin-tx-dashboard.js"]'
      );
    waitForDashboardScript(existing);
  }

  var txSafetyInitTimer = null;

  /** Re-run dashboard init if overview cards never appeared (init race / stale script). */
  function scheduleTranscriptionsSafetyInit() {
    if (txSafetyInitTimer) {
      clearTimeout(txSafetyInitTimer);
      txSafetyInitTimer = null;
    }
    txSafetyInitTimer = setTimeout(function () {
      txSafetyInitTimer = null;
      if (getAdminRouteFromLocation() !== 'transcriptions') return;
      if (typeof window.initAdminTranscriptions !== 'function') return;
      var overviewCards = document.querySelectorAll('#txOverview .tx-overview-card').length;
      if (overviewCards > 0) return;
      console.warn('[tx] safety re-init: overview still empty after 2s');
      window.__txDashInitRan = false;
      window.initAdminTranscriptions();
    }, 2000);
  }

  var voicePipelinePollTimer = null;

  function voicePipelineAdminHeaders() {
    return {
      Authorization: 'Bearer ' + getAdminBearer(),
    };
  }

  function voicePipelineDepsHint(text) {
    var blob = String(text || '').toLowerCase();
    var onRailway =
      blob.indexOf('disabled on this host') !== -1 ||
      blob.indexOf('not on railway') !== -1;
    if (onRailway) {
      return (
        'Voice pipeline does not run on Railway. On this Windows PC, open PowerShell in the repo and run: .\\scripts\\run-voice-pipeline.ps1'
      );
    }
    if (
      blob.indexOf('faster-whisper') !== -1 ||
      blob.indexOf('faster_whisper') !== -1 ||
      blob.indexOf('no module named') !== -1
    ) {
      return (
        'Install on this Windows PC (not the cloud server): pip install -r requirements-voice.txt ; winget install Gyan.FFmpeg — then .\\scripts\\run-voice-pipeline.ps1'
      );
    }
    if (blob.indexOf('ffmpeg') !== -1 || blob.indexOf('avconv') !== -1) {
      return 'Missing FFmpeg on this PC: winget install Gyan.FFmpeg — then run .\\scripts\\run-voice-pipeline.ps1';
    }
    return '';
  }

  function formatEta(seconds) {
    if (seconds == null || seconds < 0) return '—';
    var s = Math.round(Number(seconds));
    var h = Math.floor(s / 3600);
    var m = Math.floor((s % 3600) / 60);
    if (h > 0) return h + 'h ' + m + 'm';
    if (m > 0) return m + ' min';
    return s + ' s';
  }

  function renderVoicePipelineLive(progress, running) {
    var liveEl = document.getElementById('voicePipelineLive');
    if (!liveEl) return;
    if (!progress || (!running && progress.status !== 'running')) {
      liveEl.style.display = 'none';
      liveEl.innerHTML = '';
      return;
    }
    liveEl.style.display = 'block';
    var finishLabel = progress.estimatedFinishAt
      ? formatAdminTs(progress.estimatedFinishAt)
      : '—';
    liveEl.innerHTML =
      '<p style="margin:0 0 0.35rem"><strong>Live progress</strong></p>' +
      '<ul style="margin:0;padding-left:1.1rem">' +
      '<li>Phase: <code class="mono">' +
      escapeHtml(progress.phase || '—') +
      '</code></li>' +
      '<li>Files found: <strong>' +
      escapeHtml(progress.filesTotal != null ? progress.filesTotal : '—') +
      '</strong> · already done: ' +
      escapeHtml(progress.filesSkipped != null ? progress.filesSkipped : '0') +
      ' · to process: <strong>' +
      escapeHtml(progress.filesToProcess != null ? progress.filesToProcess : '—') +
      '</strong></li>' +
      '<li>Completed this run: <strong>' +
      escapeHtml(progress.filesCompleted != null ? progress.filesCompleted : '0') +
      '</strong></li>' +
      '<li>Total size (pending): <strong>' +
      escapeHtml(progress.bytesTotalHuman || '—') +
      '</strong></li>' +
      '<li>Now processing: <code class="mono">' +
      escapeHtml(progress.currentFile || '(loading model…)') +
      '</code>' +
      (progress.currentIndex != null && progress.currentOf != null
        ? ' (' + escapeHtml(progress.currentIndex) + '/' + escapeHtml(progress.currentOf) + ')'
        : '') +
      (progress.currentSizeHuman ? ' · ' + escapeHtml(progress.currentSizeHuman) : '') +
      '</li>' +
      '<li>ETA remaining: <strong>' +
      escapeHtml(formatEta(progress.estimatedSecondsRemaining)) +
      '</strong> · finish ~ <strong>' +
      escapeHtml(finishLabel) +
      '</strong></li>' +
      '</ul>' +
      (progress.message
        ? '<p class="mono" style="margin:0.5rem 0 0;font-size:0.78rem">' +
          escapeHtml(progress.message) +
          '</p>'
        : '');
  }

  function renderVoicePipelineStatus(payload) {
    var badge = document.getElementById('voicePipelineStatusBadge');
    var hint = document.getElementById('voicePipelineHint');
    var statsEl = document.getElementById('voicePipelineStats');
    var filesEl = document.getElementById('voicePipelineFiles');
    var logEl = document.getElementById('voicePipelineLog');
    var runBtn = document.getElementById('voicePipelineRunBtn');
    if (!badge || !hint || !statsEl || !filesEl) return;

    var status = payload && payload.status ? String(payload.status) : 'idle';
    badge.textContent = status;
    var running = Boolean(payload && (payload.running || status === 'running'));
    renderVoicePipelineLive(payload && payload.progress, running);
    if (runBtn) runBtn.disabled = running;

    var parts = [];
    if (payload && payload.startedAt) parts.push('Started: ' + formatAdminTs(payload.startedAt));
    if (payload && payload.finishedAt) parts.push('Finished: ' + formatAdminTs(payload.finishedAt));
    if (payload && payload.exitCode != null && !running) parts.push('Exit code: ' + payload.exitCode);
    hint.textContent = parts.join(' · ');

    var stats = (payload && payload.stats) || null;
    if (stats) {
      statsEl.innerHTML =
        '<p style="margin:0 0 0.35rem"><strong>Latest stats</strong></p>' +
        '<ul style="margin:0;padding-left:1.1rem">' +
        '<li>Files scanned: ' +
        escapeHtml(stats.filesScanned != null ? stats.filesScanned : '—') +
        '</li>' +
        '<li>New processed: ' +
        escapeHtml(stats.newProcessed != null ? stats.newProcessed : '—') +
        '</li>' +
        '<li>Transcriptions: ' +
        escapeHtml(stats.transcriptions != null ? stats.transcriptions : '—') +
        '</li>' +
        '<li>Notes: ' +
        escapeHtml(stats.notes != null ? stats.notes : '—') +
        '</li>' +
        '<li>Meetings: ' +
        escapeHtml(stats.meetings != null ? stats.meetings : '—') +
        '</li>' +
        '<li>Tasks: ' +
        escapeHtml(stats.tasks != null ? stats.tasks : '—') +
        '</li>' +
        '<li>Calendar: ' +
        escapeHtml(stats.calendar != null ? stats.calendar : '—') +
        '</li>' +
        '<li>Errors: ' +
        escapeHtml(stats.errors != null ? stats.errors : '—') +
        '</li>' +
        '</ul>';
      var errMsgs = [];
      if (stats.error_messages && Array.isArray(stats.error_messages)) {
        errMsgs = stats.error_messages;
      } else if (
        payload.historyRun &&
        Array.isArray(payload.historyRun.errors) &&
        payload.historyRun.errors.length
      ) {
        errMsgs = payload.historyRun.errors;
      }
      if (errMsgs.length) {
        statsEl.innerHTML +=
          '<p style="margin:0.65rem 0 0.25rem"><strong>Error details</strong></p>' +
          '<ul style="margin:0;padding-left:1.1rem;max-height:10rem;overflow:auto">' +
          errMsgs
            .map(function (line) {
              return (
                '<li style="margin-bottom:0.35rem"><code class="mono" style="white-space:pre-wrap;word-break:break-word">' +
                escapeHtml(String(line)) +
                '</code></li>'
              );
            })
            .join('') +
          '</ul>';
      }
    } else {
      statsEl.innerHTML = '<p class="tf-admin-muted" style="margin:0">No pipeline stats yet.</p>';
    }

    var files = (payload && payload.files) || null;
    var fileBlocks = [];
    function fileList(label, items) {
      if (!items || (Array.isArray(items) && !items.length)) return;
      var rows = Array.isArray(items) ? items : [items];
      fileBlocks.push(
        '<p style="margin:0.35rem 0 0.15rem"><strong>' +
          escapeHtml(label) +
          '</strong></p><ul style="margin:0 0 0.35rem;padding-left:1.1rem">' +
          rows
            .map(function (p) {
              return '<li><code class="mono">' + escapeHtml(p) + '</code></li>';
            })
            .join('') +
          '</ul>'
      );
    }
    if (files) {
      fileList('Transcriptions', files.transcriptions);
      if (files.dailyReport) fileList('Daily report', files.dailyReport);
      if (files.tasks) fileList('Tasks', files.tasks);
      if (files.calendar) fileList('Calendar', files.calendar);
    }
    filesEl.innerHTML = fileBlocks.length
      ? '<p style="margin:0 0 0.35rem"><strong>Generated files</strong></p>' + fileBlocks.join('')
      : '<p class="tf-admin-muted" style="margin:0">No generated file paths recorded yet.</p>';

    if (logEl) {
      var stderr = payload && payload.stderr ? String(payload.stderr) : '';
      var stdout = payload && payload.stdout ? String(payload.stdout) : '';
      var historyErrs =
        payload &&
        payload.historyRun &&
        Array.isArray(payload.historyRun.errors) &&
        payload.historyRun.errors.length
          ? payload.historyRun.errors.join('\n')
          : '';
      var combined = [stderr, stdout, historyErrs].filter(Boolean).join('\n').trim();
      var deps = voicePipelineDepsHint(combined);
      if (status === 'error' || deps) {
        var logText = deps ? deps + '\n\n' + combined : combined;
        logEl.textContent = logText || 'Pipeline finished with an error.';
        logEl.classList.remove('is-hidden');
      } else if (running && combined) {
        logEl.textContent = combined;
        logEl.classList.remove('is-hidden');
      } else {
        logEl.textContent = '';
        logEl.classList.add('is-hidden');
      }
    }

    if (running) startVoicePipelinePolling();
    else stopVoicePipelinePolling();
  }

  var voicePipelineLivePollTimer = null;

  function startVoicePipelineLivePolling() {
    if (voicePipelineLivePollTimer) return;
    voicePipelineLivePollTimer = setInterval(function () {
      var section = document.getElementById('voiceRecorderSection');
      if (!section || section.classList.contains('is-hidden')) return;
      refreshVoicePipelineStatus({ quiet: true });
    }, 2500);
  }

  function stopVoicePipelinePolling() {
    if (voicePipelinePollTimer) {
      clearInterval(voicePipelinePollTimer);
      voicePipelinePollTimer = null;
    }
  }

  function startVoicePipelinePolling() {
    if (voicePipelinePollTimer) return;
    voicePipelinePollTimer = setInterval(function () {
      refreshVoicePipelineStatus({ quiet: true });
    }, 2500);
  }

  function refreshVoicePipelineStatus(opts) {
    opts = opts || {};
    var hint = document.getElementById('voicePipelineHint');
    if (!opts.quiet && hint) hint.textContent = 'Loading pipeline status…';
    return fetch(api('/api/admin/voice-recorder/status'), {
      method: 'GET',
      credentials: apiCred(),
      headers: voicePipelineAdminHeaders(),
      cache: 'no-store',
    })
      .then(function (r) {
        return r.json().then(function (j) {
          return { ok: r.ok, status: r.status, json: j };
        });
      })
      .then(function (pack) {
        if (!pack.ok) {
          if (hint) {
            hint.textContent =
              pack.status === 401
                ? 'Sign in with the operator password to run the pipeline.'
                : (pack.json && pack.json.error) || 'Could not load pipeline status.';
          }
          stopVoicePipelinePolling();
          return;
        }
        renderVoicePipelineStatus(pack.json);
      })
      .catch(function () {
        if (hint) hint.textContent = 'Could not reach the API on this host.';
        stopVoicePipelinePolling();
      });
  }

  function runVoiceRecorderPipeline() {
    var runBtn = document.getElementById('voicePipelineRunBtn');
    var hint = document.getElementById('voicePipelineHint');
    if (runBtn) runBtn.disabled = true;
    if (hint) hint.textContent = 'Starting pipeline…';
    return fetch(api('/api/admin/voice-recorder/run'), {
      method: 'POST',
      credentials: apiCred(),
      headers: voicePipelineAdminHeaders(),
      cache: 'no-store',
    })
      .then(function (r) {
        return r.json().then(function (j) {
          return { ok: r.ok, status: r.status, json: j };
        });
      })
      .then(function (pack) {
        if (pack.status === 401) {
          if (hint) hint.textContent = 'Sign in with the operator password to run the pipeline.';
          if (runBtn) runBtn.disabled = false;
          return;
        }
        if (!pack.ok && pack.status !== 409) {
          if (hint) hint.textContent = (pack.json && pack.json.error) || 'Could not start pipeline.';
          if (runBtn) runBtn.disabled = false;
          return;
        }
        renderVoicePipelineStatus(pack.json);
        startVoicePipelinePolling();
      })
      .catch(function () {
        if (hint) hint.textContent = 'Could not reach the API on this host.';
        if (runBtn) runBtn.disabled = false;
      });
  }

  var voicePipelineUiBound = false;

  function initVoiceRecorderPipelineUi() {
    refreshVoicePipelineStatus({ quiet: true });
    startVoicePipelineLivePolling();
    if (voicePipelineUiBound) return;
    voicePipelineUiBound = true;
    var runBtn = document.getElementById('voicePipelineRunBtn');
    var refreshBtn = document.getElementById('voicePipelineRefreshBtn');
    if (runBtn) {
      runBtn.addEventListener('click', function () {
        runVoiceRecorderPipeline();
      });
    }
    if (refreshBtn) {
      refreshBtn.addEventListener('click', function () {
        refreshVoicePipelineStatus();
      });
    }
  }

  function groupAuditReports(reports) {
    var out = { clinics: [], hotels: [], properties: [] };
    (reports || []).forEach(function (r) {
      var v = r.vertical;
      if (out[v]) out[v].push(r);
    });
    return out;
  }

  function renderAdminReports() {
    var listEl = document.getElementById('adminReportsList');
    var hintEl = document.getElementById('adminReportsHint');
    if (!listEl) return;
    var useAudit = auditReportsLoadState === 'ok' && auditReportsByVertical;
    var items = useAudit
      ? auditReportsByVertical[reportCatalogVertical] || []
      : (reportCatalog && reportCatalog[reportCatalogVertical]) || [];

    if (!items.length) {
      listEl.innerHTML =
        '<p class="tf-admin-muted">No ' +
        escapeHtml(reportCatalogVertical) +
        ' reports listed yet. Add links in <code>public/reports/index.json</code> or slug JSON under <code>public/clinics/data/</code>.</p>';
    } else if (useAudit) {
      listEl.innerHTML =
        '<ul class="tf-admin-reports__links">' +
        items
          .map(function (row) {
            var href = row.primaryHref || '#';
            var title = row.title || href;
            var idPart = row.catalogId
              ? '<span class="tf-admin-reports__id mono">' + escapeHtml(row.catalogId) + '</span> '
              : '';
            var slug = row.slug ? ' <span class="tf-admin-reports__slug">(' + escapeHtml(row.slug) + ')</span>' : '';
            var showSubject =
              row.subject &&
              row.subject !== '—' &&
              String(title).indexOf(String(row.subject)) < 0;
            var subjectPart = showSubject
              ? ' <span class="tf-admin-muted">— ' + escapeHtml(row.subject) + '</span>'
              : '';
            var statusPart = row.status
              ? ' <span class="tf-admin-muted mono">' + escapeHtml(row.status) + '</span>'
              : '';
            var arts = (row.artifacts || [])
              .map(function (a) {
                return '<a class="mono" href="' + escapeHtml(a.href) + '">' + escapeHtml(a.label) + '</a>';
              })
              .join(' · ');
            var artsPart = arts ? ' · ' + arts : '';
            return (
              '<li>' +
              idPart +
              '<a href="' +
              escapeHtml(href) +
              '">' +
              escapeHtml(title) +
              '</a>' +
              slug +
              subjectPart +
              statusPart +
              artsPart +
              '</li>'
            );
          })
          .join('') +
        '</ul>';
    } else {
      listEl.innerHTML =
        '<ul class="tf-admin-reports__links">' +
        items
          .map(function (item) {
            var href = item.href || '#';
            var title = item.title || href;
            var idPart =
              item.id && /^\d{3}$/.test(String(item.id))
                ? '<span class="tf-admin-reports__id mono">' + escapeHtml(String(item.id)) + '</span> '
                : '';
            var slug = item.slug ? ' <span class="tf-admin-reports__slug">(' + escapeHtml(item.slug) + ')</span>' : '';
            return (
              '<li>' +
              idPart +
              '<a href="' +
              escapeHtml(href) +
              '">' +
              escapeHtml(title) +
              '</a>' +
              slug +
              '</li>'
            );
          })
          .join('') +
        '</ul>';
    }
    if (hintEl) {
      hintEl.textContent =
        items.length +
        ' ' +
        reportCatalogVertical +
        ' report link' +
        (items.length === 1 ? '' : 's') +
        ' · source: public/reports/index.json and clinics/data slug files';
    }
    document.querySelectorAll('[data-report-vertical]').forEach(function (btn) {
      var active = btn.getAttribute('data-report-vertical') === reportCatalogVertical;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-selected', active ? 'true' : 'false');
    });
  }

  function loadReportCatalog() {
    var token = getAdminBearer();
    var manifestReq = token
      ? fetch(api('/api/admin/report-catalog'), {
          method: 'GET',
          credentials: apiCred(),
          headers: { Authorization: 'Bearer ' + token },
        })
      : fetch('/reports/index.json', { cache: 'no-store' });

    var manifestChain = manifestReq
      .then(function (r) {
        return r.json().then(function (j) {
          return { ok: r.ok, j: j };
        });
      })
      .then(function (x) {
        if (!x.ok || !x.j) {
          reportCatalog = { clinics: [], hotels: [], properties: [] };
          return;
        }
        reportCatalog = {
          clinics: x.j.clinics || [],
          hotels: x.j.hotels || [],
          properties: x.j.properties || [],
        };
      })
      .catch(function () {
        reportCatalog = { clinics: [], hotels: [], properties: [] };
      });

    var auditChain = token
      ? fetch(api('/api/admin/audit-reports'), {
          method: 'GET',
          credentials: apiCred(),
          headers: { Authorization: 'Bearer ' + token },
        })
          .then(function (r) {
            return r.json().then(function (j) {
              return { ok: r.ok, j: j };
            });
          })
          .then(function (x) {
            if (x.ok && x.j && x.j.ok && Array.isArray(x.j.reports)) {
              auditReportsByVertical = groupAuditReports(x.j.reports);
              auditReportsLoadState = 'ok';
            } else {
              auditReportsByVertical = null;
              auditReportsLoadState = 'error';
            }
          })
          .catch(function () {
            auditReportsByVertical = null;
            auditReportsLoadState = 'error';
          })
      : Promise.resolve().then(function () {
          auditReportsByVertical = null;
          auditReportsLoadState = 'skipped';
        });

    return Promise.all([manifestChain, auditChain]).then(function () {
      renderAdminReports();
    });
  }

  function revealAdminWorkspaceShell() {
    applyAdminShellLoginNextIfPresent();
    if (gate) gate.classList.add('is-hidden');
    if (workspace) workspace.classList.remove('is-hidden');
    loadTfVersion();
    syncAdminRouteFromLocation();
    loadReportCatalog();
    loadWorkQueue();
    if (typeof window.soRebuildSiteNavDrawer === 'function') {
      try {
        window.soRebuildSiteNavDrawer();
      } catch (eNav) {}
    }
  }

  function showWorkspace() {
    redirectClinicHotelLoginNextIfPresent().then(function (didRedirect) {
      if (didRedirect) return;
      revealAdminWorkspaceShell();
    });
  }

  function hideWorkspace() {
    var tok = getAdminBearer();
    if (tok) {
      fetch(api('/api/admin/logout'), {
        method: 'POST',
        credentials: apiCred(),
        headers: { Authorization: 'Bearer ' + tok },
      }).catch(function () {});
    }
    clearStoredAdminJwt();
    if (workspace) workspace.classList.add('is-hidden');
    if (gate) gate.classList.remove('is-hidden');
    if (hint) {
      hint.textContent = '';
      hint.className = 'portal-form__hint mono';
    }
  }

  function setHint(msg, kind) {
    if (!hint) return;
    hint.textContent = msg;
    hint.className = 'portal-form__hint mono' + (kind === 'error' ? ' is-error' : kind === 'ok' ? ' is-ok' : '');
  }

  function applyCapabilities() {
    if (passwordInput) passwordInput.setAttribute('required', 'required');
    if (gateLede) {
      if (capabilitiesFromOurServer && capabilitiesHttpOk) {
        gateLede.textContent = serverPasswordAuth
          ? 'Sign in with the operator email and password configured on the server (hashed; never sent by email).'
          : 'The API is running, but admin password sign-in is not configured yet. Set ADMIN_PASSWORD_HASH on this service (see README), redeploy, then reload.';
      } else {
        gateLede.textContent =
          'Sign in with the operator email and password on the Node server (npm start or deployed server.mjs).';
      }
    }
    if (submitBtn) submitBtn.innerHTML = 'Sign in<span class="ico-arrow-r" aria-hidden="true"></span>';
    if (configBanner) {
      if (capabilitiesFromOurServer && capabilitiesHttpOk && !serverPasswordAuth) {
        configBanner.innerHTML =
          'Set <strong>ADMIN_PASSWORD_HASH</strong> on this Railway service. Generate it locally: <code>node scripts/hash-admin-password.mjs</code> — then paste the line into variables, redeploy, reload.';
        configBanner.classList.remove('is-hidden');
      } else if (!capabilitiesHttpOk) {
        configBanner.innerHTML =
          'Could not reach <code>/api/admin/capabilities</code>. Run <code>npm start</code> (server.mjs) on this host, or open the deployed Node service URL.';
        configBanner.classList.remove('is-hidden');
      } else configBanner.classList.add('is-hidden');
    }
  }

  /** Load admin capabilities (no UI); paired with version probe before applyCapabilities. */
  function fetchCapabilitiesData() {
    return fetch(api('/api/admin/capabilities'), { method: 'GET', credentials: apiCred(), cache: 'no-store' })
      .then(function (r) {
        capabilitiesHttpOk = r.ok;
        if (!r.ok) throw new Error('bad');
        return r.json();
      })
      .then(function (j) {
        capabilitiesFromOurServer = Boolean(j && j.service === 'serviceopera');
        serverPasswordAuth = Boolean(j && j.adminPasswordConfigured);
      })
      .catch(function () {
        serverPasswordAuth = false;
        capabilitiesHttpOk = false;
        capabilitiesFromOurServer = false;
      });
  }

  /** Settle GET /api/version so gate copy (e.g. ADMIN_PASSWORD_HASH) never flashes before API reachability is known. */
  function fetchAdminVersionProbe() {
    return fetch(api('/api/version'), { cache: 'no-store', credentials: apiCred() }).then(
      function () {},
      function () {}
    );
  }

  function getPortalJwt() {
    var i;
    for (i = 0; i < PORTAL_JWT_KEYS.length; i++) {
      try {
        var k = PORTAL_JWT_KEYS[i];
        var token = localStorage.getItem(k) || sessionStorage.getItem(k);
        if (token) return token;
      } catch (e) {}
    }
    return '';
  }

  function tryRestoreJwtSession() {
    var token = readStoredAdminJwt();
    if (!token) return Promise.resolve(false);
    return fetch(api('/api/admin/session'), {
      method: 'GET',
      credentials: apiCred(),
      headers: { Authorization: 'Bearer ' + token },
    })
      .then(function (r) {
        if (!r.ok) {
          clearStoredAdminJwt();
          return false;
        }
        writeStoredAdminJwt(token);
        showWorkspace();
        return true;
      })
      .catch(function () {
        clearStoredAdminJwt();
        return false;
      });
  }

  function tryRestorePortalOperatorSession() {
    var portalJwt = getPortalJwt();
    if (!portalJwt || !decodeJwtIsOperator(portalJwt)) return Promise.resolve(false);
    return fetch(api('/api/admin/session'), {
      method: 'GET',
      credentials: apiCred(),
      headers: { Authorization: 'Bearer ' + portalJwt },
      cache: 'no-store',
    })
      .then(function (r) {
        if (!r.ok) return false;
        showWorkspace();
        return true;
      })
      .catch(function () {
        return false;
      });
  }

  function showAdminLoginGate() {
    if (workspace) workspace.classList.add('is-hidden');
    if (gate) gate.classList.remove('is-hidden');
    if (hint) {
      hint.textContent = '';
      hint.className = 'portal-form__hint mono';
    }
    var pendingNext = readAdminLoginNextParam();
    if (
      gateLede &&
      pendingNext &&
      configBanner &&
      configBanner.classList.contains('is-hidden')
    ) {
      var pendingPath = pendingNext.split('?')[0].split('#')[0];
      if (isAllowedClinicHotelNextPath(pendingPath) || isAllowedAdminShellNextPath(pendingPath)) {
        gateLede.textContent =
          'Sign in to continue to ' + pendingNext + ' (operator email and password on the server).';
      }
    }
    try {
      window.scrollTo(0, 0);
    } catch (eScroll) {}
  }

  function hideAdminBoot() {
    if (bootEl) {
      bootEl.classList.add('is-hidden');
      bootEl.setAttribute('aria-busy', 'false');
    }
  }

  /** Defer one frame past layout/paint so the workspace shell is not revealed mid-paint. */
  function revealAdminBootAfterPaint() {
    if (revealAdminBootAfterPaint._done) return;
    revealAdminBootAfterPaint._done = true;
    if (revealAdminBootAfterPaint._safetyTimer) {
      clearTimeout(revealAdminBootAfterPaint._safetyTimer);
      revealAdminBootAfterPaint._safetyTimer = null;
    }
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        hideAdminBoot();
      });
    });
  }

  revealAdminBootAfterPaint._safetyTimer = setTimeout(function () {
    try {
      hideAdminBoot();
    } catch (eBoot) {}
  }, 12000);

  Promise.all([fetchCapabilitiesData(), fetchAdminVersionProbe()])
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
    })
    .finally(function () {
      revealAdminBootAfterPaint();
    });

  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var fd = new FormData(form);
      var email = (fd.get('email') || '').toString().trim().toLowerCase();
      var password = (fd.get('password') || '').toString();

      if (capabilitiesFromOurServer && capabilitiesHttpOk) {
        setHint('Signing in…', '');
        fetch(api('/api/admin/login'), {
          method: 'POST',
          credentials: apiCred(),
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email, password: password }),
        })
          .then(function (r) {
            return r.json().then(function (j) {
              return { ok: r.ok, j: j };
            });
          })
          .then(function (x) {
            if (!x.ok || !x.j || !x.j.token) {
              setHint((x.j && x.j.error) || 'Invalid email or password.', 'error');
              if (passwordInput) passwordInput.value = '';
              return;
            }
            writeStoredAdminJwt(x.j.token);
            setHint('Signed in.', 'ok');
            showWorkspace();
          })
          .catch(function () {
            setHint('Network error. Try again.', 'error');
          });
        return;
      }

      if (!capabilitiesHttpOk) {
        setHint(
          'Cannot reach the Node API from this host. Run npm start or deploy server.mjs with ADMIN_PASSWORD_HASH set.',
          'error'
        );
      } else {
        setHint(
          'Admin password sign-in is not configured on this server. Set ADMIN_PASSWORD_HASH (see README), redeploy, then try again.',
          'error'
        );
      }
    });
  }

  function getAdminBearer() {
    var adminTok = readStoredAdminJwt();
    if (adminTok) return adminTok;
    var portalTok = getPortalJwt();
    if (portalTok && decodeJwtIsOperator(portalTok)) return portalTok;
    return '';
  }

  function redirectToUnifiedLogin() {
    var next = window.location.pathname + window.location.search + window.location.hash;
    try {
      var u = new URL('/login.html', window.location.origin);
      if (next && next.charAt(0) === '/' && next.indexOf('//') !== 0) {
        u.searchParams.set('next', next);
      }
      window.location.replace(u.pathname + u.search);
    } catch (eLogin) {
      window.location.replace('/login.html?next=' + encodeURIComponent(next));
    }
  }

  window.readStoredAdminJwt = readStoredAdminJwt;
  window.getAdminBearer = getAdminBearer;

  function formatAdminTs(iso) {
    if (!iso) return '';
    try {
      var d = new Date(iso);
      if (isNaN(d.getTime())) return String(iso);
      return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
    } catch (e) {
      return String(iso);
    }
  }

  function inboxCol(title, innerHtml) {
    return (
      '<div class="admin-inbox__col">' +
      '<h3 class="admin-inbox__col-title mono">' +
      escapeHtml(title) +
      '</h3>' +
      innerHtml +
      '</div>'
    );
  }

  function renderWorkQueue(data) {
    var body = document.getElementById('adminInboxBody');
    if (!body) return;
    var pending = data.pendingRegistrations || [];
    var users = data.users || data.clinicUsers || [];
    var orphans = data.orphanReportDataFiles || [];
    var files = (data.clinicReportFiles || []).slice(0, 24);
    var pages = data.managedPages || [];

    var pHtml = '<ul class="admin-inbox__list">';
    if (!pending.length) {
      pHtml += '<li><p class="admin-inbox__empty">No pending email confirmations.</p></li>';
    } else {
      pending.forEach(function (p) {
        var reportUrl = '/clinics/report.html?slug=' + encodeURIComponent(p.reportSlug);
        pHtml +=
          '<li><span style="color:var(--amber-2);">' +
          escapeHtml(p.email) +
          '</span><br /><span class="admin-inbox__slug mono">slug: ' +
          escapeHtml(p.reportSlug) +
          ' · ' +
          escapeHtml(formatAdminTs(p.createdAt)) +
          '</span><br /><a class="mono admin-inbox__slug" href="' +
          reportUrl +
          '">' +
          escapeHtml(reportUrl) +
          '</a></li>';
      });
    }
    pHtml += '</ul>';

    var uHtml = '<ul class="admin-inbox__list">';
    if (!users.length) {
      uHtml += '<li><p class="admin-inbox__empty">No users yet.</p></li>';
    } else {
      users.slice(0, 12).forEach(function (u) {
        var reportUrl = '/clinics/report.html?slug=' + encodeURIComponent(u.reportSlug);
        uHtml +=
          '<li><span style="color:var(--amber-2);">' +
          escapeHtml(u.email) +
          '</span><br /><span class="admin-inbox__slug mono">slug: ' +
          escapeHtml(u.reportSlug) +
          ' · ' +
          escapeHtml(formatAdminTs(u.createdAt)) +
          '</span><br /><a class="mono admin-inbox__slug" href="' +
          reportUrl +
          '">' +
          escapeHtml(reportUrl) +
          '</a></li>';
      });
    }
    uHtml += '</ul>';

    var oHtml = '<ul class="admin-inbox__list">';
    if (!orphans.length) {
      oHtml +=
        '<li><p class="admin-inbox__empty">No orphan data files — each JSON matches a user or pending signup.</p></li>';
    } else {
      orphans.forEach(function (f) {
        var when =
          f.mtimeMs != null ? formatAdminTs(new Date(f.mtimeMs).toISOString()) : '';
        oHtml +=
          '<li><span class="admin-inbox__warn mono">' +
          escapeHtml(f.slug) +
          '</span><br /><span class="admin-inbox__slug mono">' +
          escapeHtml(f.relPath) +
          (when ? ' · ' + escapeHtml(when) : '') +
          '</span></li>';
      });
    }
    oHtml += '</ul>';

    var fHtml = '<ul class="admin-inbox__list">';
    if (!files.length) {
      fHtml += '<li><p class="admin-inbox__empty">No JSON files in clinics/data yet.</p></li>';
    } else {
      files.forEach(function (f) {
        var reportUrl = '/clinics/report.html?slug=' + encodeURIComponent(f.slug);
        var when =
          f.mtimeMs != null ? formatAdminTs(new Date(f.mtimeMs).toISOString()) : '';
        fHtml +=
          '<li><span class="mono">' +
          escapeHtml(f.slug) +
          '</span><br /><span class="admin-inbox__slug mono">' +
          escapeHtml(f.relPath) +
          (when ? ' · ' + escapeHtml(when) : '') +
          '</span><br /><a class="mono admin-inbox__slug" href="' +
          reportUrl +
          '">Preview report</a></li>';
      });
    }
    fHtml += '</ul>';

    var pgHtml = '<ul class="admin-inbox__list">';
    if (!pages.length) {
      pgHtml += '<li><p class="admin-inbox__empty">No tracked pages found on disk.</p></li>';
    } else {
      pages.forEach(function (pg) {
        var when =
          pg.mtimeMs != null ? formatAdminTs(new Date(pg.mtimeMs).toISOString()) : '';
        pgHtml +=
          '<li><a href="' +
          escapeHtml(pg.path) +
          '" class="mono">' +
          escapeHtml(pg.path) +
          '</a><br /><span class="admin-inbox__slug mono">' +
          escapeHtml(when) +
          '</span></li>';
      });
    }
    pgHtml += '</ul>';

    body.innerHTML =
      inboxCol('Pending registrations (awaiting email confirmation)', pHtml) +
      inboxCol('Users (newest first)', uHtml) +
      inboxCol('Report data files without user / pending', oHtml) +
      inboxCol('Recent report JSON files', fHtml) +
      inboxCol('Managed pages', pgHtml);
  }

  function loadWorkQueue() {
    var hint = document.getElementById('adminInboxHint');
    var body = document.getElementById('adminInboxBody');
    if (!body) return;
    var token = getAdminBearer();
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
    })
      .then(function (r) {
        return r.json().then(function (j) {
          return { ok: r.ok, j: j };
        });
      })
      .then(function (x) {
        if (!x.ok) {
          if (hint) {
            hint.textContent = (x.j && x.j.error) || 'Could not load inbox.';
            hint.className = 'admin-inbox__hint mono is-error';
          }
          body.innerHTML = '';
          return;
        }
        if (hint) {
          hint.textContent = 'Updated ' + formatAdminTs(x.j.generatedAt) + '.';
          hint.className = 'admin-inbox__hint mono is-ok';
        }
        renderWorkQueue(x.j);
        renderTfUsersTable(x.j);
      })
      .catch(function () {
        if (hint) {
          hint.textContent = 'Network error.';
          hint.className = 'admin-inbox__hint mono is-error';
        }
      });
  }

  function renderPortalUserRows(users) {
    if (!users || !users.length) {
      return '<li class="mono" style="opacity:.75;">No users yet.</li>';
    }
    return users
      .map(function (u) {
        var url = '/clinics/report.html?slug=' + encodeURIComponent(u.reportSlug);
        return (
          '<li style="margin-bottom:.75rem;padding-bottom:.75rem;border-bottom:1px solid var(--line);">' +
          '<span style="color:var(--amber-2);">' +
          escapeHtml(u.email) +
          '</span><br /><span class="mono" style="font-size:.65rem;">slug: ' +
          escapeHtml(u.reportSlug) +
          '</span><br /><a href="' +
          url +
          '" class="mono" style="font-size:.65rem;">' +
          url +
          '</a></li>'
        );
      })
      .join('');
  }

  function loadPortalUsersList() {
    var listEl = document.getElementById('portalUserList');
    if (!listEl) return;
    var token = getAdminBearer();
    fetch(api('/api/user-accounts'), {
      method: 'GET',
      credentials: apiCred(),
      headers: { Authorization: 'Bearer ' + token },
    })
      .then(function (r) {
        return r.json().then(function (j) {
          return { ok: r.ok, j: j };
        });
      })
      .then(function (x) {
        if (!x.ok) {
          listEl.innerHTML = '<li class="mono is-error">Could not load users.</li>';
          return;
        }
        listEl.innerHTML = renderPortalUserRows(x.j.users);
      })
      .catch(function () {
        listEl.innerHTML = '<li class="mono is-error">Network error.</li>';
      });
  }

  function openUserReportsPanel(tile) {
    if (!panel || !panelTitle || !panelBody) return;
    panelTitle.textContent = tile.label;
    var token = getAdminBearer();
    if (!token) {
      panelBody.innerHTML =
        '<p class="admin-panel__stub">After you sign in on the <strong>live Node server</strong> (operator password), you can register user emails and passwords here. They appear in the on-disk user store and can open <strong>/clinics/report.html?slug=…</strong> after using <strong>Log in</strong> in the site header.</p>' +
        '<p class="admin-panel__stub">Sign in on the Node server to load this data.</p>';
      panel.classList.remove('is-hidden');
      window.scrollTo(0, 0);
      return;
    }

    panelBody.innerHTML =
      '<p class="admin-panel__body">Add a user: they sign in with this email and password, then only see the report for the <strong>slug</strong> you set. Data file: <code>public/clinics/data/&lt;slug&gt;.json</code> (falls back to <code>_data.json</code> if missing).</p>' +
      '<form id="portalUserCreateForm" class="portal-form" style="max-width: 28rem; margin-top: 1rem;">' +
      '<label><span class="mono">EMAIL</span><input type="email" name="email" required autocomplete="off" /></label>' +
      '<label><span class="mono">PASSWORD</span><input type="password" name="password" required minlength="8" autocomplete="new-password" placeholder="min 8 characters" /></label>' +
      '<label><span class="mono">REPORT SLUG</span><input type="text" name="reportSlug" required pattern="[a-z0-9][a-z0-9-]*" title="Lowercase letters, numbers, hyphens" placeholder="e.g. serenity-dental-q2" /></label>' +
      '<button type="submit" class="btn btn--primary">Save user</button>' +
      '<p class="portal-form__hint mono" id="portalUserFormHint"></p></form>' +
      '<h3 class="admin-panel__title mono" style="margin-top: 2rem;">Registered users</h3>' +
      '<ul id="portalUserList" class="mono" style="list-style: none; padding: 0; margin: 0; line-height: 1.5;"></ul>';

    var form = document.getElementById('portalUserCreateForm');
    var fh = document.getElementById('portalUserFormHint');
    if (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        if (fh) {
          fh.textContent = '';
          fh.className = 'portal-form__hint mono';
        }
        var fd = new FormData(form);
        var body = {
          email: (fd.get('email') || '').toString().trim(),
          password: (fd.get('password') || '').toString(),
          reportSlug: (fd.get('reportSlug') || '').toString().trim().toLowerCase(),
        };
        fetch(api('/api/user-accounts'), {
          method: 'POST',
          credentials: apiCred(),
          headers: {
            Authorization: 'Bearer ' + getAdminBearer(),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        })
          .then(function (r) {
            return r.json().then(function (j) {
              return { ok: r.ok, j: j };
            });
          })
          .then(function (x) {
            if (!x.ok) {
              if (fh) {
                fh.textContent = (x.j && x.j.error) || 'Could not save.';
                fh.className = 'portal-form__hint mono is-error';
              }
              return;
            }
            if (fh) {
              fh.textContent = 'Saved. User can log in and open /clinics/report.html?slug=' + body.reportSlug;
              fh.className = 'portal-form__hint mono is-ok';
            }
            form.reset();
            loadPortalUsersList();
            loadWorkQueue();
          })
          .catch(function () {
            if (fh) {
              fh.textContent = 'Network error.';
              fh.className = 'portal-form__hint mono is-error';
            }
          });
      });
    }
    loadPortalUsersList();
    panel.classList.remove('is-hidden');
    window.scrollTo(0, 0);
  }

  var inboxRefresh = document.getElementById('adminInboxRefresh');
  if (inboxRefresh) {
    inboxRefresh.addEventListener('click', function () {
      loadWorkQueue();
      loadReportCatalog();
    });
  }

  document.querySelectorAll('[data-report-vertical]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var key = btn.getAttribute('data-report-vertical');
      if (!key) return;
      reportCatalogVertical = key;
      renderAdminReports();
    });
  });

  var usersSearchEl = document.getElementById('adminUsersSearch');
  if (usersSearchEl) {
    usersSearchEl.addEventListener('input', function () {
      usersSearch = usersSearchEl.value || '';
      renderTfUsersTable({ users: cachedUsers, pendingRegistrations: cachedPending });
    });
  }
  var usersFilterEl = document.getElementById('adminUsersFilter');
  if (usersFilterEl) {
    usersFilterEl.addEventListener('change', function () {
      usersFilter = usersFilterEl.value || 'all';
      renderTfUsersTable({ users: cachedUsers, pendingRegistrations: cachedPending });
    });
  }
  var usersSortEl = document.getElementById('adminUsersSort');
  if (usersSortEl) {
    usersSortEl.addEventListener('change', function () {
      usersSort = usersSortEl.value || 'recent';
      renderTfUsersTable({ users: cachedUsers, pendingRegistrations: cachedPending });
    });
  }
  var usersCsvBtn = document.getElementById('adminUsersCsvBtn');
  if (tfNav) {
    tfNav.addEventListener('click', function (ev) {
      var a = ev.target && ev.target.closest && ev.target.closest('a.tf-admin-nav__pill[href]');
      if (!a || !tfNav.contains(a)) return;
      var href = a.getAttribute('href') || '';
      if (!href || href === '#' || href.indexOf('/operator/') === 0) return;
      adminShellNavigate(href, ev, false);
    });
  }

  window.addEventListener('popstate', function () {
    stripAdminLoginNextQueryParam();
    if (workspace && !workspace.classList.contains('is-hidden')) {
      syncAdminRouteFromLocation();
    }
  });

  if (usersCsvBtn) {
    usersCsvBtn.addEventListener('click', function () {
      var rows = applyUsersView();
      var lines = [
        'id,email,name,gender,active,admin,plus,spend,earned,last_login_at,last_login_ip,country,report_slug,created_at',
      ].concat(
        rows.map(function (u) {
          return [
            shortDisplayId(u.id),
            u.email,
            userDisplayName(u),
            u.gender || '',
            u.active !== false ? 'yes' : 'no',
            u.admin ? 'yes' : 'no',
            u.plus ? 'yes' : 'no',
            Number(u.spend) || 0,
            Number(u.earned) || 0,
            u.lastLoginAt || '',
            u.lastLoginIp || '',
            u.country || '',
            u.reportSlug,
            u.createdAt || '',
          ]
            .map(function (v) {
              return '"' + String(v || '').replace(/"/g, '""') + '"';
            })
            .join(',');
        })
      );
      var blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'serviceopera-users.csv';
      a.click();
      URL.revokeObjectURL(url);
    });
  }
})();
