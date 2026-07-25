import { NextRequest, NextResponse } from "next/server";

/**
 * Legacy Supabase redirect callback.
 * Customer verification is phone-only and happens directly in PhoneAuth with
 * SMS OTP, so hosted OAuth redirects must not create a customer web session.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
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
        error: "Uppdatera ViaEats-appen för nummerverifiering",
        code: "NATIVE_AUTH_UPDATE_REQUIRED",
      },
      { status: 410, headers: { "Cache-Control": "no-store" } },
    );
  }

  return NextResponse.redirect(`${baseUrl}/profile?error=unsupported_auth_method`);
}
