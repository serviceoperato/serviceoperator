(function () {
  'use strict';

  if (!('serviceWorker' in navigator)) return;

  function shouldReloadForUpdate(url) {
    try {
      return url === window.location.href;
    } catch (e) {
      return false;
    }
  }

  navigator.serviceWorker.addEventListener('message', function (event) {
    var data = event.data || {};
    if (data.type !== 'SO_PAGE_CACHE_UPDATED') return;
    if (!shouldReloadForUpdate(data.url)) return;
    window.location.reload();
  });

  window.addEventListener('load', function () {
    navigator.serviceWorker
      .register('/sw.js')
      .then(function (registration) {
        if (registration && registration.update) registration.update();
      })
      .catch(function () {});
  });
})();
