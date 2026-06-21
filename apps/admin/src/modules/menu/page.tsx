"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronDown, ChevronUp, Loader2, Plus, Search, Tags, Upload } from "lucide-react";
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
import { Badge, Button, EmptyState, ErrorPanel, Field, Input, Modal, PageHeader, Select, Surface, Tabs, Textarea } from "@/shared/components/ui";
import { CityRestaurantPicker } from "@/shared/components/city-restaurant-picker";
import { ImageUploadField } from "@/shared/components/image-upload";
import { useToast } from "@/shared/components/toast";
import { Copy } from "lucide-react";
import { formatCurrency } from "@/shared/utils/format";

type MenuTab = "categories" | "products" | "extras";

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
  const [form, setForm] = useState({ name: "", description: "", price: 0, categoryId: "", imageUrl: "", isActive: true, isVegan: false, isVegetarian: false, isGlutenFree: false, position: 0, displayMode: "FULL" as "FULL" | "COMPACT", hideDescription: false, rewardable: false, localPriceLocked: false, discountActive: false, discountPercent: 0, extraGroupIds: [] as string[] });
  const [promotionModalOpen, setPromotionModalOpen] = useState(false);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!open) return;
    setForm(
      product
        ? {
            name: product.name,
            description: product.description || "",
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
            localPriceLocked: (product as any).localPriceLocked ?? false,
            discountActive: product.discountActive ?? false,
            discountPercent: product.discountPercent ?? 0,
            extraGroupIds: product.extraGroups.map((group) => group.id),
          }
        : {
            name: "",
            description: "",
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
      const payload = {
        ...form,
        discountActive: discountOn,
        discountPercent: discountOn ? Math.min(95, Math.max(1, Math.round(form.discountPercent))) : null,
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
        <Field label="Namn"><Input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} /></Field>
        <Field label="Pris"><Input type="number" value={form.price} onChange={(event) => setForm((current) => ({ ...current, price: Number(event.target.value) }))} /></Field>
        <Field label="Kategori"><Select value={form.categoryId} onChange={(event) => setForm((current) => ({ ...current, categoryId: event.target.value }))}>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</Select></Field>
        <Field label="Position"><Input type="number" value={form.position} onChange={(event) => setForm((current) => ({ ...current, position: Number(event.target.value) }))} /></Field>
        <ImageUploadField
          label="Bild"
          value={form.imageUrl}
          onChange={(url) => setForm((current) => ({ ...current, imageUrl: url }))}
          kind="product"
          restaurantId={restaurantId}
          categoryId={form.categoryId || null}
          productId={product?.id || null}
        />
        <Field label="Status"><Select value={form.isActive ? "active" : "inactive"} onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.value === "active" }))}><option value="active">Aktiv</option><option value="inactive">Inaktiv</option></Select></Field>
        <div className="md:col-span-2"><Field label="Beskrivning"><Textarea value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} /></Field></div>
        <div className="md:col-span-2 surface-muted px-4 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="card-label">Rabatt</p>
            <button
              type="button"
              onClick={() => setForm((current) => ({ ...current, discountActive: !current.discountActive }))}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3.5 py-2 text-[12px] font-semibold transition-colors ${form.discountActive ? toggleOnClass : toggleOffClass}`}
            >
              {form.discountActive ? <Check size={13} strokeWidth={3} /> : null}
              Rabatt aktiv
            </button>
          </div>
          {form.discountActive ? (
            <div className="mt-4 grid items-end gap-4 md:grid-cols-2">
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
          <div className="mt-4 flex flex-wrap gap-2">
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
            <TogglePill active={form.rewardable} onClick={() => setForm((current) => ({ ...current, rewardable: !current.rewardable }))}>★ Köpbar med poäng (Dpoints)</TogglePill>
            <TogglePill active={form.localPriceLocked} onClick={() => setForm((current) => ({ ...current, localPriceLocked: !current.localPriceLocked }))}>🔒 Lås lokalt pris (kedja)</TogglePill>
          </div>
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
        <div className="md:col-span-2 surface-muted px-4 py-4">
          <p className="card-label">Tillvalsgrupper</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {extraGroups.map((group) => (
              <TogglePill key={group.id} active={form.extraGroupIds.includes(group.id)} onClick={() => toggleExtraGroup(group.id)}>{group.name}</TogglePill>
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
    <div className="surface-muted px-4 py-3">
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
      <div className="grid gap-3">
        <BulkRow label="Visningsläge i menyn" enabled={on.displayMode} onToggle={() => setOn((c) => ({ ...c, displayMode: !c.displayMode }))}>
          <TogglePill active={displayMode === "FULL"} onClick={() => setDisplayMode("FULL")}>Hel bredd</TogglePill>
          <TogglePill active={displayMode === "COMPACT"} onClick={() => setDisplayMode("COMPACT")}>Halv bredd</TogglePill>
        </BulkRow>
        <BulkRow label="Lås lokalt pris" enabled={on.localPriceLocked} onToggle={() => setOn((c) => ({ ...c, localPriceLocked: !c.localPriceLocked }))}>
          <TogglePill active={localPriceLocked} onClick={() => setLocalPriceLocked((v) => !v)}>{localPriceLocked ? "På" : "Av"}</TogglePill>
        </BulkRow>
        <BulkRow label="Köpbar med Dpoints" enabled={on.rewardable} onToggle={() => setOn((c) => ({ ...c, rewardable: !c.rewardable }))}>
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
      <div className="grid gap-5">
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Namn"><Input value={name} onChange={(event) => setName(event.target.value)} /></Field>
          <Field label="Typ"><Select value={type} onChange={(event) => setType(event.target.value)}><option value="CHECKBOX">Checkbox</option><option value="RADIO">Radio</option></Select></Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Min antal"><Input type="number" value={minSelections} onChange={(event) => setMinSelections(Number(event.target.value))} /></Field>
          <Field label="Max antal"><Input type="number" value={maxSelections} onChange={(event) => setMaxSelections(Number(event.target.value))} /></Field>
          <Field label="Visningsstil"><Select value={displayStyle} onChange={(event) => setDisplayStyle(event.target.value === "BOX_IMAGE" ? "BOX_IMAGE" : "LIST")}><option value="LIST">Lista</option><option value="BOX_IMAGE">Bildrutor</option></Select></Field>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <TogglePill active={required} onClick={() => setRequired((current) => !current)}>Obligatorisk</TogglePill>
          <TogglePill active={allowQuantity} onClick={() => setAllowQuantity((current) => !current)}>Antal per val</TogglePill>
        </div>

        <div className="grid gap-2">
          <p className="field-label">Kategorier</p>
          <div className="flex flex-wrap gap-2">
            {categories.map((category) => (
              <TogglePill key={category.id} active={categoryIds.includes(category.id)} onClick={() => toggleCategory(category.id)}>{category.name}</TogglePill>
            ))}
          </div>
        </div>

        <div className="grid gap-2">
          <div className="flex items-center justify-between gap-3">
            <p className="field-label">Tillval</p>
            <Button variant="secondary" onClick={() => setExtras((current) => [...current, { name: "", priceAddon: 0, isDefault: false, imageUrl: null }])}>Lägg till rad</Button>
          </div>
          <div className="grid gap-2">
            {extras.map((extra, index) => (
              <div key={index} className="surface-muted grid gap-2 px-3 py-3">
                <div className="grid gap-2 md:grid-cols-[1fr_110px_130px_auto]">
                  <Input value={extra.name} onChange={(event) => updateExtra(index, "name", event.target.value)} placeholder="Namn" />
                  <Input type="number" value={extra.priceAddon} onChange={(event) => updateExtra(index, "priceAddon", Number(event.target.value))} placeholder="Pris" />
                  <Select value={extra.isDefault ? "yes" : "no"} onChange={(event) => updateExtra(index, "isDefault", event.target.value === "yes")}><option value="no">Valfri</option><option value="yes">Förvald</option></Select>
                  <Button variant="danger" onClick={() => setExtras((current) => current.filter((_, currentIndex) => currentIndex !== index))}>Ta bort</Button>
                </div>
                {displayStyle === "BOX_IMAGE" ? (
                  <ImageUploadField
                    label="Bild"
                    value={extra.imageUrl || ""}
                    onChange={(url) => updateExtra(index, "imageUrl", url || null)}
                    kind="extra"
                    fileBaseName={extra.name}
                    restaurantId={restaurantId}
                    uploadOnly
                  />
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

  useEffect(() => {
    if (!open) {
      setSourceRestaurantId("");
      setTargetCategoryId("");
      setError(null);
    }
  }, [open]);

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

        {error && <p className="text-sm text-rose-400">{error}</p>}

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
    e?.response?.data?.error || e?.message || "Okänt fel — kolla nätverk eller serverloggar.";

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
                <p className="text-xs text-[var(--text-secondary)]">Förhandsvisning — inget har skrivits. Klicka <b>Importera</b> för att köra.</p>
              ) : (
                <p className="text-xs text-emerald-400">✓ Importen är klar och menyn uppdaterad.</p>
              )}

              {result.warnings.length > 0 ? (
                <div>
                  <p className="mb-1 text-[11px] font-black uppercase tracking-widest text-amber-400">Varningar ({result.warnings.length})</p>
                  <div className="surface-muted max-h-40 overflow-y-auto px-3 py-2 text-xs text-amber-300">
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
                <div className="surface-muted px-3 py-2 text-xs text-rose-400">
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
              <p className={`text-xs ${result.dryRun ? "text-[var(--text-secondary)]" : "text-emerald-400"}`}>
                {result.dryRun ? "Förhandsvisning — inget har skrivits. Klicka Synka för att köra." : "✓ Synken är klar; platsernas menyer uppdaterade."}
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
            {error ? <p className="text-sm text-rose-400">{error}</p> : null}
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
          <p className="text-sm text-rose-400">Kunde inte ladda mall. Försök igen.</p>
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
                  Kategorier — produkter ({totalProducts})
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

  /* eslint-disable react-hooks/set-state-in-effect */
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
  /* eslint-enable react-hooks/set-state-in-effect */

  const categories = useQuery({ queryKey: menuCategoriesQueryKey(activeRestaurantId), queryFn: () => getCategories(activeRestaurantId!), enabled: Boolean(activeRestaurantId) });
  const products = useQuery({ queryKey: menuProductsQueryKey(activeRestaurantId), queryFn: () => getProducts(activeRestaurantId!), enabled: Boolean(activeRestaurantId) });
  const groups = useQuery({ queryKey: menuGroupsQueryKey(activeRestaurantId), queryFn: () => getExtraGroups(activeRestaurantId!), enabled: Boolean(activeRestaurantId) });

  const filteredCategories = useMemo(() => {
    const lowerQuery = query.trim().toLowerCase();
    return (categories.data || []).filter((category) => !lowerQuery || `${category.name} ${category.description || ""}`.toLowerCase().includes(lowerQuery));
  }, [categories.data, query]);

  const filteredProducts = useMemo(() => {
    const lowerQuery = query.trim().toLowerCase();
    return (products.data || []).filter((product) => !lowerQuery || `${product.name} ${product.description || ""} ${product.category.name}`.toLowerCase().includes(lowerQuery));
  }, [products.data, query]);

  const filteredGroups = useMemo(() => {
    const lowerQuery = query.trim().toLowerCase();
    return (groups.data || []).filter((group) => !lowerQuery || group.name.toLowerCase().includes(lowerQuery));
  }, [groups.data, query]);

  // Kategorier i sin position-ordning (för omsorteringspilarna + produktsektionerna).
  const sortedCategories = useMemo(
    () => [...(categories.data || [])].sort((a, b) => a.position - b.position),
    [categories.data],
  );

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
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setSelectedIds(new Set());
    setBulkPct("");
    setBulkCategoryId("");
  }, [activeRestaurantId, tab]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const allFilteredSelected = filteredProducts.length > 0 && filteredProducts.every((p) => selectedIds.has(p.id));

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

  // Flytta en produkt upp/ner inom sin kategori. Räknar fram den nya ordningen av
  // id:n lokalt, skickar hela ordningen till backend, busta sen produkt-cachen.
  const moveProduct = async (categoryProducts: ProductRecord[], index: number, direction: -1 | 1) => {
    if (reorderBusy) return;
    const target = index + direction;
    if (target < 0 || target >= categoryProducts.length) return;
    const ordered = [...categoryProducts];
    const [moved] = ordered.splice(index, 1);
    ordered.splice(target, 0, moved);
    setReorderBusy(true);
    try {
      await reorderProducts(ordered.map((p) => p.id));
      await bulkQueryClient.invalidateQueries({ queryKey: menuProductsQueryKey(activeRestaurantId) });
    } catch {
      showBulkToast({ type: "error", message: "Kunde inte spara ordningen" });
    } finally {
      setReorderBusy(false);
    }
  };

  // Flytta en kategori upp/ner i den globala ordningen.
  const moveCategory = async (orderedCategories: CategoryRecord[], index: number, direction: -1 | 1) => {
    if (reorderBusy) return;
    const target = index + direction;
    if (target < 0 || target >= orderedCategories.length) return;
    const ordered = [...orderedCategories];
    const [moved] = ordered.splice(index, 1);
    ordered.splice(target, 0, moved);
    setReorderBusy(true);
    try {
      await reorderCategories(ordered.map((c) => c.id));
      await bulkQueryClient.invalidateQueries({ queryKey: menuCategoriesQueryKey(activeRestaurantId) });
    } catch {
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

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!pendingRouteProductId || !products.data?.length) return;
    const product = products.data.find((entry) => entry.id === pendingRouteProductId);
    if (!product) return;
    setTab("products");
    setActiveProduct(product);
    setProductModalOpen(true);
    setPendingRouteProductId(null);
  }, [pendingRouteProductId, products.data]);
  /* eslint-enable react-hooks/set-state-in-effect */


  if (restaurants.isLoading) {
    return <Surface className="px-6 py-12 text-sm text-[var(--text-secondary)]">Laddar menymodulen...</Surface>;
  }

  if (restaurants.isError || !restaurants.data) {
    return <ErrorPanel title="Menymodulen kunde inte laddas" description="Restauranglistan för menyhantering är inte tillgänglig." action={<Button onClick={() => void restaurants.refetch()}>Försök igen</Button>} />;
  }

  return (
    <div className="page-stack">
      <PageHeader
        title="Meny"
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
            {activeRestaurantId ? (
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
          <Tabs value={tab} onChange={setTab} options={[{ value: "categories", label: "Kategorier" }, { value: "products", label: "Produkter" }, { value: "extras", label: "Tillval" }]} />
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
            {/* Sökning = platt filtrerad lista (pilarna döljs). Annars grupperat
                per kategori med kompakta rader + omsorteringspilar inom sektionen. */}
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
            ) : productSections.length === 0 ? (
              <EmptyState title="Inga produkter hittades" />
            ) : (
              productSections.map((section) => (
                <div key={section.id} className="grid gap-1.5">
                  <p className="px-1 pt-2 text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">{section.name}</p>
                  {section.products.map((product, productIndex) => (
                    <ProductRow
                      key={product.id}
                      product={product}
                      index={productIndex}
                      total={section.products.length}
                      busy={reorderBusy}
                      canReorder
                      selected={selectedIds.has(product.id)}
                      onToggleSelect={() => toggleSelected(product.id)}
                      onOpen={() => { setActiveProduct(product); setProductModalOpen(true); }}
                      onMove={(direction) => void moveProduct(section.products, productIndex, direction)}
                      onDuplicate={() => void handleDuplicateProduct(product.id)}
                    />
                  ))}
                </div>
              ))
            )}
          </div>
        ) : null}

        {tab === "extras" ? (
          <div className="mt-5 grid gap-2">
            {filteredGroups.length === 0 ? <EmptyState title="Inga tillvalsgrupper hittades" /> : filteredGroups.map((group) => (
              <div key={group.id} className="surface-muted flex w-full items-start gap-3 px-5 py-5">
                <button type="button" onClick={() => { setActiveGroup(group); setGroupModalOpen(true); }} className="min-w-0 flex-1 text-left">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-base font-semibold tracking-[-0.01em]">{group.name}</p>
                        <Badge tone="neutral">{group.type}</Badge>
                        {group.required ? <Badge tone="neutral">Obligatorisk</Badge> : null}
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {group.extras.map((extra, index) => <Badge key={`${group.id}-${index}`} tone="neutral">{extra.name} {extra.priceAddon ? `+ ${formatCurrency(extra.priceAddon)}` : ""}</Badge>)}
                      </div>
                    </div>
                    <div className="text-right text-sm text-[var(--text-secondary)]">
                      <div>Min {group.minSelections}</div>
                      <div>Max {group.maxSelections}</div>
                      <div>{group._count?.productGroups || 0} kopplade produkter</div>
                    </div>
                  </div>
                </button>
                <Button variant="secondary" disabled={reorderBusy} onClick={() => void handleDuplicateGroup(group.id)}>
                  <Copy size={13} /> Duplicera
                </Button>
              </div>
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
