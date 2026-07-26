"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, ChevronUp, Eye, EyeOff, Filter, GripVertical, Loader2, Percent, Plus, Search, Trash2 } from "lucide-react";
import { getPlatformSettings, platformSettingsQueryKey, updatePlatformSettings } from "@/modules/platform-settings/api";
import {
  categoriesQueryKey,
  createRestaurantTag,
  createCategory,
  deleteCategory,
  getCategories,
  getRestaurantTags,
  restaurantTagsQueryKey,
  updateRestaurantTag,
  updateCategory,
  type HomeCategoryFilterMode,
  type HomeCategoryPayload,
  type HomeCategorySection,
  type HomeCategorySortBy,
  type HomeCategorySortDirection,
  type HomeCategoryAccent,
  type HomeCategoryLayout,
  type HomeCategoryRankingStrategy,
} from "@/modules/categories/api";
import { getRestaurantOverview } from "@/modules/restaurants/api";
import {
  Badge,
  Button,
  ConfirmDialog,
  EmptyState,
  ErrorPanel,
  Field,
  Input,
  Modal,
  PageHeader,
  Select,
  Surface,
  Textarea,
  Toggle,
} from "@/shared/components/ui";
import { formatNumber } from "@/shared/utils/format";
import { contentPlacementsQueryKey } from "@/modules/homepage/api";

const dayOptions = [
  { value: 1, label: "Mån" },
  { value: 2, label: "Tis" },
  { value: 3, label: "Ons" },
  { value: 4, label: "Tors" },
  { value: 5, label: "Fre" },
  { value: 6, label: "Lör" },
  { value: 0, label: "Sön" },
];

type FormState = {
  title: string;
  // EN-översättningar: lämnas tomma → frontend faller tillbaka på sv.
  titleEn: string;
  slug: string;
  subtitle: string;
  subtitleEn: string;
  description: string;
  descriptionEn: string;
  isActive: boolean;
  sortOrder: number;
  filterMode: HomeCategoryFilterMode;
  maxRestaurants: number;
  manualRestaurantIds: string[];
  searchTerm: string;
  cuisines: string;
  tagIds: string[];
  legacyTags: string[];
  featuredClasses: number[];
  minRating: string;
  maxEtaMinutes: string;
  maxDeliveryFee: string;
  freeDeliveryOnly: boolean;
  dealsOnly: boolean;
  openNowOnly: boolean;
  sortBy: HomeCategorySortBy;
  sortDirection: HomeCategorySortDirection;
  layout: HomeCategoryLayout;
  accent: HomeCategoryAccent;
  accentColor: string;
  backgroundColor: string;
  rankingStrategy: HomeCategoryRankingStrategy;
  ordersTodayWeight: number;
  orders7dWeight: number;
  etaWeight: number;
  ratingWeight: number;
  deliveryFeeWeight: number;
  freeDeliveryWeight: number;
  discountWeight: number;
  tierWeight: number;
  dailyRotationWeight: number;
  avoidDuplicateFirst: boolean;
  appearancePenalty: number;
  maxAdminBoostPoints: number;
  scheduleEnabled: boolean;
  daysOfWeek: number[];
  startTime: string;
  endTime: string;
};

const emptyForm = (): FormState => ({
  title: "",
  titleEn: "",
  slug: "",
  subtitle: "",
  subtitleEn: "",
  description: "",
  descriptionEn: "",
  isActive: true,
  sortOrder: 0,
  filterMode: "FILTER",
  maxRestaurants: 8,
  manualRestaurantIds: [],
  searchTerm: "",
  cuisines: "",
  tagIds: [],
  legacyTags: [],
  featuredClasses: [],
  minRating: "",
  maxEtaMinutes: "",
  maxDeliveryFee: "",
  freeDeliveryOnly: false,
  dealsOnly: false,
  openNowOnly: false,
  sortBy: "FEATURED",
  sortDirection: "DESC",
  layout: "MEDIUM_RAIL",
  accent: "ORANGE",
  accentColor: "",
  backgroundColor: "",
  rankingStrategy: "WEIGHTED",
  ordersTodayWeight: 28,
  orders7dWeight: 12,
  etaWeight: 16,
  ratingWeight: 16,
  deliveryFeeWeight: 7,
  freeDeliveryWeight: 5,
  discountWeight: 8,
  tierWeight: 5,
  dailyRotationWeight: 3,
  avoidDuplicateFirst: true,
  appearancePenalty: 6,
  maxAdminBoostPoints: 8,
  scheduleEnabled: false,
  daysOfWeek: [],
  startTime: "",
  endTime: "",
});

const splitCsv = (value: string) =>
  value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

