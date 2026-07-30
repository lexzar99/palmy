import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const authApi = fs.readFileSync(new URL("../../../packages/api/src/routes/auth.ts", import.meta.url), "utf8");
const phoneAuth = fs.readFileSync(new URL("../components/PhoneAuth.tsx", import.meta.url), "utf8");
const callback = fs.readFileSync(new URL("../app/auth/callback/route.ts", import.meta.url), "utf8");
const socialAuthPath = new URL("../components/SocialAuthButton.tsx", import.meta.url);
const nextAuthPath = new URL("../app/api/auth/[...nextauth]/route.ts", import.meta.url);

test("customer UI exposes only phone number verification", () => {
  assert.match(phoneAuth, /signInWithOtp\(\{ phone:/);
  assert.match(phoneAuth, /verifyOtp\(\{ phone:/);
  assert.doesNotMatch(phoneAuth, /signInWithPassword|signInWithOAuth|password:|email/i);
  assert.equal(fs.existsSync(socialAuthPath), false);
  assert.equal(fs.existsSync(nextAuthPath), false);

  for (const relativePath of [
    "../app/login/page.tsx",
    "../app/register/page.tsx",
    "../app/profile/page.tsx",
  ]) {
    const source = fs.readFileSync(new URL(relativePath, import.meta.url), "utf8");
    assert.doesNotMatch(source, /SocialAuthButton|GoogleProvider|AppleProvider|signInWithOAuth/);
  }
});

test("backend rejects email auth and requires verified phone proof", () => {
  assert.match(authApi, /CUSTOMER_PASSWORD_AUTH_RETIRED/);
  assert.match(authApi, /CUSTOMER_AUTH_METHOD_NOT_ALLOWED/);
  assert.match(authApi, /VERIFIED_PHONE_SESSION_REQUIRED/);
  assert.doesNotMatch(authApi, /router\.post\('\/(?:login-user|register-user|forgot-password|reset-password|verify-email)'/);
});

test("legacy OAuth callback never creates a customer web session", () => {
  assert.doesNotMatch(callback, /exchangeCodeForSession|provider !== "google" && provider !== "apple"/);
  assert.match(callback, /unsupported_auth_method/);
  assert.doesNotMatch(callback, /sign-in|sign in|GoogleProvider|AppleProvider|signInWithOAuth/);
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

test("a backend exchange failure is not mislabeled as an incorrect SMS code", () => {
  assert.match(phoneAuth, /codeWasVerified = true/);
  assert.match(phoneAuth, /Numret verifierades, men inloggningen kunde inte slutföras/);
});
