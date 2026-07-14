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
  const expected = process.env.LAUNCH_ACCESS_CODE_SHA256?.trim().toLowerCase();
  if (!expected || !/^\w{64}$/.test(expected)) return false;
  const actual = createHash("sha256").update(code, "utf8").digest("hex");
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return timingSafeEqual(actualBuffer, expectedBuffer);
}
