"use client";

import { useEffect } from "react";

// Meta Pixel-ID:n är publik konfigurationsdata. Vercel kan överstyra den med
// NEXT_PUBLIC_META_PIXEL_ID utan att koden behöver ändras.
const PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID || "1850021916382355";

type Fbq = ((...args: unknown[]) => void) & { loaded?: boolean; queue?: unknown[] };

declare global {
  interface Window {
    fbq?: Fbq;
    _fbq?: Fbq;
  }
}

function ensurePixel() {
  if (typeof window === "undefined" || !PIXEL_ID) return;

  if (!window.fbq) {
    const fbq = ((...args: unknown[]) => {
      if (fbq.queue) fbq.queue.push(args);
    }) as Fbq;
    fbq.queue = [];
    fbq.loaded = true;
    window.fbq = fbq;
    window._fbq = fbq;
  }

  if (!document.querySelector('script[data-viaeats-meta-pixel="true"]')) {
    const script = document.createElement("script");
    script.async = true;
    script.src = "https://connect.facebook.net/en_US/fbevents.js";
    script.dataset.viaeatsMetaPixel = "true";
    document.head.appendChild(script);
  }

  window.fbq("init", PIXEL_ID);
  window.fbq("track", "PageView");
}

export default function MetaPixel() {
  useEffect(() => {
    // Lead-eventet skickas först efter att personen uttryckligen godkänt
    // manuell kontakt i launchformuläret. Det gör att vi inte spårar besökare
    // som bara avvisat cookies eller aldrig skickat formuläret.
    const onLead = () => {
      ensurePixel();
      window.fbq?.("track", "Lead");
    };

    window.addEventListener("viaeats:meta-lead", onLead);
    return () => window.removeEventListener("viaeats:meta-lead", onLead);
  }, []);

  return null;
}

