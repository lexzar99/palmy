import { NextRequest, NextResponse } from "next/server";
import { createHmac } from "node:crypto";
import { KIOSK_ACCESS_COOKIE } from "@/lib/kioskAccess";

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

type PartnerDecision =
  | { kind: "allowed"; partner: unknown }
  | { kind: "denied"; status: number }
  // API:t saknar endpointen (webben deployad före API:t) eller svarar inte.
  | { kind: "unavailable" };

function apiBaseUrl(): string {
  return process.env.API_URL?.trim() || process.env.NEXT_PUBLIC_API_URL?.trim() || "https://api.viaeats.se";
}

/** Reserv under övergången till fas 3, bara när API:t inte kan svara. */
function legacyAllowedRestaurant(slug: string): boolean {
  const configured = String(process.env.KIOSK_RESTAURANT_SLUGS || "palmyra-pizzeria-lund")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return configured.includes(slug);
}

/**
 * Frågar API:t om partnerns domän hör till restaurangen (RestaurantDomain).
 * Origin kommer från embed.js och kan förfalskas av den som anropar direkt.
 * Kontrollen stoppar okända domäner och fel restaurang. Kunddata skyddas av
 * att beviset bara ger rätt att skapa order och se status.
 */
async function decidePartner(slug: string, origin: string | null): Promise<PartnerDecision> {
  const url = new URL("/api/embed/partner", apiBaseUrl());
  url.searchParams.set("slug", slug);
  if (origin) url.searchParams.set("origin", origin);
  try {
    const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(4000) });
    const data = (await response.json().catch(() => null)) as { allowed?: unknown; partner?: unknown } | null;
    if (data && data.allowed === true) return { kind: "allowed", partner: data.partner ?? null };
    if (data && data.allowed === false) return { kind: "denied", status: response.status === 404 ? 404 : 403 };
    return { kind: "unavailable" };
  } catch {
    return { kind: "unavailable" };
  }
}

function cleanOrigin(value: string | null): string | null {
  if (!value || value.length > 256) return null;
  try {
    const url = new URL(value);
    return url.origin === value ? url.origin : null;
  } catch {
    return null;
  }
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
  const origin = cleanOrigin(request.nextUrl.searchParams.get("origin"));
  if (!slug || slug.length > 120 || !SLUG_PATTERN.test(slug)) {
    return NextResponse.json({ error: "Kiosk-läget är inte aktiverat för restaurangen" }, { status: 404 });
  }

  const decision = await decidePartner(slug, origin);
  if (decision.kind === "denied") {
    return NextResponse.json(
      { error: "Kiosk-läget är inte aktiverat för den här domänen" },
      { status: decision.status, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (decision.kind === "unavailable" && !legacyAllowedRestaurant(slug)) {
    return NextResponse.json({ error: "Kiosk-läget är inte aktiverat för restaurangen" }, { status: 404 });
  }

  const proof = createProof(slug);
  if (!proof) return NextResponse.json({ error: "Kiosk-konfiguration saknas" }, { status: 503 });

  const response = NextResponse.json(
    {
      ok: true,
      restaurantSlug: slug,
      proof,
      partner: decision.kind === "allowed" ? decision.partner : null,
    },
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
