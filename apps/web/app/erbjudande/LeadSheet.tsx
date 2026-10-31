"use client";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Check, LoaderCircle, X } from "lucide-react";
import { trackMetaLead } from "@/lib/metaEvents";

const STEPS = [
  { name: "restaurant", title: "Vad heter din restaurang?", type: "text", autoComplete: "organization", placeholder: "Restaurangens namn", min: 2, max: 150 },
  { name: "name", title: "Vad heter du?", type: "text", autoComplete: "name", placeholder: "För- och efternamn", min: 2, max: 100 },
  { name: "phone", title: "Vilket nummer når vi dig på?", type: "tel", autoComplete: "tel", placeholder: "070-123 45 67", min: 7, max: 20 },
  { name: "city", title: "Vilken stad ligger restaurangen i?", type: "text", autoComplete: "address-level2", placeholder: "Lund", min: 2, max: 80 },
] as const;
type Field = (typeof STEPS)[number]["name"];
const PHONE = /^\+?[0-9 ()-]{7,20}$/;

/**
 * Formuläret öppnas av alla länkar till #registrera och visar en fråga i taget. Anmälan sparas som
 * kind "restaurant" i partnerinkorgen och ger en WhatsApp-notis "NY RESTAURANG". Att skicka är samtycket.
 */
export default function LeadSheet() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [values, setValues] = useState<Record<Field, string>>({ restaurant: "", name: "", phone: "", city: "" });
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const trap = useRef<HTMLInputElement>(null);
  const inFlight = useRef(false);
  const entryQuery = useRef<string | null>(null);
  const current = STEPS[step];
  const value = values[current.name];
  const valid = current.name === "phone" ? PHONE.test(value.trim()) : value.trim().length >= current.min;

  const close = useCallback(() => setOpen(false), []);
  useEffect(() => {
    entryQuery.current = window.location.search;
    const onClick = (event: MouseEvent) => {
      const link = (event.target as HTMLElement).closest?.('a[href="#registrera"]');
      if (!link) return;
      event.preventDefault();
      setOpen(true);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);
  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = ""; window.removeEventListener("keydown", onKey); };
  }, [open, close]);
  useEffect(() => { if (open && state !== "done") input.current?.focus(); }, [open, step, state]);

  async function send() {
    if (inFlight.current) return;
    inFlight.current = true; setState("sending"); setError("");
    const query = new URLSearchParams(entryQuery.current ?? window.location.search);
    const source = query.get("utm_source") || "direct";
    const token = (key: string) => { const raw = query.get(key) || ""; return /^[a-zA-Z0-9_-]{1,80}$/.test(raw) ? raw : undefined; };
    const campaign = token("utm_campaign") ?? "erbjudande";
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch("/api/partner-applications/interest", {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal,
        body: JSON.stringify({
          kind: "restaurant", plan: "start", consent: true,
          restaurant: values.restaurant.trim(), name: values.name.trim(), phone: values.phone.trim(), city: values.city.trim(), website: trap.current?.value ?? "",
          source: ["meta", "tiktok", "organic"].includes(source) ? source : "direct", campaign, creative: token("utm_content"),
        }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || result?.ok !== true) throw new Error(result?.error || "Kunde inte spara. Försök igen om en stund.");
      trackMetaLead(values.phone.replace(/\D/g, ""), campaign);
      setState("done");
    } catch (cause) {
      setError(cause instanceof Error && cause.name !== "AbortError" ? cause.message : "Vi fick inget svar. Försök igen, samma anmälan sparas inte dubbelt."); setState("error");
    } finally { window.clearTimeout(timeout); inFlight.current = false; }
  }

  function next(event: FormEvent) {
    event.preventDefault();
    if (!valid || state === "sending") return;
    if (step < STEPS.length - 1) setStep(step + 1); else void send();
  }

  if (!open) return null;
  const last = step === STEPS.length - 1;
  return (
    <div className="lead-overlay" role="dialog" aria-modal="true" aria-label="Testa viaeats gratis" onClick={(event) => { if (event.target === event.currentTarget) close(); }}>
      <div className="lead-sheet">
        <div className="lead-top">
          <p><b>5 % per order</b> · Ingen startavgift · Ingen månadsavgift</p>
          <button type="button" className="lead-close" onClick={close} aria-label="Stäng"><X size={20} aria-hidden="true" /></button>
        </div>
        {state === "done" ? (
          <div className="lead-done" role="status" aria-live="polite">
            <span><Check size={34} aria-hidden="true" /></span>
            <h2>Tack, {values.name.trim().split(" ")[0]}!</h2>
            <p>Vi ringer dig inom en arbetsdag och går igenom allt för {values.restaurant.trim()}.</p>
            <button type="button" className="lead-next" onClick={close}>Klar</button>
          </div>
        ) : (
          <form onSubmit={next} noValidate>
            <div className="lead-progress" aria-hidden="true"><span style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} /></div>
            <p className="lead-count">{step + 1} av {STEPS.length}</p>
            <label key={current.name} className="lead-step">
              <span>{current.title}</span>
              <input ref={input} name={current.name} type={current.type} value={value} placeholder={current.placeholder} autoComplete={current.autoComplete} maxLength={current.max} inputMode={current.type === "tel" ? "tel" : undefined} enterKeyHint={last ? "send" : "next"} onChange={(event) => setValues({ ...values, [current.name]: event.target.value })} />
            </label>
            <div className="offer-honeypot" aria-hidden="true"><label>Hemsida<input ref={trap} name="website" tabIndex={-1} autoComplete="off" /></label></div>
            {error && <p className="offer-error" role="alert">{error}</p>}
            <div className="lead-actions">
              {step > 0 && <button type="button" className="lead-back" onClick={() => setStep(step - 1)} aria-label="Tillbaka"><ArrowLeft size={20} aria-hidden="true" /></button>}
              <button type="submit" className="lead-next" disabled={!valid || state === "sending"}>
                {state === "sending" ? <>Skickar <LoaderCircle size={18} className="offer-spin" aria-hidden="true" /></> : <>{last ? "Testa gratis" : "Nästa"} <ArrowRight size={18} aria-hidden="true" /></>}
              </button>
            </div>
            <p className="lead-note">Vi ringer dig för att berätta mer. <Link href="/privacy">Så hanterar vi dina uppgifter.</Link></p>
          </form>
        )}
      </div>
    </div>
  );
}
