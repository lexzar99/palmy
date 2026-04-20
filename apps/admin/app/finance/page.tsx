"use client";

import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowUpRight,
  Loader2,
  RefreshCw,
  Search,
  Settings2,
  Wallet,
} from "lucide-react";
import { API_URL } from "@/lib/api";
import { getStoredToken } from "@/lib/auth-storage";
import { useControlCenter } from "@/lib/use-control-center";
import { useToast } from "@/components/Toast";

const FINANCE_CONFIG_KEY = "matgo_finance_hq_config_v2";
const currency = (value: number) => `${value.toLocaleString("sv-SE", { minimumFractionDigits: 0, maximumFractionDigits: 0 })} kr`;

type TierConfig = {
  subscriptionFee: number;
  commissionPct: number;
};

type FinanceConfig = {
  1: TierConfig;
  2: TierConfig;
  3: TierConfig;
  0: TierConfig;
};

type ReportData = {
  restaurant: { id: string; name: string; slug: string; featuredClass: number };
  summary: {
    totalOrders: number;
    totalRevenue: number;
    avgOrderValue: number;
    pickupOrders: number;
    deliveryOrders: number;
    newCustomers: number;
  };
  topProducts: Array<{ name: string; count: number; revenue: number }>;
  dailyData: Array<{ date: string; revenue: number; orders: number }>;
};

type PersistedPayout = {
  id: string;
  restaurantId: string;
  periodStart: string;
  periodEnd: string;
  grossSales: number;
  orderCount: number;
  commissionAmount: number;
  subscriptionAmount: number;
  adjustmentAmount: number;
  payoutAmount: number;
  status: string;
  notes?: string | null;
  payoutReference?: string | null;
  approvedAt?: string | null;
  approvedBy?: string | null;
  paidAt?: string | null;
  paidBy?: string | null;
};

const DEFAULT_CONFIG: FinanceConfig = {
  1: { subscriptionFee: 1990, commissionPct: 8 },
  2: { subscriptionFee: 990, commissionPct: 10 },
  3: { subscriptionFee: 490, commissionPct: 12 },
  0: { subscriptionFee: 0, commissionPct: 12 },
};

const getRange = (period: "month" | "30d" | "7d") => {
  const now = new Date();
  const to = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  const from = new Date(to);

  if (period === "month") {
    from.setDate(1);
  } else if (period === "30d") {
    from.setDate(from.getDate() - 29);
  } else {
    from.setDate(from.getDate() - 6);
  }

  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
};

