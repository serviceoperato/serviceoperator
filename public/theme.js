/* www.serviceopera.to — light / dark theme toggle (icone monocrome SVG, currentColor) */
(function () {
  var KEY = 'so-theme';

  var ICON_SUN =
    '<svg class="theme-toggle__icon" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>';

  var ICON_MOON =
    '<svg class="theme-toggle__icon" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';

  function escapeAttr(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/'/g, '&#39;');
  }

  function themeIconFromMap(which) {
    var map = window.__SO_SITE_ICON_MAP__;
    if (!map || typeof map !== 'object') return which === 'sun' ? ICON_SUN : ICON_MOON;
    var raw = which === 'sun' ? map['theme-sun'] : map['theme-moon'];
    if (typeof raw !== 'string') return which === 'sun' ? ICON_SUN : ICON_MOON;
    var val = raw.trim();
    if (!val) return which === 'sun' ? ICON_SUN : ICON_MOON;
    if (/^https?:\/\//i.test(val) || val.charAt(0) === '/') {
      return (
        '<img class="theme-toggle__icon" src="' +
        escapeAttr(val) +
        '" alt="" width="20" height="20" decoding="async"/>'
      );
    }
    if (/<svg/i.test(val)) return val;
    return which === 'sun' ? ICON_SUN : ICON_MOON;
  }

  function current() {
    var t = document.documentElement.getAttribute('data-theme');
    return t === 'light' ? 'light' : 'dark';
  }

  function apply(theme) {
    var next = theme === 'light' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try {
      localStorage.setItem(KEY, next);
    } catch (e) {}
    syncButtons();
  }

  function syncButtons() {
    var dark = current() === 'dark';
    var label = dark ? 'Switch to light theme' : 'Switch to dark theme';
    document.querySelectorAll('[data-theme-toggle]').forEach(function (btn) {
      btn.setAttribute('aria-label', label);
      btn.setAttribute('title', label);
      btn.innerHTML = dark ? themeIconFromMap('sun') : themeIconFromMap('moon');
    });
  }

  window.__soThemeSyncButtons = syncButtons;

  function toggle() {
    apply(current() === 'dark' ? 'light' : 'dark');
  }

  function initButtons() {
    document.querySelectorAll('[data-theme-toggle]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        toggle();
      });
    });
    syncButtons();
  }

  function boot() {
    initButtons();
    window.addEventListener('load', syncButtons);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();

/* Nav lockup + icon slots from site appearance (GET /api/site-appearance). */
(function () {
  function escapeAttr(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/'/g, '&#39;');
  }

  function applyNav(j) {
    if (!j || typeof j.navLogoUrl !== 'string') return;
    var u = j.navLogoUrl.trim();
    if (!u) return;
    var alt = typeof j.navLogoAlt === 'string' && j.navLogoAlt.trim() ? j.navLogoAlt.trim() : '';
    document.querySelectorAll('img.brand-logo').forEach(function (img) {
      img.src = u;
      if (alt) img.alt = alt;
    });
  }

  function applyIconSlots(icons) {
    window.__SO_SITE_ICON_MAP__ = icons && typeof icons === 'object' ? icons : {};
    document.querySelectorAll('[data-so-icon]').forEach(function (el) {
      var key = (el.getAttribute('data-so-icon') || '').trim().toLowerCase();
      if (!key) return;
      var raw = window.__SO_SITE_ICON_MAP__[key];
      if (typeof raw !== 'string') return;
      var val = raw.trim();
      if (!val) return;
      if (/^https?:\/\//i.test(val) || val.charAt(0) === '/') {
        var isMarkets = key === 'home-markets';
        var imgClass = isMarkets ? 'so-b2b__markets-ico so-icon-override-img' : 'so-icon-override-img';
        el.innerHTML =
          '<img src="' + escapeAttr(val) + '" alt="" class="' + imgClass + '" decoding="async"/>';
        return;
      }
      if (/<svg/i.test(val)) {
        el.innerHTML = val;
      }
    });
    if (typeof window.__soThemeSyncButtons === 'function') window.__soThemeSyncButtons();
  }

  fetch(typeof soApiUrl === 'function' ? soApiUrl('/api/site-appearance') : '/api/site-appearance', {
    credentials: typeof soApiCredentials === 'function' ? soApiCredentials() : 'omit',
    cache: 'no-store',
  })
    .then(function (r) {
      return r.ok ? r.json() : null;
    })
    .then(function (j) {
      applyNav(j);
      applyIconSlots(j && j.icons);
    })
    .catch(function () {});
})();
