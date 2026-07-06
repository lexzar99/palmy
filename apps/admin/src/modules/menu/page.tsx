"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronDown, ChevronRight, ChevronUp, GripVertical, Loader2, Plus, Search, Tags, Upload } from "lucide-react";
import { dealsQueryKey, getAutomaticDeals, type AutomaticDealRecord, type DealProductRef, type DealRestaurantRef } from "@/modules/deals/api";
import { AutomaticDealModal } from "@/modules/deals/components/automatic-deal-modal";
import {
  copyCategory,
  copyExtraGroup,
  copyProduct,
  createCategory,
  createExtraGroup,
  createProduct,
  deleteCategory,
  deleteExtraGroup,
  deleteProduct,
  duplicateExtraGroup,
  duplicateProduct,
  getCategories,
  getExtraGroups,
  getMenuRestaurants,
  getProducts,
  menuCategoriesQueryKey,
  menuGroupsQueryKey,
  menuProductsQueryKey,
  menuRestaurantsQueryKey,
  reorderCategories,
  reorderProducts,
  r2AutoMatch,
  menuBulkImport,
  menuSync,
  type MenuSyncResponse,
  type MenuImportResult,
  r2PathsTemplate,
  updateCategory,
  updateExtraGroup,
  updateProduct,
  type CategoryRecord,
  type ExtraGroupRecord,
  type ProductRecord,
  type R2AutoMatchResult,
  type R2PathsTemplate,
  type RestaurantRef,
} from "@/modules/menu/api";
import { Badge, Button, EmptyState, ErrorPanel, Field, Input, Modal, PageHeader, Select, Surface, Tabs, Textarea, Toggle } from "@/shared/components/ui";
import { CityRestaurantPicker } from "@/shared/components/city-restaurant-picker";
import { ImageUploadField } from "@/shared/components/image-upload";
import { useToast } from "@/shared/components/toast";
import { Copy } from "lucide-react";
import { formatCurrency } from "@/shared/utils/format";

type MenuTab = "categories" | "products" | "rewardable" | "extras";
const REWARD_MULTIPLIERS = [1.3, 1.5, 1.7, 2] as const;
const REWARD_EARN_RATE = 0.1;

function calcRewardPoints(price: number, multiplier = 1.5, override?: number | null) {
  if (override && override > 0) return Math.ceil(override);
  return Math.ceil(Math.max(0, Number(price) || 0) * Math.max(1, Number(multiplier) || 1.5));
}

function effectiveRewardPercent(multiplier = 1.5) {
  return (REWARD_EARN_RATE / Math.max(0.01, multiplier)) * 100;
}

// Enhetlig monokrom på/av-stil för alla toggle-kontroller i menyeditorn. Aktiv =
// ifylld accent (vit/silver) med kontrast-text, inaktiv = ren kontur. Ingen
// dekorfärg, så valt läge alltid läses lika över hela editorn.
const toggleOnClass = "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-fg)]";
const toggleOffClass = "border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]";

// Monokrom status-badge för listraderna. Aktiv = subtil ifylld neutral, dold =
// dämpad kontur. Ingen grön/röd — status läses på text + fyllnad, inte färg.
function StatusBadge({ active }: { active: boolean }) {
  return (
    <span
      className={`inline-flex items-center rounded-[7px] border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.06em] ${
        active
          ? "border-transparent bg-[var(--accent-soft)] text-[var(--text-primary)]"
          : "border-[var(--border-subtle)] text-[var(--text-muted)]"
      }`}
    >
      {active ? "Aktiv" : "Dold"}
    </span>
  );
}

function CategoryModal({ open, restaurantId, category, onClose }: { open: boolean; restaurantId: string; category: CategoryRecord | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ name: "", description: "", position: 0, isActive: true });

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!open) return;
    setForm(category ? { name: category.name, description: category.description || "", position: category.position, isActive: category.isActive ?? true } : { name: "", description: "", position: 0, isActive: true });
  }, [category, open]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const saveMutation = useMutation({ meta: { toast: false },
    mutationFn: async () => {
      if (category) {
        return updateCategory(category.id, form);
      }
      return createCategory({ ...form, restaurantId });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: menuCategoriesQueryKey(restaurantId) });
      onClose();
    },
  });

  const deleteMutation = useMutation({ meta: { toast: false },
    mutationFn: async () => {
      if (category) {
        await deleteCategory(category.id);
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: menuCategoriesQueryKey(restaurantId) });
      onClose();
    },
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={category ? "Redigera kategori" : "Ny kategori"}
      footer={
        <div className="flex items-center justify-between gap-3">
          <div>{category ? (
            <Button
              variant="danger"
              onClick={() => {
                if (window.confirm(`Radera kategorin "${category.name}"?\n\nAlla produkter i kategorin försvinner också. Detta kan inte ångras.`)) {
                  deleteMutation.mutate();
                }
              }}
            >Radera</Button>
          ) : null}</div>
          <div className="flex gap-2"><Button onClick={onClose}>Stäng</Button><Button variant="primary" onClick={() => saveMutation.mutate()}>{saveMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : "Spara"}</Button></div>
        </div>
      }
    >
      <div className="grid gap-4">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Namn"><Input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} /></Field>
          <Field label="Position"><Input type="number" value={form.position} onChange={(event) => setForm((current) => ({ ...current, position: Number(event.target.value) }))} /></Field>
        </div>
        <Field label="Status"><Select value={form.isActive ? "active" : "inactive"} onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.value === "active" }))}><option value="active">Aktiv</option><option value="inactive">Inaktiv</option></Select></Field>
        <Field label="Beskrivning"><Textarea value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} /></Field>
      </div>
    </Modal>
  );
}

