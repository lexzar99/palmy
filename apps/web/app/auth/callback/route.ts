import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSafeNativeAuthRedirect } from "@/lib/nativeAuthRedirect";

/**
 * Supabase Auth callback — handles OAuth and magic-link redirects.
 *
 * Supabase redirects here after Google / Phone sign-in with a ?code= param.
 * This route exchanges the code for a session, then:
 *   - For web users: redirects to /profile
 *   - For native app (matgo://): redirects back to the app with the access token
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/profile";
  // native_redirect is set by the mobile app to receive the token
  const nativeRedirect = searchParams.get("native_redirect");
  const safeNativeRedirect = getSafeNativeAuthRedirect(nativeRedirect);

  if (code) {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data.session) {
      if (nativeRedirect && !safeNativeRedirect) {
        return NextResponse.redirect(`${origin}/profile?error=invalid_native_redirect`);
      }

      if (safeNativeRedirect) {
        // Only hand tokens to deep links we explicitly allow.
        const separator = safeNativeRedirect.includes("?") ? "&" : "?";
        const appUrl = `${safeNativeRedirect}${separator}access_token=${data.session.access_token}&refresh_token=${data.session.refresh_token}`;
        return NextResponse.redirect(appUrl);
      }
      // Regular web redirect
      const forwardedHost = request.headers.get("x-forwarded-host");
      const isLocalEnv = process.env.NODE_ENV === "development";
      if (isLocalEnv) {
        return NextResponse.redirect(`${origin}${next}`);
      } else if (forwardedHost) {
        return NextResponse.redirect(`https://${forwardedHost}${next}`);
      } else {
        return NextResponse.redirect(`${origin}${next}`);
      }
    }
  }

  // Auth failed
  return NextResponse.redirect(`${origin}/profile?error=auth_callback_failed`);
}
