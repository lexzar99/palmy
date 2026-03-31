import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface CartItem {
  cartItemId: string; // Unikt id för denna specifika rad i korgen
  productId: string;
  name: string;
  price: number; // Baspris i kr
  quantity: number;
  extras: {
    groupId: string;
    groupName: string;
    extraId: string;
    name: string;
    price: number;
  }[];
  note?: string;
}

interface CartStore {
  items: CartItem[];
  lastAddedItemName: string | null;
  lastAddedAt: number;
  addItem: (item: Omit<CartItem, 'cartItemId'>) => void;
  removeItem: (cartItemId: string) => void;
  updateQuantity: (cartItemId: string, amount: number) => void;
  clearCart: () => void;
  getTotal: () => number;
}

export const useCartStore = create<CartStore>()(
  persist(
    (set, get) => ({
      items: [],
      lastAddedItemName: null,
      lastAddedAt: 0,
      addItem: (item) => set((state) => ({
        items: [...state.items, { ...item, cartItemId: Math.random().toString(36).substr(2, 9) }],
        lastAddedItemName: item.name,
        lastAddedAt: Date.now(),
      })),
      removeItem: (id) => set((state) => ({
        items: state.items.filter((i) => i.cartItemId !== id),
      })),
      updateQuantity: (id, amount) => set((state) => ({
        items: state.items.map((i) => 
          i.cartItemId === id ? { ...i, quantity: Math.max(1, i.quantity + amount) } : i
        ),
      })),
      clearCart: () => set({ items: [], lastAddedItemName: null, lastAddedAt: 0 }),
      getTotal: () => {
        const items = get().items;
        return items.reduce((total, item) => {
          const itemExtrasTotal = item.extras.reduce((sum, extra) => sum + extra.price, 0);
          return total + ((item.price + itemExtrasTotal) * item.quantity);
        }, 0);
      },
    }),
    { name: 'palmyra-cart' }
  )
);
