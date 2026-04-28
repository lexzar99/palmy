function getRequiredExpoPublicEnv(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required Expo environment variable: ${name}`);
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
