"use client";
import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser-side Supabase client for use in Client Components.
 * Call this inside a component/hook (not at module level) so it re-uses
 * the same instance per render.
 */
export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