function ProductModal({ open, restaurantId, product, categories, extraGroups, existingDeals, restaurants, products, onClose }: { open: boolean; restaurantId: string; product: ProductRecord | null; categories: CategoryRecord[]; extraGroups: ExtraGroupRecord[]; existingDeals: AutomaticDealRecord[]; restaurants: DealRestaurantRef[]; products: DealProductRef[]; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ name: "", description: "", note: "", price: 0, categoryId: "", imageUrl: "", isActive: true, isVegan: false, isVegetarian: false, isGlutenFree: false, position: 0, displayMode: "FULL" as "FULL" | "COMPACT", hideDescription: false, rewardable: false, rewardPointsMultiplier: 1.5, rewardPointsPrice: "" as string | number, localPriceLocked: false, discountActive: false, discountPercent: 0, extraGroupIds: [] as string[] });
  const [promotionModalOpen, setPromotionModalOpen] = useState(false);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!open) return;
    setForm(
      product
        ? {
            name: product.name,
            description: product.description || "",
            note: product.note || "",
            price: product.price,
            categoryId: product.categoryId,
            imageUrl: product.imageUrl || "",
            isActive: product.isActive ?? true,
            isVegan: product.isVegan ?? false,
            isVegetarian: product.isVegetarian ?? false,
            isGlutenFree: product.isGlutenFree ?? false,
            position: product.position,
            displayMode: product.displayMode ?? "FULL",
            hideDescription: product.hideDescription ?? false,
            rewardable: product.rewardable ?? false,
            rewardPointsMultiplier: product.rewardPointsMultiplier ?? 1.5,
            rewardPointsPrice: product.rewardPointsPrice ?? "",
            localPriceLocked: (product as any).localPriceLocked ?? false,
            discountActive: product.discountActive ?? false,
            discountPercent: product.discountPercent ?? 0,
            extraGroupIds: product.extraGroups.map((group) => group.id),
          }
        : {
            name: "",
            description: "",
            note: "",
            price: 0,
            categoryId: categories[0]?.id || "",
            imageUrl: "",
            isActive: true,
            isVegan: false,
            isVegetarian: false,
            isGlutenFree: false,
            position: 0,
            displayMode: "FULL",
            hideDescription: false,
            rewardable: false,
            rewardPointsMultiplier: 1.5,
            rewardPointsPrice: "",
            localPriceLocked: false,
            discountActive: false,
            discountPercent: 0,
            extraGroupIds: [],
          },
    );
  }, [categories, open, product]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const saveMutation = useMutation({ meta: { toast: false },
    mutationFn: async () => {
      // Backend kräver discountPercent 1-95 när satt; percent 0 eller toggle av = rensa rabatten.
      const discountOn = form.discountActive && form.discountPercent > 0;
      const rewardOverride = form.rewardPointsPrice === "" ? null : Math.ceil(Number(form.rewardPointsPrice));
      const payload = {
        ...form,
        discountActive: discountOn,
        discountPercent: discountOn ? Math.min(95, Math.max(1, Math.round(form.discountPercent))) : null,
        rewardPointsMultiplier: Number(form.rewardPointsMultiplier) || 1.5,
        rewardPointsPrice: Number.isFinite(rewardOverride) && rewardOverride && rewardOverride > 0 ? rewardOverride : null,
        restaurantId,
      };
      if (product) {
        return updateProduct(product.id, payload);
      }
      return createProduct(payload);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: menuProductsQueryKey(restaurantId) });
      onClose();
    },
  });

  const deleteMutation = useMutation({ meta: { toast: false },
    mutationFn: async () => {
      if (product) {
        await deleteProduct(product.id);
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: menuProductsQueryKey(restaurantId) });
      onClose();
    },
  });

  const toggleExtraGroup = (groupId: string) =>
    setForm((current) => ({
      ...current,
      extraGroupIds: current.extraGroupIds.includes(groupId) ? current.extraGroupIds.filter((item) => item !== groupId) : [...current.extraGroupIds, groupId],
    }));

  const productDeal = useMemo(
    () => existingDeals.find((deal) => deal.scopeType === "PRODUCT" && deal.targetIds.includes(product?.id || "")) || null,
    [existingDeals, product?.id],
  );

  const relatedCategoryDeals = useMemo(
    () => existingDeals.filter((deal) => deal.scopeType === "CATEGORY" && deal.targetIds.includes(form.categoryId || product?.categoryId || "")),
    [existingDeals, form.categoryId, product?.categoryId],
  );

  const restaurantWideDeals = useMemo(
    () => existingDeals.filter((deal) => deal.scopeType === "RESTAURANT"),
    [existingDeals],
  );
  const rewardOverrideRaw = form.rewardPointsPrice === "" ? null : Number(form.rewardPointsPrice);
  const rewardOverride = rewardOverrideRaw != null && Number.isFinite(rewardOverrideRaw) && rewardOverrideRaw > 0 ? rewardOverrideRaw : null;
  const rewardPreviewPoints = calcRewardPoints(form.price, form.rewardPointsMultiplier, rewardOverride);
  const rewardPercent = effectiveRewardPercent(form.rewardPointsMultiplier);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={product ? "Redigera produkt" : "Ny produkt"}
      footer={<div className="flex items-center justify-between gap-3"><div>{product ? (
        <Button
          variant="danger"
          onClick={() => {
            if (window.confirm(`Radera produkten "${product.name}"?\n\nProdukten försvinner från menyn. Befintliga ordrar påverkas inte. Detta kan inte ångras.`)) {
              deleteMutation.mutate();
            }
          }}
        >Radera</Button>
      ) : null}</div><div className="flex gap-2"><Button onClick={onClose}>Stäng</Button><Button variant="primary" onClick={() => saveMutation.mutate()}>{saveMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : "Spara"}</Button></div></div>}
    >
        <div className="grid gap-4 md:grid-cols-2">
        {/* P14 vänster: Detaljer-kort med bild-thumb, namn, orange-kantat pris, beskrivning och tillgänglighets-toggle. */}
        <div className="surface px-5 py-5">
          <p className="text-[15px] font-extrabold tracking-[-0.3px] text-[var(--text-primary)]">Detaljer</p>
          <div className="mt-4 flex gap-3.5">
            <span
              aria-hidden
              className="h-[84px] w-[84px] shrink-0 rounded-[12px] bg-cover bg-center"
              style={form.imageUrl ? { backgroundImage: `url(${form.imageUrl})` } : { backgroundImage: DISH_PLACEHOLDER }}
            />
            <div className="min-w-0 flex-1 grid gap-3">
              <Field label="Namn"><Input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} /></Field>
              <Field label="Pris">
                <Input
                  type="number"
                  className="border-2 border-[var(--accent)] font-bold"
                  value={form.price}
                  onChange={(event) => setForm((current) => ({ ...current, price: Number(event.target.value) }))}
                />
              </Field>
            </div>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Kategori"><Select value={form.categoryId} onChange={(event) => setForm((current) => ({ ...current, categoryId: event.target.value }))}>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</Select></Field>
            <Field label="Position"><Input type="number" value={form.position} onChange={(event) => setForm((current) => ({ ...current, position: Number(event.target.value) }))} /></Field>
          </div>
          <div className="mt-4">
            <ImageUploadField
              label="Bild"
              value={form.imageUrl}
              onChange={(url) => setForm((current) => ({ ...current, imageUrl: url }))}
              kind="product"
              restaurantId={restaurantId}
              categoryId={form.categoryId || null}
              productId={product?.id || null}
              // För NYA produkter (inget id än) bygger backend bild-path:en på namnet,
              // så du kan lägga bilden direkt när du skapar produkten. Kräver att
              // Namn + Kategori är ifyllda först.
              fileBaseName={form.name}
            />
          </div>
          <div className="mt-4"><Field label="Beskrivning"><Textarea value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} /></Field></div>
          <div className="mt-4"><Field label="Notering (visas längst ner i produktmodalen)"><Textarea value={form.note} onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))} /></Field></div>
          <div className="mt-4 flex items-center justify-between gap-3 border-t border-[var(--border-subtle)] pt-3.5">
            <div>
              <p className="text-[13px] font-semibold text-[var(--text-primary)]">Tillgänglig</p>
              <p className="text-[11.5px] text-[var(--text-muted)]">Visas för kunder</p>
            </div>
            <Toggle checked={form.isActive} onChange={(next) => setForm((current) => ({ ...current, isActive: next }))} />
          </div>
        </div>
        {/* P14 höger: kopplade Tillvalsgrupper med obligatorisk/valfri-badge och en dämpad rad med tillvalen. */}
        <div className="surface px-5 py-5">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-[15px] font-extrabold tracking-[-0.3px] text-[var(--text-primary)]">Tillvalsgrupper</p>
            {extraGroups.length > 0 ? (
              <span className="text-[11px] font-bold text-[var(--text-muted)]">{form.extraGroupIds.length} av {extraGroups.length} valda</span>
            ) : null}
          </div>
          {extraGroups.length === 0 ? (
            <p className="mt-3 text-[13px] text-[var(--text-muted)]">Inga tillvalsgrupper finns för restaurangen ännu.</p>
          ) : (
            <div className="mt-3 grid max-h-[260px] gap-1.5 overflow-y-auto pr-1">
              {extraGroups.map((group) => {
                const linked = form.extraGroupIds.includes(group.id);
                const required = group.required;
                const limit = group.type === "RADIO" ? "välj 1" : group.maxSelections ? `max ${group.maxSelections}` : null;
                const badgeText = required ? ["Obligatorisk", limit].filter(Boolean).join(" · ") : ["Valfri", limit].filter(Boolean).join(" · ");
                return (
                  <button
                    key={group.id}
                    type="button"
                    onClick={() => toggleExtraGroup(group.id)}
                    aria-pressed={linked}
                    title={group.extras.map((extra) => (extra.priceAddon ? `${extra.name} (+${extra.priceAddon} kr)` : extra.name)).join(" · ")}
                    className={`flex w-full items-center justify-between gap-2.5 rounded-[10px] border px-3 py-2 text-left transition-colors ${
                      linked
                        ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                        : "border-[var(--border-subtle)] hover:border-[var(--border-strong)]"
                    }`}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      {linked ? <Check size={13} strokeWidth={3} className="shrink-0 text-[var(--accent-ink)]" /> : null}
                      <span className="truncate text-[13px] font-bold text-[var(--text-primary)]">{group.name}</span>
                    </span>
                    <span className={`badge shrink-0 ${required ? "badge-accent" : "badge-neutral"}`}>{badgeText}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <div className="md:col-span-2"></div>
        <div className="md:col-span-2 surface-muted px-4 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="card-label">Rabatt</p>
            <TogglePill active={form.discountActive} onClick={() => setForm((current) => ({ ...current, discountActive: !current.discountActive }))}>Rabatt aktiv</TogglePill>
          </div>
          {form.discountActive ? (
            <div className="mt-3 grid items-end gap-4 md:grid-cols-2">
              <Field label="Rabatt %">
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={form.discountPercent}
                  onChange={(event) => setForm((current) => ({ ...current, discountPercent: Math.min(100, Math.max(0, Number(event.target.value))) }))}
                />
              </Field>
              <p className="pb-2.5 text-[13px] text-[var(--text-secondary)]">
                {form.discountPercent > 0
                  ? `${form.price} kr → ${(form.price * (1 - form.discountPercent / 100)).toFixed(2)} kr`
                  : "Sätt en procent över 0 för att aktivera rabatten."}
              </p>
            </div>
          ) : null}
        </div>
        <div className="md:col-span-2 surface-muted px-4 py-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="card-label">Kampanjgenväg</p>
            </div>
            <Button variant="secondary" onClick={() => setPromotionModalOpen(true)} disabled={!product}>{productDeal ? "Redigera produktdeal" : "Skapa produktdeal"}</Button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {product ? (productDeal ? <Badge tone="neutral">Direkt produktdeal</Badge> : <Badge tone="neutral">Ingen produktdeal</Badge>) : <Badge tone="neutral">Spara produkten först</Badge>}
            {relatedCategoryDeals.length > 0 ? <Badge tone="neutral">{relatedCategoryDeals.length} kategorideal gäller</Badge> : null}
            {restaurantWideDeals.length > 0 ? <Badge tone="neutral">{restaurantWideDeals.length} restaurangbreda deal</Badge> : null}
          </div>
        </div>
        <div className="md:col-span-2 surface-muted px-4 py-4">
          <p className="card-label">Visningsläge i menyn</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {(["FULL", "COMPACT"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setForm((current) => ({ ...current, displayMode: mode }))}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3.5 py-2 text-[12px] font-semibold transition-colors ${form.displayMode === mode ? toggleOnClass : toggleOffClass}`}
              >
                {form.displayMode === mode ? <Check size={13} strokeWidth={3} /> : null}
                {mode === "FULL" ? "Full bredd (1-per-rad)" : "Halv bredd (2-per-rad)"}
              </button>
            ))}
          </div>
        </div>
        <div className="md:col-span-2 surface-muted px-4 py-4">
          <p className="card-label">Alternativ</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <TogglePill active={form.hideDescription} onClick={() => setForm((current) => ({ ...current, hideDescription: !current.hideDescription }))}>Dölj beskrivning i menyn</TogglePill>
            <TogglePill active={form.rewardable} onClick={() => setForm((current) => ({ ...current, rewardable: !current.rewardable }))}>★ Köpbar med poäng (Vpoints)</TogglePill>
            <TogglePill active={form.localPriceLocked} onClick={() => setForm((current) => ({ ...current, localPriceLocked: !current.localPriceLocked }))}>🔒 Lås lokalt pris (kedja)</TogglePill>
          </div>
        </div>
        <div className="md:col-span-2 surface-muted px-4 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="card-label">Rewards-pris</p>
              <p className="mt-1 text-[12px] text-[var(--text-secondary)]">Standard: poängpris = pris × multiplier, avrundat uppåt.</p>
            </div>
            <div className="rounded-[12px] border border-[var(--border-subtle)] bg-[var(--bg-panel)] px-4 py-2 text-right">
              <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Kostar</p>
              <p className="text-[22px] font-black tabular-nums text-[var(--text-primary)]">{rewardPreviewPoints}p</p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {REWARD_MULTIPLIERS.map((m) => (
              <TogglePill key={m} active={Number(form.rewardPointsMultiplier) === m} onClick={() => setForm((current) => ({ ...current, rewardPointsMultiplier: m, rewardPointsPrice: "" }))}>
                {m.toFixed(1)}x
              </TogglePill>
            ))}
          </div>
          <div className="mt-3 grid gap-4 md:grid-cols-2">
            <Field label="Multiplier">
              <Input
                type="number"
                step="0.1"
                min={1}
                value={form.rewardPointsMultiplier}
                onChange={(event) => setForm((current) => ({ ...current, rewardPointsMultiplier: Number(event.target.value), rewardPointsPrice: "" }))}
              />
            </Field>
            <Field label="Override points">
              <Input
                type="number"
                min={1}
                value={form.rewardPointsPrice}
                placeholder={`${rewardPreviewPoints}p auto`}
                onChange={(event) => setForm((current) => ({ ...current, rewardPointsPrice: event.target.value }))}
              />
            </Field>
          </div>
          <p className="mt-3 text-[12px] text-[var(--text-secondary)]">
            {form.price} kr → {rewardPreviewPoints}p. Vid 10% intjäning motsvarar {Number(form.rewardPointsMultiplier).toFixed(1)}x ungefär <b className="text-[var(--text-primary)]">{rewardPercent.toFixed(2)}%</b> faktiskt reward-värde.
          </p>
        </div>
        <div className="md:col-span-2 surface-muted px-4 py-4">
          <p className="card-label">Kostflaggor</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {([
              ["isVegan", "Vegan"],
              ["isVegetarian", "Vegetarian"],
              ["isGlutenFree", "Glutenfri"],
            ] as const).map(([key, label]) => (
              <TogglePill key={key} active={Boolean(form[key])} onClick={() => setForm((current) => ({ ...current, [key]: !current[key] }))}>{label}</TogglePill>
            ))}
          </div>
        </div>
      </div>

      <AutomaticDealModal
        open={promotionModalOpen}
        onClose={() => setPromotionModalOpen(false)}
        restaurants={restaurants}
        categories={categories}
        products={products}
        initialDeal={productDeal}
        prefill={{
          restaurantId,
          scopeType: "PRODUCT",
          targetIds: product ? [product.id] : [],
          title: product ? `${product.name} promo` : "",
          badgeText: productDeal?.badgeText || "",
          discountType: productDeal?.discountType === "PERCENTAGE" ? "PERCENTAGE" : "FIXED_PRICE",
        }}
        restaurantLocked
      />
    </Modal>
  );
}

// Enhetlig på/av-pill: aktiv = ifylld monokrom med bock, inaktiv = ren kontur.
// Används för alla on/off-kontroller i tillvalsmodalen så läget aldrig är otydligt.
function TogglePill({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[12px] font-semibold transition-colors ${active ? toggleOnClass : toggleOffClass}`}
    >
      {active ? <Check size={13} strokeWidth={3} /> : null}
      {children}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// BulkEditModal — skriv över valda fält på alla markerade produkter på en gång.
// Varje rad har en "Skriv över"-toggle (inkludera fältet?) + värdekontrollen.
// Bara påslagna fält hamnar i payloaden, så orörda inställningar lämnas ifred.
// ─────────────────────────────────────────────────────────────────────────
function BulkRow({ label, enabled, onToggle, children }: { label: string; enabled: boolean; onToggle: () => void; children: ReactNode }) {
  return (
    <div className="surface-muted px-4 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="card-label">{label}</p>
        <TogglePill active={enabled} onClick={onToggle}>Skriv över</TogglePill>
      </div>
      {enabled ? <div className="mt-3 flex flex-wrap gap-2">{children}</div> : null}
    </div>
  );
}

function BulkEditModal({ open, count, extraGroups, onClose, onApply }: { open: boolean; count: number; extraGroups: ExtraGroupRecord[]; onClose: () => void; onApply: (payload: Record<string, unknown>) => void }) {
  // En "enabled"-flagga per fält + själva värdet. Bara enabled-fält skickas.
  const [on, setOn] = useState({ displayMode: false, localPriceLocked: false, rewardable: false, diet: false, extraGroups: false });
  const [displayMode, setDisplayMode] = useState<"FULL" | "COMPACT">("FULL");
  const [localPriceLocked, setLocalPriceLocked] = useState(false);
  const [rewardable, setRewardable] = useState(false);
  const [isVegan, setIsVegan] = useState(false);
  const [isVegetarian, setIsVegetarian] = useState(false);
  const [isGlutenFree, setIsGlutenFree] = useState(false);
  const [extraGroupIds, setExtraGroupIds] = useState<string[]>([]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!open) return;
    setOn({ displayMode: false, localPriceLocked: false, rewardable: false, diet: false, extraGroups: false });
    setDisplayMode("FULL");
    setLocalPriceLocked(false);
    setRewardable(false);
    setIsVegan(false);
    setIsVegetarian(false);
    setIsGlutenFree(false);
    setExtraGroupIds([]);
  }, [open]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const toggleGroup = (id: string) => setExtraGroupIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  const anyEnabled = on.displayMode || on.localPriceLocked || on.rewardable || on.diet || on.extraGroups;

  const apply = () => {
    const payload: Record<string, unknown> = {};
    if (on.displayMode) payload.displayMode = displayMode;
    if (on.localPriceLocked) payload.localPriceLocked = localPriceLocked;
    if (on.rewardable) payload.rewardable = rewardable;
    if (on.diet) {
      payload.isVegan = isVegan;
      payload.isVegetarian = isVegetarian;
      payload.isGlutenFree = isGlutenFree;
    }
    if (on.extraGroups) payload.extraGroupIds = extraGroupIds;
    onApply(payload);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Ändra ${count} produkter`}
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button onClick={onClose}>Avbryt</Button>
          <Button variant="primary" disabled={!anyEnabled} onClick={apply}>Använd</Button>
        </div>
      }
    >
      <div className="grid gap-4">
        <BulkRow label="Visningsläge i menyn" enabled={on.displayMode} onToggle={() => setOn((c) => ({ ...c, displayMode: !c.displayMode }))}>
          <TogglePill active={displayMode === "FULL"} onClick={() => setDisplayMode("FULL")}>Hel bredd</TogglePill>
          <TogglePill active={displayMode === "COMPACT"} onClick={() => setDisplayMode("COMPACT")}>Halv bredd</TogglePill>
        </BulkRow>
        <BulkRow label="Lås lokalt pris" enabled={on.localPriceLocked} onToggle={() => setOn((c) => ({ ...c, localPriceLocked: !c.localPriceLocked }))}>
          <TogglePill active={localPriceLocked} onClick={() => setLocalPriceLocked((v) => !v)}>{localPriceLocked ? "På" : "Av"}</TogglePill>
        </BulkRow>
        <BulkRow label="Köpbar med Vpoints" enabled={on.rewardable} onToggle={() => setOn((c) => ({ ...c, rewardable: !c.rewardable }))}>
          <TogglePill active={rewardable} onClick={() => setRewardable((v) => !v)}>{rewardable ? "På" : "Av"}</TogglePill>
        </BulkRow>
        <BulkRow label="Kostflaggor" enabled={on.diet} onToggle={() => setOn((c) => ({ ...c, diet: !c.diet }))}>
          <TogglePill active={isVegan} onClick={() => setIsVegan((v) => !v)}>Vegansk</TogglePill>
          <TogglePill active={isVegetarian} onClick={() => setIsVegetarian((v) => !v)}>Vegetarisk</TogglePill>
          <TogglePill active={isGlutenFree} onClick={() => setIsGlutenFree((v) => !v)}>Glutenfri</TogglePill>
        </BulkRow>
        <BulkRow label="Tillvalsgrupper" enabled={on.extraGroups} onToggle={() => setOn((c) => ({ ...c, extraGroups: !c.extraGroups }))}>
          {extraGroups.length === 0 ? (
            <p className="text-[13px] text-[var(--text-secondary)]">Inga tillvalsgrupper finns.</p>
          ) : (
            extraGroups.map((group) => (
              <TogglePill key={group.id} active={extraGroupIds.includes(group.id)} onClick={() => toggleGroup(group.id)}>{group.name}</TogglePill>
            ))
          )}
        </BulkRow>
      </div>
    </Modal>
  );
}

function ExtraGroupModal({ open, restaurantId, group, categories, onClose }: { open: boolean; restaurantId: string; group: ExtraGroupRecord | null; categories: CategoryRecord[]; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [type, setType] = useState("CHECKBOX");
  const [required, setRequired] = useState(false);
  const [minSelections, setMinSelections] = useState(0);
  const [maxSelections, setMaxSelections] = useState(1);
  const [displayStyle, setDisplayStyle] = useState<"LIST" | "BOX_IMAGE">("LIST");
  const [allowQuantity, setAllowQuantity] = useState(false);
  const [extras, setExtras] = useState<Array<{ name: string; priceAddon: number; isDefault: boolean; imageUrl: string | null }>>([{ name: "", priceAddon: 0, isDefault: false, imageUrl: null }]);
  const [categoryIds, setCategoryIds] = useState<string[]>([]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!open) return;
    if (group) {
      setName(group.name);
      setType(group.type || "CHECKBOX");
      setRequired(group.required);
      setMinSelections(group.minSelections || 0);
      setMaxSelections(group.maxSelections || 1);
      setDisplayStyle(group.displayStyle === "BOX_IMAGE" ? "BOX_IMAGE" : "LIST");
      setAllowQuantity(group.allowQuantity ?? false);
      setExtras(group.extras.length ? group.extras.map((extra) => ({ name: extra.name, priceAddon: extra.priceAddon, isDefault: extra.isDefault || false, imageUrl: extra.imageUrl ?? null })) : [{ name: "", priceAddon: 0, isDefault: false, imageUrl: null }]);
      setCategoryIds(group.categoryIds ?? []);
    } else {
      setName("");
      setType("CHECKBOX");
      setRequired(false);
      setMinSelections(0);
      setMaxSelections(1);
      setDisplayStyle("LIST");
      setAllowQuantity(false);
      setExtras([{ name: "", priceAddon: 0, isDefault: false, imageUrl: null }]);
      setCategoryIds([]);
    }
  }, [group, open]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const saveMutation = useMutation({ meta: { toast: false },
    mutationFn: async () => {
      const payload = {
        name,
        type,
        required,
        minSelections,
        maxSelections,
        displayStyle,
        allowQuantity,
        restaurantId,
        categoryIds,
        extras: extras.filter((extra) => extra.name.trim()).map((extra) => ({ ...extra, priceAddon: Number(extra.priceAddon || 0), imageUrl: extra.imageUrl ?? null })),
      };
      if (group) {
        return updateExtraGroup(group.id, payload);
      }
      return createExtraGroup(payload);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: menuGroupsQueryKey(restaurantId) });
      await queryClient.invalidateQueries({ queryKey: menuProductsQueryKey(restaurantId) });
      onClose();
    },
  });

  const deleteMutation = useMutation({ meta: { toast: false },
    mutationFn: async () => {
      if (group) {
        await deleteExtraGroup(group.id);
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: menuGroupsQueryKey(restaurantId) });
      await queryClient.invalidateQueries({ queryKey: menuProductsQueryKey(restaurantId) });
      onClose();
    },
  });

  const updateExtra = (index: number, field: "name" | "priceAddon" | "isDefault" | "imageUrl", value: string | number | boolean | null) => {
    setExtras((current) => current.map((extra, currentIndex) => (currentIndex === index ? { ...extra, [field]: value } : extra)));
  };

  const toggleCategory = (categoryId: string) => setCategoryIds((current) => current.includes(categoryId) ? current.filter((id) => id !== categoryId) : [...current, categoryId]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={group ? "Redigera tillvalsgrupp" : "Ny tillvalsgrupp"}
      footer={<div className="flex items-center justify-between gap-3"><div>{group ? (
        <Button
          variant="danger"
          onClick={() => {
            if (window.confirm(`Radera tillvalsgruppen "${group.name}"?\n\nProdukter som använder gruppen tappar dessa tillval. Detta kan inte ångras.`)) {
              deleteMutation.mutate();
            }
          }}
        >Radera</Button>
      ) : null}</div><div className="flex gap-2"><Button onClick={onClose}>Stäng</Button><Button variant="primary" onClick={() => saveMutation.mutate()}>{saveMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : "Spara"}</Button></div></div>}
    >
      <div className="grid gap-4">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Namn"><Input value={name} onChange={(event) => setName(event.target.value)} /></Field>
          <Field label="Typ"><Select value={type} onChange={(event) => setType(event.target.value)}><option value="CHECKBOX">Checkbox</option><option value="RADIO">Radio</option></Select></Field>
        </div>

        {/* P15: gruppinställningar i ett kort — Gruppnamn redan ovan; här Val (min/max),
            visningsstil/antal samt Obligatorisk-toggle på egen rad. */}
        <div className="surface px-5 py-5">
          <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
            <Field label="Visningsstil"><Select value={displayStyle} onChange={(event) => setDisplayStyle(event.target.value === "BOX_IMAGE" ? "BOX_IMAGE" : "LIST")}><option value="LIST">Lista</option><option value="BOX_IMAGE">Bildrutor</option></Select></Field>
            <div>
              <span className="field-label">Val</span>
              <div className="mt-1.5 flex items-center gap-2">
                <Input type="number" className="w-[72px] text-center font-bold" value={minSelections} onChange={(event) => setMinSelections(Number(event.target.value))} aria-label="Min antal" />
                <span className="text-[var(--text-muted)]">–</span>
                <Input type="number" className="w-[72px] text-center font-bold" value={maxSelections} onChange={(event) => setMaxSelections(Number(event.target.value))} aria-label="Max antal" />
              </div>
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between gap-3 border-t border-[var(--border-subtle)] pt-3.5">
            <span className="text-[13px] font-semibold text-[var(--text-primary)]">Obligatorisk</span>
            <Toggle checked={required} onChange={setRequired} />
          </div>
          <div className="mt-3 flex items-center justify-between gap-3 border-t border-[var(--border-subtle)] pt-3.5">
            <span className="text-[13px] font-semibold text-[var(--text-primary)]">Antal per val</span>
            <Toggle checked={allowQuantity} onChange={setAllowQuantity} />
          </div>
        </div>

        <div className="surface-muted px-4 py-4">
          <p className="card-label">Kategorier</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {categories.map((category) => (
              <TogglePill key={category.id} active={categoryIds.includes(category.id)} onClick={() => toggleCategory(category.id)}>{category.name}</TogglePill>
            ))}
          </div>
        </div>

        {/* P15: TILLVAL-lista. Varje rad: dra-handtag, namn, +pris-pill, förvald-toggle, ta bort. */}
        <div className="grid gap-2.5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[13px] font-extrabold uppercase tracking-[0.04em] text-[var(--text-primary)]">Tillval</p>
            <button
              type="button"
              onClick={() => setExtras((current) => [...current, { name: "", priceAddon: 0, isDefault: false, imageUrl: null }])}
              className="inline-flex items-center gap-1 text-[12.5px] font-bold text-[var(--accent-ink)]"
            >
              <Plus size={14} /> Lägg till tillval
            </button>
          </div>
          <div className="surface overflow-hidden">
            {extras.map((extra, index) => (
              <div key={index} className={index > 0 ? "border-t border-[var(--row-divider)]" : ""}>
                <div className="flex items-center gap-3 px-4 py-3">
                  <GripVertical size={16} className="shrink-0 cursor-grab text-[var(--text-muted)]" aria-hidden />
                  <Input
                    className="min-w-0 flex-1 border-0 bg-transparent px-0 font-semibold focus:ring-0"
                    value={extra.name}
                    onChange={(event) => updateExtra(index, "name", event.target.value)}
                    placeholder="Namn på tillval"
                  />
                  <span className="inline-flex shrink-0 items-center gap-0.5 rounded-[8px] border border-[var(--border-subtle)] px-2.5 py-1.5 text-[13px] font-bold text-[var(--text-primary)]">
                    +
                    <input
                      type="number"
                      value={extra.priceAddon}
                      onChange={(event) => updateExtra(index, "priceAddon", Number(event.target.value))}
                      aria-label="Pristillägg"
                      className="w-[42px] bg-transparent text-right font-bold outline-none"
                    />
                    kr
                  </span>
                  <Toggle checked={extra.isDefault} onChange={(next) => updateExtra(index, "isDefault", next)} />
                  <RowIconButton label="Ta bort tillval" onClick={() => setExtras((current) => current.filter((_, currentIndex) => currentIndex !== index))}>
                    <Plus size={14} className="rotate-45" />
                  </RowIconButton>
                </div>
                {displayStyle === "BOX_IMAGE" ? (
                  <div className="px-4 pb-4 pl-[43px]">
                    <ImageUploadField
                      label="Bild"
                      value={extra.imageUrl || ""}
                      onChange={(url) => updateExtra(index, "imageUrl", url || null)}
                      kind="extra"
                      fileBaseName={extra.name}
                      restaurantId={restaurantId}
                      uploadOnly
                    />
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Import-modal: kopiera kategori/produkt/extra-grupp från en annan restaurang.
// Källan rörs inte — målet får nya id:n.
// ─────────────────────────────────────────────────────────────────────────
function ImportFromOtherModal({
  open,
  onClose,
  currentRestaurantId,
  tab,
  currentCategories,
}: {
  open: boolean;
  onClose: () => void;
  currentRestaurantId: string;
  tab: MenuTab;
  currentCategories: CategoryRecord[];
}) {
  const queryClient = useQueryClient();
  const [sourceRestaurantId, setSourceRestaurantId] = useState("");
  const [targetCategoryId, setTargetCategoryId] = useState("");
  const [error, setError] = useState<string | null>(null);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!open) {
      setSourceRestaurantId("");
      setTargetCategoryId("");
      setError(null);
    }
  }, [open]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const sourceCategories = useQuery({
    queryKey: ["import", "categories", sourceRestaurantId],
    queryFn: () => getCategories(sourceRestaurantId),
    enabled: open && tab === "categories" && Boolean(sourceRestaurantId),
  });
  const sourceProducts = useQuery({
    queryKey: ["import", "products", sourceRestaurantId],
    queryFn: () => getProducts(sourceRestaurantId),
    enabled: open && tab === "products" && Boolean(sourceRestaurantId),
  });
  const sourceGroups = useQuery({
    queryKey: ["import", "groups", sourceRestaurantId],
    queryFn: () => getExtraGroups(sourceRestaurantId),
    enabled: open && tab === "extras" && Boolean(sourceRestaurantId),
  });

  const copyMutation = useMutation({ meta: { toast: false },
    mutationFn: async (sourceId: string) => {
      setError(null);
      if (tab === "categories") return copyCategory(sourceId, currentRestaurantId);
      if (tab === "products") {
        if (!targetCategoryId) throw new Error("Välj målkategori först");
        return copyProduct(sourceId, currentRestaurantId, targetCategoryId);
      }
      return copyExtraGroup(sourceId, currentRestaurantId);
    },
    onSuccess: async () => {
      if (tab === "categories") await queryClient.invalidateQueries({ queryKey: menuCategoriesQueryKey(currentRestaurantId) });
      if (tab === "products") await queryClient.invalidateQueries({ queryKey: menuProductsQueryKey(currentRestaurantId) });
      if (tab === "extras") await queryClient.invalidateQueries({ queryKey: menuGroupsQueryKey(currentRestaurantId) });
    },
    onError: (err: any) => setError(err?.response?.data?.error || err?.message || "Kunde inte kopiera"),
  });

  const items: Array<{ id: string; name: string; meta?: string }> =
    tab === "categories"
      ? (sourceCategories.data || []).map((c) => ({ id: c.id, name: c.name, meta: `${c._count?.products ?? 0} produkter` }))
      : tab === "products"
        ? (sourceProducts.data || []).map((p) => ({ id: p.id, name: p.name, meta: `${(p as any).price ?? ""} kr` }))
        : (sourceGroups.data || []).map((g) => ({ id: g.id, name: g.name, meta: `${g.extras?.length ?? 0} tillval` }));

  const isLoading = (tab === "categories" && sourceCategories.isLoading) ||
    (tab === "products" && sourceProducts.isLoading) ||
    (tab === "extras" && sourceGroups.isLoading);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Importera ${tab === "categories" ? "kategori" : tab === "products" ? "produkt" : "tillbehörsgrupp"}`}
    >
      <div className="grid gap-5">
        <CityRestaurantPicker
          value={sourceRestaurantId}
          onChange={(rid) => setSourceRestaurantId(rid)}
          restaurantLabel="Källrestaurang"
        />

        {tab === "products" && sourceRestaurantId ? (
          <Field label="Målkategori i din restaurang">
            <Select value={targetCategoryId} onChange={(event) => setTargetCategoryId(event.target.value)}>
              <option value="">Välj kategori…</option>
              {currentCategories.map((category) => (
                <option key={category.id} value={category.id}>{category.name}</option>
              ))}
            </Select>
          </Field>
        ) : null}

        {error && <p className="text-sm font-semibold text-[var(--text-primary)]">{error}</p>}

        {sourceRestaurantId ? (
          isLoading ? (
            <p className="text-sm text-[var(--text-secondary)]">Laddar…</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-[var(--text-secondary)]">Inget att kopiera.</p>
          ) : (
            <div className="grid gap-2 max-h-[400px] overflow-y-auto">
              {items.map((item) => (
                <div key={item.id} className="surface-muted flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold truncate">{item.name}</p>
                    {item.meta && <p className="text-[11px] text-[var(--text-muted)] mt-0.5">{item.meta}</p>}
                  </div>
                  <Button
                    variant="primary"
                    onClick={() => copyMutation.mutate(item.id)}
                    disabled={copyMutation.isPending || (tab === "products" && !targetCategoryId)}
                  >
                    <Copy size={13} /> Kopiera
                  </Button>
                </div>
              ))}
            </div>
          )
        ) : null}
      </div>
    </Modal>
  );
}

const BULK_IMPORT_TEMPLATE = `# Pålägg (definieras EN gång, återanvänds av produkter)
extraGroups:
  - name: Sås
    type: radio          # radio = max 1 | checkbox = flera
    required: false      # true => Min 1
    options:
      - { name: Vitlökssås, price: 0 }   # price i KRONOR (0 = ingår)
      - { name: Stark sås, price: 0 }
  - name: Tillbehör
    type: radio
    required: true
    options:
      - { name: Pommes, price: 0 }
      - { name: Ris, price: 0 }

# Meny (kategorier → produkter)
categories:
  - name: Kyckling
    description: "Krispig friterad kyckling"   # valfri
    products:
      - name: Crispy tallrik
        description: "5 bitar med sås & pommes" # valfri
        price: 139                              # KRONOR
        extras: [Sås, Tillbehör]                # grupp-namn ovan / i DB
`;

/**
 * Bulk-import: klistra in YAML/JSON → förhandsvisa (dry-run) → importera.
 * Idempotent upsert per restaurang. Pålägg som redan finns globalt lämnas orörda
 * men återanvänds för koppling. Priser i kronor → öre.
 */
function BulkImportButton({ restaurantId }: { restaurantId: string }) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState("");
  const [result, setResult] = useState<MenuImportResult | null>(null);

  const extractError = (e: any): string =>
    e?.response?.data?.error || e?.message || "Okänt fel, kolla nätverk eller serverloggar.";

  const previewMutation = useMutation({ meta: { toast: false },
    mutationFn: () => menuBulkImport({ restaurantId, content, apply: false }),
    onSuccess: (data) => setResult(data),
    onError: (e) => showToast({ type: "error", message: extractError(e) }),
  });

  const applyMutation = useMutation({ meta: { toast: false },
    mutationFn: () => menuBulkImport({ restaurantId, content, apply: true }),
    onSuccess: async (data) => {
      setResult(data);
      await queryClient.invalidateQueries({ queryKey: ["menu"] });
      const s = data.summary;
      showToast({
        type: "success",
        message: `Import klar: +${s.categoriesCreated} kat, +${s.productsCreated} prod, ${s.links} kopplingar`,
      });
    },
    onError: (e) => showToast({ type: "error", message: extractError(e) }),
  });

  const isBusy = previewMutation.isPending || applyMutation.isPending;
  const s = result?.summary;

  return (
    <>
      <Button variant="secondary" onClick={() => { setOpen(true); setResult(null); }}>
        <Upload size={14} /> Bulk-import
      </Button>

      <Modal
        open={open}
        onClose={() => { if (!isBusy) { setOpen(false); } }}
        title="Massimport av meny (YAML / JSON)"
        footer={
          <div className="flex justify-between gap-2">
            <Button onClick={() => setContent(BULK_IMPORT_TEMPLATE)} disabled={isBusy}>Infoga mall</Button>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => previewMutation.mutate()} disabled={isBusy || !content.trim()}>
                {previewMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : null} Förhandsvisa
              </Button>
              <Button
                variant="primary"
                onClick={() => applyMutation.mutate()}
                disabled={isBusy || !content.trim() || !result || result.dryRun === false}
              >
                {applyMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : null}
                {applyMutation.isPending ? "Importerar…" : "Importera"}
              </Button>
            </div>
          </div>
        }
      >
        <div className="grid gap-4">
          <Textarea
            value={content}
            onChange={(e) => { setContent(e.target.value); setResult(null); }}
            placeholder="YAML eller JSON"
            rows={14}
            style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 12 }}
          />

          {result ? (
            <div className="grid gap-3">
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-7">
                {[
                  { n: s!.categoriesCreated, l: "Nya kat." },
                  { n: s!.categoriesUpdated, l: "Uppd. kat." },
                  { n: s!.productsCreated, l: "Nya prod." },
                  { n: s!.productsUpdated, l: "Uppd. prod." },
                  { n: s!.extraGroupsCreated, l: "Nya pålägg" },
                  { n: s!.extraGroupsUpdated, l: "Uppd. pålägg" },
                  { n: s!.links, l: "Kopplingar" },
                ].map((c) => (
                  <div key={c.l} className="surface-muted px-2 py-3 text-center">
                    <div className="text-xl font-black">{c.n}</div>
                    <div className="mt-1 text-[9px] uppercase tracking-widest text-[var(--text-secondary)]">{c.l}</div>
                  </div>
                ))}
              </div>

              {result.dryRun ? (
                <p className="text-xs text-[var(--text-secondary)]">Förhandsvisning, inget har skrivits. Klicka <b>Importera</b> för att köra.</p>
              ) : (
                <p className="text-xs font-semibold text-[var(--text-primary)]">Importen är klar och menyn uppdaterad.</p>
              )}

              {result.warnings.length > 0 ? (
                <div>
                  <p className="mb-1 text-[11px] font-black uppercase tracking-widest text-[var(--text-muted)]">Varningar ({result.warnings.length})</p>
                  <div className="surface-muted max-h-40 overflow-y-auto px-3 py-2 text-xs text-[var(--text-secondary)]">
                    {result.warnings.map((w, i) => <div key={i} className="border-b border-[var(--border-subtle)] py-1 last:border-0">{w}</div>)}
                  </div>
                </div>
              ) : null}

              {result.examples.length > 0 ? (
                <div>
                  <p className="mb-1 text-[11px] font-black uppercase tracking-widest text-[var(--text-muted)]">Plan</p>
                  <div className="surface-muted max-h-48 overflow-y-auto px-3 py-2 text-xs">
                    {result.examples.map((ex, i) => <div key={i} className="py-0.5">{ex}</div>)}
                  </div>
                </div>
              ) : null}

              {result.errors.length > 0 ? (
                <div className="surface-muted px-3 py-2 text-xs font-semibold text-[var(--text-primary)]">
                  {result.errors.map((er, i) => <div key={i}>{er}</div>)}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </Modal>
    </>
  );
}

/**
 * MenuSyncButton — kedjesynk (steg 3). Kopierar den valda (master-)restaurangens
 * meny till en eller flera valda platser. Dry-run först (visar created/updated),
 * sedan Synka. Idempotent, och varje plats lokala isActive (slutsålt) bevaras.
 */
function MenuSyncButton({ sourceRestaurantId, restaurants }: { sourceRestaurantId: string; restaurants: RestaurantRef[] }) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [targets, setTargets] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<MenuSyncResponse | null>(null);

  const targetOptions = restaurants.filter((r) => r.id !== sourceRestaurantId);
  const sourceName = restaurants.find((r) => r.id === sourceRestaurantId)?.name ?? "vald restaurang";
  const extractError = (e: any): string => e?.response?.data?.error || e?.message || "Okänt fel.";

  const run = (apply: boolean) =>
    menuSync({ sourceRestaurantId, targetRestaurantIds: [...targets], apply });

  const previewMutation = useMutation({ meta: { toast: false },
    mutationFn: () => run(false),
    onSuccess: (data) => setResult(data),
    onError: (e) => showToast({ type: "error", message: extractError(e) }),
  });
  const applyMutation = useMutation({ meta: { toast: false },
    mutationFn: () => run(true),
    onSuccess: async (data) => {
      setResult(data);
      await queryClient.invalidateQueries({ queryKey: ["menu"] });
      const tot = data.results.reduce((a, r) => a + r.summary.productsCreated + r.summary.productsUpdated, 0);
      showToast({ type: "success", message: `Synk klar: ${data.results.length} platser, ${tot} produkter` });
    },
    onError: (e) => showToast({ type: "error", message: extractError(e) }),
  });

  const isBusy = previewMutation.isPending || applyMutation.isPending;
  const toggle = (id: string) => setTargets((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  return (
    <>
      <Button variant="secondary" onClick={() => { setOpen(true); setResult(null); setTargets(new Set()); }}>
        <Copy size={14} /> Synka till platser
      </Button>

      <Modal
        open={open}
        onClose={() => { if (!isBusy) setOpen(false); }}
        title="Synka meny till platser"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => previewMutation.mutate()} disabled={isBusy || targets.size === 0}>
              {previewMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : null} Förhandsvisa
            </Button>
            <Button variant="primary" onClick={() => applyMutation.mutate()} disabled={isBusy || targets.size === 0 || !result || result.dryRun === false}>
              {applyMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : null}
              {applyMutation.isPending ? "Synkar…" : "Synka"}
            </Button>
          </div>
        }
      >
        <div className="grid gap-4">
          {targetOptions.length === 0 ? (
            <p className="text-sm text-[var(--text-secondary)]">Det finns inga andra restauranger att synka till.</p>
          ) : (
            <div className="grid gap-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">Målplatser ({targets.size} valda)</p>
              <div className="grid gap-1 max-h-56 overflow-y-auto">
                {targetOptions.map((r) => (
                  <label key={r.id} className="surface-muted flex cursor-pointer items-center gap-2.5 px-3 py-2.5 text-sm">
                    <input type="checkbox" checked={targets.has(r.id)} onChange={() => { toggle(r.id); setResult(null); }} className="h-4 w-4 accent-[var(--accent)]" />
                    <span>{r.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {result ? (
            <div className="grid gap-2">
              {result.results.map((r) => {
                const name = restaurants.find((x) => x.id === r.targetRestaurantId)?.name ?? r.targetRestaurantId;
                const s = r.summary;
                return (
                  <div key={r.targetRestaurantId} className="surface-muted px-4 py-3 text-sm">
                    <div className="mb-1 font-semibold">{name}</div>
                    <div className="text-[12px] text-[var(--text-secondary)]">
                      Produkter: <b className="text-[var(--text-primary)]">+{s.productsCreated}</b> nya, {s.productsUpdated} uppdaterade ·
                      {" "}Kategorier: +{s.categoriesCreated}/{s.categoriesUpdated} · Pålägg: +{s.groupsCreated}/{s.groupsReused} återanv. · {s.links} kopplingar
                    </div>
                  </div>
                );
              })}
              <p className={`text-xs ${result.dryRun ? "text-[var(--text-secondary)]" : "font-semibold text-[var(--text-primary)]"}`}>
                {result.dryRun ? "Förhandsvisning, inget har skrivits. Klicka Synka för att köra." : "Synken är klar, platsernas menyer uppdaterade."}
              </p>
            </div>
          ) : null}
        </div>
      </Modal>
    </>
  );
}

/**
 * R2 Auto-match-knapp: scannar Cloudflare R2-bucketen för restaurangen och
 * binder automatiskt bilder till produkter/kategorier baserat
 * på slug-konventionen. Visar alltid dry-run-resultat först så admin kan se
 * vad som kommer hända innan något skrivs till DB.
 */
function R2AutoMatchButton({ restaurantId }: { restaurantId: string }) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [dryRun, setDryRun] = useState<R2AutoMatchResult | null>(null);

  const extractError = (e: any): string => {
    if (e?.response?.status === 401 || e?.response?.status === 403) return 'Saknar behörighet';
    if (e?.response?.status === 503) return e?.response?.data?.error || 'R2 är inte konfigurerat';
    if (e?.response?.data?.error) return e.response.data.error;
    if (e?.message) return e.message;
    return 'Okänt fel';
  };

  const dryMutation = useMutation({ meta: { toast: false },
    mutationFn: () => r2AutoMatch(restaurantId, true),
    onSuccess: (data) => { setDryRun(data); setOpen(true); },
    onError: (e) => {
      showToast({ type: 'error', message: `Auto-match dry-run misslyckades: ${extractError(e)}` });
    },
  });

  const applyMutation = useMutation({ meta: { toast: false },
    mutationFn: () => r2AutoMatch(restaurantId, false),
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: menuProductsQueryKey(restaurantId) });
      await queryClient.invalidateQueries({ queryKey: menuCategoriesQueryKey(restaurantId) });
      setOpen(false);
      setDryRun(null);
      const total = (data.matched.hero ? 1 : 0) + (data.matched.logo ? 1 : 0) + data.matched.categories + data.matched.products;
      showToast({ type: 'success', message: `Auto-match klar: ${total} bilder kopplade` });
    },
    onError: (e) => {
      showToast({ type: 'error', message: `Auto-match misslyckades: ${extractError(e)}` });
    },
  });

  const error = (dryMutation.error as any)?.response?.data?.error || (applyMutation.error as any)?.response?.data?.error;

  return (
    <>
      <Button variant="secondary" onClick={() => dryMutation.mutate()} disabled={dryMutation.isPending}>
        {dryMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : null}
        Matcha bilder från R2
      </Button>

      <Modal
        open={open && !!dryRun}
        onClose={() => { setOpen(false); setDryRun(null); }}
        title="R2 auto-match"
        footer={
          <div className="flex justify-end gap-2">
            <Button onClick={() => { setOpen(false); setDryRun(null); }}>Avbryt</Button>
            <Button variant="primary" onClick={() => applyMutation.mutate()} disabled={applyMutation.isPending}>
              {applyMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : null}
              Skriv till databasen
            </Button>
          </div>
        }
      >
        {dryRun ? (
          <div className="grid gap-4">
            <div className="surface-muted px-4 py-3 text-xs">
              <div className="text-[var(--text-secondary)]">Bucket-prefix</div>
              <code className="text-sm">{dryRun.prefix}</code>
              <div className="mt-2 text-[var(--text-secondary)]">{dryRun.totalObjectsInPrefix} object i bucketen</div>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="surface-muted px-3 py-3 text-center">
                <div className="text-2xl font-black">{dryRun.matched.hero ? "✓" : "—"}</div>
                <div className="mt-1 text-[10px] uppercase tracking-widest text-[var(--text-secondary)]">Hero</div>
              </div>
              <div className="surface-muted px-3 py-3 text-center">
                <div className="text-2xl font-black">{dryRun.matched.logo ? "✓" : "—"}</div>
                <div className="mt-1 text-[10px] uppercase tracking-widest text-[var(--text-secondary)]">Logo</div>
              </div>
              <div className="surface-muted px-3 py-3 text-center">
                <div className="text-2xl font-black">{dryRun.matched.categories}</div>
                <div className="mt-1 text-[10px] uppercase tracking-widest text-[var(--text-secondary)]">Kategorier</div>
              </div>
              <div className="surface-muted px-3 py-3 text-center">
                <div className="text-2xl font-black">{dryRun.matched.products}</div>
                <div className="mt-1 text-[10px] uppercase tracking-widest text-[var(--text-secondary)]">Produkter</div>
              </div>
            </div>
            {dryRun.updates.length > 0 ? (
              <div>
                <p className="mb-2 text-[11px] font-black uppercase tracking-widest text-[var(--text-muted)]">Exempel på vad som kommer kopplas</p>
                <div className="surface-muted max-h-64 overflow-y-auto px-3 py-2 text-xs">
                  {dryRun.updates.map((u) => (
                    <div key={u.key} className="border-b border-[var(--border-subtle)] py-1.5 last:border-b-0">
                      <Badge tone="neutral">{u.kind}</Badge>
                      <code className="ml-2 break-all">{u.key}</code>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-sm text-[var(--text-secondary)]">Inga matchningar hittades.</p>
            )}
            {error ? <p className="text-sm font-semibold text-[var(--text-primary)]">{error}</p> : null}
          </div>
        ) : null}
      </Modal>
    </>
  );
}

/**
 * R2 Bulk-upload-knapp: visar mappar + exakta filnamn admin ska använda.
 * Workflow: kopiera mapp-path, gå till R2-dashboard, döp filerna enligt listan,
 * dra in i mappen. Klicka sen "Matcha bilder från R2" så uppdateras DB.
 */
const basenameOf = (key: string) => key.split('/').pop() || key;
const folderOf = (key: string) => {
  const i = key.lastIndexOf('/');
  return i >= 0 ? key.slice(0, i + 1) : '';
};

function R2PathsButton({ restaurantId }: { restaurantId: string }) {
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);

  const query = useQuery({
    queryKey: ["r2-paths-template", restaurantId],
    queryFn: () => r2PathsTemplate(restaurantId),
    enabled: open,
    staleTime: 60_000,
  });

  const copyToClipboard = async (text: string, label = 'Kopierat') => {
    try {
      await navigator.clipboard.writeText(text);
      showToast({ type: 'success', message: label });
    } catch {
      showToast({ type: 'error', message: 'Kunde inte kopiera' });
    }
  };

  const totalProducts = query.data?.categories.reduce((s, c) => s + c.products.length, 0) || 0;

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        R2 bulk-upload mall
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Bulk-upload mall"
        footer={
          <div className="flex justify-end gap-2">
            <Button onClick={() => setOpen(false)}>Stäng</Button>
          </div>
        }
      >
        {query.isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 size={24} className="animate-spin" />
          </div>
        ) : query.error ? (
          <p className="text-sm font-semibold text-[var(--text-primary)]">Kunde inte ladda mall. Försök igen.</p>
        ) : query.data ? (
          <div className="grid gap-4">
            <div className="surface-muted px-4 py-3 text-[11px]">
              <div className="flex items-baseline gap-2">
                <span className="font-bold text-[var(--text-primary)]">{query.data.restaurant.name}</span>
                <span className="text-[var(--text-secondary)]">·</span>
                <span className="text-[var(--text-secondary)]">
                  {query.data.categories.length} kategorier · {totalProducts} produkter
                </span>
              </div>
              <div className="mt-1 text-[10px] uppercase tracking-widest text-[var(--text-muted)]">
                Format: WebP rekommenderas. Andra format (jpg, png) funkar men endpoints konverterar bara via admin-upload, inte vid direkt-upload till R2.
              </div>
            </div>

            <_R2Section
              title="Rot-filer"
              folder={query.data.prefix}
              rows={[
                { filename: basenameOf(query.data.hero.key), label: query.data.hero.label },
                { filename: basenameOf(query.data.logo.key), label: query.data.logo.label },
              ]}
              onCopy={copyToClipboard}
            />

            {query.data.categories.length ? (
              <div>
                <p className="mb-2 text-[11px] font-black uppercase tracking-widest text-[var(--text-muted)]">
                  Kategorier, produkter ({totalProducts})
                </p>
                <div className="grid gap-3">
                  {query.data.categories.map((c) => (
                    <_R2Section
                      key={c.id}
                      title={c.name}
                      subtitle={`slug: ${c.slug}`}
                      folder={c.folder}
                      rows={c.products.map((p) => ({ filename: basenameOf(p.key), label: p.name }))}
                      onCopy={copyToClipboard}
                      empty="Inga produkter"
                      compact
                    />
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </Modal>
    </>
  );
}

/**
 * R2-sektion = en mapp + lista av filer som ska in i den mappen.
 * Visar mapp-path med kopieringsknapp och varje fil med basename + produktnamn.
 * Kopierings-actions: hela sektionen, bara filnamn, eller fil-för-fil.
 */
function _R2Section({ title, subtitle, folder, rows, onCopy, empty, compact }: {
  title: string;
  subtitle?: string;
  folder: string;
  rows: Array<{ filename: string; label: string }>;
  onCopy: (text: string, label?: string) => void;
  empty?: string;
  compact?: boolean;
}) {
  const filenamesOnly = rows.map((r) => r.filename).join('\n');
  const mapping = rows.map((r) => `${r.filename}\t${r.label}`).join('\n');
  return (
    <div className="surface-muted overflow-hidden">
      <div className="flex items-start justify-between gap-2 border-b border-[var(--border-subtle)] px-3 py-2">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold">{title}</div>
          {subtitle ? (
            <div className="text-[10px] text-[var(--text-muted)]">{subtitle}</div>
          ) : null}
          <div className="mt-1 flex items-center gap-2">
            <code className="break-all text-[10px] text-[var(--text-secondary)]">{folder}</code>
            <button
              type="button"
              onClick={() => onCopy(folder, 'Mapp kopierad')}
              className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            >
              Kopiera mapp
            </button>
          </div>
        </div>
        {rows.length ? (
          <div className="flex shrink-0 flex-col items-end gap-1">
            <button
              type="button"
              onClick={() => onCopy(filenamesOnly, `${rows.length} filnamn kopierade`)}
              className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            >
              Kopiera filnamn ({rows.length})
            </button>
            <button
              type="button"
              onClick={() => onCopy(mapping, 'Filnamn → produkt CSV kopierat')}
              className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            >
              Kopiera CSV
            </button>
          </div>
        ) : null}
      </div>
      <div className={compact ? "max-h-60 overflow-y-auto px-3 py-2 text-xs" : "px-3 py-2 text-xs"}>
        {rows.length ? rows.map((r) => (
          <div key={r.filename} className="flex items-center justify-between gap-2 border-b border-[var(--border-subtle)] py-1.5 last:border-b-0">
            <div className="min-w-0 flex-1">
              <code className="block break-all text-[12px] font-semibold text-[var(--text-primary)]">{r.filename}</code>
              <div className="text-[10px] text-[var(--text-muted)]">→ {r.label}</div>
            </div>
            <button
              type="button"
              onClick={() => onCopy(r.filename, `${r.filename} kopierat`)}
              className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            >
              Kopiera
            </button>
          </div>
        )) : <p className="text-[var(--text-muted)]">{empty || '—'}</p>}
      </div>
    </div>
  );
}

// Liten monokrom ikonknapp för listraderna (pilar + duplicera). Inaktiv =
// dämpad, hover = full kontrast. Disabled-läget tar bort hover + pekare.
function RowIconButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={(event) => { event.stopPropagation(); onClick(); }}
      className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-[var(--border-subtle)] text-[var(--text-secondary)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:border-[var(--border-subtle)] disabled:hover:text-[var(--text-secondary)]"
    >
      {children}
    </button>
  );
}

// Kompakt produktrad: kryssruta, namn + statusprick, liten meta, pris, och till
// höger duplicera + upp/ner-pilar. Hela raden (utom kontrollerna) öppnar modalen.
function ProductRow({
  product,
  index,
  total,
  selected,
  busy,
  canReorder,
  onToggleSelect,
  onOpen,
  onMove,
  onDuplicate,
}: {
  product: ProductRecord;
  index: number;
  total: number;
  selected: boolean;
  busy: boolean;
  canReorder: boolean;
  onToggleSelect: () => void;
  onOpen: () => void;
  onMove: (direction: -1 | 1) => void;
  onDuplicate: () => void;
}) {
  const active = product.isActive !== false;
  return (
    <div className="surface-muted flex w-full items-center gap-3 px-3 py-2">
      <input
        type="checkbox"
        checked={selected}
        onChange={onToggleSelect}
        onClick={(event) => event.stopPropagation()}
        aria-label={`Markera ${product.name}`}
        className="h-4 w-4 shrink-0 accent-[var(--accent)]"
      />
      <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <span
          aria-hidden
          className={`h-1.5 w-1.5 shrink-0 rounded-full ${active ? "bg-[var(--accent)]" : "bg-[var(--border-strong)]"}`}
        />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2">
            <span className="truncate text-[14px] font-semibold tracking-[-0.01em]">{product.name}</span>
            {!active ? <span className="shrink-0 text-[11px] text-[var(--text-muted)]">dold</span> : null}
          </span>
          {product.extraGroups.length > 0 ? (
            <span className="mt-0.5 block truncate text-[11px] text-[var(--text-muted)]">
              {product.extraGroups.length} tillvalsgrupper
            </span>
          ) : null}
        </span>
        <span className="shrink-0 text-[14px] font-semibold tabular-nums">{formatCurrency(product.price)}</span>
      </button>
      <div className="flex shrink-0 items-center gap-1">
        <RowIconButton label="Duplicera produkt" onClick={onDuplicate} disabled={busy}>
          <Copy size={14} />
        </RowIconButton>
        {canReorder ? (
          <>
            <RowIconButton label="Flytta upp" onClick={() => onMove(-1)} disabled={busy || index === 0}>
              <ChevronUp size={15} />
            </RowIconButton>
            <RowIconButton label="Flytta ner" onClick={() => onMove(1)} disabled={busy || index === total - 1}>
              <ChevronDown size={15} />
            </RowIconButton>
          </>
        ) : null}
      </div>
    </div>
  );
}

function RewardableProductRow({
  product,
  busy,
  onOpen,
  onPatch,
}: {
  product: ProductRecord;
  busy: boolean;
  onOpen: () => void;
  onPatch: (payload: Record<string, unknown>) => void;
}) {
  const [override, setOverride] = useState<string>("");
  const multiplier = product.rewardPointsMultiplier ?? 1.5;
  const points = calcRewardPoints(product.price, multiplier, product.rewardPointsPrice ?? null);
  const percent = effectiveRewardPercent(multiplier);

  useEffect(() => {
    setOverride(product.rewardPointsPrice ? String(product.rewardPointsPrice) : "");
  }, [product.rewardPointsPrice]);

  const saveOverride = () => {
    const parsed = override.trim() === "" ? null : Math.ceil(Number(override));
    const next = parsed != null && Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    if (next === (product.rewardPointsPrice ?? null)) return;
    onPatch({ rewardPointsPrice: next });
  };

  return (
    <div className={`surface-muted grid gap-3 px-4 py-4 ${product.rewardable ? "" : "opacity-72"}`}>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={onOpen} className="flex min-w-[220px] flex-1 items-center gap-3 text-left">
          <span
            aria-hidden
            className="h-[46px] w-[46px] shrink-0 rounded-[10px] bg-cover bg-center"
            style={product.imageUrl ? { backgroundImage: `url(${product.imageUrl})` } : { backgroundImage: DISH_PLACEHOLDER }}
          />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[14px] font-bold tracking-[-0.01em] text-[var(--text-primary)]">{product.name}</span>
            <span className="mt-0.5 block truncate text-[12px] text-[var(--text-muted)]">{product.category.name} · {formatCurrency(product.price)}</span>
          </span>
        </button>
        <div className="flex items-center gap-2">
          <span className="rounded-[10px] bg-[var(--bg-panel)] px-3 py-2 text-[18px] font-black tabular-nums text-[var(--text-primary)]">{points}p</span>
          <Toggle checked={!!product.rewardable} onChange={(next) => onPatch({ rewardable: next })} disabled={busy} />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {REWARD_MULTIPLIERS.map((m) => (
          <button
            key={m}
            type="button"
            disabled={busy}
            onClick={() => onPatch({ rewardable: true, rewardPointsMultiplier: m, rewardPointsPrice: null })}
            className={`rounded-lg border px-3 py-1.5 text-[12px] font-bold transition-colors ${Number(multiplier) === m && !product.rewardPointsPrice ? toggleOnClass : toggleOffClass}`}
          >
            {m.toFixed(1)}x
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <span className="text-[12px] text-[var(--text-secondary)]">
            {Number(multiplier).toFixed(1)}x ≈ <b className="text-[var(--text-primary)]">{percent.toFixed(2)}%</b>
          </span>
          <Input
            type="number"
            min={1}
            value={override}
            onChange={(event) => setOverride(event.target.value)}
            onBlur={saveOverride}
            onKeyDown={(event) => { if (event.key === "Enter") (event.currentTarget as HTMLInputElement).blur(); }}
            placeholder="Override p"
            className="w-[118px]"
          />
        </div>
      </div>
    </div>
  );
}

// Kompakt tillvalsrad — samma monokroma format som ProductRow. Namn + en liten
// meta-rad ({n} val · typ · obligatorisk · kopplade produkter), och till höger en
// duplicera-knapp. Hela raden (utom knappen) öppnar gruppmodalen.
function ExtraGroupRow({ group, busy, onOpen, onDuplicate }: { group: ExtraGroupRecord; busy: boolean; onOpen: () => void; onDuplicate: () => void }) {
  const typeLabel = group.type === "RADIO" ? "radio" : "checkbox";
  const usage = group._count?.productGroups ?? 0;
  const meta = [
    `${group.extras.length} val`,
    typeLabel,
    group.required ? "obligatorisk" : null,
    `${usage} kopplade`,
  ].filter(Boolean).join(" · ");
  return (
    <div className="surface-muted flex w-full items-center gap-3 px-3 py-2">
      <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 flex-col text-left">
        <span className="truncate text-[14px] font-semibold tracking-[-0.01em]">{group.name}</span>
        <span className="mt-0.5 truncate text-[11px] text-[var(--text-muted)]">{meta}</span>
      </button>
      <div className="flex shrink-0 items-center gap-1">
        <RowIconButton label="Duplicera tillvalsgrupp" onClick={onDuplicate} disabled={busy}>
          <Copy size={14} />
        </RowIconButton>
      </div>
    </div>
  );
}

// Rätt-rad enligt design-handoff: bild-thumb (46px, varm gradient-placeholder om
// ingen bild), namn + beskrivning, pris, tillgänglighets-toggle (orange) och en
// chevron. Slut i lager / dold = dämpad. Hela raden (utom toggeln) öppnar modalen.
const DISH_PLACEHOLDER = "linear-gradient(150deg,#F0D4A8,#DCB070)";
function DishRow({
  product,
  busy,
  onOpen,
  onToggleAvailability,
}: {
  product: ProductRecord;
  busy: boolean;
  onOpen: () => void;
  onToggleAvailability: (next: boolean) => void;
}) {
  const available = product.isActive !== false;
  return (
    <div
      className={`flex items-center gap-3.5 px-4 py-3.5 transition-opacity ${available ? "" : "opacity-60"}`}
    >
      <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3.5 text-left">
        <span
          aria-hidden
          className="h-[46px] w-[46px] shrink-0 rounded-[10px] bg-cover bg-center"
          style={product.imageUrl ? { backgroundImage: `url(${product.imageUrl})` } : { backgroundImage: DISH_PLACEHOLDER }}
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-bold tracking-[-0.01em] text-[var(--text-primary)]">{product.name}</span>
          {product.description ? (
            <span className="mt-0.5 block truncate text-[12px] text-[var(--text-muted)]">{product.description}</span>
          ) : null}
        </span>
        <span className="shrink-0 text-[14px] font-extrabold tabular-nums text-[var(--text-primary)]">{formatCurrency(product.price)}</span>
      </button>
      <Toggle checked={available} onChange={onToggleAvailability} disabled={busy} />
      <ChevronRight size={18} className="shrink-0 text-[var(--text-muted)]" aria-hidden />
    </div>
  );
}

export function MenuPage() {
  const searchParams = useSearchParams();
  const [activeRestaurantId, setActiveRestaurantId] = useState<string | null>(null);
  const [pendingRouteProductId, setPendingRouteProductId] = useState<string | null>(null);
  const [tab, setTab] = useState<MenuTab>("categories");
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<CategoryRecord | null>(null);
  const [activeProduct, setActiveProduct] = useState<ProductRecord | null>(null);
  const [activeGroup, setActiveGroup] = useState<ExtraGroupRecord | null>(null);
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [productModalOpen, setProductModalOpen] = useState(false);
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);

  // ── Bulk-redigering (Produkter-fliken) ───────────────────────────────
  // Multi-select + åtgärdsrad: höj/sänk pris i %, byt kategori, visa/dölj.
  const bulkQueryClient = useQueryClient();
  const { showToast: showBulkToast } = useToast();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkPct, setBulkPct] = useState("");
  const [bulkCategoryId, setBulkCategoryId] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [reorderBusy, setReorderBusy] = useState(false);

  // Vald kategori i vänster-kolumnens undermeny (Produkter-fliken, två-kolumnsvyn).
  // Rent presentations-val: styr vilken kategoris rätter som visas till höger.
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [availabilityBusyId, setAvailabilityBusyId] = useState<string | null>(null);

  const toggleSelected = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const restaurants = useQuery({ queryKey: menuRestaurantsQueryKey, queryFn: getMenuRestaurants });
  const automaticDeals = useQuery({ queryKey: dealsQueryKey, queryFn: getAutomaticDeals });

  // One-shot auto-pick av första restaurang vid första load. Utan denna ref
  // skulle effekten nedan reagera så fort `activeRestaurantId` blir null
  // (t.ex. när admin byter stad i CityRestaurantPicker) och tvinga tillbaka
  // den första restaurangen → city-bytet blir omöjligt.
  const didAutoSelectRef = useRef(false);

  useEffect(() => {
    // Läs URL-param OCH applicera den i ett enda effekt-pass. Tidigare fanns
    // två separata effekter (sätt pendingRouteRestaurantId → sätt activeRestaurantId).
    // De körde i samma render-batch men auto-pick-grenen läste pendingRouteRestaurantId
    // från gammal closure (= null) → activeRestaurantId blev "första restaurang i listan"
    // i stället för restaurangen i URL:en. Det här var bakomliggande orsaken till att
    // "Öppna menyeditor" från en restaurangsida ibland visade fel restaurang på första
    // renderingen (rapporterat av A6 Fredrik).
    const restaurantId = searchParams.get("restaurantId");
    const productId = searchParams.get("productId");

    if (productId) setPendingRouteProductId(productId);

    // URL-param har ALLTID företräde — sätt activeRestaurantId direkt utan att gå
    // via pendingRoute-state, så ingen efterföljande auto-pick-pass kan ta över.
    if (restaurantId) {
      setActiveRestaurantId(restaurantId);
      didAutoSelectRef.current = true;
      return;
    }

    // Fallback: auto-pick första restaurang om ingen URL-param finns och vi inte
    // redan har gjort ett val.
    if (!didAutoSelectRef.current && !activeRestaurantId && restaurants.data?.length) {
      setActiveRestaurantId(restaurants.data[0].id);
      didAutoSelectRef.current = true;
    }
  }, [searchParams, activeRestaurantId, restaurants.data]);

  const categories = useQuery({ queryKey: menuCategoriesQueryKey(activeRestaurantId), queryFn: () => getCategories(activeRestaurantId!), enabled: Boolean(activeRestaurantId) });
  const products = useQuery({ queryKey: menuProductsQueryKey(activeRestaurantId), queryFn: () => getProducts(activeRestaurantId!), enabled: Boolean(activeRestaurantId) });
  const groups = useQuery({ queryKey: menuGroupsQueryKey(activeRestaurantId), queryFn: () => getExtraGroups(activeRestaurantId!), enabled: Boolean(activeRestaurantId) });

  // Kategorier i sin position-ordning (för omsorteringspilarna + produktsektionerna
  // + själva listan). Sorteras lokalt på position så optimistiska omsorteringar
  // syns direkt även innan refetch.
  const sortedCategories = useMemo(
    () => [...(categories.data || [])].sort((a, b) => a.position - b.position),
    [categories.data],
  );

  const filteredCategories = useMemo(() => {
    const lowerQuery = query.trim().toLowerCase();
    return sortedCategories.filter((category) => !lowerQuery || `${category.name} ${category.description || ""}`.toLowerCase().includes(lowerQuery));
  }, [sortedCategories, query]);

  const filteredProducts = useMemo(() => {
    const lowerQuery = query.trim().toLowerCase();
    return (products.data || []).filter((product) => !lowerQuery || `${product.name} ${product.description || ""} ${product.category.name}`.toLowerCase().includes(lowerQuery));
  }, [products.data, query]);

  const rewardableProducts = useMemo(
    () =>
      [...filteredProducts].sort((a, b) =>
        Number(b.rewardable) - Number(a.rewardable) ||
        (a.category.name || "").localeCompare(b.category.name || "", "sv") ||
        a.position - b.position,
      ),
    [filteredProducts],
  );

  const filteredGroups = useMemo(() => {
    const lowerQuery = query.trim().toLowerCase();
    return (groups.data || []).filter((group) => !lowerQuery || group.name.toLowerCase().includes(lowerQuery));
  }, [groups.data, query]);

  // Produkter grupperade per kategori, var och en internt sorterad på position.
  // Driver den kompakta sektionsvyn när man inte söker. Produkter vars kategori
  // saknas i listan (t.ex. global kategori) hamnar i en "Övrigt"-sektion sist.
  const productSections = useMemo(() => {
    const byCategory = new Map<string, ProductRecord[]>();
    for (const product of products.data || []) {
      const list = byCategory.get(product.categoryId) || [];
      list.push(product);
      byCategory.set(product.categoryId, list);
    }
    const sections = sortedCategories
      .map((category) => ({
        id: category.id,
        name: category.name,
        products: (byCategory.get(category.id) || []).sort((a, b) => a.position - b.position),
      }))
      .filter((section) => section.products.length > 0);
    const known = new Set(sortedCategories.map((category) => category.id));
    const orphans = (products.data || []).filter((product) => !known.has(product.categoryId)).sort((a, b) => a.position - b.position);
    if (orphans.length > 0) {
      sections.push({ id: "__other__", name: orphans[0]?.category.name || "Övrigt", products: orphans });
    }
    return sections;
  }, [products.data, sortedCategories]);

  const isSearching = query.trim().length > 0;

  // Rensa bulk-urvalet när man byter restaurang eller flik — annars kan ett
  // gammalt urval råka träffa fel produkter.
  useEffect(() => {
    setSelectedIds(new Set());
    setBulkPct("");
    setBulkCategoryId("");
  }, [activeRestaurantId, tab]);

  const allFilteredSelected = filteredProducts.length > 0 && filteredProducts.every((p) => selectedIds.has(p.id));

  // Håll den valda undermeny-kategorin giltig: default till första kategorin och
  // återställ om den valda kategorin försvinner (t.ex. byte av restaurang).
  useEffect(() => {
    if (sortedCategories.length === 0) {
      if (selectedCategoryId !== null) setSelectedCategoryId(null);
      return;
    }
    if (!selectedCategoryId || !sortedCategories.some((c) => c.id === selectedCategoryId)) {
      setSelectedCategoryId(sortedCategories[0].id);
    }
  }, [sortedCategories, selectedCategoryId]);

  // Rätter i den valda undermeny-kategorin, sorterade på position. Driver höger
  // kolumn i Produkter-fliken. (Sökning hanteras separat som platt filtrerad lista.)
  const selectedCategory = sortedCategories.find((c) => c.id === selectedCategoryId) || null;
  const selectedCategoryProducts = useMemo(
    () =>
      (products.data || [])
        .filter((p) => p.categoryId === selectedCategoryId)
        .sort((a, b) => a.position - b.position),
    [products.data, selectedCategoryId],
  );

  // Antal produkter per kategori, för räknarna i vänster undermeny.
  const productCountByCategory = useMemo(() => {
    const counts = new Map<string, number>();
    for (const product of products.data || []) {
      counts.set(product.categoryId, (counts.get(product.categoryId) || 0) + 1);
    }
    return counts;
  }, [products.data]);

  // Kör en bulk-uppdatering över markerade produkter. payloadFor returnerar
  // PATCH-kroppen per produkt (null = hoppa över). Parallella anrop mot
  // befintliga per-produkt-endpointen — atomicitet behövs inte här, och vid
  // delfel visas hur många som lyckades.
  const runBulk = async (payloadFor: (p: ProductRecord) => Record<string, unknown> | null, doneLabel: string) => {
    const targets = (products.data || []).filter((p) => selectedIds.has(p.id));
    if (targets.length === 0 || bulkBusy) return;
    setBulkBusy(true);
    let ok = 0;
    let failed = 0;
    await Promise.all(
      targets.map(async (p) => {
        const body = payloadFor(p);
        if (!body) return;
        try {
          await updateProduct(p.id, body);
          ok += 1;
        } catch {
          failed += 1;
        }
      }),
    );
    setBulkBusy(false);
    await bulkQueryClient.invalidateQueries({ queryKey: menuProductsQueryKey(activeRestaurantId) });
    if (failed > 0) {
      showBulkToast({ type: "error", message: `${ok} ${doneLabel}, ${failed} misslyckades` });
    } else {
      showBulkToast({ type: "success", message: `${ok} ${doneLabel}` });
      setSelectedIds(new Set());
      setBulkPct("");
      setBulkCategoryId("");
    }
  };

  // Flytta en produkt upp/ner inom SIN kategori.
  //
  // Roten till att pilarna tidigare "snappade tillbaka": nyskapade produkter får
  // alla position 0 (backend-default), så den lokala position-sorteringen blir en
  // no-op och den synliga ordningen styrs av API:ts categoryId-asc-fallback. Utan
  // optimistisk uppdatering syntes inget förrän servern svarat, och då kunde de
  // lika positionerna ge tillbaka samma ordning. Fixen: skriv om cachen direkt med
  // nya, distinkta position-värden (index inom kategorin) så raden flyttas synligt
  // på en gång, och skicka exakt den kategorins id-lista i ny ordning till backend.
  // Omsorteringen stannar alltid inom kategorin — vi rör bara den kategorins ids.
  const moveProduct = async (categoryProducts: ProductRecord[], index: number, direction: -1 | 1) => {
    if (reorderBusy) return;
    const target = index + direction;
    if (target < 0 || target >= categoryProducts.length) return;
    const ordered = [...categoryProducts];
    const [moved] = ordered.splice(index, 1);
    ordered.splice(target, 0, moved);
    const orderedIds = ordered.map((p) => p.id);
    const newPositionById = new Map(orderedIds.map((id, position) => [id, position]));
    const key = menuProductsQueryKey(activeRestaurantId);

    // Optimistisk cache-skrivning: ge de berörda produkterna distinkta positioner
    // efter den nya ordningen. productSections sorterar sen deterministiskt på
    // position, så raden flyttas direkt.
    const previous = bulkQueryClient.getQueryData<ProductRecord[]>(key);
    bulkQueryClient.setQueryData<ProductRecord[]>(key, (current) =>
      (current || []).map((p) => (newPositionById.has(p.id) ? { ...p, position: newPositionById.get(p.id)! } : p)),
    );

    setReorderBusy(true);
    try {
      await reorderProducts(orderedIds);
      await bulkQueryClient.invalidateQueries({ queryKey: key });
    } catch {
      if (previous) bulkQueryClient.setQueryData(key, previous);
      showBulkToast({ type: "error", message: "Kunde inte spara ordningen" });
    } finally {
      setReorderBusy(false);
    }
  };

  // Flytta en kategori upp/ner i den globala ordningen. Samma optimistiska
  // omskrivning som för produkter så pilen flyttar raden direkt.
  const moveCategory = async (orderedCategories: CategoryRecord[], index: number, direction: -1 | 1) => {
    if (reorderBusy) return;
    const target = index + direction;
    if (target < 0 || target >= orderedCategories.length) return;
    const ordered = [...orderedCategories];
    const [moved] = ordered.splice(index, 1);
    ordered.splice(target, 0, moved);
    const orderedIds = ordered.map((c) => c.id);
    const newPositionById = new Map(orderedIds.map((id, position) => [id, position]));
    const key = menuCategoriesQueryKey(activeRestaurantId);

    const previous = bulkQueryClient.getQueryData<CategoryRecord[]>(key);
    bulkQueryClient.setQueryData<CategoryRecord[]>(key, (current) =>
      (current || []).map((c) => (newPositionById.has(c.id) ? { ...c, position: newPositionById.get(c.id)! } : c)),
    );

    setReorderBusy(true);
    try {
      await reorderCategories(orderedIds);
      await bulkQueryClient.invalidateQueries({ queryKey: key });
    } catch {
      if (previous) bulkQueryClient.setQueryData(key, previous);
      showBulkToast({ type: "error", message: "Kunde inte spara ordningen" });
    } finally {
      setReorderBusy(false);
    }
  };

  // Duplicera en produkt → backend skapar "(kopia)", busta produkt-cachen.
  const handleDuplicateProduct = async (id: string) => {
    if (reorderBusy) return;
    setReorderBusy(true);
    try {
      await duplicateProduct(id);
      await bulkQueryClient.invalidateQueries({ queryKey: menuProductsQueryKey(activeRestaurantId) });
      showBulkToast({ type: "success", message: "Produkt duplicerad" });
    } catch {
      showBulkToast({ type: "error", message: "Kunde inte duplicera produkten" });
    } finally {
      setReorderBusy(false);
    }
  };

  // Duplicera en tillvalsgrupp → busta grupp-cachen.
  const handleDuplicateGroup = async (id: string) => {
    if (reorderBusy) return;
    setReorderBusy(true);
    try {
      await duplicateExtraGroup(id);
      await bulkQueryClient.invalidateQueries({ queryKey: menuGroupsQueryKey(activeRestaurantId) });
      showBulkToast({ type: "success", message: "Tillvalsgrupp duplicerad" });
    } catch {
      showBulkToast({ type: "error", message: "Kunde inte duplicera gruppen" });
    } finally {
      setReorderBusy(false);
    }
  };

  // Tillgänglighets-toggle per rätt — samma mekanism som bulk visa/dölj
  // (updateProduct isActive + invalidate produkt-cachen). Slut i lager = dold.
  const handleToggleAvailability = async (product: ProductRecord, next: boolean) => {
    if (availabilityBusyId) return;
    setAvailabilityBusyId(product.id);
    try {
      await updateProduct(product.id, { isActive: next });
      await bulkQueryClient.invalidateQueries({ queryKey: menuProductsQueryKey(activeRestaurantId) });
    } catch {
      showBulkToast({ type: "error", message: "Kunde inte ändra tillgänglighet" });
    } finally {
      setAvailabilityBusyId(null);
    }
  };

  const handleRewardPatch = async (product: ProductRecord, payload: Record<string, unknown>) => {
    if (availabilityBusyId) return;
    setAvailabilityBusyId(product.id);
    try {
      await updateProduct(product.id, payload);
      await bulkQueryClient.invalidateQueries({ queryKey: menuProductsQueryKey(activeRestaurantId) });
    } catch {
      showBulkToast({ type: "error", message: "Kunde inte uppdatera reward-priset" });
    } finally {
      setAvailabilityBusyId(null);
    }
  };

  useEffect(() => {
    if (!pendingRouteProductId || !products.data?.length) return;
    const product = products.data.find((entry) => entry.id === pendingRouteProductId);
    if (!product) return;
    setTab("products");
    setActiveProduct(product);
    setProductModalOpen(true);
    setPendingRouteProductId(null);
  }, [pendingRouteProductId, products.data]);


  if (restaurants.isLoading) {
    return <Surface className="px-6 py-12 text-sm text-[var(--text-secondary)]">Laddar menymodulen...</Surface>;
  }

  if (restaurants.isError || !restaurants.data) {
    return <ErrorPanel title="Menymodulen kunde inte laddas" description="Restauranglistan för menyhantering är inte tillgänglig." action={<Button onClick={() => void restaurants.refetch()}>Försök igen</Button>} />;
  }

  const activeRestaurantName = restaurants.data?.find((r) => r.id === activeRestaurantId)?.name || null;

  return (
    <div className="page-stack">
      <PageHeader
        title="Meny"
        breadcrumb={activeRestaurantName ? `Restauranger / ${activeRestaurantName}` : "Restauranger"}
        actions={
          <>
            {activeRestaurantId ? (
              <>
                <BulkImportButton restaurantId={activeRestaurantId} />
                <MenuSyncButton sourceRestaurantId={activeRestaurantId} restaurants={restaurants.data || []} />
                <R2PathsButton restaurantId={activeRestaurantId} />
                <R2AutoMatchButton restaurantId={activeRestaurantId} />
              </>
            ) : null}
            {activeRestaurantId && tab !== "rewardable" ? (
              <Button variant="secondary" onClick={() => setImportModalOpen(true)}>
                <Copy size={14} /> Importera från annan
              </Button>
            ) : null}
            {tab === "categories" && activeRestaurantId ? (
              <Button variant="primary" onClick={() => { setActiveCategory(null); setCategoryModalOpen(true); }}>
                <Plus size={14} /> Kategori
              </Button>
            ) : null}
            {tab === "products" && activeRestaurantId ? (
              <Button variant="primary" onClick={() => { setActiveProduct(null); setProductModalOpen(true); }}>
                <Plus size={14} /> Produkt
              </Button>
            ) : null}
            {tab === "extras" && activeRestaurantId ? (
              <Button variant="primary" onClick={() => { setActiveGroup(null); setGroupModalOpen(true); }}>
                <Tags size={14} /> Tillvalsgrupp
              </Button>
            ) : null}
          </>
        }
      />

      <Surface className="px-5 py-4">
        <CityRestaurantPicker
          value={activeRestaurantId || ""}
          onChange={(rid) => setActiveRestaurantId(rid || null)}
        />
        <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative flex-1">
            <Search size={14} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
            <Input className="pl-10" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Sök i menyn..." />
          </div>
          <Tabs value={tab} onChange={setTab} options={[{ value: "categories", label: "Kategorier" }, { value: "products", label: "Produkter" }, { value: "rewardable", label: "Rewardable" }, { value: "extras", label: "Tillval" }]} />
        </div>

        {tab === "categories" ? (
          <div className="mt-5 grid gap-2">
            {filteredCategories.length === 0 ? <EmptyState title="Inga kategorier hittades" /> : filteredCategories.map((category) => {
              // Pilarna sorterar i den fulla position-ordningen, inte i den
              // sök-filtrerade listan, så positionerna förblir konsekventa.
              const orderIndex = sortedCategories.findIndex((entry) => entry.id === category.id);
              return (
                <div key={category.id} className="surface-muted flex w-full items-center gap-3 px-4 py-3">
                  <button type="button" onClick={() => { setActiveCategory(category); setCategoryModalOpen(true); }} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                    <span className="min-w-0 flex-1 truncate text-[15px] font-semibold tracking-[-0.01em]">{category.name}</span>
                    <StatusBadge active={category.isActive !== false} />
                    <Badge tone="neutral">{category._count?.products || 0} produkter</Badge>
                  </button>
                  <div className="flex shrink-0 items-center gap-1">
                    <RowIconButton label="Flytta upp" onClick={() => void moveCategory(sortedCategories, orderIndex, -1)} disabled={reorderBusy || isSearching || orderIndex <= 0}>
                      <ChevronUp size={15} />
                    </RowIconButton>
                    <RowIconButton label="Flytta ner" onClick={() => void moveCategory(sortedCategories, orderIndex, 1)} disabled={reorderBusy || isSearching || orderIndex === sortedCategories.length - 1}>
                      <ChevronDown size={15} />
                    </RowIconButton>
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}

        {tab === "products" ? (
          <div className="mt-5 grid gap-2">
            {/* Markera alla + bulk-åtgärdsrad */}
            {filteredProducts.length > 0 && (
              <div className="flex flex-wrap items-center gap-3 px-1 pb-1">
                <label className="flex cursor-pointer select-none items-center gap-2 text-[13px] text-[var(--text-secondary)]">
                  <input
                    type="checkbox"
                    checked={allFilteredSelected}
                    onChange={() =>
                      setSelectedIds(allFilteredSelected ? new Set() : new Set(filteredProducts.map((p) => p.id)))
                    }
                    className="h-4 w-4 accent-[var(--accent)]"
                  />
                  {selectedIds.size > 0 ? `${selectedIds.size} markerade` : "Markera alla"}
                </label>
              </div>
            )}
            {selectedIds.size > 0 && (
              <div className="surface-muted sticky top-2 z-10 flex flex-wrap items-center gap-2 px-4 py-3">
                <div className="flex items-center gap-1.5">
                  <Input
                    type="number"
                    value={bulkPct}
                    onChange={(e) => setBulkPct(e.target.value)}
                    placeholder="±%"
                    className="w-20"
                  />
                  <Button
                    variant="secondary"
                    disabled={bulkBusy || !bulkPct || Number.isNaN(Number(bulkPct)) || Number(bulkPct) === 0}
                    onClick={() => {
                      const pct = Number(bulkPct);
                      void runBulk(
                        (p) => ({ price: Math.max(0, Math.round(p.price * (1 + pct / 100))) }),
                        `produkter prisjusterade ${pct > 0 ? "+" : ""}${pct} %`,
                      );
                    }}
                  >
                    Justera pris
                  </Button>
                </div>
                <div className="flex items-center gap-1.5">
                  <Select value={bulkCategoryId} onChange={(e) => setBulkCategoryId(e.target.value)} className="min-w-[160px]">
                    <option value="">Flytta till kategori…</option>
                    {(categories.data || []).map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </Select>
                  <Button
                    variant="secondary"
                    disabled={bulkBusy || !bulkCategoryId}
                    onClick={() => void runBulk(() => ({ categoryId: bulkCategoryId }), "produkter flyttade")}
                  >
                    Flytta
                  </Button>
                </div>
                <div className="ml-auto flex items-center gap-1.5">
                  {bulkBusy && <Loader2 size={14} className="animate-spin text-[var(--text-muted)]" />}
                  <Button variant="secondary" disabled={bulkBusy} onClick={() => void runBulk(() => ({ isActive: true }), "produkter visade")}>
                    Visa
                  </Button>
                  <Button variant="secondary" disabled={bulkBusy} onClick={() => void runBulk(() => ({ isActive: false }), "produkter dolda")}>
                    Dölj
                  </Button>
                  <Button variant="secondary" disabled={bulkBusy} onClick={() => setBulkEditOpen(true)}>
                    Ändra
                  </Button>
                  <button
                    type="button"
                    disabled={bulkBusy}
                    onClick={() => setSelectedIds(new Set())}
                    className="text-[12px] font-semibold text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] disabled:opacity-50"
                  >
                    Rensa
                  </button>
                </div>
              </div>
            )}
            {/* Sökning = platt filtrerad lista (markering + duplicering + pilar
                tillgängliga via kompakta raderna). Annars två-kolumns-vyn:
                kategori-undermeny till vänster, rätter för vald kategori till höger. */}
            {isSearching ? (
              filteredProducts.length === 0 ? (
                <EmptyState title="Inga produkter hittades" />
              ) : (
                filteredProducts.map((product) => (
                  <ProductRow
                    key={product.id}
                    product={product}
                    index={0}
                    total={1}
                    busy={reorderBusy}
                    canReorder={false}
                    selected={selectedIds.has(product.id)}
                    onToggleSelect={() => toggleSelected(product.id)}
                    onOpen={() => { setActiveProduct(product); setProductModalOpen(true); }}
                    onMove={() => {}}
                    onDuplicate={() => void handleDuplicateProduct(product.id)}
                  />
                ))
              )
            ) : sortedCategories.length === 0 ? (
              <EmptyState title="Inga kategorier ännu" description="Skapa en kategori först för att lägga till rätter." />
            ) : (
              <div className="flex min-h-0 flex-col overflow-hidden rounded-[14px] border border-[var(--border-subtle)] lg:flex-row">
                {/* Vänster: kategori-undermeny */}
                <aside className="shrink-0 border-b border-[var(--border-subtle)] bg-[var(--bg-panel)] p-3 lg:w-[230px] lg:border-b-0 lg:border-r">
                  <p className="px-2 pb-2.5 text-[10.5px] font-extrabold uppercase tracking-[0.1em] text-[var(--text-muted)]">Kategorier</p>
                  <div className="grid gap-0.5">
                    {sortedCategories.map((category) => {
                      const isActive = category.id === selectedCategoryId;
                      const count = productCountByCategory.get(category.id) ?? 0;
                      return (
                        <button
                          key={category.id}
                          type="button"
                          onClick={() => setSelectedCategoryId(category.id)}
                          className={`flex items-center justify-between gap-2 rounded-[9px] px-2.5 py-2.5 text-left text-[13.5px] transition-colors ${
                            isActive
                              ? "bg-[var(--accent-soft)] font-bold text-[var(--accent-ink)]"
                              : "font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-panel-muted)]"
                          }`}
                        >
                          <span className="min-w-0 truncate">{category.name}</span>
                          <span className={`shrink-0 text-[11px] ${isActive ? "opacity-70" : "text-[var(--text-muted)]"}`}>{count}</span>
                        </button>
                      );
                    })}
                  </div>
                  <button
                    type="button"
                    onClick={() => { setActiveCategory(null); setCategoryModalOpen(true); }}
                    className="mt-1 flex items-center gap-1.5 px-2.5 pt-2 text-[13px] font-bold text-[var(--accent-ink)]"
                  >
                    <Plus size={14} /> Ny kategori
                  </button>
                </aside>

                {/* Höger: rätter i vald kategori */}
                <div className="min-w-0 flex-1 p-5">
                  <h2 className="mb-3.5 text-[15px] font-extrabold tracking-[-0.3px] text-[var(--text-primary)]">
                    {selectedCategory?.name || "Rätter"}
                  </h2>
                  {selectedCategoryProducts.length === 0 ? (
                    <EmptyState title="Inga rätter i kategorin" description="Lägg till en rätt för att fylla kategorin." />
                  ) : (
                    <>
                      <div className="surface overflow-hidden">
                        {selectedCategoryProducts.map((product, index) => (
                          <div
                            key={product.id}
                            className={index > 0 ? "border-t border-[var(--row-divider)]" : ""}
                          >
                            <DishRow
                              product={product}
                              busy={availabilityBusyId === product.id}
                              onOpen={() => { setActiveProduct(product); setProductModalOpen(true); }}
                              onToggleAvailability={(next) => void handleToggleAvailability(product, next)}
                            />
                          </div>
                        ))}
                      </div>
                      <p className="mt-3 text-[12px] font-semibold text-[var(--text-muted)]">
                        Slut i lager döljs automatiskt för kunder. Dra för att ändra ordning.
                      </p>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        ) : null}

        {tab === "rewardable" ? (
          <div className="mt-5 grid gap-3">
            <div className="surface-muted px-4 py-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[15px] font-extrabold tracking-[-0.3px] text-[var(--text-primary)]">Rewardable produkter</p>
                  <p className="mt-1 text-[12px] text-[var(--text-secondary)]">
                    Kunder tjänar 10% i points. 1.5x ger ungefär 6.67% faktiskt reward-värde.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {REWARD_MULTIPLIERS.map((m) => (
                    <Badge key={m} tone="neutral">{m.toFixed(1)}x = {effectiveRewardPercent(m).toFixed(2)}%</Badge>
                  ))}
                </div>
              </div>
            </div>
            {rewardableProducts.length === 0 ? (
              <EmptyState title="Inga produkter hittades" description="Sökningen matchar inga produkter." />
            ) : (
              rewardableProducts.map((product) => (
                <RewardableProductRow
                  key={product.id}
                  product={product}
                  busy={availabilityBusyId === product.id}
                  onOpen={() => { setActiveProduct(product); setProductModalOpen(true); }}
                  onPatch={(payload) => void handleRewardPatch(product, payload)}
                />
              ))
            )}
          </div>
        ) : null}

        {tab === "extras" ? (
          <div className="mt-5 grid gap-2">
            {filteredGroups.length === 0 ? <EmptyState title="Inga tillvalsgrupper hittades" /> : filteredGroups.map((group) => (
              <ExtraGroupRow
                key={group.id}
                group={group}
                busy={reorderBusy}
                onOpen={() => { setActiveGroup(group); setGroupModalOpen(true); }}
                onDuplicate={() => void handleDuplicateGroup(group.id)}
              />
            ))}
          </div>
        ) : null}
      </Surface>

      {activeRestaurantId ? (
        <>
          <CategoryModal open={categoryModalOpen} restaurantId={activeRestaurantId} category={activeCategory} onClose={() => setCategoryModalOpen(false)} />
          <ProductModal open={productModalOpen} restaurantId={activeRestaurantId} product={activeProduct} categories={categories.data || []} extraGroups={groups.data || []} onClose={() => setProductModalOpen(false)} existingDeals={(automaticDeals.data || []).filter((deal) => deal.restaurantId === activeRestaurantId || deal.applicableRestaurantIds?.includes(activeRestaurantId) || deal.isGlobal)} restaurants={(restaurants.data || []).map((restaurant) => ({ id: restaurant.id, name: restaurant.name, slug: restaurant.slug, city: restaurant.city || null })) as DealRestaurantRef[]} products={products.data || []} />
          <ExtraGroupModal open={groupModalOpen} restaurantId={activeRestaurantId} group={activeGroup} categories={categories.data || []} onClose={() => setGroupModalOpen(false)} />
          <ImportFromOtherModal
            open={importModalOpen}
            onClose={() => setImportModalOpen(false)}
            currentRestaurantId={activeRestaurantId}
            tab={tab}
            currentCategories={categories.data || []}
          />
          <BulkEditModal
            open={bulkEditOpen}
            count={selectedIds.size}
            extraGroups={groups.data || []}
            onClose={() => setBulkEditOpen(false)}
            onApply={(payload) => {
              setBulkEditOpen(false);
              void runBulk(() => payload, "produkter uppdaterade");
            }}
          />
        </>
      ) : null}
    </div>
  );
}
