/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useState, useCallback } from "react";
import axios from "axios";
import {
  Tag,
  Loader2,
  Plus,
  X,
  Copy,
  Trash2,
  Calendar,
  Users,
  Eye,
  EyeOff,
  Search,
  Filter,
} from "lucide-react";
import { API_URL } from "@/lib/api";
import { useToast } from "@/components/Toast";
import { motion, AnimatePresence } from "framer-motion";

interface Coupon {
  id: string;
  code: string;
  type: "PERCENTAGE" | "FIXED";
  value: number;
  minOrder: number;
  maxUses: number | null;
  usedCount: number;
  active: boolean;
  expiresAt: string | null;
  createdAt: string;
}

export default function CouponsPage() {
  const { success, error: toastError } = useToast();
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "expired">("all");
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    code: "",
    type: "PERCENTAGE" as "PERCENTAGE" | "FIXED",
    value: 10,
    minOrder: 0,
    maxUses: 0,
    expiresAt: "",
  });

  const token = () =>
    typeof window !== "undefined" ? localStorage.getItem("matgo_token") || "" : "";

  const fetchCoupons = useCallback(async () => {
    try {
      const res = await axios.get(`${API_URL}/api/admin/coupons`, {
        headers: { Authorization: `Bearer ${token()}` },
      });
      setCoupons(res.data || []);
    } catch {
      // API might not exist yet – show empty state
      setCoupons([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCoupons();
  }, [fetchCoupons]);

  const handleCreate = async () => {
    if (!form.code.trim()) {
      toastError("Ange en rabattkod");
      return;
    }
    setCreating(true);
    try {
      await axios.post(
        `${API_URL}/api/admin/coupons`,
        {
          ...form,
          maxUses: form.maxUses || null,
          expiresAt: form.expiresAt || null,
        },
        { headers: { Authorization: `Bearer ${token()}` } }
      );
      success("Rabattkod skapad!");
      setForm({ code: "", type: "PERCENTAGE", value: 10, minOrder: 0, maxUses: 0, expiresAt: "" });
      setShowCreate(false);
      fetchCoupons();
    } catch (err: any) {
      toastError(err.response?.data?.error || "Kunde inte skapa rabattkod");
    } finally {
      setCreating(false);
    }
  };

  const toggleCoupon = async (id: string, active: boolean) => {
    try {
      await axios.patch(
        `${API_URL}/api/admin/coupons/${id}`,
        { active: !active },
        { headers: { Authorization: `Bearer ${token()}` } }
      );
      setCoupons((prev) =>
        prev.map((c) => (c.id === id ? { ...c, active: !active } : c))
      );
      success(active ? "Rabattkod inaktiverad" : "Rabattkod aktiverad");
    } catch {
      toastError("Kunde inte uppdatera");
    }
  };

  const deleteCoupon = async (id: string) => {
    if (!confirm("Radera rabattkoden?")) return;
    try {
      await axios.delete(`${API_URL}/api/admin/coupons/${id}`, {
        headers: { Authorization: `Bearer ${token()}` },
      });
      setCoupons((prev) => prev.filter((c) => c.id !== id));
      success("Rabattkod raderad");
    } catch {
      toastError("Kunde inte radera");
    }
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    success(`"${code}" kopierad!`);
  };

  const generateCode = () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "MG-";
    for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
    setForm((prev) => ({ ...prev, code }));
  };

  const filtered = coupons.filter((c) => {
    if (search && !c.code.toLowerCase().includes(search.toLowerCase())) return false;
    if (filter === "active" && !c.active) return false;
    if (filter === "expired") {
      const isExpired = c.expiresAt && new Date(c.expiresAt) < new Date();
      if (!isExpired && c.active) return false;
    }
    return true;
  });

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-40 gap-4">
        <Loader2 className="animate-spin text-gold-500" size={32} />
        <p className="text-[9px] font-black uppercase tracking-widest text-[var(--text-secondary)] animate-pulse">
          Laddar rabattkoder…
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-24">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black uppercase tracking-tight text-[var(--text-primary)]">
            Rabattkoder
          </h1>
          <p className="text-[var(--text-secondary)] text-[10px] font-bold uppercase tracking-widest mt-1">
            Hantera kampanjkoder & erbjudanden
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-5 py-3 bg-gold-gradient text-[#0d0d0d] rounded-xl font-black text-[10px] uppercase tracking-widest hover:opacity-90 transition-all glow-gold-sm"
        >
          <Plus size={14} /> Ny Rabattkod
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1 relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Sök rabattkod…"
            className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-subtle)] text-[11px] font-bold text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] outline-none focus:border-gold-500/30"
          />
        </div>
        <div className="flex gap-1 p-1 bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-xl">
          {(["all", "active", "expired"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-2 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all ${
                filter === f
                  ? "bg-gold-500 text-[#0d0d0d]"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              {f === "all" ? "Alla" : f === "active" ? "Aktiva" : "Utgångna"}
            </button>
          ))}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Totalt", value: coupons.length, color: "text-[var(--text-primary)]" },
          { label: "Aktiva", value: coupons.filter((c) => c.active).length, color: "text-emerald-400" },
          { label: "Använda", value: coupons.reduce((s, c) => s + c.usedCount, 0), color: "text-blue-400" },
          {
            label: "Utgångna",
            value: coupons.filter((c) => c.expiresAt && new Date(c.expiresAt) < new Date()).length,
            color: "text-rose-400",
          },
        ].map((s) => (
          <div
            key={s.label}
            className="p-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)]"
          >
            <div className="text-[8px] font-black uppercase tracking-widest text-[var(--text-secondary)] mb-1">
              {s.label}
            </div>
            <div className={`text-2xl font-black ${s.color}`}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Coupons list */}
      <div className="space-y-2">
        {filtered.length === 0 ? (
          <div className="py-20 text-center">
            <Tag size={40} className="mx-auto mb-4 text-[var(--text-secondary)] opacity-20" />
            <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-secondary)] opacity-40">
              {search ? "Inga rabattkoder matchade sökningen" : "Inga rabattkoder ännu"}
            </p>
          </div>
        ) : (
          filtered.map((coupon) => {
            const isExpired = coupon.expiresAt && new Date(coupon.expiresAt) < new Date();
            return (
              <div
                key={coupon.id}
                className={`p-4 rounded-2xl border bg-[var(--bg-secondary)] flex items-center gap-4 transition-all ${
                  !coupon.active || isExpired
                    ? "border-[var(--border-subtle)] opacity-50"
                    : "border-[var(--border-subtle)] hover:border-gold-500/15"
                }`}
              >
                <div className="w-10 h-10 rounded-xl bg-gold-500/10 flex items-center justify-center shrink-0">
                  <Tag size={16} className="text-gold-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[12px] font-black uppercase tracking-wider text-[var(--text-primary)]">
                      {coupon.code}
                    </span>
                    <button onClick={() => copyCode(coupon.code)} className="text-[var(--text-secondary)] hover:text-gold-500">
                      <Copy size={12} />
                    </button>
                    {coupon.active && !isExpired ? (
                      <span className="px-1.5 py-0.5 rounded text-[7px] font-black bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 uppercase">
                        Aktiv
                      </span>
                    ) : (
                      <span className="px-1.5 py-0.5 rounded text-[7px] font-black bg-rose-500/10 text-rose-400 border border-rose-500/20 uppercase">
                        {isExpired ? "Utgången" : "Inaktiv"}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-[9px] font-bold text-[var(--text-secondary)]">
                    <span>
                      {coupon.type === "PERCENTAGE" ? `${coupon.value}%` : `${coupon.value} kr`} rabatt
                    </span>
                    {coupon.minOrder > 0 && <span>Min: {coupon.minOrder} kr</span>}
                    <span className="flex items-center gap-1">
                      <Users size={10} /> {coupon.usedCount}{coupon.maxUses ? `/${coupon.maxUses}` : ""} användningar
                    </span>
                    {coupon.expiresAt && (
                      <span className="flex items-center gap-1">
                        <Calendar size={10} /> {new Date(coupon.expiresAt).toLocaleDateString("sv-SE")}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => toggleCoupon(coupon.id, coupon.active)}
                    className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${
                      coupon.active ? "text-emerald-400 hover:bg-emerald-500/10" : "text-[var(--text-secondary)] hover:bg-white/[0.04]"
                    }`}
                  >
                    {coupon.active ? <Eye size={14} /> : <EyeOff size={14} />}
                  </button>
                  <button
                    onClick={() => deleteCoupon(coupon.id)}
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-rose-400/50 hover:text-rose-400 hover:bg-rose-500/10 transition-all"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Create modal */}
      <AnimatePresence>
        {showCreate && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 cmd-overlay"
            onClick={() => setShowCreate(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              className="w-full max-w-md rounded-2xl p-6 border border-[var(--border-subtle)] shadow-2xl"
              style={{ background: "var(--bg-secondary)" }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-[12px] font-black uppercase tracking-widest text-[var(--text-primary)]">
                  Ny Rabattkod
                </h2>
                <button onClick={() => setShowCreate(false)} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
                  <X size={18} />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-[9px] font-black uppercase tracking-widest text-[var(--text-secondary)] mb-2">
                    Kod
                  </label>
                  <div className="flex gap-2">
                    <input
                      value={form.code}
                      onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                      placeholder="SOMMAR2026"
                      className="flex-1 bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-xl px-3 py-2.5 text-[11px] font-black text-[var(--text-primary)] uppercase outline-none focus:border-gold-500/30"
                    />
                    <button
                      onClick={generateCode}
                      className="px-3 py-2 rounded-xl border border-[var(--border-subtle)] text-[8px] font-black uppercase text-gold-500 hover:bg-gold-500/5 transition-all"
                    >
                      Generera
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[9px] font-black uppercase tracking-widest text-[var(--text-secondary)] mb-2">
                      Typ
                    </label>
                    <select
                      value={form.type}
                      onChange={(e) => setForm({ ...form, type: e.target.value as any })}
                      className="w-full bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-xl px-3 py-2.5 text-[10px] font-bold text-[var(--text-primary)] outline-none"
                    >
                      <option value="PERCENTAGE">Procent (%)</option>
                      <option value="FIXED">Fast belopp (kr)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[9px] font-black uppercase tracking-widest text-[var(--text-secondary)] mb-2">
                      Värde
                    </label>
                    <input
                      type="number"
                      value={form.value}
                      onChange={(e) => setForm({ ...form, value: parseFloat(e.target.value) || 0 })}
                      className="w-full bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-xl px-3 py-2.5 text-[11px] font-bold text-[var(--text-primary)] outline-none focus:border-gold-500/30"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[9px] font-black uppercase tracking-widest text-[var(--text-secondary)] mb-2">
                      Min. order (kr)
                    </label>
                    <input
                      type="number"
                      value={form.minOrder}
                      onChange={(e) => setForm({ ...form, minOrder: parseFloat(e.target.value) || 0 })}
                      className="w-full bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-xl px-3 py-2.5 text-[11px] font-bold text-[var(--text-primary)] outline-none focus:border-gold-500/30"
                    />
                  </div>
                  <div>
                    <label className="block text-[9px] font-black uppercase tracking-widest text-[var(--text-secondary)] mb-2">
                      Max användningar
                    </label>
                    <input
                      type="number"
                      value={form.maxUses}
                      onChange={(e) => setForm({ ...form, maxUses: parseInt(e.target.value) || 0 })}
                      placeholder="0 = obegränsat"
                      className="w-full bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-xl px-3 py-2.5 text-[11px] font-bold text-[var(--text-primary)] outline-none focus:border-gold-500/30"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[9px] font-black uppercase tracking-widest text-[var(--text-secondary)] mb-2">
                    Utgångsdatum (valfritt)
                  </label>
                  <input
                    type="date"
                    value={form.expiresAt}
                    onChange={(e) => setForm({ ...form, expiresAt: e.target.value })}
                    className="w-full bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-xl px-3 py-2.5 text-[11px] font-bold text-[var(--text-primary)] outline-none focus:border-gold-500/30"
                  />
                </div>
              </div>

              <button
                onClick={handleCreate}
                disabled={creating}
                className="w-full mt-6 flex items-center justify-center gap-2 px-5 py-3 bg-gold-gradient text-[#0d0d0d] rounded-xl font-black text-[10px] uppercase tracking-widest disabled:opacity-50 glow-gold-sm"
              >
                {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                Skapa Rabattkod
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
