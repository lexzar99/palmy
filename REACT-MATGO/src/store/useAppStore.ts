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
      deliveryAddress: state.deliveryAddress,
      deliveryCoords: state.deliveryCoords,
      pickupCity: state.pickupCity,
      token: state.token,
      profile: state.profile,
      activeOrderId: state.activeOrderId,
      dislikedIngredients: state.dislikedIngredients,
      deliveryOverrides: state.deliveryOverrides,
      onboardingComplete: state.onboardingComplete,
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
  deliveryAddress: "",
  deliveryCoords: null,
  pickupCity: "",
  orderType: "DELIVERY",
  token: null,
  profile: null,
  pendingPromoCode: null,
  filteredRestaurantIds: null,
  activeOrderId: null,
  dislikedIngredients: [],
  deliveryOverrides: {},
  onboardingComplete: false,
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
    const state = get();
    const nextState: any = { address, coords: coords ?? null };
    
    // Also update the mode-specific field
    if (state.orderType === "DELIVERY") {
      nextState.deliveryAddress = address;
      nextState.deliveryCoords = coords ?? null;
    } else {
      nextState.pickupCity = address;
    }

    set(nextState);
    queueMicrotask(() => {
      persistState(get()).catch(() => {});
    });
  },
  setDeliveryAddress: (address, coords) => {
    const state = get();
    const update: any = { deliveryAddress: address, deliveryCoords: coords ?? null };
    if (state.orderType === "DELIVERY") {
      update.address = address;
      update.coords = coords ?? null;
    }
    set(update);
    queueMicrotask(() => {
      persistState(get()).catch(() => {});
    });
  },
  setPickupCity: (city) => {
    const state = get();
    const update: any = { pickupCity: city };
    if (state.orderType === "PICKUP") {
      update.address = city;
      update.coords = null;
    }
    set(update);
    queueMicrotask(() => {
      persistState(get()).catch(() => {});
    });
  },
  setOrderType: (orderType: OrderType) => {
    const state = get();
    const update: any = { orderType };
    
    if (orderType === "DELIVERY") {
      update.address = state.deliveryAddress;
      update.coords = state.deliveryCoords;
    } else {
      update.address = state.pickupCity;
      update.coords = null;
    }

    set(update);
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
  setPendingPromoCode: (pendingPromoCode) => {
    set({ pendingPromoCode });
  },
  setFilteredRestaurantIds: (filteredRestaurantIds) => {
    set({ filteredRestaurantIds });
  },
  clearSession: () => {
    set({ token: null, profile: null, pendingPromoCode: null, activeOrderId: null });
    queueMicrotask(() => {
      persistState(get()).catch(() => {});
    });
  },
  setActiveOrder: (activeOrderId) => {
    set({ activeOrderId });
    queueMicrotask(() => {
      persistState(get()).catch(() => {});
    });
  },
  setDislikedIngredients: (dislikedIngredients) => {
    set({ dislikedIngredients });
    queueMicrotask(() => {
      persistState(get()).catch(() => {});
    });
  },
  setDeliveryOverrides: (deliveryOverrides) => {
    set({ deliveryOverrides });
    queueMicrotask(() => {
      persistState(get()).catch(() => {});
    });
  },
  setOnboardingComplete: (onboardingComplete) => {
    set({ onboardingComplete });
    queueMicrotask(() => {
      persistState(get()).catch(() => {});
    });
  },
}));
