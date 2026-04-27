import { NextRequest, NextResponse } from "next/server";
import {
  clearPlatformSessionCookie,
  getServerPlatformAccessToken,
  setPlatformSessionCookie,
} from "@/lib/platformSession";

export async function GET() {
  const token = await getServerPlatformAccessToken();

  return NextResponse.json({ authenticated: Boolean(token) }, { headers: { "Cache-Control": "no-store" } });
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
