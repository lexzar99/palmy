// Wanthai: offline-skal. Sidorna hämtas nätet först, byggda filer och bilder cachen först.
// Beställningen (iframe från viaeats) och API-anropen cachas aldrig.
const CACHE = "wanthai-v1";
const SHELL = ["/demo/wanthai-3d", "/demo/wanthai-3d/meny", "/demo/wanthai-3d/manifest.webmanifest", "/demo/wanthai-3d/img/hero-2400.jpg", "/demo/wanthai-3d/img/hero-portrait.jpg", "/demo/wanthai-3d/img/logo-cream.png", "/demo/wanthai-3d/img/icon-192.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
  self.skipWaiting();
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k.startsWith("wanthai-") && k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== self.location.origin) return;
  if (e.request.mode === "navigate") {
    e.respondWith(fetch(e.request)
      .then((r) => { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return r; })
      .catch(() => caches.match(e.request).then((r) => r || caches.match("/demo/wanthai-3d"))));
    return;
  }
  if (/^\/(assets|img|model)\//.test(url.pathname)) {
    e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request).then((r) => {
      if (r.ok) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
      return r;
    })));
  }
});
