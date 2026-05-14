(function () {
  'use strict';

  var ADMIN_EMAIL = 'jack@serviceopera.to';
  var ADMIN_PASSWORD =
    typeof window.__ADMIN_PASSWORD__ === 'string' ? window.__ADMIN_PASSWORD__.trim() : '';

  var SESSION_KEY = 'so_admin_session';
  var JWT_KEY = 'so_admin_jwt';
  var PORTAL_ADMIN_SESSION = 'portal-admin';
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

  var serverPasswordAuth = false;
  var capabilitiesHttpOk = false;
  var capabilitiesFromOurServer = false;

  var gate = document.getElementById('adminGate');
  var workspace = document.getElementById('adminWorkspace');
  var bootEl = document.getElementById('adminBoot');
  var form = document.getElementById('adminGateForm');
  var hint = document.getElementById('adminGateHint');
  var tfNav = document.getElementById('tfAdminNav');
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

  function portalAdminEmailFromJwt() {
    return decodeJwtEmail(getPortalJwt()).trim().toLowerCase();
  }

  function isPortalAdminSignedIn() {
    return portalAdminEmailFromJwt() === ADMIN_EMAIL.toLowerCase();
  }

  function tryRestorePortalAdminWorkspace() {
    if (!isPortalAdminSignedIn()) return false;
    sessionStorage.setItem(SESSION_KEY, PORTAL_ADMIN_SESSION);
    showWorkspace();
    return true;
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
            '">Edit profile</button> · <a href="' +
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
    if (document.getElementById('adminMainDefault')) document.getElementById('adminMainDefault').classList.add('is-hidden');
    panelTitle.textContent = 'Site appearance';
    panelBody.innerHTML =
      '<div class="so-site-appearance">' +
      '<p class="tf-admin-muted so-site-appearance__lede">Square previews update as you type. Use <strong>Upload…</strong> (admin only, saves under <code>/assets/site-uploads/</code>), <strong>Delete</strong> to remove an uploaded <code>su-*</code> file from the server (or clear any URL), or paste <code>/assets/…</code> / a public <strong>https</strong> URL. <strong>Nav logo</strong> and <strong>Jack avatar</strong>: PNG or WebP with transparency (alpha) is supported — the public header and Jack portrait do not paint an opaque plate behind the image. <code>/logo.png</code> redirects to the nav logo URL below. Public: <code>GET /api/site-appearance</code>.</p>' +
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
      '<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" class="is-hidden" id="soSiteNavLogoFile" />' +
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
      '<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" class="is-hidden" id="soSiteJackAvatarFile" />' +
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
      '<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" class="is-hidden" id="soSiteHomeImgFile" />' +
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
      '<img id="soSitePropImgPreview" class="so-site-appearance__preview-img is-hidden" alt="" decoding="async" />' +
      '<div id="soSitePropImgPreviewEmpty" class="so-site-appearance__preview-empty">No preview</div>' +
      '</div>' +
      '<div class="so-site-appearance__card-fields">' +
      '<h3 class="so-site-appearance__card-title">Property</h3>' +
      '<p class="so-site-appearance__card-meta mono">property.html hero</p>' +
      '<div class="so-site-appearance__field-actions">' +
      '<label class="so-site-appearance__pick"><input type="checkbox" class="so-site-appearance__cb" data-so-appearance-sel="prop" aria-label="Select property hero" /> <span class="mono">Select</span></label>' +
      '<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" class="is-hidden" id="soSitePropImgFile" />' +
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
      '<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" class="is-hidden" id="soSiteClinicImgFile" />' +
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
      '<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" class="is-hidden" id="soSiteHotelImgFile" />' +
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
      '<button type="button" class="btn btn--primary" id="soSiteAppearanceSave">Save all</button> ' +
      '<a href="/admin/users" class="btn btn--ghost mono" id="soSiteAppearanceBack">← Users & payouts</a>' +
      '</div></div></div>';
    panel.classList.remove('is-hidden');
    window.scrollTo(0, 0);

    function siteAppearanceResolveUrl(raw) {
      var u = String(raw || '').trim();
      if (!u) return '';
      if (/^https?:\/\//i.test(u)) return u;
      if (u.charAt(0) === '/') return window.location.origin + u;
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
        if (!imgEl.naturalWidth) return;
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
    };
    function applySiteAppearanceMerge(apiJson) {
      var o = apiJson && typeof apiJson === 'object' ? apiJson : {};
      function pick(k) {
        var v = o[k];
        var t = v != null && String(v).trim() ? String(v).trim() : '';
        return t || (SITE_APPEARANCE_DEFAULTS[k] != null ? SITE_APPEARANCE_DEFAULTS[k] : '');
      }
      if (navLogoUrlEl) navLogoUrlEl.value = pick('navLogoUrl');
      if (navLogoAltEl) navLogoAltEl.value = pick('navLogoAlt');
      if (jackUrlEl) jackUrlEl.value = pick('jackAvatarUrl');
      if (jackAltEl) jackAltEl.value = pick('jackAvatarAlt');
      if (homeUrlEl) homeUrlEl.value = pick('homePageImageUrl');
      if (homeAltEl) homeAltEl.value = pick('homePageImageAlt');
      if (urlEl) urlEl.value = pick('propertyPageImageUrl');
      if (altEl) altEl.value = pick('propertyPageImageAlt');
      if (clinicUrlEl) clinicUrlEl.value = pick('clinicPageImageUrl');
      if (clinicAltEl) clinicAltEl.value = pick('clinicPageImageAlt');
      if (hotelUrlEl) hotelUrlEl.value = pick('hotelPageImageUrl');
      if (hotelAltEl) hotelAltEl.value = pick('hotelPageImageAlt');
    }
    function bumpSiteAppearanceUrlPreviews() {
      [navLogoUrlEl, jackUrlEl, homeUrlEl, urlEl, clinicUrlEl, hotelUrlEl].forEach(function (el) {
        if (el) el.dispatchEvent(new Event('input', { bubbles: true }));
      });
    }
    function bindAppearanceUpload(pickBtnId, fileInputId, urlInput) {
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
        var reader = new FileReader();
        reader.onerror = function () {
          if (hintEl) hintEl.textContent = 'Could not read file.';
          fin.value = '';
        };
        reader.onload = function () {
          var dataUrl = reader.result;
          var b64 =
            typeof dataUrl === 'string' && dataUrl.indexOf(',') >= 0 ? dataUrl.split(',')[1] : '';
          if (!b64) {
            if (hintEl) hintEl.textContent = 'Empty file.';
            fin.value = '';
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
              urlInput.value = x.j.url;
              urlInput.dispatchEvent(new Event('input', { bubbles: true }));
              if (hintEl) {
                hintEl.textContent =
                  'Uploaded ' + x.j.url + ' (' + String(x.j.bytes) + ' B). Save to persist in site config.';
              }
              fin.value = '';
            })
            .catch(function () {
              if (hintEl) hintEl.textContent = 'Upload network error.';
              fin.value = '';
            });
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
              if (x.j.deletedFromDisk) {
                hintEl.textContent = 'Removed file from server. Save to persist empty URL in site config.';
              } else if (x.j.reason === 'not_site_upload') {
                hintEl.textContent =
                  'Cleared URL (not an su-* upload under /assets/site-uploads/). Save to persist.';
              } else {
                hintEl.textContent =
                  'Cleared URL (upload file was already gone). Save to persist empty URL in site config.';
              }
            }
          })
          .catch(function () {
            if (hintEl) hintEl.textContent = 'Delete network error.';
          });
      });
    }
    bindAppearanceUpload('soSiteNavLogoPickBtn', 'soSiteNavLogoFile', navLogoUrlEl);
    bindClearUrl('soSiteNavLogoClearBtn', navLogoUrlEl);
    bindDeleteUpload('soSiteNavLogoDeleteBtn', navLogoUrlEl);
    bindAppearanceUpload('soSiteJackAvatarPickBtn', 'soSiteJackAvatarFile', jackUrlEl);
    bindClearUrl('soSiteJackAvatarClearBtn', jackUrlEl);
    bindDeleteUpload('soSiteJackAvatarDeleteBtn', jackUrlEl);
    bindAppearanceUpload('soSiteHomeImgPickBtn', 'soSiteHomeImgFile', homeUrlEl);
    bindClearUrl('soSiteHomeImgClearBtn', homeUrlEl);
    bindDeleteUpload('soSiteHomeImgDeleteBtn', homeUrlEl);
    bindAppearanceUpload('soSitePropImgPickBtn', 'soSitePropImgFile', urlEl);
    bindClearUrl('soSitePropImgClearBtn', urlEl);
    bindDeleteUpload('soSitePropImgDeleteBtn', urlEl);
    bindAppearanceUpload('soSiteClinicImgPickBtn', 'soSiteClinicImgFile', clinicUrlEl);
    bindClearUrl('soSiteClinicImgClearBtn', clinicUrlEl);
    bindDeleteUpload('soSiteClinicImgDeleteBtn', clinicUrlEl);
    bindAppearanceUpload('soSiteHotelImgPickBtn', 'soSiteHotelImgFile', hotelUrlEl);
    bindClearUrl('soSiteHotelImgClearBtn', hotelUrlEl);
    bindDeleteUpload('soSiteHotelImgDeleteBtn', hotelUrlEl);
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
            n > 0
              ? 'Cleared ' + n + ' image URL(s). Save to apply defaults from the server for empty fields.'
              : 'Select one or more fields first.';
        }
      });
    }
    var token = getAdminBearer();
    if (!token) {
      applySiteAppearanceMerge({});
      bumpSiteAppearanceUrlPreviews();
      if (hintEl) {
        hintEl.textContent =
          'Sign in as admin on the Node host to load saved URLs from the server and save. Below: suggested paths from /assets/ on this host.';
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
          applySiteAppearanceMerge({});
          if (hintEl) {
            hintEl.textContent =
              'Could not load saved settings (HTTP ' +
              (x.status != null ? x.status : '?') +
              '). Showing defaults under /assets/… on this origin. Save still needs the Node API (so-api.js → backend).';
          }
          bumpSiteAppearanceUrlPreviews();
          return;
        }
        applySiteAppearanceMerge(x.j);
        if (hintEl) hintEl.textContent = 'Loaded from API. Public: GET /api/site-appearance';
        bumpSiteAppearanceUrlPreviews();
      })
      .catch(function () {
        applySiteAppearanceMerge({});
        if (hintEl) {
          hintEl.textContent =
            'Network error calling the API. Showing /assets/… defaults. Deploy frontend with so-api.js so admin requests reach the backend.';
        }
        bumpSiteAppearanceUrlPreviews();
      });

    var save = document.getElementById('soSiteAppearanceSave');
    if (save) {
      save.addEventListener('click', function () {
        if (hintEl) hintEl.textContent = 'Saving…';
        fetch(api('/api/admin/site-appearance'), {
          method: 'PUT',
          credentials: apiCred(),
          cache: 'no-store',
          headers: {
            Authorization: 'Bearer ' + getAdminBearer(),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            navLogoUrl: navLogoUrlEl ? navLogoUrlEl.value : '',
            navLogoAlt: navLogoAltEl ? navLogoAltEl.value : '',
            jackAvatarUrl: jackUrlEl ? jackUrlEl.value : '',
            jackAvatarAlt: jackAltEl ? jackAltEl.value : '',
            homePageImageUrl: homeUrlEl ? homeUrlEl.value : '',
            homePageImageAlt: homeAltEl ? homeAltEl.value : '',
            propertyPageImageUrl: urlEl ? urlEl.value : '',
            propertyPageImageAlt: altEl ? altEl.value : '',
            clinicPageImageUrl: clinicUrlEl ? clinicUrlEl.value : '',
            clinicPageImageAlt: clinicAltEl ? clinicAltEl.value : '',
            hotelPageImageUrl: hotelUrlEl ? hotelUrlEl.value : '',
            hotelPageImageAlt: hotelAltEl ? hotelAltEl.value : '',
          }),
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
            if (hintEl) hintEl.textContent = 'Saved. Visitors will see the new images on the next page load.';
            if (navLogoUrlEl && x.j.navLogoUrl) navLogoUrlEl.value = x.j.navLogoUrl;
            if (navLogoAltEl && x.j.navLogoAlt) navLogoAltEl.value = x.j.navLogoAlt;
            if (jackUrlEl && 'jackAvatarUrl' in x.j) jackUrlEl.value = x.j.jackAvatarUrl || '';
            if (jackAltEl && 'jackAvatarAlt' in x.j) jackAltEl.value = x.j.jackAvatarAlt || '';
            if (homeUrlEl && x.j.homePageImageUrl) homeUrlEl.value = x.j.homePageImageUrl;
            if (homeAltEl && x.j.homePageImageAlt) homeAltEl.value = x.j.homePageImageAlt;
            if (urlEl && x.j.propertyPageImageUrl) urlEl.value = x.j.propertyPageImageUrl;
            if (altEl && x.j.propertyPageImageAlt) altEl.value = x.j.propertyPageImageAlt;
            if (clinicUrlEl && x.j.clinicPageImageUrl) clinicUrlEl.value = x.j.clinicPageImageUrl;
            if (clinicAltEl && x.j.clinicPageImageAlt) clinicAltEl.value = x.j.clinicPageImageAlt;
            if (hotelUrlEl && x.j.hotelPageImageUrl) hotelUrlEl.value = x.j.hotelPageImageUrl;
            if (hotelAltEl && x.j.hotelPageImageAlt) hotelAltEl.value = x.j.hotelPageImageAlt;
            bumpSiteAppearanceUrlPreviews();
          })
          .catch(function () {
            if (hintEl) hintEl.textContent = 'Network error on save.';
          });
      });
    }
  }

  function openIconsPanel() {
    if (!panel || !panelTitle || !panelBody) return;
    if (document.getElementById('adminMainDefault')) document.getElementById('adminMainDefault').classList.add('is-hidden');
    panelTitle.textContent = 'Icons';
    var rows = [
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
      {
        key: 'home-sector-hotels',
        title: 'Home — Hotels sector card',
        hint: 'Homepage sector grid: Hotels & serviced apartments icon area.',
      },
      {
        key: 'home-sector-clinics',
        title: 'Home — Clinics sector card',
        hint: 'Homepage sector grid: Clinics, dental & wellness icon area.',
      },
      {
        key: 'home-sector-property',
        title: 'Home — Property sector card',
        hint: 'Homepage sector grid: Property & rental operators icon area.',
      },
      {
        key: 'home-markets',
        title: 'Home — “Markets” row icon',
        hint: 'Small icon beside “Thailand & International Markets” on the homepage.',
      },
    ];
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
      '<p class="tf-admin-muted so-site-appearance__lede">Replace icons for the shared nav and the homepage B2B slots below. Values persist in <code class="mono">site-appearance.json</code> as an <code class="mono">icons</code> map and are published on <code class="mono">GET /api/site-appearance</code> (same document as hero images and the nav logo). Use a path on this site (<code class="mono">/assets/…</code>), a public <strong>https</strong> image URL, or full inline <strong>&lt;svg&gt;…&lt;/svg&gt;</strong> markup. Clear a field and save to remove that override.</p>' +
      fieldsHtml +
      '<div class="so-site-appearance__footer">' +
      '<p class="portal-form__hint mono" id="soIconsHint" style="margin:0;flex:1;min-width:12rem"></p>' +
      '<div class="admin-panel__actions" style="margin:0">' +
      '<button type="button" class="btn btn--primary" id="soIconsSave">Save icons</button> ' +
      '<a href="/admin/users" class="btn btn--ghost mono" id="soIconsBack">← Users &amp; payouts</a>' +
      '</div></div></div>';
    panel.classList.remove('is-hidden');
    window.scrollTo(0, 0);

    var hintEl = document.getElementById('soIconsHint');
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

    var saveBtn = document.getElementById('soIconsSave');
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
    var raw = window.location.pathname || '';
    var path = raw.replace(/\/+$/, '') || '/';
    if (path === '/admin/activity') return 'activity';
    if (path === '/admin/deploy-log') return 'deploy-log';
    if (path === '/admin/site-appearance') return 'site-appearance';
    if (path === '/admin/icons') return 'icons';
    if (path === '/admin/report-catalog') return 'report-catalog';
    if (path === '/admin/user-reports') return 'user-reports';
    if (path === '/admin/user-profiling') return 'user-profiling';
    if (path === '/admin/users' || path === '/admin') return 'users';
    if (/\/admin\.html$/i.test(path)) return 'users';
    return 'users';
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
    var row = document.createElement('div');
    row.className = 'tf-admin-nav__row';
    row.appendChild(makeNavLink('Users & payouts', '/admin/users', 'users', id));
    row.appendChild(makeNavLink('Activity log', '/admin/activity', 'activity', id));
    row.appendChild(makeNavLink('User profiling', '/admin/user-profiling', 'user-profiling', id));
    row.appendChild(makeNavLink('Deploy log', '/admin/deploy-log', 'deploy-log', id));
    row.appendChild(makeNavLink('Site appearance', '/admin/site-appearance', 'site-appearance', id));
    row.appendChild(makeNavLink('Icons', '/admin/icons', 'icons', id));
    row.appendChild(makeNavLink('Reports', '/operator/reports', 'reports', id));
    row.appendChild(makeNavLink('Report catalog', '/reports/catalog.html', 'report-catalog', id));
    row.appendChild(makeNavLink('User reports', '/admin/user-reports', 'user-reports', id));
    tfNav.appendChild(row);
  }

  function syncAdminRouteFromLocation() {
    var routeId = getAdminRouteFromLocation();
    var main = document.getElementById('adminMainDefault');
    var usersEl = document.getElementById('usersSection');
    var profilingEl = document.getElementById('userProfilingSection');
    var inboxEl = document.getElementById('adminInbox');
    var reportsEl = document.getElementById('reportCatalogSection');

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
    if (reportsEl) reportsEl.classList.toggle('is-hidden', routeId !== 'users' && routeId !== 'report-catalog');

    buildTfNav(routeId);
    window.scrollTo(0, 0);
    if (routeId === 'user-profiling') loadUserProfiling();
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
              '<li><a href="' +
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
            var slug = item.slug ? ' <span class="tf-admin-reports__slug">(' + escapeHtml(item.slug) + ')</span>' : '';
            return (
              '<li><a href="' +
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

  function showWorkspace() {
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

  function hideWorkspace() {
    sessionStorage.removeItem(SESSION_KEY);
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
      } else if (ADMIN_PASSWORD) {
        gateLede.textContent =
          'Local preview: use the email and password from admin-config.js. Full admin APIs need the Node server with ADMIN_PASSWORD_HASH set.';
      } else {
        gateLede.textContent =
          'Sign in with the operator email and password. Use the Node host, or add admin-config.js for a static-only preview password.';
      }
    }
    if (submitBtn) submitBtn.innerHTML = 'Sign in<span class="ico-arrow-r" aria-hidden="true"></span>';
    if (configBanner) {
      if (capabilitiesFromOurServer && capabilitiesHttpOk && !serverPasswordAuth) {
        configBanner.innerHTML =
          'Set <strong>ADMIN_PASSWORD_HASH</strong> on this Railway service. Generate it locally: <code>node scripts/hash-admin-password.mjs</code> — then paste the line into variables, redeploy, reload.';
        configBanner.classList.remove('is-hidden');
      } else if (!capabilitiesHttpOk && !ADMIN_PASSWORD) {
        configBanner.innerHTML =
          'Could not reach <code>/api/admin/capabilities</code>. For a browser-only gate, copy <strong>admin-config.example.js</strong> to <strong>admin-config.js</strong> and set <strong>window.__ADMIN_PASSWORD__</strong>.';
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

  function tryRestorePortalAdminSession() {
    var portalJwt = getPortalJwt();
    if (!portalJwt) return Promise.resolve(false);
    return fetch(api('/api/admin/bootstrap-from-portal'), {
      method: 'POST',
      credentials: apiCred(),
      headers: { Authorization: 'Bearer ' + portalJwt },
      cache: 'no-store',
    })
      .then(function (r) {
        return r.json().then(function (j) {
          return { ok: r.ok, j: j };
        });
      })
      .then(function (x) {
        if (x.ok && x.j && x.j.token) {
          writeStoredAdminJwt(x.j.token);
          showWorkspace();
          return true;
        }
        return tryRestorePortalAdminWorkspace();
      })
      .catch(function () {
        return tryRestorePortalAdminWorkspace();
      });
  }

  function tryRestoreLegacySession() {
    if (sessionStorage.getItem(SESSION_KEY) === PORTAL_ADMIN_SESSION) {
      if (isPortalAdminSignedIn()) {
        showWorkspace();
        return true;
      }
      sessionStorage.removeItem(SESSION_KEY);
      return false;
    }
    if (sessionStorage.getItem(SESSION_KEY) === '1' && ADMIN_PASSWORD) {
      showWorkspace();
      return true;
    }
    if (sessionStorage.getItem(SESSION_KEY) === '1' && !ADMIN_PASSWORD) {
      sessionStorage.removeItem(SESSION_KEY);
    }
    return false;
  }

  function showAdminLoginGate() {
    if (workspace) workspace.classList.add('is-hidden');
    if (gate) gate.classList.remove('is-hidden');
    if (hint) {
      hint.textContent = '';
      hint.className = 'portal-form__hint mono';
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
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        hideAdminBoot();
      });
    });
  }

  Promise.all([fetchCapabilitiesData(), fetchAdminVersionProbe()])
    .then(function () {
      applyCapabilities();
    })
    .then(function () {
      return tryRestoreJwtSession();
    })
    .then(function (restored) {
      if (restored) return true;
      return tryRestorePortalAdminSession();
    })
    .then(function (restored) {
      if (restored) return true;
      return !!tryRestoreLegacySession();
    })
    .then(function (restored) {
      if (restored) {
        revealAdminBootAfterPaint();
        return;
      }
      showAdminLoginGate();
      revealAdminBootAfterPaint();
    })
    .catch(function () {
      try {
        showAdminLoginGate();
      } catch (e) {}
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

      if (!ADMIN_PASSWORD) {
        if (!capabilitiesHttpOk) {
          setHint(
            'Cannot reach the Node API from this host. Run npm start / deploy server.mjs, or add admin-config.js with window.__ADMIN_PASSWORD__ for a static preview only.',
            'error'
          );
        } else {
          setHint(
            'Password not configured. Copy admin-config.example.js to admin-config.js and set window.__ADMIN_PASSWORD__, or deploy the Node API with ADMIN_PASSWORD_HASH set.',
            'error'
          );
        }
        return;
      }
      if (email !== ADMIN_EMAIL.toLowerCase() || password !== ADMIN_PASSWORD) {
        setHint('Invalid email or password.', 'error');
        if (form.querySelector('input[type="password"]')) form.querySelector('input[type="password"]').value = '';
        return;
      }
      sessionStorage.setItem(SESSION_KEY, '1');
      setHint('Signed in.', 'ok');
      showWorkspace();
    });
  }

  function getAdminBearer() {
    return readStoredAdminJwt();
  }

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
          'Sign in on the live Node server (operator password) to load pending registrations, report files, and page timestamps. Browser-only admin-config password cannot call this API.';
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
        '<p class="admin-panel__stub">Browser-only admin password (local <code>admin-config.js</code>) cannot call this API.</p>';
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
