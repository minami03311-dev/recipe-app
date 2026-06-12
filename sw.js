// レシピ帖 Service Worker
// 方針：オンライン時は常に最新を取得（network-first）、オフライン時だけ保存版を使う。
// これで「更新したのにスマホに反映されない」問題を防ぐ。
const CACHE = "recipe-cho-v2";
const ASSETS = [
  "./",
  "./index.html",
  "./css/styles.css",
  "./js/app.js",
  "./js/config.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  // 自分のサイト以外（Supabase・Googleなど）の通信は素通り
  if (e.request.method !== "GET" || url.origin !== location.origin) return;

  // network-first：まずネットから最新を取り、取れたらキャッシュも更新。
  // 取れない（オフライン）ときだけ保存版を返す。
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() =>
        caches.match(e.request).then((hit) => hit || caches.match("./index.html"))
      )
  );
});