export default function FinancePage() {
  const { success, error: toastError } = useToast();
  const { data, loading, error, refresh, selectedRestaurantId } = useControlCenter();
  const [config, setConfig] = useState<FinanceConfig>(DEFAULT_CONFIG);
  const [showConfig, setShowConfig] = useState(false);
  const [search, setSearch] = useState("");
  const [period, setPeriod] = useState<"month" | "30d" | "7d">("month");
  const [selectedRestaurant, setSelectedRestaurant] = useState<string | null>(null);
  const [detail, setDetail] = useState<ReportData | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [payouts, setPayouts] = useState<PersistedPayout[]>([]);
  const [payoutSaving, setPayoutSaving] = useState(false);
  const [payoutError, setPayoutError] = useState<string | null>(null);
  const [payoutEditor, setPayoutEditor] = useState({
    adjustmentAmount: 0,
    notes: "",
    payoutReference: "",
  });

  const range = useMemo(() => getRange(period), [period]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(FINANCE_CONFIG_KEY);
      if (raw) {
        setConfig({ ...DEFAULT_CONFIG, ...JSON.parse(raw) });
      }
    } catch {
      setConfig(DEFAULT_CONFIG);
    }
  }, []);

  useEffect(() => {
    if (!data?.restaurantSnapshots.length) return;
    setSelectedRestaurant(selectedRestaurantId || data.restaurantSnapshots[0].id);
  }, [data?.restaurantSnapshots, selectedRestaurantId]);

  useEffect(() => {
    if (!selectedRestaurant) return;

    const token = getStoredToken();
    if (!token) return;

    const loadDetail = async () => {
      setDetailLoading(true);
      setDetailError(null);
      try {
        const response = await axios.get(`${API_URL}/api/admin/reports/restaurant/${selectedRestaurant}`, {
          headers: { Authorization: `Bearer ${token}` },
          params: range,
        });
        setDetail(response.data);
      } catch (err: any) {
        setDetailError(err.response?.data?.error || "Kunde inte ladda restaurangrapporten.");
      } finally {
        setDetailLoading(false);
      }
    };

    void loadDetail();
  }, [range, selectedRestaurant]);

  useEffect(() => {
    const token = getStoredToken();
    if (!token) return;

    const loadPayouts = async () => {
      try {
        setPayoutError(null);
        const response = await axios.get(`${API_URL}/api/admin/payouts`, {
          headers: { Authorization: `Bearer ${token}` },
          params: {
            from: range.from,
            to: range.to,
            ...(selectedRestaurantId ? { restaurantId: selectedRestaurantId } : {}),
          },
        });
        setPayouts(response.data || []);
      } catch (err: any) {
        setPayoutError(err.response?.data?.error || "Kunde inte ladda sparade utbetalningar.");
      }
    };

    void loadPayouts();
  }, [range, selectedRestaurantId]);

  const rows = useMemo(() => {
    if (!data) return [];

    const payoutMap = new Map(payouts.map((payout) => [payout.restaurantId, payout]));

    return data.restaurantSnapshots
      .map((restaurant) => {
        const tier = config[restaurant.featuredClass as keyof FinanceConfig] || config[3];
        const grossSales = restaurant.monthRevenue;
        const commission = (grossSales * tier.commissionPct) / 100;
        const basePayout = grossSales - commission - tier.subscriptionFee;
        const persisted = payoutMap.get(restaurant.id);
        const adjustmentAmount = persisted?.adjustmentAmount || 0;
        const payout = persisted?.payoutAmount ?? basePayout;

        return {
          id: restaurant.id,
          name: restaurant.name,
          city: restaurant.city,
          featuredLabel: restaurant.featuredLabel,
          grossSales,
          commission,
          subscription: tier.subscriptionFee,
          basePayout,
          adjustmentAmount,
          payout,
          payoutId: persisted?.id || null,
          payoutStatus: persisted?.status || "DRAFT",
          payoutNotes: persisted?.notes || "",
          payoutReference: persisted?.payoutReference || "",
          approvedAt: persisted?.approvedAt || null,
          approvedBy: persisted?.approvedBy || null,
          paidAt: persisted?.paidAt || null,
          paidBy: persisted?.paidBy || null,
          readiness: restaurant.adminEmail && restaurant.hasHours ? "ready" : "action",
          focus: restaurant.focus,
          pendingOrders: restaurant.pendingOrders,
        };
      })
      .filter((restaurant) => {
        if (!search.trim()) return true;
        const query = search.toLowerCase();
        return restaurant.name.toLowerCase().includes(query) || (restaurant.city || "").toLowerCase().includes(query);
      })
      .sort((a, b) => b.payout - a.payout);
  }, [config, data, payouts, search]);

  const totals = useMemo(
    () => ({
      grossSales: rows.reduce((sum, row) => sum + row.grossSales, 0),
      commission: rows.reduce((sum, row) => sum + row.commission, 0),
      subscription: rows.reduce((sum, row) => sum + row.subscription, 0),
      payout: rows.reduce((sum, row) => sum + row.payout, 0),
      approved: rows.filter((row) => row.payoutStatus === "APPROVED").length,
      paid: rows.filter((row) => row.payoutStatus === "PAID").length,
      ready: rows.filter((row) => row.readiness === "ready").length,
      action: rows.filter((row) => row.readiness === "action").length,
    }),
    [rows]
  );

  const activeRow = rows.find((row) => row.id === selectedRestaurant) || rows[0] || null;

  useEffect(() => {
    if (!activeRow) return;
    setPayoutEditor({
      adjustmentAmount: activeRow.adjustmentAmount || 0,
      notes: activeRow.payoutNotes || "",
      payoutReference: activeRow.payoutReference || "",
    });
  }, [activeRow?.id, activeRow?.adjustmentAmount, activeRow?.payoutNotes, activeRow?.payoutReference]);

  const savePayout = async (status: string) => {
    const token = getStoredToken();
    if (!token || !activeRow || !detail) return;

    setPayoutSaving(true);
    try {
      const response = await axios.post(
        `${API_URL}/api/admin/payouts`,
        {
          restaurantId: activeRow.id,
          periodStart: range.from,
          periodEnd: range.to,
          grossSales: activeRow.grossSales,
          orderCount: detail.summary.totalOrders,
          commissionAmount: activeRow.commission,
          subscriptionAmount: activeRow.subscription,
          adjustmentAmount: payoutEditor.adjustmentAmount,
          payoutAmount: activeRow.basePayout + payoutEditor.adjustmentAmount,
          status,
          notes: payoutEditor.notes,
          payoutReference: payoutEditor.payoutReference,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setPayouts((previous) => {
        const next = previous.filter((item) => item.restaurantId !== activeRow.id);
        next.push(response.data);
        return next;
      });
      success(status === "PAID" ? "Utbetalningen markerades som betald." : status === "APPROVED" ? "Utbetalningen godkändes." : status === "HOLD" ? "Utbetalningen sattes på hold." : "Utbetalningsutkastet sparades.");
    } catch (err: any) {
      toastError(err.response?.data?.error || "Kunde inte spara utbetalningen.");
    } finally {
      setPayoutSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="panel flex min-h-[360px] items-center justify-center rounded-[32px] px-6 py-12">
        <div className="flex items-center gap-3 text-[var(--text-secondary)]">
          <Loader2 className="animate-spin text-amber-200" size={18} />
          <span className="text-sm font-bold">Laddar Finance HQ…</span>
        </div>
      </div>
    );
  }

  if (!data || error) {
    return (
      <div className="panel flex min-h-[360px] flex-col items-center justify-center gap-4 rounded-[32px] px-6 py-12 text-center">
        <Wallet size={34} className="text-amber-200" />
        <h2 className="text-2xl font-black tracking-[-0.04em] text-[var(--text-primary)]">Finance HQ kunde inte laddas</h2>
        <p className="max-w-xl text-sm leading-6 text-[var(--text-secondary)]">{error || "Något gick fel när finance-panelen skulle laddas."}</p>
        <button type="button" onClick={() => void refresh()} className="inline-flex items-center gap-2 rounded-2xl bg-gold-gradient px-5 py-3 text-[11px] font-black uppercase tracking-[0.24em] text-[#091018]">
          <RefreshCw size={14} /> Försök igen
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-16">
      <section className="grid gap-4 xl:grid-cols-5">
          {[
            { label: "Bruttoförsäljning", value: currency(totals.grossSales), sub: `${rows.length} restauranger i kö` },
            { label: "Provision", value: currency(totals.commission), sub: "Beräknad plattformsmarginal" },
            { label: "Abonnemang", value: currency(totals.subscription), sub: "Månatliga tier-avgifter" },
            { label: "Preliminär payout", value: currency(totals.payout), sub: `${totals.ready} redo • ${totals.action} kräver åtgärd` },
            { label: "Workflow", value: `${totals.approved}/${totals.paid}`, sub: "Godkända / betalda perioder" },
          ].map((card) => (
          <article key={card.label} className="metric-card panel-muted">
            <p className="text-[10px] font-black uppercase tracking-[0.28em] text-[var(--text-muted)]">{card.label}</p>
            <p className="mt-3 text-3xl font-black tracking-[-0.05em] text-[var(--text-primary)]">{card.value}</p>
            <p className="mt-4 text-sm leading-6 text-[var(--text-secondary)]">{card.sub}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-5 2xl:grid-cols-[1.2fr_0.8fr]">
        <div className="panel rounded-[32px] px-6 py-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[var(--text-muted)]">Payout queue</p>
              <h3 className="mt-2 text-2xl font-black tracking-[-0.04em] text-[var(--text-primary)]">Utbetalningskö med tydlig readiness</h3>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[240px]">
                <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Sök restaurang eller stad"
                  className="control-input pl-10"
                />
              </div>
              <button type="button" onClick={() => setShowConfig((value) => !value)} className="control-chip">
                <Settings2 size={13} /> Avgiftsmodell
              </button>
            </div>
          </div>

          {showConfig ? (
            <div className="mt-5 grid gap-4 rounded-[28px] border border-[var(--border-subtle)] bg-[var(--panel-muted)] p-5 xl:grid-cols-4">
              {([1, 2, 3, 0] as const).map((tier) => (
                <div key={tier} className="rounded-2xl border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] p-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[var(--text-muted)]">
                    Tier {tier === 0 ? "Dold" : tier}
                  </p>
                  <div className="mt-4 grid gap-3">
                    <label className="grid gap-2 text-[11px] font-bold text-[var(--text-secondary)]">
                      <span>Provision %</span>
                      <input
                        type="number"
                        value={config[tier].commissionPct}
                        onChange={(event) =>
                          setConfig((previous) => ({
                            ...previous,
                            [tier]: { ...previous[tier], commissionPct: Number(event.target.value) },
                          }))
                        }
                        className="control-input"
                      />
                    </label>
                    <label className="grid gap-2 text-[11px] font-bold text-[var(--text-secondary)]">
                      <span>Månadsavgift</span>
                      <input
                        type="number"
                        value={config[tier].subscriptionFee}
                        onChange={(event) =>
                          setConfig((previous) => ({
                            ...previous,
                            [tier]: { ...previous[tier], subscriptionFee: Number(event.target.value) },
                          }))
                        }
                        className="control-input"
                      />
                    </label>
                  </div>
                </div>
              ))}

              <div className="xl:col-span-4 flex flex-wrap items-center justify-end gap-2">
                <button type="button" onClick={() => setConfig(DEFAULT_CONFIG)} className="inline-flex items-center gap-2 rounded-2xl border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] px-4 py-3 text-[11px] font-black uppercase tracking-[0.22em] text-[var(--text-primary)]">
                  Återställ
                </button>
                <button
                  type="button"
                  onClick={() => localStorage.setItem(FINANCE_CONFIG_KEY, JSON.stringify(config))}
                  className="inline-flex items-center gap-2 rounded-2xl bg-gold-gradient px-4 py-3 text-[11px] font-black uppercase tracking-[0.22em] text-[#091018]"
                >
                  Spara modell
                </button>
              </div>
            </div>
          ) : null}

          <div className="mt-5 grid gap-3">
            {rows.map((row) => (
              <button
                key={row.id}
                type="button"
                onClick={() => setSelectedRestaurant(row.id)}
                className={`rounded-[28px] border px-5 py-5 text-left transition ${
                  activeRow?.id === row.id
                    ? "border-amber-300/22 bg-amber-300/10"
                    : "border-[var(--border-subtle)] bg-[var(--panel-muted)]"
                }`}
              >
                <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                  <div>
                    <p className="text-xl font-black tracking-[-0.04em] text-[var(--text-primary)]">{row.name}</p>
                    <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[var(--text-muted)]">{row.featuredLabel} • {row.city || "Ingen stad"}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] ${row.readiness === "ready" ? "bg-emerald-300/12 text-emerald-100" : "bg-amber-300/12 text-amber-100"}`}>
                      {row.readiness === "ready" ? "Redo för payout" : "Kräver åtgärd"}
                    </span>
                    <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] ${row.payoutStatus === "PAID" ? "bg-sky-300/12 text-sky-100" : row.payoutStatus === "APPROVED" ? "bg-emerald-300/12 text-emerald-100" : row.payoutStatus === "HOLD" ? "bg-rose-300/12 text-rose-100" : "bg-[rgba(255,255,255,0.06)] text-[var(--text-secondary)]"}`}>
                      {row.payoutStatus}
                    </span>
                    <span className="rounded-full bg-[rgba(255,255,255,0.06)] px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-secondary)]">
                      Focus: {row.focus}
                    </span>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-4">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-muted)]">Brutto</p>
                    <p className="mt-1 font-black text-[var(--text-primary)]">{currency(row.grossSales)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-muted)]">Provision</p>
                    <p className="mt-1 font-black text-[var(--text-primary)]">{currency(row.commission)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-muted)]">Abonnemang</p>
                    <p className="mt-1 font-black text-[var(--text-primary)]">{currency(row.subscription)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-muted)]">Utbetalning</p>
                    <p className="mt-1 font-black text-amber-200">{currency(row.payout)}</p>
                  </div>
                </div>

                {row.adjustmentAmount !== 0 ? (
                  <div className="mt-3 text-xs text-[var(--text-secondary)]">Justering: {currency(row.adjustmentAmount)}</div>
                ) : null}
              </button>
            ))}
          </div>
        </div>

        <div className="panel rounded-[32px] px-6 py-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[var(--text-muted)]">Detaljpanel</p>
              <h3 className="mt-2 text-2xl font-black tracking-[-0.04em] text-[var(--text-primary)]">{activeRow?.name || "Ingen restaurang vald"}</h3>
            </div>
            <div className="flex items-center gap-2">
              {(["month", "30d", "7d"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setPeriod(value)}
                  className={`rounded-2xl px-4 py-3 text-[11px] font-black uppercase tracking-[0.22em] ${period === value ? "bg-gold-gradient text-[#091018]" : "border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] text-[var(--text-secondary)]"}`}
                >
                  {value === "month" ? "Månad" : value}
                </button>
              ))}
            </div>
          </div>

          {detailLoading ? (
            <div className="mt-6 flex min-h-[260px] items-center justify-center rounded-[28px] border border-[var(--border-subtle)] bg-[var(--panel-muted)]">
              <Loader2 className="animate-spin text-amber-200" size={18} />
            </div>
          ) : detailError || !detail ? (
            <div className="mt-6 rounded-[28px] border border-rose-300/18 bg-rose-300/10 px-5 py-5 text-sm leading-6 text-rose-100">
              {detailError || "Välj en restaurang för att se payout-detaljer."}
            </div>
          ) : (
            <div className="mt-6 space-y-5">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-[24px] border border-[var(--border-subtle)] bg-[var(--panel-muted)] px-5 py-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-muted)]">Omsättning</p>
                  <p className="mt-2 text-3xl font-black tracking-[-0.05em] text-[var(--text-primary)]">{currency(detail.summary.totalRevenue)}</p>
                </div>
                <div className="rounded-[24px] border border-[var(--border-subtle)] bg-[var(--panel-muted)] px-5 py-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-muted)]">Snittorder</p>
                  <p className="mt-2 text-3xl font-black tracking-[-0.05em] text-[var(--text-primary)]">{currency(detail.summary.avgOrderValue)}</p>
                </div>
                <div className="rounded-[24px] border border-[var(--border-subtle)] bg-[var(--panel-muted)] px-5 py-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-muted)]">Utbetalningsstatus</p>
                  <p className="mt-2 text-3xl font-black tracking-[-0.05em] text-amber-200">{activeRow?.payoutStatus || "DRAFT"}</p>
                </div>
              </div>

              <div className="rounded-[28px] border border-[var(--border-subtle)] bg-[var(--panel-muted)] px-5 py-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-muted)]">Payout workflow</p>
                    <p className="mt-1 text-lg font-black tracking-[-0.03em] text-[var(--text-primary)]">Spara, godkänn och betala ut från samma panel</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-secondary)]">
                    {activeRow?.approvedAt ? <span>Godkänd {new Date(activeRow.approvedAt).toLocaleDateString("sv-SE")}</span> : null}
                    {activeRow?.paidAt ? <span>• Betald {new Date(activeRow.paidAt).toLocaleDateString("sv-SE")}</span> : null}
                  </div>
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-3">
                  <label className="grid gap-2 text-[11px] font-bold text-[var(--text-secondary)]">
                    <span>Basutbetalning</span>
                    <div className="control-input flex items-center">{currency(activeRow?.basePayout || 0)}</div>
                  </label>
                  <label className="grid gap-2 text-[11px] font-bold text-[var(--text-secondary)]">
                    <span>Manuell justering</span>
                    <input type="number" value={payoutEditor.adjustmentAmount} onChange={(event) => setPayoutEditor((previous) => ({ ...previous, adjustmentAmount: Number(event.target.value) }))} className="control-input" />
                  </label>
                  <label className="grid gap-2 text-[11px] font-bold text-[var(--text-secondary)]">
                    <span>Slututbetalning</span>
                    <div className="control-input flex items-center text-amber-200">{currency((activeRow?.basePayout || 0) + payoutEditor.adjustmentAmount)}</div>
                  </label>
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <label className="grid gap-2 text-[11px] font-bold text-[var(--text-secondary)]">
                    <span>Utbetalningsreferens</span>
                    <input value={payoutEditor.payoutReference} onChange={(event) => setPayoutEditor((previous) => ({ ...previous, payoutReference: event.target.value }))} className="control-input" placeholder="BG/Swish/Stripe ref" />
                  </label>
                  <label className="grid gap-2 text-[11px] font-bold text-[var(--text-secondary)] md:col-span-2">
                    <span>Intern payout-notering</span>
                    <textarea value={payoutEditor.notes} onChange={(event) => setPayoutEditor((previous) => ({ ...previous, notes: event.target.value }))} className="control-input min-h-[120px] resize-none" placeholder="Bankinfo verifierad, avdrag för supportärende, väntar på momsunderlag..." />
                  </label>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <button type="button" onClick={() => void savePayout("DRAFT")} disabled={payoutSaving} className="control-chip">
                    Spara utkast
                  </button>
                  <button type="button" onClick={() => void savePayout("APPROVED")} disabled={payoutSaving} className="control-chip text-emerald-100">
                    Godkänn payout
                  </button>
                  <button type="button" onClick={() => void savePayout("PAID")} disabled={payoutSaving} className="control-chip text-sky-100">
                    Markera betald
                  </button>
                  <button type="button" onClick={() => void savePayout("HOLD")} disabled={payoutSaving} className="control-chip text-rose-100">
                    Sätt på hold
                  </button>
                  {payoutError ? <span className="text-xs text-rose-200">{payoutError}</span> : null}
                </div>
              </div>

              <div className="rounded-[28px] border border-[var(--border-subtle)] bg-[var(--panel-muted)] px-5 py-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-muted)]">Daglig utveckling</p>
                    <p className="mt-1 text-lg font-black tracking-[-0.03em] text-[var(--text-primary)]">Likviditetskurva</p>
                  </div>
                  <button type="button" onClick={() => setPeriod(period)} className="control-chip">
                    <ArrowUpRight size={13} /> {detail.summary.totalOrders} ordrar
                  </button>
                </div>

                <div className="mt-4 h-[220px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={detail.dailyData}>
                      <defs>
                        <linearGradient id="financeRevenue" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#f5bf5b" stopOpacity={0.35} />
                          <stop offset="95%" stopColor="#f5bf5b" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke="rgba(148,163,184,0.12)" vertical={false} />
                      <XAxis dataKey="date" tickFormatter={(value) => value.slice(5)} tickLine={false} axisLine={false} tick={{ fill: "rgba(203,213,225,0.7)", fontSize: 11 }} />
                      <YAxis tickLine={false} axisLine={false} tick={{ fill: "rgba(203,213,225,0.54)", fontSize: 11 }} />
                      <Tooltip
                        contentStyle={{
                          background: "rgba(7,10,20,0.94)",
                          border: "1px solid rgba(148,163,184,0.18)",
                          borderRadius: 20,
                          color: "#f8fafc",
                        }}
                        formatter={(value: number, key) => [key === "revenue" ? currency(value) : value, key === "revenue" ? "Omsättning" : "Ordrar"]}
                      />
                      <Area type="monotone" dataKey="revenue" stroke="#f5bf5b" fill="url(#financeRevenue)" strokeWidth={3} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="rounded-[28px] border border-[var(--border-subtle)] bg-[var(--panel-muted)] px-5 py-5">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-muted)]">Topp-produkter i perioden</p>
                <div className="mt-4 grid gap-3">
                  {detail.topProducts.slice(0, 5).map((product) => (
                    <div key={product.name} className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] px-4 py-3">
                      <div>
                        <p className="text-base font-black tracking-[-0.03em] text-[var(--text-primary)]">{product.name}</p>
                        <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[var(--text-muted)]">{product.count} sålda</p>
                      </div>
                      <span className="text-sm font-black text-amber-200">{currency(product.revenue)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
