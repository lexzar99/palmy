"use client";

import { FormEvent, useEffect, useRef, useState } from "react";

type Consent = "accepted" | "essential-only" | "rejected";
const CONSENT_KEY = "viaeats_cookie_consent";
const CONSENT_EVENT = "viaeats:cookie-consent";

function readConsent(): Consent | null {
  if (typeof window === "undefined") return null;
  try {
    const value = window.localStorage.getItem(CONSENT_KEY);
    return value === "accepted" || value === "essential-only" || value === "rejected" ? value : null;
  } catch {
    return null;
  }
}

export default function LaunchGate() {
  const [consent, setConsent] = useState<Consent | null>(null);
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState("");
  const [unlocking, setUnlocking] = useState(false);
  const [interestSent, setInterestSent] = useState(false);
  const trackedVisit = useRef(false);

  useEffect(() => {
    const sync = () => setConsent(readConsent());
    sync();
    window.addEventListener(CONSENT_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(CONSENT_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  useEffect(() => {
    if (consent !== "accepted" || trackedVisit.current) return;
    trackedVisit.current = true;
    void fetch("/api/launch/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventType: "PAGE_VIEW",
        sessionId: getSessionId(),
        referrer: document.referrer || null,
      }),
      keepalive: true,
    }).catch(() => null);
  }, [consent]);

  const claimInterest = () => {
    if (consent === "accepted") {
      void fetch("/api/launch/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventType: "DISCOUNT_CTA_CLICK", sessionId: getSessionId(), referrer: document.referrer || null }),
        keepalive: true,
      }).catch(() => null);
    }
    setInterestSent(true);
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
    } finally {
      setUnlocking(false);
    }
  };

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#f6ecdf] px-5 py-8 text-[#102b4e] sm:px-8 lg:px-12">
      <div className="pointer-events-none absolute -left-28 -top-28 h-72 w-72 rounded-full bg-[#102b4e]" />
      <div className="pointer-events-none absolute -right-28 -top-24 h-72 w-72 rounded-full bg-[#f0531c]" />
      <div className="pointer-events-none absolute -bottom-32 -left-10 h-80 w-80 rounded-full bg-[#f0531c]" />
      <div className="pointer-events-none absolute -bottom-40 -right-20 h-96 w-96 rounded-full bg-[#102b4e]" />

      <div className="relative mx-auto flex min-h-[calc(100vh-4rem)] max-w-6xl items-center justify-center">
        <section className="grid w-full overflow-hidden rounded-[2.25rem] border border-white/60 bg-[#102b4e] shadow-2xl shadow-[#102b4e]/20 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="flex flex-col justify-center px-7 py-12 sm:px-12 lg:px-16 lg:py-16">
            <img src="/viaeats-launch-icon.png" alt="ViaEats" className="mb-8 h-24 w-24 rounded-[1.7rem] object-cover" />
            <p className="text-xs font-black uppercase tracking-[0.25em] text-[#f0531c]">Lund först</p>
            <h1 className="mt-4 max-w-xl text-4xl font-black leading-[0.98] tracking-[-0.055em] text-[#f8f0e6] sm:text-6xl">Du är här.<br />Vi lanserar snart.</h1>
            <p className="mt-6 max-w-lg text-base font-semibold leading-relaxed text-[#f8f0e6]/75 sm:text-lg">Tack för ditt intresse. Vi bygger en snabbare och enklare plats för att beställa mat från lokala favoriter.</p>
            <button type="button" onClick={claimInterest} className="mt-8 w-fit rounded-full bg-[#f0531c] px-6 py-4 text-sm font-black text-white transition-transform hover:scale-[1.02] active:scale-[0.98]">{interestSent ? "Tack — vi har noterat ditt intresse" : "Ge mig 30 % rabatt första veckan"}</button>
            <p className="mt-4 text-xs font-semibold text-[#f8f0e6]/45">Intresseknappen registrerar bara ett anonymt klick efter analys-samtycke.</p>
          </div>

          <div className="flex flex-col justify-between bg-[#f6ecdf] px-7 py-10 sm:px-12 lg:px-12 lg:py-12">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.22em] text-[#102b4e]/55">På väg till Lund</p>
              <p className="mt-5 text-2xl font-black leading-tight tracking-[-0.04em] text-[#102b4e] sm:text-3xl">Mindre väntan.<br />Mer mat.</p>
            </div>
            <form onSubmit={unlock} className="mt-12 rounded-3xl border border-[#102b4e]/10 bg-white/55 p-5">
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

function getSessionId() {
  const key = "viaeats_launch_session";
  try {
    const existing = window.localStorage.getItem(key);
    if (existing) return existing;
    const created = window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    window.localStorage.setItem(key, created);
    return created;
  } catch {
    return null;
  }
}
