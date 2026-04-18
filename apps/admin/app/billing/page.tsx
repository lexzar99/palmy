"use client";

import { useEffect, useState, useMemo } from "react";
import axios from "axios";
import {
  Crown, Medal, Award, Calculator, Download, Loader2,
  TrendingUp, ShoppingCart, CreditCard, RefreshCw, ChevronDown,
  FileText, Calendar, Settings, Store, Check, Search,
  Clock, CheckCircle, XCircle, Banknote, Plus, Minus, Edit2,
  Trash2, Send, DollarSign, ArrowUpRight,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { API_URL } from "@/lib/api";
import { useToast } from "@/components/Toast";
import { Modal, ConfirmModal } from "@/components/Modal";

const LS_KEY = "matgo_billing_config";

interface TierConfig {
  subscriptionFee: number;
  commissionPct: number;
}

interface BillingConfig {
  gold: TierConfig;
  silver: TierConfig;
  standard: TierConfig;
}

interface PayoutAdjustment {
  id: string;
  type: "discount" | "extra_service" | "product";
  label: string;
  amount: number;
}

interface RestaurantPayout {
  restaurant: any;
  period: { from: string; to: string };
  totalSales: number;
  totalOrders: number;
  commission: number;
  subscription: number;
  adjustments: PayoutAdjustment[];
  finalPayout: number;
  status: "pending" | "approved" | "paid";
  bankInfo?: {
    bankName: string;
    accountNumber: string;
    clearingNumber: string;
    giro?: string;
  };
  notes?: string;
}

const DEFAULT_CONFIG: BillingConfig = {
  gold:     { subscriptionFee: 1990, commissionPct: 8  },
  silver:   { subscriptionFee: 990,  commissionPct: 10 },
  standard: { subscriptionFee: 490,  commissionPct: 12 },
};

const TIER_META: Record<number, { label: string; key: keyof BillingConfig; icon: any }> = {
  1: { label: "Guld", key: "gold", icon: Crown },
  2: { label: "Silver", key: "silver", icon: Medal },
  3: { label: "Standard", key: "standard", icon: Award },
};

const kr = (n: number) => `${n.toLocaleString("sv-SE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kr`;

const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n: number) => {
  const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10);
};
const startOfMonth = () => { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10); };
const startOfLastMonth = () => {
  const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1); return d.toISOString().slice(0, 10);
};
const endOfLastMonth = () => {
  const d = new Date(); d.setDate(0); return d.toISOString().slice(0, 10);
};

const PERIODS = [
  { label: "Denna månad", from: startOfMonth(), to: today() },
  { label: "Förra månaden", from: startOfLastMonth(), to: endOfLastMonth() },
  { label: "Senaste 30 dagar", from: daysAgo(30), to: today() },
];

