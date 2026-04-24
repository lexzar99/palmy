"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, RefreshCw, Users } from "lucide-react";
import {
  createDiscountCode,
  createPersonalCode,
  dealsQueryKey,
  dealCategoriesQueryKey,
  dealCustomersQueryKey,
  dealProductsQueryKey,
  dealRestaurantsQueryKey,
  deleteDiscountCode,
  deletePersonalCode,
  discountCodesQueryKey,
  getAutomaticDeals,
  getDealCategories,
  getDealCustomers,
  getDealProducts,
  getDealRestaurants,
  getDiscountCodes,
  getPersonalCodes,
  personalCodesQueryKey,
  type AutomaticDealRecord,
  type DealCustomerRef,
  type DealProductRef,
  type DiscountCodeRecord,
  type PersonalCodeRecord,
  updateDiscountCode,
  updatePersonalCode,
} from "@/modules/deals/api";
import { AutomaticDealModal } from "@/modules/deals/components/automatic-deal-modal";
import { Badge, Button, EmptyState, ErrorPanel, Field, Input, Modal, SectionHeader, Select, Surface, Textarea } from "@/shared/components/ui";
import { formatCurrency, formatDate, formatNumber } from "@/shared/utils/format";

type DealsTab = "restaurant" | "product" | "category" | "codes";

function DiscountCodeModal({ open, codeRecord, onClose }: { open: boolean; codeRecord: DiscountCodeRecord | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ code: "", description: "", discountType: "percentage", discountValue: 10, minOrderAmount: 0, maxUses: "", startsAt: "", expiresAt: "", isActive: true });

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!open) return;
    setForm(codeRecord ? { code: codeRecord.code, description: codeRecord.description || "", discountType: codeRecord.discountType, discountValue: codeRecord.discountValue, minOrderAmount: codeRecord.minOrderAmount, maxUses: codeRecord.maxUses ? String(codeRecord.maxUses) : "", startsAt: codeRecord.startsAt ? codeRecord.startsAt.slice(0, 10) : "", expiresAt: codeRecord.expiresAt ? codeRecord.expiresAt.slice(0, 10) : "", isActive: codeRecord.isActive } : { code: "", description: "", discountType: "percentage", discountValue: 10, minOrderAmount: 0, maxUses: "", startsAt: "", expiresAt: "", isActive: true });
  }, [codeRecord, open]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = {
        code: form.code,
        description: form.description || null,
        type: form.discountType === "fixed" ? "FIXED" : "PERCENTAGE",
        value: form.discountValue,
        minOrder: form.minOrderAmount,
        maxUsages: form.maxUses ? Number(form.maxUses) : null,
        validFrom: form.startsAt || null,
        validUntil: form.expiresAt || null,
        isActive: form.isActive,
      };
      return codeRecord ? updateDiscountCode(codeRecord.id, payload) : createDiscountCode(payload);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: discountCodesQueryKey });
      onClose();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!codeRecord) return { success: true };
      return deleteDiscountCode(codeRecord.id);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: discountCodesQueryKey });
      onClose();
    },
  });

  return (
    <Modal open={open} onClose={onClose} title={codeRecord ? codeRecord.code : "New discount code"} footer={<div className="flex items-center justify-between gap-3"><div>{codeRecord ? <Button variant="danger" onClick={() => deleteMutation.mutate()}>Delete</Button> : null}</div><div className="flex gap-2"><Button onClick={onClose}>Close</Button><Button variant="primary" onClick={() => saveMutation.mutate()}>Save code</Button></div></div>}>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Code"><Input value={form.code} onChange={(event) => setForm((current) => ({ ...current, code: event.target.value.toUpperCase() }))} /></Field>
        <Field label="Type"><Select value={form.discountType} onChange={(event) => setForm((current) => ({ ...current, discountType: event.target.value }))}><option value="percentage">Percentage</option><option value="fixed">Fixed</option></Select></Field>
        <Field label="Value"><Input type="number" value={form.discountValue} onChange={(event) => setForm((current) => ({ ...current, discountValue: Number(event.target.value) }))} /></Field>
        <Field label="Min order"><Input type="number" value={form.minOrderAmount} onChange={(event) => setForm((current) => ({ ...current, minOrderAmount: Number(event.target.value) }))} /></Field>
        <Field label="Max uses"><Input value={form.maxUses} onChange={(event) => setForm((current) => ({ ...current, maxUses: event.target.value }))} placeholder="Optional" /></Field>
        <Field label="Status"><Select value={form.isActive ? "active" : "inactive"} onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.value === "active" }))}><option value="active">Active</option><option value="inactive">Inactive</option></Select></Field>
        <Field label="Starts at"><Input type="date" value={form.startsAt} onChange={(event) => setForm((current) => ({ ...current, startsAt: event.target.value }))} /></Field>
        <Field label="Expires at"><Input type="date" value={form.expiresAt} onChange={(event) => setForm((current) => ({ ...current, expiresAt: event.target.value }))} /></Field>
        <div className="md:col-span-2"><Field label="Description"><Textarea value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} /></Field></div>
      </div>
    </Modal>
  );
}

