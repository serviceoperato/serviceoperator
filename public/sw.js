/* global self, caches, fetch, clients */

var PAGE_CACHE = 'so-pages-v10';
var ASSET_CACHE = 'so-assets-v10';

function isAdminTranscriptionsAsset(pathname) {
  return (
    pathname === '/admin-transcriptions.js' ||
    pathname === '/admin-tx-dashboard.js' ||
    pathname === '/transcriptions-dashboard.css' ||
    pathname === '/admin-transcriptions.css' ||
    pathname === '/transcriptions-admin.css' ||
    pathname === '/admin.html'
  );
}

function isSameOrigin(url) {
  return url.origin === self.location.origin;
}

function isSensitiveDocument(pathname) {
  return (
    pathname === '/' ||
    /\/index\.html$/i.test(pathname) ||
    /\/login\.html$/i.test(pathname) ||
    /\/register\.html$/i.test(pathname) ||
    /\/admin\.html$/i.test(pathname) ||
    /\/client\.html$/i.test(pathname) ||
    /\/operator\/places-leads\.html$/i.test(pathname) ||
    /\/clinics\/report\.html$/i.test(pathname)
  );
}

function isCacheableAsset(request) {
  return (
    request.destination === 'style' ||
    request.destination === 'script' ||
    request.destination === 'image' ||
    request.destination === 'font'
  );
}

function staleWhileRevalidate(request, cacheName, event) {
  return caches.open(cacheName).then(function (cache) {
    return cache.match(request).then(function (cached) {
      var network = fetch(request)
        .then(function (response) {
          if (response && response.ok) {
            cache.put(request, response.clone());
          }
          return response;
        })
        .catch(function () {
          return cached;
        });

      if (cached) {
        event.waitUntil(
          network.then(function (fresh) {
            if (!fresh || !fresh.ok) return;
            if (cacheName !== ASSET_CACHE) return;
            return self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
              list.forEach(function (client) {
                client.postMessage({
                  type: 'SO_PAGE_CACHE_UPDATED',
                  url: request.url,
                });
              });
            });
          })
        );
        return cached;
      }

      return network;
    });
  });
}

self.addEventListener('install', function (event) {
  self.skipWaiting();
  event.waitUntil(caches.open(PAGE_CACHE));
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys
          .filter(function (key) {
            return key !== PAGE_CACHE && key !== ASSET_CACHE;
          })
          .map(function (key) {
            return caches.delete(key);
          })
      );
    }).then(function () {
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', function (event) {
  if (event.request.method !== 'GET') return;

  var url = new URL(event.request.url);
  if (!isSameOrigin(url)) return;
  if (url.pathname.indexOf('/api/') === 0) return;

  if (event.request.mode === 'navigate' || event.request.destination === 'document') {
    if (isSensitiveDocument(url.pathname)) return;
    event.respondWith(staleWhileRevalidate(event.request, PAGE_CACHE, event));
    return;
  }

  if (isCacheableAsset(event.request)) {
    if (isAdminTranscriptionsAsset(url.pathname)) {
      event.respondWith(
        fetch(event.request).catch(function () {
          return caches.open(ASSET_CACHE).then(function (cache) {
            return cache.match(event.request);
          });
        })
      );
      return;
    }
    event.respondWith(staleWhileRevalidate(event.request, ASSET_CACHE, event));
  }
});
