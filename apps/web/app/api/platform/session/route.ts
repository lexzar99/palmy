import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  clearPlatformLoggedOutCookie,
  clearPlatformSessionCookie,
  PLATFORM_LOGGED_OUT_COOKIE_NAME,
  PLATFORM_LOGGED_OUT_COOKIE_VALUE,
  PLATFORM_SESSION_COOKIE_NAME,
  setPlatformLoggedOutCookie,
  setPlatformSessionCookie,
} from "@/lib/platformSession";
import {
  getOrderSessionCookieOptions,
  ORDER_SESSION_COOKIE_PREFIX,
} from "@/lib/orderSession";
import { classifyPlatformSessionTransition } from "@/lib/platformSessionTransition";

function platformCustomerId(token: string | undefined): string | null {
  if (!token || token.length > 8192) return null;
  try {
    const parts = token.split(".");
    if (parts.length !== 3 || !parts[1]) return null;
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as {
      id?: unknown;
      role?: unknown;
    };
    return payload.role === "USER" && typeof payload.id === "string" && payload.id
      ? payload.id
      : null;
  } catch {
    return null;
  }
}

function platformApiUrl() {
  return (
    process.env.API_URL?.trim() ||
    process.env.NEXT_PUBLIC_API_URL?.trim() ||
    "https://api.viaeats.se"
  ).replace(/\/$/, "");
}

async function verifyActivePlatformCustomer(token: string, expectedId: string) {
  try {
    const response = await fetch(`${platformApiUrl()}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) return false;
    const profile = (await response.json().catch(() => null)) as { id?: unknown } | null;
    return profile?.id === expectedId;
  } catch {
    return false;
  }
}

async function clearAllOrderSessionCookies() {
  const cookieStore = await cookies();
  for (const cookie of cookieStore.getAll()) {
    if (!cookie.name.startsWith(ORDER_SESSION_COOKIE_PREFIX)) continue;
    cookieStore.set(cookie.name, "", {
      ...getOrderSessionCookieOptions(),
      maxAge: 0,
    });
  }
}

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
  const loggedOut =
    cookieStore.get(PLATFORM_LOGGED_OUT_COOKIE_NAME)?.value ===
    PLATFORM_LOGGED_OUT_COOKIE_VALUE;
  const platformToken = cookieStore.get(PLATFORM_SESSION_COOKIE_NAME)?.value;

  if (loggedOut) {
    await clearPlatformSessionCookie();
    await clearAllOrderSessionCookies();
  }

  return NextResponse.json(
    { authenticated: !loggedOut && Boolean(platformToken) },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as {
    token?: string;
    previousCustomerId?: unknown;
  } | null;
  const token = body?.token?.trim();
  const markerCandidate = typeof body?.previousCustomerId === "string"
    ? body.previousCustomerId.trim()
    : "";
  const previousCustomerMarker = markerCandidate && markerCandidate.length <= 256
    ? markerCandidate
    : null;

  const nextCustomerId = platformCustomerId(token);
  if (!token || !nextCustomerId) {
    return NextResponse.json({ error: "Giltig kundtoken krävs" }, { status: 400 });
  }
  if (!(await verifyActivePlatformCustomer(token, nextCustomerId))) {
    return NextResponse.json(
      { error: "Kundsessionen kunde inte verifieras" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  const cookieStore = await cookies();
  const previousToken = cookieStore.get(PLATFORM_SESSION_COOKIE_NAME)?.value;
  const previousCookieCustomerId = platformCustomerId(previousToken);
  const transition = classifyPlatformSessionTransition({
    hadPreviousCookie: Boolean(previousToken),
    previousCookieCustomerId,
    previousCustomerMarker,
    nextCustomerId,
  });
  const { clearCustomerState, revokePush } = transition;
  // Backward-compatible alias for older web bundles. It now means a definite
  // customer-state boundary, while `revokePush` independently covers an
  // unknown/missing server identity without deleting a legitimate guest cart.
  const identityChanged = clearCustomerState;

  // Only a definite account change/invalid cookie loses order capabilities.
  // Missing-cookie guest/same-marker recovery keeps its HttpOnly order session;
  // the independent push decision still fails closed in that branch.
  if (clearCustomerState) await clearAllOrderSessionCookies();
  await setPlatformSessionCookie(token);
  await clearPlatformLoggedOutCookie();

  return NextResponse.json(
    {
      ok: true,
      customerId: nextCustomerId,
      clearCustomerState,
      revokePush,
      identityChanged,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function DELETE(_request: NextRequest) {
  // The deny-only sentinel is written before credentials are expired. Even if
  // a later response is interrupted, subsequent proxy calls fail closed.
  await setPlatformLoggedOutCookie();
  await clearPlatformSessionCookie();
  await clearAllOrderSessionCookies();

  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
