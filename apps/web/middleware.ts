import { NextResponse, type NextRequest } from "next/server";
import { updateSupabaseSession } from "@/lib/supabase/middleware";
import { isValidLaunchCookieEdge, LAUNCH_ACCESS_COOKIE_EDGE } from "@/lib/launchAccessEdge";
import { isLaunchGateBypassPath, prelaunchModeEnabled } from "@/lib/prelaunchMode";

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // PRELAUNCH_MODE=0 makes the complete storefront public. API, Next assets,
  // PWA metadata and platform association files remain reachable even while
  // PRELAUNCH_MODE=1 locks user-facing pages for smoke testing.
  if (!prelaunchModeEnabled() || isLaunchGateBypassPath(pathname)) {
    return updateSupabaseSession(request);
  }

  const unlocked = await isValidLaunchCookieEdge(
    request.cookies.get(LAUNCH_ACCESS_COOKIE_EDGE)?.value,
  );
  if (unlocked) return updateSupabaseSession(request);

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
