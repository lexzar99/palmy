import { NextRequest, NextResponse } from "next/server";

// Öppettider och öppet läge till restaurangernas egna hemsidor. Svaret cachas med
// taggen restaurant:<slug>, som API:t rensar via /api/revalidate när något ändras.
// Vanliga besök når alltså aldrig databasen. Fem minuter är skyddsnätet om en
// rensning skulle tappas bort.
const SAFETY_SECONDS = 300;
const API_URL = process.env.API_PROXY_TARGET || process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:4000";
const HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Cache-Control": "public, max-age=0, s-maxage=30, stale-while-revalidate=30",
};

export async function GET(_request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!/^[a-z0-9-]{1,120}$/.test(slug)) {
    return NextResponse.json({ error: "Ogiltig restaurang" }, { status: 400, headers: HEADERS });
  }
  const upstream = await fetch(`${API_URL.replace(/\/$/, "")}/api/restaurants/${slug}/status`, {
    next: { revalidate: SAFETY_SECONDS, tags: [`restaurant:${slug}`] },
  }).catch(() => null);
  if (!upstream?.ok) {
    return NextResponse.json({ error: "Läget går inte att hämta" }, { status: upstream?.status === 404 ? 404 : 503, headers: { ...HEADERS, "Cache-Control": "no-store" } });
  }
  return NextResponse.json(await upstream.json(), { headers: HEADERS });
}
