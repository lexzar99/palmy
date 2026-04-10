"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import {
  Tag,
  Plus,
  Search,
  Loader2,
  Calendar,
  Copy,
  Trash2,
  Edit2,
  CheckCircle2,
  XCircle,
  Gift,
  Percent,
  DollarSign,
  Filter,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { API_URL } from "@/lib/api";
import { Modal, ConfirmModal } from "@/components/Modal";
import { useToast } from "@/components/Toast";

interface DiscountCode {
  id: string;
  code: string;
  discountType: "percentage" | "fixed";
  discountValue: number;
  minOrderAmount?: number;
  maxUses?: number;
  usedCount: number;
  startsAt?: string;
  expiresAt?: string;
  restaurantId?: string;
  isActive: boolean;
  createdAt: string;
}

export default function DiscountsPage() {
  const { success, error: toastError } = useToast();

  const [codes, setCodes] = useState<DiscountCode[]>([]);
  const [restaurants, setRestaurants] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterActive, setFilterActive] = useState<"all" | "active" | "inactive">("all");

  const [createModal, setCreateModal] = useState(false);
  const [editingCode, setEditingCode] = useState<DiscountCode | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<DiscountCode | null>(null);

  const [form, setForm] = useState({
    code: "",
    discountType: "percentage" as "percentage" | "fixed",
    discountValue: 10,
    minOrderAmount: 0,
    maxUses: 0,
    startsAt: "",
    expiresAt: "",
    restaurantId: "" as string,
  });

  const token = () => localStorage.getItem("matgo_token");

  const fetchData = async () => {
    setLoading(true);
    try {
      const [codesRes, restaurantsRes] = await Promise.allSettled([
        axios.get(`${API_URL}/api/admin/discounts`, {
          headers: { Authorization: `Bearer ${token()}` },
        }),
        axios.get(`${API_URL}/api/restaurants`),
      ]);

      if (codesRes.status === "fulfilled") setCodes(codesRes.value.data);
      if (restaurantsRes.status === "fulfilled") setRestaurants(restaurantsRes.value.data);
    } catch {
      toastError("Kunde inte ladda rabattkoder");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const filtered = codes.filter((c) => {
    const matchesSearch = !search || c.code.toLowerCase().includes(search.toLowerCase());
    const matchesFilter =
      filterActive === "all" ||
      (filterActive === "active" && c.isActive) ||
      (filterActive === "inactive" && !c.isActive);
    return matchesSearch && matchesFilter;
  });

  const handleToggle = async (id: string, current: boolean) => {
    try {
      await axios.patch(
        `${API_URL}/api/admin/discounts/${id}`,
        { isActive: !current },
        { headers: { Authorization: `Bearer ${token()}` } }
      );
      setCodes((prev) =>
        prev.map((c) => (c.id === id ? { ...c, isActive: !current } : c))
      );
      success(!current ? "Rabattkod aktiverad" : "Rabattkod avaktiverad");
    } catch {
      toastError("Kunde inte uppdatera rabattkod");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.code.trim()) {
      toastError("Ange en kod");
      return;
    }

    try {
      const payload = {
        code: form.code,
        type: form.discountType === "percentage" ? "PERCENTAGE" : "FIXED",
        value: form.discountType === "percentage" ? form.discountValue : form.discountValue * 100,
        minOrder: form.minOrderAmount || undefined,
        maxUsages: form.maxUses || undefined,
        validFrom: form.startsAt || undefined,
        validUntil: form.expiresAt || undefined,
      };

      if (editingCode) {
        await axios.patch(
          `${API_URL}/api/admin/discounts/${editingCode.id}`,
          payload,
          { headers: { Authorization: `Bearer ${token()}` } }
        );
        success("Rabattkod uppdaterad");
      } else {
        await axios.post(
          `${API_URL}/api/admin/discounts`,
          payload,
          { headers: { Authorization: `Bearer ${token()}` } }
        );
        success("Rabattkod skapad");
      }

      setCreateModal(false);
      setEditingCode(null);
      setForm({
        code: "",
        discountType: "percentage",
        discountValue: 10,
        minOrderAmount: 0,
        maxUses: 0,
        startsAt: "",
        expiresAt: "",
        restaurantId: "",
      });
      fetchData();
    } catch (err: any) {
      toastError(err.response?.data?.error || "Kunde inte spara rabattkod");
    }
  };

  const openEdit = (code: DiscountCode) => {
    setEditingCode(code);
    setForm({
      code: code.code,
      discountType: code.discountType,
      discountValue: code.discountValue,
      minOrderAmount: code.minOrderAmount || 0,
      maxUses: code.maxUses || 0,
      startsAt: code.startsAt?.slice(0, 16) || "",
      expiresAt: code.expiresAt?.slice(0, 16) || "",
      restaurantId: code.restaurantId || "",
    });
    setCreateModal(true);
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    try {
      await axios.delete(
        `${API_URL}/api/admin/discounts/${deleteConfirm.id}`,
        { headers: { Authorization: `Bearer ${token()}` } }
      );
      setCodes((prev) => prev.filter((c) => c.id !== deleteConfirm.id));
      success("Rabattkod raderad");
      setDeleteConfirm(null);
    } catch {
      toastError("Kunde inte radera rabattkod");
    }
  };

  const getRestaurantName = (id?: string) => {
    if (!id) return "Alla restauranger";
    const r = restaurants.find((r) => r.id === id);
    return r?.name || "Okänd";
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
        <Loader2 className="animate-spin text-gold-500" size={32} />
        <p className="text-[var(--text-secondary)] font-black uppercase tracking-widest text-[9px]">
          Laddar rabattkoder...
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-24">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black uppercase tracking-tight text-[var(--text-primary)]">
            Rabattkoder
          </h1>
          <p className="text-[var(--text-secondary)] text-[9px] font-bold uppercase tracking-widest mt-0.5">
            {codes.length} koder · {codes.filter((c) => c.isActive).length} aktiva
          </p>
        </div>
        <button
          onClick={() => {
            setEditingCode(null);
            setForm({
              code: "",
              discountType: "percentage",
              discountValue: 10,
              minOrderAmount: 0,
              maxUses: 0,
              startsAt: "",
              expiresAt: "",
              restaurantId: "",
            });
            setCreateModal(true);
          }}
          className="flex items-center gap-2 px-4 py-2.5 bg-gold-500 hover:bg-gold-400 text-[#0d0d0d] font-black uppercase tracking-widest text-[9px] rounded-xl shadow-lg shadow-gold-500/20 transition-all"
        >
          <Plus size={14} /> Ny rabattkod
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search
            size={13}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]"
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Sök koder..."
            className="w-full bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-xl pl-9 pr-4 py-2.5 text-[11px] font-bold outline-none focus:border-gold-500/30 transition-all"
          />
        </div>
        <div className="flex gap-1 p-1 bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-xl">
          {[
            { id: "all", label: "Alla" },
            { id: "active", label: "Aktiva" },
            { id: "inactive", label: "Inaktiva" },
          ].map((f) => (
            <button
              key={f.id}
              onClick={() => setFilterActive(f.id as any)}
              className={`px-3 py-2 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all ${
                filterActive === f.id
                  ? "bg-gold-500 text-[#0d0d0d]"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Codes list */}
      {filtered.length === 0 ? (
        <div className="py-16 text-center rounded-2xl border border-dashed border-[var(--border-subtle)]">
          <Tag size={32} className="text-[var(--text-secondary)] opacity-20 mx-auto mb-3" />
          <p className="text-[9px] font-black uppercase tracking-widest text-[var(--text-secondary)] opacity-30">
            Inga rabattkoder hittades
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((code) => (
            <motion.div
              key={code.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)]"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gold-500/10 flex items-center justify-center">
                    <Tag size={18} className="text-gold-500" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-black uppercase text-[var(--text-primary)]">
                        {code.code}
                      </p>
                      <button
                        onClick={() => navigator.clipboard.writeText(code.code)}
                        className="p-1 text-[var(--text-secondary)] hover:text-gold-500 transition-colors"
                      >
                        <Copy size={12} />
                      </button>
                    </div>
                    <p className="text-[9px] font-bold text-[var(--text-secondary)] uppercase tracking-widest">
                      {code.discountType === "percentage"
                        ? `${code.discountValue}%`
                        : `${code.discountValue / 100} kr`}{" "}
                      · {getRestaurantName(code.restaurantId)}
                      {code.minOrderAmount ? ` · Min ${code.minOrderAmount / 100} kr` : ""}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleToggle(code.id, code.isActive)}
                    className={`p-2 rounded-lg border transition-all ${
                      code.isActive
                        ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                        : "bg-rose-500/10 border-rose-500/20 text-rose-400"
                    }`}
                  >
                    {code.isActive ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
                  </button>
                  <button
                    onClick={() => openEdit(code)}
                    className="p-2 rounded-lg border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-gold-500 hover:border-gold-500/20 transition-all"
                  >
                    <Edit2 size={14} />
                  </button>
                  <button
                    onClick={() => setDeleteConfirm(code)}
                    className="p-2 rounded-lg border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-rose-400 hover:border-rose-500/20 transition-all"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-4 mt-3 pt-3 border-t border-[var(--border-subtle)] text-[8px] font-black uppercase tracking-widest">
                <span className={code.isActive ? "text-emerald-400" : "text-[var(--text-secondary)]"}>
                  {code.isActive ? "Aktiv" : "Inaktiv"}
                </span>
                <span className="text-[var(--text-secondary)]">
                  {code.usedCount} använd {code.maxUses ? `/ ${code.maxUses} max` : ""}
                </span>
                {code.startsAt && (
                  <span className="text-[var(--text-secondary)]">
                    Fr {new Date(code.startsAt).toLocaleDateString("sv-SE")}
                  </span>
                )}
                {code.expiresAt && (
                  <span className="text-rose-400">
                    Till {new Date(code.expiresAt).toLocaleDateString("sv-SE")}
                  </span>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      <Modal
        open={createModal}
        onClose={() => {
          setCreateModal(false);
          setEditingCode(null);
        }}
        title={editingCode ? "Redigera rabattkod" : "Ny rabattkod"}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-[9px] font-black uppercase tracking-widest text-[var(--text-secondary)] block mb-2">
              Kod *
            </label>
            <input
              type="text"
              value={form.code}
              onChange={(e) => setForm((p) => ({ ...p, code: e.target.value.toUpperCase() }))}
              placeholder="SUMMER25"
              className="w-full bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-xl px-4 py-3 text-sm font-black outline-none focus:border-gold-500/30 uppercase"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[9px] font-black uppercase tracking-widest text-[var(--text-secondary)] block mb-2">
                Typ
              </label>
              <select
                value={form.discountType}
                onChange={(e) =>
                  setForm((p) => ({ ...p, discountType: e.target.value as any }))
                }
                className="w-full bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-xl px-4 py-3 text-sm font-black outline-none focus:border-gold-500/30 appearance-none cursor-pointer"
              >
                <option value="percentage">Procent</option>
                <option value="fixed">Fast belopp</option>
              </select>
            </div>
            <div>
              <label className="text-[9px] font-black uppercase tracking-widest text-[var(--text-secondary)] block mb-2">
                {form.discountType === "percentage" ? "Procent" : "Belopp (kr)"}
              </label>
              <div className="relative">
                {form.discountType === "percentage" ? (
                  <Percent
                    size={14}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]"
                  />
                ) : (
                  <DollarSign
                    size={14}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]"
                  />
                )}
                <input
                  type="number"
                  value={form.discountValue}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, discountValue: Number(e.target.value) }))
                  }
                  className="w-full bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-xl pl-9 pr-4 py-3 text-sm font-black outline-none focus:border-gold-500/30"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="text-[9px] font-black uppercase tracking-widest text-[var(--text-secondary)] block mb-2">
              Restaurang
            </label>
            <select
              value={form.restaurantId}
              onChange={(e) => setForm((p) => ({ ...p, restaurantId: e.target.value }))}
              className="w-full bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-xl px-4 py-3 text-sm font-black outline-none focus:border-gold-500/30 appearance-none cursor-pointer"
            >
              <option value="">Alla restauranger</option>
              {restaurants.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[9px] font-black uppercase tracking-widest text-[var(--text-secondary)] block mb-2">
                Minsta order (kr)
              </label>
              <input
                type="number"
                value={form.minOrderAmount}
                onChange={(e) =>
                  setForm((p) => ({ ...p, minOrderAmount: Number(e.target.value) }))
                }
                placeholder="0"
                className="w-full bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-xl px-4 py-3 text-sm font-black outline-none focus:border-gold-500/30"
              />
            </div>
            <div>
              <label className="text-[9px] font-black uppercase tracking-widest text-[var(--text-secondary)] block mb-2">
                Max användningar
              </label>
              <input
                type="number"
                value={form.maxUses}
                onChange={(e) =>
                  setForm((p) => ({ ...p, maxUses: Number(e.target.value) }))
                }
                placeholder="Obegränsat"
                className="w-full bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-xl px-4 py-3 text-sm font-black outline-none focus:border-gold-500/30"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[9px] font-black uppercase tracking-widest text-[var(--text-secondary)] block mb-2">
                Startdatum
              </label>
              <input
                type="datetime-local"
                value={form.startsAt}
                onChange={(e) => setForm((p) => ({ ...p, startsAt: e.target.value }))}
                className="w-full bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-xl px-4 py-3 text-sm font-black outline-none focus:border-gold-500/30"
              />
            </div>
            <div>
              <label className="text-[9px] font-black uppercase tracking-widest text-[var(--text-secondary)] block mb-2">
                Slutdatum
              </label>
              <input
                type="datetime-local"
                value={form.expiresAt}
                onChange={(e) => setForm((p) => ({ ...p, expiresAt: e.target.value }))}
                className="w-full bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-xl px-4 py-3 text-sm font-black outline-none focus:border-gold-500/30"
              />
            </div>
          </div>

          <button
            type="submit"
            className="w-full py-3 bg-gold-500 hover:bg-gold-400 text-[#0d0d0d] font-black uppercase tracking-widest text-[10px] rounded-xl transition-all"
          >
            {editingCode ? "Spara" : "Skapa rabattkod"}
          </button>
        </form>
      </Modal>

      <ConfirmModal
        open={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        onConfirm={handleDelete}
        title="Radera rabattkod"
        message={`Radera ${deleteConfirm?.code}?`}
        confirmLabel="Radera"
        danger
      />
    </div>
  );
}