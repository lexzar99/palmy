import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const cart = fs.readFileSync(new URL("../app/cart/page.tsx", import.meta.url), "utf8");
const profile = fs.readFileSync(new URL("../app/profile/page.tsx", import.meta.url), "utf8");
const phoneAuth = fs.readFileSync(new URL("../components/PhoneAuth.tsx", import.meta.url), "utf8");
const orders = fs.readFileSync(new URL("../../../packages/api/src/routes/orders.ts", import.meta.url), "utf8");
const profileApi = fs.readFileSync(new URL("../../../packages/api/src/routes/profile.ts", import.meta.url), "utf8");
const deferredGlobalClients = fs.readFileSync(new URL("../components/DeferredGlobalClients.tsx", import.meta.url), "utf8");
const activeOrder = fs.readFileSync(new URL("../lib/activeOrder.ts", import.meta.url), "utf8");

test("personal deals remain selectable with catalog-discounted items", () => {
  assert.doesNotMatch(cart, /const disabled = hasCatalogDiscountedItems/);
  assert.match(cart, /subtotalKr: subtotal/);
  assert.doesNotMatch(orders, /Kassarabatt kan inte kombineras med redan rabatterade produkter/);
  assert.doesNotMatch(orders, /Rabattkod kan inte kombineras med redan rabatterade produkter/);
});

test("referral profile shows the original share code and stacked percentage value", () => {
  assert.match(profileApi, /referralShareCode \|\| deal\.code \|\| null/);
  assert.match(profileApi, /deal\.discountPercent[\s\S]*'PERCENTAGE'/);
  assert.match(profile, /deal\.campaign\.freeDelivery/);
  assert.match(profile, /deal\.code \? <div/);
});

test("phone login removes the temporary SMS session before profile bootstrap", () => {
  assert.match(phoneAuth, /persistPlatformSession\(platformToken\)[\s\S]*supabase\.auth\.signOut/);
});

test("cart returns to active tracking and the global tracking banner is gone", () => {
  assert.match(cart, /ACTIVE_ORDER_KEY/);
  assert.match(cart, /isActiveOrderStatus\(order\.status\)/);
  assert.match(cart, /router\.replace\(`\/order\/\$\{id\}`\)/);
  assert.doesNotMatch(deferredGlobalClients, /LiveOrderBanner/);
  assert.match(activeOrder, /viaeats_active_orders/);
});
