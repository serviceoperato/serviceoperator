(function () {
  'use strict';

  var ADMIN_EMAIL = 'jack@serviceopera.to';
  var ADMIN_PASSWORD =
    typeof window.__ADMIN_PASSWORD__ === 'string' ? window.__ADMIN_PASSWORD__.trim() : '';

  var SESSION_KEY = 'so_admin_session';
  var JWT_KEY = 'so_admin_jwt';
  var PORTAL_JWT_KEYS = ['so_user_jwt', 'so_clinic_jwt'];

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

  function loadTfVersion() {
    if (!tfVerNum) return;
    fetch('/api/version', { cache: 'no-store' })
      .then(function (r) {
        return r.json();
      })
      .then(function (j) {
        if (j && j.version) tfVerNum.textContent = j.version;
      })
      .catch(function () {
        tfVerNum.textContent = '(n/a)';
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

  function applyUsersView() {
    var users = cachedUsers.slice();
    var q = usersSearch.trim().toLowerCase();
    if (q) {
      users = users.filter(function (u) {
        var blob = [u.email, u.reportSlug, u.id].join(' ').toLowerCase();
        return blob.indexOf(q) >= 0;
      });
    }
    if (usersFilter === 'pending') {
      users = [];
    }
    if (usersSort === 'name') {
      users.sort(function (a, b) {
        return displayNameFromEmail(a.email).localeCompare(displayNameFromEmail(b.email));
      });
    } else {
      users.sort(function (a, b) {
        return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
      });
    }
    return users;
  }

  function openUserEditProfile(user) {
    if (!panel || !panelTitle || !panelBody) return;
    if (document.getElementById('adminMainDefault')) document.getElementById('adminMainDefault').classList.add('is-hidden');
    panelTitle.textContent = 'Edit profile';
    panelBody.innerHTML =
      '<p class="admin-panel__body mono">Portal user <strong>' +
      escapeHtml(user.email) +
      '</strong> · report slug <code>' +
      escapeHtml(user.reportSlug) +
      '</code>.</p>' +
      '<p class="admin-panel__stub">Full profile editing (gender, spend, admin flags) is not wired on ServiceOpera yet — use <strong>User reports</strong> to rotate passwords and slugs.</p>' +
      '<p class="admin-panel__stub"><button type="button" class="btn btn--ghost mono" id="stubBackToUsers">← Back to users</button></p>';
    var back = document.getElementById('stubBackToUsers');
    if (back) {
      back.addEventListener('click', function () {
        panel.classList.add('is-hidden');
        if (document.getElementById('adminMainDefault')) document.getElementById('adminMainDefault').classList.remove('is-hidden');
      });
    }
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
            : 'No confirmed users in the JSON store yet.'
          : 'Confirmed users (newest first in inbox; full list here).';
    }
    if (paging) paging.textContent = users.length + ' users · page 1 / 1';
    if (!users.length) {
      tb.innerHTML =
        '<tr><td colspan="13" style="opacity:0.85">No users yet. Use <strong>User reports</strong> in the nav to add one.</td></tr>';
    } else {
      tb.innerHTML = users
        .map(function (u) {
          var idDisp = shortDisplayId(u.id);
          var reportUrl = '/clinics/report.html?slug=' + encodeURIComponent(u.reportSlug);
          var name = displayNameFromEmail(u.email);
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
            '<td>—</td>' +
            '<td>Yes</td>' +
            '<td>—</td>' +
            '<td>—</td>' +
            '<td>0 / 0</td>' +
            '<td>—</td>' +
            '<td>—</td>' +
            '<td>—</td>' +
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

  function openStubPanel(title, stubId) {
    if (!panel || !panelTitle || !panelBody) return;
    if (document.getElementById('adminMainDefault')) document.getElementById('adminMainDefault').classList.add('is-hidden');
    panelTitle.textContent = title;
    panelBody.innerHTML =
      '<p class="admin-panel__stub">ThaiFans-style admin section. <strong>' +
      escapeHtml(stubId) +
      '</strong> is not wired on ServiceOpera — hook your stack when you add Postgres, media, or chat.</p>' +
      '<p class="admin-panel__stub"><button type="button" class="btn btn--ghost mono" id="stubBackToUsers">← Back to users</button></p>';
    var back = document.getElementById('stubBackToUsers');
    if (back) {
      back.addEventListener('click', function () {
        panel.classList.add('is-hidden');
        if (document.getElementById('adminMainDefault')) document.getElementById('adminMainDefault').classList.remove('is-hidden');
        var u = document.getElementById('usersSection');
        if (u) u.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
    panel.classList.remove('is-hidden');
    panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
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
    var row1 = document.createElement('div');
    row1.className = 'tf-admin-nav__row';
    row1.appendChild(
      makeNavPill('Monitor ▾', function () {
        var menu = tfNav.querySelector('.tf-admin-nav__monitor-menu');
        if (menu) menu.classList.toggle('is-hidden');
      })
    );
    var monitorMenu = document.createElement('div');
    monitorMenu.className = 'tf-admin-nav__monitor-menu is-hidden';
    [
      ['Users & payouts', 'users'],
      ['User profiling', 'profiling'],
      ['DB console', 'db'],
      ['Activity log', 'activity'],
      ['Deploy log', 'deploy'],
      ['Site appearance', 'branding'],
      ['Dashboard', 'dashboard'],
      ['Media moderation', 'media'],
      ['Photo approvals', 'photos'],
      ['Photos chat', 'chatimg'],
      ['Photo stories', 'stories'],
      ['Messages', 'messages'],
      ['Chat', 'chat'],
    ].forEach(function (pair) {
      monitorMenu.appendChild(
        makeNavPill(pair[0], function () {
          monitorMenu.classList.add('is-hidden');
          if (pair[1] === 'users') {
            if (document.getElementById('adminMainDefault')) document.getElementById('adminMainDefault').classList.remove('is-hidden');
            if (panel) panel.classList.add('is-hidden');
            var el = document.getElementById('usersSection');
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
          } else openStubPanel(pair[0], pair[1]);
        })
      );
    });
    row1.appendChild(monitorMenu);
    [
      ['Users & payouts', 'users'],
      ['User profiling', 'profiling'],
      ['DB console', 'db'],
      ['Activity log', 'activity'],
      ['Deploy log', 'deploy'],
      ['Site appearance', 'branding'],
    ].forEach(function (pair) {
      row1.appendChild(
        makeNavPill(pair[0], function () {
          if (pair[1] === 'users') {
            if (document.getElementById('adminMainDefault')) document.getElementById('adminMainDefault').classList.remove('is-hidden');
            if (panel) panel.classList.add('is-hidden');
            var el = document.getElementById('usersSection');
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
          } else openStubPanel(pair[0], pair[1]);
        })
      );
    });
    row1.appendChild(
      makeNavPill('Dashboard', function () {
        openStubPanel('Dashboard', 'dashboard');
      })
    );
    tfNav.appendChild(row1);
    var mediaWrap = document.createElement('div');
    mediaWrap.className = 'tf-admin-nav__media-wrap';
    var lab = document.createElement('div');
    lab.className = 'tf-admin-nav__label';
    lab.textContent = 'Media moderation';
    mediaWrap.appendChild(lab);
    var row2 = document.createElement('div');
    row2.className = 'tf-admin-nav__row';
    [
      ['Dashboard', 'dashboard'],
      ['Media moderation', 'media'],
      ['Photo approvals', 'photos'],
      ['Photos chat', 'chatimg'],
      ['Photo stories', 'stories'],
      ['Messages', 'messages'],
      ['Chat', 'chat'],
    ].forEach(function (pair) {
      row2.appendChild(makeNavPill(pair[0], function () { openStubPanel(pair[0], pair[1]); }));
    });
    row2.appendChild(
      makeNavPill('User reports', function () {
        if (document.getElementById('adminMainDefault')) document.getElementById('adminMainDefault').classList.remove('is-hidden');
        openUserReportsPanel({ id: 'user-reports', label: 'User report access' });
      })
    );
    mediaWrap.appendChild(row2);
    tfNav.appendChild(mediaWrap);
  }

  function showWorkspace() {
    if (gate) gate.classList.add('is-hidden');
    if (workspace) workspace.classList.remove('is-hidden');
    loadTfVersion();
    buildTfNav();
    loadWorkQueue();
  }

  function hideWorkspace() {
    sessionStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(JWT_KEY);
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
    return fetch('/api/admin/capabilities', { method: 'GET', credentials: 'same-origin', cache: 'no-store' })
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
        var token = sessionStorage.getItem(PORTAL_JWT_KEYS[i]);
        if (token) return token;
      } catch (e) {}
    }
    return '';
  }

  function tryRestoreJwtSession() {
    var token = sessionStorage.getItem(JWT_KEY);
    if (!token || !otpEnabled) return Promise.resolve(false);
    return fetch('/api/admin/session', {
      method: 'GET',
      credentials: 'same-origin',
      headers: { Authorization: 'Bearer ' + token },
    })
      .then(function (r) {
        if (!r.ok) {
          sessionStorage.removeItem(JWT_KEY);
          return false;
        }
        showWorkspace();
        return true;
      })
      .catch(function () {
        sessionStorage.removeItem(JWT_KEY);
        return false;
      });
  }

  function tryRestorePortalAdminSession() {
    var portalJwt = getPortalJwt();
    if (!portalJwt) return Promise.resolve(false);
    return fetch('/api/admin/bootstrap-from-portal', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { Authorization: 'Bearer ' + portalJwt },
      cache: 'no-store',
    })
      .then(function (r) {
        return r.json().then(function (j) {
          return { ok: r.ok, j: j };
        });
      })
      .then(function (x) {
        if (!x.ok || !x.j || !x.j.token) return false;
        sessionStorage.setItem(JWT_KEY, x.j.token);
        showWorkspace();
        return true;
      })
      .catch(function () {
        return false;
      });
  }

  function tryRestoreLegacySession() {
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

  fetchCapabilities().then(function () {
    return tryRestoreJwtSession();
  }).then(function (restored) {
    if (restored) return true;
    return tryRestorePortalAdminSession();
  }).then(function (restored) {
    if (!restored) tryRestoreLegacySession();
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
      fetch('/api/admin/send-code', {
        method: 'POST',
        credentials: 'same-origin',
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
        fetch('/api/admin/verify-code', {
          method: 'POST',
          credentials: 'same-origin',
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
            sessionStorage.setItem(JWT_KEY, x.j.token);
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
    return sessionStorage.getItem(JWT_KEY) || '';
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
    fetch('/api/admin/work-queue', {
      method: 'GET',
      credentials: 'same-origin',
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
    fetch('/api/user-accounts', {
      method: 'GET',
      credentials: 'same-origin',
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
        fetch('/api/user-accounts', {
          method: 'POST',
          credentials: 'same-origin',
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
    });
  }

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
        'id,email,name,report_slug,created_at',
      ].concat(
        rows.map(function (u) {
          return [
            shortDisplayId(u.id),
            u.email,
            displayNameFromEmail(u.email),
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

  function seedStubMessage(action) {
    var out = document.getElementById('adminSeedResult');
    if (!out) return;
    out.textContent =
      action +
      ' is not wired on ServiceOpera — this block mirrors ThaiFans admin for layout only.';
  }
  var seed100 = document.getElementById('adminSeed100');
  if (seed100) seed100.addEventListener('click', function () { seedStubMessage('Fake profile seeding'); });
  var seed20 = document.getElementById('adminSeed20');
  if (seed20) seed20.addEventListener('click', function () { seedStubMessage('Fake profile seeding'); });
  var seedFix = document.getElementById('adminSeedFix');
  if (seedFix) seedFix.addEventListener('click', function () { seedStubMessage('Profile fix pass'); });
})();
