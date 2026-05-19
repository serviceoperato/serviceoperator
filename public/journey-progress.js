/**
 * Linear public journey: Home (1) → Audit example (2) → Workspace (3).
 */
(function (g) {
  'use strict';

  var STEPS = [
    { n: 1, short: 'Studio', href: '/' },
    { n: 2, short: 'Audit sample', href: '/audit-example' },
    { n: 3, short: 'Workspace', href: '/workspace' },
  ];

  var USER_JWT_KEY = 'so_user_jwt';
  var LEGACY_JWT_KEY = 'so_clinic_jwt';

  function journeyStepFromPath(path) {
    var p = path || (typeof g.location !== 'undefined' ? g.location.pathname : '/');
    if (/^\/workspace(\.html)?\/?$/i.test(p)) return 3;
    if (/^\/audit-example(\.html)?\/?$/i.test(p)) return 2;
    if (/^\/operational-findings(\.html)?\/?$/i.test(p)) return 2;
    if (p === '/' || p === '/index.html') return 1;
    return 0;
  }

  function hasPortalJwt() {
    try {
      return !!(
        g.sessionStorage.getItem(USER_JWT_KEY) ||
        g.sessionStorage.getItem(LEGACY_JWT_KEY) ||
        g.localStorage.getItem(USER_JWT_KEY) ||
        g.localStorage.getItem(LEGACY_JWT_KEY)
      );
    } catch (e) {
      return false;
    }
  }

  function workspaceHref() {
    if (hasPortalJwt()) {
      return typeof g.soPortalWorkspaceCanonical === 'function'
        ? g.soPortalWorkspaceCanonical()
        : '/workspace';
    }
    return typeof g.soPortalLoginHrefWithNext === 'function'
      ? g.soPortalLoginHrefWithNext('/workspace')
      : '/login.html?next=%2Fworkspace';
  }

  g.soJourneyStepFromPath = journeyStepFromPath;
  g.soJourneyWorkspaceHref = workspaceHref;

  function mountProgress() {
    var step = journeyStepFromPath();
    if (!step) return;

    var nav = document.querySelector('nav.nav');
    if (!nav || document.getElementById('soJourneyProgress')) return;

    var wrap = document.createElement('div');
    wrap.id = 'soJourneyProgress';
    wrap.className = 'so-journey-progress';
    wrap.setAttribute('role', 'navigation');
    wrap.setAttribute('aria-label', 'Engagement path');

    var ol = document.createElement('ol');
    ol.className = 'so-journey-progress__list';

    STEPS.forEach(function (s) {
      var li = document.createElement('li');
      li.className = 'so-journey-progress__item';
      if (s.n < step) li.classList.add('is-done');
      if (s.n === step) li.classList.add('is-current');

      var href = s.href;
      if (s.n === 3) href = workspaceHref();

      if (s.n < step) {
        var a = document.createElement('a');
        a.className = 'so-journey-progress__link';
        a.href = href;
        a.innerHTML =
          '<span class="so-journey-progress__num" aria-hidden="true">' +
          s.n +
          '</span><span class="so-journey-progress__text">' +
          s.short +
          '</span>';
        li.appendChild(a);
      } else if (s.n === step) {
        var span = document.createElement('span');
        span.className = 'so-journey-progress__label';
        span.setAttribute('aria-current', 'step');
        span.innerHTML =
          '<span class="so-journey-progress__num" aria-hidden="true">' +
          s.n +
          '</span><span class="so-journey-progress__text">' +
          s.short +
          '</span>';
        li.appendChild(span);
      } else {
        var link = document.createElement('a');
        link.className = 'so-journey-progress__link';
        link.href = href;
        link.innerHTML =
          '<span class="so-journey-progress__num" aria-hidden="true">' +
          s.n +
          '</span><span class="so-journey-progress__text">' +
          s.short +
          '</span>';
        li.appendChild(link);
      }
      ol.appendChild(li);
    });

    wrap.appendChild(ol);
    nav.parentNode.insertBefore(wrap, nav.nextSibling);
  }

  function bindWorkspaceCtas() {
    document.querySelectorAll('[data-so-journey-workspace-cta]').forEach(function (el) {
      if (el.tagName !== 'A') return;
      el.href = workspaceHref();
    });
  }

  function init() {
    mountProgress();
    bindWorkspaceCtas();
    if (typeof g.soRebuildSiteNavDrawer === 'function') {
      g.soRebuildSiteNavDrawer();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(typeof window !== 'undefined' ? window : globalThis);
