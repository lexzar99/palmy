import { NextRequest, NextResponse } from "next/server";
import {
  getPlatformSessionCookieOptions,
  getServerPlatformAccessToken,
  PLATFORM_LOGGED_OUT_COOKIE_NAME,
  PLATFORM_LOGGED_OUT_COOKIE_VALUE,
  PLATFORM_SESSION_COOKIE_NAME,
} from "@/lib/platformSession";
import { isValidLaunchCookie, LAUNCH_ACCESS_COOKIE } from "@/lib/launchAccess";
import {
  getOrderSessionCookieOptions,
  ORDER_SESSION_COOKIE_PREFIX,
  ORDER_SESSION_HEADER,
  ORDER_SESSION_ID_HEADER,
  orderSessionCookieName,
} from "@/lib/orderSession";
import { KIOSK_ACCESS_COOKIE } from "@/lib/kioskAccess";

type PlatformRouteContext = {
  params: Promise<{ path: string[] }>;
};

function getRequiredApiUrl() {
  // Server-side: API_URL prioriteras. Fallback: NEXT_PUBLIC_API_URL
  // (alltid satt eftersom client behöver den) → sista fallback prod-Railway
  // så proxyn aldrig kraschar i 500.
  const value =
    process.env.API_URL?.trim() ||
    process.env.NEXT_PUBLIC_API_URL?.trim() ||
    "https://api.viaeats.se";

  return value;
}

function requestOrderId(pathSegments: string[], requestBody?: string): string | null {
  if (pathSegments[0] === "orders" && pathSegments[1]) {
    return orderSessionCookieName(pathSegments[1]) ? pathSegments[1] : null;
  }
  if (pathSegments[0] === "payments" && pathSegments[1] === "status" && pathSegments[2]) {
    return orderSessionCookieName(pathSegments[2]) ? pathSegments[2] : null;
  }
  if (!requestBody) return null;
  try {
    const parsed = JSON.parse(requestBody) as { orderId?: unknown };
    const value = typeof parsed?.orderId === "string" ? parsed.orderId : "";
    return orderSessionCookieName(value) ? value : null;
  } catch {
    return null;
  }
}

function expireCustomerCredentials(response: NextResponse, request: NextRequest) {
  response.cookies.set(PLATFORM_SESSION_COOKIE_NAME, "", {
    ...getPlatformSessionCookieOptions(),
    maxAge: 0,
  });
  for (const cookie of request.cookies.getAll()) {
    if (!cookie.name.startsWith(ORDER_SESSION_COOKIE_PREFIX)) continue;
    response.cookies.set(cookie.name, "", {
      ...getOrderSessionCookieOptions(),
      maxAge: 0,
    });
  }
}

function expirePlatformCredential(response: NextResponse) {
  response.cookies.set(PLATFORM_SESSION_COOKIE_NAME, "", {
    ...getPlatformSessionCookieOptions(),
    maxAge: 0,
  });
}

async function isInvalidCustomerSession(response: Response) {
  if (response.status !== 401) return false;
  const body = await response.clone().json().catch(() => null) as { code?: unknown } | null;
  return body?.code === "CUSTOMER_SESSION_NOT_ALLOWED";
}

