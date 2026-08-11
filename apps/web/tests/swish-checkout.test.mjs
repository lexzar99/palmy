import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  SWISH_POLLING_POLICY,
  classifyAbandonResponse,
  classifyPaymentStatus,
  clearPendingPaymentMetadata,
  isHandheldPaymentDevice,
  persistableSwishAppUrl,
  readPendingPaymentProvider,
  readPersistedSwishCheckout,
  swishBackoffDelayMs,
  writePendingPaymentProvider,
  writePersistedSwishCheckout,
} from "../lib/swishCheckoutRecovery.ts";
import { formatCheckoutSek } from "../lib/checkoutMoney.ts";

const cart = fs.readFileSync(new URL("../app/cart/page.tsx", import.meta.url), "utf8");
const menu = fs.readFileSync(new URL("../components/MenuContent.tsx", import.meta.url), "utf8");
const stripeInline = fs.readFileSync(new URL("../components/StripeInlineCheckout.tsx", import.meta.url), "utf8");

test("direct Swish checkout uses the server app link and Commerce QR", () => {
  assert.match(cart, /startCheckout\(event, method\.id\)/);
  assert.match(cart, /\{ id: "swish", label: "Swish"/);
  assert.match(cart, /payRes\.data\?\.swishUrl/);
  assert.match(cart, /payRes\.data\?\.swishQrCode/);
  assert.match(cart, /href=\{swishCheckout\.appUrl\}/);
  assert.match(cart, /writePersistedSwishCheckout\(localStorage, checkout\)/);
  assert.match(cart, /\{!isHandheld && <img src=\{swishCheckout\.qrCode\}/);
  assert.match(cart, /isHandheld \? "Öppna Swish" : "Öppna Swish på den här enheten"/);
});

test("Swish payment choice uses the official logo and requested copy", () => {
  assert.match(cart, /src="\/swish-logo\.svg"/);
  assert.match(cart, /Betala med Swish smidigt och enkelt/);
  assert.doesNotMatch(cart, /Öppnar Swish direkt/);
});

test("restaurant menu always renders the floating cart action", () => {
  assert.match(menu, /<FloatingCartButton\s*\/>/);
  assert.doesNotMatch(menu, /embedMode\s*&&\s*<FloatingCartButton/);
});

test("Swish status fallback waits at least ten seconds, then uses 20/40/80 backoff", () => {
  assert.deepEqual(SWISH_POLLING_POLICY, {
    pollAttempts: 4,
    initialPollDelayMs: 10_000,
    pollBackoffBaseMs: 20_000,
    pollMaxDelayMs: 80_000,
    pollJitterRatio: 0.2,
  });
  assert.deepEqual([0, 1, 2].map((attempt) => swishBackoffDelayMs(attempt, 0.5)), [20_000, 40_000, 80_000]);
  assert.equal(swishBackoffDelayMs(3, 0.5), 80_000);
  assert.equal(swishBackoffDelayMs(0, 0), 16_000);
  assert.equal(swishBackoffDelayMs(0, 1), 24_000);
  assert.match(cart, /waitBeforePoll\(opts\.initialPollDelayMs!, false\)/);
  assert.match(cart, /opts\.provider === "swish"[\s\S]*?swishBackoffDelayMs\(attempt/);
});

test("desktop-mode iPadOS is treated as handheld for the Swish app flow", () => {
  assert.equal(isHandheldPaymentDevice({ userAgent: "Mozilla/5.0 (iPad)", platform: "iPad", maxTouchPoints: 5 }), true);
  assert.equal(isHandheldPaymentDevice({ userAgent: "Mozilla/5.0 (Macintosh)", platform: "MacIntel", maxTouchPoints: 5 }), true);
  assert.equal(isHandheldPaymentDevice({ userAgent: "Mozilla/5.0 (Macintosh)", platform: "MacIntel", maxTouchPoints: 0 }), false);
});

test("pending provider and Swish proof survive reload but reject malformed values", () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
  const resumeUrl = "https://viaeats.se/cart?payment_return=order-1&payment_provider=swish&payment_resume=signed-bearer";
  const appUrl = `swish://paymentrequest?token=abc&callbackurl=${encodeURIComponent(encodeURIComponent(resumeUrl))}`;
  const checkout = { orderId: "order-1", appUrl, qrCode: "data:image/png;base64,abc" };
  writePendingPaymentProvider(storage, "swish");
  writePersistedSwishCheckout(storage, checkout);
  assert.equal(readPendingPaymentProvider(storage), "swish");
  const persisted = readPersistedSwishCheckout(storage, "order-1");
  assert.equal(persisted?.orderId, checkout.orderId);
  assert.equal(persisted?.qrCode, checkout.qrCode);
  assert.equal(persisted?.appUrl, persistableSwishAppUrl(appUrl));
  assert.doesNotMatch(persisted?.appUrl || "", /payment_resume/);
  const persistedCallback = new URL(decodeURIComponent(
    new URL(persisted?.appUrl || "").searchParams.get("callbackurl") || "",
  ));
  assert.equal(persistedCallback.searchParams.get("payment_resume"), null);
  assert.equal(persistedCallback.searchParams.get("payment_return"), "order-1");
  assert.equal(readPersistedSwishCheckout(storage, "another-order"), null);
  clearPendingPaymentMetadata(storage);
  assert.equal(readPendingPaymentProvider(storage), null);
  assert.equal(readPersistedSwishCheckout(storage), null);
});

test("explicit cancel is fail-closed and paid always wins", () => {
  assert.equal(classifyAbandonResponse({ paid: true }), "paid");
  assert.equal(classifyAbandonResponse({ failed: true }), "terminal");
  assert.equal(classifyAbandonResponse({ alreadyGone: true }), "terminal");
  assert.equal(classifyAbandonResponse({ pending: true, preserved: true }), "pending");
  assert.equal(classifyAbandonResponse({ success: false }), "pending");
  assert.equal(classifyPaymentStatus("PAID"), "paid");
  assert.equal(classifyPaymentStatus("CANCELLED"), "terminal");
  assert.equal(classifyPaymentStatus("DECLINED"), "terminal");
  assert.equal(classifyPaymentStatus("ERROR"), "terminal");
  assert.equal(classifyPaymentStatus("PENDING"), "pending");
  assert.equal(classifyPaymentStatus("REQUIRES_PAYMENT_METHOD"), "pending");
  assert.match(cart, /Dölj alla återöppnings-[\s\S]*?setVerifyingPayment\(true\);[\s\S]*?setSwishCheckout\(null\);/);
  assert.match(cart, /försök automatiskt[\s\S]*?paymentCancelRetryRef[\s\S]*?handlePaymentCancelled\(orderId\)/);
  assert.match(cart, /setPendingOrderId\(null\);\n\s*setError\(null\);/);
  assert.match(cart, /retur eller kvarlämnad recovery[\s\S]*?await handlePaymentCancelled\(orderId\)/);
  assert.match(cart, /\) : pendingOrderId \? \([\s\S]*?Öppningslänken är dold/);
});

test("checkout SEK amounts always use two Swedish decimals", () => {
  assert.equal(formatCheckoutSek(0), "0,00");
  assert.equal(formatCheckoutSek(10), "10,00");
  assert.equal(formatCheckoutSek(12.5), "12,50");
  assert.equal(formatCheckoutSek(1234.56).replace(/\u00a0/g, " "), "1 234,56");
  assert.match(cart, /formatSekAmount\(vatAmount\)/);
  assert.match(cart, /formatSekAmount\(total\)/);
});

test("return recovery consumes the one-time session token and strips sensitive query state", () => {
  assert.match(cart, /params\.get\("payment_resume"\)/);
  assert.match(cart, /paymentResumeToken/);
  assert.match(cart, /orders\/\$\{returnOrderId\}\/session/);
  assert.match(cart, /next\.searchParams\.delete\("payment_resume"\)/);
  assert.match(cart, /next\.searchParams\.delete\("payment_provider"\)/);
  assert.match(cart, /returnProvider \|\| persistedProvider/);
  assert.match(cart, /localStorage\.setItem\("pending_order_id", returnOrderId\)/);
});

test("passive recovery verifies once and then safely cancels the stale provider request", () => {
  assert.match(cart, /const maxAttempts = passive && opts\.provider !== "swish" \? 1/);
  assert.match(cart, /retur eller kvarlämnad recovery[\s\S]*?await handlePaymentCancelled\(orderId\)/);
  assert.match(cart, /const pollGeneration = \+\+paymentPollGenerationRef\.current/);
  assert.match(cart, /if \(!isCurrentPoll\(\)\) return/);
});

test("same checkout attempt resumes safely and recovers a lost Swish create response", () => {
  assert.match(cart, /previousAttempt\?\.fingerprint === fingerprint/);
  assert.match(cart, /återställ proof och stäm av[\s\S]*?status när vi har tokenlänken/);
  assert.match(cart, /if \(restoredCheckout\)/);
  assert.doesNotMatch(cart, /restoredCheckout \|\| previousProvider !== "swish"/);
  assert.match(cart, /Om create-svaret tappades finns ingen återöppningslänk/);
  assert.match(cart, /previousOrderId && !sameCheckoutAttempt/);
  assert.match(cart, /const cancellation = await abandonPendingOrder\(previousOrderId\)/);
  assert.match(cart, /if \(cancellation === "pending"\)[\s\S]*?return;/);
  assert.match(cart, /Avbryt väntande betalning säkert/);
  assert.match(cart, /role="alert"[\s\S]*?\{error\}/);
});

test("payment methods use a stable same-route step with separate Stripe choices", () => {
  for (const method of ["swish", "klarna", "apple_pay", "google_pay", "card"]) {
    assert.match(cart, new RegExp(`id: "${method}"`));
  }
  assert.match(cart, /\{paymentStepOpen \? renderPaymentStep\(\) : \(/);
  assert.match(cart, /checkoutExperience: checkoutProvider === "stripe"[\s\S]*?"embedded"/);
  assert.match(cart, /checkoutMethod: checkoutProvider === "stripe" \? checkoutMethod : undefined/);
  assert.doesNotMatch(cart, /renderPayMenu|payMenuOpen|mollieOptionsOpen/);
  assert.doesNotMatch(cart, /aria-modal|role="dialog"/);
  assert.doesNotMatch(cart, />Mollie</);
  assert.match(stripeInline, /<PaymentElement/);
  assert.match(stripeInline, /<ExpressCheckoutElement/);
  assert.match(stripeInline, /redirect: "if_required"/);
  assert.match(stripeInline, /await onVerified\(\)/);
});

test("payment methods never render inside the mobile sticky layer", () => {
  const stickyBlock = cart.match(/className="sticky z-\[90\][\s\S]*?<\/div>\n\s*<\/div>\n\s*<\/motion\.div>/)?.[0] || "";
  assert.match(stickyBlock, /onClick=\{openPaymentStep\}/);
  assert.doesNotMatch(stickyBlock, /paymentMethods\.map|renderPaymentStep|StripeInlineCheckout|swishCheckout/);
});

test("an authorization-shaped 404 preserves recovery proof", () => {
  const unauthorizedBranch = cart.match(/if \(Number\(responseStatus\) === 404\) \{([\s\S]*?)\n\s*\}/)?.[1] || "";
  assert.match(unauthorizedBranch, /inte bevis på terminal PSP-status/);
  assert.doesNotMatch(unauthorizedBranch, /clearPendingPaymentStorage/);
});
