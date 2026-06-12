"use client";

// Kund-web-push: prenumerera enheten på orderstatus-notiser för EN order.
// Hela kedjan är feature-gated: saknar servern VAPID-nycklar (404 på
// /api/push/public-key) eller saknar webbläsaren stöd visas ingen toggle alls.
import axios from "axios";

let cachedKey: Promise<string | null> | null = null;

export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/** Hämta VAPID-public-key (cachas). null = push avstängt på servern. */
export function getPushPublicKey(): Promise<string | null> {
  if (!cachedKey) {
    cachedKey = axios
      .get("/api/push/public-key")
      .then((r) => (typeof r.data?.key === "string" ? r.data.key : null))
      .catch(() => null);
  }
  return cachedKey;
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(b64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

/**
 * Prenumerera på push för en order. Returnerar true vid lyckad prenumeration.
 * Frågar om notis-permission vid behov (måste kallas från en user gesture).
 */
export async function subscribeOrderPush(orderId: string): Promise<boolean> {
  try {
    if (!isPushSupported() || !orderId) return false;
    const key = await getPushPublicKey();
    if (!key) return false;

    const permission = await Notification.requestPermission();
    if (permission !== "granted") return false;

    const registration = await navigator.serviceWorker.ready;
    const subscription =
      (await registration.pushManager.getSubscription()) ||
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key) as BufferSource,
      }));

    await axios.post("/api/push/subscribe", { orderId, subscription: subscription.toJSON() });
    try { localStorage.setItem(`push_order_${orderId}`, "1"); } catch { /* noop */ }
    return true;
  } catch {
    return false;
  }
}

export function hasOrderPush(orderId: string): boolean {
  try {
    return localStorage.getItem(`push_order_${orderId}`) === "1";
  } catch {
    return false;
  }
}
