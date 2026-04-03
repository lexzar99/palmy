"use client";

import { useEffect } from "react";

export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    // Register a minimal SW so the app becomes installable as a PWA.
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Ignore; PWA install prompt will simply not appear.
    });
  }, []);

  return null;
}

