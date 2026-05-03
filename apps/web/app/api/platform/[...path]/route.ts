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
  const apiUrl = getRequiredApiUrl();
  const token = await getServerPlatformAccessToken();
  const targetUrl = new URL(`/api/${pathSegments.join("/")}${request.nextUrl.search}`, apiUrl);
  const requestBody = request.method === "GET" || request.method === "HEAD" ? undefined : await request.text();
  const headers = new Headers();
  const contentType = request.headers.get("content-type");
  const accept = request.headers.get("accept");

  if (contentType) {
    headers.set("content-type", contentType);
  }

  if (accept) {
    headers.set("accept", accept);
  }

  if (token) {
    headers.set("authorization", `Bearer ${token}`);
  }

  const upstreamResponse = await fetch(targetUrl, {
    method: request.method,
    headers,
    body: requestBody,
    cache: "no-store",
  });

  const response = new NextResponse(upstreamResponse.body, {
    status: upstreamResponse.status,
  });

  const responseContentType = upstreamResponse.headers.get("content-type");
  const cacheControl = upstreamResponse.headers.get("cache-control");

  if (responseContentType) {
    response.headers.set("content-type", responseContentType);
  }

  if (cacheControl) {
    response.headers.set("cache-control", cacheControl);
  } else {
    response.headers.set("cache-control", "no-store");
  }

  return response;
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
