export interface StoredAdminSession {
  id: string;
  email: string;
  name?: string;
  username?: string | null;
  avatarUrl?: string | null;
  role: string;
  restaurantId?: string | null;
  restaurantSlug?: string | null;
  restaurantName?: string | null;
}

const LEGACY_ADMIN_TOKEN_KEY = "viaeats_token";
export const ADMIN_SESSION_KEY = "viaeats_admin";

const removeLegacyBearerToken = () => {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(LEGACY_ADMIN_TOKEN_KEY);
  } catch {
    // Storage may be unavailable in hardened/private browser contexts.
  }
};

removeLegacyBearerToken();

export const getStoredAdmin = (): StoredAdminSession | null => {
  if (typeof window === "undefined") return null;

  try {
    removeLegacyBearerToken();
    const raw = localStorage.getItem(ADMIN_SESSION_KEY);
    return raw ? (JSON.parse(raw) as StoredAdminSession) : null;
  } catch {
    return null;
  }
};

export const setStoredAdminSession = (admin: StoredAdminSession) => {
  if (typeof window === "undefined") return;
  removeLegacyBearerToken();
  localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(admin));
};

export const clearStoredAdminSession = () => {
  if (typeof window === "undefined") return;
  removeLegacyBearerToken();
  localStorage.removeItem(ADMIN_SESSION_KEY);
};

export const logoutAdminSession = async (everywhere = false) => {
  try {
    await fetch(everywhere ? "/api/auth/logout-everywhere" : "/api/auth/logout", {
      method: "POST",
      credentials: "include",
    });
  } catch {
    // Local session metadata must still be removed if the logout request fails.
  } finally {
    clearStoredAdminSession();
  }
};
