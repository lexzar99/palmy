import { useCallback, useState } from "react";
import { Platform } from "react-native";
import * as WebBrowser from "expo-web-browser";
import * as ExpoLinking from "expo-linking";
import { supabase } from "../lib/supabase";
import { api } from "../lib/api";

const SUPABASE_REDIRECT_URL = ExpoLinking.createURL("/auth/callback");

/**
 * Native Google OAuth via Supabase Auth.
 */
export function useGoogleAuth() {
  const [loading, setLoading] = useState(false);
  const [tokenResult, setTokenResult] = useState<{ token: string; user: any } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const prompt = useCallback(async () => {
    setLoading(true);
    setError(null);
    setTokenResult(null);
    try {
      if (Platform.OS === "web") {
        const webRedirectTo =
          typeof window !== "undefined"
            ? window.location.origin + window.location.pathname
            : SUPABASE_REDIRECT_URL;
        const { error: oauthError } = await supabase.auth.signInWithOAuth({
          provider: "google",
          options: {
            redirectTo: webRedirectTo,
            skipBrowserRedirect: false,
          },
        });
        if (oauthError) throw oauthError;
        return;
      }

      const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: SUPABASE_REDIRECT_URL,
          skipBrowserRedirect: true,
        },
      });
      if (oauthError || !data.url) throw oauthError ?? new Error("Ingen OAuth-URL");

      const result = await WebBrowser.openAuthSessionAsync(data.url, SUPABASE_REDIRECT_URL);

      if (result.type === "success" && result.url) {
        const parsedUrl = ExpoLinking.parse(result.url);
        const code = parsedUrl.queryParams?.code as string | undefined;
        if (!code) {
          setError("Inget auth-code i callback-URL");
          return;
        }

        const { data: sessionData, error: sessionError } = await supabase.auth.exchangeCodeForSession(code);
        if (sessionError) throw sessionError;

        const accessToken = sessionData.session?.access_token;
        if (!accessToken) throw new Error("Ingen session");

        const profileRes = await api.get("/api/profile", {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        setTokenResult({ token: accessToken, user: profileRes.data });
      } else if (result.type === "cancel" || result.type === "dismiss") {
        setError("__cancelled__");
      }
    } catch (e: any) {
      setError(e?.message || "Inloggning misslyckades");
    } finally {
      if (Platform.OS !== "web") setLoading(false);
    }
  }, []);

  return { prompt, loading, tokenResult, error, setLoading };
}
