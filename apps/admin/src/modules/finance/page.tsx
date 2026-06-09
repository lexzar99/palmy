"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Printer, RefreshCw, Search, Settings2, Store, Truck } from "lucide-react";
import {
  financeSummaryQueryKey,
  getFinanceSummary,
  getPayoutSpec,
  payoutSpecQueryKey,
  setRestaurantDelivery,
  updateEconomyRates,
  upsertPayout,
  type EconomyRates,
  type FinanceRow,
} from "@/modules/finance/api";
import { printPayoutSpec } from "@/modules/finance/spec-print";
import {
  Badge,
  Button,
  EmptyState,
  ErrorPanel,
  Field,
  Input,
  MetricCard,
  Modal,
  PageHeader,
  Select,
  Surface,
  Textarea,
} from "@/shared/components/ui";
import { formatCurrency, formatDate, formatNumber } from "@/shared/utils/format";

type ModeFilter = "all" | "platform" | "self";

const isoDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function presetRange(kind: "month" | "lastMonth" | "7" | "30"): { from: string; to: string } {
  const now = new Date();
  if (kind === "month") return { from: isoDate(new Date(now.getFullYear(), now.getMonth(), 1)), to: isoDate(now) };
  if (kind === "lastMonth") {
    const s = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const e = new Date(now.getFullYear(), now.getMonth(), 0);
    return { from: isoDate(s), to: isoDate(e) };
  }
  const s = new Date(now);
  s.setDate(s.getDate() - (kind === "7" ? 6 : 29));
  return { from: isoDate(s), to: isoDate(now) };
}

/** Färg + etikett för leveransmodell — kärnan i self/platform-separationen. */
function modeMeta(selfDelivery: boolean) {
  return selfDelivery
    ? { label: "Levererar själv", tone: "success" as const, color: "#16A34A", Icon: Store }
    : { label: "Vi levererar", tone: "info" as const, color: "#2563EB", Icon: Truck };
}

// ---------------------------------------------------------------- Rates modal

function RatesModal({ open, onClose, rates }: { open: boolean; onClose: () => void; rates: EconomyRates | null }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<EconomyRates>(
    rates || {
      commissionSelfPct: 10,
      commissionPlatformPct: 20,
      vatCustomerPct: 6,
      vatPlatformFeePct: 25,
      tierGoldFee: 1000,
      tierSilverFee: 700,
      tierStandardFee: 0,
    },
  );

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (open && rates) setForm(rates);
  }, [open, rates]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const save = useMutation({
    mutationFn: () => updateEconomyRates(form),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["finance"] });
      onClose();
    },
  });

  const num = (k: keyof EconomyRates) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: Number(e.target.value) }));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Provision, moms & abonnemang"
      description="Globala satser. Per restaurang kan provisionen åsidosättas i utbetalningsvyn."
      footer={
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Avbryt</Button>
          <Button variant="primary" onClick={() => save.mutate()}>
            {save.isPending ? <Loader2 size={16} className="animate-spin" /> : "Spara satser"}
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">Provision (%)</p>
          <div className="mt-3 grid gap-4 md:grid-cols-2">
            <Field label="Levererar själv"><Input type="number" value={form.commissionSelfPct} onChange={num("commissionSelfPct")} /></Field>
            <Field label="Vi levererar"><Input type="number" value={form.commissionPlatformPct} onChange={num("commissionPlatformPct")} /></Field>
          </div>
        </div>
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">Moms (%)</p>
          <div className="mt-3 grid gap-4 md:grid-cols-2">
            <Field label="Kund / mat (6 → 12)"><Input type="number" value={form.vatCustomerPct} onChange={num("vatCustomerPct")} /></Field>
            <Field label="Våra avgifter (B2B, 25)"><Input type="number" value={form.vatPlatformFeePct} onChange={num("vatPlatformFeePct")} /></Field>
          </div>
        </div>
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">Abonnemang (kr/mån)</p>
          <div className="mt-3 grid gap-4 md:grid-cols-3">
            <Field label="Guld"><Input type="number" value={form.tierGoldFee} onChange={num("tierGoldFee")} /></Field>
            <Field label="Silver"><Input type="number" value={form.tierSilverFee} onChange={num("tierSilverFee")} /></Field>
            <Field label="Standard"><Input type="number" value={form.tierStandardFee} onChange={num("tierStandardFee")} /></Field>
          </div>
        </div>
      </div>
    </Modal>
  );
}

// --------------------------------------------------------------- Detail modal

