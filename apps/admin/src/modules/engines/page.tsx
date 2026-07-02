"use client";

// Motorn: de autonoma hemskärmsmodulerna. Varje motor kan slås på/av och
// justeras, och allt de gör loggas här. Inget händer i appen som inte syns.

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, RefreshCw } from "lucide-react";
import { apiGet, apiPatch, apiPost, apiPut } from "@/shared/api/client";
import { Button, EmptyState, ErrorPanel, PageHeader, Surface, Toggle } from "@/shared/components/ui";
import { cn } from "@/shared/utils/cn";

interface EngineRecord {
  key: string;
  title: string;
  description: string;
  paramLabels: Record<string, string>;
  enabled: boolean;
  params: Record<string, number>;
}

interface EnginesResponse {
  previewAllModules: boolean;
  engines: EngineRecord[];
}

interface OccasionItem {
  id: string;
  name: string;
  title: string;
  subtitle?: string;
  theme?: string;
  days: number[];
  startHour: number;
  endHour: number;
  active: boolean;
}

interface UnderperformerSuggestion {
  restaurantId: string;
  thisWeek: number;
  avgPerWeek: number;
  suggestedPercent: number;
  restaurant: { id: string; name: string; slug: string };
}

interface ABTestRecord {
  id: string;
  name: string;
  dealAId: string;
  dealBId: string;
  active: boolean;
  dealATitle?: string;
  dealBTitle?: string;
  stats?: { a: { claims: number; redeemed: number }; b: { claims: number; redeemed: number } };
}

interface EngineEventRecord {
  id: string;
  engine: string;
  message: string;
  createdAt: string;
}

const enginesKey = ["engines"] as const;
const engineEventsKey = ["engines", "events"] as const;

