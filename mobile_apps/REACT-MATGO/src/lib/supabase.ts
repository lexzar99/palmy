import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import { Platform } from "react-native";
import { EXPO_PUBLIC_SUPABASE_ANON_KEY, EXPO_PUBLIC_SUPABASE_URL } from "./env";

// ── Supabase auth storage ──────────────────────────────────────────────────
// Vi vill helst använda expo-secure-store (iOS Keychain / Android Keystore)
// för Supabase-JWT:n. MEN om paketet inte är länkat native-sidan (typiskt:
// `pod install` har inte körts efter att vi lade till deppen) kraschar
// `import * as SecureStore from "expo-secure-store"` vid JS-load med
// "Cannot find native module 'ExpoSecureStore'".
// Lösning: dynamic require + try/catch, fall tillbaka till AsyncStorage
// om Keychain-modulen saknas. Sämre säkerhet men appen funkar.
let SecureStoreModule: typeof import("expo-secure-store") | null = null;
if (Platform.OS !== "web") {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    SecureStoreModule = require("expo-secure-store");
  } catch {
    SecureStoreModule = null;
  }
}

const secureStorageAdapter = {
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
        // fall through
      }
    }
    try {
      return await AsyncStorage.getItem(key);
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
      await AsyncStorage.setItem(key, value);
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
      await AsyncStorage.removeItem(key);
    } catch {}
  },
};

export const supabase = createClient(EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY, {
  auth: {
    storage: secureStorageAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
});

export type SupabaseSession = Awaited<
  ReturnType<typeof supabase.auth.getSession>
>["data"]["session"];
