import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import { create } from "zustand";
import { AppStoreState, CartItem, OrderType, Profile } from "../types";

// expo-secure-store är ett native module. Om den inte är länkad i iOS-bygget
// (typiskt: glömt köra `pod install` efter att vi lade till paketet) kraschar
// `import * as SecureStore from "expo-secure-store"` vid JS-load med
// "Cannot find native module 'ExpoSecureStore'". Vi använder dynamic require
// + try/catch så appen INTE kraschar — istället faller tillbaka till
// AsyncStorage för token, vilket är mindre säkert men inte broken.
// Reaktivera Keychain genom att köra `cd ios && pod install` och bygga om.
let SecureStoreModule: typeof import("expo-secure-store") | null = null;
if (Platform.OS !== "web") {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    SecureStoreModule = require("expo-secure-store");
  } catch {
    SecureStoreModule = null;
  }
}

const STORAGE_KEY = "react-matgo-store";
// Token-nyckel: ASYNC_STORAGE_TOKEN_KEY för fallback, TOKEN_KEY för SecureStore
// (samma nyckel — vi rensar bara från fel storage vid migration).
const TOKEN_KEY = "react-matgo-auth-token";
const ASYNC_TOKEN_KEY = "react-matgo-auth-token-fallback";

const secureStorage = {
  async getItem(key: string): Promise<string | null> {
    if (Platform.OS === "web") {
      try {
        return typeof window !== "undefined" ? window.localStorage.getItem(key) : null;
      } catch {
        return null;
      }
    }
    if (SecureStoreModule) {
      try {
        const v = await SecureStoreModule.getItemAsync(key);
        if (v) return v;
      } catch {
        // fall through till AsyncStorage-fallback
      }
    }
    // Fallback: läs från AsyncStorage (om vi tidigare skrivit dit pga
    // saknat native-module).
    try {
      return await AsyncStorage.getItem(ASYNC_TOKEN_KEY);
    } catch {
      return null;
    }
  },
  async setItem(key: string, value: string): Promise<void> {
    if (Platform.OS === "web") {
      try {
        if (typeof window !== "undefined") window.localStorage.setItem(key, value);
      } catch {}
      return;
    }
    if (SecureStoreModule) {
      try {
        await SecureStoreModule.setItemAsync(key, value);
        return;
      } catch {
        // fall through
      }
    }
    try {
      await AsyncStorage.setItem(ASYNC_TOKEN_KEY, value);
    } catch {}
  },
  async removeItem(key: string): Promise<void> {
    if (Platform.OS === "web") {
      try {
        if (typeof window !== "undefined") window.localStorage.removeItem(key);
      } catch {}
      return;
    }
    if (SecureStoreModule) {
      try {
        await SecureStoreModule.deleteItemAsync(key);
      } catch {}
    }
    try {
      await AsyncStorage.removeItem(ASYNC_TOKEN_KEY);
    } catch {}
  },
};

// Persist only the non-sensitive slice to AsyncStorage. The auth token lives in
// SecureStore (see TOKEN_KEY) and is written separately whenever it changes.
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
      // token deliberately omitted — stored in SecureStore via TOKEN_KEY
      profile: state.profile,
      activeOrderId: state.activeOrderId,
      dislikedIngredients: state.dislikedIngredients,
      deliveryOverrides: state.deliveryOverrides,
      onboardingComplete: state.onboardingComplete,
      favorites: state.favorites,
      themePreference: state.themePreference,
    })
  );
};

