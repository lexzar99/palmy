import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { timingSafeEqual } from "crypto";

// On-demand cache purge for a single restaurant's SSR'd menu. Called by the API
// (packages/api broadcastMenuChange) the instant a menu changes, so edits show
// immediately instead of waiting for the time-based revalidate window.
//
// Security (must survive 10k users + bots): a public cache-purge endpoint is a
// trivial origin-DoS, so this REQUIRES a shared secret, is POST-only, validates
// a tiny bounded body, and only ever purges the three tags for one slug.
//
// Needs env REVALIDATE_SECRET (set the SAME value on Vercel/web and Railway/api).
// Until it's set, this is a safe no-op (503) and time-based revalidate still runs.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export async function POST(req: NextRequest) {
  const secret = process.env.REVALIDATE_SECRET;
  if (!secret) {
    return NextResponse.json(
      { ok: false, error: "revalidation disabled" },
      { status: 503 },
    );
  }

  const provided = req.headers.get("x-revalidate-secret") || "";
  if (!safeEqual(provided, secret)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "bad body" }, { status: 400 });
  }

  const slug =
    body && typeof (body as { slug?: unknown }).slug === "string"
      ? (body as { slug: string }).slug.slice(0, 200)
      : "";
  // Slugs are simple kebab tokens — reject anything else so the tag is bounded.
  if (!slug || !/^[a-z0-9-]+$/i.test(slug)) {
    return NextResponse.json({ ok: false, error: "invalid slug" }, { status: 400 });
  }

  // Targeted purge — never a blanket revalidate (that would cold-render every
  // restaurant at once under load). `{ expire: 0 }` = immediate expiration so
  // the next visitor gets fresh data ("instant update"); this is the exact case
  // the Next 16 docs recommend `{ expire: 0 }` for (external webhook → route
  // handler that needs immediate freshness). Single-arg form is deprecated in 16.
  revalidateTag(`menu:${slug}`, { expire: 0 });
  revalidateTag(`deals:${slug}`, { expire: 0 });
  revalidateTag(`restaurant:${slug}`, { expire: 0 });

  return NextResponse.json({ ok: true, revalidated: slug });
}

// Block anything that isn't POST so crawlers/prefetch can't trigger it.
export function GET() {
  return NextResponse.json({ ok: false, error: "method not allowed" }, { status: 405 });
}
