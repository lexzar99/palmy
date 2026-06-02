"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Search, Tags } from "lucide-react";
import { dealsQueryKey, getAutomaticDeals, type AutomaticDealRecord, type DealProductRef, type DealRestaurantRef } from "@/modules/deals/api";
import { AutomaticDealModal } from "@/modules/deals/components/automatic-deal-modal";
import {
  copyCategory,
  copyExtraGroup,
  copyProduct,
  createCategory,
  createExtraGroup,
  createMainCategory,
  createProduct,
  deleteCategory,
  deleteExtraGroup,
  deleteMainCategory,
  deleteProduct,
  getCategories,
  getExtraGroups,
  getMainCategories,
  getMenuRestaurants,
  getProducts,
  menuCategoriesQueryKey,
  menuGroupsQueryKey,
  menuMainCategoriesQueryKey,
  menuProductsQueryKey,
  menuRestaurantsQueryKey,
  r2AutoMatch,
  r2Migrate,
  r2PathsTemplate,
  updateCategory,
  updateExtraGroup,
  updateMainCategory,
  updateProduct,
  updateRestaurant,
  type CategoryRecord,
  type ExtraGroupRecord,
  type MainCategoryRecord,
  type ProductRecord,
  type R2AutoMatchResult,
  type R2MigrateResult,
  type R2PathsTemplate,
  type RestaurantRef,
} from "@/modules/menu/api";
import { Badge, Button, EmptyState, ErrorPanel, Field, Input, Modal, PageHeader, Select, Surface, Tabs, Textarea } from "@/shared/components/ui";
import { CityRestaurantPicker } from "@/shared/components/city-restaurant-picker";
import { ImageUploadField } from "@/shared/components/image-upload";
import { useToast } from "@/shared/components/toast";
import { Copy } from "lucide-react";
import { formatCurrency } from "@/shared/utils/format";

type MenuTab = "main-categories" | "categories" | "products" | "extras";

