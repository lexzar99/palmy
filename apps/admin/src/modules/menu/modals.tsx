"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, GripVertical, Loader2, Plus, Search, Tags } from "lucide-react";
import { useRouter } from "next/navigation";
import { getAutomaticDeals, restaurantDealsQueryKey, type AutomaticDealRecord } from "@/modules/deals/api";
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
  getCategories,
  getProducts,
  menuCategoriesQueryKey,
  menuGroupsQueryKey,
  menuProductsQueryKey,
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
import { getExtraGroups, getMenuRestaurants, menuRestaurantsQueryKey } from "@/modules/menu/api";
import {
  Badge,
  Button,
  CheckboxField,
  ConfirmDialog,
  EmptyState,
  ErrorPanel,
  Field,
  Input,
  IntegerInput,
  Modal,
  MoneyInput,
  PercentInput,
  Select,
  Surface,
  SwitchField,
  Textarea,
  Toggle,
} from "@/shared/components/ui";
import { CityRestaurantPicker } from "@/shared/components/city-restaurant-picker";
import { ImageUploadField } from "@/shared/components/image-upload";
import { useToast } from "@/shared/components/toast";
import { parseIntegerDraft, parseNumberDraft, toggleOffClass, toggleOnClass, type MenuTab } from "@/modules/menu/utils";
import { BulkRow, DISH_PLACEHOLDER, RowIconButton, StatusBadge, TogglePill } from "@/modules/menu/components";

export function CategoryModal({ open, restaurantId, category, onClose }: { open: boolean; restaurantId: string; category: CategoryRecord | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ name: "", description: "", position: "0", isActive: true });
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!open) {
      setDeleteConfirmOpen(false);
      return;
    }
    setForm(category ? { name: category.name, description: category.description || "", position: String(category.position), isActive: category.isActive ?? true } : { name: "", description: "", position: "0", isActive: true });
    setDeleteConfirmOpen(false);
  }, [category, open]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const saveMutation = useMutation({ meta: { toast: false },
    mutationFn: async () => {
      const position = parseIntegerDraft(form.position);
      if (position === null || position < 0) throw new Error("Position måste vara 0 eller högre");
      const payload = { ...form, position };
      if (category) {
        return updateCategory(category.id, payload);
      }
      return createCategory({ ...payload, restaurantId });
    },
    onSuccess: async () => {
      setDeleteConfirmOpen(false);
      await queryClient.invalidateQueries({ queryKey: menuCategoriesQueryKey(restaurantId) });
      onClose();
    },
  });

  const deleteMutation = useMutation({ meta: { successMessage: "Kategori raderad" },
    mutationFn: async () => {
      if (category) {
        await deleteCategory(category.id);
      }
    },
    onSuccess: async () => {
      setDeleteConfirmOpen(false);
      await queryClient.invalidateQueries({ queryKey: menuCategoriesQueryKey(restaurantId) });
      onClose();
    },
  });

  const canSave = form.name.trim().length > 0 && (parseIntegerDraft(form.position) ?? -1) >= 0;

  return (
    <>
    <Modal
      open={open && !deleteConfirmOpen}
      onClose={onClose}
      title={category ? "Redigera kategori" : "Ny kategori"}
      size="sm"
      footer={
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>{category ? (
            <Button
              variant="danger"
              onClick={() => setDeleteConfirmOpen(true)}
              disabled={saveMutation.isPending}
            >Radera</Button>
          ) : null}</div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button onClick={onClose} disabled={saveMutation.isPending}>Stäng</Button>
            <Button type="submit" form="menu-category-form" variant="primary" loading={saveMutation.isPending} disabled={!canSave}>Spara</Button>
          </div>
        </div>
      }
    >
      <form id="menu-category-form" className="grid gap-4" onSubmit={(event) => { event.preventDefault(); if (canSave) saveMutation.mutate(); }}>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Namn"><Input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} /></Field>
          <Field label="Position"><IntegerInput min={0} step={1} value={form.position} onValueChange={(position) => setForm((current) => ({ ...current, position }))} /></Field>
        </div>
        <SwitchField label="Aktiv kategori" hint="Inaktiva kategorier visas inte för kunder." checked={form.isActive} onChange={(isActive) => setForm((current) => ({ ...current, isActive }))} />
        <Field label="Beskrivning"><Textarea value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} /></Field>
      </form>
    </Modal>
    <ConfirmDialog
      open={deleteConfirmOpen}
      title={`Radera ${category?.name ?? "kategori"}?`}
      description="Alla produkter i kategorin försvinner också. Detta kan inte ångras."
      confirmLabel="Radera kategori"
      danger
      loading={deleteMutation.isPending}
      onClose={() => { if (!deleteMutation.isPending) setDeleteConfirmOpen(false); }}
      onConfirm={() => deleteMutation.mutate()}
    />
    </>
  );
}

