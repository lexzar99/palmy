// Lagrar icke-hemliga orderreferenser lokalt så att kunden kan se sina senaste
// beställningar även utan inloggning. Nya webbordrar använder en orderspecifik
// HttpOnly-session; accessToken finns bara för att växla bort äldre sparade
// credentials. Telefonnummer är visningsdata och ger aldrig API-behörighet.

const KEY = "platform_order_history";
const MAX_ITEMS = 20;

export type StoredOrderRef = {
  id: string;
  phone: string;
  accessToken?: string | null;
  createdAt: string;
  restaurantName?: string | null;
  restaurantSlug?: string | null;
  total?: number;
};

export function saveOrderToHistory(ref: StoredOrderRef): void {
  if (typeof window === "undefined") return;
  try {
    const existing = readOrderHistory();
    // Dedupe på id — om ordern redan finns, uppdatera dess plats till top
    const filtered = existing.filter((o) => o.id !== ref.id);
    const next = [ref, ...filtered].slice(0, MAX_ITEMS);
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // localStorage kvotad / inaktiverad — strunta i det, history är opt-in
  }
}

export function readOrderHistory(): StoredOrderRef[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (o): o is StoredOrderRef =>
        typeof o?.id === "string" && typeof o?.phone === "string" && typeof o?.createdAt === "string",
    );
  } catch {
    return [];
  }
}

export function removeOrderFromHistory(id: string): void {
  if (typeof window === "undefined") return;
  try {
    const existing = readOrderHistory();
    const next = existing.filter((o) => o.id !== id);
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // ignored
  }
}

export function clearOrderHistory(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignored
  }
}

/**
 * Remove legacy raw checkout credentials after the API has issued the
 * HttpOnly order session. Keep the non-secret order id/metadata for history.
 */
export function forgetRawOrderAccessToken(id: string): void {
  if (typeof window === "undefined") return;
  try {
    const next = readOrderHistory().map((order) =>
      order.id === id ? { ...order, accessToken: null } : order,
    );
    localStorage.setItem(KEY, JSON.stringify(next));

    if (localStorage.getItem("viaeats_active_order_id") === id) {
      localStorage.removeItem("viaeats_active_order_token");
    }

    const activeRaw = localStorage.getItem("viaeats_active_orders");
    if (activeRaw) {
      const active = JSON.parse(activeRaw);
      if (Array.isArray(active)) {
        localStorage.setItem(
          "viaeats_active_orders",
          JSON.stringify(active.map((order) =>
            String(order?.id || "") === id
              ? { ...order, token: null, accessToken: null, __trackingToken: null }
              : order,
          )),
        );
      }
    }

    if (localStorage.getItem("pending_order_id") === id) {
      localStorage.removeItem("pending_order_token");
    }
  } catch {
    // A blocked/corrupt localStorage must not invalidate the HttpOnly session.
  }
}
