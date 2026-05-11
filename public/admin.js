(function () {
  'use strict';

  var ADMIN_EMAIL = 'jack@serviceopera.to';
  var ADMIN_PASSWORD =
    typeof window.__ADMIN_PASSWORD__ === 'string' ? window.__ADMIN_PASSWORD__.trim() : '';

  var SESSION_KEY = 'so_admin_session';
  var JWT_KEY = 'so_admin_jwt';

  var otpEnabled = false;

  var gate = document.getElementById('adminGate');
  var workspace = document.getElementById('adminWorkspace');
  var form = document.getElementById('adminGateForm');
  var hint = document.getElementById('adminGateHint');
  var logoutBtn = document.getElementById('adminLogout');
  var tilesEl = document.getElementById('adminTiles');
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

  var TILES = [
    { id: 'clinic-reports', label: 'Clinic report access' },
    { id: 'monitor', label: 'Monitor' },
    { id: 'users-payouts', label: 'Users & payouts' },
    { id: 'user-profiling', label: 'User profiling' },
    { id: 'db-console', label: 'DB console' },
    { id: 'activity-log', label: 'Activity log' },
    { id: 'deploy-log', label: 'Deploy log' },
    { id: 'site-appearance', label: 'Site appearance' },
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'media-moderation', label: 'Media moderation' },
    { id: 'photo-approvals', label: 'Photo approvals' },
    { id: 'photos-chat', label: 'Photos chat' },
    { id: 'photo-stories', label: 'Photo stories' },
    { id: 'messages', label: 'Messages' },
    { id: 'chat', label: 'Chat' },
  ];

  function showWorkspace() {
    if (gate) gate.classList.add('is-hidden');
    if (workspace) workspace.classList.remove('is-hidden');
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
      if (submitBtn) submitBtn.textContent = 'Sign in with code →';
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
      if (submitBtn) submitBtn.textContent = 'Enter admin →';
      if (configBanner) {
        if (!ADMIN_PASSWORD) configBanner.classList.remove('is-hidden');
        else configBanner.classList.add('is-hidden');
      }
    }
  }

  function fetchCapabilities() {
    return fetch('/api/admin/capabilities', { method: 'GET', credentials: 'same-origin' })
      .then(function (r) {
        if (!r.ok) throw new Error('bad');
        return r.json();
      })
      .then(function (j) {
        otpEnabled = Boolean(j && j.otpEnabled);
        applyCapabilities();
      })
      .catch(function () {
        otpEnabled = false;
        applyCapabilities();
      });
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
        setHint(
          'Password not configured. Copy admin-config.example.js to admin-config.js and set window.__ADMIN_PASSWORD__, or deploy with RESEND_API_KEY for email codes.',
          'error'
        );
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

  function renderClinicUserRows(users) {
    if (!users || !users.length) {
      return '<li class="mono" style="opacity:.75;">No clinic users yet.</li>';
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

  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function loadClinicUsersList() {
    var listEl = document.getElementById('clinicUserList');
    if (!listEl) return;
    var token = getAdminBearer();
    fetch('/api/clinic-users', {
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
        listEl.innerHTML = renderClinicUserRows(x.j.users);
      })
      .catch(function () {
        listEl.innerHTML = '<li class="mono is-error">Network error.</li>';
      });
  }

  function openClinicReportsPanel(tile) {
    if (!panel || !panelTitle || !panelBody) return;
    panelTitle.textContent = tile.label;
    var token = getAdminBearer();
    if (!token) {
      panelBody.innerHTML =
        '<p class="admin-panel__stub">After you sign in with <strong>email OTP</strong> on the live server, you can register clinic emails and passwords here. They appear in the on-disk user store and can open <strong>/clinics/report.html?slug=…</strong> after using <strong>Log in</strong> in the site header.</p>' +
        '<p class="admin-panel__stub">Browser-only admin password (local <code>admin-config.js</code>) cannot call this API.</p>';
      panel.classList.remove('is-hidden');
      panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      return;
    }

    panelBody.innerHTML =
      '<p class="admin-panel__body">Add a clinic user: they sign in with this email and password, then only see the report for the <strong>slug</strong> you set. Data file: <code>public/clinics/data/&lt;slug&gt;.json</code> (falls back to <code>_data.json</code> if missing).</p>' +
      '<form id="clinicUserCreateForm" class="portal-form" style="max-width: 28rem; margin-top: 1rem;">' +
      '<label><span class="mono">CLINIC EMAIL</span><input type="email" name="email" required autocomplete="off" /></label>' +
      '<label><span class="mono">PASSWORD</span><input type="password" name="password" required minlength="8" autocomplete="new-password" placeholder="min 8 characters" /></label>' +
      '<label><span class="mono">REPORT SLUG</span><input type="text" name="reportSlug" required pattern="[a-z0-9][a-z0-9-]*" title="Lowercase letters, numbers, hyphens" placeholder="e.g. serenity-dental-q2" /></label>' +
      '<button type="submit" class="btn btn--primary">Save clinic user</button>' +
      '<p class="portal-form__hint mono" id="clinicUserFormHint"></p></form>' +
      '<h3 class="admin-panel__title mono" style="margin-top: 2rem;">Registered users</h3>' +
      '<ul id="clinicUserList" class="mono" style="list-style: none; padding: 0; margin: 0; line-height: 1.5;"></ul>';

    var form = document.getElementById('clinicUserCreateForm');
    var fh = document.getElementById('clinicUserFormHint');
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
        fetch('/api/clinic-users', {
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
              fh.textContent = 'Saved. Clinic can log in and open /clinics/report.html?slug=' + body.reportSlug;
              fh.className = 'portal-form__hint mono is-ok';
            }
            form.reset();
            loadClinicUsersList();
          })
          .catch(function () {
            if (fh) {
              fh.textContent = 'Network error.';
              fh.className = 'portal-form__hint mono is-error';
            }
          });
      });
    }
    loadClinicUsersList();
    panel.classList.remove('is-hidden');
    panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function openPanel(tile) {
    if (!panel || !panelTitle || !panelBody) return;
    if (tile.id === 'clinic-reports') {
      openClinicReportsPanel(tile);
      return;
    }
    panelTitle.textContent = tile.label;
    panelBody.innerHTML =
      '<p class="admin-panel__stub">This control is a UI shell. Hook <strong>' +
      tile.id +
      '</strong> to your API, database, or deployment pipeline when you add a backend.</p>';
    panel.classList.remove('is-hidden');
    panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  if (tilesEl) {
    TILES.forEach(function (tile) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'admin-tile';
      btn.setAttribute('data-id', tile.id);
      var span = document.createElement('span');
      span.className = 'admin-tile__label mono';
      span.textContent = tile.label;
      btn.appendChild(span);
      btn.addEventListener('click', function () {
        document.querySelectorAll('.admin-tile.is-active').forEach(function (b) {
          b.classList.remove('is-active');
        });
        btn.classList.add('is-active');
        openPanel(tile);
      });
      tilesEl.appendChild(btn);
    });
  }
})();
