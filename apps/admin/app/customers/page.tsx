 
"use client";

import { useEffect, useState, useMemo } from "react";
import axios from "axios";
import {
  Users,
  Search,
  Phone,
  Mail,
  Calendar,
  ShoppingBag,
  Lock,
  Unlock,
  MapPin,
  Trash2,
  Settings2,
  X,
  CreditCard,
  Ticket,
  LayoutGrid,
  ArrowLeft,
  MessageSquare,
  ChevronRight,
  Star,
  Package,
  AlertCircle,
  Loader2,
  CheckCircle2,
  Filter,
  TrendingUp,
  Activity,
  CheckSquare,
  Ban,
  Send,
} from "lucide-react";
import { API_URL } from "@/lib/api";
import { motion, AnimatePresence } from "framer-motion";
import { Modal, ConfirmModal } from "@/components/Modal";
import { useToast } from "@/components/Toast";

const inputCls =
  "w-full bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-xl px-4 py-3 text-sm font-bold outline-none focus:border-gold-500/30 transition-all placeholder:text-[var(--text-secondary)] placeholder:opacity-40";

export default function CustomersPage() {
  const { success, error: toastError } = useToast();
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "inactive">("all");
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);
  const [editingCustomer, setEditingCustomer] = useState<any>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<"INFO" | "ORDERS" | "DEALS" | "NOTES">("INFO");
  const [supportNote, setSupportNote] = useState("");
  const [sendingNote, setSendingNote] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkLoading, setBulkLoading] = useState(false);

  const token = () => localStorage.getItem("matgo_token");

  const fetchCustomers = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_URL}/api/customers`, {
        headers: { Authorization: `Bearer ${token()}` },
      });
      setCustomers(res.data);
    } catch {
      toastError("Kunde inte ladda kunder");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchCustomers(); }, []);

  const fetchCustomerDetails = async (id: string) => {
    try {
      const res = await axios.get(`${API_URL}/api/customers/${id}`, {
        headers: { Authorization: `Bearer ${token()}` },
      });
      setSelectedCustomer(res.data);
    } catch {
      toastError("Kunde inte hämta kunddetaljer");
    }
  };

  const handleUpdateUser = async (id: string, data: any) => {
    try {
      await axios.patch(`${API_URL}/api/customers/${id}`, data, {
        headers: { Authorization: `Bearer ${token()}` },
      });
      success("Kundprofil uppdaterad");
      fetchCustomers();
      if (selectedCustomer?.id === id) fetchCustomerDetails(id);
      setEditingCustomer(null);
    } catch {
      toastError("Kunde inte uppdatera kund");
    }
  };

  const handleDeleteUser = async (id: string) => {
    try {
      await axios.delete(`${API_URL}/api/customers/${id}`, {
        headers: { Authorization: `Bearer ${token()}` },
      });
      success("Kund raderad");
      setDeleteConfirm(null);
      setSelectedCustomer(null);
      fetchCustomers();
    } catch {
      toastError("Kunde inte radera kunden");
    }
  };

  const handleUpdateDeal = async (dealId: string, data: any) => {
    if (!selectedCustomer) return;
    try {
      await axios.patch(
        `${API_URL}/api/customers/${selectedCustomer.id}/deals/${dealId}`,
        data,
        { headers: { Authorization: `Bearer ${token()}` } }
      );
      fetchCustomerDetails(selectedCustomer.id);
      success("Erbjudande uppdaterat");
    } catch {
      toastError("Kunde inte uppdatera erbjudande");
    }
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === filtered.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filtered.map((c) => c.id));
    }
  };

  const toggleSelectOne = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const handleBulkActivate = async () => {
    setBulkLoading(true);
    try {
      await Promise.all(
        selectedIds.map((id) =>
          axios.patch(
            `${API_URL}/api/customers/${id}`,
            { isActive: true },
            { headers: { Authorization: `Bearer ${token()}` } }
          )
        )
      );
      success(`${selectedIds.length} kunder aktiverade`);
      setSelectedIds([]);
      fetchCustomers();
    } catch {
      toastError("Kunde inte aktivera kunder");
    } finally {
      setBulkLoading(false);
    }
  };

  const handleBulkBlock = async () => {
    setBulkLoading(true);
    try {
      await Promise.all(
        selectedIds.map((id) =>
          axios.patch(
            `${API_URL}/api/customers/${id}`,
            { isActive: false },
            { headers: { Authorization: `Bearer ${token()}` } }
          )
        )
      );
      success(`${selectedIds.length} kunder avaktiverade`);
      setSelectedIds([]);
      fetchCustomers();
    } catch {
      toastError("Kunde inte avaktivera kunder");
    } finally {
      setBulkLoading(false);
    }
  };

  const handleDeleteDeal = async (dealId: string) => {
    if (!selectedCustomer) return;
    try {
      await axios.delete(
        `${API_URL}/api/customers/${selectedCustomer.id}/deals/${dealId}`,
        { headers: { Authorization: `Bearer ${token()}` } }
      );
      fetchCustomerDetails(selectedCustomer.id);
      success("Erbjudande borttaget");
    } catch (err: any) {
      toastError(err.response?.data?.error || "Kunde inte ta bort erbjudandet");
    }
  };

  // Filtered customers
  const filtered = useMemo(() => {
    let result = customers;

    if (filter === "active") result = result.filter((c) => c.isActive);
    else if (filter === "inactive") result = result.filter((c) => !c.isActive);

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (c) =>
          (c.name || "").toLowerCase().includes(q) ||
          (c.phone || "").toLowerCase().includes(q) ||
          (c.email || "").toLowerCase().includes(q)
      );
    }

    return result;
  }, [customers, search, filter]);

  const stats = useMemo(() => ({
    total: customers.length,
    active: customers.filter((c) => c.isActive).length,
    verified: customers.filter((c) => c.isVerified).length,
  }), [customers]);

  return (
    <div className="space-y-6 pb-24">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black uppercase tracking-tight text-[var(--text-primary)]">
            Kunder & Support
          </h1>
          <p className="text-[var(--text-secondary)] text-[10px] font-bold uppercase tracking-widest mt-1">
            {stats.total} registrerade kunder · {stats.verified} verifierade
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Totalt", value: stats.total, color: "text-gold-500" },
          { label: "Aktiva", value: stats.active, color: "text-emerald-400" },
          { label: "Verifierade", value: stats.verified, color: "text-blue-400" },
        ].map((s) => (
          <div
            key={s.label}
            className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)]"
          >
            <div className="text-[9px] font-black uppercase tracking-widest text-[var(--text-secondary)] mb-1">
              {s.label}
            </div>
            <div className={`text-2xl font-black ${s.color}`}>{s.value}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[320px,1fr] gap-5">
        {/* Customer list */}
        <div className="space-y-3">
          {/* Search + filter */}
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Sök kund..."
              className="w-full bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-xl pl-8 pr-4 py-2.5 text-[11px] font-bold outline-none focus:border-gold-500/30 transition-all"
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
                onClick={() => setFilter(f.id as any)}
                className={`flex-1 py-2 rounded-lg text-[8px] font-black uppercase tracking-wider transition-all ${
                  filter === f.id
                    ? "bg-gold-500 text-[#0d0d0d]"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="text-[9px] font-black uppercase tracking-widest text-[var(--text-secondary)] opacity-50 px-1">
            {filtered.length} kunder
          </div>

          {/* Bulk actions */}
          {selectedIds.length > 0 && (
            <div className="flex items-center gap-2 p-2 bg-gold-500/10 border border-gold-500/20 rounded-xl">
              <span className="text-[9px] font-black text-gold-500 px-2">
                {selectedIds.length} vald
              </span>
              <button
                onClick={handleBulkActivate}
                disabled={bulkLoading}
                className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 text-[8px] font-black uppercase border border-emerald-500/20 hover:bg-emerald-500/20 transition-all"
              >
                <CheckCircle2 size={11} /> Aktivera
              </button>
              <button
                onClick={handleBulkBlock}
                disabled={bulkLoading}
                className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-rose-500/10 text-rose-400 text-[8px] font-black uppercase border border-rose-500/20 hover:bg-rose-500/20 transition-all"
              >
                <Ban size={11} /> Blockera
              </button>
              <button
                onClick={() => setSelectedIds([])}
                className="ml-auto px-2 py-1.5 text-[8px] font-black uppercase text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              >
                Avbryt
              </button>
            </div>
          )}

          {/* List */}
          <div className="space-y-1.5 max-h-[calc(100vh-340px)] overflow-y-auto">
            {loading ? (
              [1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-16 rounded-xl bg-[var(--bg-secondary)] animate-pulse border border-[var(--border-subtle)]" />
              ))
            ) : filtered.length === 0 ? (
              <div className="py-12 text-center">
                <p className="text-[9px] font-black uppercase tracking-widest text-[var(--text-secondary)] opacity-30">
                  Inga kunder
                </p>
              </div>
            ) : (
              <>
                <button
                  onClick={toggleSelectAll}
                  className="w-full flex items-center gap-2 p-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] text-[9px] font-black uppercase text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                >
                  <div className={`w-4 h-4 rounded border ${selectedIds.length === filtered.length && filtered.length > 0 ? "bg-gold-500 border-gold-500" : "border-[var(--border-subtle)]"} flex items-center justify-center`}>
                    {selectedIds.length === filtered.length && filtered.length > 0 && <CheckSquare size={10} className="text-[#0d0d0d]" />}
                  </div>
                  Välj alla ({filtered.length})
                </button>
                {filtered.map((c) => (
                <div
                  key={c.id}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all ${
                    selectedCustomer?.id === c.id
                      ? "bg-gold-500/10 border-gold-500/30"
                      : "bg-[var(--bg-secondary)] border-[var(--border-subtle)] hover:border-[var(--border-subtle)]"
                  }`}
                >
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleSelectOne(c.id); }}
                    className={`w-4 h-4 rounded border shrink-0 flex items-center justify-center ${
                      selectedIds.includes(c.id)
                        ? "bg-gold-500 border-gold-500"
                        : "border-[var(--border-subtle)]"
                    }`}
                  >
                    {selectedIds.includes(c.id) && <CheckSquare size={10} className="text-[#0d0d0d]" />}
                  </button>
                  <button
                    onClick={() => { fetchCustomerDetails(c.id); setActiveTab("INFO"); }}
                    className="flex-1 flex items-center gap-3 text-left"
                  >
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center font-black text-sm shrink-0 ${
                        selectedCustomer?.id === c.id
                          ? "bg-gold-500 text-[#0d0d0d]"
                          : "bg-[var(--bg-primary)] text-gold-500 border border-[var(--border-subtle)]"
                      }`}
                    >
                      {(c.name || "?").charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-black uppercase truncate text-[var(--text-primary)]">
                        {c.name || "Gäst"}
                      </p>
                      <p className="text-[9px] font-bold text-[var(--text-secondary)] truncate">
                        {c.phone}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      {!c.isActive && (
                        <span className="text-[7px] font-black uppercase text-rose-400 bg-rose-500/10 px-1.5 py-0.5 rounded">
                          Blockad
                        </span>
                      )}
                      {c.isVerified && (
                        <div className="w-2 h-2 rounded-full bg-emerald-400" title="Verifierad" />
                      )}
                    </div>
                  </button>
                </div>
              ))}
              </>
            )}
          </div>
        </div>

        {/* Customer detail panel */}
        <AnimatePresence mode="wait">
          {selectedCustomer ? (
            <motion.div
              key={selectedCustomer.id}
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              className="space-y-4"
            >
              {/* Customer header */}
              <div className="p-5 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)]">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-gold-500 text-[#0d0d0d] flex items-center justify-center text-2xl font-black shadow-lg shadow-gold-500/20">
                      {(selectedCustomer.name || "?").charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <h2 className="text-lg font-black uppercase tracking-tight text-[var(--text-primary)]">
                        {selectedCustomer.name}
                      </h2>
                      <p className="text-[9px] font-bold uppercase tracking-widest text-[var(--text-secondary)] mt-0.5">
                        Kund sedan {new Date(selectedCustomer.createdAt).toLocaleDateString("sv-SE")}
                      </p>
                      <div className="flex items-center gap-2 mt-1.5">
                        {selectedCustomer.isVerified ? (
                          <span className="flex items-center gap-1 text-[8px] font-black uppercase text-emerald-400">
                            <CheckCircle2 size={10} /> Verifierad
                          </span>
                        ) : (
                          <span className="text-[8px] font-black uppercase text-amber-400">
                            Ej verifierad
                          </span>
                        )}
                        {!selectedCustomer.isActive && (
                          <span className="text-[8px] font-black uppercase text-rose-400 bg-rose-500/10 px-1.5 py-0.5 rounded">
                            Blockad
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setEditingCustomer(selectedCustomer)}
                      className="w-9 h-9 rounded-xl bg-[var(--bg-primary)] border border-[var(--border-subtle)] flex items-center justify-center text-[var(--text-secondary)] hover:text-gold-500 hover:border-gold-500/20 transition-all"
                    >
                      <Settings2 size={15} />
                    </button>
                    <button
                      onClick={() => handleUpdateUser(selectedCustomer.id, { isActive: !selectedCustomer.isActive })}
                      className={`w-9 h-9 rounded-xl border flex items-center justify-center transition-all ${
                        selectedCustomer.isActive
                          ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20"
                          : "bg-rose-500/10 text-rose-400 border-rose-500/20 hover:bg-rose-500/20"
                      }`}
                      title={selectedCustomer.isActive ? "Blockera kund" : "Aktivera kund"}
                    >
                      {selectedCustomer.isActive ? <Unlock size={15} /> : <Lock size={15} />}
                    </button>
                    <button
                      onClick={() => setDeleteConfirm(selectedCustomer)}
                      className="w-9 h-9 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center hover:bg-rose-500/20 transition-all"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>

                {/* Quick stats */}
                <div className="grid grid-cols-3 gap-3">
                  {[
                    {
                      label: "Ordrar",
                      value: selectedCustomer.orders?.length || 0,
                      icon: ShoppingBag,
                      color: "text-blue-400",
                    },
                    {
                      label: "Total spenderat",
                      value: `${Math.round(
                        (selectedCustomer.orders || [])
                          .filter((o: any) => o.status === "DELIVERED")
                          .reduce((s: number, o: any) => s + (o.total || 0), 0) / 100
                      )} kr`,
                      icon: CreditCard,
                      color: "text-gold-500",
                    },
                    {
                      label: "Deals",
                      value: selectedCustomer.deals?.length || 0,
                      icon: Ticket,
                      color: "text-emerald-400",
                    },
                  ].map((s) => {
                    const Icon = s.icon;
                    return (
                      <div
                        key={s.label}
                        className="p-3 rounded-xl bg-[var(--bg-primary)] border border-[var(--border-subtle)]"
                      >
                        <Icon size={13} className={`${s.color} mb-2`} />
                        <div className={`text-base font-black ${s.color}`}>{s.value}</div>
                        <div className="text-[8px] font-black uppercase tracking-widest text-[var(--text-secondary)] mt-0.5">
                          {s.label}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Tabs */}
              <div className="flex gap-1 p-1 bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-xl">
                {(
                  [
                    { id: "INFO", label: "Profil", icon: Users },
                    { id: "ORDERS", label: "Ordrar", icon: ShoppingBag },
                    { id: "DEALS", label: "Deals", icon: Ticket },
                    { id: "NOTES", label: "Support", icon: MessageSquare },
                  ] as const
                ).map((t) => {
                  const Icon = t.icon;
                  return (
                    <button
                      key={t.id}
                      onClick={() => setActiveTab(t.id)}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-[8px] font-black uppercase tracking-wider transition-all ${
                        activeTab === t.id
                          ? "bg-gold-500 text-[#0d0d0d]"
                          : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                      }`}
                    >
                      <Icon size={11} /> {t.label}
                    </button>
                  );
                })}
              </div>

              {/* Tab content */}
              <AnimatePresence mode="wait">
                {activeTab === "INFO" && (
                  <motion.div
                    key="info"
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="grid grid-cols-2 gap-3"
                  >
                    {[
                      { icon: Phone, label: "Telefon", value: selectedCustomer.phone },
                      { icon: Mail, label: "E-post", value: selectedCustomer.email || "—" },
                      { icon: MapPin, label: "Adress", value: selectedCustomer.address || "—" },
                      { icon: LayoutGrid, label: "Stad", value: selectedCustomer.city || "—" },
                    ].map((item) => {
                      const Icon = item.icon;
                      return (
                        <div
                          key={item.label}
                          className="flex items-center gap-3 p-4 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-subtle)]"
                        >
                          <div className="w-8 h-8 rounded-xl bg-[var(--bg-primary)] border border-[var(--border-subtle)] flex items-center justify-center text-gold-500 shrink-0">
                            <Icon size={14} />
                          </div>
                          <div>
                            <div className="text-[7px] font-black uppercase tracking-widest text-[var(--text-secondary)] mb-0.5">
                              {item.label}
                            </div>
                            <div className="text-[11px] font-bold text-[var(--text-primary)]">
                              {item.value}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </motion.div>
                )}

                {activeTab === "ORDERS" && (
                  <motion.div
                    key="orders"
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="space-y-2"
                  >
                    {selectedCustomer.orders?.length === 0 || !selectedCustomer.orders ? (
                      <div className="py-10 text-center rounded-xl border border-dashed border-[var(--border-subtle)]">
                        <ShoppingBag size={24} className="mx-auto mb-2 text-[var(--text-secondary)] opacity-20" />
                        <p className="text-[9px] font-black uppercase tracking-widest text-[var(--text-secondary)] opacity-30">
                          Inga beställningar
                        </p>
                      </div>
                    ) : (
                      selectedCustomer.orders.map((order: any) => (
                        <div
                          key={order.id}
                          className="flex items-center justify-between p-3 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-subtle)]"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-[var(--bg-primary)] border border-[var(--border-subtle)] flex items-center justify-center text-[9px] font-black text-[var(--text-secondary)]">
                              #{order.orderNumber}
                            </div>
                            <div>
                              <p className="text-[11px] font-black uppercase text-[var(--text-primary)]">
                                {order.restaurant?.name || "—"}
                              </p>
                              <p className="text-[9px] font-bold text-[var(--text-secondary)]">
                                {new Date(order.createdAt).toLocaleDateString("sv-SE")} · {Math.round((order.total || 0) / 100)} kr
                              </p>
                            </div>
                          </div>
                          <span
                            className={`text-[7px] font-black uppercase px-2 py-1 rounded border ${
                              order.status === "DELIVERED"
                                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                                : "bg-[var(--border-subtle)] text-[var(--text-secondary)] border-[var(--border-subtle)]"
                            }`}
                          >
                            {order.status}
                          </span>
                        </div>
                      ))
                    )}
                  </motion.div>
                )}

                {activeTab === "DEALS" && (
                  <motion.div
                    key="deals"
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="space-y-2"
                  >
                    {!selectedCustomer.deals || selectedCustomer.deals.length === 0 ? (
                      <div className="py-10 text-center rounded-xl border border-dashed border-[var(--border-subtle)]">
                        <Ticket size={24} className="mx-auto mb-2 text-[var(--text-secondary)] opacity-20" />
                        <p className="text-[9px] font-black uppercase tracking-widest text-[var(--text-secondary)] opacity-30">
                          Inga personliga deals
                        </p>
                      </div>
                    ) : (
                      selectedCustomer.deals.map((deal: any) => (
                        <div
                          key={deal.id}
                          className={`flex items-center justify-between p-4 rounded-xl border transition-all ${
                            deal.isUsed
                              ? "bg-[var(--bg-secondary)] border-[var(--border-subtle)] opacity-60"
                              : "bg-[var(--bg-secondary)] border-gold-500/20"
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-xl bg-gold-500/10 flex items-center justify-center text-gold-500">
                              <Ticket size={14} />
                            </div>
                            <div>
                              <p className="text-[11px] font-black uppercase text-[var(--text-primary)]">
                                {deal.campaign?.title || deal.code}
                              </p>
                              <code className="text-[9px] text-gold-500/60 tracking-widest font-bold">
                                {deal.code}
                              </code>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {deal.isUsed && (
                              <span className="text-[7px] font-black uppercase text-[var(--text-secondary)] bg-[var(--bg-primary)] px-1.5 py-0.5 rounded border border-[var(--border-subtle)]">
                                Använd
                              </span>
                            )}
                            <button
                              onClick={() => handleUpdateDeal(deal.id, { isUsed: false, usageCount: 0 })}
                              className="text-[8px] font-black uppercase text-[var(--text-secondary)] hover:text-gold-500 transition-colors px-2 py-1 rounded border border-[var(--border-subtle)]"
                            >
                              Återställ
                            </button>
                            <button
                              onClick={() => handleDeleteDeal(deal.id)}
                              className="w-7 h-7 rounded-lg bg-rose-500/5 border border-rose-500/10 flex items-center justify-center text-rose-400 hover:bg-rose-500/15 transition-all"
                            >
                              <Trash2 size={11} />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </motion.div>
                )}

                {activeTab === "NOTES" && (
                  <motion.div
                    key="notes"
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="space-y-4"
                  >
                    <div className="p-4 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-subtle)]">
                      <p className="text-[9px] font-black uppercase tracking-widest text-[var(--text-secondary)] mb-3">
                        Intern supportanteckning
                      </p>
                      <textarea
                        value={supportNote}
                        onChange={(e) => setSupportNote(e.target.value)}
                        placeholder="Anteckna kundärende, klagomål, löften..."
                        className="w-full bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-xl px-4 py-3 text-sm font-bold outline-none focus:border-gold-500/30 h-28 resize-none"
                      />
                      <button
                        onClick={async () => {
                          if (!supportNote.trim()) return;
                          setSendingNote(true);
                          try {
                            const existing = selectedCustomer.internalInfo || "";
                            const timestamp = new Date().toLocaleString("sv-SE");
                            const note = `[${timestamp}] ${supportNote}\n${existing}`;
                            await handleUpdateUser(selectedCustomer.id, { internalInfo: note });
                            setSupportNote("");
                          } finally {
                            setSendingNote(false);
                          }
                        }}
                        disabled={sendingNote || !supportNote.trim()}
                        className="mt-3 px-5 py-2.5 bg-gold-500 hover:bg-gold-400 text-[#0d0d0d] font-black uppercase tracking-widest text-[9px] rounded-xl transition-all disabled:opacity-50 flex items-center gap-2"
                      >
                        {sendingNote ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                        Spara anteckning
                      </button>
                    </div>

                    {selectedCustomer.internalInfo && (
                      <div className="p-4 rounded-xl bg-[var(--bg-primary)] border border-[var(--border-subtle)]">
                        <p className="text-[9px] font-black uppercase tracking-widest text-[var(--text-secondary)] mb-2">
                          Historik
                        </p>
                        <pre className="text-[10px] font-bold text-[var(--text-secondary)] whitespace-pre-wrap leading-relaxed">
                          {selectedCustomer.internalInfo}
                        </pre>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ) : (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="h-80 flex flex-col items-center justify-center text-center p-10 rounded-2xl border border-dashed border-[var(--border-subtle)] bg-[var(--bg-secondary)]"
            >
              <Users size={36} className="text-[var(--text-secondary)] opacity-10 mb-4" />
              <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-secondary)] opacity-30">
                Välj en kund för att se detaljer
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Edit customer modal */}
      <Modal
        open={!!editingCustomer}
        onClose={() => setEditingCustomer(null)}
        title="Redigera kundprofil"
        maxWidth="max-w-lg"
      >
        {editingCustomer && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              handleUpdateUser(editingCustomer.id, Object.fromEntries(fd.entries()));
            }}
            className="space-y-4"
          >
            <div className="grid grid-cols-2 gap-4">
              {[
                { name: "name", label: "Namn", value: editingCustomer.name },
                { name: "phone", label: "Telefon", value: editingCustomer.phone },
                { name: "email", label: "E-post", value: editingCustomer.email },
                { name: "address", label: "Adress", value: editingCustomer.address },
                { name: "zip", label: "Postnummer", value: editingCustomer.zip },
                { name: "city", label: "Stad", value: editingCustomer.city },
              ].map((f) => (
                <div key={f.name}>
                  <label className="block text-[9px] font-black uppercase tracking-widest text-[var(--text-secondary)] mb-1.5">
                    {f.label}
                  </label>
                  <input
                    name={f.name}
                    defaultValue={f.value || ""}
                    className="w-full bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-xl px-4 py-3 text-sm font-bold outline-none focus:border-gold-500/30"
                  />
                </div>
              ))}
            </div>
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setEditingCustomer(null)}
                className="flex-1 py-3.5 rounded-xl text-[10px] font-black uppercase tracking-widest text-[var(--text-secondary)] border border-[var(--border-subtle)]"
              >
                Avbryt
              </button>
              <button
                type="submit"
                className="flex-1 py-3.5 rounded-xl bg-gold-500 text-[#0d0d0d] text-[10px] font-black uppercase tracking-widest shadow-lg shadow-gold-500/20 hover:bg-gold-400 transition-all"
              >
                Spara profil
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* Delete confirm */}
      <ConfirmModal
        open={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        onConfirm={() => deleteConfirm && handleDeleteUser(deleteConfirm.id)}
        title="Radera kund"
        message={`Är du säker? ${deleteConfirm?.name} och all orderhistorik raderas permanent.`}
        confirmLabel="Radera kund"
        danger
      />
    </div>
  );
}
