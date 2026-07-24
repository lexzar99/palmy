"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronDown, ChevronRight, ChevronUp, GripVertical, Loader2, Plus, Search, Tags, Upload } from "lucide-react";
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
  PageHeader,
  PercentInput,
  Select,
  Surface,
  SwitchField,
  Tabs,
  Textarea,
  Toggle,
} from "@/shared/components/ui";
import { CityRestaurantPicker } from "@/shared/components/city-restaurant-picker";
import { ImageUploadField } from "@/shared/components/image-upload";
import { useToast } from "@/shared/components/toast";
import { Copy } from "lucide-react";
import { formatCurrency } from "@/shared/utils/format";
import { type MenuTab } from "@/modules/menu/utils";
import { DishRow, ExtraGroupRow, ProductRow, RowIconButton, StatusBadge } from "@/modules/menu/components";
import { CategoryModal, ExtraGroupModal, ImportFromOtherModal, ProductModal, BulkEditModal } from "@/modules/menu/modals";
import { MenuToolsDropdown } from "@/modules/menu/tools";



export function MenuPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedRestaurantId = searchParams.get("restaurantId");
  const requestedProductId = searchParams.get("productId");
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
  const automaticDeals = useQuery({
    queryKey: restaurantDealsQueryKey(activeRestaurantId),
    queryFn: () => getAutomaticDeals(activeRestaurantId),
    enabled: Boolean(activeRestaurantId),
  });

  useEffect(() => {
    if (!restaurants.data) return;
    if (!requestedRestaurantId) {
      setPendingRouteProductId(null);
      return;
    }

    const validatedRestaurant = restaurants.data.find((restaurant) => restaurant.id === requestedRestaurantId);
    setActiveRestaurantId(validatedRestaurant?.id ?? null);
    setPendingRouteProductId(validatedRestaurant ? requestedProductId : null);
  }, [requestedProductId, requestedRestaurantId, restaurants.data]);

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

  const activeRestaurant = restaurants.data.find((restaurant) => restaurant.id === activeRestaurantId) ?? null;
  const activeRestaurantName = activeRestaurant?.name || null;
  const routeRestaurantIsInvalid = Boolean(requestedRestaurantId && !restaurants.data.some((restaurant) => restaurant.id === requestedRestaurantId));

  const handleRestaurantChange = (restaurantId: string) => {
    const validatedRestaurantId = restaurants.data.some((restaurant) => restaurant.id === restaurantId) ? restaurantId : null;
    setActiveRestaurantId(validatedRestaurantId);
    setPendingRouteProductId(null);
    router.replace(validatedRestaurantId ? `/menu?restaurantId=${encodeURIComponent(validatedRestaurantId)}` : "/menu", { scroll: false });
  };

  return (
    <div className="page-stack">
      <PageHeader
        title="Meny"
        breadcrumb={activeRestaurantName ? `Restauranger / ${activeRestaurantName}` : "Restauranger"}
        actions={
          <>
            {activeRestaurantId ? (
              <MenuToolsDropdown restaurantId={activeRestaurantId} restaurants={restaurants.data || []} />
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
          onChange={handleRestaurantChange}
        />
        {!activeRestaurantId ? (
          <div className="mt-5">
            <EmptyState
              title={routeRestaurantIsInvalid ? "Restaurangen kunde inte väljas" : "Välj en restaurang"}
              description={routeRestaurantIsInvalid ? "Länken innehåller ett ogiltigt restaurang-id. Välj en restaurang i listan för att öppna rätt meny." : "Menyeditorn laddar ingen meny förrän du uttryckligen har valt en restaurang."}
            />
          </div>
        ) : (
          <>
        <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative flex-1">
            <Search size={14} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
            <Input className="input-with-leading-icon" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Sök i menyn..." />
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
                <CheckboxField
                  label={selectedIds.size > 0 ? `${selectedIds.size} markerade` : "Markera alla"}
                  checked={allFilteredSelected}
                  onChange={(checked) => setSelectedIds(checked ? new Set(filteredProducts.map((product) => product.id)) : new Set())}
                />
              </div>
            )}
            {selectedIds.size > 0 && (
              <div className="surface-muted sticky top-2 z-10 flex flex-wrap items-center gap-2 px-4 py-3">
                <div className="flex items-center gap-1.5">
                  <PercentInput
                    min={-100}
                    max={500}
                    step={1}
                    value={bulkPct}
                    onValueChange={setBulkPct}
                    aria-label="Prisjustering i procent"
                    placeholder="±"
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
          </>
        )}
      </Surface>

      {activeRestaurantId ? (
        <>
          <CategoryModal open={categoryModalOpen} restaurantId={activeRestaurantId} category={activeCategory} onClose={() => setCategoryModalOpen(false)} />
          <ProductModal open={productModalOpen} restaurantId={activeRestaurantId} product={activeProduct} categories={categories.data || []} extraGroups={groups.data || []} onClose={() => setProductModalOpen(false)} existingDeals={(automaticDeals.data || []).filter((deal) => deal.restaurantId === activeRestaurantId || deal.applicableRestaurantIds?.includes(activeRestaurantId) || deal.isGlobal)} />
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