export function ProductModal({ open, restaurantId, product, categories, extraGroups, existingDeals, onClose }: { open: boolean; restaurantId: string; product: ProductRecord | null; categories: CategoryRecord[]; extraGroups: ExtraGroupRecord[]; existingDeals: AutomaticDealRecord[]; onClose: () => void }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ name: "", description: "", note: "", price: "", vatPercent: "", categoryId: "", imageUrl: "", isActive: true, isVegan: false, isVegetarian: false, isGlutenFree: false, position: "0", displayMode: "FULL" as "FULL" | "COMPACT", hideDescription: false, localPriceLocked: false, discountActive: false, discountMode: "PERCENT" as "PERCENT" | "PRICE", discountPercent: "", discountPrice: "", extraGroupIds: [] as string[] });
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!open) {
      setDeleteConfirmOpen(false);
      return;
    }
    setForm(
      product
        ? {
            name: product.name,
            description: product.description || "",
            note: product.note || "",
            price: String(product.price),
            vatPercent: product.vatPercent == null ? "" : String(product.vatPercent),
            categoryId: product.categoryId,
            imageUrl: product.imageUrl || "",
            isActive: product.isActive ?? true,
            isVegan: product.isVegan ?? false,
            isVegetarian: product.isVegetarian ?? false,
            isGlutenFree: product.isGlutenFree ?? false,
            position: String(product.position),
            displayMode: product.displayMode ?? "FULL",
            hideDescription: product.hideDescription ?? false,
            localPriceLocked: product.localPriceLocked ?? false,
            discountActive: product.discountActive ?? false,
            // discountPrice vinner över discountPercent i prisberäkningen
            // (lib/deals.ts) → läget hydreras från vilket fält som är satt.
            discountMode: product.discountPrice != null ? "PRICE" : "PERCENT",
            discountPercent: product.discountPercent == null ? "" : String(product.discountPercent),
            discountPrice: product.discountPrice == null ? "" : String(product.discountPrice),
            extraGroupIds: product.extraGroups.map((group) => group.id),
          }
        : {
            name: "",
            description: "",
            note: "",
            price: "",
            vatPercent: "",
            categoryId: categories[0]?.id || "",
            imageUrl: "",
            isActive: true,
            isVegan: false,
            isVegetarian: false,
            isGlutenFree: false,
            position: "0",
            displayMode: "FULL",
            hideDescription: false,
            localPriceLocked: false,
            discountActive: false,
            discountMode: "PERCENT",
            discountPercent: "",
            discountPrice: "",
            extraGroupIds: [],
          },
    );
    setDeleteConfirmOpen(false);
  }, [categories, open, product]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const saveMutation = useMutation({ meta: { toast: false },
    mutationFn: async () => {
      const price = parseNumberDraft(form.price);
      const position = parseIntegerDraft(form.position);
      const discountPercent = parseNumberDraft(form.discountPercent);
      const discountPrice = parseNumberDraft(form.discountPrice);
      if (price === null || price < 0) throw new Error("Pris måste vara 0 kr eller högre");
      if (position === null || position < 0) throw new Error("Position måste vara 0 eller högre");
      // Två sätt att sätta samma rabatt. PERCENT: backend kräver 1–95.
      // PRICE: admin skriver kampanjpriset och procenten räknas fram —
      // priset måste vara lägre än ordinarie, annars visas ingen rabatt alls
      // (createPromotionCandidate i lib/deals.ts kastar kandidaten).
      const priceModeOn = form.discountMode === "PRICE";
      const discountOn = form.discountActive && (
        priceModeOn
          ? discountPrice !== null && discountPrice > 0 && discountPrice < price
          : discountPercent !== null && discountPercent > 0
      );
      if (form.discountActive && priceModeOn && !discountOn) {
        throw new Error("Kampanjpriset måste vara högre än 0 kr och lägre än ordinarie pris");
      }
      const payload = {
        ...form,
        price,
        vatPercent: form.vatPercent ? Number(form.vatPercent) : null,
        position,
        discountActive: discountOn,
        // Exakt ETT av fälten sätts. Sätts båda vinner discountPrice i
        // prisberäkningen och procenten blir en tyst lögn i admin.
        discountPercent: discountOn && !priceModeOn
          ? Math.min(95, Math.max(1, Math.round(discountPercent as number)))
          : null,
        discountPrice: discountOn && priceModeOn ? discountPrice : null,
        restaurantId,
      };
      if (product) {
        return updateProduct(product.id, payload);
      }
      return createProduct(payload);
    },
    onSuccess: async () => {
      setDeleteConfirmOpen(false);
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
      setDeleteConfirmOpen(false);
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
  const numericPrice = parseNumberDraft(form.price);
  const numericPosition = parseIntegerDraft(form.position);
  const numericDiscount = parseNumberDraft(form.discountPercent);
  const numericDiscountPrice = parseNumberDraft(form.discountPrice);
  // Procenten som ett kampanjpris motsvarar. Samma avrundning som servern
  // (lib/deals.ts) så admin ser exakt det kunden kommer se i menyn.
  const derivedDiscountPercent = numericPrice !== null && numericPrice > 0 && numericDiscountPrice !== null && numericDiscountPrice > 0 && numericDiscountPrice < numericPrice
    ? Math.max(1, Math.round((1 - numericDiscountPrice / numericPrice) * 100))
    : null;
  const discountValid = !form.discountActive || (
    form.discountMode === "PRICE"
      ? derivedDiscountPercent !== null
      : numericDiscount !== null && numericDiscount >= 1 && numericDiscount <= 95
  );
  const canSave = form.name.trim().length > 0
    && Boolean(form.categoryId)
    && numericPrice !== null
    && numericPrice >= 0
    && numericPosition !== null
    && numericPosition >= 0
    && discountValid;
  return (
    <>
    <Modal
      open={open && !deleteConfirmOpen}
      onClose={onClose}
      title={product ? "Redigera produkt" : "Ny produkt"}
      size="xl"
      footer={<div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between"><div>{product ? (
        <Button
          variant="danger"
          onClick={() => setDeleteConfirmOpen(true)}
          disabled={saveMutation.isPending}
        >Radera</Button>
      ) : null}</div><div className="flex flex-col-reverse gap-2 sm:flex-row"><Button onClick={onClose} disabled={saveMutation.isPending}>Stäng</Button><Button type="submit" form="menu-product-form" variant="primary" loading={saveMutation.isPending} disabled={!canSave}>Spara</Button></div></div>}
    >
        <form id="menu-product-form" className="grid gap-4 md:grid-cols-2" onSubmit={(event) => { event.preventDefault(); if (canSave) saveMutation.mutate(); }}>
        {/* P14 vänster: Detaljer-kort med bild-thumb, namn, orange-kantat pris, beskrivning och tillgänglighets-toggle. */}
        <div className="surface px-5 py-5">
          <p className="text-[15px] font-extrabold tracking-[-0.3px] text-[var(--text-primary)]">Detaljer</p>
          <div className="mt-4 flex flex-col gap-3.5 sm:flex-row">
            <span
              aria-hidden
              className="h-[84px] w-[84px] shrink-0 rounded-[12px] bg-cover bg-center"
              style={form.imageUrl ? { backgroundImage: `url(${form.imageUrl})` } : { backgroundImage: DISH_PLACEHOLDER }}
            />
            <div className="min-w-0 flex-1 grid gap-3">
              <Field label="Namn"><Input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} /></Field>
              <Field label="Pris">
                <MoneyInput
                  min={0}
                  step={0.01}
                  className="border-2 border-[var(--accent)] font-bold"
                  value={form.price}
                  onValueChange={(price) => setForm((current) => ({ ...current, price }))}
                />
              </Field>
            </div>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Kategori"><Select value={form.categoryId} onChange={(event) => setForm((current) => ({ ...current, categoryId: event.target.value }))}>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</Select></Field>
            <Field label="Position"><IntegerInput min={0} step={1} value={form.position} onValueChange={(position) => setForm((current) => ({ ...current, position }))} /></Field>
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
          <div className="mt-4 border-t border-[var(--border-subtle)] pt-3.5">
            <SwitchField label="Tillgänglig" hint="Visas för kunder." checked={form.isActive} onChange={(isActive) => setForm((current) => ({ ...current, isActive }))} />
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
          <SwitchField label="Rabatt aktiv" hint="Använd produktens egen rabatt, separat från kampanjdeals." checked={form.discountActive} onChange={(discountActive) => setForm((current) => ({ ...current, discountActive }))} />
          {form.discountActive ? (
            <div className="mt-3 space-y-3">
              {/* Två sätt att sätta samma rabatt: skriv procenten, eller skriv
                  kampanjpriset och låt procenten räknas fram. Exakt ett fält
                  sparas — se payloaden i saveMutation. */}
              <Field label="Sätt rabatten som">
                <Select
                  value={form.discountMode}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, discountMode: event.target.value as "PERCENT" | "PRICE" }))
                  }
                >
                  <option value="PERCENT">Rabatt i procent</option>
                  <option value="PRICE">Kampanjpris i kronor</option>
                </Select>
              </Field>
              <div className="grid items-end gap-4 md:grid-cols-2">
                {form.discountMode === "PRICE" ? (
                  <Field label="Kampanjpris">
                    <MoneyInput
                      min={0}
                      step={1}
                      value={form.discountPrice}
                      onValueChange={(discountPrice) => setForm((current) => ({ ...current, discountPrice }))}
                    />
                  </Field>
                ) : (
                  <Field label="Rabatt %">
                    <PercentInput
                      min={1}
                      max={95}
                      step={1}
                      value={form.discountPercent}
                      onValueChange={(discountPercent) => setForm((current) => ({ ...current, discountPercent }))}
                    />
                  </Field>
                )}
                <p className="pb-2.5 text-[13px] text-[var(--text-secondary)]">
                  {form.discountMode === "PRICE"
                    ? derivedDiscountPercent !== null && numericPrice !== null
                      ? `${numericPrice.toFixed(2)} kr → ${(numericDiscountPrice as number).toFixed(2)} kr (−${derivedDiscountPercent} %)`
                      : "Ange ett kampanjpris lägre än ordinarie pris."
                    : numericPrice !== null && numericDiscount !== null && numericDiscount >= 1
                      ? `${numericPrice.toFixed(2)} kr → ${(numericPrice * (1 - Math.min(95, numericDiscount) / 100)).toFixed(2)} kr`
                      : "Ange 1–95 % för att aktivera rabatten."}
                </p>
              </div>
            </div>
          ) : null}
        </div>
        <div className="md:col-span-2 surface-muted px-4 py-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="card-label">Kampanjgenväg</p>
            </div>
            <Button
              type="button"
              variant="secondary"
              disabled={!product}
              onClick={() =>
                router.push(
                  productDeal
                    ? `/deals/kampanj/${productDeal.id}`
                    : `/deals/kampanj/new?scope=PRODUCT&restaurant=${restaurantId}&target=${product?.id ?? ""}&title=${encodeURIComponent(product ? `${product.name} promo` : "")}`,
                )
              }
            >
              {productDeal ? "Redigera produktdeal" : "Skapa produktdeal"}
            </Button>
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
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            <CheckboxField label="Dölj beskrivning i menyn" checked={form.hideDescription} onChange={(hideDescription) => setForm((current) => ({ ...current, hideDescription }))} />
            <CheckboxField label="Lås lokalt pris (kedja)" checked={form.localPriceLocked} onChange={(localPriceLocked) => setForm((current) => ({ ...current, localPriceLocked }))} />
          </div>
          <div className="mt-4 max-w-sm">
            <Field label="Moms-override">
              <Select value={form.vatPercent} onChange={(event) => setForm((current) => ({ ...current, vatPercent: event.target.value }))}>
                <option value="">Ärv restaurangens matmoms</option>
                <option value="6">6 % — mat/alkoholfri dryck</option>
                <option value="12">12 % — restaurang-/cateringtjänst</option>
                <option value="25">25 % — t.ex. vin/starköl</option>
              </Select>
            </Field>
          </div>
        </div>
        <div className="md:col-span-2 surface-muted px-4 py-4">
          <p className="card-label">Kostflaggor</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <CheckboxField label="Vegansk" checked={form.isVegan} onChange={(isVegan) => setForm((current) => ({ ...current, isVegan }))} />
            <CheckboxField label="Vegetarisk" checked={form.isVegetarian} onChange={(isVegetarian) => setForm((current) => ({ ...current, isVegetarian }))} />
            <CheckboxField label="Glutenfri" checked={form.isGlutenFree} onChange={(isGlutenFree) => setForm((current) => ({ ...current, isGlutenFree }))} />
          </div>
        </div>
      </form>

    </Modal>
    <ConfirmDialog
      open={deleteConfirmOpen}
      title={`Radera ${product?.name ?? "produkt"}?`}
      description="Produkten försvinner från menyn. Befintliga ordrar påverkas inte. Detta kan inte ångras."
      confirmLabel="Radera produkt"
      danger
      loading={deleteMutation.isPending}
      onClose={() => { if (!deleteMutation.isPending) setDeleteConfirmOpen(false); }}
      onConfirm={() => deleteMutation.mutate()}
    />
    </>
  );
}

