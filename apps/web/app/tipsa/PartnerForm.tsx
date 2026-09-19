"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowUpRight, Check, LoaderCircle } from "lucide-react";

export default function PartnerForm({ installation = false }: { installation?: boolean }) {
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [error, setError] = useState("");
  const inFlight = useRef(false);
  const entryQuery = useRef<string | null>(null);
  useEffect(() => { entryQuery.current = window.location.search; }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    const data = new FormData(event.currentTarget);
    inFlight.current = true; setState("sending"); setError("");
    const query = new URLSearchParams(entryQuery.current ?? window.location.search);
    const source = query.get("utm_source") || "direct";
    const token = (key: string) => { const value = query.get(key) || ""; return /^[a-zA-Z0-9_-]{1,80}$/.test(value) ? value : undefined; };
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch("/api/partner-applications/interest", {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal,
        body: JSON.stringify({ kind: installation ? "installation" : "partner", name: data.get("name"), email: data.get("email"), consent: data.get("consent") === "on", website: data.get("website"), ...(installation ? { restaurant: data.get("restaurant"), preferredTime: data.get("preferredTime") } : {}), source: ["meta", "tiktok", "organic"].includes(source) ? source : "direct", campaign: token("utm_campaign"), creative: token("utm_content") }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || result?.ok !== true) throw new Error(result?.error || "Kunde inte spara. Försök igen om en stund.");
      setState("done");
    } catch (cause) {
      setError(cause instanceof Error && cause.name !== "AbortError" ? cause.message : "Vi fick inget svar. Försök igen — samma anmälan sparas inte dubbelt."); setState("error");
    } finally { window.clearTimeout(timeout); inFlight.current = false; }
  }
  if (state === "done") return <div className="partner-success" role="status" aria-live="polite"><span className="partner-success-icon"><Check size={30}/></span><h3>{installation ? "Din förfrågan är framme." : "Nu börjar det."}</h3><p>{installation ? "Vi kontaktar dig via e-post och bekräftar en installationstid. Tiden är inte bokad förrän du fått vår bekräftelse." : "Vi har sparat din intresseanmälan. Vi kontaktar dig via e-post med upplägg, material och nästa steg innan du börjar."}</p><p className="partner-small">Håll utkik även i skräppost och kampanjfliken.</p></div>;
  return <form className="partner-form" onSubmit={submit} aria-busy={state === "sending"}>
    <label htmlFor="partner-name">Ditt namn<input id="partner-name" name="name" autoComplete="name" required minLength={2} maxLength={100} placeholder="För- och efternamn" /></label>
    <label htmlFor="partner-email">Din e-post<input id="partner-email" name="email" type="email" autoComplete="email" required maxLength={254} placeholder="du@exempel.se" /></label>
    {installation && <><label htmlFor="partner-restaurant">Restaurang och ort<input id="partner-restaurant" name="restaurant" required maxLength={150} autoComplete="organization" placeholder="Restaurangens namn, ort" /></label><label htmlFor="partner-time">När passar det er?<input id="partner-time" name="preferredTime" required maxLength={250} placeholder="Exempel: tisdag eller torsdag före lunch" /></label><p className="partner-small">Vi stämmer av avtal och tillgänglighet och bekräftar tiden personligen.</p></>}
    <div className="partner-honeypot" aria-hidden="true"><label>Hemsida<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
    <label className="partner-consent"><input type="checkbox" name="consent" required /><span>Jag vill bli kontaktad om {installation ? "installation" : "samarbetet"} och har läst <Link href="/tipsa/villkor#integritet">hur mina uppgifter används</Link>. Inga nyhetsbrev.</span></label>
    {error && <p className="partner-error" role="alert">{error}</p>}
    <button className="partner-button" type="submit" disabled={state === "sending"}>{state === "sending" ? <>Skickar <LoaderCircle size={20} className="partner-spin"/></> : <>{installation ? "Be om installationstid" : "Ja, kontakta mig"}<ArrowUpRight size={21}/></>}</button>
    <p className="partner-small">{installation ? "En förfrågan innebär ingen bekräftad bokning." : "Intresseanmälan är gratis och innebär inget avtal."}</p>
  </form>;
}
