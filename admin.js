(function () {
  'use strict';

  var ADMIN_EMAIL = 'jack@serviceopera.to';
  var ADMIN_PASSWORD =
    typeof window.__ADMIN_PASSWORD__ === 'string' ? window.__ADMIN_PASSWORD__.trim() : '';

  var SESSION_KEY = 'so_admin_session';

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

  if (configBanner) {
    if (!ADMIN_PASSWORD) configBanner.classList.remove('is-hidden');
    else configBanner.classList.add('is-hidden');
  }

  function showWorkspace() {
    if (gate) gate.classList.add('is-hidden');
    if (workspace) workspace.classList.remove('is-hidden');
    sessionStorage.setItem(SESSION_KEY, '1');
  }

  function hideWorkspace() {
    sessionStorage.removeItem(SESSION_KEY);
    if (workspace) workspace.classList.add('is-hidden');
    if (gate) gate.classList.remove('is-hidden');
    if (hint) {
      hint.textContent = '';
      hint.className = 'portal-form__hint mono';
    }
  }

  if (sessionStorage.getItem(SESSION_KEY) === '1') {
    if (ADMIN_PASSWORD) showWorkspace();
    else sessionStorage.removeItem(SESSION_KEY);
  }

  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!ADMIN_PASSWORD) {
        hint.textContent =
          'Password not configured. Copy admin-config.example.js to admin-config.js and set window.__ADMIN_PASSWORD__.';
        hint.className = 'portal-form__hint mono is-error';
        return;
      }
      var fd = new FormData(form);
      var email = (fd.get('email') || '').toString().trim().toLowerCase();
      var password = (fd.get('password') || '').toString();

      if (email !== ADMIN_EMAIL.toLowerCase() || password !== ADMIN_PASSWORD) {
        hint.textContent = 'Invalid email or password.';
        hint.className = 'portal-form__hint mono is-error';
        form.querySelector('input[type="password"]').value = '';
        return;
      }
      hint.textContent = 'Signed in.';
      hint.className = 'portal-form__hint mono is-ok';
      showWorkspace();
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener('click', function () {
      hideWorkspace();
      if (form) form.reset();
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
