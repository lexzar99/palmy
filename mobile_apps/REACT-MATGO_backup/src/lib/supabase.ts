import { createClient } from "@supabase/supabase-js";
import AsyncStorage from "@react-native-async-storage/async-storage";

const SUPABASE_URL =
  process.env.EXPO_PUBLIC_SUPABASE_URL ||
  "https://qiviwmhunmqemqylmwkr.supabase.co";
const SUPABASE_ANON_KEY =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFpdml3bWh1bm1xZW1xeWxtd2tyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYwODg1MjgsImV4cCI6MjA5MTY2NDUyOH0._4FkvtBpK27JOrh_NZhCEULDDpN8QqUFsyZBcypLK10";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
});

export type SupabaseSession = Awaited<
  ReturnType<typeof supabase.auth.getSession>
>["data"]["session"];
