"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Plus, Trash2 } from "lucide-react";
import {
  Badge,
  Button,
  Field,
  Input,
  LoadingPanel,
  MetricCard,
  Surface,
  Toggle,
} from "@/shared/components/ui";
import {
  dpointsKeys,
  getConfig,
  getOverview,
  updateConfig,
} from "../api";

// Km-tariff-editor: rader med "max km" + "kr". Avstånd över sista nivån
// använder sista avgiften; tom tariff faller tillbaka till platta budkostnaden.
function CourierTierEditor({ value, onSave, busy }: { value: string; onSave: (json: string) => void; busy?: boolean }) {
  const initial = (() => {
    try {
      const a = JSON.parse(value || "[]");
      return Array.isArray(a) ? a.map((t: any) => ({ maxKm: Number(t.maxKm) || 0, feeKr: Number(t.feeKr) || 0 })) : [];
    } catch {
      return [];
    }
  })();
  const [rows, setRows] = useState<{ maxKm: number; feeKr: number }[]>(initial);

  const update = (i: number, key: "maxKm" | "feeKr", v: number) =>
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, [key]: v } : row)));
  const add = () => setRows((r) => [...r, { maxKm: 0, feeKr: 0 }]);
  const remove = (i: number) => setRows((r) => r.filter((_, idx) => idx !== i));
  const save = () => {
    const clean = rows
      .map((t) => ({ maxKm: Number(t.maxKm), feeKr: Number(t.feeKr) }))
      .filter((t) => t.maxKm > 0 && t.feeKr >= 0)
      .sort((a, b) => a.maxKm - b.maxKm);
    onSave(JSON.stringify(clean));
    setRows(clean);
  };

  return (
    <div className="grid gap-2">
      {rows.map((row, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input type="number" min="0" value={row.maxKm} onChange={(e) => update(i, "maxKm", Number(e.target.value))} placeholder="t.ex. 3" />
          <span className="text-sm text-[var(--text-secondary)]">km</span>
          <Input type="number" min="0" value={row.feeKr} onChange={(e) => update(i, "feeKr", Number(e.target.value))} placeholder="t.ex. 60" />
          <span className="text-sm text-[var(--text-secondary)]">kr</span>
          <Button variant="danger" type="button" onClick={() => remove(i)}><Trash2 size={14} /></Button>
        </div>
      ))}
      <div className="flex items-center gap-2">
        <Button variant="secondary" type="button" onClick={add}><Plus size={14} /> Lägg till nivå</Button>
        <Button variant="primary" type="button" onClick={save} disabled={busy}>Spara tariff</Button>
      </div>
      <p className="text-xs text-[var(--text-secondary)]">Upp till angivna km kostar avgiften. Avstånd över sista nivån använder sista avgiften. Tom tariff använder den platta budkostnaden ovan.</p>
    </div>
  );
}

