"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Trash2 } from "lucide-react";
import {
  createAutomaticDeal,
  dealsQueryKey,
  deleteAutomaticDeal,
  type AutomaticDealRecord,
  type DealCategoryRef,
  type DealDiscountType,
  type DealProductRef,
  type DealRestaurantRef,
  type DealScopeType,
  updateAutomaticDeal,
} from "@/modules/deals/api";
import { Badge, Button, Field, Input, Modal, Select, Textarea } from "@/shared/components/ui";
import { ImageUploadField } from "@/shared/components/image-upload";

type Draft = {
  title: string;
  description: string;
  badgeText: string;
  imageUrl: string;
  restaurantId: string;
  isGlobal: boolean;
  scopeType: DealScopeType;
  discountType: DealDiscountType;
  discountValue: number;
  minOrder: number;
  targetIds: string[];
  isActive: boolean;
  showOnSite: boolean;
  showAsBanner: boolean;
  popupEnabled: boolean;
  maxUsages: string;
  maxUsesPerCustomer: string;
  validUntil: string;
  sortOrder: number;
};

const defaultDraft: Draft = {
  title: "",
  description: "",
  badgeText: "",
  imageUrl: "",
  restaurantId: "",
  isGlobal: false,
  scopeType: "RESTAURANT",
  discountType: "PERCENTAGE",
  discountValue: 10,
  minOrder: 0,
  targetIds: [],
  isActive: true,
  showOnSite: true,
  showAsBanner: false,
  // Default false här. "Popup"-flaggan på vanliga deals är legacy och
  // styrde tidigare en banner i menyn. Äkta popup-deals (claim-popupen
  // i webb/RN) byggs via Popup-fliken som sätter popupHeadline/Body/Code.
  popupEnabled: false,
  maxUsages: "",
  maxUsesPerCustomer: "",
  validUntil: "",
  sortOrder: 0,
};

const mapDealToDraft = (deal: AutomaticDealRecord): Draft => ({
  title: deal.title,
  description: deal.description || "",
  badgeText: deal.badgeText || "",
  imageUrl: deal.imageUrl || "",
  restaurantId: deal.restaurantId || deal.applicableRestaurantIds?.[0] || "",
  isGlobal: deal.isGlobal,
  scopeType: deal.scopeType,
  discountType: deal.discountType === "FIXED_PRICE" ? "FIXED_PRICE" : deal.discountType === "FIXED" ? "FIXED" : "PERCENTAGE",
  discountValue: deal.discountValue,
  minOrder: deal.minOrder || 0,
  targetIds: deal.targetIds || deal.comboProductIds || [],
  isActive: deal.isActive,
  showOnSite: deal.showOnSite,
  showAsBanner: deal.showAsBanner ?? false,
  popupEnabled: deal.popupEnabled,
  maxUsages: deal.maxUsages ? String(deal.maxUsages) : "",
  maxUsesPerCustomer: deal.maxUsesPerCustomer ? String(deal.maxUsesPerCustomer) : "",
  validUntil: deal.validUntil ? deal.validUntil.slice(0, 10) : "",
  sortOrder: deal.sortOrder || 0,
});

