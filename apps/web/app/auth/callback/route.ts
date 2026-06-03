import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { getSafeNativeAuthRedirect } from "@/lib/nativeAuthRedirect";

/**
 * Supabase Auth callback — handles OAuth and magic-link redirects.
 *
 * Supabase redirects here after Google / Apple / Phone sign-in with a ?code=.
 * VIKTIGT: session-cookies från exchangeCodeForSession MÅSTE bindas till exakt
 * den NextResponse vi returnerar. Tidigare skrevs de via next/headers cookies()
 * och försvann när vi returnerade en NY NextResponse.redirect() → sessionen
 * persistade inte ("Apple loggar in men sidan loggar inte in efter redirect").
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/profile";
  const nativeRedirect = searchParams.get("native_redirect");
  const safeNativeRedirect = getSafeNativeAuthRedirect(nativeRedirect);

  // Slutdestination bestäms upp-front så cookies kan bindas till rätt response.
  const forwardedHost = request.headers.get("x-forwarded-host");
  const isLocalEnv = process.env.NODE_ENV === "development";
  const baseUrl = isLocalEnv ? origin : forwardedHost ? `https://${forwardedHost}` : origin;

  if (!code) {
    return NextResponse.redirect(`${baseUrl}/profile?error=auth_callback_failed`);
  }

  // Bygg redirect-responsen FÖRST och låt Supabase skriva session-cookies på DEN.
  const response = NextResponse.redirect(`${baseUrl}${next}`);
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) =>
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options)),
      },
    },
  );

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.session) {
    return NextResponse.redirect(`${baseUrl}/profile?error=auth_callback_failed`);
  }

  // Native app (mobil): lämna tokens via deep-link istället för cookie-session.
  if (nativeRedirect) {
    if (!safeNativeRedirect) {
      return NextResponse.redirect(`${baseUrl}/profile?error=invalid_native_redirect`);
    }
    const separator = safeNativeRedirect.includes("?") ? "&" : "?";
    return NextResponse.redirect(
      `${safeNativeRedirect}${separator}access_token=${data.session.access_token}&refresh_token=${data.session.refresh_token}`,
    );
  }

  // Web: returnera responsen som bär session-cookies → kunden är inloggad.
  return response;
}
