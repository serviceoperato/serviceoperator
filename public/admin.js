(function () {
  'use strict';

  var ADMIN_EMAIL = 'jack@serviceopera.to';
  var ADMIN_PASSWORD =
    typeof window.__ADMIN_PASSWORD__ === 'string' ? window.__ADMIN_PASSWORD__.trim() : '';

  var SESSION_KEY = 'so_admin_session';
  var JWT_KEY = 'so_admin_jwt';
  var PORTAL_ADMIN_SESSION = 'portal-admin';
  var PORTAL_JWT_KEYS = ['so_user_jwt', 'so_clinic_jwt'];

  /** Admin bearer: mirror portal JWT storage (local + session) so OTP is not re-prompted on new tabs until expiry. */
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

  var otpEnabled = false;
  var capabilitiesHttpOk = false;
  var capabilitiesFromOurServer = false;

  var gate = document.getElementById('adminGate');
  var workspace = document.getElementById('adminWorkspace');
  var form = document.getElementById('adminGateForm');
  var hint = document.getElementById('adminGateHint');
  var logoutBtn = document.getElementById('adminLogout');
  var tfNav = document.getElementById('tfAdminNav');
  var tfVerNum = document.getElementById('tfAdminVersionNum');
  var panel = document.getElementById('adminPanel');
  var panelTitle = document.getElementById('adminPanelTitle');
  var panelBody = document.getElementById('adminPanelBody');
  var configBanner = document.getElementById('adminConfigBanner');
  var gateLede = document.getElementById('adminGateLede');
  var otpWrap = document.getElementById('adminOtpWrap');
  var passwordWrap = document.getElementById('adminPasswordWrap');
  var sendCodeBtn = document.getElementById('adminSendCodeBtn');
  var passwordInput = document.getElementById('adminPasswordInput');
  var codeInput = document.getElementById('adminCodeInput');
  var submitBtn = document.getElementById('adminSubmitBtn');
  var cachedUsers = [];
  var cachedPending = [];
  var usersFilter = 'all';
  var usersSort = 'recent';
  var usersSearch = '';
  var reportCatalog = null;
  var reportCatalogVertical = 'clinics';

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
        : '<p class="admin-panel__body mono is-error">Sign in with admin email OTP on the Node host to save profile changes.</p>') +
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
    panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
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
      '<p class="admin-panel__actions"><button type="button" class="btn btn--ghost mono" id="deployLogBack">← Back to users</button></p>';
    var back = document.getElementById('deployLogBack');
    if (back) {
      back.addEventListener('click', function () {
        panel.classList.add('is-hidden');
        if (document.getElementById('adminMainDefault')) document.getElementById('adminMainDefault').classList.remove('is-hidden');
        var usersSection = document.getElementById('usersSection');
        if (usersSection) usersSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
    panel.classList.remove('is-hidden');
    panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

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
          lines.push('Admin work queue requires an admin OTP session on this host.');
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
      '<p class="tf-admin-muted so-site-appearance__lede">Square previews update as you type. Use <strong>Upload…</strong> (admin only, saves under <code>/assets/site-uploads/</code>) or paste <code>/assets/…</code> / a public <strong>https</strong> URL. <code>/logo.png</code> redirects to the nav logo below. Public: <code>GET /api/site-appearance</code>.</p>' +
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
      '<p class="so-site-appearance__card-meta mono">Header · <code>img.brand-logo</code></p>' +
      '<div class="so-site-appearance__field-actions">' +
      '<label class="so-site-appearance__pick"><input type="checkbox" class="so-site-appearance__cb" data-so-appearance-sel="nav" aria-label="Select nav logo" /> <span class="mono">Select</span></label>' +
      '<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" class="is-hidden" id="soSiteNavLogoFile" />' +
      '<button type="button" class="tf-admin-toolbar__btn" id="soSiteNavLogoPickBtn">Upload…</button>' +
      '<button type="button" class="tf-admin-toolbar__btn" id="soSiteNavLogoClearBtn">Clear URL</button>' +
      '</div>' +
      '<label class="portal-form__label" for="soSiteNavLogoUrl">Image URL</label>' +
      '<input class="portal-form__input mono" type="text" id="soSiteNavLogoUrl" autocomplete="off" />' +
      '<label class="portal-form__label" for="soSiteNavLogoAlt">Alt text</label>' +
      '<input class="portal-form__input" type="text" id="soSiteNavLogoAlt" maxlength="180" autocomplete="off" />' +
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
      '<button type="button" class="btn btn--ghost mono" id="soSiteAppearanceBack">← Back to users</button>' +
      '</div></div></div>';
    panel.classList.remove('is-hidden');
    panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

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
      navLogoAlt: 'ServiceOpera.to — home',
      homePageImageUrl: '/assets/home-page-hero.png',
      homePageImageAlt: 'ServiceOpera — home',
      propertyPageImageUrl: '/assets/property-page-hero.png',
      propertyPageImageAlt: 'Property — ServiceOpera',
      clinicPageImageUrl: '/assets/clinics-page-hero.png',
      clinicPageImageAlt: 'Clinics — ServiceOpera',
      hotelPageImageUrl: '/assets/hotels-page-hero.png',
      hotelPageImageAlt: 'Hotels — ServiceOpera',
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
      [navLogoUrlEl, homeUrlEl, urlEl, clinicUrlEl, hotelUrlEl].forEach(function (el) {
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
    bindAppearanceUpload('soSiteNavLogoPickBtn', 'soSiteNavLogoFile', navLogoUrlEl);
    bindClearUrl('soSiteNavLogoClearBtn', navLogoUrlEl);
    bindAppearanceUpload('soSiteHomeImgPickBtn', 'soSiteHomeImgFile', homeUrlEl);
    bindClearUrl('soSiteHomeImgClearBtn', homeUrlEl);
    bindAppearanceUpload('soSitePropImgPickBtn', 'soSitePropImgFile', urlEl);
    bindClearUrl('soSitePropImgClearBtn', urlEl);
    bindAppearanceUpload('soSiteClinicImgPickBtn', 'soSiteClinicImgFile', clinicUrlEl);
    bindClearUrl('soSiteClinicImgClearBtn', clinicUrlEl);
    bindAppearanceUpload('soSiteHotelImgPickBtn', 'soSiteHotelImgFile', hotelUrlEl);
    bindClearUrl('soSiteHotelImgClearBtn', hotelUrlEl);
    var selAll = document.getElementById('soSiteAppearSelectAll');
    var selNone = document.getElementById('soSiteAppearSelectNone');
    var selClear = document.getElementById('soSiteAppearClearSelected');
    function appearanceCheckboxes() {
      return panelBody ? panelBody.querySelectorAll('.so-site-appearance__cb') : [];
    }
    function appearanceRowForSel(sel) {
      if (sel === 'nav') return { url: navLogoUrlEl };
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
          'Sign in as admin (email OTP) to load saved URLs from the server and save. Below: suggested paths from /assets/ on this host.';
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
    var back = document.getElementById('soSiteAppearanceBack');
    if (back) {
      back.addEventListener('click', function () {
        panel.classList.add('is-hidden');
        if (document.getElementById('adminMainDefault')) document.getElementById('adminMainDefault').classList.remove('is-hidden');
        var u = document.getElementById('usersSection');
        if (u) u.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
  }

  function makeNavPill(label, onClick) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'tf-admin-nav__pill';
    b.textContent = label;
    b.addEventListener('click', onClick);
    return b;
  }

  function buildTfNav() {
    if (!tfNav) return;
    tfNav.innerHTML = '';
    var row = document.createElement('div');
    row.className = 'tf-admin-nav__row';
    function showMainHidePanel() {
      if (document.getElementById('adminMainDefault')) document.getElementById('adminMainDefault').classList.remove('is-hidden');
      if (panel) panel.classList.add('is-hidden');
    }
    row.appendChild(
      makeNavPill('Users & payouts', function () {
        showMainHidePanel();
        var el = document.getElementById('usersSection');
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      })
    );
    row.appendChild(
      makeNavPill('Activity log', function () {
        showMainHidePanel();
        var inbox = document.getElementById('adminInbox');
        if (inbox) inbox.scrollIntoView({ behavior: 'smooth', block: 'start' });
      })
    );
    row.appendChild(
      makeNavPill('Deploy log', function () {
        openDeployLogPanel();
      })
    );
    row.appendChild(
      makeNavPill('Site appearance', function () {
        openBrandingPanel();
      })
    );
    row.appendChild(
      makeNavPill('User reports', function () {
        showMainHidePanel();
        openUserReportsPanel({ id: 'user-reports', label: 'User report access' });
      })
    );
    tfNav.appendChild(row);
  }

  function renderAdminReports() {
    var listEl = document.getElementById('adminReportsList');
    var hintEl = document.getElementById('adminReportsHint');
    if (!listEl) return;
    var items = (reportCatalog && reportCatalog[reportCatalogVertical]) || [];
    if (!items.length) {
      listEl.innerHTML =
        '<p class="tf-admin-muted">No ' +
        escapeHtml(reportCatalogVertical) +
        ' reports listed yet. Add links in <code>public/reports/index.json</code> or slug JSON under <code>public/clinics/data/</code>.</p>';
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
    var request = token
      ? fetch(api('/api/admin/report-catalog'), {
          method: 'GET',
          credentials: apiCred(),
          headers: { Authorization: 'Bearer ' + token },
        })
      : fetch('/reports/index.json', { cache: 'no-store' });
    return request
      .then(function (r) {
        return r.json().then(function (j) {
          return { ok: r.ok, j: j };
        });
      })
      .then(function (x) {
        if (!x.ok || !x.j) {
          reportCatalog = { clinics: [], hotels: [], properties: [] };
          renderAdminReports();
          return;
        }
        reportCatalog = {
          clinics: x.j.clinics || [],
          hotels: x.j.hotels || [],
          properties: x.j.properties || [],
        };
        renderAdminReports();
      })
      .catch(function () {
        reportCatalog = { clinics: [], hotels: [], properties: [] };
        renderAdminReports();
      });
  }

  function showWorkspace() {
    if (gate) gate.classList.add('is-hidden');
    if (workspace) workspace.classList.remove('is-hidden');
    loadTfVersion();
    buildTfNav();
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
    if (otpEnabled) {
      sessionStorage.removeItem(SESSION_KEY);
      if (otpWrap) otpWrap.classList.remove('is-hidden');
      if (passwordWrap) passwordWrap.classList.add('is-hidden');
      if (sendCodeBtn) sendCodeBtn.classList.remove('is-hidden');
      if (passwordInput) {
        passwordInput.removeAttribute('required');
        passwordInput.value = '';
      }
      if (gateLede) {
        gateLede.textContent =
          'Enter the admin email, tap “Send sign-in code”, then enter the 6-digit code from your inbox. The server validates your session.';
      }
      if (submitBtn) submitBtn.innerHTML = 'Sign in with code<span class="ico-arrow-r" aria-hidden="true"></span>';
      if (configBanner) configBanner.classList.add('is-hidden');
    } else {
      if (otpWrap) otpWrap.classList.add('is-hidden');
      if (passwordWrap) passwordWrap.classList.remove('is-hidden');
      if (sendCodeBtn) sendCodeBtn.classList.add('is-hidden');
      if (passwordInput) passwordInput.setAttribute('required', 'required');
      if (gateLede) {
        gateLede.textContent =
          'Use your admin email and password. This gate runs in the browser only unless the host exposes email sign-in (RESEND_API_KEY).';
      }
      if (submitBtn) submitBtn.innerHTML = 'Enter admin<span class="ico-arrow-r" aria-hidden="true"></span>';
      if (configBanner) {
        if (capabilitiesFromOurServer) {
          configBanner.innerHTML =
            'This host runs the ServiceOpera Node API, but <strong>RESEND_API_KEY</strong> is empty at runtime. Add it on the <strong>same Railway service</strong> that runs <code>server.mjs</code>, redeploy, then confirm deploy logs show “Resend: RESEND_API_KEY is set”. Until then, set <strong>admin-config.js</strong> for a local password only.';
          configBanner.classList.remove('is-hidden');
        } else if (!capabilitiesHttpOk) {
          configBanner.innerHTML =
            'Email sign-in needs the live Node API (<code>/api/admin/capabilities</code>). Open this site from Railway or <code>npm start</code>, not a static-only host.';
          configBanner.classList.remove('is-hidden');
        } else if (!ADMIN_PASSWORD) {
          configBanner.innerHTML =
            'For local static preview: add <strong>admin-config.js</strong> (copy from <strong>admin-config.example.js</strong>) and set <strong>window.__ADMIN_PASSWORD__</strong>. On production (Node + Resend), use email codes instead.';
          configBanner.classList.remove('is-hidden');
        } else configBanner.classList.add('is-hidden');
      }
    }
  }

  function fetchCapabilities() {
    return fetch(api('/api/admin/capabilities'), { method: 'GET', credentials: apiCred(), cache: 'no-store' })
      .then(function (r) {
        capabilitiesHttpOk = r.ok;
        if (!r.ok) throw new Error('bad');
        return r.json();
      })
      .then(function (j) {
        capabilitiesFromOurServer = Boolean(j && j.service === 'serviceopera');
        otpEnabled = Boolean(j && j.otpEnabled);
        applyCapabilities();
      })
      .catch(function () {
        otpEnabled = false;
        capabilitiesHttpOk = false;
        capabilitiesFromOurServer = false;
        applyCapabilities();
      });
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
    if (otpEnabled) return false;
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

  fetchCapabilities().then(function () {
    return tryRestoreJwtSession();
  }).then(function (restored) {
    if (restored) return true;
    return tryRestorePortalAdminSession();
  }).then(function (restored) {
    if (restored) return true;
    return !!tryRestoreLegacySession();
  }).then(function (restored) {
    if (!restored) showAdminLoginGate();
  });

  if (sendCodeBtn) {
    sendCodeBtn.addEventListener('click', function () {
      if (!otpEnabled) return;
      var email = (document.getElementById('adminEmailInput') && document.getElementById('adminEmailInput').value) || '';
      email = String(email).trim().toLowerCase();
      if (!email) {
        setHint('Enter your email first.', 'error');
        return;
      }
      setHint('Sending…', '');
      sendCodeBtn.disabled = true;
      fetch(api('/api/admin/send-code'), {
        method: 'POST',
        credentials: apiCred(),
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email }),
      })
        .then(function (r) {
          return r.json().then(function (j) {
            return { ok: r.ok, status: r.status, j: j };
          });
        })
        .then(function (x) {
          if (!x.ok) {
            setHint((x.j && x.j.error) || 'Could not send code.', 'error');
            return;
          }
          setHint((x.j && x.j.message) || 'Check your inbox for the code.', 'ok');
          if (codeInput) codeInput.focus();
        })
        .catch(function () {
          setHint('Network error. Try again.', 'error');
        })
        .then(function () {
          sendCodeBtn.disabled = false;
        });
    });
  }

  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var fd = new FormData(form);
      var email = (fd.get('email') || '').toString().trim().toLowerCase();
      var password = (fd.get('password') || '').toString();
      var code = (fd.get('code') || '').toString().trim().replace(/\s/g, '');

      if (otpEnabled) {
        if (!/^\d{6}$/.test(code)) {
          setHint('Enter the 6-digit code from your email (after requesting it).', 'error');
          return;
        }
        setHint('Checking…', '');
        fetch(api('/api/admin/verify-code'), {
          method: 'POST',
          credentials: apiCred(),
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email, code: code }),
        })
          .then(function (r) {
            return r.json().then(function (j) {
              return { ok: r.ok, j: j };
            });
          })
          .then(function (x) {
            if (!x.ok || !x.j || !x.j.token) {
              setHint((x.j && x.j.error) || 'Invalid email or code.', 'error');
              if (codeInput) codeInput.value = '';
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
        if (capabilitiesFromOurServer) {
          setHint(
            'Email sign-in is off: RESEND_API_KEY is unset on this Railway service. Add it to the service running server.mjs, redeploy, and confirm deploy logs show “Resend: RESEND_API_KEY is set”.',
            'error'
          );
        } else if (!capabilitiesHttpOk) {
          setHint(
            'Cannot reach /api/admin/capabilities. Use the Railway Node deploy (or npm start), not a static-only host.',
            'error'
          );
        } else {
          setHint(
            'Password not configured. Copy admin-config.example.js to admin-config.js and set window.__ADMIN_PASSWORD__, or deploy with RESEND_API_KEY for email codes.',
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

  if (logoutBtn) {
    logoutBtn.addEventListener('click', function () {
      hideWorkspace();
      if (form) form.reset();
      if (document.getElementById('adminEmailInput')) {
        document.getElementById('adminEmailInput').value = ADMIN_EMAIL;
      }
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
          'Sign in with email OTP on the live server to load pending registrations, report files, and page timestamps. Browser-only admin password cannot call this API.';
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
        '<p class="admin-panel__stub">After you sign in with <strong>email OTP</strong> on the live server, you can register user emails and passwords here. They appear in the on-disk user store and can open <strong>/clinics/report.html?slug=…</strong> after using <strong>Log in</strong> in the site header.</p>' +
        '<p class="admin-panel__stub">Browser-only admin password (local <code>admin-config.js</code>) cannot call this API.</p>';
      panel.classList.remove('is-hidden');
      panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
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
    panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
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
