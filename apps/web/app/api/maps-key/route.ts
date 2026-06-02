import { NextResponse } from "next/server";

// Returnerar Google Maps browser-nyckeln vid RUNTIME (server-side env) i stället
// för att förlita sig på att NEXT_PUBLIC_* inlinas vid build. Detta gör att
// kartan funkar i produktion även om NEXT_PUBLIC_GOOGLE_MAPS_KEY inte hann med
// i builden — så länge nyckeln finns i Vercel-env (något av namnen nedan).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  const key =
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ||
    process.env.GOOGLE_MAPS_BROWSER_KEY ||
    process.env.GOOGLE_MAPS_KEY ||
    "";
  return NextResponse.json(
    { key },
    { headers: { "Cache-Control": "public, max-age=300, s-maxage=300" } },
  );
}
