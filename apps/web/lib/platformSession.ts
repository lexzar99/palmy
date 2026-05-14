import { cookies } from "next/headers";

export const PLATFORM_SESSION_COOKIE_NAME = "platform_session";

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

export async function setPlatformSessionCookie(token: string) {
  const cookieStore = await cookies();
  cookieStore.set(PLATFORM_SESSION_COOKIE_NAME, token, getPlatformSessionCookieOptions());
}

export async function clearPlatformSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(PLATFORM_SESSION_COOKIE_NAME);
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
  const platformToken = cookieStore.get(PLATFORM_SESSION_COOKIE_NAME)?.value;
  return platformToken || null;
}
