"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";
import { Loader2, Phone, ArrowLeft } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { persistPlatformSession, clearLoggedOutMark } from "@/lib/platformSessionClient";
import { getDeviceFingerprint } from "@/lib/deviceFingerprint";
import { API_URL } from "@/lib/api";
import PhoneCountrySelect from "@/components/PhoneCountrySelect";

// Egen input-stil så komponenten funkar var som helst (login/register/profil)
// utan att sidan behöver injicera auth-input-CSS.
const PA_CSS = `
.pa-input {
  width: 100%;
  height: 48px;
  border-radius: 12px;
  border: 1px solid var(--line-strong);
  background: var(--bg-primary);
  padding: 0 16px;
  font-size: 15px;
  font-weight: 500;
  color: var(--text-primary);
  outline: none;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
.pa-input:focus { border-color: var(--text-primary); box-shadow: 0 0 0 3px rgba(127,127,127,0.12); }
.pa-input::placeholder { color: var(--text-secondary); opacity: 0.55; }
`;

// Lösenordsfri telefon-inloggning via Supabase phone-OTP, i FLERA steg:
//   nummer → SMS-kod → förnamn → efternamn → e-post (kvitto) → inloggad + deal.
// Återkommande användare (har redan namn) hoppar över namn-stegen och loggas in
// direkt. Allt kopplas till numret; inget lösenord. Kräver att en SMS-leverantör
// är aktiverad i Supabase Auth — tills dess visas ett vänligt fel.
type Step = "phone" | "code" | "firstName" | "lastName" | "email";

