import assert from "node:assert/strict";
import test from "node:test";

const { classifyPlatformSessionTransition } = await import("../lib/platformSessionTransition.ts");

const transition = (overrides = {}) => classifyPlatformSessionTransition({
  hadPreviousCookie: false,
  previousCookieCustomerId: null,
  previousCustomerMarker: null,
  nextCustomerId: "customer-next",
  ...overrides,
});

test("verified same-customer cookie preserves state and push", () => {
  assert.deepEqual(transition({
    hadPreviousCookie: true,
    previousCookieCustomerId: "customer-next",
    previousCustomerMarker: "stale-marker-is-ignored",
  }), {
    clearCustomerState: false,
    revokePush: false,
    reason: "verified_cookie_same_customer",
  });
});

test("invalid or different cookie clears customer state and revokes push", () => {
  for (const previousCookieCustomerId of [null, "customer-other"]) {
    const result = transition({ hadPreviousCookie: true, previousCookieCustomerId });
    assert.equal(result.clearCustomerState, true);
    assert.equal(result.revokePush, true);
    assert.equal(result.reason, "cookie_invalid_or_customer_changed");
  }
});

test("missing cookie with same marker preserves guest/order state but revokes stale push", () => {
  assert.deepEqual(transition({ previousCustomerMarker: "customer-next" }), {
    clearCustomerState: false,
    revokePush: true,
    reason: "missing_cookie_marker_same_customer",
  });
});

test("missing cookie with different marker clears state and revokes push", () => {
  assert.deepEqual(transition({ previousCustomerMarker: "customer-other" }), {
    clearCustomerState: true,
    revokePush: true,
    reason: "missing_cookie_marker_changed_customer",
  });
});

test("first guest login preserves cart/order state but revokes any hidden push subscription", () => {
  assert.deepEqual(transition(), {
    clearCustomerState: false,
    revokePush: true,
    reason: "guest_to_first_customer",
  });
});