function MainCategoryModal({
  open,
  restaurantId,
  mainCategory,
  categories,
  onClose,
}: {
  open: boolean;
  restaurantId: string;
  mainCategory: MainCategoryRecord | null;
  categories: CategoryRecord[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ name: "", imageUrl: "", position: 0, isActive: true, categoryIds: [] as string[] });

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!open) return;
    if (mainCategory) {
      setForm({
        name: mainCategory.name,
        imageUrl: mainCategory.imageUrl || "",
        position: mainCategory.position,
        isActive: mainCategory.isActive ?? true,
        categoryIds: (mainCategory.categories || []).map((c) => c.id),
      });
    } else {
      setForm({ name: "", imageUrl: "", position: 0, isActive: true, categoryIds: [] });
    }
  }, [mainCategory, open]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const saveMutation = useMutation({ meta: { toast: false },
    mutationFn: async () => {
      if (mainCategory) {
        return updateMainCategory(mainCategory.id, form);
      }
      return createMainCategory({ ...form, restaurantId });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: menuMainCategoriesQueryKey(restaurantId) });
      await queryClient.invalidateQueries({ queryKey: menuCategoriesQueryKey(restaurantId) });
      onClose();
    },
  });

  const deleteMutation = useMutation({ meta: { toast: false },
    mutationFn: async () => {
      if (mainCategory) {
        await deleteMainCategory(mainCategory.id);
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: menuMainCategoriesQueryKey(restaurantId) });
      await queryClient.invalidateQueries({ queryKey: menuCategoriesQueryKey(restaurantId) });
      onClose();
    },
  });

  const toggleCategory = (categoryId: string) =>
    setForm((current) => ({
      ...current,
      categoryIds: current.categoryIds.includes(categoryId)
        ? current.categoryIds.filter((id) => id !== categoryId)
        : [...current.categoryIds, categoryId],
    }));

  // Kategorier som redan är knutna till en ANNAN huvudkategori — vi varnar admin
  // så bytet inte sker oavsiktligt. (Vi tillåter det fortfarande — formuläret
  // skriver över relationen.)
  const ownerOfCategory = (categoryId: string) => {
    const cat = categories.find((c) => c.id === categoryId);
    return cat?.mainCategoryId && cat.mainCategoryId !== mainCategory?.id ? cat.mainCategory?.name || "annan" : null;
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={mainCategory ? "Edit main category" : "New main category"}
      description="Topplagret som kunden ser i menyn. Bilden visas direkt; namnet är bara för dig (sök, debug)."
      footer={
        <div className="flex items-center justify-between gap-3">
          <div>
            {mainCategory ? (
              <Button
                variant="danger"
                onClick={() => {
                  if (window.confirm(`Radera huvudkategorin "${mainCategory.name}"?\n\nUnderkategorierna behålls men kopplas loss från denna huvudkategori.`)) {
                    deleteMutation.mutate();
                  }
                }}
              >Delete</Button>
            ) : null}
          </div>
          <div className="flex gap-2">
            <Button onClick={onClose}>Close</Button>
            <Button variant="primary" onClick={() => saveMutation.mutate()}>{saveMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : "Save"}</Button>
          </div>
        </div>
      }
    >
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Name (intern — visas inte i appen)">
          <Input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} />
        </Field>
        <Field label="Position">
          <Input type="number" value={form.position} onChange={(event) => setForm((current) => ({ ...current, position: Number(event.target.value) }))} />
        </Field>
        <div className="md:col-span-2">
          <ImageUploadField
            label="Tile-bild (16:9 eller 1:1 rekommenderas, designad bild med inbakad text)"
            value={form.imageUrl}
            onChange={(url) => setForm((current) => ({ ...current, imageUrl: url }))}
            kind="main-category"
            restaurantId={restaurantId}
            categoryId={mainCategory?.id || null}
          />
        </div>
        <Field label="Status">
          <Select value={form.isActive ? "active" : "inactive"} onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.value === "active" }))}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </Select>
        </Field>
        <div className="md:col-span-2 surface-muted px-4 py-4">
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">Underkategorier i denna huvudkategori</p>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">Klicka för att lägga till/ta bort. En kategori kan bara tillhöra en huvudkategori i taget.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {categories.length === 0 ? (
              <p className="text-sm text-[var(--text-muted)]">Inga kategorier finns för denna restaurang än.</p>
            ) : (
              categories.map((category) => {
                const otherOwner = ownerOfCategory(category.id);
                const selected = form.categoryIds.includes(category.id);
                return (
                  <button
                    key={category.id}
                    type="button"
                    onClick={() => toggleCategory(category.id)}
                    className={`rounded-full border px-4 py-2 text-[11px] font-black uppercase tracking-[0.16em] transition-colors ${selected ? "border-[rgba(94,166,255,0.24)] bg-[rgba(94,166,255,0.1)] text-[#d4e7ff]" : "border-[var(--border-subtle)] text-[var(--text-secondary)]"}`}
                    title={otherOwner ? `Är i "${otherOwner}" — sparar du flyttar den hit` : undefined}
                  >
                    {category.name}{otherOwner ? " ↩" : ""}
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}

function CategoryModal({ open, restaurantId, category, mainCategories, onClose }: { open: boolean; restaurantId: string; category: CategoryRecord | null; mainCategories: MainCategoryRecord[]; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ name: "", description: "", imageUrl: "", position: 0, isActive: true, mainCategoryId: "" });

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!open) return;
    setForm(category ? { name: category.name, description: category.description || "", imageUrl: category.imageUrl || "", position: category.position, isActive: category.isActive ?? true, mainCategoryId: category.mainCategoryId || "" } : { name: "", description: "", imageUrl: "", position: 0, isActive: true, mainCategoryId: "" });
  }, [category, open]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const saveMutation = useMutation({ meta: { toast: false },
    mutationFn: async () => {
      const payload = { ...form, mainCategoryId: form.mainCategoryId || null };
      if (category) {
        return updateCategory(category.id, payload);
      }
      return createCategory({ ...payload, restaurantId });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: menuCategoriesQueryKey(restaurantId) });
      await queryClient.invalidateQueries({ queryKey: menuMainCategoriesQueryKey(restaurantId) });
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
      await queryClient.invalidateQueries({ queryKey: menuMainCategoriesQueryKey(restaurantId) });
      onClose();
    },
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={category ? "Edit category" : "New category"}
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
            >Delete</Button>
          ) : null}</div>
          <div className="flex gap-2"><Button onClick={onClose}>Close</Button><Button variant="primary" onClick={() => saveMutation.mutate()}>{saveMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : "Save"}</Button></div>
        </div>
      }
    >
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Name"><Input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} /></Field>
        <Field label="Position"><Input type="number" value={form.position} onChange={(event) => setForm((current) => ({ ...current, position: Number(event.target.value) }))} /></Field>
        <ImageUploadField
          label="Bild"
          value={form.imageUrl}
          onChange={(url) => setForm((current) => ({ ...current, imageUrl: url }))}
          kind="main-category"
          restaurantId={restaurantId}
          categoryId={category?.id || null}
        />
        <Field label="Status"><Select value={form.isActive ? "active" : "inactive"} onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.value === "active" }))}><option value="active">Active</option><option value="inactive">Inactive</option></Select></Field>
        <div className="md:col-span-2">
          <Field label="Huvudkategori (topplager i kund-appen)">
            <Select value={form.mainCategoryId} onChange={(event) => setForm((current) => ({ ...current, mainCategoryId: event.target.value }))}>
              <option value="">— Ingen (hamnar i &ldquo;Övrigt&rdquo; tills tilldelad) —</option>
              {mainCategories.map((mc) => (
                <option key={mc.id} value={mc.id}>{mc.name}</option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="md:col-span-2"><Field label="Description"><Textarea value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} /></Field></div>
      </div>
    </Modal>
  );
}

