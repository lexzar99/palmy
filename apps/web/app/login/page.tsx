"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import { Lock, Loader2, Eye, EyeOff, ArrowLeft } from "lucide-react";
import { motion } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { API_URL } from "@/lib/api";
import {
  persistPlatformSession,
  getPlatformSessionStatus,
} from "@/lib/platformSessionClient";
import { useTranslation } from "@/lib/i18n/LocaleProvider";

// ─── Social login button (Supabase OAuth) ───────────────────────────────────
function SocialButton({
  provider,
  label,
  icon,
}: {
  provider: "google" | "apple";
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
            : t("auth.social.providerNotConfigured", { provider: label }),
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
        className="flex items-center justify-center gap-2.5 py-4 rounded-2xl text-[11px] font-black uppercase transition-all active:scale-95 disabled:opacity-50"
        style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-muted)", color: "var(--text-primary)" }}
      >
        {loading ? <Loader2 size={16} className="animate-spin" /> : icon}
        {loading ? t("auth.social.loading") : label}
      </button>
      {errorMsg && (
        <p className="text-[9px] font-bold leading-tight px-1 mt-1 text-center" style={{ color: "#dc2626" }}>
          {errorMsg}
        </p>
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
          <div className="skeleton h-4 w-20 rounded" />
          <div className="skeleton h-12 w-12 rounded-2xl mx-auto" />
          <div className="skeleton h-7 w-48 rounded-lg mx-auto" />
          <div className="skeleton h-14 rounded-2xl" />
          <div className="skeleton h-14 rounded-2xl" />
          <div className="skeleton h-14 rounded-3xl" />
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-start px-6 pt-[calc(env(safe-area-inset-top,0px)+1.5rem)] md:pt-20 pb-28"
      style={{ backgroundColor: "var(--bg-primary)" }}
    >
      <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-sm space-y-4">
        {/* Tillbaka */}
        <button
          type="button"
          onClick={() => {
            if (typeof window !== "undefined" && window.history.length > 1) router.back();
            else router.push("/profile");
          }}
          aria-label={t("common.back")}
          className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-zinc-500 hover:text-gold-500 transition-colors"
        >
          <ArrowLeft size={16} /> {t("common.back")}
        </button>

        {/* Header */}
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-gold-500 mx-auto bg-gold-500/10 border border-gold-500/20">
            <Lock size={22} />
          </div>
          <h1 className="text-2xl font-black uppercase tracking-tight" style={{ color: "var(--text-primary)" }}>
            {t("auth.welcomeBack.title.welcome")}{" "}
            <span className="text-gold-500">{t("auth.welcomeBack.title.welcomeAccent")}</span>
          </h1>
        </div>

        {/* Mejl + lösenord */}
        <form onSubmit={handleEmailLogin} className="space-y-3">
          <div>
            <label className="text-[9px] font-black uppercase tracking-widest text-zinc-600 ml-1 mb-1 block">{t("auth.email")}</label>
            <input
              required
              type="email"
              autoComplete="email"
              value={loginEmail}
              onChange={(e) => setLoginEmail(e.target.value)}
              placeholder={t("auth.emailPlaceholder")}
              className="w-full rounded-2xl py-3.5 px-5 font-bold placeholder:text-zinc-300 outline-none focus:ring-2 focus:ring-gold-500/40 transition-all"
              style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-muted)", color: "var(--text-primary)", fontSize: "16px" }}
            />
          </div>
          <div>
            <label className="text-[9px] font-black uppercase tracking-widest text-zinc-600 ml-1 mb-1 block">{t("auth.password")}</label>
            <div className="relative">
              <input
                required
                type={showLoginPassword ? "text" : "password"}
                autoComplete="current-password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                placeholder={t("auth.passwordPlaceholder")}
                className="w-full rounded-2xl py-3.5 px-5 pr-12 font-bold placeholder:text-zinc-300 outline-none focus:ring-2 focus:ring-gold-500/40 transition-all"
                style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-muted)", color: "var(--text-primary)", fontSize: "16px" }}
              />
              <button
                type="button"
                tabIndex={-1}
                onClick={() => setShowLoginPassword((v) => !v)}
                aria-label={showLoginPassword ? "Dölj lösenord" : "Visa lösenord"}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-full hover:bg-zinc-100/40 text-zinc-500 hover:text-zinc-800 transition-colors"
              >
                {showLoginPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>
          {loginError && <p className="text-red-500 text-[11px] text-center font-black uppercase">{loginError}</p>}
          <button
            type="submit"
            disabled={isLoggingIn}
            className="w-full py-4 bg-gold-500 text-zinc-950 rounded-3xl font-black uppercase tracking-widest text-sm shadow-xl shadow-gold-500/20 active:scale-95 transition-all flex items-center justify-center gap-3 disabled:opacity-60"
          >
            {isLoggingIn ? <Loader2 className="animate-spin" size={20} /> : t("auth.submitLogin")}
          </button>
          <div className="text-center pt-1">
            <Link href="/forgot-password" className="text-[10px] font-black uppercase tracking-widest text-zinc-500 hover:text-gold-500 transition-colors">
              {t("auth.forgotPassword")}
            </Link>
          </div>
        </form>

        {/* Divider */}
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t" style={{ borderColor: "var(--border-muted)" }} />
          </div>
          <div className="relative flex justify-center">
            <span className="px-4 text-[10px] font-black uppercase tracking-widest" style={{ backgroundColor: "var(--bg-primary)", color: "var(--text-secondary)" }}>
              {t("auth.orWithSocial")}
            </span>
          </div>
        </div>

        {/* Social */}
        <div className="grid grid-cols-2 gap-3">
          <SocialButton
            provider="apple"
            label="Apple"
            icon={
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
              </svg>
            }
          />
          <SocialButton
            provider="google"
            label="Google"
            icon={
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="#EA4335" d="M5.27 9.76A7.08 7.08 0 0 1 12 5c1.69 0 3.21.6 4.4 1.59L19.9 3.1A11.94 11.94 0 0 0 12 0C8.16 0 4.82 2 2.86 5.01l2.41 2.75z" />
                <path fill="#34A853" d="M16.04 18.01A7.07 7.07 0 0 1 12 19.1c-2.93 0-5.44-1.78-6.6-4.34l-2.84 2.19A11.96 11.96 0 0 0 12 24c3.24 0 6.17-1.17 8.4-3.09l-4.36-2.9z" />
                <path fill="#4A90D9" d="M19.1 12.2c0-.73-.07-1.36-.18-2H12v4.01h4.04a3.7 3.7 0 0 1-1.53 2.36l4.36 2.9c2.61-2.41 3.23-5.96.23-7.27z" />
                <path fill="#FBBC05" d="M5.4 14.76A7.16 7.16 0 0 1 5 12c0-.95.19-1.86.41-2.24L2.86 7.01A11.9 11.9 0 0 0 0 12c0 1.7.37 3.31.97 4.77l4.43-2z" />
              </svg>
            }
          />
        </div>

        {/* Registrera */}
        <p className="text-center text-[11px] font-bold uppercase tracking-widest text-zinc-600">
          {t("auth.noAccount")}{" "}
          <Link href="/register" className="text-gold-500 hover:text-gold-400 transition-colors">
            {t("auth.createFree")}
          </Link>
        </p>
      </motion.div>
    </div>
  );
}
