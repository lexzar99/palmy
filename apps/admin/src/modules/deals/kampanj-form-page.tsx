"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Trash2 } from "lucide-react";
import {
  createAutomaticDeal,
  dealsQueryKey,
  dealByIdQueryKey,
  dealCategoriesQueryKey,
  dealProductsQueryKey,
  dealRestaurantsQueryKey,
  deleteAutomaticDeal,
  getDealById,
  getDealCategories,
  getDealProducts,
  getDealRestaurants,
  updateAutomaticDeal,
  type DealDiscountType,
  type DealScopeType,
} from "@/modules/deals/api";
import { Badge, Button, Field, Input, Select, Surface, Textarea } from "@/shared/components/ui";
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
  maxUsages: string;
  validFrom: string;
  validUntil: string;
  sortOrder: number;
};

const defaultDraft = (): Draft => ({
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
  maxUsages: "",
  validFrom: "",
  validUntil: "",
  sortOrder: 0,
});

const SCOPE_OPTIONS: { value: DealScopeType; label: string; description: string; emoji: string }[] = [
  { value: "RESTAURANT", label: "Restaurang", description: "Rabatt på hela menyn", emoji: "🍽️" },
  { value: "CATEGORY", label: "Kategori", description: "Rabatt på en kategoris produkter", emoji: "📂" },
  { value: "PRODUCT", label: "Produkt", description: "Rabatt på specifika produkter", emoji: "🛍️" },
  { value: "MIN_ORDER", label: "Min.order", description: "Rabatt vid beställning över X kr", emoji: "💰" },
];

