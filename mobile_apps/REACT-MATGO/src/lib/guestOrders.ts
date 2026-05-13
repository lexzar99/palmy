// Lagrar order-references lokalt så att kund kan se sina senaste beställningar
// även utan inloggning. Lagras bara order-ID + telefon (för att kunna återhämta
// detaljer från /api/orders/:id?phone=...).
//
// Telefonen som sparas är den som användes vid checkout — vi använder den som
// "ägarbevis" mot backend istället för auth-token. Backend matchar
// query-phone mot order.customerPhone (se orders.ts ownership-check).
//
// Mirror av apps/web/lib/orderHistory.ts men för React Native (AsyncStorage
// istället för localStorage). Samma datashape så användaren får samma
// upplevelse på båda plattformar.

import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "matgo_guest_orders";
const MAX_ITEMS = 20;

export type GuestOrder = {
  id: string;
  phone: string;
  createdAt: string;
  restaurantName?: string | null;
  restaurantSlug?: string | null;
  total?: number;
};

export async function saveGuestOrder(ref: GuestOrder): Promise<void> {
  try {
    const existing = await getGuestOrders();
    // Dedupe på id — om ordern redan finns, uppdatera dess plats till top
    const filtered = existing.filter((o) => o.id !== ref.id);
    const next = [ref, ...filtered].slice(0, MAX_ITEMS);
    await AsyncStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // AsyncStorage kvotad / inaktiverad — strunta i det, history är opt-in
  }
}

export async function getGuestOrders(): Promise<GuestOrder[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (o): o is GuestOrder =>
        typeof o?.id === "string" && typeof o?.phone === "string" && typeof o?.createdAt === "string",
    );
  } catch {
    return [];
  }
}

export async function removeGuestOrder(id: string): Promise<void> {
  try {
    const existing = await getGuestOrders();
    const next = existing.filter((o) => o.id !== id);
    await AsyncStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // ignored
  }
}

export async function clearGuestOrders(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    // ignored
  }
}
