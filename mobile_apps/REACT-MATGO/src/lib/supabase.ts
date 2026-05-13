import { createClient } from "@supabase/supabase-js";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { EXPO_PUBLIC_SUPABASE_ANON_KEY, EXPO_PUBLIC_SUPABASE_URL } from "./env";

// ── Supabase auth storage ──────────────────────────────────────────────────
// Previously this used AsyncStorage, which puts the Supabase JWT in plaintext
// alongside the rest of the app state. On a rooted/jailbroken device any other
// app could read it. We swap to expo-secure-store so the value lives in the
// iOS Keychain / Android Keystore instead.
//
// Supabase calls getItem/setItem/removeItem with keys like
// `sb-<project-ref>-auth-token`. SecureStore restricts keys to the character
// class [A-Za-z0-9._-], which those keys already satisfy.
//
// Supabase sessions are typically ~1.5 KB. iOS Keychain entries are limited
// to 2 KB; if a future Supabase release pushes the session past that we'd
// need a chunking adapter. For now the native side handles it.
const secureStorageAdapter = {
  async getItem(key: string): Promise<string | null> {
    if (Platform.OS === "web") {
      try {
        return typeof window !== "undefined" ? window.localStorage.getItem(key) : null;
      } catch {
        return null;
      }
    }
    try {
      return await SecureStore.getItemAsync(key);
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
    try {
      await SecureStore.setItemAsync(key, value);
    } catch {}
  },
  async removeItem(key: string): Promise<void> {
    if (Platform.OS === "web") {
      try {
        if (typeof window !== "undefined") window.localStorage.removeItem(key);
      } catch {}
      return;
    }
    try {
      await SecureStore.deleteItemAsync(key);
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
