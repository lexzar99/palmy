import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("referral card separates authenticated account access from guest order proof", () => {
  const source = read("components/ReferralProfileCard.tsx");

  assert.match(source, /authenticated[\s\S]*\/api\/platform\/account\/referral/);
  assert.match(source, /readOrderHistory\(\)/);
  assert.match(source, /method:\s*"POST"/);
  assert.match(source, /JSON\.stringify\(proof\)/);
  assert.match(source, /orderId:\s*order\.id/);
  assert.match(source, /accessToken:\s*order\.accessToken/);
  assert.doesNotMatch(source, /guest_phone/);
  assert.doesNotMatch(source, /guestPhone/);
  assert.doesNotMatch(source, /\?phone=/);
});

test("signed-in profile explicitly selects authenticated referral mode", () => {
  const source = read("app/profile/page.tsx");
  assert.match(source, /<ReferralProfileCard authenticated\s*\/>/);
  assert.doesNotMatch(source, /<ReferralProfileCard phone=/);
});
