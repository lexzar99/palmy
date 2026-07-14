import { NextResponse, type NextRequest } from "next/server";
import { updateSupabaseSession } from "@/lib/supabase/middleware";
import { isValidLaunchCookieEdge, LAUNCH_ACCESS_COOKIE_EDGE } from "@/lib/launchAccessEdge";

export async function middleware(request: NextRequest) {
  const refreshed = await updateSupabaseSession(request);
  const pathname = request.nextUrl.pathname;

  // API, Next-assets and metadata remain reachable so the gate can unlock,
  // load fonts/images and report consented launch events. All user-facing
  // pages are rewritten to the same launch screen until the signed HttpOnly
  // cookie is present.
  const bypass = pathname.startsWith("/api/")
    || pathname.startsWith("/_next/")
    || pathname === "/favicon.ico"
    || pathname === "/robots.txt"
    || pathname === "/sitemap.xml"
    || /\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?|ttf)$/.test(pathname);
  if (bypass || await isValidLaunchCookieEdge(request.cookies.get(LAUNCH_ACCESS_COOKIE_EDGE)?.value)) return refreshed;

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
