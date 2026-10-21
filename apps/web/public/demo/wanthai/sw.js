// Wanthai – enkel offline-cache för sajtskalet. Beställningen (iframe från viaeats) cachas aldrig.
const CACHE = 'wanthai-v4';
const ASSETS = [
  '/demo/wanthai',
  '/demo/wanthai/meny',
  '/demo/wanthai/manifest.webmanifest',
  '/demo/wanthai/img/logo-ink.png',
  '/demo/wanthai/img/disc-pad-kra-pao.webp',
  '/demo/wanthai/img/icon-192.png',
];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
  self.skipWaiting();
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('wanthai-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin || !(url.pathname === '/demo/wanthai' || url.pathname.startsWith('/demo/wanthai/'))) return;
  if (e.request.mode === 'navigate') {
    // Nätet först så menyn och platsen alltid är färska; cachen bara när nätet saknas.
    e.respondWith(
      fetch(e.request)
        .then((r) => { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return r; })
        .catch(() => caches.match(e.request).then((r) => r || caches.match('/demo/wanthai'))),
    );
    return;
  }
  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request).then((r) => {
      if (r.ok && url.pathname.startsWith('/demo/wanthai/img/')) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
      return r;
    })),
  );
});
