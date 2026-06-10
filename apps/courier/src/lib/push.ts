// Web Push-klient: ber om notis-tillstånd och registrerar enhetens push-
// subscription mot backend. All logik är tyst no-op om webbläsaren saknar
// stöd, tillstånd inte getts, eller servern saknar VAPID-nycklar — appen
// fungerar ändå via polling. På iOS krävs att PWA:n lagts på hemskärmen.
import { api } from "./api";

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  // Explicit ArrayBuffer-backing → Uint8Array<ArrayBuffer>, vilket
  // applicationServerKey (BufferSource) accepterar utan cast.
  const arr = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export function pushSupported(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

/** Be om notis-tillstånd. MÅSTE anropas från en user-gesture (t.ex. Starta pass). */
export async function requestPushPermission(): Promise<boolean> {
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  try {
    return (await Notification.requestPermission()) === "granted";
  } catch {
    return false;
  }
}

/** Registrera (eller åter-synka) push-subscription mot backend. Idempotent. */
export async function syncPushSubscription(): Promise<void> {
  try {
    if (!pushSupported() || Notification.permission !== "granted") return;
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      const { key } = await api.getPushPublicKey();
      if (!key) return; // ingen VAPID på servern → push av
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key),
      });
    }
    await api.savePushSubscription(sub.toJSON());
  } catch (e) {
    console.warn("[push] kunde inte synka subscription", e);
  }
}
