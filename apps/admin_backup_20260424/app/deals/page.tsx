"use client";

import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import {
  Gift,
  Globe,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Store,
  Ticket,
  Trash2,
  Users,
} from "lucide-react";
import { Modal, ConfirmModal } from "@/components/Modal";
import { useToast } from "@/components/Toast";
import { API_URL } from "@/lib/api";
import { getStoredToken } from "@/lib/auth-storage";

type DealCategory = "restaurant" | "customer";

type RestaurantSummary = {
  id: string;
  name: string;
};

type CustomerSummary = {
  id: string;
  name: string;
  phone: string;
};

type RestaurantDeal = {
  id: string;
  title: string;
  description?: string | null;
  discountType: string;
  discountValue: number;
  minOrder: number;
  isActive: boolean;
  isGlobal: boolean;
  showOnSite: boolean;
  validUntil?: string | null;
  maxUsages?: number | null;
  restaurant?: { id: string; name: string; slug: string } | null;
  applicableRestaurantIds?: string[];
};

type CustomerDeal = {
  id: string;
  code: string;
  isUsed: boolean;
  usageCount: number;
  maxUsages: number;
  createdAt: string;
  user?: { name?: string | null; phone?: string | null } | null;
  campaign?: { title?: string | null; discountType?: string | null; discountValue?: number | null } | null;
};

const inputCls = "control-input";

const emptyRestaurantDeal = {
  title: "",
  description: "",
  discountType: "PERCENTAGE",
  discountValue: 10,
  minOrder: 0,
  isGlobal: true,
  applicableRestaurantIds: [] as string[],
  isActive: true,
  showOnSite: true,
  maxUsages: "",
  validUntil: "",
};

const emptyCustomerDeal = {
  title: "",
  code: "",
  discountType: "FIXED",
  discountValue: 30,
  maxUsages: 1,
  validUntil: "",
};

const formatRestaurantDealValue = (deal: RestaurantDeal) =>
  deal.discountType === "FIXED" ? `${deal.discountValue} kr` : `${deal.discountValue}%`;

