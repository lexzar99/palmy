import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const LAUNCH_ACCESS_COOKIE = "viaeats_launch_access";

export function launchCookieValue() {
  const secret = process.env.LAUNCH_ACCESS_COOKIE_SECRET || process.env.NEXTAUTH_SECRET || "";
  if (!secret) return null;
  return createHmac("sha256", secret).update("launch-unlocked").digest("hex");
}

export function isValidLaunchCookie(value: string | undefined) {
  const expected = launchCookieValue();
  if (!expected || !value) return false;
  const actualBuffer = Buffer.from(value);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

export function isValidLaunchCode(code: string) {
  const configuredHash = process.env.LAUNCH_ACCESS_CODE_SHA256?.trim().toLowerCase() || "";
  const configuredPlaintext = process.env.LAUNCH_ACCESS_CODE?.trim() || "";
  // Preferred: riktig 64-teckens SHA-256 i LAUNCH_ACCESS_CODE_SHA256.
  // Bakåtkompatibilitet: tidigare instruktion lät Railway få själva koden i
  // samma variabel. Hasha den vid runtime så befintlig deploy inte låser ute
  // ägaren; koden skrivs aldrig till source, cookie eller respons.
  const expected = /^[a-f0-9]{64}$/.test(configuredHash)
    ? configuredHash
    : createHash("sha256")
        .update(configuredPlaintext || configuredHash, "utf8")
        .digest("hex");
  if ((!configuredHash && !configuredPlaintext) || !/^[a-f0-9]{64}$/.test(expected)) return false;
  const actual = createHash("sha256").update(code, "utf8").digest("hex");
  const actualBuffer = Buffer.from(actual, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  return timingSafeEqual(actualBuffer, expectedBuffer);
}
