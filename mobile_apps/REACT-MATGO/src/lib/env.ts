// EXPO_PUBLIC_* vars must be accessed with static keys so Babel inlines them at bundle time.
// Dynamic access like process.env[name] is NOT replaced and returns undefined in Release builds.

export const EXPO_PUBLIC_API_URL = process.env.EXPO_PUBLIC_API_URL?.trim() ?? "";
export const EXPO_PUBLIC_SOCKET_URL = process.env.EXPO_PUBLIC_SOCKET_URL?.trim() ?? null;
export const EXPO_PUBLIC_WEB_URL = process.env.EXPO_PUBLIC_WEB_URL?.trim() ?? null;
export const EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim() ?? "";
// Apple Pay merchant identifier — must exactly match the value in
// app.json (ios.plugins["@stripe/stripe-react-native"].merchantIdentifier)
// and the merchant ID registered in your Apple Developer account + Xcode
// entitlements.
export const EXPO_PUBLIC_STRIPE_MERCHANT_ID =
  process.env.EXPO_PUBLIC_STRIPE_MERCHANT_ID?.trim() || "merchant.com.foodgoJalle.app";
export const EXPO_PUBLIC_GEOAPIFY_KEY = process.env.EXPO_PUBLIC_GEOAPIFY_KEY?.trim() ?? "";
export const EXPO_PUBLIC_SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim() ?? "";
export const EXPO_PUBLIC_SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? "";
export const EXPO_PUBLIC_SENTRY_DSN = process.env.EXPO_PUBLIC_SENTRY_DSN?.trim() ?? "";

export function validateEnv(): string[] {
  const missing: string[] = [];
  if (!EXPO_PUBLIC_API_URL) missing.push("EXPO_PUBLIC_API_URL");
  if (!EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY) missing.push("EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY");
  // EXPO_PUBLIC_GEOAPIFY_KEY is optional — places lookups go through the
  // backend (/api/places/*). The key is only used as a client-side fallback
  // in lib/places.ts when the backend (Google) call returns no results.
  if (!EXPO_PUBLIC_SUPABASE_URL) missing.push("EXPO_PUBLIC_SUPABASE_URL");
  if (!EXPO_PUBLIC_SUPABASE_ANON_KEY) missing.push("EXPO_PUBLIC_SUPABASE_ANON_KEY");
  return missing;
}
