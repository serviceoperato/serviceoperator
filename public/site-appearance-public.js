(function () {
  'use strict';

  function applyHero(dataKey, url, alt) {
    var img = document.querySelector('[data-so-site-appearance="' + dataKey + '"]');
    if (!img || typeof url !== 'string') return;
    var u = url.trim();
    if (!u) return;
    if (typeof window !== 'undefined' && typeof window.__soResolveSitePublicAssetUrl === 'function') {
      u = window.__soResolveSitePublicAssetUrl(u);
    }
    img.src = u;
    if (typeof alt === 'string' && alt.trim()) {
      img.alt = alt.trim();
    }
  }

  function applyAllHeroes(j) {
    if (!j) return;
    applyHero('property-hero', j.propertyPageImageUrl, j.propertyPageImageAlt);
    applyHero('clinics-hero', j.clinicPageImageUrl, j.clinicPageImageAlt);
    applyHero('hotels-hero', j.hotelPageImageUrl, j.hotelPageImageAlt);
    applyHero('home-hero', j.homePageImageUrl, j.homePageImageAlt);
  }

  window.__soApplySiteAppearanceHeroImages = applyAllHeroes;

  function dismissHomePageSkeleton() {
    var sk = document.getElementById('homeSkeleton');
    var main = document.getElementById('homeMain');
    if (!sk || !main) return;
    sk.classList.add('is-hidden');
    main.classList.remove('is-hidden');
  }

  function runFetch() {
    if (typeof window.__soFetchSiteAppearanceJson === 'function') {
      return window.__soFetchSiteAppearanceJson();
    }
    var url = typeof soApiUrl === 'function' ? soApiUrl('/api/site-appearance') : '/api/site-appearance';
    var cred = typeof soApiCredentials === 'function' ? soApiCredentials() : 'omit';
    return fetch(url, { credentials: cred, cache: 'no-store' }).then(function (r) {
      return r.ok ? r.json() : null;
    });
  }

  runFetch()
    .then(function (j) {
      applyAllHeroes(j);
    })
    .catch(function () {
      /* keep static src from HTML */
    })
    .finally(dismissHomePageSkeleton);
})();
