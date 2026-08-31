"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, MapPinOff, Search } from "lucide-react";
import {
  Badge,
  EmptyState,
  ErrorPanel,
  Button,
  Input,
  LoadingPanel,
  MetricCard,
  PageHeader,
  SectionHeader,
  Select,
  Surface,
} from "@/shared/components/ui";
import { getJourney, journeyQueryKey, type JourneyPerson } from "@/modules/journey/api";

const PERIODS = [
  { value: 1, label: "Idag" },
  { value: 7, label: "7 dagar" },
  { value: 30, label: "30 dagar" },
  { value: 90, label: "90 dagar" },
];

const procent = (v: number) => `${Math.round(v * 100)} %`;

function tid(iso: string): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Stockholm",
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  }).format(new Date(iso));
}

/** Beställde = grönt, hindrat av oss = rött, avhopp = neutralt. */
function utfallston(person: JourneyPerson): "success" | "warning" | "neutral" {
  if (person.ordered) return "success";
  if (person.rejectedAddress || person.steps.includes("PAYMENT_FAILED")) return "warning";
  return "neutral";
}

export function JourneyPage() {
  const [days, setDays] = useState(30);
  const [filter, setFilter] = useState("");

  const report = useQuery({
    queryKey: journeyQueryKey(days),
    queryFn: () => getJourney(days),
  });

  const people = useMemo(() => {
    const all = report.data?.people ?? [];
    const q = filter.trim().toLowerCase();
    if (!q) return all;
    return all.filter((p) =>
      [p.phone, p.email, p.outcome, p.deepestStepLabel, p.channel, p.referrer, p.utmSource, p.rejectedAddress, ...p.restaurants]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [report.data?.people, filter]);

  if (report.isLoading) return <LoadingPanel />;
  if (report.isError) {
    return (
      <ErrorPanel
        title="Kunde inte läsa kundresan"
        description="Hämtningen misslyckades. Försök igen om en stund."
        action={<Button variant="secondary" onClick={() => report.refetch()}>Försök igen</Button>}
      />
    );
  }

  const data = report.data!;
  const start = data.funnel[0]?.reached ?? 0;
  // Största tappet mellan två steg. Det är den enda siffran som säger vad man
  // ska laga härnäst — resten är bakgrund.
  const värstaLäckan = data.funnel
    .slice(1)
    .reduce((worst, row) => (row.lost > (worst?.lost ?? -1) ? row : worst), data.funnel[1]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Kundresan"
        actions={
          <Select value={String(days)} onChange={(e) => setDays(Number(e.target.value))}>
            {PERIODS.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </Select>
        }
      />
      <p className="-mt-3 text-[13px] text-[var(--text-secondary)]">
        Var besökarna tar vägen, och var de tar slut.
      </p>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Besök" value={String(data.totals.sessions)} detail="sessioner i perioden" />
        <MetricCard
          label="Beställde"
          value={String(data.totals.ordered)}
          detail={`${procent(data.totals.conversion)} av besöken`}
        />
        <MetricCard
          label="Vet vi vilka de är"
          value={String(data.totals.identified)}
          detail="lämnade telefon eller mejl"
        />
        <MetricCard
          label="Största tappet"
          value={värstaLäckan ? String(värstaLäckan.lost) : "—"}
          detail={värstaLäckan ? `föll bort vid: ${värstaLäckan.label.toLowerCase()}` : "ingen data"}
        />
      </div>

      {/* Tratten. Stapelbredden är andel av starten, siffran till höger är
          andelen som tog sig vidare från föregående steg — det är där läckan
          syns, inte i den totala andelen. */}
      <Surface>
        <SectionHeader title="Tratten" description="Hur många som nådde varje steg" />
        {start === 0 ? (
          <EmptyState
            title="Ingen data ännu"
            description="Mätningen startade nyss. Så fort någon besöker sajten ritas tratten här."
          />
        ) : (
          <div className="mt-4 space-y-2">
            {data.funnel.map((row, i) => {
              const bredd = start > 0 ? Math.max(2, (row.reached / start) * 100) : 0;
              const tappade = i > 0 && row.lost > 0;
              return (
                <div key={row.step} className="flex items-center gap-3">
                  <div className="w-52 shrink-0 text-[13px] font-medium text-[var(--text-secondary)]">
                    {row.label}
                  </div>
                  <div className="relative h-9 flex-1 overflow-hidden rounded-lg bg-[var(--bg-deep)]">
                    <div
                      className="h-full rounded-lg transition-[width] duration-500"
                      style={{
                        width: `${bredd}%`,
                        background: row.step === "ORDER_PLACED" ? "var(--success-ink)" : "var(--accent)",
                        opacity: 0.9,
                      }}
                    />
                    <span className="absolute inset-y-0 left-3 flex items-center text-[13px] font-bold text-[var(--text-primary)]">
                      {row.reached}
                    </span>
                  </div>
                  <div className="w-32 shrink-0 text-right text-[12px]">
                    {tappade ? (
                      <span className="text-[var(--text-secondary)]">
                        −{row.lost} ({procent(1 - row.shareOfPrevious)})
                      </span>
                    ) : (
                      <span className="text-[var(--text-secondary)]">—</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Surface>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Hinder vi själva reser. Skiljs från vanliga avhopp: en adress
            utanför zonen är en kund som ville men inte fick. */}
        <Surface>
          <SectionHeader title="Hinder" description="Gånger vi sa nej till någon som ville beställa" />
          <div className="mt-4 space-y-3">
            {data.problems.map((p) => (
              <div key={p.step} className="flex items-center justify-between gap-3">
                <span className="text-[13px] text-[var(--text-secondary)]">{p.label}</span>
                <span className="text-lg font-bold text-[var(--text-primary)]">{p.sessions}</span>
              </div>
            ))}
            {data.problems.every((p) => p.sessions === 0) ? (
              <p className="text-[13px] text-[var(--text-secondary)]">
                Inga hinder registrerade i perioden.
              </p>
            ) : null}
          </div>
        </Surface>

        <Surface>
          <SectionHeader title="Varifrån de kom" description="Plattform och hur många som beställde" />
          <div className="mt-4 space-y-3">
            {data.sources.length === 0 ? (
              <p className="text-[13px] text-[var(--text-secondary)]">Ingen data ännu.</p>
            ) : (
              data.sources.map((s) => (
                <div key={s.source} className="flex items-center justify-between gap-3">
                  <span className="text-[13px] text-[var(--text-secondary)]">{s.source}</span>
                  <span className="text-[13px] text-[var(--text-primary)]">
                    <strong>{s.sessions}</strong> besök · <strong>{s.orders}</strong> ordrar
                  </span>
                </div>
              ))
            )}
          </div>
        </Surface>
      </div>

      <Surface>
        <SectionHeader
          title="Var det tog slut"
          description="Samma sak som tratten, men formulerat som något att åtgärda"
        />
        <div className="mt-4 space-y-2">
          {data.outcomes.length === 0 ? (
            <p className="text-[13px] text-[var(--text-secondary)]">Ingen data ännu.</p>
          ) : (
            data.outcomes.map((o) => (
              <div key={o.outcome} className="flex items-center justify-between gap-3 border-b border-[var(--border-subtle)] pb-2 last:border-0">
                <span className="text-[13px] text-[var(--text-primary)]">{o.outcome}</span>
                <span className="text-[13px] font-bold text-[var(--text-secondary)]">{o.sessions}</span>
              </div>
            ))
          )}
        </div>
      </Surface>

      {/* Person för person. Det är här man ser att "Rosen la i korgen, valde
          leverans, fick nej på adressen" — sådant en tratt aldrig kan visa. */}
      <Surface>
        <SectionHeader title="Person för person" description="Varje besökares väg genom flödet" />
        <div className="mt-4">
          <div className="relative">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" />
            <Input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Sök på telefon, mejl, restaurang eller utfall"
              className="pl-9"
            />
          </div>
        </div>

        {people.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              title={filter ? "Ingen träff" : "Ingen data ännu"}
              description={
                filter
                  ? "Ingen besökare matchar sökningen."
                  : "Mätningen startade nyss. Besökare dyker upp här efter hand."
              }
            />
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-[13px]">
              <thead>
                <tr className="border-b border-[var(--border-subtle)] text-[12px] uppercase tracking-wide text-[var(--text-secondary)]">
                  <th className="pb-2 pr-4 font-semibold">Vem</th>
                  <th className="pb-2 pr-4 font-semibold">Kom så långt</th>
                  <th className="pb-2 pr-4 font-semibold">Vad hände</th>
                  <th className="pb-2 pr-4 font-semibold">Restaurang</th>
                  <th className="pb-2 pr-4 font-semibold">Kanal</th>
                  <th className="pb-2 font-semibold">Senast</th>
                </tr>
              </thead>
              <tbody>
                {people.map((p) => (
                  <tr key={p.sessionId} className="border-b border-[var(--border-subtle)] last:border-0">
                    <td className="py-3 pr-4">
                      <div className="font-medium text-[var(--text-primary)]">
                        {p.phone || p.email || "Anonym besökare"}
                      </div>
                      {p.phone && p.email ? (
                        <div className="text-[12px] text-[var(--text-secondary)]">{p.email}</div>
                      ) : null}
                    </td>
                    <td className="py-3 pr-4 text-[var(--text-secondary)]">
                      <span className="inline-flex items-center gap-1.5">
                        {p.deepestStepLabel}
                        <ArrowRight size={12} className="opacity-40" />
                        <span className="text-[12px] opacity-70">steg {p.deepestIndex + 1} av 10</span>
                      </span>
                    </td>
                    <td className="py-3 pr-4">
                      <Badge tone={utfallston(p)}>{p.outcome}</Badge>
                      {p.rejectedAddress ? (
                        <div className="mt-1 inline-flex items-center gap-1 text-[12px] text-[var(--text-secondary)]">
                          <MapPinOff size={12} />
                          {p.rejectedAddress}
                        </div>
                      ) : null}
                    </td>
                    <td className="py-3 pr-4 text-[var(--text-secondary)]">
                      {p.restaurants.length > 0 ? p.restaurants.join(", ") : "—"}
                    </td>
                    <td className="py-3 pr-4 text-[var(--text-secondary)]">
                      <div>{p.channel || "Direkt"}</div>
                      {p.referrer && p.channel === "Hänvisad" ? (
                        <div className="text-[12px] opacity-70">{p.referrer}</div>
                      ) : null}
                    </td>
                    <td className="py-3 text-[var(--text-secondary)]">{tid(p.lastSeen)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Surface>
    </div>
  );
}
