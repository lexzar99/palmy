/* Minimal service worker to enable PWA installation.
 * We don't do offline caching yet; this is intentionally lightweight.
 */
self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Removed broken fetch interceptor completely.

