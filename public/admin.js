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

  function openPanel(tile) {
    if (!panel || !panelTitle || !panelBody) return;
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