const persistToken = async (token: string | null) => {
  if (token) {
    await secureStorage.setItem(TOKEN_KEY, token);
  } else {
    await secureStorage.removeItem(TOKEN_KEY);
  }
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
  activeOrder: null,
  dislikedIngredients: [],
  deliveryOverrides: {},
  onboardingComplete: false,
  favorites: [],
  themePreference: "light",
  toggleFavorite: (restaurantId) =>
    set((state) => {
      const next = state.favorites.includes(restaurantId)
        ? state.favorites.filter((id) => id !== restaurantId)
        : [...state.favorites, restaurantId];
      queueMicrotask(() => persistState({ ...get(), favorites: next }).catch(() => {}));
      return { favorites: next };
    }),
  hydrate: async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      // Read the token from its secure location first.
      let token: string | null = null;
      try {
        token = await secureStorage.getItem(TOKEN_KEY);
      } catch {}

      if (raw) {
        const parsed = JSON.parse(raw);
        // ── Migration: previous app versions stored the JWT inside the
        // AsyncStorage blob in plain text. If we find one there, move it to
        // SecureStore and strip it from the persisted blob.
        if (!token && typeof parsed.token === "string" && parsed.token) {
          const legacyToken: string = parsed.token;
          token = legacyToken;
          try { await secureStorage.setItem(TOKEN_KEY, legacyToken); } catch {}
        }
        delete parsed.token;
        // Clear pickupCity if it looks like a street address (contains comma) — stale from old bug
        if (parsed.pickupCity && parsed.pickupCity.includes(",")) {
          parsed.pickupCity = "";
        }
        // Recompute address from mode-specific fields to prevent stale values after restart
        if (parsed.orderType === "PICKUP") {
          parsed.address = parsed.pickupCity || "";
          parsed.coords = null;
        } else {
          parsed.address = parsed.deliveryAddress || "";
          parsed.coords = parsed.deliveryCoords || null;
        }
        set({ ...parsed, token, hydrated: true });
        // Re-persist so the migrated blob (without token) is what hits disk
        // next time. Fire-and-forget — failures are non-fatal and will retry
        // on the next state mutation.
        queueMicrotask(() => persistState(get()).catch(() => {}));
        return;
      }
      // No persisted state but we may still have a token in SecureStore
      // (e.g. fresh install + login or AsyncStorage cleared by the OS).
      set({ token, hydrated: true });
      return;
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
  updateItem: (cartItemId: string, patch: Partial<CartItem>) =>
    set((state) => {
      const nextState = {
        items: state.items.map((item) =>
          item.cartItemId === cartItemId
            ? { ...item, ...patch, cartItemId: item.cartItemId }
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
      pendingPromoCode: null,
    });
    queueMicrotask(() => {
      persistState(get()).catch(() => {});
    });
  },
  setAddress: (address, coords) => {
    const state = get();
    const nextState: any = { address, coords: coords ?? null };

    // Only update the delivery-specific fields — never write to pickupCity via setAddress
    if (state.orderType === "DELIVERY") {
      nextState.deliveryAddress = address;
      nextState.deliveryCoords = coords ?? null;
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
    // Token goes to SecureStore — the rest of the persisted blob does not
    // include it. Fire-and-forget; a write failure just means the next
    // cold start will see the user as logged out.
    queueMicrotask(() => {
      persistToken(token).catch(() => {});
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
    set({ token: null, profile: null, pendingPromoCode: null, activeOrderId: null, activeOrder: null });
    queueMicrotask(() => {
      persistToken(null).catch(() => {});
      persistState(get()).catch(() => {});
    });
  },
  setActiveOrder: (activeOrderId) => {
    // Clearing the id means the order is no longer in flight; drop the
    // cached snapshot too so consumers don't keep rendering stale data.
    set(activeOrderId === null ? { activeOrderId, activeOrder: null } : { activeOrderId });
    queueMicrotask(() => {
      persistState(get()).catch(() => {});
    });
  },
  setActiveOrderData: (activeOrder) => {
    set({ activeOrder });
    // Deliberately not persisted — the snapshot is reconstructed from the
    // server on every cold start, and we don't want stale in-flight orders
    // to flash up after a restart.
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
  updateDeliveryOverride: (restaurantId, deliveryFee, minOrderAmount) => {
    set((state) => ({
      deliveryOverrides: {
        ...state.deliveryOverrides,
        [restaurantId]: { deliveryFee, minOrderAmount },
      },
    }));
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
  setThemePreference: (themePreference) => {
    set({ themePreference });
    queueMicrotask(() => {
      persistState(get()).catch(() => {});
    });
  },
}));