export default function OverviewTab() {
  const qc = useQueryClient();
  const config = useQuery({ queryKey: dpointsKeys.config, queryFn: getConfig });
  const overview = useQuery({ queryKey: dpointsKeys.overview, queryFn: getOverview });
  const save = useMutation({
    mutationFn: updateConfig,
    onSuccess: () => qc.invalidateQueries({ queryKey: dpointsKeys.config }),
  });

  const [deliveryOpen, setDeliveryOpen] = useState(false);

  const c = config.data;
  if (config.isLoading || !c) return <LoadingPanel />;

  const cashbackPct = Math.round((c.dpointsPerKr ?? 0) * 1000) / 10;
  const exampleOrderKr = 150;
  const exampleEarned = Math.round(exampleOrderKr * (c.dpointsPerKr ?? 0));
  const redeemedPct =
    overview.data && overview.data.totalEarned > 0
      ? Math.round((overview.data.totalRedeemed / overview.data.totalEarned) * 100)
      : null;

  return (
    <div className="flex flex-col gap-4">
      {/* KPI-rad */}
      <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Utestående poäng" value={(overview.data?.outstanding ?? 0).toLocaleString("sv-SE")} />
        <MetricCard label="Intjänat totalt" value={(overview.data?.totalEarned ?? 0).toLocaleString("sv-SE")} />
        <MetricCard
          label="Inlöst totalt"
          value={
            <span className="inline-flex items-baseline gap-2">
              {(overview.data?.totalRedeemed ?? 0).toLocaleString("sv-SE")}
              {redeemedPct != null && (
                <span className="text-[13px] font-bold text-[var(--success-text)]">{redeemedPct}%</span>
              )}
            </span>
          }
        />
        <MetricCard label="Kunder med poäng" value={(overview.data?.holders ?? 0).toLocaleString("sv-SE")} />
      </div>

      {/* 2-kolumners: Intjäningsregler (redigerbar) + Status/kampanjer */}
      <div className="grid gap-3.5 lg:grid-cols-2">
        <Surface>
          <div className="flex flex-col gap-4 p-5">
            <h2 className="text-[15px] font-extrabold tracking-[-0.3px]">Poängmodell</h2>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Cashback i Vpoints (%)">
                <Input
                  type="number"
                  step="0.5"
                  min="0"
                  defaultValue={cashbackPct}
                  key={`per-${c.dpointsPerKr}`}
                  onBlur={(e) => {
                    const v = Math.max(0, Number(e.target.value) / 100);
                    if (v !== c.dpointsPerKr) save.mutate({ dpointsPerKr: v });
                  }}
                />
              </Field>
              <div>
                <Field label="Tak för saldo (0 = inget tak)">
                  <Input
                    type="number"
                    min="0"
                    defaultValue={c.dpointsMaxBalance}
                    key={`max-${c.dpointsMaxBalance}`}
                    onBlur={(e) => {
                      const v = Math.max(0, Math.round(Number(e.target.value)));
                      if (v !== c.dpointsMaxBalance) save.mutate({ dpointsMaxBalance: v });
                    }}
                  />
                </Field>
                <p className="mt-1.5 text-xs text-[var(--text-secondary)]">Launch-standard: 2500 poäng.</p>
              </div>
            </div>

            {/* Sammanfattningsrader (design): label-vänster, värde-pill-höger */}
            <div>
              <div className="flex items-center justify-between border-t border-[var(--row-divider)] py-3">
                <span className="text-[13.5px] font-semibold">Kunden tjänar</span>
                <span className="rounded-[9px] border border-[var(--border-subtle)] px-3 py-1.5 text-[13.5px] font-bold">
                  {cashbackPct.toLocaleString("sv-SE", { maximumFractionDigits: 1 })}%
                </span>
              </div>
              <div className="flex items-center justify-between border-t border-[var(--row-divider)] py-3">
                <span className="text-[13.5px] font-semibold">Exempelorder</span>
                <span className="rounded-[9px] border border-[var(--border-subtle)] px-3 py-1.5 text-[13.5px] font-bold">
                  {exampleOrderKr} kr → {exampleEarned}p
                </span>
              </div>
              <div className="flex items-center justify-between border-t border-[var(--row-divider)] py-3">
                <span className="text-[13.5px] font-semibold">Produktpris i poäng</span>
                <span className="rounded-[9px] border border-[var(--border-subtle)] px-3 py-1.5 text-[13.5px] font-bold">
                  Meny → Rewardable
                </span>
              </div>
            </div>
          </div>
        </Surface>

        <Surface>
          <div className="flex flex-col gap-4 p-5">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-[15px] font-extrabold tracking-[-0.3px]">Status &amp; synlighet</h2>
              <Badge tone={c.dpointsEnabled ? "success" : "neutral"}>{c.dpointsEnabled ? "På" : "Av"}</Badge>
            </div>

            <div className="flex items-center justify-between gap-4 border-t border-[var(--row-divider)] pt-3">
              <div className="flex items-center gap-3">
                <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[9px] bg-[var(--accent-soft)] text-[var(--accent-ink)] font-extrabold">
                  D
                </span>
                <div>
                  <span className="block text-[13.5px] font-bold">Vpoints</span>
                  <span className="text-[11.5px] text-[var(--text-muted)]">Lojalitetsprogrammet aktivt</span>
                </div>
              </div>
              <Toggle checked={c.dpointsEnabled} onChange={(v) => save.mutate({ dpointsEnabled: v })} />
            </div>

            <div className="flex items-center justify-between gap-4 border-t border-[var(--row-divider)] pt-3">
              <div className="flex items-center gap-3">
                <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[9px] bg-[var(--accent-soft)] text-[var(--accent-ink)] font-extrabold">
                  ★
                </span>
                <div>
                  <span className="block text-[13.5px] font-bold">Kort på startsidan</span>
                  <span className="text-[11.5px] text-[var(--text-muted)]">Visa Vpoints-kortet för kunder</span>
                </div>
              </div>
              <Toggle checked={c.dpointsCardOnHome} onChange={(v) => save.mutate({ dpointsCardOnHome: v })} />
            </div>

            {save.isPending && <p className="text-sm text-[var(--text-secondary)]">Sparar...</p>}
          </div>
        </Surface>
      </div>

      {/* Rewardable-modell */}
      <Surface>
        <div className="flex flex-col gap-3.5 p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-[15px] font-extrabold tracking-[-0.3px]">Rewardable produkter</h2>
            <span className="text-[12.5px] font-bold text-[var(--accent-ink)]">Meny → Rewardable</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-[var(--border-subtle)] p-3.5">
              <div className="flex items-center gap-2">
                <span className="h-[11px] w-[11px] rounded-[3px] bg-[var(--accent)]" />
                <span className="text-[13.5px] font-extrabold">Standard</span>
              </div>
              <div className="mt-1.5 text-[11.5px] font-semibold text-[var(--text-muted)]">1.5x priset</div>
              <div className="mt-0.5 text-[12.5px] text-[var(--text-secondary)]">100 kr produkt → 150p</div>
            </div>
            <div className="rounded-xl border border-[var(--border-subtle)] p-3.5">
              <div className="flex items-center gap-2">
                <span className="h-[11px] w-[11px] rounded-[3px]" style={{ background: "#b6bdc6" }} />
                <span className="text-[13.5px] font-extrabold">Flex</span>
              </div>
              <div className="mt-1.5 text-[11.5px] font-semibold text-[var(--text-muted)]">1.3x / 1.7x / 2x</div>
              <div className="mt-0.5 text-[12.5px] text-[var(--text-secondary)]">Välj per produkt</div>
            </div>
            <div className="rounded-xl border-2 border-[var(--accent)] bg-[#FFF7F3] p-3.5">
              <div className="flex items-center gap-2">
                <span className="h-[11px] w-[11px] rounded-[3px] bg-[var(--accent)]" />
                <span className="text-[13.5px] font-extrabold">Override</span>
              </div>
              <div className="mt-1.5 text-[11.5px] font-semibold text-[var(--text-muted)]">Fast poängpris</div>
              <div className="mt-0.5 text-[12.5px] font-bold text-[var(--accent-ink)]">För kampanjvaror</div>
            </div>
          </div>
        </div>
      </Surface>

      {/* Leverans (avancerat) — oförändrad logik */}
      <Surface>
        <div className="flex flex-col gap-4 p-5">
          <button
            type="button"
            onClick={() => setDeliveryOpen((o) => !o)}
            className="flex items-center gap-2 text-left text-[15px] font-extrabold tracking-[-0.3px]"
          >
            {deliveryOpen ? (
              <ChevronDown size={18} className="text-[var(--text-secondary)]" />
            ) : (
              <ChevronRight size={18} className="text-[var(--text-secondary)]" />
            )}
            Leverans (avancerat)
          </button>

          {deliveryOpen && (
            <div className="flex flex-col gap-5">
              <Field label="Standard kurirkostnad (kr) när restaurangens zon är gratis">
                <Input
                  type="number"
                  min="0"
                  step="1"
                  defaultValue={(c.dpointsCourierCost ?? 0) / 100}
                  key={`courier-${c.dpointsCourierCost}`}
                  onBlur={(e) => {
                    const ore = Math.max(0, Math.round(Number(e.target.value) * 100));
                    if (ore !== (c.dpointsCourierCost ?? 0)) save.mutate({ dpointsCourierCost: ore });
                  }}
                />
              </Field>
              <p className="text-xs text-[var(--text-secondary)]">
                Om restaurangens matchade zon har en avgift över 0 kr används den avgiften för Vpoints-order. Om zonen är gratis används standarden eller tariffen här.
              </p>
              <Field label="Km-tariff för standardkurir (endast när zonen är gratis)">
                <CourierTierEditor
                  value={c.dpointsCourierTiers ?? "[]"}
                  busy={save.isPending}
                  onSave={(json) => save.mutate({ dpointsCourierTiers: json })}
                />
              </Field>
            </div>
          )}
        </div>
      </Surface>
    </div>
  );
}
