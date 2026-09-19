// オフラインでも起動できるようにアプリ本体をキャッシュする Service Worker。

const CACHE_PREFIX = "karaoke-repertory-";
const CACHE = `${CACHE_PREFIX}v3`;
// ジャケット画像（他のサイトの画像）は別のキャッシュに入れ、版が上がっても消さない
const ARTWORK_CACHE = `${CACHE_PREFIX}artwork`;
const ARTWORK_HOSTS = ["i.ytimg.com"];

const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./manifest.webmanifest",
  "./js/app.js",
  "./js/model.js",
  "./js/store.js",
  "./js/text.js",
  "./js/youtube.js",
  "./js/artist-seed.js",
  "./js/artwork.js",
  "./js/image.js",
  "./fonts/bebas-neue-latin.woff2",
  "./icons/icon.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      // 同じドメインに別のアプリが同居していることがあるので、自分の古い版だけを消す
      .then((keys) => keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE && key !== ARTWORK_CACHE))
      .then((stale) => Promise.all(stale.map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  if (url.origin !== self.location.origin) {
    // ジャケット画像だけは、電波がなくても表示できるように取っておく
    const isArtwork = ARTWORK_HOSTS.includes(url.hostname) || url.hostname.endsWith("mzstatic.com");
    if (!isArtwork) return; // YouTube API などは素通し
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            // 他のサイトの画像は中身を読めない（opaque）が、キャッシュには入れられる
            const copy = response.clone();
            caches.open(ARTWORK_CACHE).then((cache) => cache.put(request, copy));
            return response;
          })
      )
    );
    return;
  }

  // 画面の読み込みは、まずネットワーク（更新の反映）、だめならキャッシュ
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          caches.open(CACHE).then((cache) => cache.put("./index.html", response.clone()));
          return response;
        })
        .catch(() => caches.match("./index.html", { ignoreSearch: true }))
    );
    return;
  }

  // それ以外はキャッシュ優先。裏で新しい版を取りに行く。
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response.ok) caches.open(CACHE).then((cache) => cache.put(request, response.clone()));
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
