"use client";

import { useEffect, useState } from "react";
import { Loader2, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import PhoneAuth from "@/components/PhoneAuth";
import { getPlatformSessionStatus } from "@/lib/platformSessionClient";
import { useTranslation } from "@/lib/i18n/LocaleProvider";
import ReferralProfileCard from "@/components/ReferralProfileCard";

// auth-input-stilen används av PhoneAuth (telefon/kod-fälten).
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
  const [checking, setChecking] = useState(true);

  // Redan verifierad → skicka direkt till profilen.
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
          <div className="skeleton h-[50px] rounded-xl" />
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

        <div className="space-y-1.5">
          <h1 className="text-[26px] font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>
            Verifiera ditt nummer
          </h1>
          <p className="text-[14.5px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
            Spara ordrar och få snabbare support med bara ditt telefonnummer.
          </p>
        </div>

        <div className="flex flex-col gap-2.5">
          <PhoneAuth buttonLabel="Fortsätt med nummer" />
        </div>

        <ReferralProfileCard />

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
