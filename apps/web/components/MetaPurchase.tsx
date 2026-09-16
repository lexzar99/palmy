"use client";
import { useEffect } from 'react';
import { subscribeConsent } from '@/lib/cookieConsent';
import { trackMetaPurchase } from '@/lib/metaEvents';
import { META_READY_EVENT } from '@/lib/metaPixelRuntime';

/** Underlaget kommer från orderns åtkomstskyddade, betalverifierade API-svar. */
export default function MetaPurchase({ receipt }: { receipt?: { orderId: string; eventId: string; value: number; expiresAt: number } | null }) {
  useEffect(() => {
    if (!receipt || receipt.eventId !== `Purchase:${receipt.orderId}`) return;
    const send = () => { if (receipt.expiresAt > Date.now()) trackMetaPurchase(receipt); };
    send();
    const unsubscribe = subscribeConsent(send);
    window.addEventListener(META_READY_EVENT, send);
    return () => { unsubscribe(); window.removeEventListener(META_READY_EVENT, send); };
  }, [receipt?.orderId, receipt?.eventId, receipt?.value, receipt?.expiresAt]);
  return null;
}
