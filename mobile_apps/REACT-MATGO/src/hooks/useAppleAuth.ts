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
          // Apple only ships the user's full name in `credential.fullName` on
          // the FIRST sign-in for a given Apple ID. If we miss it here we lose
          // it forever (subsequent sign-ins return an empty fullName), which
          // is why every account ended up displayed as "ANVÄNDARE". Build the
          // best name we can — with either part filled in — and persist
          // BOTH the structured firstName/lastName AND the joined display
          // name, both into Supabase metadata and into our DB via PATCH.
          const { fullName } = credential;
          const firstName = (fullName?.givenName || '').trim();
          const lastName = (fullName?.familyName || '').trim();
          const displayName = [firstName, lastName].filter(Boolean).join(' ').trim();

          if (firstName || lastName) {
            await supabase.auth
              .updateUser({
                data: {
                  name: displayName,
                  full_name: displayName,
                  first_name: firstName,
                  last_name: lastName,
                  given_name: firstName,
                  family_name: lastName,
                },
              })
              .catch(() => null);
            await api
              .patch(
                "/api/profile",
                {
                  name: displayName || undefined,
                  firstName: firstName || undefined,
                  lastName: lastName || undefined,
                },
                { headers: { Authorization: `Bearer ${data.session.access_token}` } },
              )
              .catch(() => null);
          }

          // Fetch local user record (creates it on first sign-in).
          const profileRes = await api.get("/api/profile", {
            headers: { Authorization: `Bearer ${data.session.access_token}` },
          });

          // If we have a name from Apple, prefer it over the "Användare"
          // placeholder the backend stamps when Supabase metadata is empty.
          if (displayName && profileRes.data) {
            const current = profileRes.data.name?.trim() || "";
            if (!current || current.toLowerCase() === "användare") {
              try {
                await api.patch(
                  "/api/profile",
                  {
                    name: displayName,
                    firstName: firstName || undefined,
                    lastName: lastName || undefined,
                  },
                  { headers: { Authorization: `Bearer ${data.session.access_token}` } },
                );
                profileRes.data.name = displayName;
                profileRes.data.firstName = firstName || profileRes.data.firstName;
                profileRes.data.lastName = lastName || profileRes.data.lastName;
              } catch {}
            }
          }

          setTokenResult({ token: data.session.access_token, user: profileRes.data });
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
