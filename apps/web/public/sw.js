/* Service worker för Delívera PWA.
 *
 * Mål: göra appen installbar (Chrome kräver en fetch-handler) och ge ett
 * lättviktigt offline-skal — UTAN att riskera stale/trasigt innehåll:
 *   - Endast same-origin GET hanteras. POST/auth/API rörs aldrig.
 *   - Navigeringar (HTML): network-first → alltid färskt, faller tillbaka på
 *     cache bara om man är offline.
 *   - Statiska byggassets (/_next/, bilder, fonter): stale-while-revalidate.
 */
const CACHE = "delivera-cache-v1";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;

  // Rör aldrig icke-GET (POST/PUT...) eller cross-origin eller API/auth.
  if (req.method !== "GET") return;
  let url;
  try {
    url = new URL(req.url);
  } catch {
    return;
  }
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  // Navigeringar: network-first → färskt innehåll, offline-fallback till cache.
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          return fresh;
        } catch {
          const cache = await caches.open(CACHE);
          const cached = await cache.match(req);
          return cached || (await cache.match("/")) || Response.error();
        }
      })()
    );
    return;
  }

  // Statiska assets: stale-while-revalidate.
  const dest = req.destination;
  const isStatic =
    url.pathname.startsWith("/_next/") ||
    dest === "style" ||
    dest === "script" ||
    dest === "image" ||
    dest === "font";

  if (isStatic) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        const cached = await cache.match(req);
        const network = fetch(req)
          .then((res) => {
            if (res && res.ok && res.type === "basic") cache.put(req, res.clone());
            return res;
          })
          .catch(() => cached);
        return cached || network;
      })()
    );
  }
});

// ── Web push: orderstatus-notiser ("Din mat är på väg") ─────────────────────
// Payload sätts av API:t (lib/customerPush.ts): { title, body, tag, url }.
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Delívera", body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "Delívera";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      tag: data.tag || "delivera-order",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { url: data.url || "/orders" },
      renotify: true,
    })
  );
});

// Klick på notisen → fokusera befintlig flik på ordersidan, annars öppna ny.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/orders";
  event.waitUntil(
    (async () => {
      const all = await clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of all) {
        if (client.url.includes(url) && "focus" in client) return client.focus();
      }
      return clients.openWindow(url);
    })()
  );
});
