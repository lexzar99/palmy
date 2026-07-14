export const LAUNCH_ACCESS_COOKIE_EDGE = "viaeats_launch_access";

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function isValidLaunchCookieEdge(value: string | undefined) {
  const secret = process.env.LAUNCH_ACCESS_COOKIE_SECRET || process.env.NEXTAUTH_SECRET || "";
  if (!secret || !value) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode("launch-unlocked"));
  return bytesToHex(new Uint8Array(signature)) === value;
}
