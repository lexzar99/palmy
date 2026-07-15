import { NextRequest, NextResponse } from "next/server";
import { isValidLaunchCode, launchCookieValue, LAUNCH_ACCESS_COOKIE } from "@/lib/launchAccess";

type AttemptState = { attempts: number; windowStartedAt: number; blockedUntil: number };
const globalAttempts = globalThis as typeof globalThis & {
  __viaeatsLaunchAttempts?: Map<string, AttemptState>;
};
const attempts = globalAttempts.__viaeatsLaunchAttempts ?? new Map<string, AttemptState>();
globalAttempts.__viaeatsLaunchAttempts = attempts;

const WINDOW_MS = 15 * 60 * 1000;
const BLOCK_MS = 30 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const MAX_TRACKED_CLIENTS = 10_000;

function pruneAttempts(now: number) {
  if (attempts.size < MAX_TRACKED_CLIENTS) return;
  for (const [key, state] of attempts) {
    const expired =
      state.blockedUntil <= now && now - state.windowStartedAt >= WINDOW_MS;
    if (expired) attempts.delete(key);
  }
  // Fast fail-safe mot obunden process-memory om många unika IP-adresser slår
  // på endpointen under samma 15-minutersfönster.
  while (attempts.size >= MAX_TRACKED_CLIENTS) {
    const oldestKey = attempts.keys().next().value as string | undefined;
    if (!oldestKey) break;
    attempts.delete(oldestKey);
  }
}

function clientKey(request: NextRequest) {
  return (request.headers.get("x-forwarded-for")?.split(",")[0] || request.headers.get("x-real-ip") || "unknown").trim();
}

function rateLimitState(key: string, now: number) {
  const current = attempts.get(key);
  if (!current || now - current.windowStartedAt >= WINDOW_MS) {
    const fresh = { attempts: 0, windowStartedAt: now, blockedUntil: 0 };
    attempts.set(key, fresh);
    return fresh;
  }
  return current;
}

export async function POST(request: NextRequest) {
  const now = Date.now();
  pruneAttempts(now);
  const key = clientKey(request);
  const state = rateLimitState(key, now);
  if (state.blockedUntil > now) {
    const retryAfter = Math.max(1, Math.ceil((state.blockedUntil - now) / 1000));
    return NextResponse.json(
      { error: "För många kodförsök. Vänta och försök igen." },
      { status: 429, headers: { "Retry-After": String(retryAfter), "Cache-Control": "no-store" } },
    );
  }

  const body = (await request.json().catch(() => null)) as { code?: string } | null;
  const code = typeof body?.code === "string" ? body.code.trim() : "";

  if (!code || !isValidLaunchCode(code)) {
    state.attempts += 1;
    if (state.attempts >= MAX_ATTEMPTS) state.blockedUntil = now + BLOCK_MS;
    attempts.set(key, state);
    return NextResponse.json(
      { error: "Koden är inte giltig" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  const value = launchCookieValue();
  if (!value) {
    return NextResponse.json({ error: "Launch-åtkomst är inte konfigurerad" }, { status: 503 });
  }

  const response = NextResponse.json({ ok: true });
  attempts.delete(key);
  response.headers.set("Cache-Control", "no-store");
  response.cookies.set(LAUNCH_ACCESS_COOKIE, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return response;
}
