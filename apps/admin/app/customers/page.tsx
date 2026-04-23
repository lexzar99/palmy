"use client";

import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import {
  CreditCard,
  Loader2,
  Lock,
  Mail,
  MapPin,
  MessageSquare,
  Phone,
  RefreshCw,
  Search,
  ShieldCheck,
  ShoppingBag,
  Ticket,
  Trash2,
  UserRound,
} from "lucide-react";
import { ConfirmModal, Modal } from "@/components/Modal";
import { useToast } from "@/components/Toast";
import { API_URL } from "@/lib/api";
import { getStoredToken } from "@/lib/auth-storage";

type CustomerSummary = {
  id: string;
  name: string;
  phone: string;
  email?: string | null;
  city?: string | null;
  isActive: boolean;
  isVerified: boolean;
  createdAt: string;
  _count?: { orders: number };
};

type CustomerDetail = CustomerSummary & {
  address?: string | null;
  zip?: string | null;
  internalInfo?: string | null;
  orders: Array<{
    id: string;
    orderNumber: string;
    total: number;
    status: string;
    createdAt: string;
    restaurant?: { name: string } | null;
  }>;
  deals: Array<{
    id: string;
    code: string;
    isUsed: boolean;
    usageCount: number;
    maxUsages: number;
    createdAt: string;
    campaign?: {
      title: string;
      discountType: string;
      discountValue: number;
    } | null;
  }>;
};

const currency = (value: number) => `${Math.round(value / 100).toLocaleString("sv-SE")} kr`;
const inputCls = "control-input";

const emptyDealForm = {
  title: "",
  code: "",
  discountType: "PERCENTAGE",
  discountValue: 10,
  maxUsages: 1,
  validUntil: "",
};

