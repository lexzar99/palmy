import { NextRequest, NextResponse } from "next/server";
import { isValidLaunchCode, launchCookieValue, LAUNCH_ACCESS_COOKIE } from "@/lib/launchAccess";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { code?: string } | null;
  const code = typeof body?.code === "string" ? body.code.trim() : "";

  if (!code || !isValidLaunchCode(code)) {
    return NextResponse.json({ error: "Koden är inte giltig" }, { status: 401 });
  }

  const value = launchCookieValue();
  if (!value) {
    return NextResponse.json({ error: "Launch-åtkomst är inte konfigurerad" }, { status: 503 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(LAUNCH_ACCESS_COOKIE, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return response;
}
