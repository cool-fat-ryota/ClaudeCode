/*
 * 後片付け用の Service Worker。
 *
 * 以前このフォルダ（/ClaudeCode/）の直下に「あわ貯金」があった頃の Service Worker が
 * 端末に残っていると、移動後のページより古いキャッシュが優先されてしまう。
 * 同じ場所に置いたこのファイルが更新として読み込まれ、古い登録とキャッシュを消す。
 * 各アプリの Service Worker は、それぞれのフォルダ側で改めて登録される。
 */

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key.startsWith("awa-")) await caches.delete(key);
      }
      await self.registration.unregister();
      for (const client of await self.clients.matchAll({ type: "window" })) {
        client.navigate(client.url).catch(() => {});
      }
    })()
  );
});
