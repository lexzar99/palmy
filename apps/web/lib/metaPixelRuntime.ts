"use client";
import { hasMarketingConsent } from "@/lib/cookieConsent";
export type Fbq = ((...args: unknown[]) => void) & {
  loaded?: boolean; queue?: unknown[][]; callMethod?: (...args: unknown[]) => void;
  push?: Fbq; version?: string;
};
declare global { interface Window { fbq?: Fbq; _fbq?: Fbq; viaeatsMetaInitialized?: boolean } }
export const META_READY_EVENT = 'viaeats:meta-ready';
export function ensureMetaPixel(pixelId: string) {
  if (typeof window === 'undefined' || !pixelId || !hasMarketingConsent()) return;
  if (!window.fbq) {
    const fbq = ((...args: unknown[]) => {
      // Efter scriptladdning måste Metas dispatcher anropas, inte kön.
      if (fbq.callMethod) fbq.callMethod.apply(fbq, args);
      else fbq.queue!.push(args);
    }) as Fbq;
    fbq.queue = []; fbq.loaded = true; fbq.version = '2.0'; fbq.push = fbq;
    window.fbq = fbq; window._fbq = fbq;
  }
  if (!document.querySelector('script[data-viaeats-meta-pixel="true"]')) {
    const script = document.createElement('script'); script.async = true;
    script.src = 'https://connect.facebook.net/en_US/fbevents.js';
    script.dataset.viaeatsMetaPixel = 'true';
    script.onload = () => window.dispatchEvent(new Event(META_READY_EVENT));
    script.onerror = () => { script.remove(); };
    document.head.appendChild(script);
  }
  if (!window.viaeatsMetaInitialized) {
    window.fbq('init', pixelId); window.fbq('track', 'PageView');
    window.viaeatsMetaInitialized = true;
  }
  window.dispatchEvent(new Event(META_READY_EVENT));
}
