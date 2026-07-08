import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface CartItem {
  cartItemId: string; // Unikt id för denna specifika rad i korgen
  productId: string;
  restaurantId: string;
  name: string;
  imageUrl?: string | null; // Produktbild (visas i kassan om satt)
  price: number; // Baspris i kr
  quantity: number;
  extras: {
    groupId: string;
    groupName: string;
    extraId: string;
    name: string;
    price: number;
    quantity?: number; // Antal av detta tillval (allowQuantity-grupper); default 1
  }[];
  note?: string;
  bogoFreeFromDealId?: string; // Satt om raden är en BOGO-gratisvara
}

export type BogoChoice = {
  dealId: string;
  dealTitle: string;
  product: { id: string; name: string; price: number; imageUrl?: string | null };
  rewardCategoryName?: string | null;
};

interface CartStore {
  items: CartItem[];
  restaurantId: string | null;
  restaurantSlug: string | null;
  lastAddedItemName: string | null;
  lastAddedAt: number;
  deliveryOverrides: Record<string, { deliveryFee: number; minOrderAmount: number }>;
  bogoChoice: BogoChoice | null;
  addItem: (item: Omit<CartItem, 'cartItemId'> & { restaurantSlug?: string }) => void;
  removeItem: (cartItemId: string) => void;
  updateQuantity: (cartItemId: string, amount: number) => void;
  /** Update an entire cart line (extras, note, price, name, quantity) in-place. */
  updateItem: (cartItemId: string, patch: Partial<Omit<CartItem, 'cartItemId'>>) => void;
  clearCart: () => void;
  getTotal: () => number;
  setDeliveryOverrides: (overrides: Record<string, { deliveryFee: number; minOrderAmount: number }>) => void;
  /** Update a single restaurant's delivery override without clearing others */
  updateDeliveryOverride: (restaurantId: string, deliveryFee: number, minOrderAmount: number) => void;
  setBogoChoice: (choice: BogoChoice | null) => void;
}

export const useCartStore = create<CartStore>()(
  persist(
    (set, get) => ({
      items: [],
      restaurantId: null,
      restaurantSlug: null,
      lastAddedItemName: null,
      lastAddedAt: 0,
      deliveryOverrides: {},
      bogoChoice: null,
      addItem: (item) => set((state) => {
        const isDifferentRestaurant = state.items.length > 0 && state.restaurantId !== item.restaurantId;
        const nextRestaurantSlug = item.restaurantSlug ?? state.restaurantSlug ?? null;
        
        if (isDifferentRestaurant) {
           // We expect the caller to have already confirmed this via window.confirm
           // If they didn't, we still clear here to prevent mixed restaurants in one order.
           // Nolla bogoChoice — det hörde till den gamla restaurangens deal.
           return {
             items: [{ ...item, cartItemId: Math.random().toString(36).substr(2, 9) }],
             restaurantId: item.restaurantId,
             restaurantSlug: item.restaurantSlug ?? null,
             lastAddedItemName: item.name,
             lastAddedAt: Date.now(),
             bogoChoice: null,
           };
        }

        return {
          items: [...state.items, { ...item, cartItemId: Math.random().toString(36).substr(2, 9) }],
          restaurantId: item.restaurantId,
          restaurantSlug: nextRestaurantSlug,
          lastAddedItemName: item.name,
          lastAddedAt: Date.now(),
        };
      }),
      removeItem: (id) => set((state) => {
        const removed = state.items.find((i) => i.cartItemId === id);
        const remainingItems = state.items.filter((i) => i.cartItemId !== id);
        // Nolla bogoChoice om varukorgen töms ELLER om man tar bort just gratis-varan.
        const removedFreeItem = !!removed?.bogoFreeFromDealId;
        const clearBogo = remainingItems.length === 0 || removedFreeItem;
        return {
          items: remainingItems,
          restaurantId: remainingItems.length > 0 ? state.restaurantId : null,
          restaurantSlug: remainingItems.length > 0 ? state.restaurantSlug : null,
          ...(clearBogo ? { bogoChoice: null } : {}),
        };
      }),
      updateQuantity: (id, amount) => set((state) => ({
        items: state.items.map((i) => 
          i.cartItemId === id ? { ...i, quantity: Math.max(1, i.quantity + amount) } : i
        ),
      })),
      updateItem: (id, patch) => set((state) => ({
        items: state.items.map((i) =>
          i.cartItemId === id ? { ...i, ...patch, cartItemId: i.cartItemId } : i
        ),
      })),
      clearCart: () => set({ items: [], restaurantId: null, restaurantSlug: null, lastAddedItemName: null, lastAddedAt: 0, bogoChoice: null }),
      setBogoChoice: (choice) => set({ bogoChoice: choice }),
      getTotal: () => {
        const items = get().items;
        return items.reduce((total, item) => {
          const itemExtrasTotal = item.extras.reduce((sum, extra) => sum + extra.price * (extra.quantity ?? 1), 0);
          return total + ((item.price + itemExtrasTotal) * item.quantity);
        }, 0);
      },
      setDeliveryOverrides: (overrides) => set({ deliveryOverrides: overrides }),
      updateDeliveryOverride: (restaurantId, deliveryFee, minOrderAmount) =>
        set((state) => ({
          deliveryOverrides: {
            ...state.deliveryOverrides,
            [restaurantId]: { deliveryFee, minOrderAmount },
          },
        })),
    }),
    { name: 'viaeats-cart' }
  )
);