export function AutomaticDealModal({
  open,
  onClose,
  restaurants,
  categories,
  products,
  initialDeal,
  prefill,
  restaurantLocked = false,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  restaurants: DealRestaurantRef[];
  categories: DealCategoryRef[];
  products: DealProductRef[];
  initialDeal?: AutomaticDealRecord | null;
  prefill?: Partial<Draft>;
  restaurantLocked?: boolean;
  onSaved?: (deal: AutomaticDealRecord) => Promise<void> | void;
}) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Draft>(defaultDraft);
  const [error, setError] = useState<string | null>(null);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!open) return;
    const nextDraft = initialDeal
      ? { ...defaultDraft, ...prefill, ...mapDealToDraft(initialDeal) }
      : {
          ...defaultDraft,
          restaurantId: prefill?.restaurantId || restaurants[0]?.id || "",
          ...prefill,
        };
    setDraft(nextDraft);
    setError(null);
  }, [initialDeal, open, prefill, restaurants]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const availableTargets = useMemo(() => {
    if (draft.scopeType === "CATEGORY") {
      return categories.map((category) => ({ id: category.id, label: category.name, meta: `${category._count?.products || 0} products` }));
    }
    return products.map((product) => ({ id: product.id, label: product.name, meta: `${product.category.name} • ${product.price} kr` }));
  }, [categories, draft.scopeType, products]);

  const isItemScope = draft.scopeType === "PRODUCT" || draft.scopeType === "CATEGORY";
  const supportsFixedPrice = isItemScope;

  const saveMutation = useMutation({
    mutationFn: async () => {
      setError(null);
      const payload = {
        title: draft.title,
        description: draft.description || null,
        badgeText: draft.badgeText || null,
        imageUrl: draft.imageUrl || null,
        scopeType: draft.scopeType,
        discountType: draft.discountType,
        discountValue: draft.discountValue,
        minOrder: draft.scopeType === "MIN_ORDER" ? draft.minOrder : 0,
        targetIds: draft.targetIds,
        restaurantId: draft.isGlobal ? null : draft.restaurantId || null,
        isGlobal: draft.isGlobal,
        isActive: draft.isActive,
        showOnSite: draft.showOnSite,
        showAsBanner: draft.showAsBanner,
        popupEnabled: draft.popupEnabled,
        maxUsages: draft.maxUsages ? Number(draft.maxUsages) : null,
        maxUsesPerCustomer: draft.maxUsesPerCustomer ? Number(draft.maxUsesPerCustomer) : null,
        validUntil: draft.validUntil || null,
        sortOrder: draft.sortOrder,
      };

      if (initialDeal?.id) {
        return updateAutomaticDeal(initialDeal.id, payload);
      }
      return createAutomaticDeal(payload);
    },
    onSuccess: async (savedDeal) => {
      await onSaved?.(savedDeal);
      await queryClient.invalidateQueries({ queryKey: dealsQueryKey });
      await queryClient.invalidateQueries({ queryKey: ["menu"] });
      await queryClient.invalidateQueries({ queryKey: ["restaurants"] });
      onClose();
    },
    onError: (caught: any) => {
      setError(caught?.response?.data?.error || "Could not save the deal.");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!initialDeal?.id) return { success: true };
      return deleteAutomaticDeal(initialDeal.id);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: dealsQueryKey });
      await queryClient.invalidateQueries({ queryKey: ["menu"] });
      await queryClient.invalidateQueries({ queryKey: ["restaurants"] });
      onClose();
    },
  });

  const toggleTarget = (targetId: string) => {
    setDraft((current) => ({
      ...current,
      targetIds: current.targetIds.includes(targetId)
        ? current.targetIds.filter((item) => item !== targetId)
        : [...current.targetIds, targetId],
    }));
  };

  const canSave =
    draft.title.trim().length > 0 &&
    (draft.isGlobal || restaurantLocked || draft.restaurantId.length > 0) &&
    (!isItemScope && draft.scopeType !== "COMBO" ? true : draft.targetIds.length > 0);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={initialDeal ? `Edit ${initialDeal.title}` : "New automatic deal"}
      description="Deals is now the single admin workspace for automatic promotions. Product and category promos can live here without adding a second discount system."
      footer={
        <div className="flex items-center justify-between gap-3">
          <div>
            {initialDeal ? (
              <Button variant="danger" onClick={() => deleteMutation.mutate()} disabled={deleteMutation.isPending}>
                <Trash2 size={16} /> Delete
              </Button>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={onClose}>Close</Button>
            <Button variant="primary" onClick={() => saveMutation.mutate()} disabled={!canSave || saveMutation.isPending}>
              {saveMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : "Save deal"}
            </Button>
          </div>
        </div>
      }
    >
      <div className="grid gap-5 lg:grid-cols-[0.95fr_1.05fr]">
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Title"><Input value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} /></Field>
            <Field label="Badge label"><Input value={draft.badgeText} onChange={(event) => setDraft((current) => ({ ...current, badgeText: event.target.value }))} placeholder="-20%" /></Field>
            <Field label="Scope"><Select value={draft.scopeType} onChange={(event) => setDraft((current) => {
              const nextScope = event.target.value as DealScopeType;
              const nextItemScope = nextScope === "PRODUCT" || nextScope === "CATEGORY";
              return {
                ...current,
                scopeType: nextScope,
                targetIds: [],
                discountType: !nextItemScope && current.discountType === "FIXED_PRICE" ? "PERCENTAGE" : current.discountType,
              };
            })}><option value="RESTAURANT">Restaurant</option><option value="PRODUCT">Products</option><option value="CATEGORY">Categories</option><option value="MIN_ORDER">Min order</option><option value="COMBO">Combo</option></Select></Field>
            <Field label="Discount type"><Select value={draft.discountType} onChange={(event) => setDraft((current) => ({ ...current, discountType: event.target.value as DealDiscountType }))}><option value="PERCENTAGE">Percentage</option>{supportsFixedPrice ? <option value="FIXED_PRICE">Fixed price</option> : <option value="FIXED">Fixed amount</option>}</Select></Field>
            <Field label={draft.discountType === "PERCENTAGE" ? "Discount percent" : draft.discountType === "FIXED_PRICE" ? "Fixed price" : "Discount amount"}><Input type="number" value={draft.discountValue} onChange={(event) => setDraft((current) => ({ ...current, discountValue: Number(event.target.value) }))} /></Field>
            <Field label="Sort order"><Input type="number" value={draft.sortOrder} onChange={(event) => setDraft((current) => ({ ...current, sortOrder: Number(event.target.value) }))} /></Field>
            <Field label="Active"><Select value={draft.isActive ? "yes" : "no"} onChange={(event) => setDraft((current) => ({ ...current, isActive: event.target.value === "yes" }))}><option value="yes">Yes</option><option value="no">No</option></Select></Field>
            <Field label="Visible on site"><Select value={draft.showOnSite ? "yes" : "no"} onChange={(event) => setDraft((current) => ({ ...current, showOnSite: event.target.value === "yes" }))}><option value="yes">Yes</option><option value="no">No</option></Select></Field>
            <Field label="Visa som banner"><Select value={draft.showAsBanner ? "yes" : "no"} onChange={(event) => setDraft((current) => ({ ...current, showAsBanner: event.target.value === "yes" }))}><option value="no">Nej</option><option value="yes">Ja — banner på restaurangsidan</option></Select></Field>
            <Field label="Popup enabled"><Select value={draft.popupEnabled ? "yes" : "no"} onChange={(event) => setDraft((current) => ({ ...current, popupEnabled: event.target.value === "yes" }))}><option value="yes">Yes</option><option value="no">No</option></Select></Field>
            <Field label="Max global usages"><Input value={draft.maxUsages} onChange={(event) => setDraft((current) => ({ ...current, maxUsages: event.target.value }))} placeholder="Optional" /></Field>
            <Field label="Max per customer"><Input value={draft.maxUsesPerCustomer} onChange={(event) => setDraft((current) => ({ ...current, maxUsesPerCustomer: event.target.value }))} placeholder="Optional" /></Field>
            <Field label="Valid until"><Input type="date" value={draft.validUntil} onChange={(event) => setDraft((current) => ({ ...current, validUntil: event.target.value }))} /></Field>
            {draft.scopeType === "MIN_ORDER" ? <Field label="Minimum order"><Input type="number" value={draft.minOrder} onChange={(event) => setDraft((current) => ({ ...current, minOrder: Number(event.target.value) }))} /></Field> : null}
            {!restaurantLocked ? (
              <>
                <Field label="Apply globally"><Select value={draft.isGlobal ? "yes" : "no"} onChange={(event) => setDraft((current) => ({ ...current, isGlobal: event.target.value === "yes" }))}><option value="no">No</option><option value="yes">Yes</option></Select></Field>
                <Field label="Restaurant"><Select value={draft.restaurantId} onChange={(event) => setDraft((current) => ({ ...current, restaurantId: event.target.value }))} disabled={draft.isGlobal}><option value="">Select restaurant</option>{restaurants.map((restaurant) => <option key={restaurant.id} value={restaurant.id}>{restaurant.name}</option>)}</Select></Field>
              </>
            ) : null}
            <div className="md:col-span-2"><Field label="Description"><Textarea value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} /></Field></div>
            <div className="md:col-span-2">
              <ImageUploadField
                label="Bannerbild (visas på restaurangsidan om 'Visa som banner' är på)"
                value={draft.imageUrl}
                onChange={(url) => setDraft((current) => ({ ...current, imageUrl: url }))}
              />
            </div>
          </div>
          {error ? <div className="rounded-2xl border border-[rgba(239,107,115,0.2)] bg-[rgba(239,107,115,0.08)] px-4 py-4 text-sm text-[#ffd2d5]">{error}</div> : null}
        </div>

        <div className="space-y-4">
          <div className="surface-muted px-4 py-4">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">Rule summary</p>
            <div className="mt-3 grid gap-2 text-sm text-[var(--text-secondary)]">
              <div>Most specific automatic promo wins for display: product over category over restaurant.</div>
              <div>Checkout-facing restaurant deals stay in this same section, but product/category targets are managed here too so admin doesn’t split the workflow.</div>
            </div>
          </div>

          {isItemScope || draft.scopeType === "COMBO" ? (
            <div className="surface-muted px-4 py-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">Targets</p>
                <Badge tone="info">{draft.targetIds.length} selected</Badge>
              </div>
              <div className="mt-4 grid max-h-[420px] gap-2 overflow-auto">
                {availableTargets.length === 0 ? (
                  <div className="text-sm text-[var(--text-secondary)]">Select a restaurant to load {draft.scopeType === "CATEGORY" ? "categories" : draft.scopeType === "COMBO" ? "products for the combo" : "products"}.</div>
                ) : availableTargets.map((target) => (
                  <button key={target.id} type="button" onClick={() => toggleTarget(target.id)} className={`rounded-2xl border px-4 py-3 text-left transition-all ${draft.targetIds.includes(target.id) ? "border-[rgba(94,166,255,0.24)] bg-[rgba(94,166,255,0.1)]" : "border-[var(--border-subtle)] bg-[var(--bg-panel-muted)]"}`}>
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-black">{target.label}</p>
                        <p className="mt-1 text-xs text-[var(--text-secondary)]">{target.meta}</p>
                      </div>
                      {draft.targetIds.includes(target.id) ? <Badge tone="success">Selected</Badge> : null}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}
