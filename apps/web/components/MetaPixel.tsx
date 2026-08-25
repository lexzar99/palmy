"use client";

import { useEffect } from "react";

import { hasMarketingConsent, subscribeConsent } from "@/lib/cookieConsent";

// Meta Pixel-ID:n är publik konfigurationsdata. Vercel kan överstyra den med
// NEXT_PUBLIC_META_PIXEL_ID utan att koden behöver ändras.
const PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID || "888461340780014";

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
    // Pixeln är en marknadsföringscookie och får bara laddas när kunden har
    // godkänt det i cookierutan. Integritetspolicyn lovar det, och utan
    // samtycke sätts inget Meta-skript alls.
    const start = () => {
      if (!hasMarketingConsent()) return;
      ensurePixel();
    };

    start();

    const onLead = () => {
      if (!hasMarketingConsent()) return;
      ensurePixel();
      window.fbq?.("track", "Lead");
    };

    // Startar pixeln i efterhand om kunden godkänner cookies senare i besöket.
    const unsubscribe = subscribeConsent(start);
    window.addEventListener("viaeats:meta-lead", onLead);
    return () => {
      unsubscribe();
      window.removeEventListener("viaeats:meta-lead", onLead);
    };
  }, []);

  return null;
}