function CalcRow({ label, value, strong, sub, minus }: { label: string; value: number; strong?: boolean; sub?: boolean; minus?: boolean }) {
  return (
    <div className={`flex items-center justify-between py-2 ${sub ? "pl-4 text-[var(--text-secondary)]" : ""} ${strong ? "border-t border-[var(--border-strong,rgba(0,0,0,0.15))] font-black" : "border-b border-[var(--border,rgba(0,0,0,0.06))]"}`}>
      <span>{minus ? "− " : ""}{label}</span>
      <span className="tabular-nums">{formatCurrency(value)}</span>
    </div>
  );
}

function PayoutDrawer({
  row,
  from,
  to,
  open,
  onClose,
}: {
  row: FinanceRow | null;
  from: string;
  to: string;
  open: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [adjustment, setAdjustment] = useState(0);
  const [status, setStatus] = useState("DRAFT");
  const [notes, setNotes] = useState("");
  const [payoutReference, setPayoutReference] = useState("");
  const [selfDelivery, setSelfDelivery] = useState(false);
  const [override, setOverride] = useState<string>("");

  const spec = useQuery({
    queryKey: payoutSpecQueryKey(row?.restaurantId || null, from, to),
    queryFn: () => getPayoutSpec(row!.restaurantId, from, to),
    enabled: open && Boolean(row?.restaurantId),
  });

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!open) return;
    const p = spec.data?.persisted;
    setAdjustment(p?.adjustmentAmount || 0);
    setStatus(p?.status || "DRAFT");
    setNotes(p?.notes || "");
    setPayoutReference(p?.payoutReference || "");
    if (spec.data?.restaurant) {
      setSelfDelivery(spec.data.restaurant.selfDelivery);
      setOverride(spec.data.restaurant.commissionPctOverride == null ? "" : String(spec.data.restaurant.commissionPctOverride));
    }
  }, [open, spec.data]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const b = spec.data?.breakdown;
  const net = (b?.payout ?? 0) - adjustment;

  const savePayout = useMutation({
    mutationFn: async () => {
      if (!spec.data || !row) return;
      await upsertPayout({
        restaurantId: row.restaurantId,
        periodStart: spec.data.period.from,
        periodEnd: spec.data.period.to,
        grossSales: spec.data.breakdown.restaurantGross,
        orderCount: spec.data.breakdown.orderCount,
        commissionAmount: spec.data.breakdown.commission,
        subscriptionAmount: spec.data.breakdown.subscription,
        adjustmentAmount: adjustment,
        payoutAmount: net,
        status,
        notes: notes || null,
        payoutReference: payoutReference || null,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["finance"] });
      onClose();
    },
  });

  const saveDelivery = useMutation({
    mutationFn: async () => {
      if (!row) return;
      await setRestaurantDelivery(row.restaurantId, {
        selfDelivery,
        commissionPctOverride: override.trim() === "" ? null : Number(override),
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: financeSummaryQueryKey(from, to) });
      await queryClient.invalidateQueries({ queryKey: payoutSpecQueryKey(row?.restaurantId || null, from, to) });
    },
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={row ? row.name : "Utbetalning"}
      description={`${formatDate(from)} – ${formatDate(to)}`}
      footer={
        <div className="flex w-full items-center justify-between gap-2">
          <Button onClick={() => spec.data && printPayoutSpec(spec.data, adjustment)} disabled={!spec.data}>
            <Printer size={16} /> Skriv ut / PDF
          </Button>
          <div className="flex gap-2">
            <Button onClick={onClose}>Stäng</Button>
            <Button variant="primary" onClick={() => savePayout.mutate()} disabled={!spec.data}>
              {savePayout.isPending ? <Loader2 size={16} className="animate-spin" /> : "Spara utbetalning"}
            </Button>
          </div>
        </div>
      }
    >
      {spec.isLoading || !b ? (
        <div className="flex items-center gap-2 px-1 py-10 text-sm text-[var(--text-secondary)]">
          <Loader2 size={16} className="animate-spin" /> Beräknar specen…
        </div>
      ) : (
        <div className="space-y-5">
          <div className="grid gap-4 md:grid-cols-3">
            <MetricCard label="Restaurangens intäkt" value={formatCurrency(b.restaurantGross)} />
            <MetricCard label="Plattformens avdrag" value={formatCurrency(b.commission + b.subscription + b.feeVat)} />
            <MetricCard label="Netto att betala ut" value={formatCurrency(net)} />
          </div>

          <Surface className="px-5 py-5">
            <CalcRow label={`Bruttoförsäljning (${b.orderCount} ordrar)`} value={b.grossTotal} />
            <CalcRow label="varav matvärde (provisionsbas)" value={b.foodBase} sub />
            <CalcRow label="varav leveransavgift" value={b.deliveryFee} sub />
            <CalcRow label="varav dricks" value={b.tip} sub />
            <CalcRow label="Restaurangens intäkt" value={b.restaurantGross} strong />
            <CalcRow label={`Provision (${b.commissionPct}%)`} value={b.commission} minus />
            <CalcRow label={`Abonnemang (${b.tierLabel})`} value={b.subscription} minus />
            <CalcRow label={`Moms på avgifter (${b.feeVatPct}%)`} value={b.feeVat} minus />
            <div className="mt-3 flex items-center justify-between rounded-xl bg-[var(--accent-strong,#111)] px-4 py-3 text-white">
              <span className="font-bold">Netto att betala ut</span>
              <span className="text-xl font-black tabular-nums">{formatCurrency(net)}</span>
            </div>
            <p className="mt-3 text-xs text-[var(--text-secondary)]">
              Matmoms ({b.foodVatPct}%) i försäljningen: {formatCurrency(b.foodVat)} — informativ, restaurangens egen redovisning.
            </p>
          </Surface>

          <Surface className="px-5 py-5">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">Leveransmodell & provision</p>
            <div className="mt-3 grid gap-4 md:grid-cols-[1fr_1fr_auto] md:items-end">
              <Field label="Modell">
                <Select value={selfDelivery ? "self" : "platform"} onChange={(e) => setSelfDelivery(e.target.value === "self")}>
                  <option value="platform">Vi levererar (20%)</option>
                  <option value="self">Levererar själv (10%)</option>
                </Select>
              </Field>
              <Field label="Provisions-override (%, tomt = global)">
                <Input type="number" value={override} placeholder="–" onChange={(e) => setOverride(e.target.value)} />
              </Field>
              <Button onClick={() => saveDelivery.mutate()}>
                {saveDelivery.isPending ? <Loader2 size={16} className="animate-spin" /> : "Uppdatera"}
              </Button>
            </div>
          </Surface>

          <Surface className="px-5 py-5">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Status">
                <Select value={status} onChange={(e) => setStatus(e.target.value)}>
                  <option value="DRAFT">Utkast</option>
                  <option value="APPROVED">Godkänd</option>
                  <option value="PAID">Betald</option>
                  <option value="HOLD">Pausad</option>
                </Select>
              </Field>
              <Field label="Justering (kr)"><Input type="number" value={adjustment} onChange={(e) => setAdjustment(Number(e.target.value))} /></Field>
              <Field label="Betalningsreferens"><Input value={payoutReference} onChange={(e) => setPayoutReference(e.target.value)} /></Field>
              <div className="md:col-span-1" />
              <div className="md:col-span-2"><Field label="Anteckning"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} /></Field></div>
            </div>
          </Surface>

          <Surface className="px-5 py-5">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">Ordrar i perioden</p>
            <div className="mt-3 max-h-56 overflow-auto">
              {spec.data?.orders.length ? (
                <table className="data-table">
                  <thead><tr><th>Order</th><th>Datum</th><th>Typ</th><th>Summa</th></tr></thead>
                  <tbody>
                    {spec.data.orders.map((o) => (
                      <tr key={o.orderNumber}>
                        <td>#{o.orderNumber}</td>
                        <td>{formatDate(o.createdAt)}</td>
                        <td>{o.type === "PICKUP" ? "Avhämtning" : "Leverans"}</td>
                        <td className="tabular-nums">{formatCurrency(o.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="text-sm text-[var(--text-secondary)]">Inga ordrar i perioden.</p>
              )}
            </div>
          </Surface>
        </div>
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------------- Page

const STATUS_LABEL: Record<string, string> = { DRAFT: "Utkast", APPROVED: "Godkänd", PAID: "Betald", HOLD: "Pausad" };
const statusTone = (s: string | null): "neutral" | "info" | "success" | "warning" =>
  s === "PAID" ? "success" : s === "APPROVED" ? "info" : s === "HOLD" ? "warning" : "neutral";

export function FinancePage() {
  const init = presetRange("month");
  const [from, setFrom] = useState(init.from);
  const [to, setTo] = useState(init.to);
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<ModeFilter>("all");
  const [activeRow, setActiveRow] = useState<FinanceRow | null>(null);
  const [ratesOpen, setRatesOpen] = useState(false);

  const summary = useQuery({ queryKey: financeSummaryQueryKey(from, to), queryFn: () => getFinanceSummary(from, to) });

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (summary.data?.rows || []).filter((r) => {
      if (mode === "self" && !r.selfDelivery) return false;
      if (mode === "platform" && r.selfDelivery) return false;
      if (q && !`${r.name} ${r.city || ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [summary.data, query, mode]);

  const setPreset = (kind: "month" | "lastMonth" | "7" | "30") => {
    const r = presetRange(kind);
    setFrom(r.from);
    setTo(r.to);
  };

  const totals = summary.data?.totals;

  return (
    <div className="page-stack">
      <PageHeader
        title="Ekonomi"
        actions={
          <Button onClick={() => setRatesOpen(true)}>
            <Settings2 size={16} /> Provision & moms
          </Button>
        }
      />

      <Surface className="px-6 py-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-wrap gap-2">
            {([["month", "Denna månad"], ["lastMonth", "Förra månaden"], ["7", "7 dagar"], ["30", "30 dagar"]] as const).map(([k, label]) => (
              <button
                key={k}
                onClick={() => setPreset(k)}
                className="rounded-full border border-[var(--border,rgba(0,0,0,0.12))] px-3.5 py-1.5 text-sm font-semibold transition hover:bg-[var(--surface-muted,rgba(0,0,0,0.04))]"
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex items-end gap-3">
            <Field label="Från"><Input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></Field>
            <Field label="Till"><Input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} /></Field>
          </div>
        </div>
      </Surface>

      {summary.isError ? (
        <ErrorPanel
          title="Ekonomi-modulen kunde inte laddas"
          description="Översikten gick inte att hämta."
          action={<Button onClick={() => void summary.refetch()}><RefreshCw size={16} /> Försök igen</Button>}
        />
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <MetricCard label="Försäljning" value={totals ? formatCurrency(totals.grossSales) : "—"} detail={totals ? `${formatNumber(totals.orderCount)} ordrar` : undefined} />
            <MetricCard label="Provision" value={totals ? formatCurrency(totals.commission) : "—"} />
            <MetricCard label="Abonnemang" value={totals ? formatCurrency(totals.subscription) : "—"} />
            <MetricCard label="Moms på avgifter" value={totals ? formatCurrency(totals.feeVat) : "—"} />
            <MetricCard label="Att betala ut" value={totals ? formatCurrency(totals.payout) : "—"} />
          </div>

          <Surface className="px-6 py-6">
            <div className="grid gap-4 lg:grid-cols-[1fr_220px] lg:items-end">
              <Field label="Sök">
                <div className="relative">
                  <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                  <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Restaurang eller stad" style={{ paddingLeft: 36 }} />
                </div>
              </Field>
              <Field label="Leveransmodell">
                <Select value={mode} onChange={(e) => setMode(e.target.value as ModeFilter)}>
                  <option value="all">Alla</option>
                  <option value="platform">Vi levererar</option>
                  <option value="self">Levererar själv</option>
                </Select>
              </Field>
            </div>

            {summary.isLoading ? (
              <div className="mt-6 flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                <Loader2 size={16} className="animate-spin" /> Laddar ekonomi…
              </div>
            ) : rows.length === 0 ? (
              <div className="mt-6"><EmptyState title="Inga restauranger i perioden" /></div>
            ) : (
              <div className="mt-6 table-shell">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Restaurang</th>
                      <th>Modell</th>
                      <th>Ordrar</th>
                      <th>Försäljning</th>
                      <th>Provision</th>
                      <th>Abonnemang</th>
                      <th>Netto</th>
                      <th>Status</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const m = modeMeta(r.selfDelivery);
                      return (
                        <tr key={r.restaurantId}>
                          <td>
                            <div className="flex items-center gap-3" style={{ borderLeft: `3px solid ${m.color}`, paddingLeft: 10 }}>
                              <div>
                                <p className="font-black">{r.name}</p>
                                <p className="mt-0.5 text-sm text-[var(--text-secondary)]">{r.city || "Ingen stad"} • {r.tierLabel}</p>
                              </div>
                            </div>
                          </td>
                          <td><Badge tone={m.tone}><m.Icon size={12} style={{ marginRight: 4, display: "inline" }} />{m.label}</Badge></td>
                          <td className="tabular-nums">{formatNumber(r.orderCount)}</td>
                          <td className="tabular-nums">{formatCurrency(r.grossSales)}</td>
                          <td className="tabular-nums">{formatCurrency(r.commission)} <span className="text-[var(--text-muted)]">({r.commissionPct}%)</span></td>
                          <td className="tabular-nums">{formatCurrency(r.subscription)}</td>
                          <td className="font-black tabular-nums">{formatCurrency(r.payout)}</td>
                          <td><Badge tone={statusTone(r.status)}>{r.status ? STATUS_LABEL[r.status] || r.status : "Ej hanterad"}</Badge></td>
                          <td><div className="flex justify-end"><Button variant="secondary" onClick={() => setActiveRow(r)}>Öppna</Button></div></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Surface>
        </>
      )}

      <PayoutDrawer row={activeRow} from={from} to={to} open={Boolean(activeRow)} onClose={() => setActiveRow(null)} />
      <RatesModal open={ratesOpen} onClose={() => setRatesOpen(false)} rates={summary.data?.economy || null} />
    </div>
  );
}
