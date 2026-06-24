"use client";

import { Suspense, useEffect } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import SocialAuthButton from "@/components/SocialAuthButton";
import PhoneAuth from "@/components/PhoneAuth";
import { useTranslation } from "@/lib/i18n/LocaleProvider";

// auth-input-stilen används av PhoneAuth (telefon/kod/namn-fälten).
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

// Skapa konto = som att logga in: Apple, Google eller telefon (lösenordsfritt).
// Telefon är manuell-vägen: nummer → SMS-kod → förnamn → efternamn → e-post.
function RegisterContent() {
  const searchParams = useSearchParams();
  const { t } = useTranslation();

  // Spegla ?ref=KOD → dlv_ref-cookie så invite-attribution funkar även om man
  // landar direkt på /register?ref=... (PhoneAuth/attribution läser cookien).
  useEffect(() => {
    const ref = searchParams.get("ref");
    if (!ref) return;
    const clean = ref.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 32);
    if (clean) document.cookie = `dlv_ref=${clean}; path=/; max-age=${60 * 60 * 24 * 30}; samesite=lax`;
  }, [searchParams]);

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-start px-6 pt-[calc(env(safe-area-inset-top,0px)+1.5rem)] md:pt-20 pb-28"
      style={{ backgroundColor: "var(--bg-primary)" }}
    >
      <style>{AUTH_CSS}</style>
      <div className="w-full max-w-sm space-y-5">
        {/* Tillbaka — rund ghost-knapp */}
        <Link
          href="/profile"
          aria-label={t("auth.back")}
          className="w-9 h-9 rounded-full flex items-center justify-center transition-colors hover:bg-[var(--bg-deep)]"
          style={{ border: "1px solid var(--line-strong)", color: "var(--text-primary)" }}
        >
          <ArrowLeft size={16} strokeWidth={2} />
        </Link>

        {/* Header */}
        <div className="space-y-1.5">
          <h1 className="text-[26px] font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>
            {t("auth.register.title")}
          </h1>
          <p className="text-[14.5px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
            {t("auth.register.subSaveHistory")}
          </p>
        </div>

        {/* Apple, Google eller telefon */}
        <div className="flex flex-col gap-2.5">
          <SocialAuthButton provider="apple" />
          <SocialAuthButton provider="google" />
          <PhoneAuth />
        </div>

        <p className="text-center text-[14px]" style={{ color: "var(--text-secondary)" }}>
          {t("auth.hasAccount")}{" "}
          <Link href="/login" className="font-semibold" style={{ color: "var(--text-primary)" }}>
            {t("auth.signIn")}
          </Link>
        </p>
      </div>
    </div>
  );
}

// useSearchParams() kräver Suspense-boundary i Next 16 — annars går
// hela sidan i bailout-to-CSR vid prerender, vilket triggar build-error.
const RegisterPage = () => (
  <Suspense fallback={
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "var(--bg-primary)" }}>
      <Loader2 className="animate-spin text-gold-500" size={32} />
    </div>
  }>
    <RegisterContent />
  </Suspense>
);

export default RegisterPage;
