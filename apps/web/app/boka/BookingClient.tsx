"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Check, MapPin, Video } from "lucide-react";
import "@/components/restaurant/restaurant.css";
import { useDesignBackground } from "@/components/restaurant/useDesignBackground";

type Mode = "onsite" | "video";
type Slot = { start: string; end: string; label: string; available: boolean };
type Day = { date: string; weekday: number; weekdayShort: string; dateLabel: string; slots: Slot[] };
type Booked = { start: string; mode: Mode; dayLabel: string; time: string; email: string; emailed: boolean };

/**
 * Skånes orter för förslagslistan och för att låsa "På plats". Samma lista
 * och normalisering som API:ts lib/partnerMeetings.ts — API:t är sanningen
 * och nekar på plats utanför Skåne även om klienten skulle släppa igenom.
 */
const SKANE_CITIES = [
  "Malmö", "Lund", "Helsingborg", "Kristianstad", "Landskrona", "Trelleborg", "Ängelholm",
  "Hässleholm", "Ystad", "Eslöv", "Höganäs", "Åstorp", "Staffanstorp", "Vellinge", "Höör",
  "Simrishamn", "Klippan", "Svedala", "Lomma", "Kävlinge", "Bjuv", "Perstorp", "Tomelilla",
  "Sjöbo", "Skurup", "Båstad", "Osby", "Örkelljunga", "Burlöv", "Arlöv", "Svalöv", "Bromölla",
];
const CITY_SUGGESTIONS = [...SKANE_CITIES, "Stockholm", "Umeå"];

function normalizeCity(city: string) {
  return city.split(",")[0].normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/\bkommun\b/g, "").replace(/\s+/g, " ").trim();
}
const SKANE_KEYS = new Set(SKANE_CITIES.map(normalizeCity));
function isSkaneCity(city: string) {
  const key = normalizeCity(city);
  if (!key) return false;
  return SKANE_KEYS.has(key) || (key.endsWith("s") && SKANE_KEYS.has(key.slice(0, -1)));
}

const WEEKDAY_LONG: Record<number, string> = { 1: "måndag", 4: "torsdag", 5: "fredag", 6: "lördag", 7: "söndag" };

function freeLabel(n: number) {
  if (n === 0) return "Fullbokad";
  if (n === 1) return "1 ledig";
  return `${n} lediga`;
}

