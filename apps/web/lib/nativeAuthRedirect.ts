/** Native auth redirects are closed until the apps support one-time PKCE. */
export function getSafeNativeAuthRedirect(_rawRedirect: string | null | undefined) {
  return null;
}

export function getSafeNativeAuthRedirectOrDefault(_rawRedirect: string | null | undefined) {
  return null;
}
