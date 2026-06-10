/// <reference lib="webworker" />
// Custom service worker (vite-plugin-pwa: injectManifest).
// Två jobb: (1) precachea app-shellen så PWA:n är installerbar/offline-tålig,
// (2) ta emot Web Push och visa notis när en ny order dyker upp — ÄVEN när
// appen är helt stängd (det in-app-ljudet i notify.ts inte klarar).
import { precacheAndRoute } from "workbox-precaching";

declare const self: ServiceWorkerGlobalScope;

precacheAndRoute(self.__WB_MANIFEST);

// Aktivera den nya SW:n direkt (autoUpdate) så push-handlern alltid är färsk.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

interface PushData {
  title: string;
  body: string;
  tag?: string;
  url?: string;
}

self.addEventListener("push", (event) => {
  let data: PushData = { title: "Ny order 🛵", body: "Ny leverans tillgänglig", tag: "delivera-new-order", url: "/" };
  try {
    if (event.data) data = { ...data, ...(event.data.json() as Partial<PushData>) };
  } catch {
    /* icke-JSON payload — kör defaults */
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      tag: data.tag,
      icon: "/icon.svg",
      badge: "/icon.svg",
      requireInteraction: true,
      data: { url: data.url || "/" },
      // @ts-expect-error vibrate finns i Notification-spec men saknas i TS-lib
      vibrate: [120, 60, 120],
    }),
  );
});

// Klick på notisen → fokusera ev. öppen flik (och navigera dit), annars öppna ny.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of all) {
        if ("focus" in client) {
          try {
            await client.navigate(url);
          } catch {
            /* navigate kan blockas cross-origin — ignorera */
          }
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    })(),
  );
});
