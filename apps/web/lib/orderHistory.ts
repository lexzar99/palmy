// Lagrar order-references lokalt så att kund kan se sina senaste beställningar
// även utan inloggning. Lagras bara order-ID + telefon (för att kunna återhämta
// detaljer från /api/orders/:id?phone=...).
//
// Telefonen som sparas är den som användes vid checkout — vi använder den som
// "ägarbevis" mot backend istället för auth-token. Backend matchar
// query-phone mot order.customerPhone (se orders.ts ownership-check).

const KEY = "platform_order_history";
const MAX_ITEMS = 20;

export type StoredOrderRef = {
  id: string;
  phone: string;
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
