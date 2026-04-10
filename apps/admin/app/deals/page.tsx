/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import {
  Tag,
  Plus,
  Store,
  Users,
  CheckCircle2,
  XCircle,
  Trash2,
  Edit2,
  Globe,
  Loader2,
  Search,
  Filter,
  Gift,
  Ticket,
  ChevronDown,
  ChevronRight,
  AlertCircle,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { API_URL } from "@/lib/api";
import { Modal, ConfirmModal } from "@/components/Modal";
import { useToast } from "@/components/Toast";

type DealCategory = "restaurant" | "customer";

export default function DealsPage() {
  const { success, error: toastError } = useToast();

  const [category, setCategory] = useState<DealCategory>("restaurant");
  const [deals, setDeals] = useState<any[]>([]);
  const [restaurants, setRestaurants] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  // Modals
  const [createModal, setCreateModal] = useState(false);
  const [editingDeal, setEditingDeal] = useState<any>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<any>(null);
  const [customerDealModal, setCustomerDealModal] = useState(false);

  const token = () => localStorage.getItem("matgo_token");

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [dealsRes, restaurantsRes, customersRes] = await Promise.allSettled([
        axios.get(`${API_URL}/api/admin/deals`, {
          headers: { Authorization: `Bearer ${token()}` },
        }),
        axios.get(`${API_URL}/api/restaurants`),
        axios.get(`${API_URL}/api/customers`, {
          headers: { Authorization: `Bearer ${token()}` },
        }),
      ]);

      if (dealsRes.status === "fulfilled") setDeals(dealsRes.value.data);
      if (restaurantsRes.status === "fulfilled") setRestaurants(restaurantsRes.value.data);
      if (customersRes.status === "fulfilled") setCustomers(customersRes.value.data);
    } catch {
      toastError("Kunde inte ladda data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, []);

  const toggleDealStatus = async (id: string, current: boolean) => {
    try {
      await axios.patch(`${API_URL}/api/admin/deals/${id}`, { isActive: !current }, {
        headers: { Authorization: `Bearer ${token()}` },
      });
      setDeals((prev) => prev.map((d) => d.id === id ? { ...d, isActive: !current } : d));
      success(!current ? "Deal aktiverad" : "Deal pausad");
    } catch {
      toastError("Kunde inte uppdatera deal");
    }
  };

  const deleteDeal = async (id: string) => {
    try {
      await axios.delete(`${API_URL}/api/admin/deals/${id}`, {
        headers: { Authorization: `Bearer ${token()}` },
      });
      setDeals((prev) => prev.filter((d) => d.id !== id));
      setDeleteConfirm(null);
      success("Deal raderad");
    } catch {
      toastError("Kunde inte radera deal");
    }
  };

  const saveDeal = async (data: any, isNew: boolean) => {
    try {
      if (isNew) {
        const res = await axios.post(`${API_URL}/api/admin/deals`, data, {
          headers: { Authorization: `Bearer ${token()}` },
        });
        setDeals((prev) => [res.data, ...prev]);
        success("Deal skapad!");
      } else {
        await axios.patch(`${API_URL}/api/admin/deals/${data.id}`, data, {
          headers: { Authorization: `Bearer ${token()}` },
        });
        setDeals((prev) => prev.map((d) => d.id === data.id ? { ...d, ...data } : d));
        success("Deal uppdaterad!");
      }
      setCreateModal(false);
      setEditingDeal(null);
      fetchAll();
    } catch {
      toastError("Kunde inte spara deal");
    }
  };

  const createCustomerDeal = async (data: any) => {
    try {
      await axios.post(`${API_URL}/api/customers/${data.customerId}/deals`, {
        title: data.title,
        code: data.code,
        discountType: data.discountType,
        discountValue: Number(data.discountValue),
        maxUsages: Number(data.maxUsages || 1),
        validUntil: data.validUntil || null,
      }, {
        headers: { Authorization: `Bearer ${token()}` },
      });
      success("Personlig deal skapad och skickad!");
      setCustomerDealModal(false);
    } catch (err: any) {
      toastError(err.response?.data?.error || "Kunde inte skapa personal deal");
    }
  };

  const filteredDeals = deals.filter((d) => {
    if (search) {
      const q = search.toLowerCase();
      return (d.title || "").toLowerCase().includes(q) || (d.description || "").toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <div className="space-y-6 pb-24">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black uppercase tracking-tight text-[var(--text-primary)]">
            Deals & Kampanjer
          </h1>
          <p className="text-[var(--text-secondary)] text-[10px] font-bold uppercase tracking-widest mt-1">
            Hantera erbjudanden för restauranger och kunder
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setCreateModal(true); setEditingDeal(null); }}
            className="flex items-center gap-2 px-4 py-2.5 bg-gold-500 hover:bg-gold-400 text-[#0d0d0d] font-black uppercase tracking-widest text-[10px] rounded-xl shadow-lg shadow-gold-500/20 transition-all active:scale-95"
          >
            <Plus size={14} /> Ny restaurang-deal
          </button>
          <button
            onClick={() => setCustomerDealModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-[var(--bg-secondary)] border border-[var(--border-subtle)] hover:border-gold-500/30 text-[var(--text-secondary)] hover:text-[var(--text-primary)] font-black uppercase tracking-widest text-[10px] rounded-xl transition-all"
          >
            <Users size={14} /> Personal deal
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Totalt deals", value: deals.length, color: "text-gold-500" },
          { label: "Aktiva", value: deals.filter((d) => d.isActive).length, color: "text-emerald-400" },
          { label: "Pausade", value: deals.filter((d) => !d.isActive).length, color: "text-rose-400" },
        ].map((s) => (
          <div key={s.label} className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)]">
            <div className="text-[9px] font-black uppercase tracking-widest text-[var(--text-secondary)] mb-1">{s.label}</div>
            <div className={`text-2xl font-black ${s.color}`}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Sök deals..."
          className="w-full bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-xl pl-9 pr-4 py-2.5 text-[11px] font-bold outline-none focus:border-gold-500/30 transition-all"
        />
      </div>

      {/* Deals list */}
      {loading ? (
        <div className="py-12 flex flex-col items-center gap-4">
          <Loader2 className="animate-spin text-gold-500" size={32} />
          <p className="text-[9px] font-black uppercase tracking-widest text-[var(--text-secondary)] animate-pulse">
            Laddar deals...
          </p>
        </div>
      ) : filteredDeals.length === 0 ? (
        <div className="py-16 text-center rounded-2xl border border-dashed border-[var(--border-subtle)]">
          <Gift size={32} className="text-[var(--text-secondary)] opacity-20 mx-auto mb-3" />
          <p className="text-[9px] font-black uppercase tracking-widest text-[var(--text-secondary)] opacity-30">
            Inga deals hittades
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredDeals.map((deal) => (
            <motion.div
              key={deal.id}
              layout
              className="flex items-center gap-4 p-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] hover:border-gold-500/15 transition-all group"
            >
              {/* Status dot */}
              <div className={`w-2 h-2 rounded-full shrink-0 ${deal.isActive ? "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.6)]" : "bg-[var(--text-secondary)] opacity-30"}`} />

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-black text-sm text-[var(--text-primary)] uppercase truncate">
                    {deal.title}
                  </span>
                  {deal.isGlobal && (
                    <span className="px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-400 text-[7px] font-black uppercase border border-sky-500/20">
                      Global
                    </span>
                  )}
                  {deal.restaurant && (
                    <span className="px-1.5 py-0.5 rounded bg-gold-500/10 text-gold-500 text-[7px] font-black uppercase border border-gold-500/20">
                      {deal.restaurant.name}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-0.5">
                  <span className="text-[9px] font-bold text-[var(--text-secondary)]">
                    {deal.discountValue}
                    {deal.discountType === "PERCENTAGE" ? "%" : " kr"} rabatt
                  </span>
                  {deal.minOrder > 0 && (
                    <span className="text-[9px] font-bold text-[var(--text-secondary)]">
                      · Min {deal.minOrder} kr
                    </span>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => toggleDealStatus(deal.id, deal.isActive)}
                  className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${
                    deal.isActive
                      ? "bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 border border-rose-500/20"
                      : "bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/20"
                  }`}
                >
                  {deal.isActive ? "Pausa" : "Aktivera"}
                </button>
                <button
                  onClick={() => setEditingDeal(deal)}
                  className="w-8 h-8 rounded-xl bg-[var(--bg-primary)] border border-[var(--border-subtle)] flex items-center justify-center text-[var(--text-secondary)] hover:text-gold-500 hover:border-gold-500/20 transition-all"
                >
                  <Edit2 size={13} />
                </button>
                <button
                  onClick={() => setDeleteConfirm(deal)}
                  className="w-8 h-8 rounded-xl bg-rose-500/5 border border-rose-500/10 flex items-center justify-center text-rose-400 hover:bg-rose-500/15 transition-all"
                >
                  <Trash2 size={13} />
                </button>
              </div>

              {/* Status badge (always visible) */}
              <span className={`text-[8px] font-black uppercase tracking-widest px-2 py-1 rounded-lg border shrink-0 ${
                deal.isActive
                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                  : "bg-[var(--border-subtle)] text-[var(--text-secondary)] border-[var(--border-subtle)]"
              }`}>
                {deal.isActive ? "Aktiv" : "Pausad"}
              </span>
            </motion.div>
          ))}
        </div>
      )}

      {/* Create/Edit Deal Modal */}
      <Modal
        open={createModal || !!editingDeal}
        onClose={() => { setCreateModal(false); setEditingDeal(null); }}
        title={editingDeal ? `Redigera: ${editingDeal.title}` : "Skapa ny deal"}
        maxWidth="max-w-2xl"
      >
        <DealForm
          initial={editingDeal}
          restaurants={restaurants}
          onSave={(data) => saveDeal({ ...data, ...(editingDeal ? { id: editingDeal.id } : {}) }, !editingDeal)}
          onCancel={() => { setCreateModal(false); setEditingDeal(null); }}
        />
      </Modal>

      {/* Personal deal for customer */}
      <Modal
        open={customerDealModal}
        onClose={() => setCustomerDealModal(false)}
        title="Skapa personlig deal för kund"
        maxWidth="max-w-lg"
      >
        <CustomerDealForm
          customers={customers}
          onSave={createCustomerDeal}
          onCancel={() => setCustomerDealModal(false)}
        />
      </Modal>

      {/* Delete confirm */}
      <ConfirmModal
        open={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        onConfirm={() => deleteConfirm && deleteDeal(deleteConfirm.id)}
        title="Radera deal"
        message={`Är du säker på att du vill radera "${deleteConfirm?.title}" permanent?`}
        confirmLabel="Radera"
        danger
      />
    </div>
  );
}

// ── Deal Form ────────────────────────────────────────────────────────────────
function DealForm({
  initial,
  restaurants,
  onSave,
  onCancel,
}: {
  initial?: any;
  restaurants: any[];
  onSave: (data: any) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    title: initial?.title || "",
    description: initial?.description || "",
    discountType: initial?.discountType || "PERCENTAGE",
    discountValue: initial?.discountValue || 10,
    minOrder: initial?.minOrder || 0,
    isGlobal: initial?.isGlobal ?? true,
    restaurantId: initial?.restaurantId || "",
    applicableRestaurantIds: initial?.applicableRestaurantIds || [],
    isActive: initial?.isActive ?? true,
    showOnSite: initial?.showOnSite ?? true,
    sortOrder: initial?.sortOrder || 0,
    maxUsages: initial?.maxUsages || "",
    validFrom: initial?.validFrom ? initial.validFrom.slice(0, 10) : "",
    validUntil: initial?.validUntil ? initial.validUntil.slice(0, 10) : "",
  });

  const toggleRestaurant = (id: string) => {
    const ids = form.applicableRestaurantIds as string[];
    const newIds = ids.includes(id) ? ids.filter((i) => i !== id) : [...ids, id];
    setForm({ ...form, applicableRestaurantIds: newIds, restaurantId: newIds.length === 1 ? newIds[0] : "" });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      ...form,
      discountValue: Number(form.discountValue),
      minOrder: Number(form.minOrder),
      sortOrder: Number(form.sortOrder),
      maxUsages: form.maxUsages ? Number(form.maxUsages) : null,
      validFrom: form.validFrom || null,
      validUntil: form.validUntil || null,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <label className="block text-[9px] font-black uppercase tracking-widest text-[var(--text-secondary)] mb-1.5">Titel</label>
          <input
            required
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="t.ex. 20% på hela menyn"
            className={inputCls}
          />
        </div>
        <div>
          <label className="block text-[9px] font-black uppercase tracking-widest text-[var(--text-secondary)] mb-1.5">Rabatt-typ</label>
          <select
            value={form.discountType}
            onChange={(e) => setForm({ ...form, discountType: e.target.value })}
            className={inputCls}
          >
            <option value="PERCENTAGE">Procent (%)</option>
            <option value="FIXED">Fast belopp (kr)</option>
          </select>
        </div>
        <div>
          <label className="block text-[9px] font-black uppercase tracking-widest text-[var(--text-secondary)] mb-1.5">
            Rabattvärde ({form.discountType === "PERCENTAGE" ? "%" : "kr"})
          </label>
          <input
            required
            type="number"
            value={form.discountValue}
            onChange={(e) => setForm({ ...form, discountValue: Number(e.target.value) })}
            className={inputCls}
          />
        </div>
        <div>
          <label className="block text-[9px] font-black uppercase tracking-widest text-[var(--text-secondary)] mb-1.5">Minsta order (kr)</label>
          <input
            type="number"
            value={form.minOrder}
            onChange={(e) => setForm({ ...form, minOrder: Number(e.target.value) })}
            className={inputCls}
          />
        </div>
        <div>
          <label className="block text-[9px] font-black uppercase tracking-widest text-[var(--text-secondary)] mb-1.5">Max användningar (tom = obegränsad)</label>
          <input
            type="number"
            value={form.maxUsages}
            onChange={(e) => setForm({ ...form, maxUsages: e.target.value })}
            placeholder="Obegränsad"
            className={inputCls}
          />
        </div>
        <div>
          <label className="block text-[9px] font-black uppercase tracking-widest text-[var(--text-secondary)] mb-1.5">Giltig från</label>
          <input type="date" value={form.validFrom} onChange={(e) => setForm({ ...form, validFrom: e.target.value })} className={inputCls} />
        </div>
        <div>
          <label className="block text-[9px] font-black uppercase tracking-widest text-[var(--text-secondary)] mb-1.5">Giltig till</label>
          <input type="date" value={form.validUntil} onChange={(e) => setForm({ ...form, validUntil: e.target.value })} className={inputCls} />
        </div>
      </div>

      {/* Restaurant scope */}
      <div>
        <label className="block text-[9px] font-black uppercase tracking-widest text-[var(--text-secondary)] mb-2">
          Kopplade restauranger
        </label>
        <div className="p-3 bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-xl space-y-2 max-h-48 overflow-y-auto">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={form.isGlobal}
              onChange={() => setForm({ ...form, isGlobal: !form.isGlobal, applicableRestaurantIds: [] })}
              className="w-4 h-4 rounded accent-gold-500"
            />
            <span className="text-[10px] font-black uppercase tracking-widest text-[var(--text-primary)]">
              Global — alla restauranger
            </span>
          </label>
          {!form.isGlobal && restaurants.map((r) => {
            const ids = form.applicableRestaurantIds as string[];
            return (
              <label key={r.id} className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={ids.includes(r.id)}
                  onChange={() => toggleRestaurant(r.id)}
                  className="w-4 h-4 rounded accent-gold-500"
                />
                <span className="text-[10px] font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
                  {r.name}
                </span>
              </label>
            );
          })}
        </div>
      </div>

      {/* Toggles */}
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => setForm({ ...form, isActive: !form.isActive })}
          className={`py-3 rounded-xl border text-[9px] font-black uppercase tracking-widest transition-all ${
            form.isActive
              ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
              : "border-[var(--border-subtle)] text-[var(--text-secondary)]"
          }`}
        >
          {form.isActive ? "Aktiv" : "Inaktiv"}
        </button>
        <button
          type="button"
          onClick={() => setForm({ ...form, showOnSite: !form.showOnSite })}
          className={`py-3 rounded-xl border text-[9px] font-black uppercase tracking-widest transition-all ${
            form.showOnSite
              ? "bg-blue-500/10 border-blue-500/20 text-blue-400"
              : "border-[var(--border-subtle)] text-[var(--text-secondary)]"
          }`}
        >
          {form.showOnSite ? "Synlig på sidan" : "Dold"}
        </button>
      </div>

      <div className="flex gap-3 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 py-3.5 rounded-xl text-[10px] font-black uppercase tracking-widest text-[var(--text-secondary)] border border-[var(--border-subtle)] hover:text-[var(--text-primary)] transition-all"
        >
          Avbryt
        </button>
        <button
          type="submit"
          className="flex-1 py-3.5 rounded-xl bg-gold-500 hover:bg-gold-400 text-[#0d0d0d] text-[10px] font-black uppercase tracking-widest shadow-lg shadow-gold-500/20 transition-all"
        >
          {initial ? "Uppdatera" : "Skapa deal"}
        </button>
      </div>
    </form>
  );
}

// ── Customer Deal Form ────────────────────────────────────────────────────────
function CustomerDealForm({
  customers,
  onSave,
  onCancel,
}: {
  customers: any[];
  onSave: (data: any) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    customerId: "",
    title: "",
    code: "",
    discountType: "PERCENTAGE",
    discountValue: 10,
    maxUsages: 1,
    validUntil: "",
  });

  const generateCode = () => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    const code = Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
    setForm({ ...form, code });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(form);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-[9px] font-black uppercase tracking-widest text-[var(--text-secondary)] mb-1.5">Välj kund</label>
        <select
          required
          value={form.customerId}
          onChange={(e) => setForm({ ...form, customerId: e.target.value })}
          className={inputCls}
        >
          <option value="">Välj kund...</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>{c.name} — {c.phone}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-[9px] font-black uppercase tracking-widest text-[var(--text-secondary)] mb-1.5">Dealnamn</label>
        <input
          required
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          placeholder="t.ex. Välkomstkampanj"
          className={inputCls}
        />
      </div>

      <div>
        <label className="block text-[9px] font-black uppercase tracking-widest text-[var(--text-secondary)] mb-1.5">Kod</label>
        <div className="flex gap-2">
          <input
            required
            value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
            placeholder="WELCOME2024"
            className={`${inputCls} font-mono tracking-widest`}
          />
          <button
            type="button"
            onClick={generateCode}
            className="px-4 py-3 rounded-xl bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-[9px] font-black uppercase tracking-widest text-[var(--text-secondary)] hover:text-gold-500 hover:border-gold-500/20 transition-all whitespace-nowrap"
          >
            Generera
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-[9px] font-black uppercase tracking-widest text-[var(--text-secondary)] mb-1.5">Typ</label>
          <select
            value={form.discountType}
            onChange={(e) => setForm({ ...form, discountType: e.target.value })}
            className={inputCls}
          >
            <option value="PERCENTAGE">Procent (%)</option>
            <option value="FIXED">Fast (kr)</option>
          </select>
        </div>
        <div>
          <label className="block text-[9px] font-black uppercase tracking-widest text-[var(--text-secondary)] mb-1.5">Värde</label>
          <input
            type="number"
            value={form.discountValue}
            onChange={(e) => setForm({ ...form, discountValue: Number(e.target.value) })}
            className={inputCls}
          />
        </div>
        <div>
          <label className="block text-[9px] font-black uppercase tracking-widest text-[var(--text-secondary)] mb-1.5">Max användningar</label>
          <input
            type="number"
            min={1}
            value={form.maxUsages}
            onChange={(e) => setForm({ ...form, maxUsages: Number(e.target.value) })}
            className={inputCls}
          />
        </div>
        <div>
          <label className="block text-[9px] font-black uppercase tracking-widest text-[var(--text-secondary)] mb-1.5">Giltig till</label>
          <input
            type="date"
            value={form.validUntil}
            onChange={(e) => setForm({ ...form, validUntil: e.target.value })}
            className={inputCls}
          />
        </div>
      </div>

      <div className="flex gap-3 pt-2">
        <button type="button" onClick={onCancel} className="flex-1 py-3.5 rounded-xl text-[10px] font-black uppercase tracking-widest text-[var(--text-secondary)] border border-[var(--border-subtle)] hover:text-[var(--text-primary)] transition-all">
          Avbryt
        </button>
        <button type="submit" className="flex-1 py-3.5 rounded-xl bg-gold-500 hover:bg-gold-400 text-[#0d0d0d] text-[10px] font-black uppercase tracking-widest shadow-lg shadow-gold-500/20 transition-all">
          Skapa &amp; Tilldela
        </button>
      </div>
    </form>
  );
}

const inputCls =
  "w-full bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-xl px-4 py-3 text-sm font-bold outline-none focus:border-gold-500/30 transition-all placeholder:text-[var(--text-secondary)] placeholder:opacity-40";
