// 電波がなくても起動できるよう、アプリ本体をキャッシュする Service Worker。
//
// 注意: 同じドメイン（cool-fat-ryota.github.io）に別のアプリが同居している。
// 後片付けは必ず自分の接頭辞のものだけにすること（caches.keys() を全部消さない）。

const CACHE_PREFIX = "instant-english-";
const CACHE = `${CACHE_PREFIX}v1`;

const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./manifest.webmanifest",
  "./js/app.js",
  "./js/match.js",
  "./js/session.js",
  "./js/speech.js",
  "./js/srs.js",
  "./js/store.js",
  "./js/data/phrases.js",
  "./js/data/decks.js",
  "./icons/icon.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon.png",
  "./icons/favicon-32.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE))
      .then((stale) => Promise.all(stale.map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  // 音声認識など、ほかのサイトへの通信には手を出さない
  if (new URL(request.url).origin !== self.location.origin) return;

  // 画面の読み込みは、まずネットワーク（更新の反映）、だめならキャッシュ
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put("./index.html", copy));
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