const sectionToForm = (section: HomeCategorySection): FormState => ({
  title: section.title,
  titleEn: section.titleEn || "",
  slug: section.slug,
  subtitle: section.subtitle || "",
  subtitleEn: section.subtitleEn || "",
  description: section.description || "",
  descriptionEn: section.descriptionEn || "",
  isActive: section.isActive,
  sortOrder: section.sortOrder,
  filterMode: section.filterMode,
  maxRestaurants: section.maxRestaurants,
  manualRestaurantIds: section.manualRestaurantIds || [],
  searchTerm: section.filters.searchTerm || "",
  cuisines: (section.filters.cuisines || []).join(", "),
  tagIds: section.filters.tagIds || [],
  legacyTags: section.filters.tags || [],
  featuredClasses: section.filters.featuredClasses || [],
  minRating: section.filters.minRating != null ? String(section.filters.minRating) : "",
  maxEtaMinutes: section.filters.maxEtaMinutes != null ? String(section.filters.maxEtaMinutes) : "",
  maxDeliveryFee: section.filters.maxDeliveryFee != null ? String(section.filters.maxDeliveryFee) : "",
  freeDeliveryOnly: Boolean(section.filters.freeDeliveryOnly),
  dealsOnly: Boolean(section.filters.dealsOnly),
  openNowOnly: Boolean(section.filters.openNowOnly),
  sortBy: section.filters.sortBy || "FEATURED",
  sortDirection: section.filters.sortDirection || "DESC",
  layout: section.presentation?.layout || "MEDIUM_RAIL",
  accent: section.presentation?.accent || "ORANGE",
  accentColor: section.presentation?.accentColor || "",
  backgroundColor: section.presentation?.backgroundColor || "",
  rankingStrategy: section.ranking?.strategy || "WEIGHTED",
  ordersTodayWeight: section.ranking?.weights?.ordersToday ?? 28,
  orders7dWeight: section.ranking?.weights?.orders7d ?? 12,
  etaWeight: section.ranking?.weights?.eta ?? 16,
  ratingWeight: section.ranking?.weights?.ratingConfidence ?? 16,
  deliveryFeeWeight: section.ranking?.weights?.deliveryFee ?? 7,
  freeDeliveryWeight: section.ranking?.weights?.freeDelivery ?? 5,
  discountWeight: section.ranking?.weights?.discount ?? 8,
  tierWeight: section.ranking?.weights?.tier ?? 5,
  dailyRotationWeight: section.ranking?.weights?.dailyRotation ?? 3,
  avoidDuplicateFirst: section.ranking?.avoidDuplicateFirst !== false,
  appearancePenalty: section.ranking?.appearancePenalty ?? 6,
  maxAdminBoostPoints: section.ranking?.maxAdminBoostPoints ?? 8,
  scheduleEnabled: Boolean(section.schedule.enabled),
  daysOfWeek: section.schedule.daysOfWeek || [],
  startTime: section.schedule.startTime || "",
  endTime: section.schedule.endTime || "",
});

const formToPayload = (form: FormState): HomeCategoryPayload => ({
  title: form.title.trim(),
  titleEn: form.titleEn.trim() || null,
  slug: form.slug.trim() || undefined,
  subtitle: form.subtitle.trim() || null,
  subtitleEn: form.subtitleEn.trim() || null,
  description: form.description.trim() || null,
  descriptionEn: form.descriptionEn.trim() || null,
  isActive: form.isActive,
  sortOrder: Number(form.sortOrder || 0),
  filterMode: form.filterMode,
  maxRestaurants: Number(form.maxRestaurants || 8),
  manualRestaurantIds: form.manualRestaurantIds,
  filters: {
    searchTerm: form.searchTerm.trim() || null,
    cuisines: splitCsv(form.cuisines),
    tagIds: form.tagIds,
    tags: form.tagIds.length ? [] : form.legacyTags,
    featuredClasses: form.featuredClasses,
    minRating: form.minRating.trim() === "" ? null : Number(form.minRating),
    maxEtaMinutes: form.maxEtaMinutes.trim() === "" ? null : Number(form.maxEtaMinutes),
    maxDeliveryFee: form.maxDeliveryFee.trim() === "" ? null : Number(form.maxDeliveryFee),
    freeDeliveryOnly: form.freeDeliveryOnly,
    dealsOnly: form.dealsOnly,
    openNowOnly: form.openNowOnly,
    sortBy: form.sortBy,
    sortDirection: form.sortDirection,
  },
  schedule: {
    enabled: form.scheduleEnabled,
    daysOfWeek: form.daysOfWeek,
    startTime: form.startTime || null,
    endTime: form.endTime || null,
  },
  presentation: {
    layout: form.layout,
    accent: form.accent,
    accentColor: form.accentColor || null,
    backgroundColor: form.backgroundColor || null,
  },
  ranking: {
    strategy: form.rankingStrategy,
    weights: {
      ordersToday: form.ordersTodayWeight,
      orders7d: form.orders7dWeight,
      eta: form.etaWeight,
      ratingConfidence: form.ratingWeight,
      deliveryFee: form.deliveryFeeWeight,
      freeDelivery: form.freeDeliveryWeight,
      discount: form.discountWeight,
      tier: form.tierWeight,
      dailyRotation: form.dailyRotationWeight,
    },
    avoidDuplicateFirst: form.avoidDuplicateFirst,
    appearancePenalty: form.appearancePenalty,
    maxAdminBoostPoints: form.maxAdminBoostPoints,
  },
});

