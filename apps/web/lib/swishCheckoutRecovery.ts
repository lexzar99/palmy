export type PendingPaymentProvider = "mollie" | "swish" | "stripe" | "adyen";

export type PersistedSwishCheckout = {
  orderId: string;
  appUrl: string;
  qrCode: string;
};

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export type AbandonOutcome = "paid" | "terminal" | "pending";

export const PENDING_PAYMENT_PROVIDER_KEY = "viaeats.pending-payment.provider.v1";
export const PENDING_SWISH_CHECKOUT_KEY = "viaeats.pending-payment.swish.v1";

/**
 * Swish recommends letting the callback arrive before falling back to GET.
 * The first GET is therefore scheduled after an exact minimum of ten seconds;
 * later requests use 20/40/80 second backoff with bounded jitter.
 */
export const SWISH_POLLING_POLICY = Object.freeze({
  pollAttempts: 4,
  initialPollDelayMs: 10_000,
  pollBackoffBaseMs: 20_000,
  pollMaxDelayMs: 80_000,
  pollJitterRatio: 0.2,
});

export function isHandheldPaymentDevice(input: {
  userAgent: string;
  platform?: string;
  maxTouchPoints?: number;
}): boolean {
  if (/iphone|ipad|ipod|android/i.test(input.userAgent)) return true;
  // iPadOS 13+ may identify itself as desktop Safari (MacIntel). Touch-point
  // capability is the stable discriminator from a real Mac in that mode.
  return input.platform === "MacIntel" && (input.maxTouchPoints ?? 0) > 1;
}

export function swishBackoffDelayMs(
  completedAttempt: number,
  randomValue = Math.random(),
  jitterRatio: number = SWISH_POLLING_POLICY.pollJitterRatio,
): number {
  const ratio = Math.max(0, Math.min(jitterRatio, 0.5));
  const baseDelay = Math.min(
    SWISH_POLLING_POLICY.pollBackoffBaseMs * (2 ** Math.max(0, completedAttempt)),
    SWISH_POLLING_POLICY.pollMaxDelayMs,
  );
  const normalizedRandom = Math.max(0, Math.min(randomValue, 1));
  const jitter = baseDelay * ratio * ((normalizedRandom * 2) - 1);
  return Math.max(0, Math.round(baseDelay + jitter));
}

export function classifyAbandonResponse(data: unknown): AbandonOutcome {
  const response = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  if (response.paid === true) return "paid";
  if (response.failed === true || response.alreadyGone === true) return "terminal";
  // `pending`, `preserved`, an unrecognized/skipped state, and success:false
  // all retain the order proof until a separate status check proves terminal.
  return "pending";
}

export function classifyPaymentStatus(value: unknown): AbandonOutcome {
  const status = String(value || "").toUpperCase();
  if (status === "PAID") return "paid";
  if ([
    "FAILED",
    "DECLINED",
    "ERROR",
    "EXPIRED",
    "CANCELED",
    "CANCELLED",
  ].includes(status)) {
    return "terminal";
  }
  return "pending";
}

export function readPendingPaymentProvider(storage: StorageLike): PendingPaymentProvider | null {
  const provider = String(storage.getItem(PENDING_PAYMENT_PROVIDER_KEY) || "").toLowerCase();
  return ["mollie", "swish", "stripe", "adyen"].includes(provider)
    ? provider as PendingPaymentProvider
    : null;
}

export function writePendingPaymentProvider(
  storage: StorageLike,
  provider: PendingPaymentProvider,
): void {
  storage.setItem(PENDING_PAYMENT_PROVIDER_KEY, provider);
}

export function readPersistedSwishCheckout(
  storage: StorageLike,
  expectedOrderId?: string,
): PersistedSwishCheckout | null {
  try {
    const value = JSON.parse(storage.getItem(PENDING_SWISH_CHECKOUT_KEY) || "null") as Partial<PersistedSwishCheckout> | null;
    if (!value || typeof value !== "object") return null;
    if (typeof value.orderId !== "string" || !value.orderId) return null;
    if (expectedOrderId && value.orderId !== expectedOrderId) return null;
    if (typeof value.appUrl !== "string" || !value.appUrl.startsWith("swish://")) return null;
    if (typeof value.qrCode !== "string" || !value.qrCode.startsWith("data:image/")) return null;
    const appUrl = persistableSwishAppUrl(value.appUrl);
    if (!appUrl) return null;
    return { orderId: value.orderId, appUrl, qrCode: value.qrCode };
  } catch {
    return null;
  }
}

/**
 * The initial app-switch URL contains a short-lived one-time resume capability
 * so another browser can establish an HttpOnly order session after Swish. That
 * bearer must never become durable JavaScript storage. A reload in the same
 * browser already has the HttpOnly session, so its persisted fallback link can
 * safely omit only `payment_resume` while retaining order/provider return state.
 */
export function persistableSwishAppUrl(appUrl: string): string | null {
  try {
    const url = new URL(appUrl);
    if (url.protocol !== "swish:" || url.hostname !== "paymentrequest") return null;
    const encodedCallback = url.searchParams.get("callbackurl");
    if (!encodedCallback) return null;

    // URLSearchParams decoded the outer browser layer. Decode the remaining
    // layer, remove the bearer, then set one encoded layer back; URLSearchParams
    // supplies the second encoding when serializing the custom-scheme URL.
    const callback = new URL(decodeURIComponent(encodedCallback));
    callback.searchParams.delete("payment_resume");
    url.searchParams.set("callbackurl", encodeURIComponent(callback.toString()));
    const sanitized = url.toString();
    return sanitized.includes("payment_resume") ? null : sanitized;
  } catch {
    return null;
  }
}

export function writePersistedSwishCheckout(
  storage: StorageLike,
  checkout: PersistedSwishCheckout,
): void {
  const appUrl = persistableSwishAppUrl(checkout.appUrl);
  if (!appUrl) {
    storage.removeItem(PENDING_SWISH_CHECKOUT_KEY);
    return;
  }
  storage.setItem(PENDING_SWISH_CHECKOUT_KEY, JSON.stringify({ ...checkout, appUrl }));
}

export function clearPendingPaymentMetadata(storage: StorageLike): void {
  storage.removeItem(PENDING_PAYMENT_PROVIDER_KEY);
  storage.removeItem(PENDING_SWISH_CHECKOUT_KEY);
}
