(function () {
  'use strict';

  function applyHero(dataKey, url, alt) {
    var img = document.querySelector('[data-so-site-appearance="' + dataKey + '"]');
    if (!img || typeof url !== 'string') return;
    var u = url.trim();
    if (!u) return;
    img.src = u;
    if (typeof alt === 'string' && alt.trim()) {
      img.alt = alt.trim();
    }
  }

  fetch(typeof soApiUrl === 'function' ? soApiUrl('/api/site-appearance') : '/api/site-appearance', {
    credentials: typeof soApiCredentials === 'function' ? soApiCredentials() : 'omit',
    cache: 'no-store',
  })
    .then(function (r) {
      if (!r.ok) return null;
      return r.json();
    })
    .then(function (j) {
      if (!j) return;
      applyHero('property-hero', j.propertyPageImageUrl, j.propertyPageImageAlt);
      applyHero('clinics-hero', j.clinicPageImageUrl, j.clinicPageImageAlt);
      applyHero('hotels-hero', j.hotelPageImageUrl, j.hotelPageImageAlt);
      applyHero('home-hero', j.homePageImageUrl, j.homePageImageAlt);
    })
    .catch(function () {
      /* keep static src from HTML */
    });
})();