function CategoryEditorModal({
  open,
  section,
  onClose,
}: {
  open: boolean;
  section: HomeCategorySection | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(emptyForm());
  const [restaurantSearch, setRestaurantSearch] = useState("");
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  const restaurantsQuery = useQuery({
    queryKey: ["categories", "restaurants"],
    queryFn: getRestaurantOverview,
    enabled: open,
  });
  const tagsQuery = useQuery({
    queryKey: restaurantTagsQueryKey,
    queryFn: getRestaurantTags,
    enabled: open,
  });

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!open) return;
    setForm(section ? sectionToForm(section) : emptyForm());
    setRestaurantSearch("");
  }, [open, section]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = formToPayload(form);
      if (section) return updateCategory(section.id, payload);
      return createCategory(payload);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: categoriesQueryKey });
      await queryClient.invalidateQueries({ queryKey: contentPlacementsQueryKey });
      onClose();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!section) return { ok: true as const };
      return deleteCategory(section.id);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: categoriesQueryKey });
      await queryClient.invalidateQueries({ queryKey: contentPlacementsQueryKey });
      onClose();
    },
  });

  const toggleFeaturedClass = (value: number) =>
    setForm((current) => ({
      ...current,
      featuredClasses: current.featuredClasses.includes(value)
        ? current.featuredClasses.filter((entry) => entry !== value)
        : [...current.featuredClasses, value],
    }));

  const toggleDay = (value: number) =>
    setForm((current) => ({
      ...current,
      daysOfWeek: current.daysOfWeek.includes(value)
        ? current.daysOfWeek.filter((entry) => entry !== value)
        : [...current.daysOfWeek, value],
    }));

  const toggleRestaurant = (restaurantId: string) =>
    setForm((current) => ({
      ...current,
      manualRestaurantIds: current.manualRestaurantIds.includes(restaurantId)
        ? current.manualRestaurantIds.filter((entry) => entry !== restaurantId)
        : [...current.manualRestaurantIds, restaurantId],
    }));

  const toggleTag = (tagId: string) =>
    setForm((current) => ({
      ...current,
      tagIds: current.tagIds.includes(tagId)
        ? current.tagIds.filter((id) => id !== tagId)
        : [...current.tagIds, tagId],
      legacyTags: [],
    }));

  const filteredRestaurants = useMemo(() => {
    const query = restaurantSearch.trim().toLowerCase();
    const items = restaurantsQuery.data || [];
    if (!query) return items;
    return items.filter((restaurant) =>
      `${restaurant.name} ${restaurant.slug} ${restaurant.city || ""}`.toLowerCase().includes(query),
    );
  }, [restaurantSearch, restaurantsQuery.data]);

  return (
    <>
    <Modal
      open={open}
      onClose={onClose}
      title={section ? section.title : "Ny kategori"}
      size="xl"
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            {section ? (
              <Button
                variant="danger"
                onClick={() => setConfirmDeleteOpen(true)}
                disabled={deleteMutation.isPending}
              >
                <Trash2 size={16} /> Radera
              </Button>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={onClose}>Stäng</Button>
            <Button variant="primary" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : null}
              {section ? "Uppdatera" : "Skapa"}
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-5">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Titel (svenska)">
            <Input
              value={form.title}
              onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
              placeholder="t.ex. Pizza fredag"
            />
          </Field>
          <Field label="Title (English) — valfri">
            <Input
              value={form.titleEn}
              onChange={(event) => setForm((current) => ({ ...current, titleEn: event.target.value }))}
              placeholder="e.g. Pizza Friday"
            />
          </Field>
          <Field label="Slug (auto från titel om tom)">
            <Input
              value={form.slug}
              onChange={(event) => setForm((current) => ({ ...current, slug: event.target.value }))}
              placeholder="pizza-fredag"
            />
          </Field>
          <Field label="Underrubrik (svenska)">
            <Input
              value={form.subtitle}
              onChange={(event) => setForm((current) => ({ ...current, subtitle: event.target.value }))}
              placeholder="Underrubrik"
            />
          </Field>
          <Field label="Subtitle (English) — valfri">
            <Input
              value={form.subtitleEn}
              onChange={(event) => setForm((current) => ({ ...current, subtitleEn: event.target.value }))}
              placeholder="Subtitle"
            />
          </Field>
          <Field label="Status">
            <Select
              value={form.isActive ? "active" : "inactive"}
              onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.value === "active" }))}
            >
              <option value="active">Aktiv (synlig)</option>
              <option value="inactive">Inaktiv (dold)</option>
            </Select>
          </Field>
          <Field label="Mode">
            <Select
              value={form.filterMode}
              onChange={(event) =>
                setForm((current) => ({ ...current, filterMode: event.target.value as HomeCategoryFilterMode }))
              }
            >
              <option value="FILTER">Filter — auto från regler</option>
              <option value="MANUAL">Manual — bara valda</option>
              <option value="HYBRID">Hybrid — valda + filter-fyllning</option>
            </Select>
          </Field>
          <Field label="Max restauranger">
            <Input
              type="number"
              min={1}
              max={24}
              value={form.maxRestaurants}
              onChange={(event) =>
                setForm((current) => ({ ...current, maxRestaurants: Number(event.target.value || 8) }))
              }
            />
          </Field>
          <Field label="Sort order">
            <Input
              type="number"
              value={form.sortOrder}
              onChange={(event) =>
                setForm((current) => ({ ...current, sortOrder: Number(event.target.value || 0) }))
              }
            />
          </Field>
          <div className="md:col-span-2">
            <Field label="Beskrivning (intern, syns inte publikt) — svenska">
              <Textarea
                value={form.description}
                onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
              />
            </Field>
          </div>
          <div className="md:col-span-2">
            <Field label="Description (English) — valfri">
              <Textarea
                value={form.descriptionEn}
                onChange={(event) => setForm((current) => ({ ...current, descriptionEn: event.target.value }))}
              />
            </Field>
          </div>
        </div>

        <div className="surface-muted px-5 py-5">
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">
            Utseende
          </p>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <Field label="Kortlayout">
              <Select
                value={form.layout}
                onChange={(event) => setForm((current) => ({ ...current, layout: event.target.value as HomeCategoryLayout }))}
              >
                <option value="MEDIUM_RAIL">Medium rail</option>
                <option value="LARGE_RAIL">Stor rail</option>
                <option value="GRID">Grid</option>
              </Select>
            </Field>
            <Field label="Accent">
              <Select
                value={form.accent}
                onChange={(event) => setForm((current) => ({ ...current, accent: event.target.value as HomeCategoryAccent }))}
              >
                <option value="ORANGE">Orange (primär)</option>
                <option value="BLUE">Blå</option>
                <option value="GREEN">Grön</option>
                <option value="PURPLE">Lila</option>
                <option value="NAVY">Navy</option>
              </Select>
            </Field>
            <Field label="Egen accentfärg" hint="Valfri hex, t.ex. #FF6B00">
              <Input
                type="color"
                value={form.accentColor || "#FF6B00"}
                onChange={(event) => setForm((current) => ({ ...current, accentColor: event.target.value }))}
              />
            </Field>
            <Field label="Bakgrundsfärg" hint="Valfri hex">
              <Input
                type="color"
                value={form.backgroundColor || "#FFF7F0"}
                onChange={(event) => setForm((current) => ({ ...current, backgroundColor: event.target.value }))}
              />
            </Field>
          </div>
        </div>

        <div className="surface-muted px-5 py-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">
                Rankingmotor
              </p>
              <p className="mt-2 max-w-2xl text-xs text-[var(--text-secondary)]">
                Vikterna påverkar ordningen, aldrig vilka restauranger som klarar filterreglerna.
                Adminboost är tidsbegränsad och kan bidra med högst angivet antal poäng.
              </p>
            </div>
            <Button
              variant={form.avoidDuplicateFirst ? "primary" : "secondary"}
              onClick={() => setForm((current) => ({ ...current, avoidDuplicateFirst: !current.avoidDuplicateFirst }))}
            >
              {form.avoidDuplicateFirst ? "Unik etta på" : "Unik etta av"}
            </Button>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <Field label="Strategi">
              <Select
                value={form.rankingStrategy}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    rankingStrategy: event.target.value as HomeCategoryRankingStrategy,
                  }))
                }
              >
                <option value="WEIGHTED">Viktad poäng</option>
                <option value="BALANCED">Balanserad: populär + snabb + kvalitet</option>
              </Select>
            </Field>
            <Field label="Repetitionsavdrag">
              <Input
                type="number"
                min={0}
                max={30}
                value={form.appearancePenalty}
                onChange={(event) =>
                  setForm((current) => ({ ...current, appearancePenalty: Number(event.target.value || 0) }))
                }
              />
            </Field>
            <Field label="Max adminboost-poäng">
              <Input
                type="number"
                min={0}
                max={15}
                value={form.maxAdminBoostPoints}
                onChange={(event) =>
                  setForm((current) => ({ ...current, maxAdminBoostPoints: Number(event.target.value || 0) }))
                }
              />
            </Field>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {([
              ["ordersTodayWeight", "Ordrar idag", 100],
              ["orders7dWeight", "Ordrar 7 dagar", 100],
              ["etaWeight", "Snabbhet", 100],
              ["ratingWeight", "Betyg + antal omdömen", 100],
              ["deliveryFeeWeight", "Låg grundavgift", 100],
              ["freeDeliveryWeight", "Fri leverans", 100],
              ["discountWeight", "Aktiv rabatt", 100],
              ["tierWeight", "Tier", 25],
              ["dailyRotationWeight", "Daglig rotation", 10],
            ] as const).map(([key, label, max]) => (
              <Field key={key} label={label}>
                <Input
                  type="number"
                  min={0}
                  max={max}
                  value={form[key]}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, [key]: Number(event.target.value || 0) }))
                  }
                />
              </Field>
            ))}
          </div>
        </div>

        <div className="surface-muted px-5 py-5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">Filterregler</p>
            <Filter size={16} className="text-[var(--accent-strong)]" />
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <Field label="Sökterm">
              <Input
                value={form.searchTerm}
                onChange={(event) => setForm((current) => ({ ...current, searchTerm: event.target.value }))}
                placeholder="t.ex. pizza"
              />
            </Field>
            <Field label="Kök (kommaseparerat)">
              <Input
                value={form.cuisines}
                onChange={(event) => setForm((current) => ({ ...current, cuisines: event.target.value }))}
                placeholder="Pizza, Sushi"
              />
            </Field>
            <div className="md:col-span-2">
              <p className="field-label mb-2">Restaurangtaggar</p>
              <p className="mb-3 text-xs text-[var(--text-muted)]">
                Val från den centrala katalogen. En restaurang behöver minst en av de valda taggarna.
              </p>
              {tagsQuery.isLoading ? (
                <p className="text-sm text-[var(--text-secondary)]">Hämtar taggar...</p>
              ) : tagsQuery.data?.length ? (
                <div className="flex flex-wrap gap-2">
                  {tagsQuery.data.filter((tag) => tag.isActive).map((tag) => {
                    const active = form.tagIds.includes(tag.id);
                    return (
                      <button
                        key={tag.id}
                        type="button"
                        onClick={() => toggleTag(tag.id)}
                        className={`min-h-10 rounded-full border px-4 text-sm font-extrabold transition-colors ${
                          active
                            ? "border-transparent text-white"
                            : "border-[var(--border-subtle)] bg-[var(--surface)] text-[var(--text-secondary)]"
                        }`}
                        style={active ? { backgroundColor: tag.color } : undefined}
                      >
                        {tag.name} <span className="opacity-70">({tag.restaurantCount})</span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-[var(--text-secondary)]">
                  Skapa taggar i Taggkatalogen på kategorisidan först.
                </p>
              )}
              {form.legacyTags.length && !form.tagIds.length ? (
                <p className="mt-3 text-xs font-bold text-[var(--warning-text)]">
                  Legacy-filter bevaras tills du väljer en katalogtagg: {form.legacyTags.join(", ")}
                </p>
              ) : null}
            </div>
            <Field label="Sortera efter">
              <div className="flex gap-2">
                <Select
                  value={form.sortBy}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, sortBy: event.target.value as HomeCategorySortBy }))
                  }
                >
                  <option value="SMART">Smart mix</option>
                  <option value="FEATURED">Tier</option>
                  <option value="ORDERS_TODAY">Ordrar idag</option>
                  <option value="ORDERS_7D">Ordrar 7 dagar</option>
                  <option value="RATING">Betyg</option>
                  <option value="ETA">ETA</option>
                  <option value="DELIVERY_FEE">Leveransavgift</option>
                  <option value="DISCOUNT">Rabatt</option>
                  <option value="NAME">Namn</option>
                </Select>
                <Select
                  value={form.sortDirection}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, sortDirection: event.target.value as HomeCategorySortDirection }))
                  }
                >
                  <option value="DESC">Desc</option>
                  <option value="ASC">Asc</option>
                </Select>
              </div>
            </Field>
            <Field label="Min betyg">
              <Input
                type="number"
                min={0}
                max={5}
                step="0.1"
                value={form.minRating}
                onChange={(event) => setForm((current) => ({ ...current, minRating: event.target.value }))}
              />
            </Field>
            <Field label="Max ETA (min)">
              <Input
                type="number"
                min={0}
                value={form.maxEtaMinutes}
                onChange={(event) => setForm((current) => ({ ...current, maxEtaMinutes: event.target.value }))}
              />
            </Field>
            <Field label="Max leveransavgift (kr)">
              <Input
                type="number"
                min={0}
                value={form.maxDeliveryFee}
                onChange={(event) => setForm((current) => ({ ...current, maxDeliveryFee: event.target.value }))}
              />
            </Field>
            <div>
              <p className="field-label mb-1">Featured class</p>
              <div className="flex flex-wrap gap-2">
                {[1, 2, 3].map((value) => {
                  const active = form.featuredClasses.includes(value);
                  return (
                    <Button
                      key={value}
                      variant={active ? "primary" : "secondary"}
                      onClick={() => toggleFeaturedClass(value)}
                    >
                      Class {value}
                    </Button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            {(
              [
                { key: "openNowOnly", label: "Endast öppna nu" },
                { key: "dealsOnly", label: "Måste ha deals" },
                { key: "freeDeliveryOnly", label: "Fri leverans" },
              ] as const
            ).map((toggle) => {
              const active = form[toggle.key];
              return (
                <Button
                  key={toggle.key}
                  variant={active ? "primary" : "secondary"}
                  onClick={() => setForm((current) => ({ ...current, [toggle.key]: !active }))}
                >
                  {toggle.label}
                </Button>
              );
            })}
          </div>
        </div>

        <div className="surface-muted px-5 py-5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">Schema</p>
            <Badge tone={form.scheduleEnabled ? "info" : "neutral"}>
              {form.scheduleEnabled ? "Aktivt" : "Alltid synlig"}
            </Badge>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button
              variant={form.scheduleEnabled ? "primary" : "secondary"}
              onClick={() => setForm((current) => ({ ...current, scheduleEnabled: !current.scheduleEnabled }))}
            >
              {form.scheduleEnabled ? "Schema på" : "Schema av"}
            </Button>
            {dayOptions.map((day) => {
              const active = form.daysOfWeek.includes(day.value);
              return (
                <Button
                  key={day.value}
                  variant={active ? "primary" : "secondary"}
                  onClick={() => toggleDay(day.value)}
                >
                  {day.label}
                </Button>
              );
            })}
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <Field label="Från">
              <Input
                type="time"
                value={form.startTime}
                onChange={(event) => setForm((current) => ({ ...current, startTime: event.target.value }))}
              />
            </Field>
            <Field label="Till">
              <Input
                type="time"
                value={form.endTime}
                onChange={(event) => setForm((current) => ({ ...current, endTime: event.target.value }))}
              />
            </Field>
          </div>
        </div>

        <div className="surface-muted px-5 py-5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">Manuella restauranger</p>
            <Badge tone="neutral">{form.manualRestaurantIds.length} valda</Badge>
          </div>

          <div className="relative mt-4">
            <Search size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
            <Input
                className="input-with-leading-icon"
              placeholder="Sök restaurang..."
              value={restaurantSearch}
              onChange={(event) => setRestaurantSearch(event.target.value)}
            />
          </div>

          <div className="mt-4 max-h-72 overflow-auto pr-1">
            {restaurantsQuery.isLoading ? (
              <p className="text-sm text-[var(--text-secondary)]">Hämtar restauranger...</p>
            ) : filteredRestaurants.length === 0 ? (
              <p className="text-sm text-[var(--text-secondary)]">Inga restauranger matchar.</p>
            ) : (
              <div className="grid gap-2">
                {filteredRestaurants.map((restaurant) => {
                  const active = form.manualRestaurantIds.includes(restaurant.id);
                  return (
                    <button
                      key={restaurant.id}
                      type="button"
                      onClick={() => toggleRestaurant(restaurant.id)}
                      className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left transition-colors ${
                        active
                          ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                          : "border-[var(--border-subtle)] bg-transparent hover:border-[var(--border-strong)]"
                      }`}
                    >
                      <div>
                        <p className="font-black tracking-[-0.02em]">{restaurant.name}</p>
                        <p className="mt-1 text-sm text-[var(--text-secondary)]">
                          {restaurant.city || "Ingen stad"} • {restaurant.slug}
                        </p>
                      </div>
                      <div
                        className={`h-4 w-4 rounded-full border ${
                          active ? "border-[var(--accent-strong)] bg-[var(--accent-strong)]" : "border-[var(--border-subtle)]"
                        }`}
                      />
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </Modal>
    <ConfirmDialog
      open={confirmDeleteOpen}
      title="Radera hemskärmsrail?"
      description={section ? `“${section.title}” försvinner från web och app. Åtgärden kan inte ångras.` : undefined}
      confirmLabel="Radera permanent"
      danger
      loading={deleteMutation.isPending}
      onClose={() => setConfirmDeleteOpen(false)}
      onConfirm={() => deleteMutation.mutate()}
    />
    </>
  );
}

export function CategoriesPage({ embedded = false }: { embedded?: boolean }) {
  const queryClient = useQueryClient();
  const [activeSection, setActiveSection] = useState<HomeCategorySection | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const categories = useQuery({ queryKey: categoriesQueryKey, queryFn: getCategories });

  // Pilarna upp/ner: byter sortOrder med grannen och invalidate-ar listan.
  // Kör som mutation så att UI:t reflekterar ändringen direkt utan optimistic state.
  const reorderMutation = useMutation({
    mutationFn: async ({ section, direction }: { section: HomeCategorySection; direction: "up" | "down" }) => {
      const list = (categories.data || []).slice().sort((a, b) => a.sortOrder - b.sortOrder);
      const idx = list.findIndex((entry) => entry.id === section.id);
      if (idx === -1) return;
      const swapIdx = direction === "up" ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= list.length) return;
      const swap = list[swapIdx];
      await Promise.all([
        updateCategory(section.id, { sortOrder: swap.sortOrder }),
        updateCategory(swap.id, { sortOrder: section.sortOrder }),
      ]);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: categoriesQueryKey });
      void queryClient.invalidateQueries({ queryKey: contentPlacementsQueryKey });
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: (section: HomeCategorySection) =>
      updateCategory(section.id, { isActive: !section.isActive }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: categoriesQueryKey });
      void queryClient.invalidateQueries({ queryKey: contentPlacementsQueryKey });
    },
  });

  const sortedCategories = useMemo(() => {
    const items = categories.data || [];
    return [...items].sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title, "sv"));
  }, [categories.data]);

  if (categories.isLoading) {
    return (
      <div className="page-stack">
        {!embedded ? <PageHeader breadcrumb="Tillväxt" title="Hemskärmsrails" /> : null}
        <Surface className="px-6 py-12 text-sm text-[var(--text-secondary)]">Laddar kategorier...</Surface>
      </div>
    );
  }

  if (categories.isError || !categories.data) {
    return (
      <ErrorPanel
        title="Kategorier kunde inte hämtas"
        description="API:t /home-categories/all svarade inte."
        action={<Button onClick={() => void categories.refetch()}>Försök igen</Button>}
      />
    );
  }

  const visibleSections = sortedCategories.filter((section) => section.isActive);

  return (
    <div className="page-stack">
      {embedded ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface)] p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-black tracking-[-0.03em]">Kategori- och restaurangrails</h2>
            <p className="mt-1 text-sm text-[var(--text-muted)]">Ordning, urval, synlighet och schema för hemskärmens rader.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => void categories.refetch()}>Uppdatera</Button>
            <Button variant="primary" onClick={() => setCreateOpen(true)}><Plus size={13} /> Ny rail</Button>
          </div>
        </div>
      ) : (
        <PageHeader
          breadcrumb="Tillväxt"
          title="Hemskärmsrails"
          actions={
            <>
              <Button variant="secondary" onClick={() => void categories.refetch()}>Uppdatera</Button>
              <Button variant="primary" onClick={() => setCreateOpen(true)}><Plus size={13} /> Ny rail</Button>
            </>
          }
        />
      )}

      <DiscountedRailToggle />
      <TagCatalogPanel />

      <div className="grid gap-4 lg:grid-cols-[1.55fr_1fr]">
        <Surface className="overflow-hidden">
          <div className="border-b border-[var(--border-subtle)] px-6 py-5">
            <h2 className="text-[15px] font-extrabold tracking-[-0.3px]">Sektioner på hemskärmen</h2>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Bestäm ordning och synlighet. Av betyder att sektionen inte visas för kunder på hemskärmen.
            </p>
          </div>

          {sortedCategories.length === 0 ? (
            <div className="px-6 py-10">
              <EmptyState title="Inga sektioner ännu" description="Skapa din första hemskärms-sektion." />
            </div>
          ) : (
            <div className="px-3 py-3">
              <div className="grid grid-cols-[28px_1fr_minmax(0,140px)_44px_24px] items-center gap-3 px-3 pb-2 text-[10.5px] font-extrabold uppercase tracking-[0.06em] text-[var(--text-muted)]">
                <span />
                <span>Sektion på hem</span>
                <span className="hidden sm:block">Typ</span>
                <span className="text-center">Visas</span>
                <span />
              </div>

              <div className="divide-y divide-[var(--row-divider)]">
                {sortedCategories.map((section, index) => (
                  <div
                    key={section.id}
                    className={`grid grid-cols-[28px_1fr_minmax(0,140px)_44px_24px] items-center gap-3 px-3 py-3 transition-opacity ${
                      section.isActive ? "" : "opacity-55"
                    }`}
                  >
                    <div className="flex flex-col items-center">
                      <button
                        type="button"
                        aria-label="Flytta upp"
                        onClick={() => reorderMutation.mutate({ section, direction: "up" })}
                        disabled={index === 0 || reorderMutation.isPending}
                        className="text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)] disabled:opacity-30"
                      >
                        <ChevronUp size={13} />
                      </button>
                      <GripVertical size={15} className="text-[var(--border-strong)]" />
                      <button
                        type="button"
                        aria-label="Flytta ner"
                        onClick={() => reorderMutation.mutate({ section, direction: "down" })}
                        disabled={index === sortedCategories.length - 1 || reorderMutation.isPending}
                        className="text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)] disabled:opacity-30"
                      >
                        <ChevronDown size={13} />
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => setActiveSection(section)}
                      className="min-w-0 text-left"
                    >
                      <p className="truncate text-[13.5px] font-bold text-[var(--text-primary)]">{section.title}</p>
                      {section.subtitle ? (
                        <p className="mt-0.5 truncate text-xs text-[var(--text-muted)]">{section.subtitle}</p>
                      ) : null}
                    </button>

                    <div className="hidden min-w-0 sm:block">
                      <span className="block truncate text-xs font-semibold text-[var(--text-secondary)]">
                        {filterModeLabel(section.filterMode)}
                      </span>
                      {section.schedule.enabled ? (
                        <span className="mt-0.5 block text-[11px] text-[var(--text-muted)]">Schemalagd</span>
                      ) : null}
                    </div>

                    <div className="flex justify-center">
                      <Toggle
                        checked={section.isActive}
                        onChange={() => toggleActiveMutation.mutate(section)}
                        disabled={toggleActiveMutation.isPending}
                      />
                    </div>

                    <button
                      type="button"
                      aria-label="Öppna sektion"
                      onClick={() => setActiveSection(section)}
                      className="flex justify-center text-[var(--border-strong)] transition-colors hover:text-[var(--text-primary)]"
                    >
                      <ChevronRight size={16} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Surface>

        <Surface className="overflow-hidden">
          <div className="border-b border-[var(--border-subtle)] px-6 py-5">
            <h2 className="text-[15px] font-extrabold tracking-[-0.3px]">Förhandsvisning</h2>
            <p className="mt-1 text-sm text-[var(--text-muted)]">Ändringar speglas direkt på kundens hemskärm.</p>
          </div>
          <div className="flex justify-center bg-[var(--bg-page)] px-6 py-7">
            <div className="w-full max-w-[240px] rounded-[28px] bg-[#0a0a0c] p-2 shadow-[0_20px_40px_rgba(0,0,0,0.25)]">
              <div className="rounded-[22px] bg-[var(--bg-panel)] px-4 py-5">
                {visibleSections.length === 0 ? (
                  <p className="py-10 text-center text-xs text-[var(--text-muted)]">Inga synliga sektioner</p>
                ) : (
                  <div className="space-y-4">
                    {visibleSections.slice(0, 6).map((section) => (
                      <div key={section.id}>
                        <p className="text-[10px] font-extrabold uppercase tracking-[0.06em] text-[var(--accent)]">
                          {section.title}
                        </p>
                        <div className="mt-2 flex gap-2">
                          <div className="h-14 flex-1 rounded-xl bg-[var(--accent-soft)]" />
                          <div className="h-14 flex-1 rounded-xl bg-[var(--bg-page)] border border-[var(--border-subtle)]" />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </Surface>
      </div>

      <CategoryEditorModal open={Boolean(activeSection)} section={activeSection} onClose={() => setActiveSection(null)} />
      <CategoryEditorModal open={createOpen} section={null} onClose={() => setCreateOpen(false)} />
    </div>
  );
}

function filterModeLabel(mode: HomeCategoryFilterMode): string {
  if (mode === "MANUAL") return "Manuellt val";
  if (mode === "HYBRID") return "Hybrid";
  return "Auto-rail";
}

function TagCatalogPanel() {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [color, setColor] = useState("#FF6B00");
  const tags = useQuery({ queryKey: restaurantTagsQueryKey, queryFn: getRestaurantTags });

  const createMutation = useMutation({
    mutationFn: () => createRestaurantTag({ name: name.trim(), color }),
    onSuccess: async () => {
      setName("");
      await queryClient.invalidateQueries({ queryKey: restaurantTagsQueryKey });
    },
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: { color?: string; isActive?: boolean } }) =>
      updateRestaurantTag(id, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: restaurantTagsQueryKey });
      void queryClient.invalidateQueries({ queryKey: categoriesQueryKey });
    },
  });

  return (
    <Surface className="px-6 py-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-[15px] font-extrabold tracking-[-0.3px]">Taggkatalog</h2>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Dessa val används som chips på restauranger, i sök och i dynamiska hemskärmsrails.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Ny tagg">
            <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="t.ex. Asiatiskt" />
          </Field>
          <Input
            aria-label="Taggfärg"
            type="color"
            className="!h-11 !w-14 !px-1"
            value={color}
            onChange={(event) => setColor(event.target.value)}
          />
          <Button
            variant="primary"
            disabled={name.trim().length < 2 || createMutation.isPending}
            onClick={() => createMutation.mutate()}
          >
            {createMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            Lägg till
          </Button>
        </div>
      </div>

      {tags.isLoading ? (
        <p className="mt-4 text-sm text-[var(--text-secondary)]">Hämtar taggar...</p>
      ) : tags.data?.length ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {tags.data.map((tag) => (
            <div
              key={tag.id}
              className={`flex min-h-11 items-center gap-2 rounded-full border px-2 pl-4 ${
                tag.isActive ? "border-[var(--border-subtle)]" : "border-dashed opacity-55"
              }`}
            >
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: tag.color }} />
              <span className="text-sm font-extrabold">{tag.name}</span>
              <span className="text-xs text-[var(--text-muted)]">{tag.restaurantCount}</span>
              <input
                aria-label={`Färg för ${tag.name}`}
                type="color"
                className="h-7 w-7 cursor-pointer rounded-full border-0 bg-transparent p-0"
                value={tag.color}
                onChange={(event) => updateMutation.mutate({ id: tag.id, payload: { color: event.target.value } })}
              />
              <button
                type="button"
                className="min-h-8 rounded-full px-3 text-xs font-black"
                onClick={() => updateMutation.mutate({ id: tag.id, payload: { isActive: !tag.isActive } })}
              >
                {tag.isActive ? "Aktiv" : "Inaktiv"}
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-4 text-sm text-[var(--text-secondary)]">Inga taggar ännu.</p>
      )}
      {createMutation.isError || updateMutation.isError ? (
        <p className="mt-3 text-sm font-bold text-[var(--danger-text)]">Taggen kunde inte sparas.</p>
      ) : null}
    </Surface>
  );
}

// Toggle för "Rea & Rabatter"-sektionen på hem-sidan i web.
// Värdet sparas i RestaurantSettings.showDiscountedRail (singleton).
function DiscountedRailToggle() {
  const queryClient = useQueryClient();
  const settings = useQuery({ queryKey: platformSettingsQueryKey, queryFn: getPlatformSettings });
  const value = (settings.data as { showDiscountedRail?: boolean } | undefined)?.showDiscountedRail ?? true;

  const mutation = useMutation({
    mutationFn: (next: boolean) => updatePlatformSettings({ showDiscountedRail: next }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: platformSettingsQueryKey });
    },
  });

  if (settings.isLoading) {
    return (
      <Surface className="px-6 py-5 flex items-center gap-3 text-sm text-[var(--text-secondary)]">
        <Loader2 size={14} className="animate-spin" /> Laddar inställning...
      </Surface>
    );
  }

  return (
    <Surface className="px-6 py-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0" style={{ backgroundColor: "var(--bg-deep)", border: "1px solid var(--border-muted)" }}>
            <Percent size={16} className="text-gold-500" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-black text-sm tracking-tight" style={{ color: "var(--text-primary)" }}>Rea & Rabatter</p>
          </div>
        </div>
        <Button
          variant={value ? "secondary" : "primary"}
          onClick={() => mutation.mutate(!value)}
          disabled={mutation.isPending}
        >
          {mutation.isPending ? <Loader2 size={14} className="animate-spin" /> : value ? <EyeOff size={14} /> : <Eye size={14} />}
          {value ? "Stäng av" : "Aktivera"}
        </Button>
      </div>
    </Surface>
  );
}