export function KampanjFormPage({ dealId }: { dealId?: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const isEditing = Boolean(dealId);

  const existingDeal = useQuery({
    queryKey: dealByIdQueryKey(dealId!),
    queryFn: () => getDealById(dealId!),
    enabled: Boolean(dealId),
  });

  const [draft, setDraft] = useState<Draft>(defaultDraft());
  const [error, setError] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);

  const restaurants = useQuery({ queryKey: dealRestaurantsQueryKey, queryFn: getDealRestaurants });
  const activeRestaurantId = draft.isGlobal ? null : (draft.restaurantId || null);

  const categories = useQuery({
    queryKey: dealCategoriesQueryKey(activeRestaurantId),
    queryFn: () => getDealCategories(activeRestaurantId!),
    enabled: Boolean(activeRestaurantId),
  });

  const products = useQuery({
    queryKey: dealProductsQueryKey(activeRestaurantId),
    queryFn: () => getDealProducts(activeRestaurantId!),
    enabled: Boolean(activeRestaurantId),
  });

  useEffect(() => {
    if (existingDeal.data && !initialized) {
      const d = existingDeal.data;
      setDraft({
        title: d.title,
        description: d.description || "",
        badgeText: d.badgeText || "",
        imageUrl: d.imageUrl || "",
        restaurantId: d.restaurantId || d.applicableRestaurantIds?.[0] || "",
        isGlobal: d.isGlobal,
        scopeType: d.scopeType,
        discountType: (d.discountType === "FIXED_PRICE" ? "FIXED_PRICE" : d.discountType === "FIXED" ? "FIXED" : "PERCENTAGE") as DealDiscountType,
        discountValue: d.discountValue,
        minOrder: d.minOrder || 0,
        targetIds: d.targetIds || [],
        isActive: d.isActive,
        showOnSite: d.showOnSite,
        maxUsages: d.maxUsages ? String(d.maxUsages) : "",
        validFrom: d.validFrom ? d.validFrom.slice(0, 10) : "",
        validUntil: d.validUntil ? d.validUntil.slice(0, 10) : "",
        sortOrder: d.sortOrder || 0,
      });
      setInitialized(true);
    }
  }, [existingDeal.data, initialized]);

  const isItemScope = draft.scopeType === "PRODUCT" || draft.scopeType === "CATEGORY";
  const supportsFixedPrice = draft.scopeType === "PRODUCT" || draft.scopeType === "CATEGORY";

  const availableTargets = useMemo(() => {
    if (draft.scopeType === "CATEGORY") return (categories.data ?? []).map((c) => ({ id: c.id, label: c.name, meta: `${c._count?.products ?? 0} produkter` }));
    return (products.data ?? []).map((p) => ({ id: p.id, label: p.name, meta: `${p.category.name} · ${(p.price / 100).toFixed(0)} kr` }));
  }, [categories.data, products.data, draft.scopeType]);

  const toggleTarget = (id: string) =>
    setDraft((prev) => ({
      ...prev,
      targetIds: prev.targetIds.includes(id) ? prev.targetIds.filter((x) => x !== id) : [...prev.targetIds, id],
    }));

  const set = <K extends keyof Draft>(key: K, val: Draft[K]) =>
    setDraft((prev) => ({ ...prev, [key]: val }));

  const saveMutation = useMutation({
    mutationFn: async (d: Draft) => {
      const payload = {
        title: d.title,
        description: d.description || null,
        badgeText: d.badgeText || null,
        imageUrl: d.imageUrl || null,
        scopeType: d.scopeType,
        discountType: d.discountType,
        discountValue: d.discountValue,
        minOrder: d.scopeType === "MIN_ORDER" ? d.minOrder : 0,
        targetIds: d.targetIds,
        restaurantId: d.isGlobal ? null : d.restaurantId || null,
        isGlobal: d.isGlobal,
        isActive: d.isActive,
        showOnSite: d.showOnSite,
        popupEnabled: false,
        maxUsages: d.maxUsages ? Number(d.maxUsages) : null,
        validFrom: d.validFrom || null,
        validUntil: d.validUntil || null,
        sortOrder: d.sortOrder,
      };
      if (dealId) return updateAutomaticDeal(dealId, payload);
      return createAutomaticDeal(payload);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: dealsQueryKey });
      router.push("/deals?tab=kampanjer");
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg ?? "Kunde inte spara deal.");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteAutomaticDeal(dealId!),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: dealsQueryKey });
      router.push("/deals?tab=kampanjer");
    },
    onError: () => setError("Kunde inte radera deal."),
  });

  const handleSave = () => {
    if (!draft.title.trim()) { setError("Titel krävs."); return; }
    if (!draft.isGlobal && !draft.restaurantId) { setError("Välj restaurang eller aktivera 'Alla restauranger'."); return; }
    if (!Number.isFinite(draft.discountValue) || draft.discountValue < 0) { setError("Rabattvärde måste vara ≥ 0."); return; }
    if (draft.discountType === "PERCENTAGE" && draft.discountValue > 100) { setError("Procent-rabatt får inte överstiga 100%."); return; }
    if (draft.scopeType === "MIN_ORDER" && draft.minOrder <= 0) { setError("Minimiorder måste vara > 0 för min-order-kampanj."); return; }
    if (draft.validFrom && draft.validUntil && draft.validFrom > draft.validUntil) { setError("Startdatum måste vara före slutdatum."); return; }
    setError(null);
    saveMutation.mutate(draft);
  };

  const isLoading = (isEditing && existingDeal.isLoading) || restaurants.isLoading;
  if (isLoading) return <div className="px-6 py-12 text-sm text-[var(--text-secondary)]">Laddar...</div>;

  const discountLabel =
    draft.discountType === "PERCENTAGE" ? "Rabatt (%)" : draft.discountType === "FIXED_PRICE" ? "Fast pris (kr)" : "Rabattbelopp (kr)";

  return (
    <div className="page-stack">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 px-1">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.push("/deals?tab=kampanjer")}
            className="flex items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] px-3 py-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
          >
            <ArrowLeft size={14} /> Tillbaka
          </button>
          <h1 className="text-xl font-black tracking-[-0.02em]">
            {isEditing ? "Redigera kampanj" : "Ny kampanj"}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {isEditing && (
            <Button
              variant="danger"
              onClick={() => { if (!confirm("Radera denna kampanj? Kan inte ångras.")) return; deleteMutation.mutate(); }}
              disabled={deleteMutation.isPending}
            >
              <Trash2 size={14} /> Radera
            </Button>
          )}
          <Button variant="primary" onClick={handleSave} disabled={saveMutation.isPending}>
            {saveMutation.isPending ? <><Loader2 size={14} className="animate-spin" /> Sparar...</> : "Spara kampanj"}
          </Button>
        </div>
      </div>

      {error && (
        <p className="rounded-xl bg-[rgba(239,68,68,0.1)] px-4 py-3 text-sm text-red-400">{error}</p>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
        {/* Left column */}
        <div className="grid gap-4 content-start">
          {/* Basic info */}
          <Surface className="px-6 py-6 grid gap-5">
            <Field label="Titel">
              <Input value={draft.title} onChange={(e) => set("title", e.target.value)} placeholder="Sommarens pizzaerbjudande" autoFocus />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Badge-text (valfritt)">
                <Input value={draft.badgeText} onChange={(e) => set("badgeText", e.target.value)} placeholder="-20%" />
              </Field>
              <Field label="Sorteringsordning">
                <Input type="number" value={draft.sortOrder} onChange={(e) => set("sortOrder", Number(e.target.value))} />
              </Field>
            </div>
            <Field label="Beskrivning (valfritt)">
              <Textarea value={draft.description} onChange={(e) => set("description", e.target.value)} placeholder="Beskriv erbjudandet för kunderna" />
            </Field>
            <ImageUploadField label="Bannerbild (valfritt)" kind="misc" value={draft.imageUrl} onChange={(url) => set("imageUrl", url)} />
          </Surface>

          {/* Deal type */}
          <Surface className="px-6 py-6 grid gap-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Typ av kampanj</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {SCOPE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setDraft((prev) => ({
                    ...prev,
                    scopeType: opt.value,
                    targetIds: [],
                    discountType: (opt.value !== "PRODUCT" && opt.value !== "CATEGORY" && prev.discountType === "FIXED_PRICE") ? "PERCENTAGE" : prev.discountType,
                  }))}
                  className={`rounded-xl border px-4 py-3 text-left text-sm transition-all ${
                    draft.scopeType === opt.value
                      ? "border-[var(--accent)] bg-[rgba(99,102,241,0.15)]"
                      : "border-[var(--border-subtle)] bg-[var(--surface-secondary)] hover:border-[var(--border-default)]"
                  }`}
                >
                  <div className="text-xl mb-1">{opt.emoji}</div>
                  <div className={`font-semibold ${draft.scopeType === opt.value ? "text-[var(--accent)]" : "text-[var(--text-primary)]"}`}>{opt.label}</div>
                  <div className="text-xs text-[var(--text-muted)] mt-0.5">{opt.description}</div>
                </button>
              ))}
            </div>
          </Surface>

          {/* Discount */}
          <Surface className="px-6 py-6 grid gap-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Rabatt</p>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Rabatttyp">
                <Select value={draft.discountType} onChange={(e) => set("discountType", e.target.value as DealDiscountType)}>
                  <option value="PERCENTAGE">Procent (%)</option>
                  {supportsFixedPrice && <option value="FIXED_PRICE">Fast pris (kr)</option>}
                  {!supportsFixedPrice && <option value="FIXED">Fast belopp (kr)</option>}
                </Select>
              </Field>
              <Field label={discountLabel}>
                <Input type="number" min="0" value={draft.discountValue} onChange={(e) => set("discountValue", Number(e.target.value))} />
              </Field>
              {draft.scopeType === "MIN_ORDER" && (
                <Field label="Minimiorder (kr)">
                  <Input type="number" min="0" value={draft.minOrder} onChange={(e) => set("minOrder", Number(e.target.value))} />
                </Field>
              )}
            </div>
          </Surface>

          {/* Targets - only for item scopes */}
          {isItemScope && (
            <Surface className="px-6 py-6 grid gap-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                  {draft.scopeType === "CATEGORY" ? "Välj kategorier" : "Välj produkter"}
                </p>
                {draft.targetIds.length > 0 && <Badge tone="info">{draft.targetIds.length} valda</Badge>}
              </div>
              {!activeRestaurantId ? (
                <p className="text-sm text-[var(--text-muted)]">Välj restaurang för att se {draft.scopeType === "CATEGORY" ? "kategorier" : "produkter"}.</p>
              ) : availableTargets.length === 0 ? (
                <p className="text-sm text-[var(--text-muted)]">Inga {draft.scopeType === "CATEGORY" ? "kategorier" : "produkter"} hittades.</p>
              ) : (
                <div className="max-h-64 overflow-y-auto grid gap-1.5">
                  {availableTargets.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => toggleTarget(t.id)}
                      className={`rounded-xl border px-4 py-3 text-left transition-all ${
                        draft.targetIds.includes(t.id)
                          ? "border-[var(--accent)] bg-[rgba(99,102,241,0.12)]"
                          : "border-[var(--border-subtle)] bg-[var(--surface-secondary)] hover:border-[var(--border-default)]"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className={`font-semibold text-sm ${draft.targetIds.includes(t.id) ? "text-[var(--accent)]" : "text-[var(--text-primary)]"}`}>{t.label}</p>
                          <p className="text-xs text-[var(--text-muted)] mt-0.5">{t.meta}</p>
                        </div>
                        {draft.targetIds.includes(t.id) && <Badge tone="success">Vald</Badge>}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </Surface>
          )}
        </div>

        {/* Right column - settings */}
        <div className="grid gap-4 content-start">
          <Surface className="px-6 py-6 grid gap-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Restaurang</p>
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={draft.isGlobal}
                onChange={(e) => setDraft((prev) => ({ ...prev, isGlobal: e.target.checked, restaurantId: e.target.checked ? "" : prev.restaurantId }))}
                className="accent-indigo-500 h-4 w-4"
              />
              <span className="text-sm font-medium">Gäller alla restauranger</span>
            </label>
            {!draft.isGlobal && (
              <Field label="Restaurang">
                <Select value={draft.restaurantId} onChange={(e) => set("restaurantId", e.target.value)}>
                  <option value="">Välj restaurang...</option>
                  {(restaurants.data ?? []).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </Select>
              </Field>
            )}
          </Surface>

          <Surface className="px-6 py-6 grid gap-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Inställningar</p>
            <Field label="Status">
              <Select value={draft.isActive ? "active" : "inactive"} onChange={(e) => set("isActive", e.target.value === "active")}>
                <option value="active">Aktiv</option>
                <option value="inactive">Inaktiv</option>
              </Select>
            </Field>
            <Field label="Synlig på sajten">
              <Select value={draft.showOnSite ? "yes" : "no"} onChange={(e) => set("showOnSite", e.target.value === "yes")}>
                <option value="yes">Ja — visas i kassan & spotlight</option>
                <option value="no">Nej</option>
              </Select>
            </Field>
          </Surface>

          {/* Avancerat — sällan-använda fält bakom en utfällning så grund-flödet
              hålls rent (gränser + giltighetstid). */}
          <details className="group">
            <summary className="flex cursor-pointer items-center justify-between rounded-xl border border-[var(--border-subtle)] px-5 py-3 text-sm font-semibold text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]">
              Avancerat
              <span className="text-[var(--text-muted)] transition-transform group-open:rotate-180">⌄</span>
            </summary>
            <Surface className="mt-2 px-6 py-6 grid gap-4">
              <Field label="Max antal användningar (tom = ∞)">
                <Input type="number" min="1" value={draft.maxUsages} onChange={(e) => set("maxUsages", e.target.value)} placeholder="Obegränsat" />
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Giltig från (valfritt)">
                  <Input type="date" value={draft.validFrom} onChange={(e) => set("validFrom", e.target.value)} />
                </Field>
                <Field label="Giltig till (valfritt)">
                  <Input type="date" value={draft.validUntil} onChange={(e) => set("validUntil", e.target.value)} />
                </Field>
              </div>
            </Surface>
          </details>

          {/* Preview */}
          {draft.title && (
            <Surface className="px-6 py-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-3">Förhandsvisning</p>
              <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)] p-4">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-black text-base leading-snug">{draft.title}</p>
                  <span className="shrink-0 rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs font-bold text-emerald-400">Aktiv</span>
                </div>
                <p className="mt-1 text-sm font-semibold">
                  {draft.discountType === "PERCENTAGE" ? `-${draft.discountValue}%` : draft.discountType === "FIXED_PRICE" ? `${draft.discountValue} kr fast pris` : `-${draft.discountValue} kr`}
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <span className="rounded-full border border-[rgba(99,102,241,0.3)] bg-[rgba(99,102,241,0.1)] px-2 py-0.5 text-xs text-indigo-400">
                    {SCOPE_OPTIONS.find((o) => o.value === draft.scopeType)?.label}
                  </span>
                  {draft.badgeText && <span className="rounded-full border border-[rgba(243,191,87,0.3)] bg-[rgba(243,191,87,0.1)] px-2 py-0.5 text-xs text-amber-400">{draft.badgeText}</span>}
                </div>
                <p className="mt-2 text-xs text-[var(--text-muted)]">
                  {draft.isGlobal ? "Alla restauranger" : (restaurants.data ?? []).find((r) => r.id === draft.restaurantId)?.name || "Ingen restaurang"}
                </p>
              </div>
            </Surface>
          )}
        </div>
      </div>
    </div>
  );
}
