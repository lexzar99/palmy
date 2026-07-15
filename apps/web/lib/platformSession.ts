import { cookies } from "next/headers";

export const PLATFORM_SESSION_COOKIE_NAME = "platform_session";
export const PLATFORM_LOGGED_OUT_COOKIE_NAME = "viaeats_logged_out";
export const PLATFORM_LOGGED_OUT_COOKIE_VALUE = "1";

const PLATFORM_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export function getPlatformSessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: PLATFORM_SESSION_MAX_AGE_SECONDS,
  };
}

export function getPlatformLoggedOutCookieOptions() {
  return {
    // Deliberately readable by the browser: an offline logout cannot reach a
    // Route Handler to clear an HttpOnly token, so JavaScript sets this
    // fail-closed sentinel synchronously. It grants nothing; it only denies.
    httpOnly: false,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: PLATFORM_SESSION_MAX_AGE_SECONDS,
  };
}

export async function setPlatformSessionCookie(token: string) {
  const cookieStore = await cookies();
  cookieStore.set(PLATFORM_SESSION_COOKIE_NAME, token, getPlatformSessionCookieOptions());
}

export async function clearPlatformSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(PLATFORM_SESSION_COOKIE_NAME);
}

export async function setPlatformLoggedOutCookie() {
  const cookieStore = await cookies();
  cookieStore.set(
    PLATFORM_LOGGED_OUT_COOKIE_NAME,
    PLATFORM_LOGGED_OUT_COOKIE_VALUE,
    getPlatformLoggedOutCookieOptions(),
  );
}

export async function clearPlatformLoggedOutCookie() {
  const cookieStore = await cookies();
  cookieStore.set(PLATFORM_LOGGED_OUT_COOKIE_NAME, "", {
    ...getPlatformLoggedOutCookieOptions(),
    maxAge: 0,
  });
}

export async function getServerPlatformAccessToken() {
  // VIKTIGT: ALLTID returnera platform_session-cookien (vårt JWT) — INGEN
  // fallback till Supabase access_token. Det tidigare fallback-flödet
  // skickade Supabase JWT till backend som kräver att supabaseAdmin
  // är konfigurerad på backend (SUPABASE_SERVICE_ROLE_KEY). Om den
  // saknas → 401 → felaktig "session utgången".
  //
  // Frontend ska ALLTID köra OAuth → platform JWT-exchange. Om
  // platform_session inte finns: returnera null → proxy skickar inget
  // Authorization-header → backend svarar 401 → frontend triggar
  // exchangeSupabaseForPlatformToken via Supabase-session.
  const cookieStore = await cookies();
  if (
    cookieStore.get(PLATFORM_LOGGED_OUT_COOKIE_NAME)?.value ===
    PLATFORM_LOGGED_OUT_COOKIE_VALUE
  ) {
    return null;
  }
  const platformToken = cookieStore.get(PLATFORM_SESSION_COOKIE_NAME)?.value;
  return platformToken || null;
}
