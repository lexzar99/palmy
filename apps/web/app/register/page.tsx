"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { User, ArrowLeft, Loader2, Gift, CheckCircle2, Mail, Eye, EyeOff } from "lucide-react";
import { motion } from "framer-motion";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { API_URL } from "@/lib/api";
import { persistPlatformSession } from "@/lib/platformSessionClient";
import { useToast } from "@/components/Toast";
import { getDeviceFingerprint } from "@/lib/deviceFingerprint";
import { useTranslation } from "@/lib/i18n/LocaleProvider";

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
    const ref = searchParams.get("ref");
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
            const redeemRes = await axios.post("/api/platform/account/redeem-code", {
              code: trimmedCode,
              email,
              deviceFingerprint: getDeviceFingerprint(),
            });
            if (redeemRes.data?.ok) {
              const inviterName = redeemRes.data?.inviterName || null;
              toast(
                inviterName
                  ? t("auth.register.referral.with", { name: inviterName })
                  : t("auth.register.referral.solo"),
                "success",
              );
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
    <div className="min-h-screen md:pt-20 pt-24 pb-32 px-6 flex flex-col items-center" style={{ backgroundColor: "var(--bg-primary)" }}>
      <Link href="/profile" className="absolute top-8 left-8 transition-all flex items-center gap-2 font-black uppercase tracking-widest text-[10px]" style={{ color: "var(--text-secondary)" }}>
        <ArrowLeft size={16} /> {t("auth.back")}
      </Link>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm space-y-10"
      >
        {success ? (
          /* Success-vy efter lyckad registrering. Manuell dismiss via knapp
             så user hinner läsa verifierings-instruktionen — auto-redirect
             hade gjort det förvirrande (matchar RN-flow). */
          <div className="space-y-6">
            <div className="text-center space-y-4">
              <div className="w-20 h-20 bg-emerald-500/10 rounded-[2rem] border border-emerald-500/20 flex items-center justify-center text-emerald-500 mx-auto shadow-2xl shadow-emerald-500/10">
                <CheckCircle2 size={36} />
              </div>
              <h1 className="text-3xl font-black uppercase tracking-tight">
                <span className="text-emerald-500">{t("auth.register.successTitle")}</span>
              </h1>
              <p className="text-[10px] font-black uppercase tracking-[0.2em]" style={{ color: "var(--text-secondary)" }}>
                {t("auth.register.successSub")}
              </p>
            </div>

            <div className="rounded-[1.75rem] p-6 space-y-3" style={{ backgroundColor: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.25)" }}>
              <div className="flex items-center gap-2 text-emerald-500">
                <Mail size={16} />
                <p className="text-[10px] font-black uppercase tracking-widest">
                  {t("auth.register.verifSent")}
                </p>
              </div>
              <p className="text-sm font-bold leading-relaxed" style={{ color: "var(--text-primary)" }}>
                {t("auth.register.verifTo")} <span className="text-gold-500 font-black">{success.email}</span>
              </p>
              <p className="text-[12px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                {success.loggedIn
                  ? t("auth.register.verifHintLoggedIn")
                  : t("auth.register.verifHintEmailExists")}
              </p>
              <p className="text-[10px] italic" style={{ color: "var(--text-secondary)" }}>
                {t("auth.register.verifSpamHint")}
              </p>
            </div>

            <button
              type="button"
              onClick={() => router.push(success.loggedIn ? "/profile" : "/")}
              className="w-full bg-gold-500 hover:bg-gold-600 text-zinc-950 py-5 rounded-3xl font-black uppercase tracking-widest text-sm shadow-xl shadow-gold-500/20 active:scale-95 transition-all"
            >
              {success.loggedIn ? t("auth.register.continueProfile") : t("auth.register.continueHome")}
            </button>
          </div>
        ) : (
        <>
        <div className="text-center space-y-4">
           <div className="w-20 h-20 bg-gold-500/10 rounded-[2rem] border border-gold-500/20 flex items-center justify-center text-gold-500 mx-auto shadow-2xl shadow-gold-500/10">
              <User size={32} />
           </div>
           <h1 className="text-3xl font-black uppercase tracking-tight">
             {t("auth.welcomeBack.title.create")} <span className="text-gold-500">{t("auth.welcomeBack.title.createAccent")}</span>
           </h1>
           <p className="text-zinc-500 text-[10px] font-black uppercase tracking-[0.2em]">
             {t("auth.register.subSaveHistory")}
           </p>
        </div>

        <form onSubmit={handleRegister} className="space-y-4" noValidate>
           <input
             type="text"
             autoComplete="given-name"
             aria-label={t("auth.register.firstNamePlaceholder")}
             placeholder={t("auth.register.firstNamePlaceholder")}
             required
             value={firstName}
             onChange={(e) => setFirstName(e.target.value)}
             className="w-full rounded-3xl py-5 px-8 outline-none focus:ring-2 focus:ring-gold-500/30 transition-all font-bold text-lg placeholder:text-zinc-500"
             style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-muted)", color: "var(--text-primary)" }}
           />
           <input
             type="text"
             autoComplete="family-name"
             aria-label={t("auth.register.lastNamePlaceholder")}
             placeholder={t("auth.register.lastNamePlaceholder")}
             required
             value={lastName}
             onChange={(e) => setLastName(e.target.value)}
             className="w-full rounded-3xl py-5 px-8 outline-none focus:ring-2 focus:ring-gold-500/30 transition-all font-bold text-lg placeholder:text-zinc-500"
             style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-muted)", color: "var(--text-primary)" }}
           />
           <input
             type="email"
             autoComplete="email"
             inputMode="email"
             aria-label={t("auth.register.emailPlaceholder")}
             placeholder={t("auth.register.emailPlaceholder")}
             required
             value={email}
             onChange={(e) => setEmail(e.target.value)}
             className="w-full rounded-3xl py-5 px-8 outline-none focus:ring-2 focus:ring-gold-500/30 transition-all font-bold text-lg placeholder:text-zinc-500"
             style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-muted)", color: "var(--text-primary)" }}
           />
           <input
             type="tel"
             autoComplete="tel"
             inputMode="tel"
             aria-label={t("auth.register.phonePlaceholder")}
             placeholder={t("auth.register.phonePlaceholder")}
             required
             value={phone}
             onChange={(e) => setPhone(e.target.value)}
             className="w-full rounded-3xl py-5 px-8 outline-none focus:ring-2 focus:ring-gold-500/30 transition-all font-bold text-lg placeholder:text-zinc-500"
             style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-muted)", color: "var(--text-primary)" }}
           />
           <div className="space-y-2">
             <div className="relative">
               <input
                 type={showPassword ? "text" : "password"}
                 autoComplete="new-password"
                 aria-label={t("auth.register.passwordPlaceholder")}
                 placeholder={t("auth.register.passwordPlaceholder")}
                 required
                 minLength={6}
                 value={password}
                 onChange={(e) => setPassword(e.target.value)}
                 className="w-full rounded-3xl py-5 px-8 pr-14 outline-none focus:ring-2 focus:ring-gold-500/30 transition-all font-bold text-lg placeholder:text-zinc-500"
                 style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-muted)", color: "var(--text-primary)" }}
               />
               <button
                 type="button"
                 tabIndex={-1}
                 onClick={() => setShowPassword((v) => !v)}
                 aria-label={showPassword ? "Dölj lösenord" : "Visa lösenord"}
                 className="absolute right-4 top-1/2 -translate-y-1/2 p-2 rounded-full hover:bg-zinc-100/40 text-zinc-500 hover:text-zinc-800 transition-colors"
               >
                 {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
               </button>
             </div>
             {/* Password-strength: 4-segment-bar visas så fort user börjat
                 skriva. Standard regler — längd + variation. Ingen tvingande
                 spärr, bara visuell hint som matchar RN-mobil-appen. */}
             {passwordStrength && (
               <div className="px-2">
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
                 <p
                   className="text-[10px] font-bold uppercase tracking-wider mt-1.5"
                   style={{ color: passwordStrength.color }}
                 >
                   {t("auth.register.strengthLabel", { label: passwordStrength.label })}
                 </p>
               </div>
             )}
           </div>

           {/* Referral-kod (frivilligt) — automatisk uppercase, max 12 tecken */}
           <div className="space-y-1.5">
             <label className="text-[9px] font-black uppercase tracking-widest text-zinc-500 ml-2 flex items-center gap-1.5">
               <Gift size={11} className="text-gold-500" /> {t("auth.register.refLabel")}
             </label>
             <input
               type="text"
               placeholder={t("auth.register.refPlaceholder")}
               maxLength={12}
               value={referralCode}
               onChange={(e) => setReferralCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
               className="w-full rounded-3xl py-5 px-8 outline-none focus:ring-2 focus:ring-gold-500/30 transition-all font-black tracking-[0.3em] text-lg uppercase placeholder:text-zinc-600 placeholder:tracking-normal placeholder:font-bold text-gold-500"
               style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-muted)" }}
             />
             {referralCode && (
               <p className="text-[9px] font-black uppercase tracking-widest text-emerald-500 ml-2">
                 {t("auth.register.refHint")}
               </p>
             )}
           </div>

           {error && <p className="text-red-500 text-[10px] font-black uppercase tracking-widest text-center">{error}</p>}

           <button
             type="submit"
             disabled={isRegistering}
             className="w-full bg-gold-500 hover:bg-gold-600 text-zinc-950 py-5 rounded-3xl font-black uppercase tracking-widest text-sm shadow-xl shadow-gold-500/20 active:scale-95 transition-all flex items-center justify-center gap-3"
           >
             {isRegistering ? <Loader2 className="animate-spin" size={20} /> : t("auth.submitRegister")}
           </button>
        </form>

        <p className="text-center text-[10px] font-black uppercase tracking-widest text-zinc-600">
           {t("auth.hasAccount")} <Link href="/profile" className="text-gold-500">{t("auth.signIn")}</Link>
        </p>
        </>
        )}
      </motion.div>
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
