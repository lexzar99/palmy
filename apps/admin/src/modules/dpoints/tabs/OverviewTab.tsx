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

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Utestående poäng" value={(overview.data?.outstanding ?? 0).toLocaleString("sv-SE")} />
        <MetricCard label="Intjänat totalt" value={(overview.data?.totalEarned ?? 0).toLocaleString("sv-SE")} />
        <MetricCard label="Inlöst totalt" value={(overview.data?.totalRedeemed ?? 0).toLocaleString("sv-SE")} />
        <MetricCard label="Kunder med poäng" value={(overview.data?.holders ?? 0).toLocaleString("sv-SE")} />
      </div>

      <Surface>
        <div className="flex flex-col gap-4 p-6">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-lg font-semibold">Status</h2>
            <Badge tone={c.dpointsEnabled ? "success" : "neutral"}>{c.dpointsEnabled ? "På" : "Av"}</Badge>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-sm">Dpoints</span>
            <Toggle checked={c.dpointsEnabled} onChange={(v) => save.mutate({ dpointsEnabled: v })} />
          </div>
        </div>
      </Surface>

      <Surface>
        <div className="flex flex-col gap-5 p-6">
          <h2 className="text-lg font-semibold">Ekonomi</h2>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Intjäning (poäng per kr)">
              <Input
                type="number"
                step="0.1"
                min="0"
                defaultValue={c.dpointsPerKr}
                key={`per-${c.dpointsPerKr}`}
                onBlur={(e) => {
                  const v = Number(e.target.value);
                  if (v !== c.dpointsPerKr) save.mutate({ dpointsPerKr: v });
                }}
              />
            </Field>
            <div>
              <Field label="Värde (poäng per kr)">
                <Input
                  type="number"
                  min="1"
                  defaultValue={c.dpointsValuePerKr}
                  key={`val-${c.dpointsValuePerKr}`}
                  onBlur={(e) => {
                    const v = Math.round(Number(e.target.value));
                    if (v !== c.dpointsValuePerKr) save.mutate({ dpointsValuePerKr: v });
                  }}
                />
              </Field>
              <p className="mt-1.5 text-xs text-[var(--text-secondary)]">Standard: 10 poäng = 1 kr</p>
            </div>
          </div>

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
            <p className="mt-1.5 text-xs text-[var(--text-secondary)]">Standard: 2000 poäng. Intjäning pausas när saldot når taket.</p>
          </div>

          <div className="flex items-center justify-between gap-4">
            <span className="text-sm">Visa kort på startsidan</span>
            <Toggle checked={c.dpointsCardOnHome} onChange={(v) => save.mutate({ dpointsCardOnHome: v })} />
          </div>

          {save.isPending && <p className="text-sm text-[var(--text-secondary)]">Sparar...</p>}
        </div>
      </Surface>

      <Surface>
        <div className="flex flex-col gap-4 p-6">
          <button
            type="button"
            onClick={() => setDeliveryOpen((o) => !o)}
            className="flex items-center gap-2 text-left text-lg font-semibold"
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
              <Field label="Platt budkostnad (kr), fallback om ingen km-tariff satt">
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
              <Field label="Km-tariff för budkostnad (poäng-köp, endast leverans)">
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
