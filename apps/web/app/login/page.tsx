"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import { Loader2, Eye, EyeOff, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { API_URL } from "@/lib/api";
import SocialAuthButton from "@/components/SocialAuthButton";
import PhoneAuth from "@/components/PhoneAuth";
import {
  persistPlatformSession,
  getPlatformSessionStatus,
} from "@/lib/platformSessionClient";
import { useTranslation } from "@/lib/i18n/LocaleProvider";

// Delade input-/Apple-knapp-stilar. CSS-klass (inte inline style) så att
// :focus-reglerna fungerar utan JS.
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
`;

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

        {/* Socialt + telefon först — fullbredd, stackat */}
        <div className="flex flex-col gap-2.5">
          <SocialAuthButton provider="apple" />
          <SocialAuthButton provider="google" />
          <PhoneAuth />
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
            style={{ color: "var(--text-secondary)" }}
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
