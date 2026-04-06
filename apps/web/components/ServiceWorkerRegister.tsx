"use client";

import { useEffect } from "react";

export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    
    const unregisterAll = async () => {
      try {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const registration of registrations) {
          await registration.unregister();
        }
      } catch (err) {
        console.error("SW Unregister Error:", err);
      }
    };

    // Delay registration/unregistration to prioritize main thread in Safari
    if (document.readyState === "complete") {
      unregisterAll();
    } else {
      window.addEventListener("load", unregisterAll);
      return () => window.removeEventListener("load", unregisterAll);
    }
  }, []);

  return null;
}

