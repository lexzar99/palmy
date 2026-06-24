"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { ArrowLeft, Loader2, CheckCircle2, Mail, Eye, EyeOff } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { API_URL } from "@/lib/api";
import { persistPlatformSession } from "@/lib/platformSessionClient";
import { useToast } from "@/components/Toast";
import SocialAuthButton from "@/components/SocialAuthButton";
import { getDeviceFingerprint } from "@/lib/deviceFingerprint";
import { useTranslation } from "@/lib/i18n/LocaleProvider";

// Delade input-stilar — CSS-klass (inte inline style) så :focus-reglerna
// fungerar utan JS. Samma utseende som login-sidan.
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

const FIELD_LABEL_CLASS = "block text-[13.5px] font-medium mb-1.5";

// Registreringen loggar in användaren direkt. Backend skapar kontot, skickar
// verifieringsmejl fire-and-forget och svarar med JWT + user. Vi persistar
// sessionen, visar en kort toast om mejlet och navigerar till /profile.
// Email-verifierings-länken i mejlet leder fortfarande till /verify-email
// och kan användas senare för att markera kontot som verifierat.
//
// REFERRAL: Om ?ref=KOD i URL ELLER användaren skriver in en kod manuellt,
// anropar vi POST /api/account/redeem-code efter lyckad registrering.
// Misslyckad redeem blockerar ALDRIG själva registreringen.
function RegisterContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const { t } = useTranslation();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [referralCode, setReferralCode] = useState("");
  const [isRegistering, setIsRegistering] = useState(false);
  const [error, setError] = useState("");
  // Success-vy: visas när registreringen är klar (oavsett om vi loggades in
  // automatiskt eller email-existerar-skydd triggades). User klickar
  // "Fortsätt" manuellt så de hinner läsa verifierings-instruktionen.
  const [success, setSuccess] = useState<{ loggedIn: boolean; email: string } | null>(null);

  // Password-strength: standard 4-nivå-bar baserat på längd + variation
  const passwordStrength = useMemo(() => {
    if (!password) return null;
    let score = 0;
    if (password.length >= 6) score++;
    if (password.length >= 10) score++;
    if (/[a-zåäö]/.test(password) && /[A-ZÅÄÖ]/.test(password)) score++;
    if (/\d/.test(password) || /[^a-zA-ZåäöÅÄÖ0-9]/.test(password)) score++;
    const labelKeys = [
      "auth.register.strength.weak",
      "auth.register.strength.ok",
      "auth.register.strength.good",
      "auth.register.strength.strong",
    ];
    const colors = ["#ef4444", "#f59e0b", "#3b82f6", "#10b981"];
    const idx = Math.min(3, Math.max(0, score - 1));
    return {
      score,
      label: t(labelKeys[idx]),
      color: colors[idx],
      activeBars: Math.max(1, score),
    };
  }, [password, t]);

  // Pre-fill referral-koden från ?ref=KOD så landing-page-flödet funkar:
  // /r/KOD → "Registrera nu" → /register?ref=KOD → fältet är förvalt.
  useEffect(() => {
    const cookieRef = typeof document !== "undefined"
      ? (document.cookie.match(/(?:^|; )dlv_ref=([^;]+)/)?.[1] ?? null)
      : null;
    const ref = searchParams.get("ref") || (cookieRef ? decodeURIComponent(cookieRef) : null);
    if (ref) {
      setReferralCode(ref.toUpperCase().slice(0, 12));
    }
  }, [searchParams]);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsRegistering(true);
    setError("");
    try {
      const res = await axios.post(`${API_URL}/api/account/register-user`, {
        firstName,
        lastName,
        email,
        phone: phone || undefined,
        password,
      });
      const token = res.data?.token;
      const loggedIn = !!token;
      if (token) {
        await persistPlatformSession(token);
      }

      // Referral-redeem är fire-and-forget — bara om vi blev inloggade
      // (har JWT) försöker vi koppla koden. För email-existerar-fallet
      // måste user logga in manuellt först, sen kan de redeem:a kod via
      // profil-sidan om de vill.
      if (loggedIn) {
        const trimmedCode = referralCode.trim().toUpperCase();
        if (trimmedCode) {
          try {
            const attrRes = await axios.post("/api/platform/account/invite/attribute", {
              token: trimmedCode,
              deviceFingerprint: getDeviceFingerprint(),
              channel: "web",
            });
            if (attrRes.data?.ok) {
              toast(t("auth.register.referral.solo"), "success");
            }
          } catch {
            // Tyst ignorera
          }
        }
      }

      // Visa success-vyn manuell-dismiss (matchar RN-flow). Triggas oavsett
      // om vi loggades in eller om email-existerar-skyddet ledde till tomt
      // token-svar. Användaren får läsa verifierings-instruktionen i sin takt.
      setSuccess({ loggedIn, email });
    } catch (err: any) {
      setError(err.response?.data?.error || t("auth.register.errorGeneric"));
    } finally {
      setIsRegistering(false);
    }
  };

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-start px-6 pt-[calc(env(safe-area-inset-top,0px)+1.5rem)] md:pt-20 pb-28"
      style={{ backgroundColor: "var(--bg-primary)" }}
    >
      <style>{AUTH_CSS}</style>
      <div className="w-full max-w-sm space-y-5">
        {success ? (
          /* Success-vy efter lyckad registrering. Manuell dismiss via knapp
             så user hinner läsa verifierings-instruktionen — auto-redirect
             hade gjort det förvirrande (matchar RN-flow). */
          <div className="space-y-5">
            <div className="space-y-1.5">
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center mb-3"
                style={{ backgroundColor: "rgba(16,185,129,0.1)", color: "#10b981" }}
              >
                <CheckCircle2 size={24} strokeWidth={2} />
              </div>
              <h1 className="text-[26px] font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>
                {t("auth.register.successTitle")}
              </h1>
              <p className="text-[14.5px]" style={{ color: "var(--text-secondary)" }}>
                {t("auth.register.successSub")}
              </p>
            </div>

            <div
              className="rounded-xl p-5 space-y-2.5"
              style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--line-strong)" }}
            >
              <div className="flex items-center gap-2" style={{ color: "#10b981" }}>
                <Mail size={16} strokeWidth={2} />
                <p className="text-[13.5px] font-semibold">{t("auth.register.verifSent")}</p>
              </div>
              <p className="text-[14px]" style={{ color: "var(--text-primary)" }}>
                {t("auth.register.verifTo")}{" "}
                <span className="font-semibold">{success.email}</span>
              </p>
              <p className="text-[13px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                {success.loggedIn
                  ? t("auth.register.verifHintLoggedIn")
                  : t("auth.register.verifHintEmailExists")}
              </p>
              <p className="text-[12.5px]" style={{ color: "var(--text-secondary)" }}>
                {t("auth.register.verifSpamHint")}
              </p>
            </div>

            <button
              type="button"
              onClick={() => router.push(success.loggedIn ? "/profile" : "/")}
              className="w-full h-[52px] bg-gold-500 rounded-xl text-[15.5px] font-semibold flex items-center justify-center transition-opacity hover:opacity-90"
              style={{ color: "#141416" }}
            >
              {success.loggedIn ? t("auth.register.continueProfile") : t("auth.register.continueHome")}
            </button>
          </div>
        ) : (
          <>
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

            {/* Socialt — välj att skapa konto direkt med Apple/Google */}
            <div className="flex flex-col gap-2.5">
              <SocialAuthButton provider="apple" />
              <SocialAuthButton provider="google" />
            </div>
            <div className="flex items-center gap-3">
              <div className="h-px flex-1" style={{ backgroundColor: "var(--border-muted)" }} />
              <span className="text-[13px]" style={{ color: "var(--text-secondary)" }}>{t("auth.orWithSocial")}</span>
              <div className="h-px flex-1" style={{ backgroundColor: "var(--border-muted)" }} />
            </div>

            <form onSubmit={handleRegister} className="space-y-3.5" noValidate>
              <div>
                <label htmlFor="reg-firstname" className={FIELD_LABEL_CLASS} style={{ color: "var(--text-secondary)" }}>
                  {t("auth.register.firstNameLabel")}
                </label>
                <input
                  id="reg-firstname"
                  type="text"
                  autoComplete="given-name"
                  required
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="auth-input"
                />
              </div>
              <div>
                <label htmlFor="reg-lastname" className={FIELD_LABEL_CLASS} style={{ color: "var(--text-secondary)" }}>
                  {t("auth.register.lastNameLabel")}
                </label>
                <input
                  id="reg-lastname"
                  type="text"
                  autoComplete="family-name"
                  required
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="auth-input"
                />
              </div>
              <div>
                <label htmlFor="reg-email" className={FIELD_LABEL_CLASS} style={{ color: "var(--text-secondary)" }}>
                  {t("auth.field.email")}
                </label>
                <input
                  id="reg-email"
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  placeholder={t("auth.emailPlaceholder")}
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="auth-input"
                />
              </div>
              <div>
                <label htmlFor="reg-phone" className={FIELD_LABEL_CLASS} style={{ color: "var(--text-secondary)" }}>
                  {t("auth.register.phoneLabel")}
                </label>
                <input
                  id="reg-phone"
                  type="tel"
                  autoComplete="tel"
                  inputMode="tel"
                  placeholder={t("auth.register.phonePlaceholder")}
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="auth-input"
                />
              </div>
              <div className="space-y-2">
                <div>
                  <label htmlFor="reg-password" className={FIELD_LABEL_CLASS} style={{ color: "var(--text-secondary)" }}>
                    {t("auth.field.password")}
                  </label>
                  <div className="relative">
                    <input
                      id="reg-password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="new-password"
                      placeholder={t("auth.register.passwordPlaceholder")}
                      required
                      minLength={6}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="auth-input"
                      style={{ paddingRight: 48 }}
                    />
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? "Dölj lösenord" : "Visa lösenord"}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-full transition-colors hover:bg-[var(--bg-deep)]"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      {showPassword ? <EyeOff size={18} strokeWidth={2} /> : <Eye size={18} strokeWidth={2} />}
                    </button>
                  </div>
                </div>
                {/* Password-strength: 4-segment-bar visas så fort user börjat
                    skriva. Standard regler — längd + variation. Ingen tvingande
                    spärr, bara visuell hint som matchar RN-mobil-appen. */}
                {passwordStrength && (
                  <div className="px-1">
                    <div className="flex gap-1">
                      {[0, 1, 2, 3].map((i) => (
                        <div
                          key={i}
                          className="flex-1 h-1 rounded-full transition-colors"
                          style={{
                            backgroundColor: i < passwordStrength.activeBars
                              ? passwordStrength.color
                              : "var(--border-muted)",
                          }}
                        />
                      ))}
                    </div>
                    <p className="text-[12px] font-medium mt-1.5" style={{ color: passwordStrength.color }}>
                      {t("auth.register.strengthLabel", { label: passwordStrength.label })}
                    </p>
                  </div>
                )}
              </div>

              {/* Referral-system avstängt — håller fältet osynligt men låter
                  ?ref=KOD-URL-prefill fortsätta fungera tyst i bakgrunden så
                  befintliga referral-länkar inte 404:ar. Backend-redeemen
                  sker fortfarande automatiskt vid registrering om koden
                  är validate-bar. */}

              {error && <p className="text-[13px] text-rose-600 text-center leading-snug">{error}</p>}

              <button
                type="submit"
                disabled={isRegistering}
                className="w-full h-[52px] bg-gold-500 rounded-xl text-[15.5px] font-semibold flex items-center justify-center gap-2 transition-opacity disabled:opacity-60"
                style={{ color: "#141416" }}
              >
                {isRegistering ? <Loader2 className="animate-spin" size={20} /> : t("auth.submitRegister")}
              </button>
            </form>

            <p className="text-center text-[14px]" style={{ color: "var(--text-secondary)" }}>
              {t("auth.hasAccount")}{" "}
              <Link href="/login" className="font-semibold" style={{ color: "var(--text-primary)" }}>
                {t("auth.signIn")}
              </Link>
            </p>
          </>
        )}
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
