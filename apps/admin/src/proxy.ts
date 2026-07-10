import { NextResponse, type NextRequest } from "next/server";

/**
 * Server-side route guard. This is an optimistic cookie check; the API still
 * performs the authoritative SUPER_ADMIN verification for every protected
 * request.
 */
const PUBLIC_PATHS = new Set<string>(["/login", "/", "/favicon.ico"]);

function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true;
  if (pathname.startsWith("/_next/")) return true;
  if (pathname.startsWith("/static/")) return true;
  if (pathname.startsWith("/api/")) return true;

  const lastSlash = pathname.lastIndexOf("/");
  const tail = pathname.slice(lastSlash + 1);
  return tail.includes(".");
}

export function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (isPublic(pathname)) return NextResponse.next();

  const hasCookie = Boolean(req.cookies.get("admin_token")?.value);
  if (hasCookie) return NextResponse.next();

  const loginUrl = new URL("/login", req.url);
  const redirectTo = `${pathname}${search || ""}`;
  if (redirectTo && redirectTo !== "/login") {
    loginUrl.searchParams.set("next", redirectTo);
  }
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/|api/|favicon\\.ico).*)"],
};
