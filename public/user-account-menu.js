/**
 * Top-bar account control: avatar menu with Settings / Admin.
 */
(function () {
  'use strict';

  var USER_JWT_KEY = 'so_user_jwt';
  var LEGACY_JWT_KEY = 'so_clinic_jwt';
  var ADMIN_JWT_KEY = 'so_admin_jwt';
  var ADMIN_EMAIL = 'jack@serviceopera.to';

  var sessionCache = null;
  var adminOk = false;
  var openMenu = null;

  function getPortalJwt() {
    try {
      return sessionStorage.getItem(USER_JWT_KEY) || sessionStorage.getItem(LEGACY_JWT_KEY) || '';
    } catch (e) {
      return '';
    }
  }

  function getAdminJwt() {
    try {
      return sessionStorage.getItem(ADMIN_JWT_KEY) || '';
    } catch (e) {
      return '';
    }
  }

  function clearPortalJwt() {
    try {
      sessionStorage.removeItem(USER_JWT_KEY);
      sessionStorage.removeItem(LEGACY_JWT_KEY);
    } catch (e) {}
  }

  function displayNameFromEmail(email) {
    var e = String(email || '').trim();
    if (!e) return 'Account';
    var at = e.indexOf('@');
    return at > 0 ? e.slice(0, at) : e;
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

  function portalEmail() {
    if (sessionCache && sessionCache.email) return sessionCache.email;
    var jwt = getPortalJwt();
    if (jwt) return decodeJwtEmail(jwt);
    if (adminOk) return ADMIN_EMAIL;
    return '';
  }

  function initialsFromLabel(label) {
    var parts = String(label || '')
      .trim()
      .split(/[\s._-]+/)
      .filter(Boolean);
    if (!parts.length) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }

  function resolveLoginHref(root) {
    var href = root && root.getAttribute('data-login-href');
    if (href) return href;
    var path = window.location.pathname || '/';
    if (/\/clinics\//.test(path)) return '../login.html';
    return '/login.html';
  }

  function resolveAdminHref(root) {
    var href = root && root.getAttribute('data-admin-href');
    if (href) return href;
    var path = window.location.pathname || '/';
    if (/\/clinics\//.test(path)) return '../admin.html';
    return '/admin.html';
  }

  function fetchJson(path, token) {
    var headers = {};
    if (token) headers.Authorization = 'Bearer ' + token;
    var url = typeof soApiUrl === 'function' ? soApiUrl(path) : path;
    var cred = typeof soApiCredentials === 'function' ? soApiCredentials() : 'same-origin';
    return fetch(url, { credentials: cred, headers: headers, cache: 'no-store' })
      .then(function (r) {
        return r.json().then(function (j) {
          return { ok: r.ok, status: r.status, json: j };
        });
      })
      .catch(function () {
        return { ok: false, status: 0, json: null };
      });
  }

  function loadSessionState() {
    var portalJwt = getPortalJwt();
    var adminJwt = getAdminJwt();
    if (!portalJwt && !adminJwt) {
      sessionCache = null;
      adminOk = false;
      return Promise.resolve();
    }
    var jobs = [];
    if (portalJwt) {
      jobs.push(
        fetchJson('/api/auth/user-session', portalJwt).then(function (x) {
          if (x.ok && x.json && x.json.ok) {
            sessionCache = {
              email: x.json.email || '',
              reportSlug: x.json.reportSlug || '',
            };
            return;
          }
          if (x.status === 401) {
            sessionCache = null;
            clearPortalJwt();
            return;
          }
          var fallbackEmail = decodeJwtEmail(portalJwt);
          if (fallbackEmail) {
            sessionCache = { email: fallbackEmail, reportSlug: '' };
          }
        })
      );
    } else {
      sessionCache = null;
    }
    if (adminJwt) {
      jobs.push(
        fetchJson('/api/admin/session', adminJwt).then(function (x) {
          adminOk = !!(x.ok && x.json && x.json.ok);
          if (adminOk && x.json && x.json.email) {
            if (!sessionCache) {
              sessionCache = { email: x.json.email, reportSlug: '' };
            }
          }
          if (!adminOk) {
            try {
              sessionStorage.removeItem(ADMIN_JWT_KEY);
            } catch (e) {}
          }
        })
      );
    } else {
      adminOk = false;
    }
    return Promise.all(jobs);
  }

  function closeOpenMenu() {
    if (!openMenu) return;
    openMenu.classList.add('is-hidden');
    var btn = openMenu.previousElementSibling;
    if (btn && btn.setAttribute) btn.setAttribute('aria-expanded', 'false');
    openMenu = null;
  }

  function onDocPointer(e) {
    if (!openMenu) return;
    var wrap = openMenu.closest('.so-nav-account');
    if (wrap && !wrap.contains(e.target)) closeOpenMenu();
  }

  function onDocKey(e) {
    if (e.key === 'Escape') closeOpenMenu();
  }

  document.addEventListener('mousedown', onDocPointer);
  document.addEventListener('keydown', onDocKey);

  function menuRow(href, label, opts) {
    opts = opts || {};
    var a = document.createElement('a');
    a.className = 'so-user-menu__row' + (opts.accent ? ' so-user-menu__row--accent' : '');
    a.href = href;
    var text = document.createElement('span');
    text.textContent = label;
    a.appendChild(text);
    if (opts.badge != null && opts.badge !== '') {
      var b = document.createElement('span');
      b.className = 'so-user-menu__badge';
      b.textContent = String(opts.badge);
      a.appendChild(b);
    }
  if (opts.onClick) {
      a.addEventListener('click', function (e) {
        opts.onClick(e);
        closeOpenMenu();
      });
    } else {
      a.addEventListener('click', closeOpenMenu);
    }
    return a;
  }

  function renderGuest(root) {
    root.className = 'so-nav-account';
    root.innerHTML = '';
    var login = document.createElement('a');
    login.className = 'nav__login mono';
    login.href = resolveLoginHref(root);
    login.textContent = 'Log in';
    root.appendChild(login);
  }

  function renderAuthed(root) {
    var email = portalEmail();
    var label = displayNameFromEmail(email);
    var loginHref = resolveLoginHref(root);
    var adminHref = resolveAdminHref(root);
    var showAdmin = adminOk || String(email).toLowerCase() === ADMIN_EMAIL;

    root.className = 'so-nav-account so-nav-account--authed';
    root.innerHTML = '';

    var wrap = document.createElement('div');
    wrap.className = 'so-user-menu';

    var toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'so-user-menu__toggle';
    toggle.setAttribute('aria-haspopup', 'menu');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', 'Account menu for ' + label);

    var avatar = document.createElement('span');
    avatar.className = 'so-user-menu__avatar';
    avatar.setAttribute('aria-hidden', 'true');
    avatar.textContent = initialsFromLabel(label);

    var name = document.createElement('span');
    name.className = 'so-user-menu__name mono';
    name.textContent = label;

    toggle.appendChild(avatar);
    toggle.appendChild(name);

    var panel = document.createElement('div');
    panel.className = 'so-user-menu__panel is-hidden';
    panel.setAttribute('role', 'menu');

    panel.appendChild(menuRow(loginHref, label, { accent: true }));
    panel.appendChild(menuRow(loginHref, 'Settings'));
    if (showAdmin) {
      panel.appendChild(menuRow(adminHref, 'Admin', { accent: true }));
    }
    panel.appendChild(
      menuRow('#', 'Sign out', {
        onClick: function (e) {
          e.preventDefault();
          clearPortalJwt();
          try {
            sessionStorage.removeItem(ADMIN_JWT_KEY);
          } catch (err) {}
          window.location.href = loginHref;
        },
      })
    );

    toggle.addEventListener('click', function () {
      var isOpen = !panel.classList.contains('is-hidden');
      closeOpenMenu();
      if (!isOpen) {
        panel.classList.remove('is-hidden');
        toggle.setAttribute('aria-expanded', 'true');
        openMenu = panel;
      }
    });

    wrap.appendChild(toggle);
    wrap.appendChild(panel);
    root.appendChild(wrap);
  }

  function mountRoot(root) {
    if (!root || root.getAttribute('data-so-nav-mounted') === '1') return;
    root.setAttribute('data-so-nav-mounted', '1');
    var portalJwt = getPortalJwt();
    var adminJwt = getAdminJwt();
    if (!portalJwt && !adminJwt) {
      sessionCache = null;
      adminOk = false;
      renderGuest(root);
      return;
    }
    if (portalJwt && !sessionCache) {
      var seedEmail = decodeJwtEmail(portalJwt);
      if (seedEmail) sessionCache = { email: seedEmail, reportSlug: '' };
    }
    renderAuthed(root);
    loadSessionState().then(function () {
      if (!getPortalJwt() && !getAdminJwt()) {
        renderGuest(root);
        return;
      }
      renderAuthed(root);
    });
  }

  function mountAll() {
    var roots = document.querySelectorAll('[data-so-nav-account], #soNavAccount, #navPortalAuth, #navClinicAuth');
    if (!roots.length) return;
    for (var i = 0; i < roots.length; i++) {
      var node = roots[i];
      if (node.tagName === 'A' && node.parentNode) {
        var mount = document.createElement('div');
        mount.id = node.id || 'soNavAccount';
        mount.className = 'so-nav-account';
        mount.setAttribute('data-so-nav-account', '');
        if (node.getAttribute('data-login-href')) {
          mount.setAttribute('data-login-href', node.getAttribute('data-login-href'));
        }
        if (node.getAttribute('data-admin-href')) {
          mount.setAttribute('data-admin-href', node.getAttribute('data-admin-href'));
        }
        node.parentNode.replaceChild(mount, node);
        mountRoot(mount);
      } else {
        mountRoot(node);
      }
    }
  }

  window.__SO_USER_ACCOUNT_MENU__ = true;

  (function loadUserActivity() {
    if (document.querySelector('script[data-so-user-activity]')) return;
    var script = document.createElement('script');
    script.src = '/user-activity.js';
    script.defer = true;
    script.setAttribute('data-so-user-activity', '1');
    document.head.appendChild(script);
  })();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountAll);
  } else {
    mountAll();
  }
})();