export default function BookingClient({ initialRestaurant, initialCity }: { initialRestaurant: string; initialCity: string }) {
  useDesignBackground();

  const [days, setDays] = useState<Day[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [dayIndex, setDayIndex] = useState(0);
  const [slotStart, setSlotStart] = useState<string | null>(null);
  const [restaurant, setRestaurant] = useState(initialRestaurant);
  const [city, setCity] = useState(initialCity);
  const [chosenMode, setMode] = useState<Mode>(isSkaneCity(initialCity) ? "onsite" : "video");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [booked, setBooked] = useState<Booked | null>(null);

  const skane = isSkaneCity(city);
  const cityEntered = city.trim().length >= 2;

  // Utanför Skåne går det inte att ses på plats, oavsett vad som valts tidigare.
  const mode: Mode = skane ? chosenMode : "video";

  const loadSlots = useCallback(async (keepDay?: string) => {
    try {
      setLoadError(false);
      const res = await fetch("/api/partner-meetings/slots", { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { days: Day[] };
      setDays(data.days);
      // Första dagen med en ledig tid väljs, eller samma dag som förut.
      const keep = keepDay ? data.days.findIndex((d) => d.date === keepDay) : -1;
      const firstFree = data.days.findIndex((d) => d.slots.some((s) => s.available));
      setDayIndex(keep >= 0 ? keep : Math.max(0, firstFree));
    } catch {
      setLoadError(true);
    }
  }, []);

  useEffect(() => { void loadSlots(); }, [loadSlots]);

  const day = days?.[dayIndex] ?? null;
  const selected = useMemo(() => {
    if (!days || !slotStart) return null;
    for (const d of days) {
      const s = d.slots.find((x) => x.start === slotStart);
      if (s) return { day: d, slot: s };
    }
    return null;
  }, [days, slotStart]);

  const canSubmit = Boolean(selected) && restaurant.trim().length >= 2 && cityEntered
    && name.trim().length >= 2 && phone.replace(/\D/g, "").length >= 7 && /.+@.+\..+/.test(email.trim());

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!selected || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/partner-meetings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slotStart: selected.slot.start,
          mode,
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim(),
          restaurant: restaurant.trim(),
          city: city.trim(),
          ...(website ? { website } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 409) {
        setError(data.error || "Tiden hann bokas av någon annan, välj en annan");
        setSlotStart(null);
        await loadSlots(selected.day.date);
        return;
      }
      if (!res.ok) {
        setError(data.error || "Bokningen gick inte igenom. Försök igen.");
        return;
      }
      setBooked({
        start: selected.slot.start,
        mode,
        dayLabel: `${WEEKDAY_LONG[selected.day.weekday] ?? selected.day.weekdayShort} ${selected.day.dateLabel}`,
        time: selected.slot.label,
        email: email.trim(),
        emailed: Boolean(data.emailed),
      });
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      setError("Ingen kontakt med servern. Kontrollera uppkopplingen och försök igen.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="ve-root min-h-screen">
      <div
        className="mx-auto max-w-[560px] px-4 pb-16"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 28px)" }}
      >
        <p className="text-[17px] font-semibold tracking-[-0.02em]">viaeats</p>

        {booked ? (
          <Confirmation booked={booked} restaurant={restaurant.trim()} city={city.trim()} />
        ) : (
          <>
            <header className="mt-8">
              <h1 className="text-[28px] font-semibold leading-[1.15] tracking-[-0.025em]">Boka en genomgång med viaeats</h1>
              <p className="mt-2 text-[15px] leading-[1.45] text-[color:var(--ve-ink-2)]">
                30 minuter. Jag visar terminalen och hur dina kunder beställer.
              </p>
            </header>

            <form onSubmit={submit} className="mt-8 flex flex-col gap-8" noValidate>
              {/* Dag och tid */}
              <section>
                <SectionTitle>Välj dag</SectionTitle>
                {!days && !loadError && (
                  <div className="mt-3 flex gap-2">
                    {Array.from({ length: 4 }).map((_, i) => <div key={i} className="ve-skeleton h-[64px] w-[84px] shrink-0 rounded-[18px]" />)}
                  </div>
                )}
                {loadError && (
                  <div className="ve-card mt-3 px-5 py-5 text-[15px]">
                    <p>Kunde inte hämta lediga tider.</p>
                    <button type="button" onClick={() => void loadSlots()} className="ve-press mt-3 rounded-full bg-[color:var(--ve-fill)] px-4 py-2 text-[14px] font-semibold">
                      Försök igen
                    </button>
                  </div>
                )}
                {days && (
                  <div className="ve-no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1" role="tablist" aria-label="Dag">
                    {days.map((d, i) => {
                      const free = d.slots.filter((s) => s.available).length;
                      const active = i === dayIndex;
                      return (
                        <button
                          key={d.date}
                          type="button"
                          role="tab"
                          aria-selected={active}
                          onClick={() => setDayIndex(i)}
                          className={`ve-chip flex h-[68px] min-w-[84px] shrink-0 flex-col items-center justify-center rounded-[18px] px-3 ${
                            active ? "bg-[color:var(--ve-ink)] text-white" : "bg-[color:var(--ve-card)] text-[color:var(--ve-ink)] shadow-[inset_0_0_0_0.5px_var(--ve-line-2)]"
                          }`}
                        >
                          <span className={`text-[12px] font-medium ${active ? "text-white/70" : "text-[color:var(--ve-ink-3)]"}`}>{capitalize(d.weekdayShort)}</span>
                          <span className="ve-tabular text-[15px] font-semibold leading-tight">{d.dateLabel}</span>
                          <span className={`ve-tabular mt-0.5 text-[11.5px] font-medium ${
                            active ? "text-white/70" : free <= 2 ? "text-[color:var(--ve-accent)]" : "text-[color:var(--ve-ink-3)]"
                          }`}>{freeLabel(free)}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </section>

              {day && (
                <section>
                  <SectionTitle>Välj tid</SectionTitle>
                  <div className="ve-card mt-3 grid grid-cols-3 gap-2 p-3 sm:grid-cols-4">
                    {day.slots.map((s) => {
                      const active = s.start === slotStart;
                      if (!s.available) {
                        return (
                          <div
                            key={s.start}
                            aria-disabled="true"
                            className="flex h-[56px] flex-col items-center justify-center rounded-[14px] bg-[color:var(--ve-card-2)] text-[color:var(--ve-ink-3)]"
                          >
                            <span className="ve-tabular text-[15px] font-medium line-through decoration-[1px]">{s.label}</span>
                            <span className="text-[11.5px] font-medium">Bokad</span>
                          </div>
                        );
                      }
                      return (
                        <button
                          key={s.start}
                          type="button"
                          onClick={() => { setSlotStart(s.start); setError(null); }}
                          aria-pressed={active}
                          className={`ve-press flex h-[56px] flex-col items-center justify-center rounded-[14px] ${
                            active ? "bg-[color:var(--ve-ink)] text-white" : "bg-[color:var(--ve-fill)] text-[color:var(--ve-ink)]"
                          }`}
                        >
                          <span className="ve-tabular text-[15px] font-semibold">{s.label}</span>
                          <span className={`text-[11.5px] font-medium ${active ? "text-white/70" : "text-[color:var(--ve-ink-2)]"}`}>
                            {active ? "Vald" : "Ledig"}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* Restaurangen och mötesform */}
              <section>
                <SectionTitle>Restaurangen</SectionTitle>
                <div className="ve-card mt-3 overflow-hidden">
                  <Field label="Restaurangens namn">
                    <input className="ve-input w-full bg-transparent outline-none" value={restaurant} onChange={(e) => setRestaurant(e.target.value)} autoComplete="organization" placeholder="Restaurangens namn" maxLength={120} />
                  </Field>
                  <Field label="Ort" last>
                    <input className="ve-input w-full bg-transparent outline-none" value={city} onChange={(e) => setCity(e.target.value)} list="boka-cities" autoComplete="address-level2" placeholder="T.ex. Lund" maxLength={80} />
                    <datalist id="boka-cities">
                      {CITY_SUGGESTIONS.map((c) => <option key={c} value={c} />)}
                    </datalist>
                  </Field>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-1 rounded-[12px] bg-[color:var(--ve-fill)] p-[3px]" role="radiogroup" aria-label="Mötesform">
                  <ModeButton active={mode === "onsite"} disabled={!skane} onClick={() => setMode("onsite")} icon={<MapPin size={16} strokeWidth={2} />} label="På plats" />
                  <ModeButton active={mode === "video"} onClick={() => setMode("video")} icon={<Video size={16} strokeWidth={2} />} label="Videomöte" />
                </div>
                <p className="mt-2 px-1 text-[13px] leading-[1.4] text-[color:var(--ve-ink-2)]">
                  {!skane && cityEntered
                    ? "Videomöte för restauranger utanför Skåne."
                    : mode === "onsite"
                      ? "Jag kommer till restaurangen och visar terminalen på plats."
                      : "Vi ses på video. Länken kommer innan mötet."}
                </p>
              </section>

              {/* Kontakt */}
              <section>
                <SectionTitle>Dina uppgifter</SectionTitle>
                <div className="ve-card mt-3 overflow-hidden">
                  <Field label="Namn">
                    <input className="ve-input w-full bg-transparent outline-none" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder="För- och efternamn" maxLength={100} />
                  </Field>
                  <Field label="Telefon">
                    <input className="ve-input ve-tabular w-full bg-transparent outline-none" value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" inputMode="tel" autoComplete="tel" placeholder="070-123 45 67" maxLength={30} />
                  </Field>
                  <Field label="E-post" last>
                    <input className="ve-input w-full bg-transparent outline-none" value={email} onChange={(e) => setEmail(e.target.value)} type="email" inputMode="email" autoComplete="email" autoCapitalize="none" placeholder="namn@restaurang.se" maxLength={254} />
                  </Field>
                </div>
                {/* Honungsfälla för botar; dold för människor och skärmläsare. */}
                <input
                  type="text" tabIndex={-1} aria-hidden="true" autoComplete="off" value={website}
                  onChange={(e) => setWebsite(e.target.value)} name="website"
                  style={{ position: "absolute", left: "-10000px", width: 1, height: 1, opacity: 0 }}
                />
              </section>

              <section>
                {error && (
                  <p role="alert" className="mb-3 rounded-[14px] bg-[color:var(--ve-danger-soft)] px-4 py-3 text-[14px] text-[color:var(--ve-danger)]">{error}</p>
                )}
                <button
                  type="submit"
                  disabled={!canSubmit || submitting}
                  className="ve-press flex h-[56px] w-full items-center justify-center rounded-full bg-[color:var(--ve-cta)] text-[16px] font-semibold text-[color:var(--ve-cta-ink)] disabled:opacity-35"
                >
                  {submitting ? "Bokar…" : "Boka tid"}
                </button>
                <p className="ve-tabular mt-3 text-center text-[13px] text-[color:var(--ve-ink-2)]">
                  {selected
                    ? `${capitalize(selected.day.weekdayShort)} ${selected.day.dateLabel} kl. ${selected.slot.label} · ${mode === "onsite" ? "På plats" : "Videomöte"}`
                    : "Välj en tid ovan"}
                </p>
              </section>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

function capitalize(s: string) {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="px-1 text-[17px] font-semibold tracking-[-0.015em]">{children}</h2>;
}

function Field({ label, children, last = false }: { label: string; children: ReactNode; last?: boolean }) {
  return (
    <label className="relative block px-5 pb-3 pt-3">
      <span className="block text-[12px] font-medium text-[color:var(--ve-ink-3)]">{label}</span>
      <span className="mt-0.5 block">{children}</span>
      {!last && <span aria-hidden className="absolute bottom-0 left-5 right-0 h-px" style={{ boxShadow: "inset 0 -0.5px 0 var(--ve-line)" }} />}
    </label>
  );
}

function ModeButton({ active, disabled = false, onClick, icon, label }: { active: boolean; disabled?: boolean; onClick: () => void; icon: ReactNode; label: string }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      disabled={disabled}
      onClick={onClick}
      className={`ve-press flex h-[40px] items-center justify-center gap-1.5 rounded-[10px] text-[14px] font-semibold ${
        active ? "bg-[color:var(--ve-card)] text-[color:var(--ve-ink)] shadow-[var(--ve-shadow-thumb)]" : "text-[color:var(--ve-ink-2)]"
      } disabled:cursor-not-allowed disabled:opacity-40`}
    >
      {icon}
      {label}
    </button>
  );
}

function Confirmation({ booked, restaurant, city }: { booked: Booked; restaurant: string; city: string }) {
  const onsite = booked.mode === "onsite";
  return (
    <section className="ve-fade-in mt-10">
      <div className="ve-card px-5 py-7 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[color:var(--ve-success-soft)] text-[color:var(--ve-success)]">
          <Check size={24} strokeWidth={2.4} />
        </div>
        <h1 className="mt-4 text-[24px] font-semibold tracking-[-0.022em]">Tiden är bokad</h1>
        <p className="ve-tabular mt-2 text-[17px] font-semibold">{capitalize(booked.dayLabel)} kl. {booked.time}</p>
        <p className="mt-1 text-[15px] text-[color:var(--ve-ink-2)]">
          {onsite ? `På plats hos ${restaurant || "er"}${city ? `, ${city}` : ""}` : "Videomöte"} · 30 minuter
        </p>
        <p className="mx-auto mt-5 max-w-[380px] text-[15px] leading-[1.45] text-[color:var(--ve-ink)]">
          {onsite
            ? "Jag ringer dig innan jag kommer förbi och visar terminalen."
            : "Jag hör av mig innan mötet med länken till videosamtalet."}
        </p>
        <p className="mt-3 text-[13px] text-[color:var(--ve-ink-2)]">
          {booked.emailed ? `En bekräftelse har skickats till ${booked.email}.` : "Behöver du flytta tiden? Svara på mitt SMS så ordnar vi det."}
        </p>
      </div>
    </section>
  );
}
