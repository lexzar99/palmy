"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Eye, EyeOff, Filter, Loader2, Plus, Search, Trash2 } from "lucide-react";
import {
  categoriesQueryKey,
  createCategory,
  deleteCategory,
  getCategories,
  updateCategory,
  type HomeCategoryFilterMode,
  type HomeCategoryPayload,
  type HomeCategorySection,
  type HomeCategorySortBy,
  type HomeCategorySortDirection,
} from "@/modules/categories/api";
import { getRestaurantOverview } from "@/modules/restaurants/api";
import {
  Badge,
  Button,
  EmptyState,
  ErrorPanel,
  Field,
  Input,
  Modal,
  PageHeader,
  Select,
  Surface,
  Textarea,
} from "@/shared/components/ui";
import { formatNumber } from "@/shared/utils/format";

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
  slug: string;
  subtitle: string;
  description: string;
  isActive: boolean;
  sortOrder: number;
  filterMode: HomeCategoryFilterMode;
  maxRestaurants: number;
  manualRestaurantIds: string[];
  searchTerm: string;
  cuisines: string;
  tags: string;
  featuredClasses: number[];
  minRating: string;
  maxEtaMinutes: string;
  maxDeliveryFee: string;
  freeDeliveryOnly: boolean;
  dealsOnly: boolean;
  openNowOnly: boolean;
  sortBy: HomeCategorySortBy;
  sortDirection: HomeCategorySortDirection;
  scheduleEnabled: boolean;
  daysOfWeek: number[];
  startTime: string;
  endTime: string;
};

const emptyForm = (): FormState => ({
  title: "",
  slug: "",
  subtitle: "",
  description: "",
  isActive: true,
  sortOrder: 0,
  filterMode: "FILTER",
  maxRestaurants: 8,
  manualRestaurantIds: [],
  searchTerm: "",
  cuisines: "",
  tags: "",
  featuredClasses: [],
  minRating: "",
  maxEtaMinutes: "",
  maxDeliveryFee: "",
  freeDeliveryOnly: false,
  dealsOnly: false,
  openNowOnly: false,
  sortBy: "FEATURED",
  sortDirection: "DESC",
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
  slug: section.slug,
  subtitle: section.subtitle || "",
  description: section.description || "",
  isActive: section.isActive,
  sortOrder: section.sortOrder,
  filterMode: section.filterMode,
  maxRestaurants: section.maxRestaurants,
  manualRestaurantIds: section.manualRestaurantIds || [],
  searchTerm: section.filters.searchTerm || "",
  cuisines: (section.filters.cuisines || []).join(", "),
  tags: (section.filters.tags || []).join(", "),
  featuredClasses: section.filters.featuredClasses || [],
  minRating: section.filters.minRating != null ? String(section.filters.minRating) : "",
  maxEtaMinutes: section.filters.maxEtaMinutes != null ? String(section.filters.maxEtaMinutes) : "",
  maxDeliveryFee: section.filters.maxDeliveryFee != null ? String(section.filters.maxDeliveryFee) : "",
  freeDeliveryOnly: Boolean(section.filters.freeDeliveryOnly),
  dealsOnly: Boolean(section.filters.dealsOnly),
  openNowOnly: Boolean(section.filters.openNowOnly),
  sortBy: section.filters.sortBy || "FEATURED",
  sortDirection: section.filters.sortDirection || "DESC",
  scheduleEnabled: Boolean(section.schedule.enabled),
  daysOfWeek: section.schedule.daysOfWeek || [],
  startTime: section.schedule.startTime || "",
  endTime: section.schedule.endTime || "",
});

