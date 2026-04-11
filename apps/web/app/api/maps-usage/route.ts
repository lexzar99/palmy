/**
 * GET /api/maps-usage
 * Returns Google Maps API usage statistics for the admin dashboard.
 * Protected by a simple secret token so random users can't see it.
 */
import { NextRequest, NextResponse } from "next/server";
import { getUsageStats, clearFlag } from "@/lib/mapsRateLimit";

const ADMIN_SECRET = process.env.ADMIN_API_SECRET || process.env.JWT_SECRET || "dev-secret";

export async function GET(req: NextRequest) {
  const token = req.headers.get("x-admin-token") || req.nextUrl.searchParams.get("token");
  if (!token || token !== ADMIN_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json(getUsageStats());
}

// DELETE /api/maps-usage?ip=x.x.x.x — clear a flagged IP
export async function DELETE(req: NextRequest) {
  const token = req.headers.get("x-admin-token") || req.nextUrl.searchParams.get("token");
  if (!token || token !== ADMIN_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const ip = req.nextUrl.searchParams.get("ip");
  if (ip) clearFlag(ip);
  return NextResponse.json({ ok: true });
}
