"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Gift, Plus, RefreshCw, TicketPercent } from "lucide-react";
import {
  createDiscountCode,
  dealsQueryKey,
  dealCategoriesQueryKey,
  dealProductsQueryKey,
  dealRestaurantsQueryKey,
  discountCodesQueryKey,
  deleteDiscountCode,
  getAutomaticDeals,
  getDealCategories,
  getDealProducts,
  getDealRestaurants,
  getDiscountCodes,
  type AutomaticDealRecord,
  type DealCategoryRef,
  type DealProductRef,
  type DiscountCodeRecord,
  updateDiscountCode,
} from "@/modules/deals/api";
import { AutomaticDealModal } from "@/modules/deals/components/automatic-deal-modal";
import { Badge, Button, EmptyState, ErrorPanel, Field, Input, Modal, SectionHeader, Select, Surface, Tabs, Textarea } from "@/shared/components/ui";
import { formatDate, formatNumber } from "@/shared/utils/format";

type DealsTab = "automatic" | "codes";

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

const scopeLabel: Record<string, string> = {
  RESTAURANT: "Restaurant",
  PRODUCT: "Products",
  CATEGORY: "Categories",
  COMBO: "Combo",
  MIN_ORDER: "Min order",
};

export function DealsPage() {
  const [tab, setTab] = useState<DealsTab>("automatic");
  const [query, setQuery] = useState("");
  const [selectedRestaurantId, setSelectedRestaurantId] = useState<string | null>(null);
  const [activeDeal, setActiveDeal] = useState<AutomaticDealRecord | null>(null);
  const [dealModalOpen, setDealModalOpen] = useState(false);
  const [activeCode, setActiveCode] = useState<DiscountCodeRecord | null>(null);
  const [codeModalOpen, setCodeModalOpen] = useState(false);

  const automaticDeals = useQuery({ queryKey: dealsQueryKey, queryFn: getAutomaticDeals });
  const discountCodes = useQuery({ queryKey: discountCodesQueryKey, queryFn: getDiscountCodes });
  const restaurants = useQuery({ queryKey: dealRestaurantsQueryKey, queryFn: getDealRestaurants });
  const categories = useQuery({ queryKey: dealCategoriesQueryKey(selectedRestaurantId), queryFn: () => getDealCategories(selectedRestaurantId!), enabled: Boolean(selectedRestaurantId) });
  const products = useQuery({ queryKey: dealProductsQueryKey(selectedRestaurantId), queryFn: () => getDealProducts(selectedRestaurantId!), enabled: Boolean(selectedRestaurantId) });

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!selectedRestaurantId && restaurants.data?.length) {
      setSelectedRestaurantId(restaurants.data[0].id);
    }
  }, [restaurants.data, selectedRestaurantId]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const categoryNameMap = useMemo(() => new Map((categories.data || []).map((category) => [category.id, category.name])), [categories.data]);
  const productNameMap = useMemo(() => new Map((products.data || []).map((product) => [product.id, product.name])), [products.data]);

  const filteredAutomaticDeals = useMemo(() => {
    const lowerQuery = query.trim().toLowerCase();
    return (automaticDeals.data || []).filter((deal) => {
      const restaurantName = deal.restaurant?.name || "";
      return !lowerQuery || `${deal.title} ${deal.description || ""} ${restaurantName}`.toLowerCase().includes(lowerQuery);
    });
  }, [automaticDeals.data, query]);

  const filteredDiscountCodes = useMemo(() => {
    const lowerQuery = query.trim().toLowerCase();
    return (discountCodes.data || []).filter((code) => !lowerQuery || `${code.code} ${code.description || ""}`.toLowerCase().includes(lowerQuery));
  }, [discountCodes.data, query]);

  if (automaticDeals.isLoading || discountCodes.isLoading || restaurants.isLoading) {
    return <Surface className="px-6 py-12 text-sm text-[var(--text-secondary)]">Loading deals workspace...</Surface>;
  }

  if (automaticDeals.isError || discountCodes.isError || restaurants.isError || !automaticDeals.data || !discountCodes.data || !restaurants.data) {
    return <ErrorPanel title="Deals module could not be loaded" description="The deal or discount code endpoints are unavailable." action={<Button onClick={() => { void automaticDeals.refetch(); void discountCodes.refetch(); void restaurants.refetch(); }}><RefreshCw size={16} /> Retry</Button>} />;
  }

  const stats = {
    automatic: automaticDeals.data.length,
    activeAutomatic: automaticDeals.data.filter((deal) => deal.isActive).length,
    codes: discountCodes.data.length,
    activeCodes: discountCodes.data.filter((code) => code.isActive).length,
  };

  return (
    <div className="page-stack">
      <Surface className="px-6 py-6">
        <SectionHeader
          eyebrow="Deals"
          title="Single promotion workspace"
          description="Restaurant-wide deals, product promos, category promos and discount codes live under one module so admin doesn’t split discount work across multiple sections."
          actions={
            <>
              <Button variant="secondary" onClick={() => { void automaticDeals.refetch(); void discountCodes.refetch(); }}><RefreshCw size={16} /> Refresh</Button>
              <Button variant="primary" onClick={() => tab === "automatic" ? setDealModalOpen(true) : setCodeModalOpen(true)}><Plus size={16} /> New {tab === "automatic" ? "deal" : "code"}</Button>
            </>
          }
        />
      </Surface>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Surface className="px-5 py-5"><p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">Automatic deals</p><p className="mt-3 text-3xl font-black tracking-[-0.04em]">{formatNumber(stats.automatic)}</p></Surface>
        <Surface className="px-5 py-5"><p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">Active automatic</p><p className="mt-3 text-3xl font-black tracking-[-0.04em]">{formatNumber(stats.activeAutomatic)}</p></Surface>
        <Surface className="px-5 py-5"><p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">Discount codes</p><p className="mt-3 text-3xl font-black tracking-[-0.04em]">{formatNumber(stats.codes)}</p></Surface>
        <Surface className="px-5 py-5"><p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">Active codes</p><p className="mt-3 text-3xl font-black tracking-[-0.04em]">{formatNumber(stats.activeCodes)}</p></Surface>
      </div>

      <Surface className="px-6 py-6">
        <div className="grid gap-4 lg:grid-cols-[260px_1fr_auto] lg:items-end">
          <Field label="Restaurant context">
            <Select value={selectedRestaurantId || ""} onChange={(event) => setSelectedRestaurantId(event.target.value)}>
              {restaurants.data.map((restaurant) => <option key={restaurant.id} value={restaurant.id}>{restaurant.name}</option>)}
            </Select>
          </Field>
          <Field label="Search"><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search current deal view" /></Field>
          <Tabs value={tab} onChange={setTab} options={[{ value: "automatic", label: "Automatic" }, { value: "codes", label: "Codes" }]} />
        </div>

        {tab === "automatic" ? (
          <div className="mt-6 grid gap-3 lg:grid-cols-2">
            {filteredAutomaticDeals.length === 0 ? <EmptyState title="No automatic deals" /> : filteredAutomaticDeals.map((deal) => {
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
                    {deal.validUntil ? <Badge tone="neutral">Until {formatDate(deal.validUntil)}</Badge> : null}
                  </div>
                </button>
              );
            })}
          </div>
        ) : null}

        {tab === "codes" ? (
          <div className="mt-6 grid gap-3 lg:grid-cols-2">
            {filteredDiscountCodes.length === 0 ? <EmptyState title="No discount codes" /> : filteredDiscountCodes.map((code) => (
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
                <div className="mt-4 flex flex-wrap gap-2">
                  {code.startsAt ? <Badge tone="neutral">Starts {formatDate(code.startsAt)}</Badge> : null}
                  {code.expiresAt ? <Badge tone="neutral">Ends {formatDate(code.expiresAt)}</Badge> : null}
                  <Badge tone="info">{code.discountType}</Badge>
                </div>
              </button>
            ))}
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
        prefill={activeDeal ? undefined : selectedRestaurantId ? { restaurantId: selectedRestaurantId } : undefined}
      />

      <DiscountCodeModal open={codeModalOpen} codeRecord={activeCode} onClose={() => { setCodeModalOpen(false); setActiveCode(null); }} />
    </div>
  );
}
