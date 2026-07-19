import { NextResponse, type NextRequest } from "next/server";
import { updateSupabaseSession } from "@/lib/supabase/middleware";
import { isValidLaunchCookieEdge, LAUNCH_ACCESS_COOKIE_EDGE } from "@/lib/launchAccessEdge";
import { isLaunchGateBypassPath, prelaunchModeEnabled } from "@/lib/prelaunchMode";
import {
  PARTNER_ACCESS_COOKIE,
  partnerEntrySlug,
  signPartnerCookie,
  verifyPartnerCookie,
} from "@/lib/partnerAccessEdge";

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const kioskCheckoutRoute =
    request.nextUrl.searchParams.get("embed") === "1" &&
    (pathname === "/cart" || pathname.startsWith("/order/"));

  // PRELAUNCH_MODE=0 makes the complete storefront public. API, Next assets,
  // PWA metadata and platform association files remain reachable even while
  // PRELAUNCH_MODE=1 locks user-facing pages for smoke testing.
  if (!prelaunchModeEnabled() || isLaunchGateBypassPath(pathname) || kioskCheckoutRoute) {
    return updateSupabaseSession(request);
  }

  const unlocked = await isValidLaunchCookieEdge(
    request.cookies.get(LAUNCH_ACCESS_COOKIE_EDGE)?.value,
  );
  if (unlocked) return updateSupabaseSession(request);

  // Partner-entré (t.ex. palmyrapizzeria.se): en länk till partnerns
  // restaurangsida med ?utm_source=partner släpper in besökaren förbi
  // grinden och sätter en signerad partner-cookie så hela beställnings-
  // flödet (cart, betalning, tracking, konto) fungerar. Hemsidan visar då
  // bara partnerns restaurang (se app/page.tsx). Tillfälligt tills launch.
  const entrySlug = partnerEntrySlug(request.nextUrl);
  if (entrySlug) {
    const response = await updateSupabaseSession(request);
    const cookieValue = await signPartnerCookie(entrySlug);
    if (cookieValue) {
      response.cookies.set(PARTNER_ACCESS_COOKIE, cookieValue, {
        path: "/",
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: 60 * 60 * 24 * 7,
      });
    }
    return response;
  }

  const partnerSlug = await verifyPartnerCookie(
    request.cookies.get(PARTNER_ACCESS_COOKIE)?.value,
  );
  if (partnerSlug) return updateSupabaseSession(request);

  const launchUrl = request.nextUrl.clone();
  launchUrl.pathname = "/";
  launchUrl.search = "";
  return NextResponse.rewrite(launchUrl);
}

export const config = {
  matcher: [
    /*
     * Refresh Supabase sessions on all routes except:
     * - Static files (_next/static, _next/image, favicon, etc.)
     * - The auth callback itself (prevents infinite loops)
     */
    "/((?!_next/static|_next/image|favicon.ico|auth/callback|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
