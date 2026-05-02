import { useCallback, useState } from "react";
import { Platform } from "react-native";
import * as AppleAuthentication from "expo-apple-authentication";
import { supabase } from "../lib/supabase";
import { api } from "../lib/api";

/**
 * Native Apple Sign-In via Supabase Auth.
 */
export function useAppleAuth() {
  const [loading, setLoading] = useState(false);
  const [tokenResult, setTokenResult] = useState<{ token: string; user: any } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const prompt = useCallback(async () => {
    if (Platform.OS !== "ios") {
      setError("Sign in with Apple är endast tillgängligt på iOS.");
      return;
    }

    setLoading(true);
    setError(null);
    setTokenResult(null);

    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });

      if (credential.identityToken) {
        // Skicka identityToken till Supabase för att skapa/hämta användarsessionen
        const { data, error: supabaseError } = await supabase.auth.signInWithIdToken({
          provider: "apple",
          token: credential.identityToken,
        });

        if (supabaseError) throw supabaseError;

        if (data.session?.access_token) {
          // STRICT APPLE SIGN-IN PERSISTENCE
          // ─────────────────────────────────
          // Apple ships fullName ONLY on the first authorization (and only
          // again if the user revokes the app under "Sign in with Apple"
          // and re-authorizes). The DB is the single source of truth.
          //
          //   1. Read what Apple sent us this time (may be undefined).
          //   2. Fetch our backend profile — that's the authoritative read.
          //      authenticateUser upserts on first hit; on subsequent hits
          //      it leaves stored firstName/lastName untouched.
          //   3. ONLY if backend has no firstName + lastName yet AND Apple
          //      did ship a name on this auth, PATCH it through. Never
          //      overwrite stored values; never write empty strings.
          //   4. Re-fetch the profile to get the canonical state, hand it
          //      back to the caller. The UI gates on `profileComplete`
          //      from the backend, NOT on Apple's response.
          const { fullName, user: appleUserId } = credential;
          const appleFirst = (fullName?.givenName || '').trim();
          const appleLast = (fullName?.familyName || '').trim();
          const appleHasName = !!(appleFirst || appleLast);
          const token = data.session.access_token;
          const headers = { Authorization: `Bearer ${token}` };

          if (appleHasName) {
            console.log(`[apple-auth] Apple shipped name on this authorization (apple_user_id=${appleUserId?.slice(0, 8)}…) first=${appleFirst ? 'yes' : 'no'} last=${appleLast ? 'yes' : 'no'}`);
            // Mirror into Supabase metadata for any other consumer that
            // might read it. Same idempotency rule applies — Supabase
            // ignores undefined values.
            await supabase.auth
              .updateUser({
                data: {
                  first_name: appleFirst || undefined,
                  last_name: appleLast || undefined,
                  given_name: appleFirst || undefined,
                  family_name: appleLast || undefined,
                },
              })
              .catch(() => null);
          } else {
            console.log(`[apple-auth] Apple did NOT ship a name on this authorization — relying on stored profile`);
          }

          // Fetch local user record (creates it on first sign-in via
          // authenticateUser middleware).
          let profileRes = await api.get("/api/profile", { headers });
          const stored = profileRes.data ?? {};
          const storedFirst = (stored.firstName || '').trim();
          const storedLast = (stored.lastName || '').trim();

          // Only PATCH if DB has no name at all AND Apple just gave us one.
          // This is the ONLY moment we ever write a name from the Apple
          // response. After this, the DB is the single source of truth.
          if (appleHasName && !storedFirst && !storedLast) {
            console.log(`[apple-auth] DB had no stored name — saving Apple-supplied name as first-login persist`);
            await api
              .patch(
                "/api/profile",
                {
                  firstName: appleFirst || undefined,
                  lastName: appleLast || undefined,
                  name: [appleFirst, appleLast].filter(Boolean).join(' ') || undefined,
                },
                { headers },
              )
              .catch((e) => console.warn('[apple-auth] first-login name PATCH failed:', e?.response?.status));
            // Re-fetch so the caller sees the canonical post-PATCH state
            // (with profileComplete possibly flipped to true).
            profileRes = await api.get("/api/profile", { headers });
          } else if (appleHasName) {
            console.log(`[apple-auth] DB already has a stored name — IGNORING Apple response (single-source-of-truth rule)`);
          }

          setTokenResult({ token, user: profileRes.data });
        } else {
          throw new Error("Ingen session mottogs från Supabase.");
        }
      } else {
        throw new Error("Kunde inte hämta identitetstecken från Apple.");
      }
    } catch (e: any) {
      if (e.code === "ERR_REQUEST_CANCELED" || e.code === "ERR_CANCELED") {
        setError("__cancelled__");
      } else {
        setError(e.message || "Inloggning med Apple misslyckades.");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  return { prompt, loading, tokenResult, error };
}