export default function DealsPage() {
  const { success, error: toastError } = useToast();
  const [category, setCategory] = useState<DealCategory>("restaurant");
  const [restaurantDeals, setRestaurantDeals] = useState<RestaurantDeal[]>([]);
  const [customerDeals, setCustomerDeals] = useState<CustomerDeal[]>([]);
  const [restaurants, setRestaurants] = useState<RestaurantSummary[]>([]);
  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dealModalOpen, setDealModalOpen] = useState(false);
  const [dealForm, setDealForm] = useState(emptyRestaurantDeal);
  const [editingDealId, setEditingDealId] = useState<string | null>(null);
  const [customerDealModalOpen, setCustomerDealModalOpen] = useState(false);
  const [customerDealForm, setCustomerDealForm] = useState(emptyCustomerDeal);
  const [selectedCustomerIds, setSelectedCustomerIds] = useState<string[]>([]);
  const [sendToAllCustomers, setSendToAllCustomers] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string; type: DealCategory } | null>(null);

  const token = getStoredToken();

  const fetchData = async () => {
    if (!token) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const [restaurantDealsRes, customerDealsRes, restaurantsRes, customersRes] = await Promise.all([
        axios.get(`${API_URL}/api/admin/deals`, { headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`${API_URL}/api/admin/customer-deals`, { headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`${API_URL}/api/restaurants`),
        axios.get(`${API_URL}/api/customers`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);

      setRestaurantDeals(restaurantDealsRes.data || []);
      setCustomerDeals(customerDealsRes.data || []);
      setRestaurants(restaurantsRes.data || []);
      setCustomers(customersRes.data || []);
    } catch (err: any) {
      toastError(err.response?.data?.error || "Kunde inte ladda deals-ytan.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchData();
  }, []);

  const filteredRestaurantDeals = useMemo(() => {
    return restaurantDeals.filter((deal) => {
      if (!search.trim()) return true;
      const query = search.toLowerCase();
      return (
        deal.title.toLowerCase().includes(query) ||
        (deal.description || "").toLowerCase().includes(query) ||
        (deal.restaurant?.name || "").toLowerCase().includes(query)
      );
    });
  }, [restaurantDeals, search]);

  const filteredCustomerDeals = useMemo(() => {
    return customerDeals.filter((deal) => {
      if (!search.trim()) return true;
      const query = search.toLowerCase();
      return (
        (deal.user?.name || "").toLowerCase().includes(query) ||
        (deal.user?.phone || "").toLowerCase().includes(query) ||
        (deal.campaign?.title || "").toLowerCase().includes(query) ||
        deal.code.toLowerCase().includes(query)
      );
    });
  }, [customerDeals, search]);

  const stats = useMemo(() => ({
    restaurantTotal: restaurantDeals.length,
    restaurantActive: restaurantDeals.filter((deal) => deal.isActive).length,
    globalDeals: restaurantDeals.filter((deal) => deal.isGlobal).length,
    customerTotal: customerDeals.length,
    customerActive: customerDeals.filter((deal) => !deal.isUsed).length,
  }), [customerDeals, restaurantDeals]);

  const toggleRestaurantDeal = async (deal: RestaurantDeal) => {
    if (!token) return;

    try {
      await axios.patch(
        `${API_URL}/api/admin/deals/${deal.id}`,
        { isActive: !deal.isActive },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setRestaurantDeals((previous) => previous.map((item) => (item.id === deal.id ? { ...item, isActive: !item.isActive } : item)));
      success(!deal.isActive ? "Dealen aktiverades." : "Dealen pausades.");
    } catch (err: any) {
      toastError(err.response?.data?.error || "Kunde inte uppdatera dealen.");
    }
  };

  const toggleCustomerDeal = async (deal: CustomerDeal) => {
    if (!token) return;

    try {
      await axios.patch(
        `${API_URL}/api/admin/customer-deals/${deal.id}`,
        { isUsed: !deal.isUsed },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setCustomerDeals((previous) => previous.map((item) => (item.id === deal.id ? { ...item, isUsed: !item.isUsed } : item)));
      success(!deal.isUsed ? "Dealen markerades som förbrukad." : "Dealen återaktiverades.");
    } catch (err: any) {
      toastError(err.response?.data?.error || "Kunde inte uppdatera kunddealen.");
    }
  };

  const saveRestaurantDeal = async () => {
    if (!token) return;

    const payload = {
      title: dealForm.title,
      description: dealForm.description || null,
      discountType: dealForm.discountType,
      discountValue: Number(dealForm.discountValue),
      minOrder: Number(dealForm.minOrder || 0),
      isGlobal: dealForm.isGlobal,
      applicableRestaurantIds: dealForm.isGlobal ? [] : dealForm.applicableRestaurantIds,
      restaurantId: !dealForm.isGlobal && dealForm.applicableRestaurantIds.length === 1 ? dealForm.applicableRestaurantIds[0] : null,
      isActive: dealForm.isActive,
      showOnSite: dealForm.showOnSite,
      maxUsages: dealForm.maxUsages ? Number(dealForm.maxUsages) : null,
      validUntil: dealForm.validUntil || null,
    };

    try {
      if (editingDealId) {
        const response = await axios.patch(`${API_URL}/api/admin/deals/${editingDealId}`, payload, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setRestaurantDeals((previous) => previous.map((deal) => (deal.id === editingDealId ? response.data : deal)));
        success("Dealen uppdaterades.");
      } else {
        const response = await axios.post(`${API_URL}/api/admin/deals`, payload, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setRestaurantDeals((previous) => [response.data, ...previous]);
        success("Dealen skapades.");
      }

      setDealModalOpen(false);
      setEditingDealId(null);
      setDealForm(emptyRestaurantDeal);
      await fetchData();
    } catch (err: any) {
      toastError(err.response?.data?.error || "Kunde inte spara dealen.");
    }
  };

  const openEditModal = (deal: RestaurantDeal) => {
    setEditingDealId(deal.id);
    setDealForm({
      title: deal.title,
      description: deal.description || "",
      discountType: deal.discountType,
      discountValue: deal.discountValue,
      minOrder: deal.minOrder,
      isGlobal: deal.isGlobal,
      applicableRestaurantIds: deal.applicableRestaurantIds || (deal.restaurant?.id ? [deal.restaurant.id] : []),
      isActive: deal.isActive,
      showOnSite: deal.showOnSite,
      maxUsages: deal.maxUsages ? String(deal.maxUsages) : "",
      validUntil: deal.validUntil ? deal.validUntil.slice(0, 10) : "",
    });
    setDealModalOpen(true);
  };

  const createCustomerDeals = async () => {
    if (!token) return;

    const recipientIds = sendToAllCustomers ? customers.map((customer) => customer.id) : selectedCustomerIds;
    if (recipientIds.length === 0) {
      toastError("Välj minst en kund.");
      return;
    }

    try {
      await Promise.all(
        recipientIds.map((id, index) =>
          axios.post(
            `${API_URL}/api/customers/${id}/deals`,
            {
              title: customerDealForm.title,
              code: sendToAllCustomers ? `${customerDealForm.code}-${String(index + 1).padStart(3, "0")}` : customerDealForm.code,
              discountType: customerDealForm.discountType,
              discountValue: Number(customerDealForm.discountValue),
              maxUsages: Number(customerDealForm.maxUsages),
              validUntil: customerDealForm.validUntil || null,
            },
            { headers: { Authorization: `Bearer ${token}` } }
          )
        )
      );

      setCustomerDealModalOpen(false);
      setCustomerDealForm(emptyCustomerDeal);
      setSelectedCustomerIds([]);
      setSendToAllCustomers(false);
      success(`Deal skickad till ${recipientIds.length} kund${recipientIds.length > 1 ? "er" : ""}.`);
      await fetchData();
    } catch (err: any) {
      toastError(err.response?.data?.error || "Kunde inte skapa personliga deals.");
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget || !token) return;

    try {
      if (deleteTarget.type === "restaurant") {
        await axios.delete(`${API_URL}/api/admin/deals/${deleteTarget.id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setRestaurantDeals((previous) => previous.filter((deal) => deal.id !== deleteTarget.id));
      } else {
        await axios.delete(`${API_URL}/api/admin/customer-deals/${deleteTarget.id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setCustomerDeals((previous) => previous.filter((deal) => deal.id !== deleteTarget.id));
      }

      success("Dealen togs bort.");
      setDeleteTarget(null);
    } catch (err: any) {
      toastError(err.response?.data?.error || "Kunde inte radera dealen.");
    }
  };

  const filteredCustomersForModal = useMemo(() => {
    if (!search.trim()) return customers;
    const query = search.toLowerCase();
    return customers.filter((customer) => customer.name.toLowerCase().includes(query) || customer.phone.toLowerCase().includes(query));
  }, [customers, search]);

  if (loading) {
    return (
      <div className="panel flex min-h-[360px] items-center justify-center rounded-[32px] px-6 py-12">
        <div className="flex items-center gap-3 text-[var(--text-secondary)]">
          <Loader2 className="animate-spin text-amber-200" size={18} />
          <span className="text-sm font-bold">Laddar deals-verktygen…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-16">
      <section className="panel rounded-[32px] px-6 py-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="space-y-3">
            <span className="control-chip">Growth engine</span>
            <div>
              <h2 className="text-3xl font-black tracking-[-0.06em] text-[var(--text-primary)] sm:text-4xl">Deals utan kampanj-sprawl</h2>
              <p className="mt-2 max-w-3xl text-sm leading-7 text-[var(--text-secondary)] sm:text-base">
                Restaurangdeals och personliga kundkoder ligger nu i ett tydligare flöde. Fokus är snabb aktivering, enkel målgrupp och mindre admin-röra.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => void fetchData()} className="control-chip">
              <RefreshCw size={13} /> Synka
            </button>
            <button type="button" onClick={() => { setEditingDealId(null); setDealForm(emptyRestaurantDeal); setDealModalOpen(true); }} className="inline-flex items-center gap-2 rounded-2xl bg-gold-gradient px-4 py-3 text-[11px] font-black uppercase tracking-[0.22em] text-[#091018]">
              <Plus size={14} /> Ny restaurangdeal
            </button>
            <button type="button" onClick={() => { setCustomerDealModalOpen(true); setCustomerDealForm(emptyCustomerDeal); setSelectedCustomerIds([]); setSendToAllCustomers(false); }} className="control-chip">
              <Users size={13} /> Kunddeal
            </button>
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-5">
        {[
          { label: "Restaurangdeals", value: stats.restaurantTotal, sub: `${stats.restaurantActive} aktiva nu` },
          { label: "Globala deals", value: stats.globalDeals, sub: "Syns över flera restauranger" },
          { label: "Personliga koder", value: stats.customerTotal, sub: `${stats.customerActive} aktiva kundkoder` },
          { label: "Partnerrestauranger", value: restaurants.length, sub: "Tillgängliga målgrupper" },
          { label: "Kundbas", value: customers.length, sub: "Möjliga mottagare" },
        ].map((card) => (
          <article key={card.label} className="metric-card panel-muted">
            <p className="text-[10px] font-black uppercase tracking-[0.28em] text-[var(--text-muted)]">{card.label}</p>
            <p className="mt-3 text-3xl font-black tracking-[-0.05em] text-[var(--text-primary)]">{card.value}</p>
            <p className="mt-4 text-sm leading-6 text-[var(--text-secondary)]">{card.sub}</p>
          </article>
        ))}
      </section>

      <section className="panel rounded-[32px] px-6 py-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="relative flex-1">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Sök deal, kod, kund eller restaurang" className="control-input pl-10" />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {([
              { id: "restaurant", label: "Restaurangdeals" },
              { id: "customer", label: "Personliga deals" },
            ] as const).map((item) => (
              <button key={item.id} type="button" onClick={() => setCategory(item.id)} className={`rounded-2xl px-4 py-3 text-[11px] font-black uppercase tracking-[0.22em] ${category === item.id ? "bg-gold-gradient text-[#091018]" : "border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] text-[var(--text-secondary)]"}`}>
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-5 grid gap-4 xl:grid-cols-2">
          {category === "restaurant" ? (
            filteredRestaurantDeals.length === 0 ? (
              <div className="xl:col-span-2 rounded-[28px] border border-dashed border-[var(--border-subtle)] px-6 py-16 text-center text-sm leading-7 text-[var(--text-secondary)]">
                Inga restaurangdeals matchade filtren.
              </div>
            ) : (
              filteredRestaurantDeals.map((deal) => (
                <article key={deal.id} className="rounded-[30px] border border-[var(--border-subtle)] bg-[var(--panel-muted)] px-5 py-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-2xl font-black tracking-[-0.05em] text-[var(--text-primary)]">{deal.title}</span>
                        <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] ${deal.isActive ? "bg-emerald-300/12 text-emerald-100" : "bg-rose-300/12 text-rose-100"}`}>
                          {deal.isActive ? "Aktiv" : "Pausad"}
                        </span>
                      </div>
                      <p className="text-sm leading-7 text-[var(--text-secondary)]">{deal.description || "Ingen beskrivning satt ännu."}</p>
                    </div>
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[rgba(245,191,91,0.12)] text-amber-200">
                      {deal.isGlobal ? <Globe size={18} /> : <Store size={18} />}
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] px-4 py-3">
                      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-muted)]">Rabatt</p>
                      <p className="mt-1 text-lg font-black text-[var(--text-primary)]">{formatRestaurantDealValue(deal)}</p>
                      <p className="mt-1 text-xs text-[var(--text-secondary)]">Minsta order {deal.minOrder} kr</p>
                    </div>
                    <div className="rounded-2xl border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] px-4 py-3">
                      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-muted)]">Scope</p>
                      <p className="mt-1 text-lg font-black text-[var(--text-primary)]">{deal.isGlobal ? "Global" : deal.restaurant?.name || `${deal.applicableRestaurantIds?.length || 0} restauranger`}</p>
                      <p className="mt-1 text-xs text-[var(--text-secondary)]">{deal.showOnSite ? "Visas på sajten" : "Intern/hidden"}</p>
                    </div>
                  </div>

                  <div className="mt-5 flex flex-wrap items-center gap-2">
                    <button type="button" onClick={() => void toggleRestaurantDeal(deal)} className="control-chip">
                      {deal.isActive ? "Pausa" : "Aktivera"}
                    </button>
                    <button type="button" onClick={() => openEditModal(deal)} className="control-chip">
                      <Gift size={13} /> Redigera
                    </button>
                    <button type="button" onClick={() => setDeleteTarget({ id: deal.id, title: deal.title, type: "restaurant" })} className="control-chip text-rose-200">
                      <Trash2 size={13} /> Radera
                    </button>
                  </div>
                </article>
              ))
            )
          ) : filteredCustomerDeals.length === 0 ? (
            <div className="xl:col-span-2 rounded-[28px] border border-dashed border-[var(--border-subtle)] px-6 py-16 text-center text-sm leading-7 text-[var(--text-secondary)]">
              Inga personliga deals matchade filtren.
            </div>
          ) : (
            filteredCustomerDeals.map((deal) => (
              <article key={deal.id} className="rounded-[30px] border border-[var(--border-subtle)] bg-[var(--panel-muted)] px-5 py-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-2xl font-black tracking-[-0.05em] text-[var(--text-primary)]">{deal.campaign?.title || "Kunddeal"}</span>
                      <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] ${deal.isUsed ? "bg-rose-300/12 text-rose-100" : "bg-emerald-300/12 text-emerald-100"}`}>
                        {deal.isUsed ? "Förbrukad" : "Aktiv"}
                      </span>
                    </div>
                    <p className="mt-2 text-sm leading-7 text-[var(--text-secondary)]">
                      {deal.user?.name || deal.user?.phone || "Okänd kund"} • {deal.code}
                    </p>
                  </div>
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[rgba(52,211,153,0.12)] text-emerald-200">
                    <Users size={18} />
                  </div>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] px-4 py-3">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-muted)]">Värde</p>
                    <p className="mt-1 text-lg font-black text-[var(--text-primary)]">
                      {deal.campaign?.discountType === "FIXED" ? `${(deal.campaign.discountValue || 0) / 100} kr` : `${deal.campaign?.discountValue || 0}%`}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] px-4 py-3">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-muted)]">Användning</p>
                    <p className="mt-1 text-lg font-black text-[var(--text-primary)]">{deal.usageCount}/{deal.maxUsages}</p>
                  </div>
                </div>

                <div className="mt-5 flex flex-wrap items-center gap-2">
                  <button type="button" onClick={() => void toggleCustomerDeal(deal)} className="control-chip">
                    {deal.isUsed ? "Återaktivera" : "Markera använd"}
                  </button>
                  <button type="button" onClick={() => setDeleteTarget({ id: deal.id, title: deal.campaign?.title || deal.code, type: "customer" })} className="control-chip text-rose-200">
                    <Trash2 size={13} /> Radera
                  </button>
                </div>
              </article>
            ))
          )}
        </div>
      </section>

      <Modal open={dealModalOpen} onClose={() => setDealModalOpen(false)} title={editingDealId ? "Redigera restaurangdeal" : "Ny restaurangdeal"} maxWidth="max-w-2xl">
        <div className="grid gap-4">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2 text-[11px] font-bold text-[var(--text-secondary)] md:col-span-2">
              <span>Titel</span>
              <input value={dealForm.title} onChange={(event) => setDealForm((previous) => ({ ...previous, title: event.target.value }))} className={inputCls} />
            </label>
            <label className="grid gap-2 text-[11px] font-bold text-[var(--text-secondary)] md:col-span-2">
              <span>Beskrivning</span>
              <textarea value={dealForm.description} onChange={(event) => setDealForm((previous) => ({ ...previous, description: event.target.value }))} className={`${inputCls} min-h-[100px] resize-none`} />
            </label>
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
              <span>Minsta order</span>
              <input type="number" value={dealForm.minOrder} onChange={(event) => setDealForm((previous) => ({ ...previous, minOrder: Number(event.target.value) }))} className={inputCls} />
            </label>
            <label className="grid gap-2 text-[11px] font-bold text-[var(--text-secondary)]">
              <span>Max användningar</span>
              <input type="number" value={dealForm.maxUsages} onChange={(event) => setDealForm((previous) => ({ ...previous, maxUsages: event.target.value }))} className={inputCls} />
            </label>
            <label className="grid gap-2 text-[11px] font-bold text-[var(--text-secondary)] md:col-span-2">
              <span>Giltig till</span>
              <input type="date" value={dealForm.validUntil} onChange={(event) => setDealForm((previous) => ({ ...previous, validUntil: event.target.value }))} className={inputCls} />
            </label>
          </div>

          <div className="grid gap-3 rounded-[24px] border border-[var(--border-subtle)] bg-[var(--panel-muted)] px-4 py-4">
            <label className="inline-flex items-center gap-3 text-sm font-bold text-[var(--text-primary)]">
              <input type="checkbox" checked={dealForm.isGlobal} onChange={(event) => setDealForm((previous) => ({ ...previous, isGlobal: event.target.checked, applicableRestaurantIds: event.target.checked ? [] : previous.applicableRestaurantIds }))} />
              Global deal över alla restauranger
            </label>

            {!dealForm.isGlobal ? (
              <div className="grid gap-2 md:grid-cols-2">
                {restaurants.map((restaurant) => (
                  <label key={restaurant.id} className="inline-flex items-center gap-3 rounded-2xl border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] px-4 py-3 text-sm font-bold text-[var(--text-secondary)]">
                    <input
                      type="checkbox"
                      checked={dealForm.applicableRestaurantIds.includes(restaurant.id)}
                      onChange={() =>
                        setDealForm((previous) => ({
                          ...previous,
                          applicableRestaurantIds: previous.applicableRestaurantIds.includes(restaurant.id)
                            ? previous.applicableRestaurantIds.filter((id) => id !== restaurant.id)
                            : [...previous.applicableRestaurantIds, restaurant.id],
                        }))
                      }
                    />
                    {restaurant.name}
                  </label>
                ))}
              </div>
            ) : null}

            <div className="grid gap-2 md:grid-cols-2">
              <label className="inline-flex items-center gap-3 rounded-2xl border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] px-4 py-3 text-sm font-bold text-[var(--text-secondary)]">
                <input type="checkbox" checked={dealForm.isActive} onChange={(event) => setDealForm((previous) => ({ ...previous, isActive: event.target.checked }))} />
                Aktiv direkt
              </label>
              <label className="inline-flex items-center gap-3 rounded-2xl border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] px-4 py-3 text-sm font-bold text-[var(--text-secondary)]">
                <input type="checkbox" checked={dealForm.showOnSite} onChange={(event) => setDealForm((previous) => ({ ...previous, showOnSite: event.target.checked }))} />
                Visa på webb/app
              </label>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
            <button type="button" onClick={() => setDealModalOpen(false)} className="control-chip">Avbryt</button>
            <button type="button" onClick={() => void saveRestaurantDeal()} className="inline-flex items-center gap-2 rounded-2xl bg-gold-gradient px-4 py-3 text-[11px] font-black uppercase tracking-[0.22em] text-[#091018]">
              <Sparkles size={14} /> {editingDealId ? "Spara ändringar" : "Skapa deal"}
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={customerDealModalOpen} onClose={() => setCustomerDealModalOpen(false)} title="Skapa personliga deals" maxWidth="max-w-2xl">
        <div className="grid gap-4">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2 text-[11px] font-bold text-[var(--text-secondary)] md:col-span-2">
              <span>Dealnamn</span>
              <input value={customerDealForm.title} onChange={(event) => setCustomerDealForm((previous) => ({ ...previous, title: event.target.value }))} className={inputCls} />
            </label>
            <label className="grid gap-2 text-[11px] font-bold text-[var(--text-secondary)]">
              <span>Kodprefix</span>
              <input value={customerDealForm.code} onChange={(event) => setCustomerDealForm((previous) => ({ ...previous, code: event.target.value.toUpperCase() }))} className={inputCls} />
            </label>
            <label className="grid gap-2 text-[11px] font-bold text-[var(--text-secondary)]">
              <span>Typ</span>
              <select value={customerDealForm.discountType} onChange={(event) => setCustomerDealForm((previous) => ({ ...previous, discountType: event.target.value }))} className={inputCls}>
                <option value="FIXED">Fast belopp</option>
                <option value="PERCENTAGE">Procent</option>
              </select>
            </label>
            <label className="grid gap-2 text-[11px] font-bold text-[var(--text-secondary)]">
              <span>Värde</span>
              <input type="number" value={customerDealForm.discountValue} onChange={(event) => setCustomerDealForm((previous) => ({ ...previous, discountValue: Number(event.target.value) }))} className={inputCls} />
            </label>
            <label className="grid gap-2 text-[11px] font-bold text-[var(--text-secondary)]">
              <span>Max användningar</span>
              <input type="number" min={1} value={customerDealForm.maxUsages} onChange={(event) => setCustomerDealForm((previous) => ({ ...previous, maxUsages: Number(event.target.value) }))} className={inputCls} />
            </label>
          </div>

          <label className="grid gap-2 text-[11px] font-bold text-[var(--text-secondary)]">
            <span>Giltig till</span>
            <input type="date" value={customerDealForm.validUntil} onChange={(event) => setCustomerDealForm((previous) => ({ ...previous, validUntil: event.target.value }))} className={inputCls} />
          </label>

          <div className="grid gap-3 rounded-[24px] border border-[var(--border-subtle)] bg-[var(--panel-muted)] px-4 py-4">
            <label className="inline-flex items-center gap-3 text-sm font-bold text-[var(--text-primary)]">
              <input type="checkbox" checked={sendToAllCustomers} onChange={(event) => { setSendToAllCustomers(event.target.checked); if (event.target.checked) setSelectedCustomerIds([]); }} />
              Skicka till alla kunder
            </label>

            {!sendToAllCustomers ? (
              <div className="grid gap-2 md:grid-cols-2 max-h-[260px] overflow-y-auto">
                {filteredCustomersForModal.map((customer) => (
                  <label key={customer.id} className="inline-flex items-center gap-3 rounded-2xl border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] px-4 py-3 text-sm font-bold text-[var(--text-secondary)]">
                    <input
                      type="checkbox"
                      checked={selectedCustomerIds.includes(customer.id)}
                      onChange={() =>
                        setSelectedCustomerIds((previous) =>
                          previous.includes(customer.id) ? previous.filter((id) => id !== customer.id) : [...previous, customer.id]
                        )
                      }
                    />
                    <span>{customer.name} • {customer.phone}</span>
                  </label>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] px-4 py-4 text-sm text-[var(--text-secondary)]">
                Alla {customers.length} kunder får en unik kod baserad på prefixet.
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
            <button type="button" onClick={() => setCustomerDealModalOpen(false)} className="control-chip">Avbryt</button>
            <button type="button" onClick={() => void createCustomerDeals()} className="inline-flex items-center gap-2 rounded-2xl bg-gold-gradient px-4 py-3 text-[11px] font-black uppercase tracking-[0.22em] text-[#091018]">
              <Users size={14} /> Skicka deals
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Radera deal"
        message={`Radera "${deleteTarget?.title}" permanent?`}
        confirmLabel="Radera"
        danger
      />
    </div>
  );
}
