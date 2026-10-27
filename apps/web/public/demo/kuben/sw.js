// Enkel service worker: sidan går att installera och startsidan öppnas även utan nät.
const CACHE = "kuben-v1";
const SHELL = ["/demo/kuben", "/demo/kuben/meny", "/demo/kuben/manifest.webmanifest", "/demo/kuben/img/icon-192.png"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((x) => x !== CACHE).map((x) => caches.delete(x)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin || req.url.endsWith(".mp4")) return;
  // Nätet först, så nya versioner syns direkt. Cachen används bara när nätet saknas.
  e.respondWith(fetch(req).then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); return res; })
    .catch(() => caches.match(req).then((r) => r || (req.mode === "navigate" ? caches.match("/demo/kuben") : undefined))));
});
