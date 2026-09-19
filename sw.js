/*
 * 入口ページ（アプリ一覧）用の Service Worker。
 *
 * ここは /ClaudeCode/ 全体がスコープになるため、各アプリのフォルダにある
 * ファイルには一切手を出さない。入口ページ自身のファイルだけを扱う。
 * アプリごとの Service Worker は、それぞれのフォルダ側で登録される。
 */

const CACHE = "claudecode-hub-v1";

const HUB_FILES = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icons/icon.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon.png",
  "./icons/favicon-32.png",
];

const HUB_URLS = new Set(HUB_FILES.map((file) => new URL(file, self.location.href).href));

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(HUB_FILES)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // 古い版の入口ページのキャッシュを片付ける
      for (const key of await caches.keys()) {
        if (key.startsWith("claudecode-hub-") && key !== CACHE) await caches.delete(key);
      }
      // 以前ここに「あわ貯金」があった頃に、このページの場所がキャッシュされている。
      // アプリ自身のキャッシュは消さずに、その2件だけを取り除く。
      if (await caches.has("awa-chokin-v1")) {
        const old = await caches.open("awa-chokin-v1");
        await old.delete(new URL("./", self.location.href).href);
        await old.delete(new URL("./index.html", self.location.href).href);
      }
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  // 入口ページ自身のファイル以外は、そのままネットワークに任せる
  const target = request.mode === "navigate" ? new URL(request.url) : new URL(request.url);
  target.search = "";
  target.hash = "";
  if (!HUB_URLS.has(target.href)) return;

  // 更新をすぐ反映したいので、まずネットワーク。だめならキャッシュ。
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request, { ignoreSearch: true }).then((hit) => hit || Response.error()))
  );
});