function PersonalCodeModal({ open, customers, onClose }: { open: boolean; customers: DealCustomerRef[]; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [code, setCode] = useState("");
  const [discountType, setDiscountType] = useState("FIXED");
  const [discountValue, setDiscountValue] = useState(30);
  const [maxUsages, setMaxUsages] = useState(1);
  const [validUntil, setValidUntil] = useState("");
  const [selectedCustomerIds, setSelectedCustomerIds] = useState<string[]>([]);
  const [sendToAll, setSendToAll] = useState(false);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!open) return;
    setTitle("");
    setCode("");
    setDiscountType("FIXED");
    setDiscountValue(30);
    setMaxUsages(1);
    setValidUntil("");
    setSelectedCustomerIds([]);
    setSendToAll(false);
  }, [open]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const saveMutation = useMutation({
    mutationFn: async () => {
      const recipients = sendToAll ? customers.map((customer) => customer.id) : selectedCustomerIds;
      await Promise.all(
        recipients.map((customerId, index) =>
          createPersonalCode(customerId, {
            title,
            code: sendToAll ? `${code}-${String(index + 1).padStart(3, "0")}` : code,
            discountType,
            discountValue,
            maxUsages,
            validUntil: validUntil || null,
          }),
        ),
      );
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: personalCodesQueryKey });
      onClose();
    },
  });

  const toggleCustomer = (customerId: string) => {
    setSelectedCustomerIds((current) => current.includes(customerId) ? current.filter((id) => id !== customerId) : [...current, customerId]);
  };

  return (
    <Modal open={open} onClose={onClose} title="New personal code" footer={<div className="flex justify-end gap-2"><Button onClick={onClose}>Close</Button><Button variant="primary" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || (!sendToAll && selectedCustomerIds.length === 0) || !title.trim() || !code.trim()}>Create personal code</Button></div>}>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Title"><Input value={title} onChange={(event) => setTitle(event.target.value)} /></Field>
        <Field label="Code"><Input value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} /></Field>
        <Field label="Discount type"><Select value={discountType} onChange={(event) => setDiscountType(event.target.value)}><option value="FIXED">Fixed</option><option value="PERCENTAGE">Percentage</option></Select></Field>
        <Field label="Discount value"><Input type="number" value={discountValue} onChange={(event) => setDiscountValue(Number(event.target.value))} /></Field>
        <Field label="Max usages"><Input type="number" value={maxUsages} onChange={(event) => setMaxUsages(Number(event.target.value))} /></Field>
        <Field label="Valid until"><Input type="date" value={validUntil} onChange={(event) => setValidUntil(event.target.value)} /></Field>
        <div className="md:col-span-2 surface-muted px-4 py-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">Recipients</p>
            <Button variant="secondary" onClick={() => setSendToAll((current) => !current)}><Users size={16} /> {sendToAll ? "Use selection" : "Send to all"}</Button>
          </div>
          <div className="mt-3 flex max-h-[280px] flex-wrap gap-2 overflow-auto">
            {customers.map((customer) => (
              <button key={customer.id} type="button" disabled={sendToAll} onClick={() => toggleCustomer(customer.id)} className={`rounded-full border px-4 py-2 text-[11px] font-black uppercase tracking-[0.16em] ${selectedCustomerIds.includes(customer.id) || sendToAll ? "border-[rgba(94,166,255,0.24)] bg-[rgba(94,166,255,0.1)] text-[#d4e7ff]" : "border-[var(--border-subtle)] text-[var(--text-secondary)]"}`}>{customer.name} • {customer.phone}</button>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}

const scopeLabel: Record<string, string> = {
  RESTAURANT: "Restaurant",
  PRODUCT: "Products",
  CATEGORY: "Categories",
  COMBO: "Combo",
  MIN_ORDER: "Min order",
};

export function DealsPage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<DealsTab>("restaurant");
  const [query, setQuery] = useState("");
  const [selectedRestaurantId, setSelectedRestaurantId] = useState<string | null>(null);
  const [activeDeal, setActiveDeal] = useState<AutomaticDealRecord | null>(null);
  const [dealModalOpen, setDealModalOpen] = useState(false);
  const [activeCode, setActiveCode] = useState<DiscountCodeRecord | null>(null);
  const [codeModalOpen, setCodeModalOpen] = useState(false);
  const [personalCodeModalOpen, setPersonalCodeModalOpen] = useState(false);

  const automaticDeals = useQuery({ queryKey: dealsQueryKey, queryFn: getAutomaticDeals });
  const discountCodes = useQuery({ queryKey: discountCodesQueryKey, queryFn: getDiscountCodes });
  const personalCodes = useQuery({ queryKey: personalCodesQueryKey, queryFn: getPersonalCodes });
  const restaurants = useQuery({ queryKey: dealRestaurantsQueryKey, queryFn: getDealRestaurants });
  const customers = useQuery({ queryKey: dealCustomersQueryKey, queryFn: getDealCustomers });
  const categories = useQuery({ queryKey: dealCategoriesQueryKey(selectedRestaurantId), queryFn: () => getDealCategories(selectedRestaurantId!), enabled: Boolean(selectedRestaurantId) });
  const products = useQuery({ queryKey: dealProductsQueryKey(selectedRestaurantId), queryFn: () => getDealProducts(selectedRestaurantId!), enabled: Boolean(selectedRestaurantId) });

  const togglePersonalCodeMutation = useMutation({
    mutationFn: (codeRecord: PersonalCodeRecord) => updatePersonalCode(codeRecord.id, { isUsed: !codeRecord.isUsed, usageCount: codeRecord.isUsed ? 0 : Math.max(1, codeRecord.usageCount) }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: personalCodesQueryKey });
    },
  });

  const deletePersonalCodeMutation = useMutation({
    mutationFn: (codeId: string) => deletePersonalCode(codeId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: personalCodesQueryKey });
    },
  });

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!selectedRestaurantId && restaurants.data?.length) {
      setSelectedRestaurantId(restaurants.data[0].id);
    }
  }, [restaurants.data, selectedRestaurantId]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const dealsForRestaurantContext = useMemo(() => {
    if (!selectedRestaurantId) return automaticDeals.data || [];
    return (automaticDeals.data || []).filter((deal) => deal.isGlobal || deal.restaurantId === selectedRestaurantId || deal.applicableRestaurantIds?.includes(selectedRestaurantId));
  }, [automaticDeals.data, selectedRestaurantId]);

  const categoryNameMap = useMemo(() => new Map((categories.data || []).map((category) => [category.id, category.name])), [categories.data]);
  const productNameMap = useMemo(() => new Map((products.data || []).map((product) => [product.id, product.name])), [products.data]);

  const filteredAutomaticDeals = useMemo(() => {
    const lowerQuery = query.trim().toLowerCase();
    const filteredByTab = dealsForRestaurantContext.filter((deal) => {
      if (tab === "restaurant") {
        return deal.scopeType === "RESTAURANT" || deal.scopeType === "COMBO" || deal.scopeType === "MIN_ORDER";
      }
      if (tab === "product") {
        return deal.scopeType === "PRODUCT";
      }
      if (tab === "category") {
        return deal.scopeType === "CATEGORY";
      }
      return false;
    });

    return filteredByTab.filter((deal) => !lowerQuery || `${deal.title} ${deal.description || ""} ${deal.restaurant?.name || ""}`.toLowerCase().includes(lowerQuery));
  }, [dealsForRestaurantContext, query, tab]);

  const filteredLegacyProductDiscounts = useMemo(() => {
    if (tab !== "product") return [] as DealProductRef[];
    const lowerQuery = query.trim().toLowerCase();
    const productDealIds = new Set(filteredAutomaticDeals.flatMap((deal) => deal.targetIds || []));
    return (products.data || [])
      .filter((product) => product.discountActive && (product.discountPrice != null || product.discountPercent != null))
      .filter((product) => !productDealIds.has(product.id))
      .filter((product) => !lowerQuery || `${product.name} ${product.category.name} ${product.discountLabel || ""}`.toLowerCase().includes(lowerQuery));
  }, [filteredAutomaticDeals, products.data, query, tab]);

  const filteredDiscountCodes = useMemo(() => {
    const lowerQuery = query.trim().toLowerCase();
    return (discountCodes.data || []).filter((code) => !lowerQuery || `${code.code} ${code.description || ""}`.toLowerCase().includes(lowerQuery));
  }, [discountCodes.data, query]);

  const filteredPersonalCodes = useMemo(() => {
    const lowerQuery = query.trim().toLowerCase();
    return (personalCodes.data || []).filter((code) => !lowerQuery || `${code.code} ${code.user?.name || ""} ${code.user?.phone || ""} ${code.campaign?.title || ""}`.toLowerCase().includes(lowerQuery));
  }, [personalCodes.data, query]);

  if (automaticDeals.isLoading || discountCodes.isLoading || personalCodes.isLoading || restaurants.isLoading || customers.isLoading) {
    return <Surface className="px-6 py-12 text-sm text-[var(--text-secondary)]">Loading deals workspace...</Surface>;
  }

  if (automaticDeals.isError || discountCodes.isError || personalCodes.isError || restaurants.isError || customers.isError || !automaticDeals.data || !discountCodes.data || !personalCodes.data || !restaurants.data || !customers.data) {
    return <ErrorPanel title="Deals module could not be loaded" description="The deal or code endpoints are unavailable." action={<Button onClick={() => { void automaticDeals.refetch(); void discountCodes.refetch(); void personalCodes.refetch(); void restaurants.refetch(); void customers.refetch(); }}><RefreshCw size={16} /> Retry</Button>} />;
  }

  const stats = {
    automatic: automaticDeals.data.length,
    activeAutomatic: automaticDeals.data.filter((deal) => deal.isActive).length,
    codes: discountCodes.data.length + personalCodes.data.length,
    activeCodes: discountCodes.data.filter((code) => code.isActive).length + personalCodes.data.filter((code) => !code.isUsed).length,
  };

  const activeDealsCount = {
    restaurant: dealsForRestaurantContext.filter((deal) => deal.isActive && (deal.scopeType === "RESTAURANT" || deal.scopeType === "COMBO" || deal.scopeType === "MIN_ORDER")).length,
    product: dealsForRestaurantContext.filter((deal) => deal.isActive && deal.scopeType === "PRODUCT").length + filteredLegacyProductDiscounts.length,
    category: dealsForRestaurantContext.filter((deal) => deal.isActive && deal.scopeType === "CATEGORY").length,
  };

  const openCreate = () => {
    setActiveDeal(null);
    if (tab === "codes") {
      setCodeModalOpen(true);
      return;
    }
    setDealModalOpen(true);
  };

  return (
    <div className="page-stack">
      <Surface className="px-6 py-6">
        <SectionHeader
          eyebrow="Deals"
          title="Deals and offers"
          description="Keep restaurant deals, product deals, category deals and codes on one page."
          actions={
            <>
              <Button variant="secondary" onClick={() => { void automaticDeals.refetch(); void discountCodes.refetch(); void personalCodes.refetch(); }}><RefreshCw size={16} /> Refresh</Button>
              {tab === "codes" ? <Button variant="secondary" onClick={() => setPersonalCodeModalOpen(true)}><Users size={16} /> Personal code</Button> : null}
              <Button variant="primary" onClick={openCreate}><Plus size={16} /> New {tab === "codes" ? "code" : "deal"}</Button>
            </>
          }
        />
      </Surface>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Surface className="px-5 py-5"><p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">Automatic deals</p><p className="mt-3 text-3xl font-black tracking-[-0.04em]">{formatNumber(stats.automatic)}</p></Surface>
        <Surface className="px-5 py-5"><p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">Active automatic</p><p className="mt-3 text-3xl font-black tracking-[-0.04em]">{formatNumber(stats.activeAutomatic)}</p></Surface>
        <Surface className="px-5 py-5"><p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">Codes</p><p className="mt-3 text-3xl font-black tracking-[-0.04em]">{formatNumber(stats.codes)}</p></Surface>
        <Surface className="px-5 py-5"><p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">Active codes</p><p className="mt-3 text-3xl font-black tracking-[-0.04em]">{formatNumber(stats.activeCodes)}</p></Surface>
      </div>

      <Surface className="px-6 py-6">
        <div className="grid gap-4 lg:grid-cols-[260px_1fr] lg:items-end">
          {tab !== "codes" ? (
            <Field label="Restaurant context">
              <Select value={selectedRestaurantId || ""} onChange={(event) => setSelectedRestaurantId(event.target.value)}>
                {restaurants.data.map((restaurant) => <option key={restaurant.id} value={restaurant.id}>{restaurant.name}</option>)}
              </Select>
            </Field>
          ) : <div />}
          <Field label="Search"><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={tab === "codes" ? "Search codes" : "Search deals"} /></Field>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <button type="button" onClick={() => setTab("restaurant")} className={`rounded-full border px-4 py-2 text-[11px] font-black uppercase tracking-[0.18em] ${tab === "restaurant" ? "border-[rgba(243,191,87,0.24)] bg-[rgba(243,191,87,0.1)] text-[var(--accent-strong)]" : "border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] text-[var(--text-secondary)]"}`}>Restaurant {activeDealsCount.restaurant > 0 ? `(${activeDealsCount.restaurant})` : ""}</button>
          <button type="button" onClick={() => setTab("product")} className={`rounded-full border px-4 py-2 text-[11px] font-black uppercase tracking-[0.18em] ${tab === "product" ? "border-[rgba(243,191,87,0.24)] bg-[rgba(243,191,87,0.1)] text-[var(--accent-strong)]" : "border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] text-[var(--text-secondary)]"}`}>Products {activeDealsCount.product > 0 ? `(${activeDealsCount.product})` : ""}</button>
          <button type="button" onClick={() => setTab("category")} className={`rounded-full border px-4 py-2 text-[11px] font-black uppercase tracking-[0.18em] ${tab === "category" ? "border-[rgba(243,191,87,0.24)] bg-[rgba(243,191,87,0.1)] text-[var(--accent-strong)]" : "border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] text-[var(--text-secondary)]"}`}>Categories {activeDealsCount.category > 0 ? `(${activeDealsCount.category})` : ""}</button>
          <button type="button" onClick={() => setTab("codes")} className={`rounded-full border px-4 py-2 text-[11px] font-black uppercase tracking-[0.18em] ${tab === "codes" ? "border-[rgba(243,191,87,0.24)] bg-[rgba(243,191,87,0.1)] text-[var(--accent-strong)]" : "border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] text-[var(--text-secondary)]"}`}>Codes</button>
        </div>

        {tab === "restaurant" || tab === "category" ? (
          <div className="mt-6 grid gap-3 lg:grid-cols-2">
            {filteredAutomaticDeals.length === 0 ? <EmptyState title={`No ${tab} deals`} /> : filteredAutomaticDeals.map((deal) => {
              const targetLabels = (deal.targetIds || []).map((targetId) => categoryNameMap.get(targetId) || productNameMap.get(targetId) || targetId).slice(0, 3);
              return (
                <button key={deal.id} type="button" onClick={() => { setActiveDeal(deal); setDealModalOpen(true); }} className="surface-muted px-5 py-5 text-left">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-lg font-black tracking-[-0.02em]">{deal.title}</p>
                        <Badge tone={deal.isActive ? "success" : "danger"}>{deal.isActive ? "Active" : "Inactive"}</Badge>
                        <Badge tone="info">{scopeLabel[deal.scopeType] || deal.scopeType}</Badge>
                      </div>
                      <p className="mt-2 text-sm text-[var(--text-secondary)]">{deal.restaurant?.name || (deal.isGlobal ? "All restaurants" : "No restaurant")} • {deal.discountType === "PERCENTAGE" ? `${deal.discountValue}%` : `${deal.discountValue} kr`}</p>
                      {deal.description ? <p className="mt-2 text-sm text-[var(--text-secondary)]">{deal.description}</p> : null}
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {deal.badgeText ? <Badge tone="warning">{deal.badgeText}</Badge> : null}
                    {deal.targetIds.length > 0 ? targetLabels.map((label) => <Badge key={`${deal.id}-${label}`} tone="neutral">{label}</Badge>) : null}
                    {deal.targetIds.length > targetLabels.length ? <Badge tone="neutral">+{deal.targetIds.length - targetLabels.length} more</Badge> : null}
                    {deal.scopeType === "MIN_ORDER" ? <Badge tone="neutral">Min order {deal.minOrder} kr</Badge> : null}
                    {deal.validUntil ? <Badge tone="neutral">Until {formatDate(deal.validUntil)}</Badge> : null}
                  </div>
                </button>
              );
            })}
          </div>
        ) : null}

        {tab === "product" ? (
          <div className="mt-6 grid gap-3 lg:grid-cols-2">
            {filteredAutomaticDeals.length === 0 && filteredLegacyProductDiscounts.length === 0 ? <EmptyState title="No product deals" /> : null}
            {filteredAutomaticDeals.map((deal) => {
              const targetLabels = (deal.targetIds || []).map((targetId) => productNameMap.get(targetId) || targetId).slice(0, 3);
              return (
                <button key={deal.id} type="button" onClick={() => { setActiveDeal(deal); setDealModalOpen(true); }} className="surface-muted px-5 py-5 text-left">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-lg font-black tracking-[-0.02em]">{deal.title}</p>
                        <Badge tone={deal.isActive ? "success" : "danger"}>{deal.isActive ? "Active" : "Inactive"}</Badge>
                        <Badge tone="info">Product</Badge>
                      </div>
                      <p className="mt-2 text-sm text-[var(--text-secondary)]">{deal.restaurant?.name || "No restaurant"} • {deal.discountType === "PERCENTAGE" ? `${deal.discountValue}%` : `${deal.discountValue} kr`}</p>
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {targetLabels.map((label) => <Badge key={`${deal.id}-${label}`} tone="neutral">{label}</Badge>)}
                    {deal.validUntil ? <Badge tone="neutral">Until {formatDate(deal.validUntil)}</Badge> : null}
                  </div>
                </button>
              );
            })}
            {filteredLegacyProductDiscounts.map((product) => {
              const salePrice = product.discountPrice != null ? product.discountPrice : Math.round(product.price * (1 - Number(product.discountPercent || 0) / 100));
              return (
                <div key={`legacy-${product.id}`} className="surface-muted px-5 py-5 text-left">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-lg font-black tracking-[-0.02em]">{product.name}</p>
                        <Badge tone="warning">Legacy menu discount</Badge>
                      </div>
                      <p className="mt-2 text-sm text-[var(--text-secondary)]">{product.category.name} • {formatCurrency(product.price)} to {formatCurrency(salePrice)}</p>
                      <p className="mt-2 text-sm text-[var(--text-secondary)]">This product is still discounted from product settings, which is why it shows here.</p>
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {product.discountLabel ? <Badge tone="neutral">{product.discountLabel}</Badge> : null}
                    {product.discountPercent ? <Badge tone="neutral">-{product.discountPercent}%</Badge> : null}
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}

        {tab === "codes" ? (
          <div className="mt-6 grid gap-6">
            <div>
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">Discount codes</p>
                <Badge tone="info">{filteredDiscountCodes.length}</Badge>
              </div>
              {filteredDiscountCodes.length === 0 ? <EmptyState title="No discount codes" /> : <div className="grid gap-3 lg:grid-cols-2">{filteredDiscountCodes.map((code) => (
                <button key={code.id} type="button" onClick={() => { setActiveCode(code); setCodeModalOpen(true); }} className="surface-muted px-5 py-5 text-left">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-lg font-black tracking-[-0.02em]">{code.code}</p>
                        <Badge tone={code.isActive ? "success" : "danger"}>{code.isActive ? "Active" : "Inactive"}</Badge>
                      </div>
                      <p className="mt-2 text-sm text-[var(--text-secondary)]">{code.discountType === "fixed" ? `${code.discountValue} kr` : `${code.discountValue}%`} • min order {code.minOrderAmount} kr</p>
                      {code.description ? <p className="mt-2 text-sm text-[var(--text-secondary)]">{code.description}</p> : null}
                    </div>
                    <div className="text-right text-sm text-[var(--text-secondary)]">
                      <div>{code.usedCount} used</div>
                      {code.maxUses ? <div>max {code.maxUses}</div> : null}
                    </div>
                  </div>
                </button>
              ))}</div>}
            </div>

            <div>
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">Personal codes</p>
                <Badge tone="info">{filteredPersonalCodes.length}</Badge>
              </div>
              {filteredPersonalCodes.length === 0 ? <EmptyState title="No personal codes" /> : <div className="grid gap-3 lg:grid-cols-2">{filteredPersonalCodes.map((code) => (
                <div key={code.id} className="surface-muted px-5 py-5 text-left">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-lg font-black tracking-[-0.02em]">{code.campaign?.title || code.code}</p>
                        <Badge tone={code.isUsed ? "danger" : "success"}>{code.isUsed ? "Used" : "Active"}</Badge>
                      </div>
                      <p className="mt-2 text-sm text-[var(--text-secondary)]">{code.user?.name || code.user?.phone || "Unknown customer"} • {code.code}</p>
                      <p className="mt-2 text-sm text-[var(--text-secondary)]">{code.campaign?.discountType === "FIXED" ? `${((code.campaign?.discountValue || 0) / 100).toFixed(0)} kr` : `${code.campaign?.discountValue || 0}%`} • {code.usageCount}/{code.maxUsages}</p>
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button variant="secondary" onClick={() => togglePersonalCodeMutation.mutate(code)}>{code.isUsed ? "Restore" : "Mark used"}</Button>
                    <Button variant="danger" onClick={() => deletePersonalCodeMutation.mutate(code.id)}>Delete</Button>
                  </div>
                </div>
              ))}</div>}
            </div>
          </div>
        ) : null}
      </Surface>

      <AutomaticDealModal
        open={dealModalOpen}
        onClose={() => { setDealModalOpen(false); setActiveDeal(null); }}
        restaurants={restaurants.data}
        categories={categories.data || []}
        products={products.data || []}
        initialDeal={activeDeal}
        prefill={activeDeal ? undefined : selectedRestaurantId ? { restaurantId: selectedRestaurantId, scopeType: tab === "product" ? "PRODUCT" : tab === "category" ? "CATEGORY" : "RESTAURANT" } : undefined}
      />

      <DiscountCodeModal open={codeModalOpen} codeRecord={activeCode} onClose={() => { setCodeModalOpen(false); setActiveCode(null); }} />
      <PersonalCodeModal open={personalCodeModalOpen} customers={customers.data} onClose={() => setPersonalCodeModalOpen(false)} />
    </div>
  );
}