// Enhetlig på/av-pill: aktiv = ifylld monokrom med bock, inaktiv = ren kontur.

export function BulkEditModal({ open, count, extraGroups, onClose, onApply }: { open: boolean; count: number; extraGroups: ExtraGroupRecord[]; onClose: () => void; onApply: (payload: Record<string, unknown>) => void }) {
  // En "enabled"-flagga per fält + själva värdet. Bara enabled-fält skickas.
  const [on, setOn] = useState({ displayMode: false, localPriceLocked: false, diet: false, extraGroups: false });
  const [displayMode, setDisplayMode] = useState<"FULL" | "COMPACT">("FULL");
  const [localPriceLocked, setLocalPriceLocked] = useState(false);
  const [isVegan, setIsVegan] = useState(false);
  const [isVegetarian, setIsVegetarian] = useState(false);
  const [isGlutenFree, setIsGlutenFree] = useState(false);
  const [extraGroupIds, setExtraGroupIds] = useState<string[]>([]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!open) return;
    setOn({ displayMode: false, localPriceLocked: false, diet: false, extraGroups: false });
    setDisplayMode("FULL");
    setLocalPriceLocked(false);
    setIsVegan(false);
    setIsVegetarian(false);
    setIsGlutenFree(false);
    setExtraGroupIds([]);
  }, [open]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const toggleGroup = (id: string) => setExtraGroupIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  const anyEnabled = on.displayMode || on.localPriceLocked || on.diet || on.extraGroups;

  const apply = () => {
    const payload: Record<string, unknown> = {};
    if (on.displayMode) payload.displayMode = displayMode;
    if (on.localPriceLocked) payload.localPriceLocked = localPriceLocked;
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
      size="lg"
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
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
          <SwitchField label="Lokalt pris låst" checked={localPriceLocked} onChange={setLocalPriceLocked} className="sm:col-span-2" />
        </BulkRow>
        <BulkRow label="Kostflaggor" enabled={on.diet} onToggle={() => setOn((c) => ({ ...c, diet: !c.diet }))}>
          <CheckboxField label="Vegansk" checked={isVegan} onChange={setIsVegan} />
          <CheckboxField label="Vegetarisk" checked={isVegetarian} onChange={setIsVegetarian} />
          <CheckboxField label="Glutenfri" checked={isGlutenFree} onChange={setIsGlutenFree} />
        </BulkRow>
        <BulkRow label="Tillvalsgrupper" enabled={on.extraGroups} onToggle={() => setOn((c) => ({ ...c, extraGroups: !c.extraGroups }))}>
          {extraGroups.length === 0 ? (
            <p className="text-[13px] text-[var(--text-secondary)]">Inga tillvalsgrupper finns.</p>
          ) : (
            extraGroups.map((group) => (
              <CheckboxField key={group.id} label={group.name} checked={extraGroupIds.includes(group.id)} onChange={() => toggleGroup(group.id)} />
            ))
          )}
        </BulkRow>
      </div>
    </Modal>
  );
}

