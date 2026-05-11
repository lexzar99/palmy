export interface StoredAdminSession {
  id: string;
  email: string;
  name?: string;
  role: string;
  restaurantId?: string | null;
  restaurantSlug?: string | null;
  restaurantName?: string | null;
}

export const ADMIN_TOKEN_KEY = "matgo_token";
export const ADMIN_SESSION_KEY = "matgo_admin";

export const getStoredToken = () =>
  typeof window !== "undefined" ? localStorage.getItem(ADMIN_TOKEN_KEY) || "" : "";

export const getStoredAdmin = (): StoredAdminSession | null => {
  if (typeof window === "undefined") return null;

  try {
    const raw = localStorage.getItem(ADMIN_SESSION_KEY);
    return raw ? (JSON.parse(raw) as StoredAdminSession) : null;
  } catch {
    return null;
  }
};

export const setStoredAdminSession = (token: string, admin: StoredAdminSession) => {
  if (typeof window === "undefined") return;
  localStorage.setItem(ADMIN_TOKEN_KEY, token);
  localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(admin));
};

export const clearStoredAdminSession = () => {
  if (typeof window === "undefined") return;
  localStorage.removeItem(ADMIN_TOKEN_KEY);
  localStorage.removeItem(ADMIN_SESSION_KEY);
  // Rensa även HttpOnly cookie via /auth/logout-endpoint. Fire-and-forget —
  // även om servern inte svarar är localStorage redan rensad och nästa request
  // 401:ar utan auth.
  try {
    void fetch("/api/auth/logout", { method: "POST", credentials: "include" });
  } catch {
    // ignored — bästa effort
  }
};