export default function PhoneAuth() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("phone");
  const [country, setCountry] = useState("+46");
  const [num, setNum] = useState("");
  const [code, setCode] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const fullPhone = () => `${country}${num.replace(/\D/g, "").replace(/^0/, "")}`;

  const attributeInvite = async () => {
    const cookieRef = document.cookie.match(/(?:^|; )dlv_ref=([^;]+)/)?.[1];
    if (!cookieRef) return;
    try {
      await axios.post("/api/platform/account/invite/attribute", {
        token: decodeURIComponent(cookieRef),
        deviceFingerprint: getDeviceFingerprint(),
        channel: "web",
      });
    } catch {
      /* tyst — blockerar aldrig inloggningen */
    }
  };

  // Steg 1: skicka SMS-kod.
  const sendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    clearLoggedOutMark(); // explicit inloggning → häv utloggnings-spärren
    try {
      const supabase = createSupabaseBrowserClient();
      const { error: err } = await supabase.auth.signInWithOtp({ phone: fullPhone() });
      if (err) throw err;
      setStep("code");
    } catch (err: any) {
      const m = (err?.message || "").toLowerCase();
      if (m.includes("rate") || m.includes("limit") || m.includes("too many")) {
        setError("För många SMS-försök just nu. Vänta en stund och försök igen.");
      } else if (m.includes("provider") || m.includes("disabled") || m.includes("unsupported") || m.includes("not enabled") || m.includes("not configured")) {
        setError("SMS-inloggning är inte aktiverad än. Prova Google eller Apple så länge.");
      } else {
        setError(err?.message || "Kunde inte skicka koden. Kontrollera numret.");
      }
    } finally {
      setLoading(false);
    }
  };

  // Steg 2: verifiera koden → session. Ny användare → namn-stegen, annars klart.
  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const supabase = createSupabaseBrowserClient();
      const { data, error: err } = await supabase.auth.verifyOtp({ phone: fullPhone(), token: code.trim(), type: "sms" });
      if (err) throw err;
      const accessToken = data.session?.access_token;
      if (!accessToken) throw new Error("Ingen session skapades");
      // Byt Supabase phone-session mot ett långlivat platform-JWT. Utan detta
      // rensar profil-bootstrappen den råa Supabase-cookien → utloggad direkt.
      const ex = await axios.post(
        `${API_URL}/api/auth/phone-token`,
        {},
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      const platformToken = ex.data?.token;
      if (!platformToken) throw new Error("Ingen platform-session");
      await persistPlatformSession(platformToken);
      await attributeInvite();
      // Återkommande (har namn) → logga in direkt. Ny → samla namn/efternamn/mail.
      try {
        const me = await axios.get("/api/platform/profile");
        if (me.data?.firstName || me.data?.name) {
          router.push("/profile");
          return;
        }
      } catch {
        /* om profil-koll fallerar, fortsätt till namn-insamling */
      }
      setStep("firstName");
      setLoading(false);
    } catch (err: any) {
      setError(err?.message?.includes("expired") ? "Koden har gått ut. Skicka en ny." : "Fel kod, försök igen.");
      setLoading(false);
    }
  };

  // Sista steget (e-post): spara namn + mail, logga in, dealen är redan kopplad.
  const finish = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await axios.patch("/api/platform/profile", {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        name: `${firstName.trim()} ${lastName.trim()}`.trim(),
        email: email.trim() || undefined,
      });
      router.push("/profile");
    } catch {
      setError("Kunde inte spara uppgifterna.");
      setLoading(false);
    }
  };

  const Back = ({ onClick }: { onClick: () => void }) => (
    <button type="button" onClick={onClick} className="inline-flex items-center gap-1 text-[13px]" style={{ color: "var(--text-secondary)" }}>
      <ArrowLeft size={14} /> Tillbaka
    </button>
  );

  const goldBtn = (label: string, disabled: boolean) => (
    <button type="submit" disabled={disabled} className="w-full h-[50px] bg-gold-500 rounded-xl text-[15px] font-semibold flex items-center justify-center gap-2 disabled:opacity-60" style={{ color: "#141416" }}>
      {loading ? <Loader2 className="animate-spin" size={18} /> : label}
    </button>
  );

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full h-[50px] rounded-xl text-[15px] font-semibold flex items-center justify-center gap-2.5 transition-opacity active:scale-[0.99]"
        style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--line-strong)", color: "var(--text-primary)" }}
      >
        <Phone size={17} /> Fortsätt med telefon
      </button>
    );
  }

  return (
    <div className="rounded-xl p-4 space-y-3.5" style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--line-strong)" }}>
      <style>{PA_CSS}</style>
      {step === "phone" && (
        <form onSubmit={sendCode} className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[14px] font-semibold" style={{ color: "var(--text-primary)" }}>Ditt telefonnummer</p>
            <Back onClick={() => setOpen(false)} />
          </div>
          <div className="flex gap-2">
            <PhoneCountrySelect value={country} onChange={setCountry} />
            <input type="tel" inputMode="tel" autoComplete="tel" required placeholder="70 123 45 67" value={num} onChange={(e) => setNum(e.target.value)} className="pa-input" style={{ flex: 1, minWidth: 0 }} />
          </div>
          {error && <p className="text-[13px] text-rose-600 leading-snug">{error}</p>}
          {goldBtn("Skicka kod", loading || !num)}
        </form>
      )}

      {step === "code" && (
        <form onSubmit={verify} className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[14px] font-semibold" style={{ color: "var(--text-primary)" }}>Ange koden</p>
            <Back onClick={() => { setStep("phone"); setError(""); }} />
          </div>
          <p className="text-[13px]" style={{ color: "var(--text-secondary)" }}>Vi skickade en kod till {fullPhone()}.</p>
          <input inputMode="numeric" autoComplete="one-time-code" required placeholder="123456" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} className="pa-input" style={{ letterSpacing: "0.3em", textAlign: "center", fontSize: 18 }} />
          {error && <p className="text-[13px] text-rose-600 leading-snug">{error}</p>}
          {goldBtn("Verifiera", loading || code.length < 4)}
        </form>
      )}

      {step === "firstName" && (
        <form onSubmit={(e) => { e.preventDefault(); if (firstName.trim()) setStep("lastName"); }} className="space-y-3">
          <p className="text-[14px] font-semibold" style={{ color: "var(--text-primary)" }}>Vad heter du?</p>
          <input type="text" autoComplete="given-name" required placeholder="Förnamn" value={firstName} onChange={(e) => setFirstName(e.target.value)} className="pa-input" autoFocus />
          {goldBtn("Nästa", !firstName.trim())}
        </form>
      )}

      {step === "lastName" && (
        <form onSubmit={(e) => { e.preventDefault(); if (lastName.trim()) setStep("email"); }} className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[14px] font-semibold" style={{ color: "var(--text-primary)" }}>Ditt efternamn</p>
            <Back onClick={() => setStep("firstName")} />
          </div>
          <input type="text" autoComplete="family-name" required placeholder="Efternamn" value={lastName} onChange={(e) => setLastName(e.target.value)} className="pa-input" autoFocus />
          {goldBtn("Nästa", !lastName.trim())}
        </form>
      )}

      {step === "email" && (
        <form onSubmit={finish} className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[14px] font-semibold" style={{ color: "var(--text-primary)" }}>E-post för kvitto</p>
            <Back onClick={() => setStep("lastName")} />
          </div>
          <input type="email" inputMode="email" autoComplete="email" placeholder="namn@exempel.se" value={email} onChange={(e) => setEmail(e.target.value)} className="pa-input" autoFocus />
          {error && <p className="text-[13px] text-rose-600 leading-snug">{error}</p>}
          {goldBtn("Klar", loading)}
        </form>
      )}
    </div>
  );
}
