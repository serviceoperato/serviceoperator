/* www.serviceopera.to — light / dark theme toggle (icone monocrome SVG, currentColor) */
(function (g) {
  function siteUploadPathFromUrl(raw) {
    var u = String(raw || '').trim();
    if (!u) return '';
    try {
      if (/^https?:\/\//i.test(u)) {
        var parsed = new URL(u);
        var path = parsed.pathname + (parsed.search || '');
        if (path.indexOf('/api/site-uploads/') === 0 || path.indexOf('/assets/site-uploads/') === 0) {
          return path;
        }
        return '';
      }
      if (u.charAt(0) === '/' && (u.indexOf('/api/site-uploads/') === 0 || u.indexOf('/assets/site-uploads/') === 0)) {
        return u;
      }
    } catch (e) {}
    return '';
  }

  g.__soResolveSitePublicAssetUrl = function (raw) {
    var u = String(raw || '').trim();
    if (!u) return '';
    var uploadPath = siteUploadPathFromUrl(u);
    if (uploadPath) {
      if (typeof g.soApiOrigin === 'function') {
        try {
          var apiOrigin = String(g.soApiOrigin() || '')
            .trim()
            .replace(/\/+$/, '');
          if (apiOrigin && /^https?:\/\//i.test(apiOrigin)) {
            var pageOrigin = g.location && g.location.origin ? g.location.origin : '';
            if (pageOrigin && new URL(apiOrigin).origin !== new URL(pageOrigin).origin) {
              return apiOrigin + uploadPath;
            }
          }
        } catch (e2) {}
      }
      /* Same-origin marketing host (soApiOrigin empty): keep /api/site-uploads/<uuid> relative. */
      return uploadPath;
    }
    if (/^https?:\/\//i.test(u)) return u;
    if (u.charAt(0) === '/') {
      return (g.location && g.location.origin ? g.location.origin : '') + u;
    }
    return u;
  };
})(typeof window !== 'undefined' ? window : globalThis);

(function () {
  var KEY = 'so-theme';

  /* Sun / “light” state: brand segmented ring + rays (replaces solid disc). */
  var ICON_SUN =
    '<svg class="theme-toggle__icon" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<g transform="translate(12,12) scale(0.58) translate(-12,-12)" fill="none">' +
    '<path d="M15.75 18.495A7.5 7.5 0 0 1 8.25 18.495"/>' +
    '<path d="M5.505 15.75A7.5 7.5 0 0 1 5.505 8.25"/>' +
    '<path d="M8.25 5.505A7.5 7.5 0 0 1 15.75 5.505"/>' +
    '<path d="M18.495 8.25A7.5 7.5 0 0 1 18.495 15.75"/>' +
    '</g>' +
    '<path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>' +
    '</svg>';

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
        escapeAttr(
          typeof window !== 'undefined' && typeof window.__soResolveSitePublicAssetUrl === 'function'
            ? window.__soResolveSitePublicAssetUrl(val)
            : val
        ) +
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
      if (btn.dataset.soThemeBound === '1') return;
      btn.dataset.soThemeBound = '1';
      btn.addEventListener('click', function () {
        toggle();
      });
    });
    syncButtons();
  }

  window.__soThemeBindToggles = initButtons;

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

  function resolveSitePublicAssetUrl(raw) {
    return typeof window !== 'undefined' && typeof window.__soResolveSitePublicAssetUrl === 'function'
      ? window.__soResolveSitePublicAssetUrl(raw)
      : String(raw || '').trim();
  }

  function jackAvatarWrap(img) {
    return img && img.closest ? img.closest('[data-so-jack-avatar]') : null;
  }

  function setJackAvatarWrapLoaded(img, loaded) {
    var w = jackAvatarWrap(img);
    if (!w) return;
    if (loaded) w.setAttribute('data-so-jack-loaded', '');
    else w.removeAttribute('data-so-jack-loaded');
  }

  function ensureJackPhotoLoadHandlers(img) {
    if (!img || img.dataset.soJackWire === '1') return;
    img.dataset.soJackWire = '1';
    img.addEventListener('load', function () {
      img.classList.remove('so-b2b__jack-photo--load-error');
      setJackAvatarWrapLoaded(img, true);
    });
    img.addEventListener('error', function () {
      setJackAvatarWrapLoaded(img, false);
    });
  }

  function syncJackAvatarLoadedIfComplete(img) {
    if (img && img.complete && img.naturalWidth > 0 && !img.classList.contains('so-b2b__jack-photo--load-error')) {
      img.classList.remove('so-b2b__jack-photo--load-error');
      setJackAvatarWrapLoaded(img, true);
    }
  }

  function patchInitialAssetImgSrc() {
    document.querySelectorAll('img.brand-logo, img.so-b2b__jack-photo').forEach(function (img) {
      try {
        var cur = img.getAttribute('src') || '';
        if (!cur || cur.charAt(0) !== '/') return;
        var next = resolveSitePublicAssetUrl(cur);
        if (img.classList.contains('so-b2b__jack-photo')) ensureJackPhotoLoadHandlers(img);
        if (next && next !== cur) img.src = next;
        if (img.classList.contains('so-b2b__jack-photo')) syncJackAvatarLoadedIfComplete(img);
      } catch (e2) {}
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', patchInitialAssetImgSrc);
  } else {
    patchInitialAssetImgSrc();
  }

  function applyNav(j) {
    if (!j || typeof j.navLogoUrl !== 'string') return;
    var u = resolveSitePublicAssetUrl(j.navLogoUrl.trim());
    if (!u) return;
    var alt = typeof j.navLogoAlt === 'string' && j.navLogoAlt.trim() ? j.navLogoAlt.trim() : '';
    document.querySelectorAll('img.brand-logo').forEach(function (img) {
      img.src = u;
      if (alt) img.alt = alt;
    });
  }

  function applyJackAvatar(j) {
    if (!j) return;
    var u = typeof j.jackAvatarUrl === 'string' ? j.jackAvatarUrl.trim() : '';
    var alt = typeof j.jackAvatarAlt === 'string' && j.jackAvatarAlt.trim() ? j.jackAvatarAlt.trim() : '';
    document.querySelectorAll('[data-so-jack-avatar] img.so-b2b__jack-photo').forEach(function (img) {
      ensureJackPhotoLoadHandlers(img);
      if (!u) {
        /* Keep markup + static / patched src; removing hid the portrait when API returned "" or before JSON loaded. */
        syncJackAvatarLoadedIfComplete(img);
        return;
      }
      img.classList.remove('so-b2b__jack-photo--load-error');
      setJackAvatarWrapLoaded(img, false);
      img.src = resolveSitePublicAssetUrl(u);
      if (alt) img.alt = alt;
      else img.removeAttribute('alt');
      syncJackAvatarLoadedIfComplete(img);
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
          '<img src="' +
          escapeAttr(resolveSitePublicAssetUrl(val)) +
          '" alt="" class="' +
          imgClass +
          '" decoding="async"/>';
        return;
      }
      if (/<svg/i.test(val)) {
        el.innerHTML = val;
      }
    });
    if (typeof window.__soThemeSyncButtons === 'function') window.__soThemeSyncButtons();
  }

  function cssUrlForBackground(u) {
    if (!u || typeof u !== 'string') return 'none';
    var t = u.trim();
    if (!t) return 'none';
    return 'url(' + JSON.stringify(t) + ')';
  }

  function applyHeroCornerDeco(j) {
    if (!j || typeof j !== 'object') return;
    var root = document.documentElement;
    var tr = typeof j.heroDecoTopRightUrl === 'string' ? j.heroDecoTopRightUrl.trim() : '';
    var bl = typeof j.heroDecoBottomLeftUrl === 'string' ? j.heroDecoBottomLeftUrl.trim() : '';
    var trOp = 0.12;
    if (typeof j.heroDecoTopRightOpacity === 'number' && Number.isFinite(j.heroDecoTopRightOpacity)) {
      trOp = Math.min(1, Math.max(0, j.heroDecoTopRightOpacity));
    }
    var blOp = 0.12;
    if (typeof j.heroDecoBottomLeftOpacity === 'number' && Number.isFinite(j.heroDecoBottomLeftOpacity)) {
      blOp = Math.min(1, Math.max(0, j.heroDecoBottomLeftOpacity));
    }
    root.style.setProperty('--so-hero-deco-tr-url', cssUrlForBackground(resolveSitePublicAssetUrl(tr)));
    root.style.setProperty('--so-hero-deco-bl-url', cssUrlForBackground(resolveSitePublicAssetUrl(bl)));
    root.style.setProperty('--so-hero-deco-tr-opacity', String(trOp));
    root.style.setProperty('--so-hero-deco-bl-opacity', String(blOp));
    document.querySelectorAll('.so-b2b__hero-deco--tr').forEach(function (el) {
      if (tr) el.removeAttribute('hidden');
      else el.setAttribute('hidden', '');
    });
    document.querySelectorAll('.so-b2b__hero-deco--bl').forEach(function (el) {
      if (bl) el.removeAttribute('hidden');
      else el.setAttribute('hidden', '');
    });
  }

  function applyThemeSiteAppearance(j) {
    applyNav(j);
    applyJackAvatar(j);
    applyIconSlots(j && j.icons);
    applyHeroCornerDeco(j);
  }

  /**
   * Single in-flight GET /api/site-appearance for the tab (theme + site-appearance-public.js share it).
   * Avoids duplicate requests and races where one response overwrote another.
   */
  window.__soFetchSiteAppearanceJson = function () {
    if (window.__soSiteAppearanceJsonPromise) return window.__soSiteAppearanceJsonPromise;
    var url = typeof soApiUrl === 'function' ? soApiUrl('/api/site-appearance') : '/api/site-appearance';
    var cred = typeof soApiCredentials === 'function' ? soApiCredentials() : 'omit';
    window.__soSiteAppearanceJsonPromise = fetch(url, { credentials: cred, cache: 'no-store' })
      .then(function (r) {
        return r.ok ? r.json() : null;
      })
      .catch(function () {
        return null;
      });
    return window.__soSiteAppearanceJsonPromise;
  };

  window.__soFetchSiteAppearanceJson().then(function (j) {
    applyThemeSiteAppearance(j);
  });

  window.addEventListener('pageshow', function (ev) {
    if (!ev.persisted) return;
    try {
      delete window.__soSiteAppearanceJsonPromise;
    } catch (e1) {}
    window.__soFetchSiteAppearanceJson().then(function (j) {
      applyThemeSiteAppearance(j);
      if (typeof window.__soApplySiteAppearanceHeroImages === 'function') {
        window.__soApplySiteAppearanceHeroImages(j);
      }
    });
  });
})();
