"use client";

import { useEffect } from "react";

/**
 * SupportChat — laddar Tawk.to-widget på alla sidor i web.
 * Tawk.to är gratis (helt obegränsat, 24/7 chat-stöd) och kräver bara
 * NEXT_PUBLIC_TAWK_PROPERTY_ID + NEXT_PUBLIC_TAWK_WIDGET_ID i env.
 *
 * Property/widget-ID hittas i Tawk dashboard → Administration → Channels →
 * Chat Widget. Skapa konto gratis på tawk.to om inte gjort än.
 */
export default function SupportChat() {
  useEffect(() => {
    const propertyId = process.env.NEXT_PUBLIC_TAWK_PROPERTY_ID;
    const widgetId = process.env.NEXT_PUBLIC_TAWK_WIDGET_ID;

    if (!propertyId || !widgetId) return; // Tawk ej konfigurerat
    if (typeof window === "undefined") return;
    // Undvik dubbel-injektion
    if ((window as any).Tawk_API) return;

    (window as any).Tawk_API = (window as any).Tawk_API || {};
    (window as any).Tawk_LoadStart = new Date();

    const s1 = document.createElement("script");
    s1.async = true;
    s1.src = `https://embed.tawk.to/${propertyId}/${widgetId}`;
    s1.charset = "UTF-8";
    s1.setAttribute("crossorigin", "*");
    const s0 = document.getElementsByTagName("script")[0];
    s0.parentNode?.insertBefore(s1, s0);
  }, []);

  return null;
}

/**
 * openSupportChatWithOrder — anropas från order-tracking-sidan för att
 * öppna chatten med ett pre-fyllt order-nummer som första meddelande.
 *
 * Användning:
 *   <button onClick={() => openSupportChatWithOrder(order.orderNumber, order.id)}>
 *     Kontakta support
 *   </button>
 */
export function openSupportChatWithOrder(orderNumber: string, orderId?: string) {
  if (typeof window === "undefined") return;
  const Tawk = (window as any).Tawk_API;
  if (!Tawk) {
    // Fallback: mailto med pre-fylld order-info
    window.location.href = `mailto:info@matgo.se?subject=${encodeURIComponent(`Fråga om order ${orderNumber}`)}&body=${encodeURIComponent(`Hej!\n\nJag har en fråga om beställning ${orderNumber}.\n\n`)}`;
    return;
  }

  // Sätt attributes så support-agent ser order-info direkt
  try {
    Tawk.setAttributes?.(
      {
        order_number: orderNumber,
        order_id: orderId || "",
      },
      (err: unknown) => {
        if (err) console.warn("[tawk] setAttributes failed:", err);
      },
    );
  } catch (e) {
    console.warn("[tawk] setAttributes threw:", e);
  }

  // Öppna chat-fönstret
  try {
    Tawk.maximize?.();
  } catch (e) {
    console.warn("[tawk] maximize threw:", e);
  }
}
