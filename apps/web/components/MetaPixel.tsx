"use client";

import { useEffect } from "react";

import { hasMarketingConsent, subscribeConsent } from "@/lib/cookieConsent";

// Meta Pixel-ID:n är publik konfigurationsdata. Vercel kan överstyra den med
// NEXT_PUBLIC_META_PIXEL_ID utan att koden behöver ändras.
const PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID || "1560510969096668";

import { ensureMetaPixel } from "@/lib/metaPixelRuntime";

export default function MetaPixel() {
  useEffect(() => {
    // Pixeln är en marknadsföringscookie och får bara laddas när kunden har
    // godkänt det i cookierutan. Integritetspolicyn lovar det, och utan
    // samtycke sätts inget Meta-skript alls.
    const start = () => {
      if (!hasMarketingConsent()) return;
      ensureMetaPixel(PIXEL_ID);
    };

    start();

    const onLead = () => {
      if (!hasMarketingConsent()) return;
      ensureMetaPixel(PIXEL_ID);
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
