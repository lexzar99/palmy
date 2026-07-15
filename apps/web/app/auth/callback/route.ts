import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Supabase Auth callback — handles Google and Apple OAuth redirects.
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

  // Slutdestination bestäms upp-front så cookies kan bindas till rätt response.
  const forwardedHost = request.headers.get("x-forwarded-host");
  const isLocalEnv = process.env.NODE_ENV === "development";
  const baseUrl = isLocalEnv ? origin : forwardedHost ? `https://${forwardedHost}` : origin;

  if (!code) {
    return NextResponse.redirect(`${baseUrl}/profile?error=auth_callback_failed`);
  }

  // The old native bridge put Supabase access/refresh bearers in a custom-
  // scheme URL. Custom schemes are claimable by another app and URLs leak to
  // history/logs, so fail closed until native ships PKCE + claimed HTTPS links.
  // Do this before exchanging the single-use OAuth code or setting cookies.
  if (nativeRedirect) {
    return NextResponse.json(
      {
        error: "Uppdatera ViaEats-appen för att logga in",
        code: "NATIVE_AUTH_UPDATE_REQUIRED",
      },
      { status: 410, headers: { "Cache-Control": "no-store" } },
    );
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

  const provider = String(data.user?.app_metadata?.provider || "").toLowerCase();
  if (provider !== "google" && provider !== "apple") {
    // Email/password and magic-link sessions are intentionally not customer
    // login methods. Phone OTP is completed directly in PhoneAuth and does not
    // use this OAuth callback.
    return NextResponse.redirect(`${baseUrl}/profile?error=unsupported_auth_method`);
  }

  // Web: returnera responsen som bär session-cookies → kunden är inloggad.
  return response;
}