export default function BillingPage() {
  const { success, error: toastError } = useToast();
  const [restaurants, setRestaurants] = useState<any[]>([]);
  const [payouts, setPayouts] = useState<Record<string, RestaurantPayout>>({});
  const [loading, setLoading] = useState(false);
  const [selectedPeriodIndex, setSelectedPeriodIndex] = useState(0);
  const [config, setConfig] = useState<BillingConfig>(DEFAULT_CONFIG);
  const [showConfig, setShowConfig] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedRestaurant, setSelectedRestaurant] = useState<string | null>(null);
  const [showBankModal, setShowBankModal] = useState(false);
  const [showPayoutModal, setShowPayoutModal] = useState(false);
  
  const period = PERIODS[selectedPeriodIndex];
  const token = () => localStorage.getItem("matgo_token") || "";

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) setConfig({ ...DEFAULT_CONFIG, ...JSON.parse(raw) });
    } catch {}
  }, []);

  useEffect(() => {
    axios.get(`${API_URL}/api/restaurants`).then((r) => setRestaurants(r.data)).catch(() => {});
  }, []);

  const fetchPayouts = async () => {
    if (restaurants.length === 0) return;
    setLoading(true);
    try {
      const results = await Promise.allSettled(
        restaurants.map((r) =>
          axios.get(`${API_URL}/api/admin/reports/restaurant/${r.id}`, {
            params: { from: period.from, to: period.to },
            headers: { Authorization: `Bearer ${token()}` },
          })
        )
      );
      const map: Record<string, RestaurantPayout> = {};
      results.forEach((res, i) => {
        if (res.status === "fulfilled") {
          const r = restaurants[i];
          const report = res.value.data;
          const tierKey = TIER_META[r.featuredClass ?? 3]?.key ?? "standard";
          const tierCfg = config[tierKey];
          const sales = report?.summary?.totalRevenue ?? 0;
          const orders = report?.summary?.totalOrders ?? 0;
          const periodDays = Math.max(1, Math.round(
            (new Date(period.to).getTime() - new Date(period.from).getTime()) / (1000 * 60 * 60 * 24)
          ));
          const subscription = (tierCfg.subscriptionFee / 30) * periodDays;
          const commission = (sales * tierCfg.commissionPct) / 100;
          
          map[r.id] = {
            restaurant: r,
            period,
            totalSales: sales,
            totalOrders: orders,
            commission,
            subscription,
            adjustments: [],
            finalPayout: sales - commission - subscription,
            status: "pending",
          };
        }
      });
      setPayouts(map);
    } catch {
      toastError("Kunde inte hämta data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (restaurants.length > 0) fetchPayouts();
  }, [restaurants, period.from, period.to]);

  const saveConfig = () => {
    localStorage.setItem(LS_KEY, JSON.stringify(config));
    setShowConfig(false);
  };

  const filteredPayouts = useMemo(() => {
    return Object.values(payouts).filter((p) => 
      p.restaurant.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [payouts, searchTerm]);

  const totals = useMemo(() => ({
    sales: filteredPayouts.reduce((s, p) => s + p.totalSales, 0),
    orders: filteredPayouts.reduce((s, p) => s + p.totalOrders, 0),
    commission: filteredPayouts.reduce((s, p) => s + p.commission, 0),
    subscription: filteredPayouts.reduce((s, p) => s + p.subscription, 0),
    adjustments: filteredPayouts.reduce((s, p) => s + p.adjustments.reduce((a, adj) => a + adj.amount, 0), 0),
    payout: filteredPayouts.reduce((s, p) => s + p.finalPayout, 0),
  }), [filteredPayouts]);

  const updateAdjustment = (restaurantId: string, adjustments: PayoutAdjustment[]) => {
    const existing = payouts[restaurantId];
    if (!existing) return;
    
    const adjustmentTotal = adjustments.reduce((s, a) => s + a.amount, 0);
    const newPayout = existing.totalSales - existing.commission - existing.subscription + adjustmentTotal;
    
    setPayouts((prev) => ({
      ...prev,
      [restaurantId]: {
        ...existing,
        adjustments,
        finalPayout: newPayout,
      },
    }));
  };

  const saveBankInfo = (restaurantId: string, bankInfo: RestaurantPayout["bankInfo"]) => {
    const existing = payouts[restaurantId];
    if (!existing) return;
    setPayouts((prev) => ({
      ...prev,
      [restaurantId]: { ...existing, bankInfo },
    }));
    setShowBankModal(false);
    success("Bankuppgifter sparade");
  };

  const approvePayout = (restaurantId: string) => {
    const existing = payouts[restaurantId];
    if (!existing) return;
    setPayouts((prev) => ({
      ...prev,
      [restaurantId]: { ...existing, status: "approved" },
    }));
    success("Utbetalning godkänd");
  };

  const markAsPaid = (restaurantId: string) => {
    const existing = payouts[restaurantId];
    if (!existing) return;
    setPayouts((prev) => ({
      ...prev,
      [restaurantId]: { ...existing, status: "paid" },
    }));
    success("Utbetalning markerad som betald");
  };

  const inputCls = "bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-xl px-4 py-2.5 text-sm font-bold outline-none focus:border-gold-500/30 w-full";

  return (
    <div className="space-y-5 pb-24">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black uppercase tracking-tight text-[var(--text-primary)] flex items-center gap-3">
            <DollarSign size={22} className="text-gold-500" /> Utbetalningshantering
          </h1>
          <p className="text-[var(--text-secondary)] text-[10px] font-bold uppercase tracking-widest mt-0.5">
            Hantera restaurangers försäljning, avgifter och utbetalningar per period
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchPayouts} disabled={loading}
            className="w-9 h-9 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all">
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          </button>
          <button onClick={() => setShowConfig(!showConfig)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border transition-all text-[10px] font-black uppercase ${showConfig ? "bg-gold-500/10 border-gold-500/30 text-gold-500" : "border-[var(--border-subtle)] bg-[var(--bg-secondary)] text-[var(--text-secondary)]"}`}>
            <Settings size={13} /> Avgiftsmodell
          </button>
        </div>
      </div>

      {/* Config Panel */}
      {showConfig && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
          className="p-5 rounded-2xl border border-gold-500/20 bg-gold-500/5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[11px] font-black uppercase tracking-widest text-gold-500">Avgiftsmodell per Tier</h2>
            <button onClick={saveConfig}
              className="flex items-center gap-1.5 px-4 py-2 bg-gold-500 text-[#0d0d0d] rounded-xl text-[10px] font-black uppercase">
              <Check size={12} /> Spara
            </button>
          </div>
          <div className="grid grid-cols-3 gap-4">
            {([
              { key: "gold" as const, label: "Guld", color: "text-gold-500" },
              { key: "silver" as const, label: "Silver", color: "text-blue-400" },
              { key: "standard" as const, label: "Standard", color: "text-[var(--text-secondary)]" },
            ]).map(({ key, label, color }) => (
              <div key={key} className="space-y-3">
                <p className={`text-[10px] font-black uppercase tracking-widest ${color}`}>{label}</p>
                <div>
                  <label className="text-[10px] font-black uppercase text-[var(--text-secondary)] block mb-1">Månadsavgift (kr)</label>
                  <input type="number" className={inputCls} value={config[key].subscriptionFee}
                    onChange={(e) => setConfig((p) => ({ ...p, [key]: { ...p[key], subscriptionFee: Number(e.target.value) } }))} />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase text-[var(--text-secondary)] block mb-1">Provision (%)</label>
                  <input type="number" className={inputCls} value={config[key].commissionPct} step={0.1}
                    onChange={(e) => setConfig((p) => ({ ...p, [key]: { ...p[key], commissionPct: Number(e.target.value) } }))} />
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Period selector */}
      <div className="flex flex-wrap items-center gap-2">
        <Calendar size={14} className="text-[var(--text-secondary)]" />
        <div className="flex flex-wrap gap-1 p-1 bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-xl">
          {PERIODS.map((p, i) => (
            <button key={p.label} onClick={() => setSelectedPeriodIndex(i)}
              className={`px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${selectedPeriodIndex === i ? "bg-gold-500 text-[#0d0d0d]" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"}`}>
              {p.label}
            </button>
          ))}
        </div>
        <span className="text-[10px] font-black text-[var(--text-secondary)]">
          {period.from} → {period.to}
        </span>
      </div>

      {/* Search */}
      <div className="relative flex-1">
        <Search size={13} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" />
        <input 
          value={searchTerm} 
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Sök restaurang..."
          className="w-full bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-xl pl-9 pr-4 py-2.5 text-[11px] font-bold outline-none focus:border-gold-500/30 transition-all"
        />
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-3">
        {[
          { label: "Total försäljning", value: kr(totals.sales), icon: TrendingUp, color: "text-[var(--text-primary)]" },
          { label: "Ordrar", value: totals.orders.toString(), icon: ShoppingCart, color: "text-blue-400" },
          { label: "Provision", value: kr(totals.commission), icon: Calculator, color: "text-gold-500" },
          { label: "Avgift", value: kr(totals.subscription), icon: Calendar, color: "text-purple-400" },
          { label: "Justeringar", value: kr(totals.adjustments), icon: Plus, color: "text-emerald-400" },
          { label: "Att betala", value: kr(totals.payout), icon: ArrowUpRight, color: "text-emerald-400", highlight: true },
        ].map((kpi) => (
          <div key={kpi.label} 
            className={`p-4 rounded-2xl border transition-all ${kpi.highlight ? "bg-emerald-500/10 border-emerald-500/30" : "bg-[var(--bg-secondary)] border-[var(--border-subtle)]"}`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-black uppercase tracking-widest text-[var(--text-secondary)]">{kpi.label}</span>
              <kpi.icon size={12} className={kpi.color} />
            </div>
            <p className={`text-lg font-black ${kpi.color}`}>{kpi.value}</p>
          </div>
        ))}
      </div>

      {/* Payout Table */}
      {loading ? (
        <div className="flex items-center justify-center py-16 gap-3">
          <Loader2 className="animate-spin text-gold-500" size={24} />
          <span className="text-[10px] font-black uppercase tracking-widest text-[var(--text-secondary)]">Laddar...</span>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-[var(--border-subtle)]">
          <table className="w-full text-[10px] font-bold">
            <thead>
              <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-secondary)]">
                <th className="px-4 py-3 text-left text-[10px] font-black uppercase text-[var(--text-secondary)]">Restaurang</th>
                <th className="px-4 py-3 text-right text-[10px] font-black uppercase text-[var(--text-secondary)]">Försäljning</th>
                <th className="px-4 py-3 text-right text-[10px] font-black uppercase text-[var(--text-secondary)]">Provision</th>
                <th className="px-4 py-3 text-right text-[10px] font-black uppercase text-[var(--text-secondary)]">Avgift</th>
                <th className="px-4 py-3 text-right text-[10px] font-black uppercase text-[var(--text-secondary)]">Justering</th>
                <th className="px-4 py-3 text-right text-[10px] font-black uppercase text-[var(--text-secondary)]">Att betala</th>
                <th className="px-4 py-3 text-center text-[10px] font-black uppercase text-[var(--text-secondary)]">Status</th>
                <th className="px-4 py-3 text-center text-[10px] font-black uppercase text-[var(--text-secondary)]">Åtgärder</th>
              </tr>
            </thead>
            <tbody>
              {filteredPayouts.map((p) => {
                const adjustmentTotal = p.adjustments.reduce((s, a) => s + a.amount, 0);
                return (
                  <tr key={p.restaurant.id} className="border-b border-[var(--border-subtle)] hover:bg-[var(--bg-secondary)] transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Store size={13} className="text-[var(--text-secondary)]" />
                        <div>
                          <p className="font-black text-[var(--text-primary)]">{p.restaurant.name}</p>
                          <p className="text-[10px] text-[var(--text-secondary)]">{p.restaurant.city || "—"}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-black text-[var(--text-primary)]">{kr(p.totalSales)}</td>
                    <td className="px-4 py-3 text-right text-gold-500">-{kr(p.commission)}</td>
                    <td className="px-4 py-3 text-right text-purple-400">-{kr(p.subscription)}</td>
                    <td className="px-4 py-3 text-right text-emerald-400">{adjustmentTotal !== 0 ? `+${kr(adjustmentTotal)}` : "—"}</td>
                    <td className="px-4 py-3 text-right font-black text-emerald-400">{kr(p.finalPayout)}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-black uppercase w-fit ${
                        p.status === "paid" ? "bg-emerald-500/10 text-emerald-400" :
                        p.status === "approved" ? "bg-blue-500/10 text-blue-400" :
                        "bg-amber-500/10 text-amber-400"
                      }`}>
                        {p.status === "paid" && <CheckCircle size={10} />}
                        {p.status === "approved" && <Clock size={10} />}
                        {p.status === "pending" && <Clock size={10} />}
                        {p.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => { setSelectedRestaurant(p.restaurant.id); setShowPayoutModal(true); }}
                          className="p-2 rounded-lg hover:bg-[var(--bg-primary)] text-[var(--text-secondary)] hover:text-gold-500" title="Justera">
                          <Edit2 size={12} />
                        </button>
                        <button onClick={() => { setSelectedRestaurant(p.restaurant.id); setShowBankModal(true); }}
                          className="p-2 rounded-lg hover:bg-[var(--bg-primary)] text-[var(--text-secondary)] hover:text-gold-500" title="Bankuppgifter">
                          <Banknote size={12} />
                        </button>
                        {p.status === "pending" && (
                          <button onClick={() => approvePayout(p.restaurant.id)}
                            className="p-2 rounded-lg hover:bg-emerald-500/10 text-[var(--text-secondary)] hover:text-emerald-400" title="Godkänn">
                            <Check size={12} />
                          </button>
                        )}
                        {p.status === "approved" && (
                          <button onClick={() => markAsPaid(p.restaurant.id)}
                            className="p-2 rounded-lg hover:bg-blue-500/10 text-[var(--text-secondary)] hover:text-blue-400" title="Markera betald">
                            <Send size={12} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              <tr className="bg-gold-500/5 border-t-2 border-gold-500/20">
                <td className="px-4 py-3 font-black text-[var(--text-primary)] uppercase">TOTALT</td>
                <td className="px-4 py-3 text-right font-black text-[var(--text-primary)]">{kr(totals.sales)}</td>
                <td className="px-4 py-3 text-right font-black text-gold-500">-{kr(totals.commission)}</td>
                <td className="px-4 py-3 text-right font-black text-purple-400">-{kr(totals.subscription)}</td>
                <td className="px-4 py-3 text-right font-black text-emerald-400">+{kr(totals.adjustments)}</td>
                <td className="px-4 py-3 text-right font-black text-emerald-400">{kr(totals.payout)}</td>
                <td colSpan={2}></td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Bank Modal */}
      <Modal open={showBankModal} onClose={() => setShowBankModal(false)} title="Bankuppgifter">
        {selectedRestaurant && payouts[selectedRestaurant] && (
          <BankInfoForm 
            restaurant={payouts[selectedRestaurant].restaurant} 
            initialData={payouts[selectedRestaurant].bankInfo}
            onSave={(data) => saveBankInfo(selectedRestaurant, data)}
            onCancel={() => setShowBankModal(false)}
          />
        )}
      </Modal>

      {/* Adjustment Modal */}
      <Modal open={showPayoutModal} onClose={() => setShowPayoutModal(false)} title="Justera utbetalning">
        {selectedRestaurant && payouts[selectedRestaurant] && (
          <AdjustmentForm 
            restaurant={payouts[selectedRestaurant].restaurant}
            initialAdjustments={payouts[selectedRestaurant].adjustments}
            onSave={(adjustments) => {
              updateAdjustment(selectedRestaurant, adjustments);
              setShowPayoutModal(false);
              success("Justering sparad");
            }}
            onCancel={() => setShowPayoutModal(false)}
          />
        )}
      </Modal>
    </div>
  );
}

function BankInfoForm({ restaurant, initialData, onSave, onCancel }: {
  restaurant: any;
  initialData?: RestaurantPayout["bankInfo"];
  onSave: (data: RestaurantPayout["bankInfo"]) => void;
  onCancel: () => void;
}) {
  const [bankName, setBankName] = useState(initialData?.bankName || "");
  const [accountNumber, setAccountNumber] = useState(initialData?.accountNumber || "");
  const [clearingNumber, setClearingNumber] = useState(initialData?.clearingNumber || "");
  const [giro, setGiro] = useState(initialData?.giro || "");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({ bankName, accountNumber, clearingNumber, giro });
  };

  const inputCls = "bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-xl px-4 py-3 text-sm font-bold outline-none focus:border-gold-500/30 w-full";

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="text-[10px] font-black uppercase text-[var(--text-secondary)] block mb-1">Bank</label>
        <input value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="t.ex. Swedbank, SEB" className={inputCls} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[10px] font-black uppercase text-[var(--text-secondary)] block mb-1">Clearingnr</label>
          <input value={clearingNumber} onChange={(e) => setClearingNumber(e.target.value)} placeholder="t.ex. 8300" className={inputCls} />
        </div>
        <div>
          <label className="text-[10px] font-black uppercase text-[var(--text-secondary)] block mb-1">Kontonr</label>
          <input value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} placeholder="t.ex. 1234567890" className={inputCls} />
        </div>
      </div>
      <div>
        <label className="text-[10px] font-black uppercase text-[var(--text-secondary)] block mb-1">BankGiro (valfritt)</label>
        <input value={giro} onChange={(e) => setGiro(e.target.value)} placeholder="t.ex. 5050-1234" className={inputCls} />
      </div>
      <div className="flex gap-2 pt-4">
        <button type="button" onClick={onCancel} className="flex-1 py-3 border border-[var(--border-subtle)] rounded-xl font-black uppercase">Avbryt</button>
        <button type="submit" className="flex-1 py-3 bg-gold-500 text-[#0d0d0d] rounded-xl font-black uppercase">Spara</button>
      </div>
    </form>
  );
}

function AdjustmentForm({ restaurant, initialAdjustments, onSave, onCancel }: {
  restaurant: any;
  initialAdjustments: PayoutAdjustment[];
  onSave: (adjustments: PayoutAdjustment[]) => void;
  onCancel: () => void;
}) {
  const [adjustments, setAdjustments] = useState<PayoutAdjustment[]>(
    initialAdjustments.length > 0 ? initialAdjustments : [{ id: crypto.randomUUID(), type: "discount", label: "", amount: 0 }]
  );

  const addAdjustment = () => {
    setAdjustments([...adjustments, { id: crypto.randomUUID(), type: "discount", label: "", amount: 0 }]);
  };

  const removeAdjustment = (id: string) => {
    setAdjustments(adjustments.filter((a) => a.id !== id));
  };

  const updateAdjustment = (id: string, field: keyof PayoutAdjustment, value: any) => {
    setAdjustments(adjustments.map((a) => a.id === id ? { ...a, [field]: value } : a));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const filtered = adjustments.filter((a) => a.label && a.amount !== 0);
    onSave(filtered);
  };

  const inputCls = "bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-xl px-4 py-3 text-sm font-bold outline-none focus:border-gold-500/30 w-full";
  const selectCls = "bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-xl px-4 py-3 text-sm font-bold outline-none focus:border-gold-500/30";

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-[10px] text-[var(--text-secondary)]">{restaurant.name}</p>
      
      {adjustments.map((adj, idx) => (
        <div key={adj.id} className="flex gap-2 items-start">
          <select 
            value={adj.type} 
            onChange={(e) => updateAdjustment(adj.id, "type", e.target.value)}
            className={selectCls}>
            <option value="discount">Rabatt</option>
            <option value="extra_service">Extra tjänst</option>
            <option value="product">Extra produkt</option>
          </select>
          <input 
            value={adj.label} 
            onChange={(e) => updateAdjustment(adj.id, "label", e.target.value)}
            placeholder="Beskrivning"
            className="flex-1 bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-xl px-4 py-3 text-sm font-bold outline-none focus:border-gold-500/30"
          />
          <input 
            type="number"
            value={adj.amount} 
            onChange={(e) => updateAdjustment(adj.id, "amount", Number(e.target.value))}
            placeholder="Belopp"
            className="w-28 bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-xl px-4 py-3 text-sm font-bold outline-none focus:border-gold-500/30"
          />
          <button type="button" onClick={() => removeAdjustment(adj.id)} className="p-3 text-red-400 hover:text-red-300">
            <Trash2 size={14} />
          </button>
        </div>
      ))}

      <button type="button" onClick={addAdjustment} className="flex items-center gap-2 text-gold-500 text-[10px] font-black uppercase">
        <Plus size={12} /> Lägg till justering
      </button>

      <div className="flex gap-2 pt-4">
        <button type="button" onClick={onCancel} className="flex-1 py-3 border border-[var(--border-subtle)] rounded-xl font-black uppercase">Avbryt</button>
        <button type="submit" className="flex-1 py-3 bg-gold-500 text-[#0d0d0d] rounded-xl font-black uppercase">Spara</button>
      </div>
    </form>
  );
}