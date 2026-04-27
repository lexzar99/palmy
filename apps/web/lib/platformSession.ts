import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const PLATFORM_SESSION_COOKIE_NAME = "platform_session";

const PLATFORM_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

function isSupabaseConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

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
  const cookieStore = await cookies();
  const legacyToken = cookieStore.get(PLATFORM_SESSION_COOKIE_NAME)?.value;

  if (legacyToken) {
    return legacyToken;
  }

  if (!isSupabaseConfigured()) {
    return null;
  }

  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();

    return session?.access_token ?? null;
  } catch {
    return null;
  }
}
