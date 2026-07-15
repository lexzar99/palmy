"use client";

// Kund-web-push: prenumerera enheten på orderstatus-notiser för EN order.
// Hela kedjan är feature-gated: saknar servern VAPID-nycklar (404 på
// /api/push/public-key) eller saknar webbläsaren stöd visas ingen toggle alls.
import axios from "axios";

let cachedKey: Promise<string | null> | null = null;
const PUSH_STATE_MESSAGE = "VIAEATS_PUSH_STATE";
const PUSH_STATE_CACHE = "viaeats-push-state-v1";
const PUSH_DISABLED_KEY = "/__viaeats_push_disabled__";

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

/** Exchange the account/HttpOnly order session for a five-minute proof. */
export async function getOrderAccessProof(orderId: string): Promise<string | null> {
  try {
    if (!orderId) return null;
    const response = await axios.post(`/api/platform/orders/${orderId}/access-proof`, {});
    return typeof response.data?.proof === "string" ? response.data.proof : null;
  } catch {
    return null;
  }
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(b64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

async function setServiceWorkerPushEnabled(enabled: boolean): Promise<void> {
  if (!("serviceWorker" in navigator)) return;
  // Window and service worker share Cache Storage. Await this write so logout
  // is fail-closed before any network revocation or navigation can race it.
  if ("caches" in window) {
    const cache = await window.caches.open(PUSH_STATE_CACHE);
    if (enabled) await cache.delete(PUSH_DISABLED_KEY);
    else await cache.put(PUSH_DISABLED_KEY, new Response("1"));
  }
  const registration = await navigator.serviceWorker.getRegistration().catch(() => undefined);
  const worker = registration?.active || navigator.serviceWorker.controller;
  worker?.postMessage({ type: PUSH_STATE_MESSAGE, enabled });
}

/**
 * Disable display first, then revoke the exact browser subscription at both
 * ViaEats and the push service. The service-worker marker is durable, so a
 * stale server row cannot surface another customer's order on a shared device
 * after logout even when the network request itself fails.
 */
export async function unsubscribeWebPushForLogout(): Promise<void> {
  if (!isPushSupported()) return;
  await setServiceWorkerPushEnabled(false).catch(() => {});
  const registration = await navigator.serviceWorker.getRegistration().catch(() => undefined);
  const visibleNotifications = registration
    ? await registration.getNotifications().catch(() => [])
    : [];
  for (const notification of visibleNotifications) notification.close();
  const subscription = registration
    ? await registration.pushManager.getSubscription().catch(() => null)
    : null;
  if (!subscription) return;

  await axios.post("/api/platform/push/unsubscribe", {
    subscription: subscription.toJSON(),
  }, { timeout: 3_000 }).catch(() => null);
  await subscription.unsubscribe().catch(() => false);
}

/**
 * Prenumerera på push för en order. Returnerar true vid lyckad prenumeration.
 * Frågar om notis-permission vid behov (måste kallas från en user gesture).
 */
export async function subscribeOrderPush(
  orderId: string,
): Promise<boolean> {
  try {
    if (!isPushSupported() || !orderId) return false;
    const key = await getPushPublicKey();
    if (!key) return false;
    const proof = await getOrderAccessProof(orderId);
    if (!proof) return false;

    const permission = await Notification.requestPermission();
    if (permission !== "granted") return false;

    const registration = await navigator.serviceWorker.ready;
    const subscription =
      (await registration.pushManager.getSubscription()) ||
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key) as BufferSource,
      }));

    const response = await axios.post("/api/platform/push/subscribe", {
      orderId,
      proof,
      subscription: subscription.toJSON(),
    });
    await setServiceWorkerPushEnabled(true).catch(() => {});
    const installationId =
      typeof response.data?.installationId === "string"
        ? response.data.installationId
        : null;
    try {
      localStorage.setItem(
        `push_order_${orderId}`,
        JSON.stringify({ enabled: true, installationId }),
      );
    } catch { /* noop */ }
    return true;
  } catch {
    return false;
  }
}

export function hasOrderPush(orderId: string): boolean {
  try {
    const value = localStorage.getItem(`push_order_${orderId}`);
    if (value === "1") return true;
    if (!value) return false;
    return JSON.parse(value)?.enabled === true;
  } catch {
    return false;
  }
}
