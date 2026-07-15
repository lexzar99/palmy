export type SupabaseCustomerIdentity = {
  phone?: string | null;
  phone_confirmed_at?: string | null;
  app_metadata?: Record<string, unknown> | null;
};

export type CustomerAuthMethod = 'phone' | 'google' | 'apple';

export type LocalCustomerIdentity = {
  phone?: string | null;
  isVerified?: boolean | null;
  oauthProvider?: string | null;
};

/**
 * Only explicitly supported, verified customer sign-in methods may enter the
 * platform. In particular, a Supabase email/password or magic-link session is
 * not a ViaEats customer login even if Supabase considers the JWT valid.
 */
export function customerAuthMethod(
  identity: SupabaseCustomerIdentity | null | undefined,
): CustomerAuthMethod | null {
  const provider = String(identity?.app_metadata?.provider || '').toLowerCase();
  if (provider === 'google' || provider === 'apple') return provider;
  if (provider === 'phone' && identity?.phone && identity.phone_confirmed_at) {
    return 'phone';
  }
  return null;
}

export function hasVerifiedSupabasePhone(
  identity: SupabaseCustomerIdentity | null | undefined,
): boolean {
  return Boolean(identity?.phone && identity.phone_confirmed_at);
}

/** Validate the provenance retained on a local platform-JWT account row. */
export function localCustomerAuthMethod(
  identity: LocalCustomerIdentity | null | undefined,
): CustomerAuthMethod | null {
  const provider = String(identity?.oauthProvider || '').toLowerCase();
  if (provider === 'google' || provider === 'apple') return provider;
  if (provider === 'phone' && identity?.phone && identity.isVerified === true) {
    return 'phone';
  }
  return null;
}