export function EnginesPage() {
  const qc = useQueryClient();
  const engines = useQuery({
    queryKey: enginesKey,
    queryFn: () => apiGet<EnginesResponse>("/admin/engines"),
  });
  const events = useQuery({
    queryKey: engineEventsKey,
    queryFn: () => apiGet<{ events: EngineEventRecord[] }>("/admin/engines/events?limit=60"),
  });
  const [drafts, setDrafts] = useState<Record<string, Record<string, number>>>({});

  const patchMutation = useMutation({
    mutationFn: ({ key, body }: { key: string; body: { enabled?: boolean; params?: Record<string, number> } }) =>
      apiPatch(`/admin/engines/${key}`, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: enginesKey });
      void qc.invalidateQueries({ queryKey: engineEventsKey });
    },
  });

  const previewMutation = useMutation({
    mutationFn: (enabled: boolean) => apiPatch<{ previewAllModules: boolean }>("/admin/engines/preview-all", { enabled }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: enginesKey });
      void qc.invalidateQueries({ queryKey: engineEventsKey });
    },
  });

  if (engines.isLoading) {
    return (
      <div className="page-stack">
        <PageHeader breadcrumb="Plattform" title="Motorn" />
        <Surface className="px-6 py-14 text-center text-sm text-[var(--text-secondary)]">Laddar motorerna...</Surface>
      </div>
    );
  }
  if (engines.isError || !engines.data) {
    return <ErrorPanel title="Kunde inte ladda motorerna" action={<Button onClick={() => void engines.refetch()}><RefreshCw size={16} /> Försök igen</Button>} />;
  }

  const titleByKey = new Map(engines.data.engines.map((e) => [e.key, e.title]));

  return (
    <div className="page-stack">
      <PageHeader
        breadcrumb="Plattform"
        title="Motorn"
        actions={<Button variant="secondary" onClick={() => { void engines.refetch(); void events.refetch(); }} aria-label="Uppdatera"><RefreshCw size={14} /></Button>}
      />

      <Surface className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--border-subtle)]">
              <Eye size={16} />
            </span>
            <div className="min-w-0">
              <div className="text-[14px] font-extrabold">Visa allt i appen</div>
              <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--text-secondary)]">
                Testläge för Swift. Alla hemskärmsmoduler visas samtidigt tills du stänger av.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[11.5px] font-bold text-[var(--text-muted)]">
              {engines.data.previewAllModules ? "På" : "Av"}
            </span>
            <Toggle
              checked={engines.data.previewAllModules}
              onChange={(next) => previewMutation.mutate(next)}
              disabled={previewMutation.isPending}
            />
          </div>
        </div>
      </Surface>

      <div className="grid gap-4 lg:grid-cols-2">
        {engines.data.engines.map((engine) => {
          const draft = drafts[engine.key];
          const dirty = draft && Object.keys(draft).some((k) => draft[k] !== engine.params[k]);
          return (
            <Surface key={engine.key} className="p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-[14px] font-extrabold">{engine.title}</div>
                  <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--text-secondary)]">{engine.description}</p>
                </div>
                <Toggle
                  checked={engine.enabled}
                  onChange={(next) => patchMutation.mutate({ key: engine.key, body: { enabled: next } })}
                />
              </div>

              {Object.keys(engine.paramLabels).length > 0 && (
                <div className="mt-4 flex flex-wrap items-end gap-3">
                  {Object.entries(engine.paramLabels).map(([param, label]) => (
                    <label key={param} className="flex flex-col gap-1 text-[11px] font-bold text-[var(--text-muted)]">
                      {label}
                      <input
                        type="number"
                        className="h-9 w-28 rounded-lg border border-[var(--border-subtle)] bg-transparent px-2 text-[13px] font-semibold"
                        value={draft?.[param] ?? engine.params[param] ?? 0}
                        onChange={(e) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [engine.key]: { ...engine.params, ...prev[engine.key], [param]: Number(e.target.value) },
                          }))
                        }
                      />
                    </label>
                  ))}
                  <Button
                    variant="secondary"
                    disabled={!dirty || patchMutation.isPending}
                    onClick={() => {
                      patchMutation.mutate({ key: engine.key, body: { params: drafts[engine.key] } });
                      setDrafts((prev) => { const next = { ...prev }; delete next[engine.key]; return next; });
                    }}
                  >
                    Spara
                  </Button>
                </div>
              )}
            </Surface>
          );
        })}
      </div>

      <ABTestsPanel />

      <UnderperformersPanel />

      <OccasionsPanel />

      <Surface className="overflow-hidden p-0">
        <div className="border-b border-[var(--border-subtle)] px-5 py-3">
          <div className="text-[13px] font-extrabold">Händelser</div>
          <div className="text-[11.5px] text-[var(--text-muted)]">Allt motorerna gör loggas här</div>
        </div>
        {events.isLoading ? (
          <div className="px-5 py-10 text-center text-sm text-[var(--text-secondary)]">Laddar...</div>
        ) : (events.data?.events || []).length === 0 ? (
          <div className="p-6"><EmptyState title="Inga händelser än" description="Motorerna loggar här när de agerar." /></div>
        ) : (
          (events.data?.events || []).map((event, i, arr) => (
            <div key={event.id} className={cn("flex items-center justify-between gap-3 px-5 py-3 text-[12.5px]", i !== arr.length - 1 && "border-b border-[var(--row-divider)]")}>
              <span className="min-w-0 truncate">
                <span className="font-bold">{titleByKey.get(event.engine) || event.engine}</span>
                <span className="text-[var(--text-secondary)]"> · {event.message}</span>
              </span>
              <span className="shrink-0 text-[11px] text-[var(--text-muted)]">{new Date(event.createdAt).toLocaleString("sv-SE")}</span>
            </div>
          ))
        )}
      </Surface>
    </div>
  );
}


// ── Utjämnaren: förslag på deals till restauranger under sitt snitt ─────────

