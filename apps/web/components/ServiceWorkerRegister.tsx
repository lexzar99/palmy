"use client";

import { useEffect } from "react";

export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    
    // Unregister any existing service workers that might be aggressively caching old CSS/HTML hashes
    navigator.serviceWorker.getRegistrations().then(registrations => {
      for (const registration of registrations) {
        registration.unregister().then(unregistered => {
          if (unregistered) console.log("Unregistered rogue service worker.");
        });
      }
    });
  }, []);

  return null;
}

