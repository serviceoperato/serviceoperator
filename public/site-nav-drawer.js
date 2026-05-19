/**
 * Left site menu (hamburger + slide-in drawer) for www.serviceopera.to.
 */
(function () {
  'use strict';

  var USER_JWT_KEY = 'so_user_jwt';
  var LEGACY_JWT_KEY = 'so_clinic_jwt';

  var JOURNEY_SECTIONS = [
    {
      id: 'path',
      title: 'Your path',
      links: [
        { href: '/', label: 'Audit studio home' },
        { href: '/audit-example', label: 'Sample operational audit' },
        { href: '/operational-findings', label: 'Operational findings (demo)' },
        { href: '/pricing', label: 'Pricing' },
        { href: '/workspace', label: 'Private workspace', onlyIfSignedIn: true },
        { href: '/login.html', label: 'Sign in for workspace', onlyIfSignedOut: true },
      ],
    },
    {
      id: 'account',
      title: 'Account',
      links: [
        { href: '/login.html', label: 'Log in' },
        { href: '/register.html', label: 'Create account' },
        { href: '/workspace', label: 'Workspace', onlyIfSignedIn: true },
      ],
    },
  ];

  var SECTIONS = [
    {
      id: 'overview',
      title: 'Overview',
      links: [
        { href: '/', label: 'Home' },
        { href: '/audit-example', label: 'Sample audit' },
        { href: '/pricing', label: 'Pricing' },
        { href: '/admin/report-catalog', label: 'Report catalog (operator)' },
      ],
    },
    {
      id: 'industries',
      title: 'Industries',
      items: [
        { title: 'Hotels & serviced apartments', href: '/hotels.html' },
        { title: 'Clinics, dental & wellness', href: '/clinics.html' },
        { title: 'Property & rental operators', href: '/property.html' },
      ],
    },
    {
      id: 'reports',
      title: 'Reports',
      links: [
        { href: '/workspace.html', label: 'Workspace', onlyIfSignedIn: true },
        { href: '/reports.html', label: 'Request an audit' },
        { href: '/account-settings', label: 'Account settings', onlyIfSignedIn: true },
      ],
    },
    {
      id: 'tools',
      title: 'Tools',
      links: [
        { href: '/reports.html#inquiry', label: 'Contact Jack' },
      ],
    },
    {
      id: 'account',
      title: 'Account',
      links: [
        { href: '/login.html', label: 'Log in' },
        { href: '/register.html', label: 'Create account' },
        { href: '/workspace.html', label: 'Signed in', onlyIfSignedIn: true },
      ],
    },
  ];

  function hasPortalJwt() {
    try {
      return !!(
        sessionStorage.getItem(USER_JWT_KEY) ||
        sessionStorage.getItem(LEGACY_JWT_KEY) ||
        localStorage.getItem(USER_JWT_KEY) ||
        localStorage.getItem(LEGACY_JWT_KEY)
      );
    } catch (e) {
      return false;
    }
  }

  function isHomePage() {
    var p = window.location.pathname || '/';
    return p === '/' || p === '/index.html';
  }

  function isJourneyPage() {
    var p = window.location.pathname || '/';
    return (
      p === '/' ||
      p === '/index.html' ||
      /^\/audit-example(\.html)?\/?$/i.test(p) ||
      /^\/operational-findings(\.html)?\/?$/i.test(p) ||
      /^\/workspace(\.html)?\/?$/i.test(p)
    );
  }

  function normalizePathname(path) {
    var p = path || '/';
    if (p === '/index.html') return '/';
    p = p.replace(/\/index\.html$/i, '/');
    if (p.length > 1) p = p.replace(/\/+$/, '');
    return p || '/';
  }

  function linkLabelFromAnchor(anchor) {
    if (!anchor) return 'Link';
    var btnLbl = anchor.querySelector('.so-b2b__btn-label');
    if (btnLbl && btnLbl.textContent.trim()) return btnLbl.textContent.trim();
    var aria = anchor.getAttribute('aria-label');
    if (aria && aria.trim()) return aria.trim();
    var img = anchor.querySelector('img[alt]');
    if (img) {
      var alt = (img.getAttribute('alt') || '').trim();
      if (alt) return alt;
    }
    var text = (anchor.textContent || '').trim().replace(/\s+/g, ' ');
    if (text) return text;
    return anchor.getAttribute('href') || 'Link';
  }

  function isInternalNavHref(href) {
    if (!href || href === '#') return false;
    if (href.charAt(0) === '#') return false;
    if (/^(mailto:|tel:|javascript:)/i.test(href)) return false;
    if (/^https?:\/\//i.test(href)) {
      try {
        return new URL(href, window.location.origin).origin === window.location.origin;
      } catch (eHref) {
        return false;
      }
    }
    return true;
  }

  function collectHomepageLinks() {
    var seen = Object.create(null);
    var out = [];
    var roots = [];
    var topNav = document.querySelector('nav.nav');
    if (topNav) roots.push(topNav);
    var homeMain = document.getElementById('homeMain');
    if (homeMain) roots.push(homeMain);

    roots.forEach(function (root) {
      root.querySelectorAll('a[href]').forEach(function (a) {
        var rawHref = (a.getAttribute('href') || '').trim();
        if (!isInternalNavHref(rawHref)) return;
        var external = /^https?:\/\//i.test(rawHref);
        var label = linkLabelFromAnchor(a);
        var key = rawHref + '\0' + label;
        if (seen[key]) return;
        seen[key] = true;
        out.push({ href: rawHref, label: label, external: external });
      });
    });
    return out;
  }

  function navSections() {
    if (!isHomePage()) {
      return isJourneyPage() ? JOURNEY_SECTIONS : SECTIONS;
    }
    var homepageLinks = collectHomepageLinks();
    var sections = [];
    if (homepageLinks.length) {
      sections.push({
        id: 'homepage',
        title: 'Homepage',
        links: homepageLinks,
      });
    }
    JOURNEY_SECTIONS.forEach(function (section) {
      sections.push(section);
    });
    return sections;
  }

  function isActive(href) {
    if (!href || href.indexOf('mailto:') === 0) return false;
    try {
      var path = window.location.pathname || '/';
      var hash = (window.location.hash || '').toLowerCase();
      var hashIdx = href.indexOf('#');
      var pathPart = hashIdx >= 0 ? href.slice(0, hashIdx) : href;
      var wantHash = hashIdx >= 0 ? href.slice(hashIdx).toLowerCase() : '';
      var current = normalizePathname(path);
      var target;
      try {
        target = normalizePathname(new URL(pathPart, window.location.origin).pathname);
      } catch (eUrl) {
        target = normalizePathname(pathPart);
      }
      if (target === '/') return current === '/' && !wantHash;
      var pathMatch = current === target || current.indexOf(target + '/') === 0;
      if (!pathMatch) return false;
      if (wantHash) return hash === wantHash;
      var onLogin =
        target === '/login.html' ||
        target.endsWith('/login.html') ||
        target === 'login.html';
      if (onLogin && hash) return false;
      return true;
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
    var brand = document.createElement('a');
    brand.className = 'so-site-nav-panel__brand';
    brand.href = '/';
    brand.textContent = 'ServiceOpera.to';
    brand.addEventListener('click', closeMenu);
    var closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'so-site-nav-panel__close';
    closeBtn.setAttribute('aria-label', 'Close menu');
    closeBtn.textContent = '✕';
    closeBtn.addEventListener('click', closeMenu);
    header.appendChild(brand);
    header.appendChild(closeBtn);
    inner.appendChild(header);

    var themeRow = document.createElement('div');
    themeRow.className = 'so-site-nav-panel__theme';
    var themeLabel = document.createElement('span');
    themeLabel.className = 'so-site-nav-panel__theme-label';
    themeLabel.textContent = 'Theme';
    var themeBtn = document.createElement('button');
    themeBtn.type = 'button';
    themeBtn.className = 'theme-toggle theme-toggle--drawer';
    themeBtn.setAttribute('data-theme-toggle', '');
    themeBtn.setAttribute('aria-label', 'Theme');
    themeRow.appendChild(themeLabel);
    themeRow.appendChild(themeBtn);
    inner.appendChild(themeRow);

    navSections().forEach(function (section) {
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
        if (link.onlyIfSignedIn && !hasPortalJwt()) return;
        if (link.onlyIfSignedOut && hasPortalJwt()) return;
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

    panel.appendChild(inner);
    root.appendChild(backdrop);
    root.appendChild(panel);
    document.body.appendChild(root);

    if (typeof window.__soThemeBindToggles === 'function') {
      window.__soThemeBindToggles();
    }
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