function UnderperformersPanel() {
  const qc = useQueryClient();
  const suggestions = useQuery({
    queryKey: ["engines", "underperformers"],
    queryFn: () => apiGet<{ suggestions: UnderperformerSuggestion[] }>("/admin/engines/underperformers"),
    refetchOnWindowFocus: false,
  });
  const createMutation = useMutation({
    mutationFn: (s: UnderperformerSuggestion) =>
      apiPost(`/admin/engines/underperformers/${s.restaurantId}/create-deal`, { percent: s.suggestedPercent }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["engines", "underperformers"] });
      void qc.invalidateQueries({ queryKey: engineEventsKey });
    },
  });

  const items = suggestions.data?.suggestions || [];
  return (
    <Surface className="overflow-hidden p-0">
      <div className="border-b border-[var(--border-subtle)] px-5 py-3">
        <div className="text-[13px] font-extrabold">Utjämnaren: förslag</div>
        <div className="text-[11.5px] text-[var(--text-muted)]">Restauranger under sitt 4-veckorssnitt. Skapar deal-UTKAST, du aktiverar i App-deals.</div>
      </div>
      {suggestions.isLoading ? (
        <div className="px-5 py-8 text-center text-sm text-[var(--text-secondary)]">Räknar...</div>
      ) : items.length === 0 ? (
        <div className="px-5 py-8 text-center text-[12.5px] text-[var(--text-muted)]">Inga förslag just nu. Alla ligger på eller över sitt snitt.</div>
      ) : (
        items.map((s, i) => (
          <div key={s.restaurantId} className={cn("flex items-center justify-between gap-3 px-5 py-3 text-[13px]", i !== items.length - 1 && "border-b border-[var(--row-divider)]")}>
            <span className="min-w-0">
              <span className="font-bold">{s.restaurant.name}</span>
              <span className="block text-[11.5px] text-[var(--text-muted)]">{s.thisWeek} ordrar denna vecka · snitt {s.avgPerWeek}/vecka</span>
            </span>
            <Button variant="secondary" disabled={createMutation.isPending} onClick={() => createMutation.mutate(s)}>
              Skapa {s.suggestedPercent}%-utkast
            </Button>
          </div>
        ))
      )}
    </Surface>
  );
}

// ── Occasions-kalendern: återkommande tillfällen ────────────────────────────

const DAY_LABELS = ["Sön", "Mån", "Tis", "Ons", "Tor", "Fre", "Lör"];
const OCCASION_THEMES = ["sky", "ember", "forest", "midnight", "gold"];

