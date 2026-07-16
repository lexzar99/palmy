"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";

const INTEREST_COOKIE = "viaeats_launch_interest";

export default function LaunchGate() {
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState("");
  const [unlocking, setUnlocking] = useState(false);
  const [interestRegistered, setInterestRegistered] = useState(false);
  const [showInterestForm, setShowInterestForm] = useState(false);
  const [interestName, setInterestName] = useState("");
  const [interestEmail, setInterestEmail] = useState("");
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [interestError, setInterestError] = useState("");
  const [submittingInterest, setSubmittingInterest] = useState(false);

  useEffect(() => {
    try {
      const cookieValue = document.cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${INTEREST_COOKIE}=`))?.split("=")[1];
      setInterestRegistered(cookieValue === "1" || window.localStorage.getItem(INTEREST_COOKIE) === "1");
    } catch {
      // The form remains available when browser storage is disabled.
    }
  }, []);

  const claimInterest = () => {
    if (interestRegistered) return;
    setInterestError("");
    setShowInterestForm(true);
  };

  const submitInterest = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!marketingConsent) {
      setInterestError("Godkänn att vi kontaktar dig manuellt om launchkupongen.");
      return;
    }
    setSubmittingInterest(true);
    setInterestError("");
    try {
      const response = await fetch("/api/launch/interest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: interestName,
          email: interestEmail,
          marketingConsent: true,
        }),
      });
      const payload = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) {
        setInterestError(payload?.error || "Kunde inte registrera ditt intresse.");
        return;
      }
      try {
        window.localStorage.setItem(INTEREST_COOKIE, "1");
        document.cookie = `${INTEREST_COOKIE}=1; path=/; max-age=${180 * 24 * 60 * 60}; samesite=lax`;
      } catch {}
      setInterestRegistered(true);
      setShowInterestForm(false);
      // Meta får endast Lead efter lyckad registrering och uttryckligt
      // samtycke för manuell kontakt — inte vid sidvisning eller knappklick.
      window.dispatchEvent(new Event("viaeats:meta-lead"));
    } catch {
      setInterestError("Servern svarade inte. Kontrollera anslutningen och försök igen.");
    } finally {
      setSubmittingInterest(false);
    }
  };

  const unlock = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setUnlocking(true);
    setCodeError("");
    try {
      const response = await fetch("/api/launch/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { error?: string } | null;
        setCodeError(payload?.error || "Koden är inte giltig");
        return;
      }
      window.location.reload();
    } catch {
      setCodeError("Servern svarade inte. Kontrollera anslutningen och försök igen.");
    } finally {
      setUnlocking(false);
    }
  };

  return (
    <main className="relative box-border min-h-[100dvh] w-full max-w-[100vw] overflow-x-clip overflow-y-auto bg-[#f6ecdf] px-3 py-4 text-[#102b4e] [padding-bottom:calc(1rem+env(safe-area-inset-bottom))] sm:px-8 sm:py-8 lg:px-12">
      <div className="pointer-events-none absolute -left-28 -top-28 h-72 w-72 rounded-full bg-[#102b4e]" />
      <div className="pointer-events-none absolute -right-28 -top-24 h-72 w-72 rounded-full bg-[#f0531c]" />
      <div className="pointer-events-none absolute -bottom-32 -left-10 h-80 w-80 rounded-full bg-[#f0531c]" />
      <div className="pointer-events-none absolute -bottom-40 -right-20 h-96 w-96 rounded-full bg-[#102b4e]" />

      <div className="relative mx-auto flex min-h-[calc(100dvh-2rem)] w-full max-w-6xl items-center justify-center">
        <section className="grid w-full min-w-0 max-w-full overflow-hidden rounded-[1.75rem] border border-white/60 bg-[#102b4e] shadow-2xl shadow-[#102b4e]/20 sm:rounded-[2.25rem] lg:grid-cols-[1.1fr_0.9fr]">
          <div className="flex min-w-0 flex-col justify-center px-5 py-8 sm:px-12 sm:py-12 lg:px-16 lg:py-16">
            <img src="/viaeats-launch-icon.png" alt="ViaEats" className="mb-8 h-24 w-24 rounded-[1.7rem] object-cover" />
            <p className="text-xs font-black uppercase tracking-[0.25em] text-[#f0531c]">Lund först</p>
            <h1 className="mt-4 max-w-xl break-words text-[2.15rem] font-black leading-[0.98] tracking-[-0.055em] text-[#f8f0e6] sm:text-6xl">Du är här.<br />Vi lanserar snart.</h1>
            <p className="mt-5 max-w-lg text-[15px] font-semibold leading-relaxed text-[#f8f0e6]/75 sm:mt-6 sm:text-lg">Tack för ditt intresse. Vi bygger en snabbare och enklare plats för att beställa mat från lokala favoriter.</p>
            <nav aria-label="Juridisk information" className="mt-4 flex min-w-0 flex-wrap gap-x-4 gap-y-2 text-xs font-bold text-[#f8f0e6]/70">
              <Link href="/privacy" className="underline underline-offset-4 hover:text-[#f8f0e6]">Integritet</Link>
              <Link href="/terms" className="underline underline-offset-4 hover:text-[#f8f0e6]">Villkor</Link>
              <Link href="/contact" className="underline underline-offset-4 hover:text-[#f8f0e6]">Kontakt</Link>
            </nav>
            <button type="button" onClick={claimInterest} disabled={interestRegistered} className="mt-7 max-w-full rounded-full bg-[#f0531c] px-5 py-3.5 text-left text-sm font-black text-white transition-transform hover:scale-[1.02] active:scale-[0.98] disabled:cursor-default disabled:opacity-80 sm:w-fit sm:px-6 sm:py-4">{interestRegistered ? "Tack — ditt intresse är registrerat" : "Ge mig 30 % rabatt första veckan"}</button>
            {interestRegistered ? (
              <p className="mt-4 max-w-md text-sm font-bold leading-relaxed text-[#f8f0e6]/80">Tack för ditt intresse. Vi följer upp manuellt via e-post inför lanseringen.</p>
            ) : (
              <p className="mt-4 max-w-md text-xs font-semibold leading-relaxed text-[#f8f0e6]/50">Knappen öppnar ett kort formulär. Vi sparar bara namn, e-post och ditt uttryckliga samtycke för manuell uppföljning.</p>
            )}
            {showInterestForm ? (
              <form onSubmit={submitInterest} className="mt-5 max-w-md rounded-3xl border border-white/10 bg-white/10 p-5">
                <p className="text-sm font-black text-[#f8f0e6]">Registrera ditt intresse</p>
                <div className="mt-3 grid gap-2">
                  <input value={interestName} onChange={(event) => setInterestName(event.target.value)} required minLength={2} maxLength={100} placeholder="Ditt namn" autoComplete="name" className="rounded-2xl border border-white/10 bg-white px-4 py-3 text-sm font-semibold text-[#102b4e] outline-none focus:border-[#f0531c]" />
                  <input value={interestEmail} onChange={(event) => setInterestEmail(event.target.value)} required type="email" maxLength={254} placeholder="Din e-post" autoComplete="email" className="rounded-2xl border border-white/10 bg-white px-4 py-3 text-sm font-semibold text-[#102b4e] outline-none focus:border-[#f0531c]" />
                </div>
                <label className="mt-3 flex items-start gap-2 text-xs font-semibold leading-relaxed text-[#f8f0e6]/75">
                  <input type="checkbox" checked={marketingConsent} onChange={(event) => setMarketingConsent(event.target.checked)} className="mt-0.5 h-4 w-4 accent-[#f0531c]" />
                  <span>Jag godkänner att ViaEats använder mitt namn och min e-post för att kontakta mig manuellt om launchkupongen och lanseringen. Läs vår <Link href="/privacy" className="underline">integritetspolicy</Link>.</span>
                </label>
                {interestError ? <p className="mt-3 text-xs font-bold text-[#ffb4a4]">{interestError}</p> : null}
                <button type="submit" disabled={submittingInterest} className="mt-4 w-full rounded-2xl bg-[#f0531c] px-4 py-3 text-sm font-black text-white disabled:opacity-60">{submittingInterest ? "Sparar…" : "Registrera mitt intresse"}</button>
              </form>
            ) : null}
          </div>

          <div className="flex min-w-0 flex-col justify-between bg-[#f6ecdf] px-5 py-7 sm:px-12 sm:py-10 lg:px-12 lg:py-12">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.22em] text-[#102b4e]/55">På väg till Lund</p>
              <p className="mt-5 text-2xl font-black leading-tight tracking-[-0.04em] text-[#102b4e] sm:text-3xl">Mindre väntan.<br />Mer mat.</p>
            </div>
            <form onSubmit={unlock} className="mt-8 rounded-3xl border border-[#102b4e]/10 bg-white/55 p-4 sm:mt-12 sm:p-5">
              <label htmlFor="launch-access-code" className="text-xs font-black uppercase tracking-[0.16em] text-[#102b4e]/55">Intern åtkomst</label>
              <div className="mt-3 flex gap-2">
                <input id="launch-access-code" value={code} onChange={(event) => setCode(event.target.value)} inputMode="numeric" autoComplete="one-time-code" type="password" placeholder="Kod" className="min-w-0 flex-1 rounded-2xl border border-[#102b4e]/10 bg-white px-4 py-3 text-base font-bold text-[#102b4e] outline-none focus:border-[#f0531c]" />
                <button type="submit" disabled={unlocking || !code} className="rounded-2xl bg-[#102b4e] px-4 py-3 text-sm font-black text-white disabled:opacity-40">{unlocking ? "…" : "Öppna"}</button>
              </div>
              {codeError ? <p className="mt-2 text-xs font-bold text-[#c33218]">{codeError}</p> : null}
            </form>
          </div>
        </section>
      </div>
    </main>
  );
}
