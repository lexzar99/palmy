"use client";

const PLATFORM_SESSION_CHANGED_EVENT = "platform-session-changed";

function emitPlatformSessionChanged() {
  window.dispatchEvent(new Event(PLATFORM_SESSION_CHANGED_EVENT));
}

export function clearLegacyPlatformUserToken() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem("platform_user_token");
}

export async function persistPlatformSession(token: string) {
  const response = await fetch("/api/platform/session", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ token }),
  });

  if (!response.ok) {
    throw new Error("Kunde inte skapa session");
  }

  clearLegacyPlatformUserToken();
  emitPlatformSessionChanged();
}

export async function clearPlatformSession() {
  await fetch("/api/platform/session", {
    method: "DELETE",
  });

  clearLegacyPlatformUserToken();
  emitPlatformSessionChanged();
}

export async function getPlatformSessionStatus() {
  try {
    const response = await fetch("/api/platform/session", {
      cache: "no-store",
    });

    if (!response.ok) {
      return false;
    }

    const data = (await response.json()) as { authenticated?: boolean };
    return Boolean(data.authenticated);
  } catch {
    return false;
  }
}

export { PLATFORM_SESSION_CHANGED_EVENT };
