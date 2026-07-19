import { NextRequest, NextResponse } from "next/server";
import { createHmac } from "node:crypto";
import { KIOSK_ACCESS_COOKIE } from "@/lib/kioskAccess";

function allowedRestaurant(slug: string): boolean {
  const configured = String(process.env.KIOSK_RESTAURANT_SLUGS || "palmyra-pizzeria-lund")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return configured.includes(slug);
}

function createProof(slug: string): string | null {
  const secret = String(process.env.LAUNCH_ACCESS_COOKIE_SECRET || process.env.NEXTAUTH_SECRET || "").trim();
  if (!secret) return null;
  const expiresAt = Math.floor(Date.now() / 1000) + 24 * 60 * 60;
  const payload = `${slug}:${expiresAt}`;
  const signature = createHmac("sha256", secret).update(`kiosk:${payload}`).digest("hex");
  return `${Buffer.from(payload).toString("base64url")}.${signature}`;
}

export async function GET(request: NextRequest) {
  const slug = request.nextUrl.searchParams.get("slug")?.trim() || "";
  if (!slug || !allowedRestaurant(slug)) {
    return NextResponse.json({ error: "Kiosk-läget är inte aktiverat för restaurangen" }, { status: 404 });
  }
  const proof = createProof(slug);
  if (!proof) return NextResponse.json({ error: "Kiosk-konfiguration saknas" }, { status: 503 });

  const response = NextResponse.json(
    { ok: true, restaurantSlug: slug, proof },
    { headers: { "Cache-Control": "no-store" } },
  );
  response.cookies.set(KIOSK_ACCESS_COOKIE, proof, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 24 * 60 * 60,
  });
  return response;
}
