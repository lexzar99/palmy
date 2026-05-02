// EXPO_PUBLIC_* vars must be accessed with static keys so Babel inlines them at bundle time.
// Dynamic access like process.env[name] is NOT replaced and returns undefined in Release builds.

export const EXPO_PUBLIC_API_URL = process.env.EXPO_PUBLIC_API_URL?.trim() ?? "";
export const EXPO_PUBLIC_SOCKET_URL = process.env.EXPO_PUBLIC_SOCKET_URL?.trim() ?? null;
export const EXPO_PUBLIC_WEB_URL = process.env.EXPO_PUBLIC_WEB_URL?.trim() ?? null;
export const EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim() ?? "";
// Apple Pay merchant identifier — must exactly match the value in
// app.json (ios.plugins["@stripe/stripe-react-native"].merchantIdentifier)
// and the merchant ID registered in your Apple Developer account.
export const EXPO_PUBLIC_STRIPE_MERCHANT_ID =
  process.env.EXPO_PUBLIC_STRIPE_MERCHANT_ID?.trim() || "merchant.com.foodgoJalle.app";
// Apple Pay is OPT-IN. Stripe throws "merchantIdentifier is required, but
// none was found" the moment we ask for Apple Pay if the iOS Apple Pay
// capability isn't enabled in Xcode (Signing & Capabilities → + Capability →
// Apple Pay → tick merchant ID). Until that's done, leave this off so card
// checkout still works. Set to "true" only after the capability is added,
// the merchant ID is registered in Apple Developer, AND the provisioning
// profile is regenerated.
export const EXPO_PUBLIC_APPLE_PAY_ENABLED =
  process.env.EXPO_PUBLIC_APPLE_PAY_ENABLED?.trim().toLowerCase() === "true";
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
