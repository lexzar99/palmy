import { NextRequest, NextResponse } from "next/server";
import { getServerPlatformAccessToken } from "@/lib/platformSession";

function getRequiredApiUrl() {
  // Server-side: API_URL prioriteras. Fallback: NEXT_PUBLIC_API_URL
  // (alltid satt eftersom client behöver den) → sista fallback prod-Railway
  // så proxyn aldrig kraschar i 500.
  const value =
    process.env.API_URL?.trim() ||
    process.env.NEXT_PUBLIC_API_URL?.trim() ||
    "https://palmy-production-2021.up.railway.app";

  return value;
}

async function proxyRequest(request: NextRequest, pathSegments: string[]) {
  // ALLT wrappat i try/catch för att aldrig returnera 500 med tom body —
  // varje fel ska komma tillbaka som JSON så browser-konsolen visar det.
  let stage = "init";
  try {
    stage = "resolve-api-url";
    const apiUrl = getRequiredApiUrl();

    stage = "read-cookie";
    const token = await getServerPlatformAccessToken().catch(() => null);

    stage = "build-target-url";
    const targetUrl = new URL(`/api/${pathSegments.join("/")}${request.nextUrl.search}`, apiUrl);

    stage = "read-body";
    const requestBody =
      request.method === "GET" || request.method === "HEAD" ? undefined : await request.text();

    stage = "build-headers";
    const headers = new Headers();
    const contentType = request.headers.get("content-type");
    const accept = request.headers.get("accept");
    if (contentType) headers.set("content-type", contentType);
    if (accept) headers.set("accept", accept);
    if (token) headers.set("authorization", `Bearer ${token}`);
    // Forward the idempotency key — it was being dropped here, so the API's
    // order-create idempotency never triggered (duplicate orders / orphaned
    // payments on a retry). With it forwarded, the existing server-side replay works.
    const idempotencyKey = request.headers.get("idempotency-key");
    if (idempotencyKey) headers.set("idempotency-key", idempotencyKey);

    stage = "fetch-upstream";
    const upstreamResponse = await fetch(targetUrl, {
      method: request.method,
      headers,
      body: requestBody,
      cache: "no-store",
    });

    stage = "build-response";
    const response = new NextResponse(upstreamResponse.body, {
      status: upstreamResponse.status,
    });
    const responseContentType = upstreamResponse.headers.get("content-type");
    const cacheControl = upstreamResponse.headers.get("cache-control");
    if (responseContentType) response.headers.set("content-type", responseContentType);
    response.headers.set("cache-control", cacheControl || "no-store");
    return response;
  } catch (err: any) {
    const detail = err?.message || String(err);
    console.error(`[platform-proxy] FAILED at stage="${stage}":`, detail);
    return NextResponse.json(
      { error: "Proxy-fel", stage, detail, path: pathSegments.join("/") },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest, context: RouteContext<"/api/platform/[...path]">) {
  const { path } = await context.params;
  return proxyRequest(request, path);
}

export async function POST(request: NextRequest, context: RouteContext<"/api/platform/[...path]">) {
  const { path } = await context.params;
  return proxyRequest(request, path);
}

export async function PUT(request: NextRequest, context: RouteContext<"/api/platform/[...path]">) {
  const { path } = await context.params;
  return proxyRequest(request, path);
}

export async function PATCH(request: NextRequest, context: RouteContext<"/api/platform/[...path]">) {
  const { path } = await context.params;
  return proxyRequest(request, path);
}

export async function DELETE(request: NextRequest, context: RouteContext<"/api/platform/[...path]">) {
  const { path } = await context.params;
  return proxyRequest(request, path);
}

// Force redeploy: 1777789352
