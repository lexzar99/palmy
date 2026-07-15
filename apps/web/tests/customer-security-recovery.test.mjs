import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("logout clears customer order credentials and offline caches", () => {
  const source = read("lib/platformSessionClient.ts");
  for (const key of [
    "platform_delivery_address",
    "platform_delivery_city",
    "platform_delivery_coords",
    "platform_delivery",
    "platform_order_type",
    "cart_order_type",
    "platform_order_history",
    "offline_last_order",
    "offline_orders_list",
    "pending_order_id",
    "pending_order_token",
    "viaeats.checkout.attempt.v1",
    "viaeats_active_order_token",
    "viaeats_active_orders",
    "viaeats.activeUserDealId",
    "viaeats.activeUserDealSnapshot",
    "platform_favorites",
    "viaeats_favorites",
    "viaeats.skippedReviewOrderIds",
    "viaeats_preferred_payment_method_v1",
    "viaeats_claim_dismissed_at",
    "viaeats_welcome_banner_dismissed",
    "viaeats.lastCustomerId",
    "viaeats-cart",
    "push_order_",
    "receipt_dl_",
  ]) {
    assert.match(source, new RegExp(key.replaceAll(".", "\\.")), `logout must clear ${key}`);
  }
  assert.match(source, /finally\s*{[\s\S]*clearPlatformCustomerState\(\)/);
  assert.match(source, /useCartStore\.getState\(\)\.clearCart\(\)/);
  assert.match(source, /getPlatformSessionStatus\(\)[\s\S]*isLoggedOutMark\(\)/);
  assert.match(source, /dispatchEvent\(new StorageEvent\("storage"/);
  assert.match(source, /dispatchEvent\(new Event\("viaeats:favorites-change"\)\)/);
  assert.match(source, /setBrowserLogoutSentinel\(true\)/);
  assert.match(source, /unsubscribeWebPushForLogout/);
  assert.match(source, /keepalive:\s*true/);

  const proxy = read("app/api/platform/[...path]/route.ts");
  assert.match(proxy, /PLATFORM_LOGGED_OUT/);
  assert.match(proxy, /expireCustomerCredentials\(denied, request\)/);

  const sessionRoute = read("app/api/platform/session/route.ts");
  assert.match(sessionRoute, /setPlatformLoggedOutCookie\(\)/);
  assert.match(sessionRoute, /clearAllOrderSessionCookies\(\)/);

  const home = read("components/HomeClient.tsx");
  assert.match(home, /event\.key === ACTIVE_USER_DEAL_ID_KEY/);
  assert.match(home, /event\.key === "viaeats\.skippedReviewOrderIds"/);
  assert.match(home, /addEventListener\("storage", syncCustomerChoices\)/);
  assert.match(home, /event\?\.key === LAST_CUSTOMER_ID_KEY[\s\S]*setPersonalDeals\(\[\]\)/);

  const cart = read("app/cart/page.tsx");
  assert.match(cart, /addEventListener\("storage", syncActiveUserDeal\)/);
  assert.match(cart, /setSelectedAccountDealId\(stored \|\| null\)/);
  assert.match(cart, /event\.key === LAST_CUSTOMER_ID_KEY[\s\S]*setAccountDeals\(\[\]\)/);

  const cartStore = read("store/cartStore.ts");
  assert.match(cartStore, /clearCart:[\s\S]*deliveryOverrides:\s*{}[\s\S]*bogoChoice:\s*null/);
  const providers = read("app/providers.tsx");
  assert.match(providers, /event\.key === "viaeats-cart" && event\.newValue === null/);
  assert.match(providers, /useCartStore\.getState\(\)\.clearCart\(\)/);

  const favorites = read("lib/favoritesStore.ts");
  assert.match(favorites, /e\.key === STORAGE_KEY \|\| e\.key === ALIAS_KEY/);
  assert.match(favorites, /addEventListener\(EVENT_NAME, onChange\)/);

  const profile = read("app/profile/page.tsx");
  assert.match(profile, /addEventListener\("storage", syncPreferredPayment\)/);
  assert.match(profile, /setPreferredPayment\(saved === "CARD" \|\| saved === "SWISH" \? saved : "APPLE_PAY"\)/);
  assert.match(profile, /event\.key !== LAST_CUSTOMER_ID_KEY[\s\S]*setUser\(null\)[\s\S]*fetchData\(\)/);

  const claimPopup = read("components/ClaimDealPopup.tsx");
  assert.match(claimPopup, /await getPlatformSessionStatus\(\)/);
  assert.match(claimPopup, /addEventListener\(PLATFORM_SESSION_CHANGED_EVENT, onSessionChanged\)/);
  assert.match(claimPopup, /addEventListener\("storage", onCustomerStorage\)/);

  const welcomeBanner = read("components/WelcomeDealBanner.tsx");
  assert.match(welcomeBanner, /addEventListener\(PLATFORM_SESSION_CHANGED_EVENT, onSessionChanged\)/);
  assert.match(welcomeBanner, /\[enabled, sessionRevision\]/);
  assert.match(welcomeBanner, /addEventListener\("storage", onCustomerStorage\)/);
});

test("session refresh splits customer cleanup from stale push revocation", () => {
  const source = read("lib/platformSessionClient.ts");
  const refresh = source.match(/export async function clearPlatformSessionForRefresh\(\)\s*{([\s\S]*?)\n}/)?.[1] || "";
  assert.match(refresh, /clearLegacyPlatformUserToken\(\)/);
  assert.doesNotMatch(refresh, /fetch\(/);
  assert.doesNotMatch(refresh, /clearPlatformLocalUserData/);
  assert.match(source, /JSON\.stringify\({ token, previousCustomerId }\)/);
  assert.match(source, /result\.clearCustomerState \?\? result\.identityChanged === true/);
  assert.match(source, /if \(revokePush\)[\s\S]*unsubscribeWebPushForLogout/);
  assert.match(source, /if \(clearCustomerState\) await clearPlatformCustomerState\(\)/);
  assert.match(source, /writeLastCustomerId\(customerId\)/);

  const sessionRoute = read("app/api/platform/session/route.ts");
  assert.match(sessionRoute, /classifyPlatformSessionTransition\(/);
  assert.match(sessionRoute, /hadPreviousCookie:\s*Boolean\(previousToken\)/);
  assert.match(sessionRoute, /previousCustomerMarker/);
  assert.match(sessionRoute, /const identityChanged = clearCustomerState/);
  assert.match(sessionRoute, /if \(clearCustomerState\) await clearAllOrderSessionCookies\(\)/);
  assert.match(sessionRoute, /customerId:\s*nextCustomerId/);
  assert.match(sessionRoute, /clearCustomerState,[\s\S]*revokePush/);
  assert.match(sessionRoute, /verifyActivePlatformCustomer\(token, nextCustomerId\)/);

  const profile = read("app/profile/page.tsx");
  assert.match(profile, /Stale platform session[\s\S]*clearPlatformSessionForRefresh\(\)/);
  assert.match(profile, /forcing fresh exchange[\s\S]*clearPlatformSessionForRefresh\(\)/);
  assert.match(profile, /isLoggedOutMark\(\) && !hasExplicitLoginIntent\(\)/);
});

test("guest order web access uses scoped HttpOnly sessions and clean deep links", () => {
  const proxy = read("app/api/platform/[...path]/route.ts");
  assert.match(proxy, /request\.cookies\.get\(orderCookieName\)/);
  assert.match(proxy, /headers\.set\(ORDER_SESSION_HEADER, orderSession\)/);
  assert.match(proxy, /response\.cookies\.set\(issuedCookieName, issuedOrderSession/);
  assert.match(proxy, /targetUrl\.searchParams\.delete\("token"\)/);

  const orderPage = read("app/order/[id]/page.tsx");
  assert.match(orderPage, /orders\/\$\{orderId\}\/session/);
  assert.match(orderPage, /axios\.get\(`\/api\/platform\/orders\/\$\{orderId\}`/);
  assert.doesNotMatch(orderPage, /searchParams\.get\("token"\)/);
  assert.doesNotMatch(orderPage, /qs\.set\("token"/);

  const cart = read("app/cart/page.tsx");
  assert.doesNotMatch(cart, /orderRes\.data\.accessToken/);
  assert.doesNotMatch(cart, /localStorage\.setItem\("pending_order_token"/);

  for (const path of [
    "app/cart/page.tsx",
    "app/orders/page.tsx",
    "components/RecentOrderCard.tsx",
    "lib/activeOrder.ts",
    "components/HomeClient.tsx",
  ]) {
    assert.doesNotMatch(read(path), /`\/order\/\$\{[^}]+}\?token=/, `${path} must not create token deep links`);
  }
});

test("order page exposes the order-scoped web-push opt-in", () => {
  const orderPage = read("app/order/[id]/page.tsx");
  assert.match(orderPage, /pushAvailable\s*&&\s*!isTerminal\(currentStatus\)/);
  assert.match(orderPage, /onClick=\{enablePush\}/);
  assert.match(orderPage, /subscribeOrderPush\(orderId\)/);
  assert.doesNotMatch(orderPage, /false\s*&&\s*pushAvailable/);

  const pushClient = read("lib/webPushClient.ts");
  assert.match(pushClient, /unsubscribeWebPushForLogout/);
  assert.match(pushClient, /\/api\/platform\/push\/unsubscribe/);
  assert.match(pushClient, /subscription\.unsubscribe\(\)/);
  assert.match(pushClient, /setServiceWorkerPushEnabled\(false\)/);

  const serviceWorker = read("public/sw.js");
  assert.match(serviceWorker, /VIAEATS_PUSH_STATE/);
  assert.match(serviceWorker, /if \(await isPushDisabled\(\)\) return/);
});

test("native auth never transports bearer tokens in custom-scheme URLs", () => {
  const callback = read("app/auth/callback/route.ts");
  assert.match(callback, /NATIVE_AUTH_UPDATE_REQUIRED/);
  assert.match(callback, /status:\s*410/);
  assert.doesNotMatch(callback, /access_token=/);
  assert.doesNotMatch(callback, /refresh_token=/);

  const mobileAuth = read("app/mobile-auth/page.tsx");
  assert.match(mobileAuth, /NATIVE_AUTH_UPDATE_REQUIRED/);
  assert.doesNotMatch(mobileAuth, /platformToken/);
  assert.doesNotMatch(mobileAuth, /window\.location/);

  const redirectPolicy = read("lib/nativeAuthRedirect.ts");
  assert.doesNotMatch(redirectPolicy, /viaeats:\/\//);
});

test("OAuth exchange logging never serializes Axios request config or id token", () => {
  const source = read("app/api/auth/[...nextauth]/route.ts");
  const failureBlock = source.match(/catch \(err\) \{([\s\S]*?)\n\s*}/)?.[1] || "";
  assert.match(failureBlock, /axios\.isAxiosError\(err\)/);
  assert.doesNotMatch(failureBlock, /console\.error\([^\n]*err\)/);
  assert.doesNotMatch(source, /console\.error\("OAuth token exchange failed:",\s*err\)/);
});

test("saved deal links have a real detail route", () => {
  const source = read("app/deals/[id]/page.tsx");
  assert.match(source, /api\/deals\/\$\{encodeURIComponent\(id\)}\/restaurants/);
  assert.match(source, /restaurants\.map/);
  assert.match(source, /href={`\/restaurants\/\$\{restaurant\.slug}`}/);
});

test("cart resumes persisted Mollie orders and accepts already-paid replay", () => {
  const source = read("app/cart/page.tsx");
  assert.match(source, /params\.get\("payment_return"\)\s*\|\|\s*localStorage\.getItem\("pending_order_id"\)/);
  assert.match(source, /payRes\.data\?\.alreadyPaid\s*===\s*true/);
  assert.match(source, /alreadyPaid[\s\S]*goToOrderTracking\(orderId\)/);
  assert.match(source, /ORDER_REPLAY_EXPIRED[\s\S]*clearCheckoutAttempt\(\)/);
});

test("invite landing uses shared API resolution and server reward copy", () => {
  const source = read("app/i/[token]/page.tsx");
  assert.match(source, /import\s*{\s*API_URL\s*}\s*from\s*"@\/lib\/api"/);
  assert.match(source, /api\/public\/referral-preview/);
  assert.match(source, /rewardLabel/);
  assert.doesNotMatch(source, /http:\/\/localhost:4000/);
});

test("launch checklist documents Mollie rather than Stripe", () => {
  const source = read("app/launch-checklist/page.tsx");
  assert.match(source, /MOLLIE_API_KEY=live_/);
  assert.match(source, /api\/payments\/webhooks\/mollie/);
  assert.doesNotMatch(source, /Stripe/);
});

test("unlocked web proxy forwards the signed prelaunch proof", () => {
  const source = read("app/api/platform/[...path]/route.ts");
  assert.match(source, /isValidLaunchCookie\(launchProof\)/);
  assert.match(source, /x-viaeats-launch-access/);
});
