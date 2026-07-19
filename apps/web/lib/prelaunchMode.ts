type PrelaunchEnvironment = {
  PRELAUNCH_MODE?: string;
  NODE_ENV?: string;
};

/**
 * PRELAUNCH_MODE follows the API contract:
 * - "1": lock the storefront behind the signed launch cookie
 * - "0": make the storefront public
 *
 * Production fails closed when the value is missing or invalid. Local
 * development stays public by default so a missing .env does not make the
 * normal development flow unusable.
 */
export function resolvePrelaunchMode(
  rawMode: string | undefined,
  nodeEnv: string | undefined,
): boolean {
  const mode = String(rawMode ?? "").trim();
  if (mode === "1") return true;
  if (mode === "0") return false;
  if (mode) return true;
  return nodeEnv === "production";
}

export function prelaunchModeEnabled(
  env: PrelaunchEnvironment = process.env,
): boolean {
  return resolvePrelaunchMode(env.PRELAUNCH_MODE, env.NODE_ENV);
}

/** Routes that must remain machine-readable while the storefront is locked. */
export function isLaunchGateBypassPath(pathname: string): boolean {
  return pathname.startsWith("/api/")
    || pathname.startsWith("/embed/")
    || pathname.startsWith("/_next/")
    || pathname.startsWith("/.well-known/")
    || pathname === "/privacy"
    || pathname === "/terms"
    || pathname === "/contact"
    || pathname === "/favicon.ico"
    || pathname === "/manifest.webmanifest"
    || pathname === "/robots.txt"
    || pathname === "/sitemap.xml"
    || /\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?|ttf)$/.test(pathname);
}
