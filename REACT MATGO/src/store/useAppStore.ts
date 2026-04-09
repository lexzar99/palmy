import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { AppStoreState, CartItem, OrderType, Profile } from "../types";

const STORAGE_KEY = "react-matgo-store";

const persistState = async (state: AppStoreState) => {
  await AsyncStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      items: state.items,
      restaurantId: state.restaurantId,
      restaurantSlug: state.restaurantSlug,
      address: state.address,
      coords: state.coords,
      orderType: state.orderType,
      token: state.token,
      profile: state.profile,
    })
  );
};

export const useAppStore = create<AppStoreState>((set, get) => ({
  hydrated: false,
  items: [],
  restaurantId: null,
  restaurantSlug: null,
  address: "",
  coords: null,
  orderType: "DELIVERY",
  token: null,
  profile: null,
  hydrate: async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        set({ ...JSON.parse(raw), hydrated: true });
        return;
      }
    } catch {}
    set({ hydrated: true });
  },
  addItem: (item) =>
    set((state) => {
      const isDifferentRestaurant = state.restaurantId && state.restaurantId !== item.restaurantId;
      const nextItem: CartItem = {
        ...item,
        cartItemId: Math.random().toString(36).slice(2, 10),
      };

      const nextState = isDifferentRestaurant
        ? {
            items: [nextItem],
            restaurantId: item.restaurantId,
            restaurantSlug: item.restaurantSlug || null,
          }
        : {
            items: [...state.items, nextItem],
            restaurantId: item.restaurantId,
            restaurantSlug: item.restaurantSlug || null,
          };

      queueMicrotask(() => {
        persistState(get()).catch(() => {});
      });

      return nextState;
    }),
  removeItem: (cartItemId) =>
    set((state) => {
      const items = state.items.filter((item) => item.cartItemId !== cartItemId);
      const nextState = {
        items,
        restaurantId: items.length ? state.restaurantId : null,
        restaurantSlug: items.length ? state.restaurantSlug : null,
      };
      queueMicrotask(() => {
        persistState(get()).catch(() => {});
      });
      return nextState;
    }),
  updateQuantity: (cartItemId, amount) =>
    set((state) => {
      const nextState = {
        items: state.items.map((item) =>
          item.cartItemId === cartItemId
            ? { ...item, quantity: Math.max(1, item.quantity + amount) }
            : item
        ),
      };
      queueMicrotask(() => {
        persistState(get()).catch(() => {});
      });
      return nextState;
    }),
  clearCart: () => {
    set({
      items: [],
      restaurantId: null,
      restaurantSlug: null,
    });
    queueMicrotask(() => {
      persistState(get()).catch(() => {});
    });
  },
  setAddress: (address, coords) => {
    set({
      address,
      coords: coords ?? null,
    });
    queueMicrotask(() => {
      persistState(get()).catch(() => {});
    });
  },
  setOrderType: (orderType: OrderType) => {
    set({ orderType });
    queueMicrotask(() => {
      persistState(get()).catch(() => {});
    });
  },
  setToken: (token) => {
    set({ token });
    queueMicrotask(() => {
      persistState(get()).catch(() => {});
    });
  },
  setProfile: (profile: Profile | null) => {
    set({ profile });
    queueMicrotask(() => {
      persistState(get()).catch(() => {});
    });
  },
  clearSession: () => {
    set({ token: null, profile: null });
    queueMicrotask(() => {
      persistState(get()).catch(() => {});
    });
  },
}));
