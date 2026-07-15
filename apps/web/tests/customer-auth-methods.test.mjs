import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const authApi = fs.readFileSync(new URL("../../../packages/api/src/routes/auth.ts", import.meta.url), "utf8");
const phoneAuth = fs.readFileSync(new URL("../components/PhoneAuth.tsx", import.meta.url), "utf8");
const socialAuth = fs.readFileSync(new URL("../components/SocialAuthButton.tsx", import.meta.url), "utf8");
const callback = fs.readFileSync(new URL("../app/auth/callback/route.ts", import.meta.url), "utf8");
const nextAuth = fs.readFileSync(new URL("../app/api/auth/[...nextauth]/route.ts", import.meta.url), "utf8");

test("customer UI exposes only phone, Google and Apple sign-in", () => {
  assert.match(phoneAuth, /signInWithOtp\(\{ phone:/);
  assert.match(phoneAuth, /verifyOtp\(\{ phone:/);
  assert.doesNotMatch(phoneAuth, /signInWithPassword|password:/);
  assert.match(socialAuth, /provider: "google" \| "apple"/);
  assert.doesNotMatch(socialAuth, /magic|email.*otp/i);
  assert.match(nextAuth, /GoogleProvider/);
  assert.match(nextAuth, /AppleProvider/);
});

test("backend rejects email auth and requires verified phone proof", () => {
  assert.match(authApi, /CUSTOMER_PASSWORD_AUTH_RETIRED/);
  assert.match(authApi, /CUSTOMER_AUTH_METHOD_NOT_ALLOWED/);
  assert.match(authApi, /VERIFIED_PHONE_SESSION_REQUIRED/);
  assert.doesNotMatch(authApi, /router\.post\('\/(?:login-user|register-user|forgot-password|reset-password|verify-email)'/);
});

test("OAuth callback refuses Supabase email and magic-link sessions", () => {
  assert.match(callback, /provider !== "google" && provider !== "apple"/);
  assert.match(callback, /unsupported_auth_method/);
  assert.doesNotMatch(callback, /handles OAuth and magic-link redirects/);
});

test("retired password and email-verification pages do not exist", () => {
  for (const relativePath of [
    "../app/forgot-password/page.tsx",
    "../app/reset-password/page.tsx",
    "../app/verify-email/page.tsx",
  ]) {
    assert.equal(fs.existsSync(new URL(relativePath, import.meta.url)), false);
  }
});

test("phone linking forwards the verified SMS session to the backend", () => {
  const profile = fs.readFileSync(new URL("../app/profile/page.tsx", import.meta.url), "utf8");
  assert.match(profile, /data\.session\?\.access_token/);
  assert.match(profile, /token: phoneVerificationToken/);
  assert.doesNotMatch(profile, /lockPhone\(addPhoneFull\(\)\);/);
});
