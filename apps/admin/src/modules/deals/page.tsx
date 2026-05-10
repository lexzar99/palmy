"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Plus, RefreshCw, Pencil } from "lucide-react";
import {
  clearLegacyProductDiscount,
  dealsQueryKey,
  dealCategoriesQueryKey,
  dealProductsQueryKey,
  dealRestaurantsQueryKey,
  getAutomaticDeals,
  getDealCategories,
  getDealProducts,
  getDealRestaurants,
  wipeAllDeals,
  type AutomaticDealRecord,
  type DealProductRef,
} from "@/modules/deals/api";
import { discountsQueryKey, getDiscounts, createDiscount, updateDiscount, deleteDiscount, type DiscountRecord } from "@/modules/coupons/api";
import { AutomaticDealModal } from "@/modules/deals/components/automatic-deal-modal";
import { BogoDealModal } from "@/modules/deals/components/bogo-deal-modal";
import { PopupDealModal } from "@/modules/deals/components/popup-deal-modal";
import { Badge, Button, EmptyState, ErrorPanel, Field, Input, Modal, PageHeader, Select, Surface, Textarea } from "@/shared/components/ui";
import { formatCurrency, formatDate, formatNumber } from "@/shared/utils/format";
import { getRestaurantOverview, restaurantsQueryKey, type ControlCenterRestaurantSnapshot } from "@/modules/restaurants/api";

type DealsTab = "restaurant" | "product" | "category" | "bogo" | "popup" | "kupongkoder";

type CouponForm = {
  code: string;
  description: string;
  discountType: "percentage" | "fixed" | "free_delivery";
  discountValue: string;
  minOrderAmount: string;
  maxUses: string;
  startsAt: string;
  expiresAt: string;
  applicableRestaurantIds: string[];
  isActive: boolean;
};

const emptyCouponForm = (): CouponForm => ({
  code: "", description: "", discountType: "percentage", discountValue: "",
  minOrderAmount: "", maxUses: "", startsAt: "", expiresAt: "",
  applicableRestaurantIds: [], isActive: true,
});

const scopeLabel: Record<string, string> = {
  RESTAURANT: "Restaurant",
  PRODUCT: "Products",
  CATEGORY: "Categories",
  COMBO: "Combo",
  MIN_ORDER: "Min order",
};

