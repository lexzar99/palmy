const DEFAULT_NATIVE_AUTH_REDIRECT = "matgo://auth/callback";

const ALLOWED_FOODGO_AUTH_PATHS = new Set(["", "/", "/callback"]);

function isAllowedExpoAuthCallback(pathname: string) {
  const normalizedPath = pathname.replace(/\/+$/, "");
  return normalizedPath.endsWith("/auth/callback") || normalizedPath.endsWith("/--/auth/callback");
}

export function getSafeNativeAuthRedirect(rawRedirect: string | null | undefined) {
  if (!rawRedirect) return null;

  try {
    const parsed = new URL(rawRedirect);

    if (parsed.protocol === "matgo:" && parsed.hostname === "auth" && ALLOWED_FOODGO_AUTH_PATHS.has(parsed.pathname)) {
      return parsed.toString();
    }

    if (
      process.env.NODE_ENV !== "production" &&
      (parsed.protocol === "exp:" || parsed.protocol === "exps:") &&
      isAllowedExpoAuthCallback(parsed.pathname)
    ) {
      return parsed.toString();
    }
  } catch {
    return null;
  }

  return null;
}

export function getSafeNativeAuthRedirectOrDefault(rawRedirect: string | null | undefined) {
  return getSafeNativeAuthRedirect(rawRedirect) ?? DEFAULT_NATIVE_AUTH_REDIRECT;
}

export { DEFAULT_NATIVE_AUTH_REDIRECT };
