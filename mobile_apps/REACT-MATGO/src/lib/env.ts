function getRequiredExpoPublicEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    // Log but do NOT throw — throwing at module import time crashes the bundle
    // before React mounts, producing a white screen with no recovery UI.
    // Validation is deferred to validateEnv() called after React has mounted.
    console.error(`[env] Missing required env var: ${name}`);
    return "";
  }
  return value;
}

function getOptionalExpoPublicEnv(name: string) {
  const value = process.env[name]?.trim();
  return value || null;
}

export const EXPO_PUBLIC_API_URL = getRequiredExpoPublicEnv("EXPO_PUBLIC_API_URL");
export const EXPO_PUBLIC_SOCKET_URL = getOptionalExpoPublicEnv("EXPO_PUBLIC_SOCKET_URL");
export const EXPO_PUBLIC_WEB_URL = getOptionalExpoPublicEnv("EXPO_PUBLIC_WEB_URL");
export const EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY = getRequiredExpoPublicEnv("EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY");
export const EXPO_PUBLIC_GEOAPIFY_KEY = getRequiredExpoPublicEnv("EXPO_PUBLIC_GEOAPIFY_KEY");
export const EXPO_PUBLIC_SUPABASE_URL = getRequiredExpoPublicEnv("EXPO_PUBLIC_SUPABASE_URL");
export const EXPO_PUBLIC_SUPABASE_ANON_KEY = getRequiredExpoPublicEnv("EXPO_PUBLIC_SUPABASE_ANON_KEY");

const REQUIRED_KEYS = [
  "EXPO_PUBLIC_API_URL",
  "EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY",
  "EXPO_PUBLIC_GEOAPIFY_KEY",
  "EXPO_PUBLIC_SUPABASE_URL",
  "EXPO_PUBLIC_SUPABASE_ANON_KEY",
] as const;

/** Call this once after React mounts to surface missing config to the user. */
export function validateEnv(): string[] {
  return REQUIRED_KEYS.filter((k) => !process.env[k]?.trim());
}
