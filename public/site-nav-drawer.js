/**
 * Left site menu (hamburger + slide-in drawer) for ServiceOpera.to.
 */
(function () {
  'use strict';

  var ADMIN_JWT_KEY = 'so_admin_jwt';
  var USER_JWT_KEY = 'so_user_jwt';
  var LEGACY_JWT_KEY = 'so_clinic_jwt';

  var SECTIONS = [
    {
      id: 'verticals',
      title: 'Verticals',
      items: [
        {
          title: 'Hotels & serviced apartments',
          href: '/hotels.html',
        },
        {
          title: 'Clinics, dental & wellness',
          href: '/clinics.html',
        },
        {
          title: 'Property & rental operators',
          href: '/property.html',
        },
      ],
    },
    {
      id: 'discovery',
      title: 'Site',
      links: [
        { href: '/', label: 'Home' },
        { href: '/pricing', label: 'Pricing' },
        { href: '/about.html', label: 'About' },
        { href: '/reports.html', label: 'Reports' },
        { href: '/hotels.html', label: 'Hotels' },
        { href: '/clinics.html', label: 'Clinics' },
        { href: '/property.html', label: 'Property' },
        { href: '/engagement.html', label: 'Engagement' },
      ],
    },
    {
      id: 'access',
      title: 'Access',
      links: [
        { href: '/login.html', label: 'Log in' },
        { href: '/register.html', label: 'Create account' },
      ],
    },
    {
      id: 'tools',
      title: 'Tools',
      links: [
        { href: '/places-leads.html', label: 'Places leads' },
        { href: '/clinics/sea-clinic-audit/', label: 'Sample audit' },
        { href: '/reports.html#inquiry', label: 'Contact Jack' },
      ],
    },
    {
      id: 'admin',
      title: 'Admin',
      adminOnly: true,
      links: [{ href: '/admin.html', label: 'Admin console' }],
    },
  ];

  function hasPortalJwt() {
    try {
      return !!(sessionStorage.getItem(USER_JWT_KEY) || sessionStorage.getItem(LEGACY_JWT_KEY));
    } catch (e) {
      return false;
    }
  }

  function hasAdminJwt() {
    try {
      return !!sessionStorage.getItem(ADMIN_JWT_KEY);
    } catch (e) {
      return false;
    }
  }

  function isActive(href) {
    if (!href || href.indexOf('mailto:') === 0) return false;
    try {
      var path = window.location.pathname || '/';
      if (href === '/') return path === '/' || path === '/index.html';
      return path === href || path.endsWith(href);
    } catch (e) {
      return false;
    }
  }

  function setOpen(open) {
    var root = document.getElementById('soSiteNavRoot');
    var trigger = document.getElementById('soSiteNavTrigger');
    if (!root) return;
    root.classList.toggle('is-open', open);
    root.setAttribute('aria-hidden', open ? 'false' : 'true');
    document.documentElement.classList.toggle('so-site-nav-open', open);
    if (trigger) trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
    try {
      document.querySelectorAll('[data-so-open-site-nav]').forEach(function (b) {
        b.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
    } catch (eSync) {}
    if (open) {
      var panel = document.getElementById('soSiteNavPanel');
      if (panel) panel.focus();
    }
  }

  function closeMenu() {
    setOpen(false);
  }

  var escapeCloseInstalled = false;
  function installEscapeClose() {
    if (escapeCloseInstalled) return;
    escapeCloseInstalled = true;
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeMenu();
    });
  }

  var delegatedOpenInstalled = false;
  function installDelegatedOpenNav() {
    if (delegatedOpenInstalled) return;
    delegatedOpenInstalled = true;
    document.addEventListener(
      'click',
      function (e) {
        var btn = e.target && e.target.closest && e.target.closest('[data-so-open-site-nav]');
        if (!btn) return;
        e.preventDefault();
        var root = document.getElementById('soSiteNavRoot');
        if (!root) return;
        setOpen(!root.classList.contains('is-open'));
      },
      true
    );
  }

  function buildDrawer() {
    var prev = document.getElementById('soSiteNavRoot');
    if (prev) {
      setOpen(false);
      prev.remove();
    }

    var root = document.createElement('div');
    root.id = 'soSiteNavRoot';
    root.className = 'so-site-nav-root';
    root.setAttribute('aria-hidden', 'true');

    var backdrop = document.createElement('button');
    backdrop.type = 'button';
    backdrop.className = 'so-site-nav-backdrop';
    backdrop.setAttribute('aria-label', 'Close menu');
    backdrop.addEventListener('click', closeMenu);

    var panel = document.createElement('nav');
    panel.id = 'soSiteNavPanel';
    panel.className = 'so-site-nav-panel';
    panel.setAttribute('aria-label', 'Site menu');
    panel.tabIndex = -1;

    var inner = document.createElement('div');
    inner.className = 'so-site-nav-panel__inner';

    var header = document.createElement('div');
    header.className = 'so-site-nav-panel__header';
    var closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'so-site-nav-panel__close';
    closeBtn.setAttribute('aria-label', 'Close menu');
    closeBtn.textContent = '✕';
    closeBtn.addEventListener('click', closeMenu);
    header.appendChild(closeBtn);
    inner.appendChild(header);

    var showAdmin = hasAdminJwt();
    SECTIONS.forEach(function (section) {
      if (section.adminOnly && !showAdmin) return;
      var sectionId = 'soSiteNavSection-' + section.id;
      var toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'so-site-nav-section-toggle';
      toggle.setAttribute('aria-expanded', 'true');
      toggle.setAttribute('aria-controls', sectionId);

      var title = document.createElement('span');
      title.className = 'so-site-nav-section-label';
      title.textContent = section.title;
      var chevron = document.createElement('span');
      chevron.className = 'so-site-nav-section-chevron';
      chevron.setAttribute('aria-hidden', 'true');
      chevron.textContent = '▼';
      toggle.appendChild(title);
      toggle.appendChild(chevron);

      var body = document.createElement('div');
      body.id = sectionId;
      body.className = 'so-site-nav-section-body';

      if (section.items && section.items.length) {
        section.items.forEach(function (item) {
          var card = document.createElement('a');
          card.className = 'so-site-nav-vertical';
          if (isActive(item.href)) card.classList.add('so-site-nav-vertical--active');
          card.href = item.href || '#';
          var cardTitle = document.createElement('span');
          cardTitle.className = 'so-site-nav-vertical__title';
          cardTitle.textContent = item.title;
          card.appendChild(cardTitle);
          card.addEventListener('click', closeMenu);
          body.appendChild(card);
        });
      }

      (section.links || []).forEach(function (link) {
        var a = document.createElement('a');
        a.className = 'so-site-nav-link';
        if (isActive(link.href)) a.classList.add('so-site-nav-link--active');
        a.href = link.href;
        a.textContent = link.label;
        if (link.external) {
          a.target = '_blank';
          a.rel = 'noopener noreferrer';
        }
        a.addEventListener('click', closeMenu);
        body.appendChild(a);
      });

      if (!section.items && (!section.links || !section.links.length)) return;

      toggle.addEventListener('click', function () {
        var open = body.classList.toggle('is-collapsed');
        toggle.setAttribute('aria-expanded', open ? 'false' : 'true');
        chevron.textContent = open ? '▶' : '▼';
      });

      inner.appendChild(toggle);
      inner.appendChild(body);
    });

    if (hasPortalJwt()) {
      var utilLabel = document.createElement('p');
      utilLabel.className = 'so-site-nav-section-label';
      utilLabel.textContent = 'Signed in';
      inner.appendChild(utilLabel);
      var account = document.createElement('a');
      account.className = 'so-site-nav-link';
      account.href = '/login.html';
      account.textContent = 'Account & reports';
      account.addEventListener('click', closeMenu);
      inner.appendChild(account);
    }

    panel.appendChild(inner);
    root.appendChild(backdrop);
    root.appendChild(panel);
    document.body.appendChild(root);
  }

  function ensureTrigger(nav) {
    if (document.getElementById('soSiteNavTrigger')) return;
    var start = nav.querySelector('.nav__start');
    if (!start) {
      start = document.createElement('div');
      start.className = 'nav__start';
      var logo = nav.querySelector('.nav__logo');
      if (logo && logo.parentNode === nav) {
        nav.insertBefore(start, logo);
        start.appendChild(logo);
      } else {
        nav.insertBefore(start, nav.firstChild);
      }
    }
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'soSiteNavTrigger';
    btn.className = 'so-hamburger-btn';
    btn.setAttribute('aria-label', 'Open site menu');
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-controls', 'soSiteNavPanel');
    for (var i = 0; i < 3; i++) {
      var bar = document.createElement('span');
      bar.setAttribute('aria-hidden', 'true');
      btn.appendChild(bar);
    }
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      var root = document.getElementById('soSiteNavRoot');
      if (!root) return;
      setOpen(!root.classList.contains('is-open'));
    });
    start.insertBefore(btn, start.firstChild);
  }

  function init() {
    var nav = document.querySelector('nav.nav');
    if (!nav) return;
    ensureTrigger(nav);
    installEscapeClose();
    installDelegatedOpenNav();
    buildDrawer();
  }

  window.soRebuildSiteNavDrawer = function () {
    buildDrawer();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
