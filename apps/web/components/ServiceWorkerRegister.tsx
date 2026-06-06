"use client";

import { useEffect } from "react";

/**
 * Registrerar service workern (/sw.js) så appen blir en fullvärdig, installbar
 * PWA (manifest + SW + fetch-handler = Chrome install-prompt + offline-skal).
 * Registreringen fördröjs till `load` så main-thread prioriteras i Safari.
 */
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    const register = async () => {
      try {
        await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      } catch (err) {
        console.error("SW registration failed:", err);
      }
    };

    if (document.readyState === "complete") {
      register();
    } else {
      window.addEventListener("load", register);
      return () => window.removeEventListener("load", register);
    }
  }, []);

  return null;
}