export default function CustomersPage() {
  const { success, error: toastError } = useToast();
  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [editCustomer, setEditCustomer] = useState<CustomerDetail | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CustomerDetail | null>(null);
  const [dealModalOpen, setDealModalOpen] = useState(false);
  const [dealForm, setDealForm] = useState(emptyDealForm);
  const [supportNote, setSupportNote] = useState("");
  const [savingNote, setSavingNote] = useState(false);

  const token = getStoredToken();

  const fetchCustomers = async () => {
    if (!token) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const response = await axios.get(`${API_URL}/api/customers`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setCustomers(response.data || []);
    } catch (err: any) {
      toastError(err.response?.data?.error || "Kunde inte ladda kunder.");
    } finally {
      setLoading(false);
    }
  };

  const fetchCustomerDetail = async (id: string) => {
    if (!token) return;

    setDetailLoading(true);
    try {
      const response = await axios.get(`${API_URL}/api/customers/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const detail = response.data as CustomerDetail;
      setSelectedCustomer(detail);
      setSupportNote(detail.internalInfo || "");
    } catch (err: any) {
      toastError(err.response?.data?.error || "Kunde inte ladda kunddetaljer.");
      setSelectedCustomer(null);
    } finally {
      setDetailLoading(false);
    }
  };

  useEffect(() => {
    void fetchCustomers();
  }, []);

  useEffect(() => {
    if (selectedCustomerId) {
      void fetchCustomerDetail(selectedCustomerId);
    }
  }, [selectedCustomerId]);

  const filtered = useMemo(() => {
    return customers.filter((customer) => {
      if (statusFilter === "active" && !customer.isActive) return false;
      if (statusFilter === "inactive" && customer.isActive) return false;
      if (!search.trim()) return true;

      const query = search.toLowerCase();
      return (
        (customer.name || "").toLowerCase().includes(query) ||
        (customer.phone || "").toLowerCase().includes(query) ||
        (customer.email || "").toLowerCase().includes(query)
      );
    });
  }, [customers, search, statusFilter]);

  const stats = useMemo(
    () => ({
      total: customers.length,
      active: customers.filter((customer) => customer.isActive).length,
      verified: customers.filter((customer) => customer.isVerified).length,
      heavy: customers.filter((customer) => (customer._count?.orders || 0) >= 5).length,
    }),
    [customers]
  );

  const updateCustomer = async (id: string, payload: Record<string, unknown>) => {
    if (!token) return;

    try {
      await axios.patch(`${API_URL}/api/customers/${id}`, payload, {
        headers: { Authorization: `Bearer ${token}` },
      });
      await fetchCustomers();
      await fetchCustomerDetail(id);
    } catch (err: any) {
      throw new Error(err.response?.data?.error || "Kunde inte uppdatera kunden.");
    }
  };

  const toggleStatus = async () => {
    if (!selectedCustomer) return;

    try {
      await updateCustomer(selectedCustomer.id, { isActive: !selectedCustomer.isActive });
      success(selectedCustomer.isActive ? "Kunden blockerades." : "Kunden aktiverades.");
    } catch (err: any) {
      toastError(err.message);
    }
  };

  const saveSupportNote = async () => {
    if (!selectedCustomer) return;

    setSavingNote(true);
    try {
      await updateCustomer(selectedCustomer.id, { internalInfo: supportNote || null });
      success("Supportnoteringen sparades.");
    } catch (err: any) {
      toastError(err.message);
    } finally {
      setSavingNote(false);
    }
  };

  const createPersonalDeal = async () => {
    if (!selectedCustomer || !token) return;

    try {
      await axios.post(`${API_URL}/api/customers/${selectedCustomer.id}/deals`, dealForm, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setDealModalOpen(false);
      setDealForm(emptyDealForm);
      await fetchCustomerDetail(selectedCustomer.id);
      success("Personlig deal skapad.");
    } catch (err: any) {
      toastError(err.response?.data?.error || "Kunde inte skapa dealen.");
    }
  };

  const updateDeal = async (dealId: string, payload: Record<string, unknown>) => {
    if (!selectedCustomer || !token) return;

    try {
      await axios.patch(`${API_URL}/api/customers/${selectedCustomer.id}/deals/${dealId}`, payload, {
        headers: { Authorization: `Bearer ${token}` },
      });
      await fetchCustomerDetail(selectedCustomer.id);
      success("Dealen uppdaterades.");
    } catch (err: any) {
      toastError(err.response?.data?.error || "Kunde inte uppdatera dealen.");
    }
  };

  const deleteDeal = async (dealId: string) => {
    if (!selectedCustomer || !token) return;

    try {
      await axios.delete(`${API_URL}/api/customers/${selectedCustomer.id}/deals/${dealId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      await fetchCustomerDetail(selectedCustomer.id);
      success("Dealen togs bort.");
    } catch (err: any) {
      toastError(err.response?.data?.error || "Kunde inte ta bort dealen.");
    }
  };

  const deleteCustomer = async () => {
    if (!deleteTarget || !token) return;

    try {
      await axios.delete(`${API_URL}/api/customers/${deleteTarget.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      success("Kunden raderades.");
      setDeleteTarget(null);
      setSelectedCustomer(null);
      setSelectedCustomerId(null);
      await fetchCustomers();
    } catch (err: any) {
      toastError(err.response?.data?.error || "Kunde inte radera kunden.");
    }
  };

  if (loading) {
    return (
      <div className="panel flex min-h-[320px] items-center justify-center rounded-[28px] px-6 py-12">
        <div className="flex items-center gap-3 text-[var(--text-secondary)]">
          <Loader2 className="animate-spin text-amber-200" size={18} />
          <span className="text-sm font-semibold">Laddar kunder...</span>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-6 pb-16">
        <section className="panel rounded-[28px] px-6 py-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-3">
              <span className="control-chip">Förenklade kunder</span>
              <div>
                <h2 className="text-3xl font-black tracking-[-0.06em] text-[var(--text-primary)] sm:text-4xl">Kundlista och kundmodal.</h2>
                <p className="mt-2 max-w-3xl text-sm leading-7 text-[var(--text-secondary)] sm:text-base">
                  Kunddetaljer öppnas nu i modal i stället för i en lång högerspalt. Du kan fortfarande hantera supportnoteringar, personliga deals och historik utan att byta sida.
                </p>
              </div>
            </div>

            <button type="button" onClick={() => void fetchCustomers()} className="control-chip">
              <RefreshCw size={13} /> Uppdatera
            </button>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "Totalt", value: stats.total, sub: "Registrerade kunder" },
            { label: "Aktiva", value: stats.active, sub: "Kan beställa nu" },
            { label: "Verifierade", value: stats.verified, sub: "Verifierat konto eller telefon" },
            { label: "Återkommande", value: stats.heavy, sub: "Minst 5 ordrar" },
          ].map((card) => (
            <article key={card.label} className="metric-card panel-muted">
              <p className="text-[10px] font-black uppercase tracking-[0.28em] text-[var(--text-muted)]">{card.label}</p>
              <p className="mt-3 text-3xl font-black tracking-[-0.05em] text-[var(--text-primary)]">{card.value}</p>
              <p className="mt-4 text-sm leading-6 text-[var(--text-secondary)]">{card.sub}</p>
            </article>
          ))}
        </section>

        <section className="panel rounded-[28px] px-6 py-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="relative flex-1">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Sök namn, telefon eller mejl" className="control-input pl-10" />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {([
                { id: "all", label: "Alla" },
                { id: "active", label: "Aktiva" },
                { id: "inactive", label: "Blockerade" },
              ] as const).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setStatusFilter(item.id)}
                  className={`rounded-2xl px-4 py-3 text-[11px] font-black uppercase tracking-[0.22em] ${statusFilter === item.id ? "bg-gold-gradient text-[#091018]" : "border border-[var(--border-subtle)] bg-[var(--panel-muted)] text-[var(--text-secondary)]"}`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-5 grid gap-4 xl:grid-cols-2">
            {filtered.length === 0 ? (
              <div className="xl:col-span-2 rounded-[24px] border border-dashed border-[var(--border-subtle)] px-6 py-16 text-center text-sm leading-7 text-[var(--text-secondary)]">
                Inga kunder matchade filtren.
              </div>
            ) : (
              filtered.map((customer) => (
                <button
                  key={customer.id}
                  type="button"
                  onClick={() => setSelectedCustomerId(customer.id)}
                  className="rounded-[24px] border border-[var(--border-subtle)] bg-[var(--panel-muted)] px-5 py-5 text-left transition hover:border-[var(--border-strong)]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[rgba(245,191,91,0.14)] text-lg font-black text-amber-200">
                        {(customer.name || "?").charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-lg font-black tracking-[-0.03em] text-[var(--text-primary)]">{customer.name || "Gäst"}</p>
                        <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[var(--text-muted)]">{customer.phone}</p>
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-2">
                      <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] ${customer.isActive ? "bg-emerald-300/12 text-emerald-100" : "bg-rose-300/12 text-rose-100"}`}>
                        {customer.isActive ? "Aktiv" : "Blockerad"}
                      </span>
                      {customer.isVerified ? <span className="control-chip text-sky-100"><ShieldCheck size={12} /> Verifierad</span> : null}
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3 text-sm text-[var(--text-secondary)]">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-muted)]">Mejl</p>
                      <p className="mt-1 truncate font-black text-[var(--text-primary)]">{customer.email || "Saknas"}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-muted)]">Ordrar</p>
                      <p className="mt-1 font-black text-[var(--text-primary)]">{customer._count?.orders || 0}</p>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </section>
      </div>

      <Modal open={!!selectedCustomerId} onClose={() => { setSelectedCustomerId(null); setSelectedCustomer(null); }} title={selectedCustomer ? selectedCustomer.name || "Kund" : "Kunddetalj"} maxWidth="max-w-6xl">
        {detailLoading ? (
          <div className="flex min-h-[320px] items-center justify-center">
            <Loader2 className="animate-spin text-amber-200" size={18} />
          </div>
        ) : !selectedCustomer ? (
          <div className="rounded-[22px] border border-dashed border-[var(--border-subtle)] px-6 py-16 text-center text-sm leading-7 text-[var(--text-secondary)]">
            Kunde inte ladda kunden.
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div className="flex items-center gap-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-[28px] bg-gold-gradient text-2xl font-black text-[#091018]">
                  {(selectedCustomer.name || "?").charAt(0).toUpperCase()}
                </div>
                <div>
                  <h3 className="text-3xl font-black tracking-[-0.05em] text-[var(--text-primary)]">{selectedCustomer.name || "Gäst"}</h3>
                  <p className="mt-1 text-[11px] font-black uppercase tracking-[0.22em] text-[var(--text-muted)]">Kund sedan {new Date(selectedCustomer.createdAt).toLocaleDateString("sv-SE")}</p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={toggleStatus} className="control-chip">
                  <Lock size={13} /> {selectedCustomer.isActive ? "Blockera" : "Återaktivera"}
                </button>
                <button type="button" onClick={() => setEditCustomer(selectedCustomer)} className="control-chip">
                  <UserRound size={13} /> Redigera
                </button>
                <button type="button" onClick={() => setDeleteTarget(selectedCustomer)} className="control-chip text-rose-200">
                  <Trash2 size={13} /> Radera
                </button>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {[
                { label: "Ordrar", value: selectedCustomer.orders.length, icon: ShoppingBag },
                { label: "Spenderat", value: `${Math.round(selectedCustomer.orders.reduce((sum, order) => sum + order.total, 0) / 100)} kr`, icon: CreditCard },
                { label: "Deals", value: selectedCustomer.deals.length, icon: Ticket },
                { label: "Status", value: selectedCustomer.isActive ? "Aktiv" : "Blockerad", icon: ShieldCheck },
              ].map((card) => {
                const Icon = card.icon;
                return (
                  <div key={card.label} className="metric-card panel-muted">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-muted)]">{card.label}</p>
                        <p className="mt-3 text-3xl font-black tracking-[-0.05em] text-[var(--text-primary)]">{card.value}</p>
                      </div>
                      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[rgba(245,191,91,0.12)] text-amber-200">
                        <Icon size={18} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="grid gap-5 xl:grid-cols-[0.88fr_1.12fr]">
              <div className="space-y-5">
                <div className="rounded-[24px] border border-[var(--border-subtle)] bg-[var(--panel-muted)] px-5 py-5">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-muted)]">Profil</p>
                  <div className="mt-4 grid gap-3 text-sm">
                    {[
                      { label: "Telefon", value: selectedCustomer.phone || "Saknas", icon: Phone },
                      { label: "E-post", value: selectedCustomer.email || "Saknas", icon: Mail },
                      { label: "Adress", value: selectedCustomer.address || "Saknas", icon: MapPin },
                      { label: "Stad", value: selectedCustomer.city || "Saknas", icon: MapPin },
                    ].map((item) => {
                      const Icon = item.icon;
                      return (
                        <div key={item.label} className="flex items-start gap-3 rounded-2xl border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.02)] px-4 py-4">
                          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[rgba(245,191,91,0.12)] text-amber-200">
                            <Icon size={16} />
                          </div>
                          <div>
                            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-muted)]">{item.label}</p>
                            <p className="mt-1 text-sm font-black text-[var(--text-primary)]">{item.value}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="rounded-[24px] border border-[var(--border-subtle)] bg-[var(--panel-muted)] px-5 py-5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-muted)]">Support</p>
                      <p className="mt-1 text-xl font-black tracking-[-0.03em] text-[var(--text-primary)]">Intern notering</p>
                    </div>
                    <button type="button" onClick={saveSupportNote} disabled={savingNote} className="inline-flex items-center gap-2 rounded-2xl bg-gold-gradient px-4 py-3 text-[11px] font-black uppercase tracking-[0.22em] text-[#091018] disabled:opacity-60">
                      <MessageSquare size={14} /> {savingNote ? "Sparar" : "Spara"}
                    </button>
                  </div>
                  <textarea value={supportNote} onChange={(event) => setSupportNote(event.target.value)} className="control-input mt-4 min-h-[180px] resize-none" placeholder="Skriv supporthistorik, återkoppling eller risknotering här" />
                </div>
              </div>

              <div className="space-y-5">
                <div className="rounded-[24px] border border-[var(--border-subtle)] bg-[var(--panel-muted)] px-5 py-5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-muted)]">Personliga deals</p>
                      <p className="mt-1 text-xl font-black tracking-[-0.03em] text-[var(--text-primary)]">Aktiva incitament</p>
                    </div>
                    <button type="button" onClick={() => setDealModalOpen(true)} className="control-chip">
                      <Ticket size={13} /> Ny deal
                    </button>
                  </div>

                  <div className="mt-4 grid gap-3">
                    {selectedCustomer.deals.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-[var(--border-subtle)] px-4 py-10 text-center text-sm text-[var(--text-secondary)]">
                        Kunden har inga personliga deals ännu.
                      </div>
                    ) : (
                      selectedCustomer.deals.map((deal) => (
                        <div key={deal.id} className="rounded-2xl border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.02)] px-4 py-4">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-base font-black tracking-[-0.03em] text-[var(--text-primary)]">{deal.campaign?.title || deal.code}</p>
                              <p className="mt-1 text-[11px] font-black uppercase tracking-[0.2em] text-amber-200">{deal.code}</p>
                            </div>
                            <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] ${deal.isUsed ? "bg-rose-300/12 text-rose-100" : "bg-emerald-300/12 text-emerald-100"}`}>
                              {deal.isUsed ? "Förbrukad" : "Aktiv"}
                            </span>
                          </div>

                          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-[var(--text-secondary)]">
                            <span>{deal.campaign?.discountType === "FIXED" ? `${deal.campaign.discountValue / 100} kr` : `${deal.campaign?.discountValue}%`} rabatt</span>
                            <span>•</span>
                            <span>{deal.usageCount}/{deal.maxUsages} användningar</span>
                          </div>

                          <div className="mt-4 flex flex-wrap items-center gap-2">
                            <button type="button" onClick={() => void updateDeal(deal.id, { isUsed: !deal.isUsed, usageCount: deal.isUsed ? 0 : deal.usageCount })} className="control-chip">
                              {deal.isUsed ? "Återaktivera" : "Markera använd"}
                            </button>
                            <button type="button" onClick={() => void deleteDeal(deal.id)} className="control-chip text-rose-200">
                              <Trash2 size={13} /> Ta bort
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="rounded-[24px] border border-[var(--border-subtle)] bg-[var(--panel-muted)] px-5 py-5">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-muted)]">Orderhistorik</p>
                  <div className="mt-4 grid gap-3">
                    {selectedCustomer.orders.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-[var(--border-subtle)] px-4 py-10 text-center text-sm text-[var(--text-secondary)]">
                        Kunden har inga ordrar ännu.
                      </div>
                    ) : (
                      selectedCustomer.orders.map((order) => (
                        <div key={order.id} className="rounded-2xl border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.02)] px-4 py-4">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-base font-black tracking-[-0.03em] text-[var(--text-primary)]">#{order.orderNumber}</p>
                              <p className="mt-1 text-[11px] font-black uppercase tracking-[0.2em] text-[var(--text-muted)]">{order.restaurant?.name || "MatGo"}</p>
                            </div>
                            <span className="control-chip">{order.status}</span>
                          </div>
                          <div className="mt-3 flex items-center justify-between gap-3 text-sm text-[var(--text-secondary)]">
                            <span>{new Date(order.createdAt).toLocaleDateString("sv-SE")}</span>
                            <span className="font-black text-amber-200">{currency(order.total)}</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={!!editCustomer} onClose={() => setEditCustomer(null)} title="Redigera kund" maxWidth="max-w-2xl">
        {editCustomer ? (
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              const formData = new FormData(event.currentTarget);
              const payload = Object.fromEntries(formData.entries());
              try {
                await updateCustomer(editCustomer.id, payload);
                success("Kundprofilen uppdaterades.");
                setEditCustomer(null);
              } catch (err: any) {
                toastError(err.message);
              }
            }}
            className="grid gap-4"
          >
            <div className="grid gap-4 md:grid-cols-2">
              {[
                { name: "name", label: "Namn", value: editCustomer.name || "" },
                { name: "phone", label: "Telefon", value: editCustomer.phone || "" },
                { name: "email", label: "E-post", value: editCustomer.email || "" },
                { name: "address", label: "Adress", value: editCustomer.address || "" },
                { name: "city", label: "Stad", value: editCustomer.city || "" },
                { name: "zip", label: "Postnummer", value: editCustomer.zip || "" },
              ].map((field) => (
                <label key={field.name} className="grid gap-2 text-[11px] font-bold text-[var(--text-secondary)]">
                  <span>{field.label}</span>
                  <input name={field.name} defaultValue={field.value} className={inputCls} />
                </label>
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
              <button type="button" onClick={() => setEditCustomer(null)} className="control-chip">Avbryt</button>
              <button type="submit" className="inline-flex items-center gap-2 rounded-2xl bg-gold-gradient px-4 py-3 text-[11px] font-black uppercase tracking-[0.22em] text-[#091018]">
                Spara kund
              </button>
            </div>
          </form>
        ) : null}
      </Modal>

      <Modal open={dealModalOpen} onClose={() => setDealModalOpen(false)} title="Skapa personlig deal" maxWidth="max-w-lg">
        <div className="grid gap-4">
          <label className="grid gap-2 text-[11px] font-bold text-[var(--text-secondary)]">
            <span>Titel</span>
            <input value={dealForm.title} onChange={(event) => setDealForm((previous) => ({ ...previous, title: event.target.value }))} className={inputCls} />
          </label>
          <label className="grid gap-2 text-[11px] font-bold text-[var(--text-secondary)]">
            <span>Kod</span>
            <input value={dealForm.code} onChange={(event) => setDealForm((previous) => ({ ...previous, code: event.target.value.toUpperCase() }))} className={inputCls} />
          </label>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2 text-[11px] font-bold text-[var(--text-secondary)]">
              <span>Typ</span>
              <select value={dealForm.discountType} onChange={(event) => setDealForm((previous) => ({ ...previous, discountType: event.target.value }))} className={inputCls}>
                <option value="PERCENTAGE">Procent</option>
                <option value="FIXED">Fast belopp</option>
              </select>
            </label>
            <label className="grid gap-2 text-[11px] font-bold text-[var(--text-secondary)]">
              <span>Värde</span>
              <input type="number" value={dealForm.discountValue} onChange={(event) => setDealForm((previous) => ({ ...previous, discountValue: Number(event.target.value) }))} className={inputCls} />
            </label>
            <label className="grid gap-2 text-[11px] font-bold text-[var(--text-secondary)]">
              <span>Max användningar</span>
              <input type="number" min={1} value={dealForm.maxUsages} onChange={(event) => setDealForm((previous) => ({ ...previous, maxUsages: Number(event.target.value) }))} className={inputCls} />
            </label>
            <label className="grid gap-2 text-[11px] font-bold text-[var(--text-secondary)]">
              <span>Giltig till</span>
              <input type="date" value={dealForm.validUntil} onChange={(event) => setDealForm((previous) => ({ ...previous, validUntil: event.target.value }))} className={inputCls} />
            </label>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
            <button type="button" onClick={() => setDealModalOpen(false)} className="control-chip">Avbryt</button>
            <button type="button" onClick={() => void createPersonalDeal()} className="inline-flex items-center gap-2 rounded-2xl bg-gold-gradient px-4 py-3 text-[11px] font-black uppercase tracking-[0.22em] text-[#091018]">
              Skapa deal
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={deleteCustomer}
        title="Radera kund"
        message={`Radera ${deleteTarget?.name} permanent? Detta går inte att ångra.`}
        confirmLabel="Radera"
        danger
      />
    </>
  );
}
