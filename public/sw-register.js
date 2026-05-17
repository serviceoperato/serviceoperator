(function () {
  'use strict';

  if (!('serviceWorker' in navigator)) return;

  var path = window.location.pathname || '';
  var isAdmin = path === '/admin' || path.indexOf('/admin/') === 0;

  function registerServiceWorker() {
    window.addEventListener('load', function () {
      navigator.serviceWorker
        .register('/sw.js')
        .then(function (registration) {
          if (registration && registration.update) registration.update();
        })
        .catch(function () {});
    });
  }

  if (isAdmin) {
    navigator.serviceWorker
      .getRegistrations()
      .then(function (regs) {
        return Promise.all(
          regs.map(function (reg) {
            return reg.unregister();
          })
        );
      })
      .then(function () {
        var shouldClear = false;
        try {
          shouldClear = sessionStorage.getItem('so_admin_sw_cleared') !== '1';
          if (shouldClear) sessionStorage.setItem('so_admin_sw_cleared', '1');
        } catch (e) {
          shouldClear = false;
        }
        if (!shouldClear || !('caches' in window)) return;
        return caches.keys().then(function (keys) {
          return Promise.all(
            keys.map(function (key) {
              return caches.delete(key);
            })
          );
        });
      })
      .catch(function () {});
    return;
  }

  registerServiceWorker();
})();
