"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { markExplicitLoginStarted } from "@/lib/platformSessionClient";
import { useTranslation } from "@/lib/i18n/LocaleProvider";

/**
 * Delad social-login-knapp (Supabase OAuth). Används på login-, registrerings-
 * och profilsidan så "Fortsätt med Apple/Google" ser likadant ut överallt.
 * Apple = svart (varumärkeskrav), Google = neutral vit med flerfärgs-G.
 * Self-contained: ikoner + handler + i18n här, inga props utöver provider.
 */
const APPLE_ICON = (
  <svg className="w-[17px] h-[17px]" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
  </svg>
);

const GOOGLE_ICON = (
  <svg className="w-[17px] h-[17px]" viewBox="0 0 24 24" aria-hidden="true">
    <path fill="#EA4335" d="M5.27 9.76A7.08 7.08 0 0 1 12 5c1.69 0 3.21.6 4.4 1.59L19.9 3.1A11.94 11.94 0 0 0 12 0C8.16 0 4.82 2 2.86 5.01l2.41 2.75z" />
    <path fill="#34A853" d="M16.04 18.01A7.07 7.07 0 0 1 12 19.1c-2.93 0-5.44-1.78-6.6-4.34l-2.84 2.19A11.96 11.96 0 0 0 12 24c3.24 0 6.17-1.17 8.4-3.09l-4.36-2.9z" />
    <path fill="#4A90D9" d="M19.1 12.2c0-.73-.07-1.36-.18-2H12v4.01h4.04a3.7 3.7 0 0 1-1.53 2.36l4.36 2.9c2.61-2.41 3.23-5.96.23-7.27z" />
    <path fill="#FBBC05" d="M5.4 14.76A7.16 7.16 0 0 1 5 12c0-.95.19-1.86.41-2.24L2.86 7.01A11.9 11.9 0 0 0 0 12c0 1.7.37 3.31.97 4.77l4.43-2z" />
  </svg>
);

export default function SocialAuthButton({ provider }: { provider: "google" | "apple" }) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const isApple = provider === "apple";
  const providerName = isApple ? "Apple" : "Google";
  const label = isApple ? t("auth.social.apple") : t("auth.social.google");
  const icon = isApple ? APPLE_ICON : GOOGLE_ICON;

  const handleClick = async () => {
    setLoading(true);
    setErrorMsg(null);
    // Do not reactivate a stale HttpOnly session while OAuth is in flight.
    // The sentinel is cleared only after the new platform token is persisted.
    markExplicitLoginStarted();
    try {
      const supabase = createSupabaseBrowserClient();
      const options: { redirectTo: string; scopes?: string } = {
        redirectTo: `${window.location.origin}/auth/callback`,
      };
      options.scopes = isApple ? "name email" : "email profile openid";
      const { error } = await supabase.auth.signInWithOAuth({ provider, options });
      if (error) throw error;
    } catch (err: any) {
      const raw = (err?.message || "").toLowerCase();
      if (raw.includes("missing oauth secret") || raw.includes("unsupported provider")) {
        setErrorMsg(
          isApple
            ? t("auth.social.appleNotConfigured")
            : t("auth.social.providerNotConfigured", { provider: providerName }),
        );
      } else {
        setErrorMsg(err?.message || t("auth.social.startError"));
      }
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <button
        onClick={handleClick}
        disabled={loading}
        className="w-full h-[50px] rounded-xl text-[15px] font-semibold flex items-center justify-center gap-2.5 transition-opacity disabled:opacity-50 active:scale-[0.99]"
        style={
          isApple
            ? { backgroundColor: "#141416", color: "#ffffff" }
            : { backgroundColor: "var(--bg-secondary)", border: "1px solid var(--line-strong)", color: "var(--text-primary)" }
        }
      >
        {loading ? <Loader2 size={17} className="animate-spin" /> : icon}
        {loading ? t("auth.social.loading") : label}
      </button>
      {errorMsg && (
        <p className="text-[12.5px] text-rose-600 leading-snug px-1 text-center">{errorMsg}</p>
      )}
    </div>
  );
}
