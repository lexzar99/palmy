// Pizzeria Roma – enkel offline-cache för sajtskalet. Beställningen (iframe från viaeats) cachas aldrig.
const CACHE = 'roma-v3';
const ASSETS = [
  '/demo/pizzeria-roma/index.html',
  '/demo/pizzeria-roma/meny.html',
  '/demo/pizzeria-roma/manifest.webmanifest',
  '/demo/pizzeria-roma/menu-data.json',
  '/demo/pizzeria-roma/img/logo.svg',
  '/demo/pizzeria-roma/img/photos/pizza-2-700.webp',
  '/demo/pizzeria-roma/img/icon-192.png',
];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
  self.skipWaiting();
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('roma-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin || !url.pathname.startsWith('/demo/pizzeria-roma/')) return;
  if (e.request.mode === 'navigate') {
    // Nätet först så menyn och platsen alltid är färska; cachen bara när nätet saknas.
    e.respondWith(
      fetch(e.request)
        .then((r) => { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return r; })
        .catch(() => caches.match(e.request).then((r) => r || caches.match('/demo/pizzeria-roma/index.html'))),
    );
    return;
  }
  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request).then((r) => {
      if (r.ok && url.pathname.startsWith('/demo/pizzeria-roma/img/')) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
      return r;
    })),
  );
});
