import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  clearPlatformSessionCookie,
  PLATFORM_SESSION_COOKIE_NAME,
  setPlatformSessionCookie,
} from "@/lib/platformSession";

export async function GET() {
  // VIKTIGT: kolla BARA platform_session-cookien, INTE fallback till Supabase
  // access_token. Tidigare returnerade detta `authenticated: true` när bara
  // Supabase-session fanns → frontend trodde att den var inloggad → kallade
  // /api/platform/profile med Supabase-token → backend avvisade (förväntar
  // platform-JWT) → 401 → automatisk logout efter Apple sign-in.
  //
  // Nu: bara TRUE om vi har ett riktigt platform-JWT i cookien. Frontend ser
  // FALSE och triggar OAuth-token-exchange korrekt.
  const cookieStore = await cookies();
  const platformToken = cookieStore.get(PLATFORM_SESSION_COOKIE_NAME)?.value;

  return NextResponse.json(
    { authenticated: Boolean(platformToken) },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { token?: string } | null;
  const token = body?.token?.trim();

  if (!token) {
    return NextResponse.json({ error: "Token krävs" }, { status: 400 });
  }

  await setPlatformSessionCookie(token);

  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}

export async function DELETE() {
  await clearPlatformSessionCookie();

  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
