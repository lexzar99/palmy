import { NextRequest, NextResponse } from "next/server";

// Invite landing — /i/<token>. Sets a first-party `dlv_ref` cookie (carried into
// signup for attribution) and redirects to the home page. `?ref=` is mirrored
// for the register page's existing prefill. /i/<token> and the legacy
// /r/<code> resolve the same identifier (User.referralCode).
export async function GET(req: NextRequest, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const clean = (token || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 32);

  const dest = new URL("/", req.url);
  if (clean) dest.searchParams.set("ref", clean);

  const res = NextResponse.redirect(dest);
  if (clean) {
    res.cookies.set("dlv_ref", clean, {
      maxAge: 60 * 60 * 24 * 30, // 30 dagar
      sameSite: "lax",
      path: "/",
    });
  }
  return res;
}