export function ExtraGroupModal({ open, restaurantId, group, categories, onClose }: { open: boolean; restaurantId: string; group: ExtraGroupRecord | null; categories: CategoryRecord[]; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [type, setType] = useState("CHECKBOX");
  const [required, setRequired] = useState(false);
  const [minSelections, setMinSelections] = useState("0");
  const [maxSelections, setMaxSelections] = useState("1");
  const [displayStyle, setDisplayStyle] = useState<"LIST" | "BOX_IMAGE">("LIST");
  const [allowQuantity, setAllowQuantity] = useState(false);
  const [extras, setExtras] = useState<Array<{ name: string; priceAddon: string; isDefault: boolean; imageUrl: string | null }>>([{ name: "", priceAddon: "0", isDefault: false, imageUrl: null }]);
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!open) {
      setDeleteConfirmOpen(false);
      return;
    }
    if (group) {
      setName(group.name);
      setType(group.type || "CHECKBOX");
      setRequired(group.required);
      setMinSelections(String(group.minSelections ?? 0));
      setMaxSelections(String(group.maxSelections ?? 1));
      setDisplayStyle(group.displayStyle === "BOX_IMAGE" ? "BOX_IMAGE" : "LIST");
      setAllowQuantity(group.allowQuantity ?? false);
      setExtras(group.extras.length ? group.extras.map((extra) => ({ name: extra.name, priceAddon: String(extra.priceAddon), isDefault: extra.isDefault || false, imageUrl: extra.imageUrl ?? null })) : [{ name: "", priceAddon: "0", isDefault: false, imageUrl: null }]);
      setCategoryIds(group.categoryIds ?? []);
    } else {
      setName("");
      setType("CHECKBOX");
      setRequired(false);
      setMinSelections("0");
      setMaxSelections("1");
      setDisplayStyle("LIST");
      setAllowQuantity(false);
      setExtras([{ name: "", priceAddon: "0", isDefault: false, imageUrl: null }]);
      setCategoryIds([]);
    }
    setDeleteConfirmOpen(false);
  }, [group, open]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const saveMutation = useMutation({ meta: { toast: false },
    mutationFn: async () => {
      const parsedMin = parseIntegerDraft(minSelections);
      const parsedMax = parseIntegerDraft(maxSelections);
      if (parsedMin === null || parsedMin < 0) throw new Error("Min antal måste vara 0 eller högre");
      if (parsedMax === null || parsedMax < 1) throw new Error("Max antal måste vara minst 1");
      if (parsedMin > parsedMax) throw new Error("Min antal kan inte vara högre än max antal");
      const payload = {
        name,
        type,
        required,
        minSelections: parsedMin,
        maxSelections: parsedMax,
        displayStyle,
        allowQuantity,
        restaurantId,
        categoryIds,
        extras: extras.filter((extra) => extra.name.trim()).map((extra) => ({
          ...extra,
          priceAddon: parseNumberDraft(extra.priceAddon) ?? 0,
          imageUrl: extra.imageUrl ?? null,
        })),
      };
      if (group) {
        return updateExtraGroup(group.id, payload);
      }
      return createExtraGroup(payload);
    },
    onSuccess: async () => {
      setDeleteConfirmOpen(false);
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
      setDeleteConfirmOpen(false);
      await queryClient.invalidateQueries({ queryKey: menuGroupsQueryKey(restaurantId) });
      await queryClient.invalidateQueries({ queryKey: menuProductsQueryKey(restaurantId) });
      onClose();
    },
  });

  const updateExtra = (index: number, field: "name" | "priceAddon" | "isDefault" | "imageUrl", value: string | boolean | null) => {
    setExtras((current) => current.map((extra, currentIndex) => (currentIndex === index ? { ...extra, [field]: value } : extra)));
  };

  const toggleCategory = (categoryId: string) => setCategoryIds((current) => current.includes(categoryId) ? current.filter((id) => id !== categoryId) : [...current, categoryId]);

  const parsedMin = parseIntegerDraft(minSelections);
  const parsedMax = parseIntegerDraft(maxSelections);
  const extrasValid = extras.filter((extra) => extra.name.trim()).every((extra) => {
    const price = parseNumberDraft(extra.priceAddon);
    return price !== null && price >= 0;
  });
  const canSave = name.trim().length > 0
    && parsedMin !== null
    && parsedMin >= 0
    && parsedMax !== null
    && parsedMax >= 1
    && parsedMin <= parsedMax
    && extrasValid;

  return (
    <>
    <Modal
      open={open && !deleteConfirmOpen}
      onClose={onClose}
      title={group ? "Redigera tillvalsgrupp" : "Ny tillvalsgrupp"}
      size="lg"
      footer={<div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between"><div>{group ? (
        <Button
          variant="danger"
          onClick={() => setDeleteConfirmOpen(true)}
          disabled={saveMutation.isPending}
        >Radera</Button>
      ) : null}</div><div className="flex flex-col-reverse gap-2 sm:flex-row"><Button onClick={onClose} disabled={saveMutation.isPending}>Stäng</Button><Button type="submit" form="menu-extra-group-form" variant="primary" loading={saveMutation.isPending} disabled={!canSave}>Spara</Button></div></div>}
    >
      <form id="menu-extra-group-form" className="grid gap-4" onSubmit={(event) => { event.preventDefault(); if (canSave) saveMutation.mutate(); }}>
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
                <IntegerInput min={0} step={1} wrapperClassName="w-[72px]" className="input-compact-number" value={minSelections} onValueChange={setMinSelections} aria-label="Min antal" />
                <span className="text-[var(--text-muted)]">–</span>
                <IntegerInput min={1} step={1} wrapperClassName="w-[72px]" className="input-compact-number" value={maxSelections} onValueChange={setMaxSelections} aria-label="Max antal" />
              </div>
            </div>
          </div>
          <div className="mt-4 border-t border-[var(--border-subtle)] pt-3.5">
            <SwitchField label="Obligatorisk" checked={required} onChange={setRequired} />
          </div>
          <div className="mt-3 border-t border-[var(--border-subtle)] pt-3.5">
            <SwitchField label="Antal per val" hint="Låt kunden välja fler än en av samma option." checked={allowQuantity} onChange={setAllowQuantity} />
          </div>
        </div>

        <div className="surface-muted px-4 py-4">
          <p className="card-label">Kategorier</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {categories.map((category) => (
              <CheckboxField key={category.id} label={category.name} checked={categoryIds.includes(category.id)} onChange={() => toggleCategory(category.id)} />
            ))}
          </div>
        </div>

        {/* P15: TILLVAL-lista. Varje rad: dra-handtag, namn, +pris-pill, förvald-toggle, ta bort. */}
        <div className="grid gap-2.5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[13px] font-extrabold uppercase tracking-[0.04em] text-[var(--text-primary)]">Tillval</p>
            <button
              type="button"
              onClick={() => setExtras((current) => [...current, { name: "", priceAddon: "0", isDefault: false, imageUrl: null }])}
              className="inline-flex items-center gap-1 text-[12.5px] font-bold text-[var(--accent-ink)]"
            >
              <Plus size={14} /> Lägg till tillval
            </button>
          </div>
          <div className="surface overflow-hidden">
            {extras.map((extra, index) => (
              <div key={index} className={index > 0 ? "border-t border-[var(--row-divider)]" : ""}>
                <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 sm:grid-cols-[auto_minmax(0,1fr)_120px_auto_auto]">
                  <GripVertical size={16} className="shrink-0 cursor-grab text-[var(--text-muted)]" aria-hidden />
                  <Input
                    className="min-w-0 flex-1 border-0 bg-transparent px-0 font-semibold focus:ring-0"
                    value={extra.name}
                    onChange={(event) => updateExtra(index, "name", event.target.value)}
                    placeholder="Namn på tillval"
                  />
                  <MoneyInput min={0} step={0.01} value={extra.priceAddon} onValueChange={(priceAddon) => updateExtra(index, "priceAddon", priceAddon)} aria-label={`Pristillägg för ${extra.name || `tillval ${index + 1}`}`} className="font-bold" />
                  <CheckboxField label="Förvald" checked={extra.isDefault} onChange={(isDefault) => updateExtra(index, "isDefault", isDefault)} className="col-span-2 sm:col-span-1" />
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
      </form>
    </Modal>
    <ConfirmDialog
      open={deleteConfirmOpen}
      title={`Radera ${group?.name ?? "tillvalsgrupp"}?`}
      description="Produkter som använder gruppen tappar dessa tillval. Detta kan inte ångras."
      confirmLabel="Radera tillvalsgrupp"
      danger
      loading={deleteMutation.isPending}
      onClose={() => { if (!deleteMutation.isPending) setDeleteConfirmOpen(false); }}
      onConfirm={() => deleteMutation.mutate()}
    />
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Import-modal: kopiera kategori/produkt/extra-grupp från en annan restaurang.
// Källan rörs inte — målet får nya id:n.
// ─────────────────────────────────────────────────────────────────────────
export function ImportFromOtherModal({
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
        ? (sourceProducts.data || []).map((p) => ({ id: p.id, name: p.name, meta: `${p.price ?? ""} kr` }))
        : (sourceGroups.data || []).map((g) => ({ id: g.id, name: g.name, meta: `${g.extras?.length ?? 0} tillval` }));

  const isLoading = (tab === "categories" && sourceCategories.isLoading) ||
    (tab === "products" && sourceProducts.isLoading) ||
    (tab === "extras" && sourceGroups.isLoading);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Importera ${tab === "categories" ? "kategori" : tab === "products" ? "produkt" : "tillbehörsgrupp"}`}
      size="lg"
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
                <div key={item.id} className="surface-muted flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold truncate">{item.name}</p>
                    {item.meta && <p className="text-[11px] text-[var(--text-muted)] mt-0.5">{item.meta}</p>}
                  </div>
                  <Button
                    variant="primary"
                    loading={copyMutation.isPending && copyMutation.variables === item.id}
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