function ProductModal({ open, restaurantId, product, categories, extraGroups, existingDeals, restaurants, products, onClose }: { open: boolean; restaurantId: string; product: ProductRecord | null; categories: CategoryRecord[]; extraGroups: ExtraGroupRecord[]; existingDeals: AutomaticDealRecord[]; restaurants: DealRestaurantRef[]; products: DealProductRef[]; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ name: "", description: "", price: 0, categoryId: "", imageUrl: "", isActive: true, isVegan: false, isVegetarian: false, isGlutenFree: false, position: 0, displayMode: "FULL" as "FULL" | "COMPACT", hideDescription: false, extraGroupIds: [] as string[] });
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
            extraGroupIds: [],
          },
    );
  }, [categories, open, product]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const saveMutation = useMutation({ meta: { toast: false },
    mutationFn: async () => {
      const payload = { ...form, restaurantId };
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
      title={product ? "Edit product" : "New product"}
      footer={<div className="flex items-center justify-between gap-3"><div>{product ? (
        <Button
          variant="danger"
          onClick={() => {
            if (window.confirm(`Radera produkten "${product.name}"?\n\nProdukten försvinner från menyn. Befintliga ordrar påverkas inte. Detta kan inte ångras.`)) {
              deleteMutation.mutate();
            }
          }}
        >Delete</Button>
      ) : null}</div><div className="flex gap-2"><Button onClick={onClose}>Close</Button><Button variant="primary" onClick={() => saveMutation.mutate()}>{saveMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : "Save"}</Button></div></div>}
    >
        <div className="grid gap-4 md:grid-cols-2">
        <Field label="Name"><Input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} /></Field>
        <Field label="Price"><Input type="number" value={form.price} onChange={(event) => setForm((current) => ({ ...current, price: Number(event.target.value) }))} /></Field>
        <Field label="Category"><Select value={form.categoryId} onChange={(event) => setForm((current) => ({ ...current, categoryId: event.target.value }))}>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</Select></Field>
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
        <Field label="Status"><Select value={form.isActive ? "active" : "inactive"} onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.value === "active" }))}><option value="active">Active</option><option value="inactive">Inactive</option></Select></Field>
        <div className="md:col-span-2"><Field label="Description"><Textarea value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} /></Field></div>
        <div className="md:col-span-2 surface-muted px-4 py-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">Promotion shortcut</p>
              <p className="mt-2 text-sm text-[var(--text-secondary)]">Products no longer own discount logic. Use Deals as the source of truth and open a product-specific deal from here when needed.</p>
            </div>
            <Button variant="secondary" onClick={() => setPromotionModalOpen(true)} disabled={!product}>{productDeal ? "Edit product deal" : "Create product deal"}</Button>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {product ? (productDeal ? <Badge tone="warning">Direct product deal</Badge> : <Badge tone="neutral">No direct product deal</Badge>) : <Badge tone="neutral">Save the product first</Badge>}
            {relatedCategoryDeals.length > 0 ? <Badge tone="info">{relatedCategoryDeals.length} category deal(s) apply</Badge> : null}
            {restaurantWideDeals.length > 0 ? <Badge tone="neutral">{restaurantWideDeals.length} restaurant-wide deal(s)</Badge> : null}
          </div>
        </div>
        <div className="md:col-span-2 surface-muted px-4 py-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">Visningsläge i menyn</p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {(["FULL", "COMPACT"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setForm((current) => ({ ...current, displayMode: mode }))}
                className={`rounded-lg border px-3.5 py-2 text-[12px] font-semibold transition-colors ${form.displayMode === mode ? "border-transparent bg-[var(--accent-soft)] text-[var(--accent)]" : "border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"}`}
              >
                {mode === "FULL" ? "Full bredd (1-per-rad)" : "Halv bredd (2-per-rad)"}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setForm((current) => ({ ...current, hideDescription: !current.hideDescription }))}
              className={`rounded-lg border px-3.5 py-2 text-[12px] font-semibold transition-colors ${form.hideDescription ? "border-transparent bg-[var(--accent-soft)] text-[var(--accent)]" : "border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"}`}
            >
              Dölj beskrivning i menyn
            </button>
          </div>
        </div>
        <div className="md:col-span-2 surface-muted px-4 py-4">
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">Dietary flags</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {[
              ["isVegan", "Vegan"],
              ["isVegetarian", "Vegetarian"],
              ["isGlutenFree", "Gluten free"],
            ].map(([key, label]) => (
              <button key={key} type="button" onClick={() => setForm((current) => ({ ...current, [key]: !current[key as keyof typeof current] }))} className={`rounded-lg border px-3.5 py-2 text-[12px] font-semibold transition-colors ${form[key as keyof typeof form] ? "border-transparent bg-[var(--accent-soft)] text-[var(--accent)]" : "border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"}`}>{label}</button>
            ))}
          </div>
        </div>
        <div className="md:col-span-2 surface-muted px-4 py-4">
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">Extra groups</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {extraGroups.map((group) => (
              <button key={group.id} type="button" onClick={() => toggleExtraGroup(group.id)} className={`rounded-full border px-4 py-2 text-[11px] font-black uppercase tracking-[0.16em] ${form.extraGroupIds.includes(group.id) ? "border-[rgba(94,166,255,0.24)] bg-[rgba(94,166,255,0.1)] text-[#d4e7ff]" : "border-[var(--border-subtle)] text-[var(--text-secondary)]"}`}>{group.name}</button>
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

