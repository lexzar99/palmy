/**
 * GET /api/maps-usage
 * Returns Google Maps API usage statistics for the admin dashboard.
 * Protected by a simple secret token so random users can't see it.
 */
import { NextRequest, NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { getUsageStats, clearFlag } from "@/lib/mapsRateLimit";

function authorized(request: NextRequest) {
  const expected = process.env.ADMIN_API_SECRET?.trim();
  const token = request.headers.get("x-admin-token")?.trim();
  if (!expected || !token) return false;
  const actualDigest = createHash("sha256").update(token, "utf8").digest();
  const expectedDigest = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(actualDigest, expectedDigest);
}

export async function GET(req: NextRequest) {
  if (!process.env.ADMIN_API_SECRET?.trim()) {
    return NextResponse.json({ error: "Adminåtkomst är inte konfigurerad" }, { status: 503 });
  }
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json(getUsageStats(), { headers: { "Cache-Control": "no-store" } });
}

// DELETE /api/maps-usage?ip=x.x.x.x — clear a flagged IP
export async function DELETE(req: NextRequest) {
  if (!process.env.ADMIN_API_SECRET?.trim()) {
    return NextResponse.json({ error: "Adminåtkomst är inte konfigurerad" }, { status: 503 });
  }
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const ip = req.nextUrl.searchParams.get("ip");
  if (ip) clearFlag(ip);
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
