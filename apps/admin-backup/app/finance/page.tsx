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
  AlertTriangle,
  ArrowRight,
  Loader2,
  RefreshCw,
  Search,
  Settings2,
  Wallet,
} from "lucide-react";
import { Modal } from "@/components/Modal";
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

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Utkast",
  APPROVED: "Godkänd",
  PAID: "Betald",
  HOLD: "På hold",
};

export default function FinancePage() {
  const { success, error: toastError } = useToast();
  const { data, loading, error, refresh, selectedRestaurantId } = useControlCenter();
  const [config, setConfig] = useState<FinanceConfig>(DEFAULT_CONFIG);
  const [configOpen, setConfigOpen] = useState(false);
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
    setSelectedRestaurant((current) => current || selectedRestaurantId || data.restaurantSnapshots[0].id);
  }, [data?.restaurantSnapshots, selectedRestaurantId]);

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
          payoutStatus: persisted?.status || "DRAFT",
          payoutNotes: persisted?.notes || "",
          payoutReference: persisted?.payoutReference || "",
          approvedAt: persisted?.approvedAt || null,
          paidAt: persisted?.paidAt || null,
          readiness: restaurant.hasHours ? "ready" : "action",
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
      negative: rows.filter((row) => row.payout < 0).length,
      action: rows.filter((row) => row.readiness === "action").length,
    }),
    [rows]
  );

  const activeRow = rows.find((row) => row.id === selectedRestaurant) || null;

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
      success(
        status === "PAID"
          ? "Utbetalningen markerades som betald."
          : status === "APPROVED"
            ? "Utbetalningen godkändes."
            : status === "HOLD"
              ? "Utbetalningen sattes på hold."
              : "Utbetalningsutkastet sparades."
      );
    } catch (err: any) {
      toastError(err.response?.data?.error || "Kunde inte spara utbetalningen.");
    } finally {
      setPayoutSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="panel flex min-h-[320px] items-center justify-center rounded-[28px] px-6 py-12">
        <div className="flex items-center gap-3 text-[var(--text-secondary)]">
          <Loader2 className="animate-spin text-amber-200" size={18} />
          <span className="text-sm font-semibold">Laddar ekonomi...</span>
        </div>
      </div>
    );
  }

  if (!data || error) {
    return (
      <div className="panel flex min-h-[320px] flex-col items-center justify-center gap-4 rounded-[28px] px-6 py-12 text-center">
        <Wallet size={34} className="text-amber-200" />
        <h2 className="text-2xl font-black tracking-[-0.04em] text-[var(--text-primary)]">Ekonomisidan kunde inte laddas</h2>
        <p className="max-w-xl text-sm leading-6 text-[var(--text-secondary)]">{error || "Något gick fel när ekonomisidan skulle laddas."}</p>
        <button type="button" onClick={() => void refresh()} className="inline-flex items-center gap-2 rounded-2xl bg-gold-gradient px-5 py-3 text-[11px] font-black uppercase tracking-[0.24em] text-[#091018]">
          <RefreshCw size={14} /> Försök igen
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-6 pb-16">
        <section className="panel rounded-[28px] px-6 py-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-3">
              <span className="control-chip">Förenklad ekonomi</span>
              <div>
                <h2 className="text-3xl font-black tracking-[-0.06em] text-[var(--text-primary)] sm:text-4xl">En lista och en payout-modal.</h2>
                <p className="mt-2 max-w-3xl text-sm leading-7 text-[var(--text-secondary)] sm:text-base">
                  Här väljer du restaurang, öppnar payouten i modal och ser exakt varför beloppet ser ut som det gör. Ingen sidopanel med gömd information längre.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => void refresh()} className="control-chip">
                <RefreshCw size={13} /> Uppdatera
              </button>
              <button type="button" onClick={() => setConfigOpen(true)} className="control-chip">
                <Settings2 size={13} /> Modell
              </button>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "Brutto", value: currency(totals.grossSales), sub: `${rows.length} restauranger i urvalet` },
            { label: "Provision", value: currency(totals.commission), sub: "Plattformens del" },
            { label: "Abonnemang", value: currency(totals.subscription), sub: "Månadsavgifter i modellen" },
            { label: "Preliminär payout", value: currency(totals.payout), sub: `${totals.negative} negativa • ${totals.action} kräver åtgärd` },
          ].map((card) => (
            <article key={card.label} className="metric-card panel-muted">
              <p className="text-[10px] font-black uppercase tracking-[0.28em] text-[var(--text-muted)]">{card.label}</p>
              <p className="mt-3 text-3xl font-black tracking-[-0.05em] text-[var(--text-primary)]">{card.value}</p>
              <p className="mt-4 text-sm leading-6 text-[var(--text-secondary)]">{card.sub}</p>
            </article>
          ))}
        </section>

        <section className="rounded-[28px] border border-sky-300/18 bg-sky-300/10 px-5 py-5">
          <div className="flex items-start gap-3 text-sky-100">
            <AlertTriangle size={18} className="mt-0.5 shrink-0" />
            <div className="space-y-2 text-sm leading-6">
              <p className="font-black uppercase tracking-[0.2em]">Så räknas payouten</p>
              <p>Payout = bruttoförsäljning minus provision minus abonnemang plus eventuell manuell justering. Om ett belopp blir negativt syns det tydligt i listan och i modalen.</p>
            </div>
          </div>
        </section>

        <section className="panel rounded-[28px] px-6 py-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="relative flex-1">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Sök restaurang eller stad" className="control-input pl-10" />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {(["month", "30d", "7d"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setPeriod(value)}
                  className={`rounded-2xl px-4 py-3 text-[11px] font-black uppercase tracking-[0.22em] ${period === value ? "bg-gold-gradient text-[#091018]" : "border border-[var(--border-subtle)] bg-[var(--panel-muted)] text-[var(--text-secondary)]"}`}
                >
                  {value === "month" ? "Månad" : value}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-5 grid gap-4">
            {rows.length === 0 ? (
              <div className="rounded-[24px] border border-dashed border-[var(--border-subtle)] px-6 py-16 text-center text-sm leading-7 text-[var(--text-secondary)]">
                Inga restauranger matchade filtren.
              </div>
            ) : (
              rows.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => setSelectedRestaurant(row.id)}
                  className="rounded-[24px] border border-[var(--border-subtle)] bg-[var(--panel-muted)] px-5 py-5 text-left transition hover:border-[var(--border-strong)]"
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-2xl font-black tracking-[-0.04em] text-[var(--text-primary)]">{row.name}</p>
                        <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] ${row.readiness === "ready" ? "bg-emerald-300/12 text-emerald-100" : "bg-amber-300/12 text-amber-100"}`}>
                          {row.readiness === "ready" ? "Redo" : "Åtgärd krävs"}
                        </span>
                        <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] ${row.payout < 0 ? "bg-rose-300/12 text-rose-100" : "bg-[rgba(255,255,255,0.06)] text-[var(--text-secondary)]"}`}>
                          {row.payout < 0 ? "Negativ payout" : STATUS_LABELS[row.payoutStatus] || row.payoutStatus}
                        </span>
                      </div>
                      <p className="mt-1 text-[11px] font-black uppercase tracking-[0.22em] text-[var(--text-muted)]">{row.featuredLabel} • {row.city || "Ingen stad"}</p>
                    </div>

                    <div className="inline-flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.2em] text-amber-200">
                      Öppna payout <ArrowRight size={14} />
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-4">
                    <div className="rounded-[18px] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.02)] px-4 py-3">
                      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-muted)]">Brutto</p>
                      <p className="mt-2 font-black text-[var(--text-primary)]">{currency(row.grossSales)}</p>
                    </div>
                    <div className="rounded-[18px] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.02)] px-4 py-3">
                      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-muted)]">Provision</p>
                      <p className="mt-2 font-black text-[var(--text-primary)]">{currency(row.commission)}</p>
                    </div>
                    <div className="rounded-[18px] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.02)] px-4 py-3">
                      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-muted)]">Abonnemang</p>
                      <p className="mt-2 font-black text-[var(--text-primary)]">{currency(row.subscription)}</p>
                    </div>
                    <div className="rounded-[18px] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.02)] px-4 py-3">
                      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-muted)]">Utbetalning</p>
                      <p className={`mt-2 font-black ${row.payout < 0 ? "text-rose-200" : "text-amber-200"}`}>{currency(row.payout)}</p>
                    </div>
                  </div>

                  {row.adjustmentAmount !== 0 ? <p className="mt-3 text-sm text-[var(--text-secondary)]">Manuell justering: {currency(row.adjustmentAmount)}</p> : null}
                </button>
              ))
            )}
          </div>
        </section>
      </div>

      <Modal open={configOpen} onClose={() => setConfigOpen(false)} title="Avgiftsmodell" maxWidth="max-w-4xl">
        <div className="grid gap-4 xl:grid-cols-4">
          {([1, 2, 3, 0] as const).map((tier) => (
            <div key={tier} className="rounded-[22px] border border-[var(--border-subtle)] bg-[var(--panel-muted)] p-4">
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[var(--text-muted)]">Tier {tier === 0 ? "Dold" : tier}</p>
              <div className="mt-4 grid gap-3">
                <label className="grid gap-2 text-[11px] font-bold text-[var(--text-secondary)]">
                  <span>Provision %</span>
                  <input
                    type="number"
                    value={config[tier].commissionPct}
                    onChange={(event) => setConfig((previous) => ({ ...previous, [tier]: { ...previous[tier], commissionPct: Number(event.target.value) } }))}
                    className="control-input"
                  />
                </label>
                <label className="grid gap-2 text-[11px] font-bold text-[var(--text-secondary)]">
                  <span>Månadsavgift</span>
                  <input
                    type="number"
                    value={config[tier].subscriptionFee}
                    onChange={(event) => setConfig((previous) => ({ ...previous, [tier]: { ...previous[tier], subscriptionFee: Number(event.target.value) } }))}
                    className="control-input"
                  />
                </label>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-6 flex flex-col-reverse gap-3 border-t border-[var(--border-subtle)] pt-6 sm:flex-row sm:justify-end">
          <button type="button" onClick={() => setConfig(DEFAULT_CONFIG)} className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--panel-muted)] px-5 py-3 text-[11px] font-black uppercase tracking-[0.22em] text-[var(--text-secondary)]">
            Återställ
          </button>
          <button
            type="button"
            onClick={() => {
              localStorage.setItem(FINANCE_CONFIG_KEY, JSON.stringify(config));
              success("Avgiftsmodellen sparades lokalt.");
              setConfigOpen(false);
            }}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gold-gradient px-5 py-3 text-[11px] font-black uppercase tracking-[0.22em] text-[#091018]"
          >
            Spara modell
          </button>
        </div>
      </Modal>

      <Modal open={!!activeRow} onClose={() => setSelectedRestaurant(null)} title={activeRow ? `Payout: ${activeRow.name}` : undefined} maxWidth="max-w-6xl">
        {!activeRow ? null : detailLoading ? (
          <div className="flex min-h-[260px] items-center justify-center">
            <Loader2 className="animate-spin text-amber-200" size={18} />
          </div>
        ) : detailError || !detail ? (
          <div className="rounded-[22px] border border-rose-300/18 bg-rose-300/10 px-5 py-5 text-sm leading-6 text-rose-100">
            {detailError || "Kunde inte ladda payout-detaljerna."}
          </div>
        ) : (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {[
                { label: "Omsättning", value: currency(detail.summary.totalRevenue), sub: `${detail.summary.totalOrders} ordrar` },
                { label: "Basutbetalning", value: currency(activeRow.basePayout), sub: `Provision ${currency(activeRow.commission)}` },
                { label: "Justering", value: currency(payoutEditor.adjustmentAmount), sub: `Abonnemang ${currency(activeRow.subscription)}` },
                { label: "Slutbelopp", value: currency(activeRow.basePayout + payoutEditor.adjustmentAmount), sub: STATUS_LABELS[activeRow.payoutStatus] || activeRow.payoutStatus },
              ].map((card) => (
                <article key={card.label} className="metric-card panel-muted">
                  <p className="text-[10px] font-black uppercase tracking-[0.28em] text-[var(--text-muted)]">{card.label}</p>
                  <p className={`mt-3 text-3xl font-black tracking-[-0.05em] ${card.label === "Slutbelopp" && activeRow.basePayout + payoutEditor.adjustmentAmount < 0 ? "text-rose-200" : "text-[var(--text-primary)]"}`}>{card.value}</p>
                  <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">{card.sub}</p>
                </article>
              ))}
            </div>

            <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
              <div className="space-y-5">
                <div className="rounded-[24px] border border-[var(--border-subtle)] bg-[var(--panel-muted)] px-5 py-5">
                  <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[var(--text-muted)]">Förklaring</p>
                  <div className="mt-4 grid gap-3 text-sm">
                    {[
                      { label: "Bruttoförsäljning", value: currency(activeRow.grossSales) },
                      { label: "Provision", value: `- ${currency(activeRow.commission)}` },
                      { label: "Abonnemang", value: `- ${currency(activeRow.subscription)}` },
                      { label: "Manuell justering", value: payoutEditor.adjustmentAmount >= 0 ? `+ ${currency(payoutEditor.adjustmentAmount)}` : `- ${currency(Math.abs(payoutEditor.adjustmentAmount))}` },
                    ].map((item) => (
                      <div key={item.label} className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.02)] px-4 py-3">
                        <span className="text-[var(--text-secondary)]">{item.label}</span>
                        <span className="font-black text-[var(--text-primary)]">{item.value}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-[24px] border border-[var(--border-subtle)] bg-[var(--panel-muted)] px-5 py-5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[var(--text-muted)]">Period</p>
                      <p className="mt-1 text-lg font-black tracking-[-0.03em] text-[var(--text-primary)]">Daglig utveckling</p>
                    </div>
                    <span className="control-chip">{range.from} till {range.to}</span>
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
              </div>

              <div className="space-y-5">
                <div className="rounded-[24px] border border-[var(--border-subtle)] bg-[var(--panel-muted)] px-5 py-5">
                  <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[var(--text-muted)]">Payoutstatus</p>
                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    <label className="grid gap-2 text-[11px] font-bold text-[var(--text-secondary)]">
                      <span>Utbetalningsreferens</span>
                      <input value={payoutEditor.payoutReference} onChange={(event) => setPayoutEditor((previous) => ({ ...previous, payoutReference: event.target.value }))} className="control-input" placeholder="BG, bankref eller swish" />
                    </label>
                    <label className="grid gap-2 text-[11px] font-bold text-[var(--text-secondary)]">
                      <span>Manuell justering</span>
                      <input type="number" value={payoutEditor.adjustmentAmount} onChange={(event) => setPayoutEditor((previous) => ({ ...previous, adjustmentAmount: Number(event.target.value) }))} className="control-input" />
                    </label>
                    <label className="grid gap-2 text-[11px] font-bold text-[var(--text-secondary)] md:col-span-2">
                      <span>Intern notering</span>
                      <textarea value={payoutEditor.notes} onChange={(event) => setPayoutEditor((previous) => ({ ...previous, notes: event.target.value }))} className="control-input min-h-[140px] resize-none" placeholder="Exempel: bankkonto verifierat, väntar på underlag, avdrag för supportärende..." />
                    </label>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <button type="button" onClick={() => void savePayout("DRAFT")} disabled={payoutSaving} className="control-chip">
                      Spara utkast
                    </button>
                    <button type="button" onClick={() => void savePayout("APPROVED")} disabled={payoutSaving} className="control-chip text-emerald-100">
                      Godkänn
                    </button>
                    <button type="button" onClick={() => void savePayout("PAID")} disabled={payoutSaving} className="control-chip text-sky-100">
                      Markera betald
                    </button>
                    <button type="button" onClick={() => void savePayout("HOLD")} disabled={payoutSaving} className="control-chip text-rose-100">
                      Sätt på hold
                    </button>
                  </div>
                  {payoutError ? <p className="mt-3 text-sm text-rose-200">{payoutError}</p> : null}
                </div>

                <div className="rounded-[24px] border border-[var(--border-subtle)] bg-[var(--panel-muted)] px-5 py-5">
                  <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[var(--text-muted)]">Topp-produkter</p>
                  <div className="mt-4 grid gap-3">
                    {detail.topProducts.slice(0, 5).map((product) => (
                      <div key={product.name} className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.02)] px-4 py-3">
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
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
