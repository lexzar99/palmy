import { NextResponse, type NextRequest } from "next/server";

/**
 * A2 — server-side route guard.
 *
 * Runs before any page in the (app) layout renders. If the admin's
 * httpOnly `admin_token` cookie is missing, we 302 to /login so no
 * dashboard markup ever ships to an unauthenticated visitor.
 *
 * The legacy localStorage path is intentionally not honoured here —
 * localStorage values never reach the server, so the only way to keep
 * a session alive across navigations is the cookie. Users who only
 * have a localStorage token will be redirected to /login once, log in
 * again, and pick up the new sameSite=none cross-site cookie that the
 * API now issues.
 */

// Paths that may render without an admin session.
const PUBLIC_PATHS = new Set<string>(["/login", "/", "/favicon.ico"]);

function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true;
  // Next.js internals + static assets — never gate these.
  if (pathname.startsWith("/_next/")) return true;
  if (pathname.startsWith("/static/")) return true;
  if (pathname.startsWith("/api/")) return true;
  // Files with extensions are static assets shipped from /public.
  const lastSlash = pathname.lastIndexOf("/");
  const tail = pathname.slice(lastSlash + 1);
  if (tail.includes(".")) return true;
  return false;
}

export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (isPublic(pathname)) return NextResponse.next();

  const hasCookie = Boolean(req.cookies.get("admin_token")?.value);
  if (hasCookie) return NextResponse.next();

  // No cookie — redirect to /login, preserving the original destination.
  const loginUrl = new URL("/login", req.url);
  const redirectTo = `${pathname}${search || ""}`;
  if (redirectTo && redirectTo !== "/login") {
    loginUrl.searchParams.set("next", redirectTo);
  }
  return NextResponse.redirect(loginUrl);
}

export const config = {
  // Run on every page navigation. The matcher excludes Next.js internals so
  // the redirect logic never touches /_next chunks, favicon, or RSC payloads.
  matcher: ["/((?!_next/|api/|favicon\\.ico).*)"],
};