function OccasionsPanel() {
  const qc = useQueryClient();
  const occasions = useQuery({
    queryKey: ["engines", "occasions"],
    queryFn: () => apiGet<{ items: OccasionItem[] }>("/admin/engines/occasions"),
    refetchOnWindowFocus: false,
  });
  const [draft, setDraft] = useState<OccasionItem[] | null>(null);
  const items = draft ?? occasions.data?.items ?? [];

  const saveMutation = useMutation({
    mutationFn: (next: OccasionItem[]) => apiPut("/admin/engines/occasions", { items: next }),
    onSuccess: () => {
      setDraft(null);
      void qc.invalidateQueries({ queryKey: ["engines", "occasions"] });
    },
  });

  const update = (id: string, patch: Partial<OccasionItem>) =>
    setDraft(items.map((o) => (o.id === id ? { ...o, ...patch } : o)));

  return (
    <Surface className="overflow-hidden p-0">
      <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-5 py-3">
        <div>
          <div className="text-[13px] font-extrabold">Occasions-kalendern</div>
          <div className="text-[11.5px] text-[var(--text-muted)]">Återkommande tillfällen blir kort i appen de dagar och timmar de gäller</div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            onClick={() =>
              setDraft([
                ...items,
                { id: `occ${Date.now().toString(36)}`, name: "Nytt tillfälle", title: "Fredagsmys?", subtitle: "", theme: "ember", days: [5], startHour: 15, endHour: 22, active: false },
              ])
            }
          >
            Lägg till
          </Button>
          <Button variant="primary" disabled={!draft || saveMutation.isPending} onClick={() => draft && saveMutation.mutate(draft)}>
            Spara
          </Button>
        </div>
      </div>
      {items.length === 0 ? (
        <div className="px-5 py-8 text-center text-[12.5px] text-[var(--text-muted)]">Inga tillfällen än. Lägg till fredagsmys, lönehelg, söndagsfika...</div>
      ) : (
        items.map((o, i) => (
          <div key={o.id} className={cn("flex flex-wrap items-center gap-3 px-5 py-3", i !== items.length - 1 && "border-b border-[var(--row-divider)]")}>
            <input
              className="h-9 w-40 rounded-lg border border-[var(--border-subtle)] bg-transparent px-2 text-[12.5px] font-bold"
              value={o.title}
              onChange={(e) => update(o.id, { title: e.target.value })}
              placeholder="Rubrik i appen"
            />
            <input
              className="h-9 w-52 rounded-lg border border-[var(--border-subtle)] bg-transparent px-2 text-[12.5px]"
              value={o.subtitle || ""}
              onChange={(e) => update(o.id, { subtitle: e.target.value })}
              placeholder="Underrubrik"
            />
            <div className="flex gap-1">
              {DAY_LABELS.map((label, day) => (
                <button
                  key={day}
                  type="button"
                  onClick={() => update(o.id, { days: o.days.includes(day) ? o.days.filter((d) => d !== day) : [...o.days, day] })}
                  className={cn(
                    "h-8 rounded-lg px-2 text-[11px] font-extrabold",
                    o.days.includes(day) ? "bg-[var(--text-primary)] text-[var(--bg-base)]" : "border border-[var(--border-subtle)] text-[var(--text-muted)]",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-1 text-[11px] font-bold text-[var(--text-muted)]">
              kl
              <input type="number" min={0} max={23} className="h-8 w-14 rounded-lg border border-[var(--border-subtle)] bg-transparent px-1 text-[12px]" value={o.startHour} onChange={(e) => update(o.id, { startHour: Number(e.target.value) })} />
              –
              <input type="number" min={1} max={24} className="h-8 w-14 rounded-lg border border-[var(--border-subtle)] bg-transparent px-1 text-[12px]" value={o.endHour} onChange={(e) => update(o.id, { endHour: Number(e.target.value) })} />
            </label>
            <select
              className="h-8 rounded-lg border border-[var(--border-subtle)] bg-transparent px-1 text-[12px] font-bold"
              value={o.theme || "sky"}
              onChange={(e) => update(o.id, { theme: e.target.value })}
            >
              {OCCASION_THEMES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <Toggle checked={o.active} onChange={(next) => update(o.id, { active: next })} />
            <button type="button" className="text-[11px] font-bold text-[var(--text-muted)] underline" onClick={() => setDraft(items.filter((x) => x.id !== o.id))}>
              Ta bort
            </button>
          </div>
        ))
      )}
    </Surface>
  );
}


// ── A/B-tester: den mot den, deterministisk split, utfall per variant ───────

function ABTestsPanel() {
  const qc = useQueryClient();
  const tests = useQuery({
    queryKey: ["engines", "ab-tests"],
    queryFn: () => apiGet<{ items: ABTestRecord[] }>("/admin/engines/ab-tests"),
    refetchOnWindowFocus: false,
  });
  const appDeals = useQuery({ queryKey: ["engines", "ab-deals"], queryFn: () => apiGet<{ id: string; title: string; appEnabled?: boolean }[]>("/admin/deals") });
  const [draft, setDraft] = useState<ABTestRecord[] | null>(null);
  const items = draft ?? tests.data?.items ?? [];

  const saveMutation = useMutation({
    mutationFn: (next: ABTestRecord[]) =>
      apiPut("/admin/engines/ab-tests", { items: next.map(({ id, name, dealAId, dealBId, active }) => ({ id, name, dealAId, dealBId, active })) }),
    onSuccess: () => {
      setDraft(null);
      void qc.invalidateQueries({ queryKey: ["engines", "ab-tests"] });
    },
  });

  const update = (id: string, patch: Partial<ABTestRecord>) =>
    setDraft(items.map((t) => (t.id === id ? { ...t, ...patch } : t)));

  const dealOptions = (appDeals.data || []).filter((d: any) => d.appEnabled);
  const conversion = (v?: { claims: number; redeemed: number }) =>
    v && v.claims > 0 ? `${v.claims} claims · ${v.redeemed} inlösta (${Math.round((v.redeemed / v.claims) * 100)}%)` : `${v?.claims ?? 0} claims`;

  return (
    <Surface className="overflow-hidden p-0">
      <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-5 py-3">
        <div>
          <div className="text-[13px] font-extrabold">A/B-tester</div>
          <div className="text-[11.5px] text-[var(--text-muted)]">Två deals mot varandra. Varje kund ser EN variant (stabil split), utfallet mäts här.</div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            onClick={() =>
              setDraft([...items, { id: `ab${Date.now().toString(36)}`, name: "Nytt test", dealAId: "", dealBId: "", active: false }])
            }
          >
            Nytt test
          </Button>
          <Button variant="primary" disabled={!draft || saveMutation.isPending} onClick={() => draft && saveMutation.mutate(draft)}>
            Spara
          </Button>
        </div>
      </div>
      {items.length === 0 ? (
        <div className="px-5 py-8 text-center text-[12.5px] text-[var(--text-muted)]">Inga tester. Ställ en deal mot en annan och se vilken som konverterar.</div>
      ) : (
        items.map((test, i) => {
          const aWins = (test.stats?.a.redeemed ?? 0) > (test.stats?.b.redeemed ?? 0);
          const bWins = (test.stats?.b.redeemed ?? 0) > (test.stats?.a.redeemed ?? 0);
          return (
            <div key={test.id} className={cn("flex flex-wrap items-center gap-3 px-5 py-3", i !== items.length - 1 && "border-b border-[var(--row-divider)]")}>
              <input
                className="h-9 w-40 rounded-lg border border-[var(--border-subtle)] bg-transparent px-2 text-[12.5px] font-bold"
                value={test.name}
                onChange={(e) => update(test.id, { name: e.target.value })}
              />
              <div className="flex flex-col gap-0.5">
                <select
                  className="h-8 w-56 rounded-lg border border-[var(--border-subtle)] bg-transparent px-1 text-[12px] font-bold"
                  value={test.dealAId}
                  onChange={(e) => update(test.id, { dealAId: e.target.value })}
                >
                  <option value="">Variant A...</option>
                  {dealOptions.map((d: any) => <option key={d.id} value={d.id}>{d.title}</option>)}
                </select>
                {test.stats && <span className={cn("text-[11px]", aWins ? "font-extrabold" : "text-[var(--text-muted)]")}>A: {conversion(test.stats.a)}{aWins ? " · leder" : ""}</span>}
              </div>
              <span className="text-[11px] font-extrabold text-[var(--text-muted)]">VS</span>
              <div className="flex flex-col gap-0.5">
                <select
                  className="h-8 w-56 rounded-lg border border-[var(--border-subtle)] bg-transparent px-1 text-[12px] font-bold"
                  value={test.dealBId}
                  onChange={(e) => update(test.id, { dealBId: e.target.value })}
                >
                  <option value="">Variant B...</option>
                  {dealOptions.map((d: any) => <option key={d.id} value={d.id}>{d.title}</option>)}
                </select>
                {test.stats && <span className={cn("text-[11px]", bWins ? "font-extrabold" : "text-[var(--text-muted)]")}>B: {conversion(test.stats.b)}{bWins ? " · leder" : ""}</span>}
              </div>
              <Toggle checked={test.active} onChange={(next) => update(test.id, { active: next })} />
              <button type="button" className="text-[11px] font-bold text-[var(--text-muted)] underline" onClick={() => setDraft(items.filter((x) => x.id !== test.id))}>
                Ta bort
              </button>
            </div>
          );
        })
      )}
    </Surface>
  );
}
