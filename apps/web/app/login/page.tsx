"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import { Loader2, Eye, EyeOff, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { API_URL } from "@/lib/api";
import {
  persistPlatformSession,
  getPlatformSessionStatus,
} from "@/lib/platformSessionClient";
import { useTranslation } from "@/lib/i18n/LocaleProvider";

// Delade input-/Apple-knapp-stilar. CSS-klass (inte inline style) så att
// :focus-reglerna och [data-theme='dark']-flippen fungerar utan JS.
const AUTH_CSS = `
.auth-input {
  width: 100%;
  height: 48px;
  border-radius: 12px;
  border: 1px solid var(--line-strong);
  background: var(--bg-secondary);
  padding: 0 16px;
  font-size: 15px;
  font-weight: 500;
  color: var(--text-primary);
  outline: none;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
.auth-input:focus {
  border-color: var(--text-primary);
  box-shadow: 0 0 0 3px rgba(127,127,127,0.12);
}
.auth-input::placeholder {
  color: var(--text-secondary);
  opacity: 0.55;
}
.auth-apple-btn {
  background-color: #141416;
  color: #ffffff;
}
[data-theme='dark'] .auth-apple-btn {
  background-color: #ffffff;
  color: #141416;
}
`;

// ─── Social login button (Supabase OAuth) ───────────────────────────────────
function SocialButton({
  provider,
  providerName,
  label,
  icon,
}: {
  provider: "google" | "apple";
  providerName: string;
  label: string;
  icon: React.ReactNode;
}) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleClick = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const supabase = createSupabaseBrowserClient();
      const options: { redirectTo: string; scopes?: string } = {
        redirectTo: `${window.location.origin}/auth/callback`,
      };
      if (provider === "apple") options.scopes = "name email";
      else if (provider === "google") options.scopes = "email profile openid";
      const { error } = await supabase.auth.signInWithOAuth({ provider, options });
      if (error) throw error;
    } catch (err: any) {
      const raw = (err?.message || "").toLowerCase();
      if (raw.includes("missing oauth secret") || raw.includes("unsupported provider")) {
        setErrorMsg(
          provider === "apple"
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
        className={`w-full h-[50px] rounded-xl text-[15px] font-semibold flex items-center justify-center gap-2.5 transition-opacity disabled:opacity-50 ${
          provider === "apple" ? "auth-apple-btn" : ""
        }`}
        style={
          provider === "apple"
            ? undefined
            : {
                backgroundColor: "var(--bg-secondary)",
                border: "1px solid var(--line-strong)",
                color: "var(--text-primary)",
              }
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

export default function LoginPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [checking, setChecking] = useState(true);

  // Redan inloggad → skicka direkt till profilen (ingen login-vy då).
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const ok = await getPlatformSessionStatus();
        if (ok && active) {
          router.replace("/profile");
          return;
        }
      } catch {
        /* noop */
      }
      if (active) setChecking(false);
    })();
    return () => {
      active = false;
    };
  }, [router]);

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoggingIn(true);
    setLoginError("");
    try {
      const res = await axios.post(`${API_URL}/api/account/login-user`, {
        identifier: loginEmail,
        password: loginPassword,
      });
      await persistPlatformSession(res.data.token);
      router.push("/profile");
    } catch (err: any) {
      setLoginError(err.response?.data?.error || t("auth.loginError"));
      setIsLoggingIn(false);
    }
  };

  if (checking) {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-start px-6 pt-[calc(env(safe-area-inset-top,0px)+1.5rem)] md:pt-20"
        style={{ backgroundColor: "var(--bg-primary)" }}
      >
        <div className="w-full max-w-sm space-y-4">
          <div className="skeleton h-9 w-9 rounded-full" />
          <div className="skeleton h-7 w-32 rounded-lg" />
          <div className="skeleton h-4 w-64 rounded" />
          <div className="skeleton h-[50px] rounded-xl" />
          <div className="skeleton h-[50px] rounded-xl" />
          <div className="skeleton h-12 rounded-xl" />
          <div className="skeleton h-12 rounded-xl" />
          <div className="skeleton h-[52px] rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-start px-6 pt-[calc(env(safe-area-inset-top,0px)+1.5rem)] md:pt-20 pb-28"
      style={{ backgroundColor: "var(--bg-primary)" }}
    >
      <style>{AUTH_CSS}</style>
      <div className="w-full max-w-sm space-y-5">
        {/* Tillbaka — rund ghost-knapp */}
        <button
          type="button"
          onClick={() => {
            if (typeof window !== "undefined" && window.history.length > 1) router.back();
            else router.push("/profile");
          }}
          aria-label={t("common.back")}
          className="w-9 h-9 rounded-full flex items-center justify-center transition-colors hover:bg-[var(--bg-deep)]"
          style={{ border: "1px solid var(--line-strong)", color: "var(--text-primary)" }}
        >
          <ArrowLeft size={16} strokeWidth={2} />
        </button>

        {/* Header */}
        <div className="space-y-1.5">
          <h1 className="text-[26px] font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>
            {t("auth.login.title")}
          </h1>
          <p className="text-[14.5px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
            {t("auth.login.subtitle")}
          </p>
        </div>

        {/* Socialt först — fullbredd, stackat */}
        <div className="flex flex-col gap-2.5">
          <SocialButton
            provider="apple"
            providerName="Apple"
            label={t("auth.social.apple")}
            icon={
              <svg className="w-[17px] h-[17px]" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
              </svg>
            }
          />
          <SocialButton
            provider="google"
            providerName="Google"
            label={t("auth.social.google")}
            icon={
              <svg className="w-[17px] h-[17px]" viewBox="0 0 24 24">
                <path fill="#EA4335" d="M5.27 9.76A7.08 7.08 0 0 1 12 5c1.69 0 3.21.6 4.4 1.59L19.9 3.1A11.94 11.94 0 0 0 12 0C8.16 0 4.82 2 2.86 5.01l2.41 2.75z" />
                <path fill="#34A853" d="M16.04 18.01A7.07 7.07 0 0 1 12 19.1c-2.93 0-5.44-1.78-6.6-4.34l-2.84 2.19A11.96 11.96 0 0 0 12 24c3.24 0 6.17-1.17 8.4-3.09l-4.36-2.9z" />
                <path fill="#4A90D9" d="M19.1 12.2c0-.73-.07-1.36-.18-2H12v4.01h4.04a3.7 3.7 0 0 1-1.53 2.36l4.36 2.9c2.61-2.41 3.23-5.96.23-7.27z" />
                <path fill="#FBBC05" d="M5.4 14.76A7.16 7.16 0 0 1 5 12c0-.95.19-1.86.41-2.24L2.86 7.01A11.9 11.9 0 0 0 0 12c0 1.7.37 3.31.97 4.77l4.43-2z" />
              </svg>
            }
          />
        </div>

        {/* Divider */}
        <div className="flex items-center gap-3">
          <div className="h-px flex-1" style={{ backgroundColor: "var(--border-muted)" }} />
          <span className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
            {t("auth.orWithSocial")}
          </span>
          <div className="h-px flex-1" style={{ backgroundColor: "var(--border-muted)" }} />
        </div>

        {/* Mejl + lösenord */}
        <form onSubmit={handleEmailLogin} className="space-y-3.5">
          <div>
            <label
              htmlFor="login-email"
              className="block text-[13.5px] font-medium mb-1.5"
              style={{ color: "var(--text-secondary)" }}
            >
              {t("auth.field.email")}
            </label>
            <input
              id="login-email"
              required
              type="email"
              autoComplete="email"
              value={loginEmail}
              onChange={(e) => setLoginEmail(e.target.value)}
              placeholder={t("auth.emailPlaceholder")}
              className="auth-input"
            />
          </div>
          <div>
            <label
              htmlFor="login-password"
              className="block text-[13.5px] font-medium mb-1.5"
              style={{ color: "var(--text-secondary)" }}
            >
              {t("auth.field.password")}
            </label>
            <div className="relative">
              <input
                id="login-password"
                required
                type={showLoginPassword ? "text" : "password"}
                autoComplete="current-password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                placeholder={t("auth.passwordPlaceholder")}
                className="auth-input"
                style={{ paddingRight: 48 }}
              />
              <button
                type="button"
                tabIndex={-1}
                onClick={() => setShowLoginPassword((v) => !v)}
                aria-label={showLoginPassword ? "Dölj lösenord" : "Visa lösenord"}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-full transition-colors hover:bg-[var(--bg-deep)]"
                style={{ color: "var(--text-secondary)" }}
              >
                {showLoginPassword ? <EyeOff size={18} strokeWidth={2} /> : <Eye size={18} strokeWidth={2} />}
              </button>
            </div>
          </div>
          {loginError && <p className="text-[13px] text-rose-600 text-center leading-snug">{loginError}</p>}
          <button
            type="submit"
            disabled={isLoggingIn}
            className="w-full h-[52px] bg-gold-500 rounded-xl text-[15.5px] font-semibold flex items-center justify-center gap-2 transition-opacity disabled:opacity-60"
            style={{ color: "#141416" }}
          >
            {isLoggingIn ? <Loader2 className="animate-spin" size={20} /> : t("auth.submitLogin")}
          </button>
        </form>

        {/* Glömt lösenord */}
        <div className="text-center">
          <Link
            href="/forgot-password"
            className="text-[14px] font-medium transition-opacity hover:opacity-80"
            style={{ color: "var(--gold-ink)" }}
          >
            {t("auth.login.forgot")}
          </Link>
        </div>

        {/* Registrera */}
        <p className="text-center text-[14px]" style={{ color: "var(--text-secondary)" }}>
          {t("auth.login.newHere")}{" "}
          <Link href="/register" className="font-semibold" style={{ color: "var(--text-primary)" }}>
            {t("auth.login.create")}
          </Link>
        </p>

        {/* Juridik/kontakt */}
        <p className="text-center text-[12.5px] pt-2" style={{ color: "var(--text-secondary)" }}>
          <Link href="/terms" className="hover:underline">
            {t("auth.legal.terms")}
          </Link>
          <span className="mx-1.5">·</span>
          <Link href="/privacy" className="hover:underline">
            {t("auth.legal.privacy")}
          </Link>
          <span className="mx-1.5">·</span>
          <Link href="/contact" className="hover:underline">
            {t("auth.legal.contact")}
          </Link>
        </p>
      </div>
    </div>
  );
}
