"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, RefreshCw } from "lucide-react";
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
  type AutomaticDealRecord,
  type DealProductRef,
} from "@/modules/deals/api";
import { AutomaticDealModal } from "@/modules/deals/components/automatic-deal-modal";
import { Badge, Button, EmptyState, ErrorPanel, Field, Input, SectionHeader, Select, Surface } from "@/shared/components/ui";
import { formatCurrency, formatDate, formatNumber } from "@/shared/utils/format";

type DealsTab = "restaurant" | "product" | "category";

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
    restaurant: dealsForRestaurantContext.filter((deal) => deal.isActive && (deal.scopeType === "RESTAURANT" || deal.scopeType === "COMBO" || deal.scopeType === "MIN_ORDER")).length,
    product: dealsForRestaurantContext.filter((deal) => deal.isActive && deal.scopeType === "PRODUCT").length + filteredLegacyProductDiscounts.length,
    category: dealsForRestaurantContext.filter((deal) => deal.isActive && deal.scopeType === "CATEGORY").length,
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
      <Surface className="px-6 py-6">
        <SectionHeader
          eyebrow="Deals"
          title="Deals and offers"
          description="Restaurant, product and category deals. Personal customer codes are managed from the Customers page."
          actions={
            <>
              <Button variant="secondary" onClick={() => { void automaticDeals.refetch(); }}><RefreshCw size={16} /> Refresh</Button>
              <Button variant="primary" onClick={openCreate}><Plus size={16} /> New deal</Button>
            </>
          }
        />
      </Surface>

      <div className="grid gap-4 sm:grid-cols-2">
        <Surface className="px-5 py-5"><p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">Automatic deals</p><p className="mt-3 text-3xl font-black tracking-[-0.04em]">{formatNumber(stats.automatic)}</p></Surface>
        <Surface className="px-5 py-5"><p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">Active automatic</p><p className="mt-3 text-3xl font-black tracking-[-0.04em]">{formatNumber(stats.activeAutomatic)}</p></Surface>
      </div>

      <Surface className="px-6 py-6">
        <div className="grid gap-4 lg:grid-cols-[260px_1fr] lg:items-end">
          <Field label="Restaurant context">
            <Select value={selectedRestaurantId || ""} onChange={(event) => setSelectedRestaurantId(event.target.value)}>
              {restaurants.data.map((restaurant) => <option key={restaurant.id} value={restaurant.id}>{restaurant.name}</option>)}
            </Select>
          </Field>
          <Field label="Search"><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search deals" /></Field>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <button type="button" onClick={() => setTab("restaurant")} className={`rounded-full border px-4 py-2 text-[11px] font-black uppercase tracking-[0.18em] ${tab === "restaurant" ? "border-[rgba(243,191,87,0.24)] bg-[rgba(243,191,87,0.1)] text-[var(--accent-strong)]" : "border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] text-[var(--text-secondary)]"}`}>Restaurant {activeDealsCount.restaurant > 0 ? `(${activeDealsCount.restaurant})` : ""}</button>
          <button type="button" onClick={() => setTab("product")} className={`rounded-full border px-4 py-2 text-[11px] font-black uppercase tracking-[0.18em] ${tab === "product" ? "border-[rgba(243,191,87,0.24)] bg-[rgba(243,191,87,0.1)] text-[var(--accent-strong)]" : "border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] text-[var(--text-secondary)]"}`}>Products {activeDealsCount.product > 0 ? `(${activeDealsCount.product})` : ""}</button>
          <button type="button" onClick={() => setTab("category")} className={`rounded-full border px-4 py-2 text-[11px] font-black uppercase tracking-[0.18em] ${tab === "category" ? "border-[rgba(243,191,87,0.24)] bg-[rgba(243,191,87,0.1)] text-[var(--accent-strong)]" : "border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] text-[var(--text-secondary)]"}`}>Categories {activeDealsCount.category > 0 ? `(${activeDealsCount.category})` : ""}</button>
        </div>

        {tab === "restaurant" || tab === "category" ? (
          <div className="mt-6 grid gap-3 lg:grid-cols-2">
            {filteredAutomaticDeals.length === 0 ? <EmptyState title={`No ${tab} deals`} /> : filteredAutomaticDeals.map((deal) => {
              const targetLabels = (deal.targetIds || []).map((targetId) => categoryNameMap.get(targetId) || productNameMap.get(targetId) || targetId).slice(0, 3);
              return (
                <button key={deal.id} type="button" onClick={() => { setDealPrefill(undefined); setPendingLegacyMigration(null); setActiveDeal(deal); setDealModalOpen(true); }} className="surface-muted px-5 py-5 text-left">
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
      </Surface>

      <AutomaticDealModal
        open={dealModalOpen}
        onClose={() => { setDealModalOpen(false); setActiveDeal(null); setDealPrefill(undefined); setPendingLegacyMigration(null); }}
        restaurants={restaurants.data}
        categories={categories.data || []}
        products={products.data || []}
        initialDeal={activeDeal}
        prefill={activeDeal ? undefined : dealPrefill || (selectedRestaurantId ? { restaurantId: selectedRestaurantId, scopeType: tab === "product" ? "PRODUCT" : tab === "category" ? "CATEGORY" : "RESTAURANT" } : undefined)}
        onSaved={async () => {
          if (!pendingLegacyMigration) return;
          await clearLegacyProductDiscount(pendingLegacyMigration.id);
          await queryClient.invalidateQueries({ queryKey: dealProductsQueryKey(selectedRestaurantId) });
          await queryClient.invalidateQueries({ queryKey: ["menu", "products"] });
          setPendingLegacyMigration(null);
        }}
      />
    </div>
  );
}