const formToPayload = (form: FormState): HomeCategoryPayload => ({
  title: form.title.trim(),
  slug: form.slug.trim() || undefined,
  subtitle: form.subtitle.trim() || null,
  description: form.description.trim() || null,
  isActive: form.isActive,
  sortOrder: Number(form.sortOrder || 0),
  filterMode: form.filterMode,
  maxRestaurants: Number(form.maxRestaurants || 8),
  manualRestaurantIds: form.manualRestaurantIds,
  filters: {
    searchTerm: form.searchTerm.trim() || null,
    cuisines: splitCsv(form.cuisines),
    tags: splitCsv(form.tags),
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
});

function formatFilterSummary(section: HomeCategorySection): string[] {
  const tags: string[] = [];
  if (section.filterMode !== "FILTER") {
    tags.push(`${section.manualRestaurantIds.length} valda restauranger`);
  }
  if (section.filters.cuisines?.length) tags.push(`Kök: ${section.filters.cuisines.join(", ")}`);
  if (section.filters.searchTerm) tags.push(`Sök: ${section.filters.searchTerm}`);
  if (section.filters.maxEtaMinutes != null) tags.push(`ETA ≤ ${section.filters.maxEtaMinutes} min`);
  if (section.filters.minRating != null) tags.push(`Betyg ≥ ${section.filters.minRating}`);
  if (section.filters.openNowOnly) tags.push("Endast öppna");
  if (section.filters.dealsOnly) tags.push("Måste ha deal");
  if (section.filters.freeDeliveryOnly) tags.push("Fri leverans");
  if (section.schedule.enabled) tags.push("Schemalagd");
  return tags.slice(0, 5);
}

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

  const restaurantsQuery = useQuery({
    queryKey: ["categories", "restaurants"],
    queryFn: getRestaurantOverview,
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

  const filteredRestaurants = useMemo(() => {
    const query = restaurantSearch.trim().toLowerCase();
    const items = restaurantsQuery.data || [];
    if (!query) return items;
    return items.filter((restaurant) =>
      `${restaurant.name} ${restaurant.slug} ${restaurant.city || ""}`.toLowerCase().includes(query),
    );
  }, [restaurantSearch, restaurantsQuery.data]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={section ? section.title : "Ny kategori"}
      description="Bygg rails för web och appen med samma filterlogik och samma tidsschema."
      widthClassName="max-w-[1200px]"
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            {section ? (
              <Button
                variant="danger"
                onClick={() => {
                  if (window.confirm(`Radera home-sektionen "${section.title}"?\n\nSektionen försvinner från web och app. Detta kan inte ångras.`)) {
                    deleteMutation.mutate();
                  }
                }}
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
          <Field label="Titel">
            <Input
              value={form.title}
              onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
              placeholder="t.ex. Pizza fredag"
            />
          </Field>
          <Field label="Slug (auto från titel om tom)">
            <Input
              value={form.slug}
              onChange={(event) => setForm((current) => ({ ...current, slug: event.target.value }))}
              placeholder="pizza-fredag"
            />
          </Field>
          <Field label="Underrubrik">
            <Input
              value={form.subtitle}
              onChange={(event) => setForm((current) => ({ ...current, subtitle: event.target.value }))}
              placeholder="Visas under rubriken på startsidan"
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
            <Field label="Beskrivning (intern, syns inte publikt)">
              <Textarea
                value={form.description}
                onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
              />
            </Field>
          </div>
        </div>

        <div className="surface-muted px-5 py-5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">Filterregler</p>
            <Filter size={16} className="text-[var(--accent-strong)]" />
          </div>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            Används för FILTER och HYBRID-mode. Tomt fält = ingen begränsning.
          </p>

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
            <Field label="Tags (kommaseparerat)">
              <Input
                value={form.tags}
                onChange={(event) => setForm((current) => ({ ...current, tags: event.target.value }))}
                placeholder="Halal, Burgare"
              />
            </Field>
            <Field label="Sortera efter">
              <div className="flex gap-2">
                <Select
                  value={form.sortBy}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, sortBy: event.target.value as HomeCategorySortBy }))
                  }
                >
                  <option value="FEATURED">Featured</option>
                  <option value="RATING">Betyg</option>
                  <option value="ETA">ETA</option>
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
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            Aktivera för att begränsa när kategorin visas (t.ex. fredagar 15–24).
          </p>

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
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            Används för MANUAL och HYBRID. I FILTER-mode visas dessa inte.
          </p>

          <div className="relative mt-4">
            <Search size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
            <Input
              className="pl-11"
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
                      className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left transition-all ${
                        active
                          ? "border-[var(--accent-strong)] bg-[rgba(243,191,87,0.08)]"
                          : "border-[var(--border-subtle)] bg-[rgba(255,255,255,0.02)] hover:border-[var(--accent-strong)]"
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
  );
}

export function CategoriesPage() {
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
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: (section: HomeCategorySection) =>
      updateCategory(section.id, { isActive: !section.isActive }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: categoriesQueryKey });
    },
  });

  const sortedCategories = useMemo(() => {
    const items = categories.data || [];
    return [...items].sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title, "sv"));
  }, [categories.data]);

  if (categories.isLoading) {
    return <Surface className="px-6 py-12 text-sm text-[var(--text-secondary)]">Laddar kategorier...</Surface>;
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

  const stats = {
    total: categories.data.length,
    active: categories.data.filter((section) => section.isActive).length,
    scheduled: categories.data.filter((section) => section.schedule.enabled).length,
    manual: categories.data.filter((section) => section.filterMode !== "FILTER").length,
  };

  return (
    <div className="page-stack">
      <PageHeader
        title="Kategorier"
        actions={
          <>
            <Button variant="secondary" onClick={() => void categories.refetch()}>Uppdatera</Button>
            <Button variant="primary" onClick={() => setCreateOpen(true)}>
              <Plus size={13} /> Ny kategori
            </Button>
          </>
        }
      />

      <Surface className="px-6 py-6">
        <p className="text-sm text-[var(--text-secondary)]">
          <strong>FILTER:</strong> väljer restauranger automatiskt baserat på regler.{" "}
          <strong>MANUAL:</strong> visar bara dem du själv valt.{" "}
          <strong>HYBRID:</strong> dina val först, fyll på med filter-träffar.
        </p>

        {sortedCategories.length === 0 ? (
          <div className="mt-6">
            <EmptyState title="Inga kategorier ännu" description="Tryck Ny kategori för att skapa din första rail." />
          </div>
        ) : (
          <div className="mt-6 grid gap-3">
            {sortedCategories.map((section, index) => {
              const summary = formatFilterSummary(section);
              return (
                <div key={section.id} className="surface-muted px-5 py-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[rgba(243,191,87,0.12)] text-[var(--accent-strong)]">
                        <Filter size={18} />
                      </div>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-lg font-black tracking-[-0.02em]">{section.title}</p>
                          <Badge tone={section.isActive ? "success" : "danger"}>
                            {section.isActive ? "Aktiv" : "Dold"}
                          </Badge>
                          <Badge tone="info">{section.filterMode}</Badge>
                          {section.schedule.enabled ? <Badge tone="warning">Schema</Badge> : null}
                        </div>
                        {section.subtitle ? (
                          <p className="mt-1 text-sm text-[var(--text-secondary)]">{section.subtitle}</p>
                        ) : null}
                        <div className="mt-2 flex flex-wrap gap-2">
                          {summary.map((tag) => (
                            <Badge key={tag} tone="neutral">{tag}</Badge>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex flex-col gap-1">
                        <Button
                          variant="secondary"
                          onClick={() => reorderMutation.mutate({ section, direction: "up" })}
                          disabled={index === 0 || reorderMutation.isPending}
                        >
                          <ArrowUp size={14} />
                        </Button>
                        <Button
                          variant="secondary"
                          onClick={() => reorderMutation.mutate({ section, direction: "down" })}
                          disabled={index === sortedCategories.length - 1 || reorderMutation.isPending}
                        >
                          <ArrowDown size={14} />
                        </Button>
                      </div>
                      <Button variant="secondary" onClick={() => toggleActiveMutation.mutate(section)}>
                        {section.isActive ? <EyeOff size={14} /> : <Eye size={14} />}
                      </Button>
                      <Button variant="primary" onClick={() => setActiveSection(section)}>
                        Öppna
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Surface>

      <CategoryEditorModal open={Boolean(activeSection)} section={activeSection} onClose={() => setActiveSection(null)} />
      <CategoryEditorModal open={createOpen} section={null} onClose={() => setCreateOpen(false)} />
    </div>
  );
}