async function proxyRequest(request: NextRequest, pathSegments: string[]) {
  // ALLT wrappat i try/catch för att aldrig returnera 500 med tom body —
  // varje fel ska komma tillbaka som JSON så browser-konsolen visar det.
  let stage = "init";
  try {
    const logoutSentinel =
      request.cookies.get(PLATFORM_LOGGED_OUT_COOKIE_NAME)?.value ===
      PLATFORM_LOGGED_OUT_COOKIE_VALUE;
    const isPushRevocation =
      request.method === "POST" &&
      pathSegments.length === 2 &&
      pathSegments[0] === "push" &&
      pathSegments[1] === "unsubscribe";
    if (logoutSentinel && !isPushRevocation) {
      const denied = NextResponse.json(
        { error: "Utloggad", code: "PLATFORM_LOGGED_OUT" },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      );
      expireCustomerCredentials(denied, request);
      return denied;
    }

    stage = "resolve-api-url";
    const apiUrl = getRequiredApiUrl();

    stage = "read-cookie";
    const token = await getServerPlatformAccessToken().catch(() => null);

    stage = "build-target-url";
    const targetUrl = new URL(`/api/${pathSegments.join("/")}${request.nextUrl.search}`, apiUrl);
    // Defense in depth: raw bearer secrets are never forwarded from a URL,
    // even if an old bookmark or native redirect still carries that parameter.
    targetUrl.searchParams.delete("token");

    stage = "read-body";
    const requestBody =
      request.method === "GET" || request.method === "HEAD" ? undefined : await request.text();

    const orderId = requestOrderId(pathSegments, requestBody);

    stage = "build-headers";
    const headers = new Headers();
    const contentType = request.headers.get("content-type");
    const accept = request.headers.get("accept");
    if (contentType) headers.set("content-type", contentType);
    if (accept) headers.set("accept", accept);
    if (token) headers.set("authorization", `Bearer ${token}`);
    if (orderId) {
      const orderCookieName = orderSessionCookieName(orderId);
      const orderSession = orderCookieName
        ? request.cookies.get(orderCookieName)?.value
        : null;
      if (orderSession) headers.set(ORDER_SESSION_HEADER, orderSession);
    }
    const launchProof = request.cookies.get(LAUNCH_ACCESS_COOKIE)?.value;
    if (isValidLaunchCookie(launchProof)) {
      headers.set("x-viaeats-launch-access", launchProof!);
    }
    // Embedded partner pages may not be allowed to send the HttpOnly cookie
    // from inside a third-party iframe. In that case the client sends the
    // short-lived proof returned by /api/kiosk/session. The API validates the
    // signature and restaurant binding before allowing checkout.
    const kioskProof =
      request.headers.get("x-viaeats-kiosk-access") ||
      request.cookies.get(KIOSK_ACCESS_COOKIE)?.value;
    if (kioskProof) headers.set("x-viaeats-kiosk-access", kioskProof);
    // Denna proxy används bara av webb-kunden, så markera klienttypen. Backend
    // använder den för plattforms-låsta rabattkoder (t.ex. app-only-koder som
    // inte får lösas in via webben).
    headers.set("x-client-type", "web");
    // Forward the idempotency key — it was being dropped here, so the API's
    // order-create idempotency never triggered (duplicate orders / orphaned
    // payments on a retry). With it forwarded, the existing server-side replay works.
    const idempotencyKey = request.headers.get("idempotency-key");
    if (idempotencyKey) headers.set("idempotency-key", idempotencyKey);

    stage = "fetch-upstream";
    // 15s timeout so a slow/stuck upstream can't pile up Vercel function instances
    // under load. 15s is well above order-create p99 (sub-second + one Stripe call),
    // and the forwarded Idempotency-Key makes any client retry safe (server replays).
    let upstreamResponse = await fetch(targetUrl, {
      method: request.method,
      headers,
      body: requestBody,
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });

    // En utgången/roterad HttpOnly-kundtoken ska inte blockera en kund från
    // att beställa som gäst. Order-API:t avvisar den gamla bearern innan någon
    // order skapas, så samma idempotenta request kan säkert göras om utan den.
    // Behåll däremot de orderspecifika cookies som den nya gästordern behöver.
    const recoveredAsGuest =
      request.method === "POST" &&
      pathSegments.length === 1 &&
      pathSegments[0] === "orders" &&
      Boolean(token) &&
      await isInvalidCustomerSession(upstreamResponse);
    if (recoveredAsGuest) {
      headers.delete("authorization");
      upstreamResponse = await fetch(targetUrl, {
        method: request.method,
        headers,
        body: requestBody,
        cache: "no-store",
        signal: AbortSignal.timeout(15000),
      });
    }

    stage = "build-response";
    const response = new NextResponse(upstreamResponse.body, {
      status: upstreamResponse.status,
    });
    const responseContentType = upstreamResponse.headers.get("content-type");
    const cacheControl = upstreamResponse.headers.get("cache-control");
    if (responseContentType) response.headers.set("content-type", responseContentType);
    response.headers.set("cache-control", cacheControl || "no-store");

    // The API signs the order-scoped proof. This proxy is the only layer that
    // receives it and converts it into a browser credential; the internal
    // header is intentionally never copied to the public response.
    const issuedOrderSession = upstreamResponse.headers.get(ORDER_SESSION_HEADER);
    const issuedOrderId = upstreamResponse.headers.get(ORDER_SESSION_ID_HEADER);
    const issuedCookieName = issuedOrderId ? orderSessionCookieName(issuedOrderId) : null;
    if (issuedOrderSession && issuedCookieName) {
      response.cookies.set(issuedCookieName, issuedOrderSession, getOrderSessionCookieOptions());
    }
    if (recoveredAsGuest) expirePlatformCredential(response);
    return response;
  } catch (err) {
    const e = err as { message?: string; name?: string } | null;
    const detail = e?.message || String(err);
    // Log the internal detail server-side ONLY — never return the upstream host /
    // connection error (e.g. "ECONNREFUSED <railway-host>") to the client.
    console.error(`[platform-proxy] FAILED at stage="${stage}":`, detail);
    const isTimeout = e?.name === "TimeoutError" || e?.name === "AbortError";
    return NextResponse.json(
      { error: isTimeout ? "Tidsgräns mot servern, försök igen." : "Tjänsten är tillfälligt otillgänglig, försök igen." },
      { status: stage === "fetch-upstream" ? 502 : 500 },
    );
  }
}

export async function GET(request: NextRequest, context: PlatformRouteContext) {
  const { path } = await context.params;
  return proxyRequest(request, path);
}

export async function POST(request: NextRequest, context: PlatformRouteContext) {
  const { path } = await context.params;
  return proxyRequest(request, path);
}

export async function PUT(request: NextRequest, context: PlatformRouteContext) {
  const { path } = await context.params;
  return proxyRequest(request, path);
}

export async function PATCH(request: NextRequest, context: PlatformRouteContext) {
  const { path } = await context.params;
  return proxyRequest(request, path);
}

export async function DELETE(request: NextRequest, context: PlatformRouteContext) {
  const { path } = await context.params;
  return proxyRequest(request, path);
}

// Force redeploy: 1777789352