export function DealsPage() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [tab, setTab] = useState<DealsTab>("restaurant");
  const [query, setQuery] = useState("");
  const [selectedRestaurantId, setSelectedRestaurantId] = useState<string | null>(null);
  const [activeDeal, setActiveDeal] = useState<AutomaticDealRecord | null>(null);
  const [dealModalOpen, setDealModalOpen] = useState(false);
  const [dealPrefill, setDealPrefill] = useState<Record<string, unknown> | undefined>(undefined);
  const [pendingLegacyMigration, setPendingLegacyMigration] = useState<DealProductRef | null>(null);

  const automaticDeals = useQuery({ queryKey: dealsQueryKey, queryFn: getAutomaticDeals });
  const [popupModalOpen, setPopupModalOpen] = useState(false);
  const [popupTargetDeal, setPopupTargetDeal] = useState<AutomaticDealRecord | null>(null);
  const [bogoModalOpen, setBogoModalOpen] = useState(false);
  const [bogoDeal, setBogoDeal] = useState<AutomaticDealRecord | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const restaurants = useQuery({ queryKey: dealRestaurantsQueryKey, queryFn: getDealRestaurants });
  const allRestaurants = useQuery({ queryKey: restaurantsQueryKey, queryFn: getRestaurantOverview });
  const categories = useQuery({ queryKey: dealCategoriesQueryKey(selectedRestaurantId), queryFn: () => getDealCategories(selectedRestaurantId!), enabled: Boolean(selectedRestaurantId) });
  const products = useQuery({ queryKey: dealProductsQueryKey(selectedRestaurantId), queryFn: () => getDealProducts(selectedRestaurantId!), enabled: Boolean(selectedRestaurantId) });

  // --- Kupongkoder state ---
  const discounts = useQuery({ queryKey: discountsQueryKey, queryFn: getDiscounts });
  const [couponModalOpen, setCouponModalOpen] = useState(false);
  const [editingCoupon, setEditingCoupon] = useState<DiscountRecord | null>(null);
  const [couponForm, setCouponForm] = useState<CouponForm>(emptyCouponForm());
  const [couponError, setCouponError] = useState<string | null>(null);

  const saveCouponMutation = useMutation({
    mutationFn: async (f: CouponForm) => {
      const payload: Record<string, unknown> = {
        code: f.code.toUpperCase(),
        description: f.description || null,
        type: f.discountType === "percentage" ? "PERCENTAGE" : f.discountType === "fixed" ? "FIXED" : "FREE_DELIVERY",
        value: f.discountType === "free_delivery" ? 0 : Number(f.discountValue) || 0,
        minOrder: Number(f.minOrderAmount) || 0,
        maxUsages: f.maxUses ? Number(f.maxUses) : null,
        validFrom: f.startsAt || null,
        validUntil: f.expiresAt || null,
        applicableRestaurantIds: f.applicableRestaurantIds,
        isActive: f.isActive,
      };
      if (editingCoupon) return updateDiscount(editingCoupon.id, payload);
      return createDiscount(payload);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: discountsQueryKey });
      setCouponModalOpen(false);
      setEditingCoupon(null);
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setCouponError(msg ?? "Kunde inte spara kupong.");
    },
  });

  const deleteCouponMutation = useMutation({
    mutationFn: () => deleteDiscount(editingCoupon!.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: discountsQueryKey });
      setCouponModalOpen(false);
      setEditingCoupon(null);
    },
    onError: () => setCouponError("Kunde inte radera kupong."),
  });

  const openCreateCoupon = () => { setEditingCoupon(null); setCouponForm(emptyCouponForm()); setCouponModalOpen(true); };
  const openEditCoupon = (r: DiscountRecord) => {
    setEditingCoupon(r);
    setCouponForm({
      code: r.code,
      description: r.description ?? "",
      discountType: r.discountType,
      discountValue: r.discountType === "free_delivery" ? "" : String(r.discountValue),
      minOrderAmount: r.minOrderAmount > 0 ? String(r.minOrderAmount) : "",
      maxUses: r.maxUses != null ? String(r.maxUses) : "",
      startsAt: r.startsAt ? r.startsAt.slice(0, 10) : "",
      expiresAt: r.expiresAt ? r.expiresAt.slice(0, 10) : "",
      applicableRestaurantIds: r.applicableRestaurantIds?.length ? r.applicableRestaurantIds : r.restaurantId ? [r.restaurantId] : [],
      isActive: r.isActive,
    });
    setCouponModalOpen(true);
  };

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => { if (!couponModalOpen) { setCouponError(null); } }, [couponModalOpen]);
  /* eslint-enable react-hooks/set-state-in-effect */
  // --- end kupongkoder state ---

  /* Ingen autoselect — default är "Alla restauranger" (null) */

  // En "äkta popup-deal" är en deal som skapats via Popup-fliken — vi
  // identifierar dem på popupHeadline (som bara popup-builder sätter).
  // popupEnabled-flaggan ensam räcker inte: den är default true på
  // vanliga deals också (legacy-default). Filtrera bara bort de som
  // verkligen byggts som popups.
  const isPopupDeal = (deal: any) => Boolean(deal?.popupHeadline?.trim() || deal?.popupBody?.trim() || deal?.popupCode?.trim());

  const dealsForRestaurantContext = useMemo(() => {
    const visible = (automaticDeals.data || []).filter((deal) => !isPopupDeal(deal));
    if (!selectedRestaurantId) return visible;
    return visible.filter((deal) => deal.isGlobal || deal.restaurantId === selectedRestaurantId || deal.applicableRestaurantIds?.includes(selectedRestaurantId));
  }, [automaticDeals.data, selectedRestaurantId]);

  const categoryNameMap = useMemo(() => new Map((categories.data || []).map((category) => [category.id, category.name])), [categories.data]);
  const productNameMap = useMemo(() => new Map((products.data || []).map((product) => [product.id, product.name])), [products.data]);

  const filteredAutomaticDeals = useMemo(() => {
    const lowerQuery = query.trim().toLowerCase();
    // BOGO-fliken visar ALLA restaurangers BOGO-deals — restaurangfiltret
    // gäller bara restaurant/product/category-flikarna.
    const baseDeals = tab === "bogo"
      ? (automaticDeals.data || []).filter((deal) => !isPopupDeal(deal))
      : dealsForRestaurantContext;
    const filteredByTab = baseDeals.filter((deal) => {
      if (tab === "restaurant") {
        return (deal.scopeType === "RESTAURANT" || deal.scopeType === "COMBO" || deal.scopeType === "MIN_ORDER") && deal.triggerType !== "BOGO_CATEGORY";
      }
      if (tab === "product") {
        return deal.scopeType === "PRODUCT";
      }
      if (tab === "category") {
        return deal.scopeType === "CATEGORY" && deal.triggerType !== "BOGO_CATEGORY";
      }
      if (tab === "bogo") {
        return deal.triggerType === "BOGO_CATEGORY";
      }
      return false;
    });

    return filteredByTab.filter((deal) => !lowerQuery || `${deal.title} ${deal.description || ""} ${deal.restaurant?.name || ""}`.toLowerCase().includes(lowerQuery));
  }, [automaticDeals.data, dealsForRestaurantContext, query, tab]);

  const filteredLegacyProductDiscounts = useMemo(() => {
    if (tab !== "product") return [] as DealProductRef[];
    const lowerQuery = query.trim().toLowerCase();
    const productDealIds = new Set(filteredAutomaticDeals.flatMap((deal) => deal.targetIds || []));
    return (products.data || [])
      .filter((product) => product.discountActive && (product.discountPrice != null || product.discountPercent != null))
      .filter((product) => !productDealIds.has(product.id))
      .filter((product) => !lowerQuery || `${product.name} ${product.category.name} ${product.discountLabel || ""}`.toLowerCase().includes(lowerQuery));
  }, [filteredAutomaticDeals, products.data, query, tab]);

  if (automaticDeals.isLoading || restaurants.isLoading) {
    return <Surface className="px-6 py-12 text-sm text-[var(--text-secondary)]">Loading deals workspace...</Surface>;
  }

  if (automaticDeals.isError || restaurants.isError || !automaticDeals.data || !restaurants.data) {
    return <ErrorPanel title="Deals module could not be loaded" description="The deal endpoints are unavailable." action={<Button onClick={() => { void automaticDeals.refetch(); void restaurants.refetch(); }}><RefreshCw size={16} /> Retry</Button>} />;
  }

  const stats = {
    automatic: automaticDeals.data.length,
    activeAutomatic: automaticDeals.data.filter((deal) => deal.isActive).length,
  };

  const activeDealsCount = {
    restaurant: dealsForRestaurantContext.filter((deal) => deal.isActive && (deal.scopeType === "RESTAURANT" || deal.scopeType === "COMBO" || deal.scopeType === "MIN_ORDER") && deal.triggerType !== "BOGO_CATEGORY").length,
    product: dealsForRestaurantContext.filter((deal) => deal.isActive && deal.scopeType === "PRODUCT").length + filteredLegacyProductDiscounts.length,
    category: dealsForRestaurantContext.filter((deal) => deal.isActive && deal.scopeType === "CATEGORY" && deal.triggerType !== "BOGO_CATEGORY").length,
    bogo: (automaticDeals.data || []).filter((deal) => deal.isActive && deal.triggerType === "BOGO_CATEGORY").length,
  };

  const openCreate = () => {
    setActiveDeal(null);
    setPendingLegacyMigration(null);
    setDealPrefill(selectedRestaurantId ? { restaurantId: selectedRestaurantId, scopeType: tab === "product" ? "PRODUCT" : tab === "category" ? "CATEGORY" : "RESTAURANT" } : undefined);

    setDealModalOpen(true);
  };

  const openLegacyProduct = (productId: string) => {
    if (!selectedRestaurantId) return;
    router.push(`/menu?restaurantId=${selectedRestaurantId}&productId=${productId}`);
  };

  const migrateLegacyProduct = (product: DealProductRef) => {
    if (!selectedRestaurantId) return;
    setActiveDeal(null);
    setPendingLegacyMigration(product);
    setDealPrefill({
      restaurantId: selectedRestaurantId,
      scopeType: "PRODUCT",
      targetIds: [product.id],
      title: `${product.name} deal`,
      badgeText: product.discountLabel || "",
      discountType: product.discountPrice != null ? "FIXED_PRICE" : "PERCENTAGE",
      discountValue: product.discountPrice ?? product.discountPercent ?? 10,
      isActive: true,
      showOnSite: true,
      popupEnabled: true,
    });
    setDealModalOpen(true);
  };

  return (
    <div className="page-stack">
      <PageHeader
        title="Deals"
        actions={
          <>
            <Button variant="secondary" onClick={() => { void automaticDeals.refetch(); }}><RefreshCw size={13} /> Refresh</Button>
            <Button
              variant="danger"
              onClick={async () => {
                if (!confirm("Radera ALLA deals permanent? Detta nollar också alla användares claimade deals. Kan inte ångras.")) return;
                try {
                  const result = await wipeAllDeals();
                  alert(`Raderade ${result.deleted} deals.`);
                  await queryClient.invalidateQueries({ queryKey: dealsQueryKey });
                } catch (e: any) {
                  alert(e?.response?.data?.error || "Kunde inte rensa deals.");
                }
              }}
            >
              <AlertTriangle size={13} /> Radera alla
            </Button>
            {tab === "popup" ? (
              <Button variant="primary" onClick={() => setPickerOpen(true)}><Plus size={13} /> Skicka popup för deal</Button>
            ) : tab === "bogo" ? (
              <Button variant="primary" onClick={() => { setBogoDeal(null); setBogoModalOpen(true); }}><Plus size={13} /> Ny BOGO-deal</Button>
            ) : tab === "kupongkoder" ? (
              <Button variant="primary" onClick={openCreateCoupon}><Plus size={13} /> Ny kupongkod</Button>
            ) : (
              <Button variant="primary" onClick={openCreate}><Plus size={13} /> Ny deal</Button>
            )}
          </>
        }
      />

      <Surface className="px-6 py-6">
        <div className="grid gap-4 lg:grid-cols-[260px_1fr] lg:items-end">
          <Field label="Restaurant context">
            <Select value={selectedRestaurantId || ""} onChange={(event) => setSelectedRestaurantId(event.target.value || null)}>
              <option value="">Alla restauranger</option>
              {restaurants.data.map((restaurant) => <option key={restaurant.id} value={restaurant.id}>{restaurant.name}</option>)}
            </Select>
          </Field>
          <Field label="Search"><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search deals" /></Field>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {(["restaurant", "product", "category", "bogo", "popup", "kupongkoder"] as const).map((t) => {
            const labels: Record<string, string> = { restaurant: "Restaurang", product: "Produkter", category: "Kategorier", bogo: "BOGO", popup: "Popup", kupongkoder: "Kupongkoder" };
            const counts: Record<string, number> = { restaurant: activeDealsCount.restaurant, product: activeDealsCount.product, category: activeDealsCount.category, bogo: activeDealsCount.bogo, popup: (automaticDeals.data || []).filter(isPopupDeal).length, kupongkoder: (discounts.data || []).filter(d => d.isActive).length };
            const active = tab === t;
            return (
              <button key={t} type="button" onClick={() => setTab(t)} className={`rounded-full border px-4 py-2 text-[11px] font-black uppercase tracking-[0.18em] ${active ? "border-[rgba(243,191,87,0.24)] bg-[rgba(243,191,87,0.1)] text-[var(--accent-strong)]" : "border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] text-[var(--text-secondary)]"}`}>
                {labels[t]} {counts[t] > 0 ? `(${counts[t]})` : ""}
              </button>
            );
          })}
        </div>

        {/* Popup-fliken: listar alla deals som har en popup-overlay påsatt.
            Popup ÄR INTE en separat deal — det är ett sätt att presentera
            en befintlig deal som claim-popup för kunder. Tryck "Skicka
            popup för deal" → välj en deal → bygg popupen för den. */}
        {tab === "popup" ? (
          <div className="mt-6 grid gap-3 lg:grid-cols-2">
            {(automaticDeals.data || []).filter(isPopupDeal).length === 0 ? (
              <EmptyState
                title="Inga popups ännu"
                description="Popups kopplas till befintliga deals. Tryck 'Skicka popup för deal' ovan för att välja en deal och bygga popupen."
              />
            ) : (
              (automaticDeals.data || []).filter(isPopupDeal).map((deal) => (
                <button
                  key={deal.id}
                  type="button"
                  onClick={() => { setPopupTargetDeal(deal); setPopupModalOpen(true); }}
                  className="surface-muted px-5 py-5 text-left"
                >
                  <div className="flex items-start gap-3">
                    {deal.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={deal.imageUrl} alt="" className="h-16 w-16 rounded-xl object-cover shrink-0" />
                    ) : (
                      <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-[rgba(243,191,87,0.12)] text-2xl shrink-0">🎁</div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-lg font-black tracking-[-0.02em]">{(deal as any).popupHeadline || deal.title}</p>
                        <Badge tone={deal.popupEnabled !== false ? "success" : "neutral"}>{deal.popupEnabled !== false ? "Visas" : "Pausad"}</Badge>
                        <Badge tone="info">{scopeLabel[deal.scopeType] || deal.scopeType}</Badge>
                        {(deal as any).popupCode ? <Badge tone="warning">Kod: {(deal as any).popupCode}</Badge> : null}
                      </div>
                      {(deal as any).popupBody ? <p className="mt-2 text-sm text-[var(--text-secondary)]">{(deal as any).popupBody}</p> : null}
                      <p className="mt-2 text-xs text-[var(--text-muted)]">
                        Kopplad till: {deal.title} • {deal.discountType === "PERCENTAGE" ? `${deal.discountValue}%` : `${deal.discountValue} kr`} rabatt
                        {deal.minOrder > 0 ? ` • min ${deal.minOrder} kr` : ""}
                      </p>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        ) : null}

        {tab === "restaurant" || tab === "category" || tab === "bogo" ? (
          <div className="mt-6 grid gap-3 lg:grid-cols-2">
            {filteredAutomaticDeals.length === 0 ? <EmptyState title={`Inga ${tab === "bogo" ? "BOGO-" : tab === "category" ? "kategori-" : "restaurang-"}deals`} /> : filteredAutomaticDeals.map((deal) => {
              const targetLabels = (deal.targetIds || []).map((targetId) => categoryNameMap.get(targetId) || productNameMap.get(targetId) || targetId).slice(0, 3);
              const isBogo = deal.triggerType === "BOGO_CATEGORY";
              return (
                <button key={deal.id} type="button" onClick={() => { if (isBogo) { setBogoDeal(deal); setBogoModalOpen(true); } else { setDealPrefill(undefined); setPendingLegacyMigration(null); setActiveDeal(deal); setDealModalOpen(true); } }} className="surface-muted px-5 py-5 text-left">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-lg font-black tracking-[-0.02em]">{deal.title}</p>
                        <Badge tone={deal.isActive ? "success" : "danger"}>{deal.isActive ? "Aktiv" : "Inaktiv"}</Badge>
                        {isBogo ? <Badge tone="info">BOGO</Badge> : <Badge tone="info">{scopeLabel[deal.scopeType] || deal.scopeType}</Badge>}
                        {(deal as any).showAsBanner ? <Badge tone="warning">Banner</Badge> : null}
                      </div>
                      <p className="mt-2 text-sm text-[var(--text-secondary)]">{deal.restaurant?.name || (deal.isGlobal ? "Alla restauranger" : "Ingen restaurang")} • {isBogo ? "BOGO — 1 gratis" : deal.discountType === "PERCENTAGE" ? `${deal.discountValue}%` : `${deal.discountValue} kr`}</p>
                      {deal.description ? <p className="mt-2 text-sm text-[var(--text-secondary)]">{deal.description}</p> : null}
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {deal.badgeText ? <Badge tone="warning">{deal.badgeText}</Badge> : null}
                    {deal.targetIds.length > 0 ? targetLabels.map((label) => <Badge key={`${deal.id}-${label}`} tone="neutral">{label}</Badge>) : null}
                    {deal.targetIds.length > targetLabels.length ? <Badge tone="neutral">+{deal.targetIds.length - targetLabels.length} till</Badge> : null}
                    {deal.scopeType === "MIN_ORDER" ? <Badge tone="neutral">Min order {deal.minOrder} kr</Badge> : null}
                    {deal.validUntil ? (
                      new Date(deal.validUntil) < new Date()
                        ? <Badge tone="danger">Utgången {formatDate(deal.validUntil)}</Badge>
                        : <Badge tone="neutral">Gäller t.o.m. {formatDate(deal.validUntil)}</Badge>
                    ) : null}
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
                <button key={deal.id} type="button" onClick={() => { setDealPrefill(undefined); setPendingLegacyMigration(null); setActiveDeal(deal); setDealModalOpen(true); }} className="surface-muted px-5 py-5 text-left">
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
                    {deal.validUntil ? (
                      new Date(deal.validUntil) < new Date()
                        ? <Badge tone="danger">Utgången {formatDate(deal.validUntil)}</Badge>
                        : <Badge tone="neutral">Gäller t.o.m. {formatDate(deal.validUntil)}</Badge>
                    ) : null}
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
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button variant="secondary" onClick={() => openLegacyProduct(product.id)}>Öppna produkt</Button>
                    <Button variant="primary" onClick={() => migrateLegacyProduct(product)}>Migrera till deal</Button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}

        {tab === "kupongkoder" ? (
          <div className="mt-6">
            {discounts.isLoading ? (
              <p className="text-sm text-[var(--text-secondary)] py-8 text-center">Laddar kupongkoder...</p>
            ) : (discounts.data || []).length === 0 ? (
              <EmptyState title="Inga kupongkoder" description="Skapa din första kupong med knappen ovan." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--border-subtle)] text-left text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">
                      <th className="pb-3 pr-4">Kod</th>
                      <th className="pb-3 pr-4">Typ</th>
                      <th className="pb-3 pr-4">Värde</th>
                      <th className="pb-3 pr-4">Min</th>
                      <th className="pb-3 pr-4">Restaurang</th>
                      <th className="pb-3 pr-4">Status</th>
                      <th className="pb-3 pr-4">Använd</th>
                      <th className="pb-3 pr-4">Giltig till</th>
                      <th className="pb-3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {(discounts.data || []).map((record) => (
                      <tr key={record.id} className="border-b border-[var(--border-subtle)] last:border-0">
                        <td className="py-3 pr-4 font-mono font-semibold tracking-wide">{record.code}</td>
                        <td className="py-3 pr-4">
                          <Badge tone={record.discountType === "percentage" ? "info" : record.discountType === "fixed" ? "warning" : "success"}>
                            {record.discountType === "percentage" ? "%" : record.discountType === "fixed" ? "Kr" : "Fri lev."}
                          </Badge>
                        </td>
                        <td className="py-3 pr-4 tabular-nums">
                          {record.discountType === "free_delivery" ? "—" : record.discountType === "percentage" ? `${record.discountValue}%` : `${record.discountValue} kr`}
                        </td>
                        <td className="py-3 pr-4 tabular-nums text-[var(--text-secondary)]">{record.minOrderAmount > 0 ? `${record.minOrderAmount} kr` : "—"}</td>
                        <td className="py-3 pr-4 text-[var(--text-secondary)] text-xs">
                          {record.applicableRestaurantIds?.length > 0
                            ? record.applicableRestaurantIds.map((id) => (allRestaurants.data || []).find((r: ControlCenterRestaurantSnapshot) => r.id === id)?.name ?? id).join(", ")
                            : record.restaurantId
                              ? ((allRestaurants.data || []).find((r: ControlCenterRestaurantSnapshot) => r.id === record.restaurantId)?.name ?? record.restaurantId)
                              : <span className="text-[var(--text-muted)]">Alla</span>}
                        </td>
                        <td className="py-3 pr-4"><Badge tone={record.isActive ? "success" : "neutral"}>{record.isActive ? "Aktiv" : "Inaktiv"}</Badge></td>
                        <td className="py-3 pr-4 tabular-nums text-[var(--text-secondary)]">{formatNumber(record.usedCount)}{record.maxUses != null ? ` / ${formatNumber(record.maxUses)}` : ""}</td>
                        <td className="py-3 pr-4 text-[var(--text-muted)] text-xs">{record.expiresAt ? formatDate(record.expiresAt) : "—"}</td>
                        <td className="py-3"><Button variant="secondary" onClick={() => openEditCoupon(record)}><Pencil size={12} /> Redigera</Button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : null}
      </Surface>

      {/* Kupong-modal */}
      <Modal
        open={couponModalOpen}
        onClose={() => { setCouponModalOpen(false); setEditingCoupon(null); }}
        title={editingCoupon ? `Redigera ${editingCoupon.code}` : "Ny kupongkod"}
        footer={
          <div className="flex items-center justify-between gap-3">
            <div>
              {editingCoupon && (
                <Button variant="danger" onClick={() => { if (!confirm(`Radera ${editingCoupon.code}?`)) return; deleteCouponMutation.mutate(); }} disabled={deleteCouponMutation.isPending}>Radera</Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button onClick={() => { setCouponModalOpen(false); setEditingCoupon(null); }}>Avbryt</Button>
              <Button variant="primary" onClick={() => {
                if (!couponForm.code.trim()) { setCouponError("Kod krävs."); return; }
                if (couponForm.discountType !== "free_delivery" && (!couponForm.discountValue || Number(couponForm.discountValue) <= 0)) { setCouponError("Värde måste vara > 0."); return; }
                setCouponError(null);
                saveCouponMutation.mutate(couponForm);
              }} disabled={saveCouponMutation.isPending}>
                {saveCouponMutation.isPending ? "Sparar..." : "Spara"}
              </Button>
            </div>
          </div>
        }
      >
        <div className="grid gap-4">
          {couponError && <p className="rounded-lg bg-[rgba(239,68,68,0.1)] px-4 py-3 text-sm text-red-400">{couponError}</p>}
          <Field label="Kod"><Input value={couponForm.code} onChange={(e) => setCouponForm((p) => ({ ...p, code: e.target.value.toUpperCase() }))} placeholder="SOMMAR25" autoFocus /></Field>
          <Field label="Beskrivning (valfritt)"><Input value={couponForm.description} onChange={(e) => setCouponForm((p) => ({ ...p, description: e.target.value }))} placeholder="Sommarkampanj 2026" /></Field>
          <Field label="Typ">
            <Select value={couponForm.discountType} onChange={(e) => setCouponForm((p) => ({ ...p, discountType: e.target.value as CouponForm["discountType"] }))}>
              <option value="percentage">Procent</option>
              <option value="fixed">Fast belopp</option>
              <option value="free_delivery">Fri leverans</option>
            </Select>
          </Field>
          {couponForm.discountType !== "free_delivery" && (
            <Field label={couponForm.discountType === "percentage" ? "Värde (%)" : "Värde (kr)"}>
              <Input type="number" min="0" value={couponForm.discountValue} onChange={(e) => setCouponForm((p) => ({ ...p, discountValue: e.target.value }))} placeholder={couponForm.discountType === "percentage" ? "15" : "50"} />
            </Field>
          )}
          <div className="grid grid-cols-2 gap-4">
            <Field label="Min. ordervärde (kr)"><Input type="number" min="0" value={couponForm.minOrderAmount} onChange={(e) => setCouponForm((p) => ({ ...p, minOrderAmount: e.target.value }))} placeholder="0" /></Field>
            <Field label="Max antal (tom = ∞)"><Input type="number" min="1" value={couponForm.maxUses} onChange={(e) => setCouponForm((p) => ({ ...p, maxUses: e.target.value }))} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Giltig från"><Input type="date" value={couponForm.startsAt} onChange={(e) => setCouponForm((p) => ({ ...p, startsAt: e.target.value }))} /></Field>
            <Field label="Giltig till"><Input type="date" value={couponForm.expiresAt} onChange={(e) => setCouponForm((p) => ({ ...p, expiresAt: e.target.value }))} /></Field>
          </div>
          <Field label="Restauranger (tom = alla)">
            <div className="max-h-36 overflow-y-auto rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-secondary)] p-2 flex flex-col gap-1">
              {(allRestaurants.data ?? []).map((r: ControlCenterRestaurantSnapshot) => {
                const checked = couponForm.applicableRestaurantIds.includes(r.id);
                return (
                  <label key={r.id} className="flex items-center gap-2 cursor-pointer px-2 py-1 rounded hover:bg-[rgba(255,255,255,0.04)] text-sm select-none">
                    <input type="checkbox" checked={checked} onChange={() => setCouponForm((p) => ({ ...p, applicableRestaurantIds: checked ? p.applicableRestaurantIds.filter((id) => id !== r.id) : [...p.applicableRestaurantIds, r.id] }))} className="accent-emerald-500 h-3.5 w-3.5 shrink-0" />
                    <span className="text-[var(--text-primary)]">{r.name}</span>
                  </label>
                );
              })}
            </div>
          </Field>
          <Field label="Status">
            <Select value={couponForm.isActive ? "active" : "inactive"} onChange={(e) => setCouponForm((p) => ({ ...p, isActive: e.target.value === "active" }))}>
              <option value="active">Aktiv</option>
              <option value="inactive">Inaktiv</option>
            </Select>
          </Field>
        </div>
      </Modal>

      <AutomaticDealModal
        open={dealModalOpen}
        onClose={() => { setDealModalOpen(false); setActiveDeal(null); setDealPrefill(undefined); setPendingLegacyMigration(null); }}
        restaurants={restaurants.data}
        categories={categories.data || []}
        products={products.data || []}
        initialDeal={activeDeal}
        prefill={activeDeal ? undefined : dealPrefill || (selectedRestaurantId ? { restaurantId: selectedRestaurantId, scopeType: tab === "product" ? "PRODUCT" : tab === "category" ? "CATEGORY" : "RESTAURANT" } : undefined) as any}
        onSaved={async () => {
          if (!pendingLegacyMigration) return;
          await clearLegacyProductDiscount(pendingLegacyMigration.id);
          await queryClient.invalidateQueries({ queryKey: dealProductsQueryKey(selectedRestaurantId) });
          await queryClient.invalidateQueries({ queryKey: ["menu", "products"] });
          setPendingLegacyMigration(null);
        }}
      />

      <PopupDealModal
        open={popupModalOpen}
        onClose={() => { setPopupModalOpen(false); setPopupTargetDeal(null); }}
        deal={popupTargetDeal}
      />

      <BogoDealModal
        open={bogoModalOpen}
        onClose={() => { setBogoModalOpen(false); setBogoDeal(null); }}
        deal={bogoDeal}
        prefillRestaurantId={selectedRestaurantId}
      />

      {/* Deal-väljare: när admin trycker "Skicka popup för deal" listar vi
          alla aktiva deals och låter användaren välja en. Vald deal →
          öppnas i PopupDealModal för att bygga popup-overlayn. */}
      <Modal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        title="Välj deal att skicka som popup"
        description="Popupen kopplas till en befintlig deal — rabatt, restaurang och giltighetstid kommer från dealen. Du bestämmer bara hur popupen ser ut."
        footer={<div className="flex justify-end"><Button onClick={() => setPickerOpen(false)}>Avbryt</Button></div>}
      >
        <div className="grid gap-2 max-h-[60vh] overflow-auto">
          {(automaticDeals.data || []).filter((d) => d.isActive && !isPopupDeal(d)).length === 0 ? (
            <EmptyState title="Inga deals tillgängliga" description="Skapa en vanlig deal först (Restaurant/Products/Categories) — sen kan du skicka popup för den." />
          ) : (
            (automaticDeals.data || [])
              .filter((d) => d.isActive && !isPopupDeal(d))
              .map((deal) => (
                <button
                  key={deal.id}
                  type="button"
                  onClick={() => {
                    setPopupTargetDeal(deal);
                    setPickerOpen(false);
                    setPopupModalOpen(true);
                  }}
                  className="surface-muted px-5 py-4 text-left hover:bg-[rgba(255,255,255,0.05)]"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-black tracking-[-0.02em]">{deal.title}</p>
                        <Badge tone="info">{scopeLabel[deal.scopeType] || deal.scopeType}</Badge>
                      </div>
                      <p className="mt-1 text-sm text-[var(--text-secondary)]">
                        {deal.restaurant?.name || (deal.isGlobal ? "Alla restauranger" : "Ingen restaurang")} • {deal.discountType === "PERCENTAGE" ? `${deal.discountValue}%` : `${deal.discountValue} kr`}
                      </p>
                    </div>
                    <Badge tone="success">Välj →</Badge>
                  </div>
                </button>
              ))
          )}
        </div>
      </Modal>
    </div>
  );
}