function ExtraGroupModal({ open, restaurantId, group, categories, onClose }: { open: boolean; restaurantId: string; group: ExtraGroupRecord | null; categories: CategoryRecord[]; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [type, setType] = useState("CHECKBOX");
  const [required, setRequired] = useState(false);
  const [minSelections, setMinSelections] = useState(0);
  const [maxSelections, setMaxSelections] = useState(1);
  const [extras, setExtras] = useState<Array<{ name: string; priceAddon: number; isDefault: boolean }>>([{ name: "", priceAddon: 0, isDefault: false }]);
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
      setExtras(group.extras.length ? group.extras.map((extra) => ({ name: extra.name, priceAddon: extra.priceAddon, isDefault: extra.isDefault || false })) : [{ name: "", priceAddon: 0, isDefault: false }]);
      setCategoryIds([]);
    } else {
      setName("");
      setType("CHECKBOX");
      setRequired(false);
      setMinSelections(0);
      setMaxSelections(1);
      setExtras([{ name: "", priceAddon: 0, isDefault: false }]);
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
        restaurantId,
        categoryIds,
        extras: extras.filter((extra) => extra.name.trim()).map((extra) => ({ ...extra, priceAddon: Number(extra.priceAddon || 0) })),
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

  const updateExtra = (index: number, field: "name" | "priceAddon" | "isDefault", value: string | number | boolean) => {
    setExtras((current) => current.map((extra, currentIndex) => (currentIndex === index ? { ...extra, [field]: value } : extra)));
  };

  const toggleCategory = (categoryId: string) => setCategoryIds((current) => current.includes(categoryId) ? current.filter((id) => id !== categoryId) : [...current, categoryId]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={group ? "Edit extra group" : "New extra group"}
      footer={<div className="flex items-center justify-between gap-3"><div>{group ? (
        <Button
          variant="danger"
          onClick={() => {
            if (window.confirm(`Radera tillvalsgruppen "${group.name}"?\n\nProdukter som använder gruppen tappar dessa tillval. Detta kan inte ångras.`)) {
              deleteMutation.mutate();
            }
          }}
        >Delete</Button>
      ) : null}</div><div className="flex gap-2"><Button onClick={onClose}>Close</Button><Button variant="primary" onClick={() => saveMutation.mutate()}>{saveMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : "Save"}</Button></div></div>}
    >
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Name"><Input value={name} onChange={(event) => setName(event.target.value)} /></Field>
        <Field label="Type"><Select value={type} onChange={(event) => setType(event.target.value)}><option value="CHECKBOX">Checkbox</option><option value="RADIO">Radio</option></Select></Field>
        <Field label="Required"><Select value={required ? "yes" : "no"} onChange={(event) => setRequired(event.target.value === "yes")}><option value="no">No</option><option value="yes">Yes</option></Select></Field>
        <Field label="Min selections"><Input type="number" value={minSelections} onChange={(event) => setMinSelections(Number(event.target.value))} /></Field>
        <Field label="Max selections"><Input type="number" value={maxSelections} onChange={(event) => setMaxSelections(Number(event.target.value))} /></Field>
        <div className="md:col-span-2 surface-muted px-4 py-4">
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">Attach to categories</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {categories.map((category) => (
              <button key={category.id} type="button" onClick={() => toggleCategory(category.id)} className={`rounded-full border px-4 py-2 text-[11px] font-black uppercase tracking-[0.16em] ${categoryIds.includes(category.id) ? "border-[rgba(94,166,255,0.24)] bg-[rgba(94,166,255,0.1)] text-[#d4e7ff]" : "border-[var(--border-subtle)] text-[var(--text-secondary)]"}`}>{category.name}</button>
            ))}
          </div>
        </div>
        <div className="md:col-span-2 surface-muted px-4 py-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">Extras</p>
            <Button variant="secondary" onClick={() => setExtras((current) => [...current, { name: "", priceAddon: 0, isDefault: false }])}>Add row</Button>
          </div>
          <div className="mt-4 grid gap-3">
            {extras.map((extra, index) => (
              <div key={index} className="grid gap-3 rounded-2xl border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] px-4 py-4 md:grid-cols-[1fr_140px_140px_auto]">
                <Input value={extra.name} onChange={(event) => updateExtra(index, "name", event.target.value)} placeholder="Extra name" />
                <Input type="number" value={extra.priceAddon} onChange={(event) => updateExtra(index, "priceAddon", Number(event.target.value))} placeholder="0" />
                <Select value={extra.isDefault ? "yes" : "no"} onChange={(event) => updateExtra(index, "isDefault", event.target.value === "yes")}><option value="no">Optional</option><option value="yes">Default</option></Select>
                <Button variant="danger" onClick={() => setExtras((current) => current.filter((_, currentIndex) => currentIndex !== index))}>Remove</Button>
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
      description="Källan rörs inte. Kopian får nytt id i din restaurang."
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

/**
 * R2 Migrate-knapp: triggar migration från Cloudinary → R2 SERVER-SIDE.
 * Använder Railway-env-varsen så admin inte behöver hantera secrets själv.
 * Default = dry-run; admin ser exempel + statistik innan confirm.
 */
function R2MigrateButton() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [dryRun, setDryRun] = useState<R2MigrateResult | null>(null);
  const [liveResult, setLiveResult] = useState<R2MigrateResult | null>(null);

  const extractError = (e: any): string => {
    if (e?.code === 'ECONNABORTED' || /timeout/i.test(e?.message || '')) {
      return 'Tidsgränsen för request:en passerades. Migrationen kan ha startat på servern — kontrollera resultatet om en stund.';
    }
    if (e?.response?.status === 401 || e?.response?.status === 403) {
      return 'Saknar behörighet — logga in som superadmin.';
    }
    if (e?.response?.status === 503) {
      return e?.response?.data?.error || 'R2 är inte konfigurerat på servern.';
    }
    if (e?.response?.data?.error) return e.response.data.error;
    if (e?.message) return e.message;
    return 'Okänt fel — kolla nätverk eller serverloggar.';
  };

  const dryMutation = useMutation({ meta: { toast: false },
    mutationFn: () => r2Migrate({ apply: false }),
    onSuccess: (data) => {
      setDryRun(data);
      setLiveResult(null);
      setOpen(true);
      if (!data.configured) {
        showToast({ type: 'error', message: 'R2 är inte konfigurerat på servern' });
      }
    },
    onError: (e) => {
      showToast({ type: 'error', message: `Dry-run misslyckades: ${extractError(e)}` });
    },
  });

  const applyMutation = useMutation({ meta: { toast: false },
    mutationFn: () => r2Migrate({ apply: true }),
    onSuccess: async (data) => {
      setLiveResult(data);
      // Cache invalidation — alla bild-URL:er har bytts i DB
      await queryClient.invalidateQueries({ queryKey: ["menu"] });
      showToast({
        type: data.failed > 0 ? 'info' : 'success',
        message: `Migration klar: ${data.migrated} flyttade, ${data.failed} fel`,
      });
    },
    onError: (e) => {
      showToast({ type: 'error', message: `Migration misslyckades: ${extractError(e)}` });
    },
  });

  const error = (dryMutation.error as any)?.response?.data?.error || (applyMutation.error as any)?.response?.data?.error;
  const isApplying = applyMutation.isPending;
  const finalResult = liveResult || dryRun;

  return (
    <>
      <Button variant="secondary" onClick={() => dryMutation.mutate()} disabled={dryMutation.isPending}>
        {dryMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : null}
        Migrera till R2
      </Button>

      <Modal
        open={open && !!finalResult}
        onClose={() => { if (!isApplying) { setOpen(false); setDryRun(null); setLiveResult(null); } }}
        title={liveResult ? "Migration klar" : "R2-migration (dry-run)"}
        description={
          liveResult
            ? "Bilder har flyttats till R2 och databasen uppdaterad. Cloudinary-originalen rörs inte (du kan radera dem manuellt senare när du verifierat allt funkar)."
            : "Skannar alla rader med imageUrl. Inget skrivs till databasen än — klicka Apply för att köra på riktigt."
        }
        footer={
          <div className="flex justify-end gap-2">
            <Button onClick={() => { if (!isApplying) { setOpen(false); setDryRun(null); setLiveResult(null); } }} disabled={isApplying}>
              {liveResult ? "Stäng" : "Avbryt"}
            </Button>
            {!liveResult ? (
              <Button variant="primary" onClick={() => applyMutation.mutate()} disabled={isApplying || !finalResult || finalResult.migrated === 0}>
                {isApplying ? <Loader2 size={14} className="animate-spin" /> : null}
                {isApplying ? "Migrerar…" : `Migrera ${finalResult?.migrated || 0} bilder`}
              </Button>
            ) : null}
          </div>
        }
      >
        {finalResult ? (
          <div className="grid gap-4">
            {!finalResult.configured ? (
              <div className="surface-muted px-4 py-3 text-sm text-rose-400">
                R2 är inte konfigurerat på servern. Sätt R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET och R2_PUBLIC_BASE_URL på Railway och redeploy.
              </div>
            ) : null}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              <div className="surface-muted px-3 py-3 text-center">
                <div className="text-2xl font-black">{finalResult.scanned}</div>
                <div className="mt-1 text-[10px] uppercase tracking-widest text-[var(--text-secondary)]">Skannade</div>
              </div>
              <div className="surface-muted px-3 py-3 text-center">
                <div className="text-2xl font-black">{finalResult.migrated}</div>
                <div className="mt-1 text-[10px] uppercase tracking-widest text-[var(--text-secondary)]">{liveResult ? "Migrerade" : "Kommer migreras"}</div>
              </div>
              <div className="surface-muted px-3 py-3 text-center">
                <div className="text-2xl font-black">{finalResult.alreadyR2}</div>
                <div className="mt-1 text-[10px] uppercase tracking-widest text-[var(--text-secondary)]">Redan i R2</div>
              </div>
              <div className="surface-muted px-3 py-3 text-center">
                <div className="text-2xl font-black">{finalResult.skippedNoUrl}</div>
                <div className="mt-1 text-[10px] uppercase tracking-widest text-[var(--text-secondary)]">Saknar URL</div>
              </div>
              <div className="surface-muted px-3 py-3 text-center">
                <div className={`text-2xl font-black ${finalResult.failed > 0 ? "text-rose-400" : ""}`}>{finalResult.failed}</div>
                <div className="mt-1 text-[10px] uppercase tracking-widest text-[var(--text-secondary)]">Misslyckade</div>
              </div>
            </div>
            {finalResult.migratedExamples.length > 0 ? (
              <div>
                <p className="mb-2 text-[11px] font-black uppercase tracking-widest text-[var(--text-muted)]">
                  {liveResult ? "Exempel på vad som flyttades" : "Exempel på vad som KOMMER flyttas"}
                </p>
                <div className="surface-muted max-h-64 overflow-y-auto px-3 py-2 text-xs">
                  {finalResult.migratedExamples.map((u, i) => (
                    <div key={i} className="border-b border-[var(--border-subtle)] py-1.5 last:border-b-0">
                      <div className="font-semibold">{u.label}</div>
                      <code className="break-all text-[10px] text-[var(--text-muted)]">→ {u.to}</code>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            {finalResult.failedExamples.length > 0 ? (
              <div>
                <p className="mb-2 text-[11px] font-black uppercase tracking-widest text-rose-400">Misslyckade nedladdningar</p>
                <div className="surface-muted max-h-56 overflow-y-auto px-3 py-2 text-xs">
                  {finalResult.failedExamples.map((f, i) => (
                    <div key={i} className="border-b border-[var(--border-subtle)] py-2 last:border-b-0">
                      <div className="font-semibold">{f.label}</div>
                      <code className="mt-0.5 block break-all text-[10px] text-rose-400">{f.error}</code>
                      <a
                        href={f.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-0.5 block break-all text-[10px] text-[var(--text-muted)] hover:underline"
                      >
                        {f.url}
                      </a>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            {error ? <p className="text-sm text-rose-400">{error}</p> : null}
          </div>
        ) : null}
      </Modal>
    </>
  );
}

/**
 * R2 Auto-match-knapp: scannar Cloudflare R2-bucketen för restaurangen och
 * binder automatiskt bilder till produkter/kategorier/main-categories baserat
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
      await queryClient.invalidateQueries({ queryKey: menuMainCategoriesQueryKey(restaurantId) });
      await queryClient.invalidateQueries({ queryKey: menuCategoriesQueryKey(restaurantId) });
      setOpen(false);
      setDryRun(null);
      const total = (data.matched.hero ? 1 : 0) + (data.matched.logo ? 1 : 0) + data.matched.mainCategories + data.matched.products;
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
        description="Scannar bucket-prefixet och föreslår vilka bilder som ska kopplas till produkter, kategorier och main-categories baserat på slug-konventionen."
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
                <div className="text-2xl font-black">{dryRun.matched.mainCategories}</div>
                <div className="mt-1 text-[10px] uppercase tracking-widest text-[var(--text-secondary)]">Main cats</div>
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
              <p className="text-sm text-[var(--text-secondary)]">Inga matchningar hittades. Kontrollera att bilderna ligger under prefixet ovan med rätt slug-namn.</p>
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
        description="Per sektion: kopiera mappen, döp dina filer enligt listan, dra in i R2-dashboarden. Klicka sen 'Matcha bilder från R2' så uppdateras databasen."
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
                  {query.data.mainCategories.length} main · {query.data.categories.length} kategorier · {totalProducts} produkter
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

            {query.data.mainCategories.length ? (
              <_R2Section
                title={`Main-kategorier (${query.data.mainCategories.length})`}
                folder={`${query.data.prefix}main/`}
                rows={query.data.mainCategories.map((mc) => ({ filename: basenameOf(mc.key), label: mc.name }))}
                onCopy={copyToClipboard}
              />
            ) : null}

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

export function MenuPage() {
  const searchParams = useSearchParams();
  const [activeRestaurantId, setActiveRestaurantId] = useState<string | null>(null);
  const [pendingRouteProductId, setPendingRouteProductId] = useState<string | null>(null);
  const [tab, setTab] = useState<MenuTab>("main-categories");
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<CategoryRecord | null>(null);
  const [activeProduct, setActiveProduct] = useState<ProductRecord | null>(null);
  const [activeGroup, setActiveGroup] = useState<ExtraGroupRecord | null>(null);
  const [activeMainCategory, setActiveMainCategory] = useState<MainCategoryRecord | null>(null);
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [productModalOpen, setProductModalOpen] = useState(false);
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [mainCategoryModalOpen, setMainCategoryModalOpen] = useState(false);

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
  const mainCategories = useQuery({ queryKey: menuMainCategoriesQueryKey(activeRestaurantId), queryFn: () => getMainCategories(activeRestaurantId!), enabled: Boolean(activeRestaurantId) });

  const selectedRestaurant = restaurants.data?.find((restaurant) => restaurant.id === activeRestaurantId) || null;

  // Erbjudande-tilens bild lagras på restaurangen (offersImageUrl). Tilen i
  // kund-menyn genereras automatiskt från rabatterade produkter; här väljer
  // admin dess bild precis som för vanliga huvudkategorier.
  const menuQueryClient = useQueryClient();
  const { showToast: showMenuToast } = useToast();
  const offersImageMutation = useMutation({
    mutationFn: (offersImageUrl: string | null) => updateRestaurant(activeRestaurantId!, { offersImageUrl }),
    onMutate: (offersImageUrl: string | null) => {
      // Optimistisk uppdatering så bilden syns direkt i fältet.
      menuQueryClient.setQueryData<RestaurantRef[]>(menuRestaurantsQueryKey, (prev) =>
        (prev || []).map((r) => (r.id === activeRestaurantId ? { ...r, offersImageUrl } : r)),
      );
    },
    onSuccess: async () => {
      await menuQueryClient.invalidateQueries({ queryKey: menuRestaurantsQueryKey });
      showMenuToast({ type: "success", message: "Erbjudande-bild sparad" });
    },
    onError: () => showMenuToast({ type: "error", message: "Kunde inte spara erbjudande-bilden" }),
  });

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

  const filteredMainCategories = useMemo(() => {
    const lowerQuery = query.trim().toLowerCase();
    return (mainCategories.data || []).filter((mc) => !lowerQuery || mc.name.toLowerCase().includes(lowerQuery));
  }, [mainCategories.data, query]);

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
    return <Surface className="px-6 py-12 text-sm text-[var(--text-secondary)]">Loading menu module...</Surface>;
  }

  if (restaurants.isError || !restaurants.data) {
    return <ErrorPanel title="Menu module could not be loaded" description="The restaurant list for menu operations is unavailable." action={<Button onClick={() => void restaurants.refetch()}>Retry</Button>} />;
  }

  return (
    <div className="page-stack">
      <PageHeader
        title="Menu"
        actions={
          <>
            <R2MigrateButton />
            {activeRestaurantId ? (
              <>
                <R2PathsButton restaurantId={activeRestaurantId} />
                <R2AutoMatchButton restaurantId={activeRestaurantId} />
              </>
            ) : null}
            {activeRestaurantId && tab !== "main-categories" ? (
              <Button variant="secondary" onClick={() => setImportModalOpen(true)}>
                <Copy size={14} /> Importera från annan
              </Button>
            ) : null}
            {tab === "main-categories" && activeRestaurantId ? (
              <Button variant="primary" onClick={() => { setActiveMainCategory(null); setMainCategoryModalOpen(true); }}>
                <Plus size={14} /> Main category
              </Button>
            ) : null}
            {tab === "categories" && activeRestaurantId ? (
              <Button variant="primary" onClick={() => { setActiveCategory(null); setCategoryModalOpen(true); }}>
                <Plus size={14} /> Category
              </Button>
            ) : null}
            {tab === "products" && activeRestaurantId ? (
              <Button variant="primary" onClick={() => { setActiveProduct(null); setProductModalOpen(true); }}>
                <Plus size={14} /> Product
              </Button>
            ) : null}
            {tab === "extras" && activeRestaurantId ? (
              <Button variant="primary" onClick={() => { setActiveGroup(null); setGroupModalOpen(true); }}>
                <Tags size={14} /> Extra group
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
            <Input className="pl-10" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter..." />
          </div>
          <Tabs value={tab} onChange={setTab} options={[{ value: "main-categories", label: "Main categories" }, { value: "categories", label: "Categories" }, { value: "products", label: "Products" }, { value: "extras", label: "Extras" }]} />
        </div>

        {tab === "main-categories" ? (
          <div className="mt-5 grid gap-2">
            {activeRestaurantId ? (
              <Surface className="px-5 py-5">
                <div className="flex flex-col gap-1">
                  <p className="text-sm font-black uppercase tracking-[-0.01em]">Erbjudande-tile</p>
                  <p className="text-xs text-[var(--text-secondary)]">
                    Bild för den automatiska &quot;Erbjudanden&quot;-rutan i kund-menyns kategori-väljare.
                    Rutan visas när restaurangen har rabatterade produkter — välj dess bild här,
                    precis som för en vanlig huvudkategori.
                  </p>
                </div>
                <div className="mt-3 flex items-start gap-4">
                  {selectedRestaurant?.offersImageUrl ? (
                    <img src={selectedRestaurant.offersImageUrl} alt="" className="h-20 w-32 flex-shrink-0 rounded-lg object-cover" />
                  ) : (
                    <div className="flex h-20 w-32 flex-shrink-0 items-center justify-center rounded-lg bg-[rgba(255,255,255,0.05)] text-[10px] uppercase tracking-widest text-[var(--text-muted)]">
                      Ingen bild
                    </div>
                  )}
                  <div className="max-w-xs flex-1">
                    <ImageUploadField
                      label="Erbjudande-bild (16:9 eller 1:1, designad bild med inbakad text)"
                      value={selectedRestaurant?.offersImageUrl || ""}
                      onChange={(url) => offersImageMutation.mutate(url || null)}
                      // Erbjudande-tilen är virtuell (ingen kategori-rad) → använd
                      // "misc" som inte kräver kategori-slug. Bilden lagras per
                      // restaurang via restaurantId och URL:en sparas i offersImageUrl.
                      kind="misc"
                      restaurantId={activeRestaurantId}
                    />
                    {selectedRestaurant?.offersImageUrl ? (
                      <button
                        type="button"
                        onClick={() => offersImageMutation.mutate(null)}
                        className="mt-2 text-[11px] font-bold uppercase tracking-wide text-[var(--text-muted)] hover:text-[#f87171]"
                      >
                        Ta bort bild
                      </button>
                    ) : null}
                  </div>
                </div>
              </Surface>
            ) : null}
            {filteredMainCategories.length === 0 ? (
              <EmptyState title="No main categories yet" />
            ) : filteredMainCategories.map((mc) => {
              const catCount = mc._count?.categories ?? (mc.categories?.length || 0);
              const productCount = (mc.categories || []).reduce((sum, c) => sum + (c._count?.products || 0), 0);
              return (
                <button key={mc.id} type="button" onClick={() => { setActiveMainCategory(mc); setMainCategoryModalOpen(true); }} className="surface-muted w-full px-5 py-5 text-left">
                  <div className="flex items-start gap-4">
                    {mc.imageUrl ? (
                      <img src={mc.imageUrl} alt="" className="h-20 w-32 flex-shrink-0 rounded-lg object-cover" />
                    ) : (
                      <div className="flex h-20 w-32 flex-shrink-0 items-center justify-center rounded-lg bg-[rgba(255,255,255,0.05)] text-[10px] uppercase tracking-widest text-[var(--text-muted)]">
                        Ingen bild
                      </div>
                    )}
                    <div className="flex flex-1 items-start justify-between gap-4">
                      <div>
                        <p className="text-lg font-black tracking-[-0.02em]">{mc.name}</p>
                        <p className="mt-2 text-sm text-[var(--text-secondary)]">
                          {(mc.categories || []).slice(0, 4).map((c) => c.name).join(" • ") || "Inga kategorier kopplade än"}
                          {(mc.categories?.length || 0) > 4 ? ` + ${(mc.categories?.length || 0) - 4} till` : ""}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Badge tone={mc.isActive === false ? "danger" : "success"}>{mc.isActive === false ? "Inactive" : "Active"}</Badge>
                        <Badge tone="neutral">{catCount} kategorier</Badge>
                        <Badge tone="info">{productCount} produkter</Badge>
                        <Badge tone="neutral">Pos {mc.position}</Badge>
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        ) : null}

        {tab === "categories" ? (
          <div className="mt-5 grid gap-2">
            {filteredCategories.length === 0 ? <EmptyState title="No categories found" /> : filteredCategories.map((category) => (
              <button key={category.id} type="button" onClick={() => { setActiveCategory(category); setCategoryModalOpen(true); }} className="surface-muted w-full px-5 py-5 text-left">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-lg font-black tracking-[-0.02em]">{category.name}</p>
                    <p className="mt-2 text-sm text-[var(--text-secondary)]">{category.description || "No description"}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge tone={category.isActive === false ? "danger" : "success"}>{category.isActive === false ? "Inactive" : "Active"}</Badge>
                    <Badge tone="neutral">{category._count?.products || 0} products</Badge>
                  </div>
                </div>
              </button>
            ))}
          </div>
        ) : null}

        {tab === "products" ? (
          <div className="mt-5 grid gap-2">
            {filteredProducts.length === 0 ? <EmptyState title="No products found" /> : filteredProducts.map((product) => (
              <button key={product.id} type="button" onClick={() => { setActiveProduct(product); setProductModalOpen(true); }} className="surface-muted w-full px-5 py-5 text-left">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-lg font-black tracking-[-0.02em]">{product.name}</p>
                      <Badge tone={product.isActive === false ? "danger" : "success"}>{product.isActive === false ? "Inactive" : "Active"}</Badge>
                    </div>
                    <p className="mt-2 text-sm text-[var(--text-secondary)]">{product.category.name} • {product.description || "No description"}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {product.extraGroups.map((group) => <Badge key={group.id} tone="info">{group.name}</Badge>)}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-black">{formatCurrency(product.price)}</p>
                    <p className="mt-2 text-sm text-[var(--text-secondary)]">Position {product.position}</p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        ) : null}

        {tab === "extras" ? (
          <div className="mt-5 grid gap-2">
            {filteredGroups.length === 0 ? <EmptyState title="No extra groups found" /> : filteredGroups.map((group) => (
              <button key={group.id} type="button" onClick={() => { setActiveGroup(group); setGroupModalOpen(true); }} className="surface-muted w-full px-5 py-5 text-left">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-lg font-black tracking-[-0.02em]">{group.name}</p>
                      <Badge tone="neutral">{group.type}</Badge>
                      {group.required ? <Badge tone="warning">Required</Badge> : null}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {group.extras.map((extra, index) => <Badge key={`${group.id}-${index}`} tone="info">{extra.name} {extra.priceAddon ? `+ ${formatCurrency(extra.priceAddon)}` : ""}</Badge>)}
                    </div>
                  </div>
                  <div className="text-right text-sm text-[var(--text-secondary)]">
                    <div>Min {group.minSelections}</div>
                    <div>Max {group.maxSelections}</div>
                    <div>{group._count?.productGroups || 0} linked products</div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        ) : null}
      </Surface>

      {activeRestaurantId ? (
        <>
          <CategoryModal open={categoryModalOpen} restaurantId={activeRestaurantId} category={activeCategory} mainCategories={mainCategories.data || []} onClose={() => setCategoryModalOpen(false)} />
          <ProductModal open={productModalOpen} restaurantId={activeRestaurantId} product={activeProduct} categories={categories.data || []} extraGroups={groups.data || []} onClose={() => setProductModalOpen(false)} existingDeals={(automaticDeals.data || []).filter((deal) => deal.restaurantId === activeRestaurantId || deal.applicableRestaurantIds?.includes(activeRestaurantId) || deal.isGlobal)} restaurants={(restaurants.data || []).map((restaurant) => ({ id: restaurant.id, name: restaurant.name, slug: restaurant.slug, city: restaurant.city || null })) as DealRestaurantRef[]} products={products.data || []} />
          <ExtraGroupModal open={groupModalOpen} restaurantId={activeRestaurantId} group={activeGroup} categories={categories.data || []} onClose={() => setGroupModalOpen(false)} />
          <MainCategoryModal open={mainCategoryModalOpen} restaurantId={activeRestaurantId} mainCategory={activeMainCategory} categories={categories.data || []} onClose={() => setMainCategoryModalOpen(false)} />
          <ImportFromOtherModal
            open={importModalOpen}
            onClose={() => setImportModalOpen(false)}
            currentRestaurantId={activeRestaurantId}
            tab={tab}
            currentCategories={categories.data || []}
          />
        </>
      ) : null}
    </div>
  );
}
