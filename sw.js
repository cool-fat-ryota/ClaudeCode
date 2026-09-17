/* あわ貯金 — オフラインでも開けるようにする */
var CACHE = 'awa-chokin-v1';
var ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png',
  './icons/apple-touch-180.png',
  './icons/favicon-32.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE)
      .then(function (c) { return c.addAll(ASSETS); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        return k === CACHE ? null : caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var sameOrigin = new URL(req.url).origin === self.location.origin;

  e.respondWith(
    caches.match(req).then(function (hit) {
      if (hit) return hit;
      return fetch(req).then(function (res) {
        // フォントなど別ドメインのものも取れたら保存しておく
        if (res && (res.ok || res.type === 'opaque')) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); });
        }
        return res;
      }).catch(function () {
        if (sameOrigin && req.mode === 'navigate') {
          return caches.match('./index.html').then(function (page) {
            return page || Response.error();
          });
        }
        return Response.error();
      });
    })
  );
});
