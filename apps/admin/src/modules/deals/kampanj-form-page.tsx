"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Trash2 } from "lucide-react";
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
import { Badge, Button, Field, Input, PageHeader, Select, Surface, Textarea } from "@/shared/components/ui";
import { ImageUploadField } from "@/shared/components/image-upload";

const CARD_TITLE = "text-[15px] font-extrabold tracking-[-0.3px]";

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
  appEnabled: boolean;
  appPlacement: string;
  appAudience: string;
  appTemplate: string;
  appSize: string;
  appRotating: boolean;
  appWeight: number;
  appClaimRequired: boolean;
  appClaimExpiresMinutes: string;
  appCooldownHours: string;
  appDpointsBonus: number;
  appMissionType: string;
  appCtaLabel: string;
  appTheme: string;
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
  appEnabled: false,
  appPlacement: "HOME_TOP",
  appAudience: "ALL",
  appTemplate: "DEAL_HERO",
  appSize: "LARGE",
  appRotating: true,
  appWeight: 10,
  appClaimRequired: true,
  appClaimExpiresMinutes: "",
  appCooldownHours: "",
  appDpointsBonus: 0,
  appMissionType: "",
  appCtaLabel: "",
  appTheme: "sunrise",
});

const SCOPE_OPTIONS: { value: DealScopeType; label: string; description: string; glyph: string }[] = [
  { value: "RESTAURANT", label: "Restaurang", description: "Rabatt på hela menyn", glyph: "%" },
  { value: "CATEGORY", label: "Kategori", description: "Rabatt på en kategoris produkter", glyph: "▦" },
  { value: "PRODUCT", label: "Produkt", description: "Rabatt på specifika produkter", glyph: "◷" },
  { value: "MIN_ORDER", label: "Min.order", description: "Rabatt vid beställning över X kr", glyph: "kr" },
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
        discountType: (d.discountType === "NONE" ? "NONE" : d.discountType === "FIXED_PRICE" ? "FIXED_PRICE" : d.discountType === "FIXED" ? "FIXED" : "PERCENTAGE") as DealDiscountType,
        discountValue: d.discountValue,
        minOrder: d.minOrder || 0,
        targetIds: d.targetIds || [],
        isActive: d.isActive,
        showOnSite: d.showOnSite,
        maxUsages: d.maxUsages ? String(d.maxUsages) : "",
        validFrom: d.validFrom ? d.validFrom.slice(0, 10) : "",
        validUntil: d.validUntil ? d.validUntil.slice(0, 10) : "",
        sortOrder: d.sortOrder || 0,
        appEnabled: Boolean(d.appEnabled),
        appPlacement: d.appPlacement || "HOME_TOP",
        appAudience: d.appAudience || "ALL",
        appTemplate: d.appTemplate || "DEAL_HERO",
        appSize: d.appSize || "LARGE",
        appRotating: d.appRotating !== false,
        appWeight: d.appWeight ?? 10,
        appClaimRequired: d.appClaimRequired !== false,
        appClaimExpiresMinutes: d.appClaimExpiresMinutes ? String(d.appClaimExpiresMinutes) : "",
        appCooldownHours: d.appCooldownHours ? String(d.appCooldownHours) : "",
        appDpointsBonus: d.appDpointsBonus || 0,
        appMissionType: d.appMissionType || "",
        appCtaLabel: d.appCtaLabel || "",
        appTheme: d.appTheme || "sunrise",
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
        appEnabled: d.appEnabled,
        appPlacement: d.appEnabled ? d.appPlacement : "HOME_TOP",
        appAudience: d.appEnabled ? d.appAudience : "ALL",
        appTemplate: d.appEnabled ? d.appTemplate : "DEAL_HERO",
        appSize: d.appEnabled ? d.appSize : "LARGE",
        appRotating: d.appEnabled ? d.appRotating : true,
        appWeight: d.appEnabled ? d.appWeight : 10,
        appClaimRequired: d.appEnabled ? d.appClaimRequired : true,
        appClaimExpiresMinutes: d.appEnabled && d.appClaimExpiresMinutes ? Number(d.appClaimExpiresMinutes) : null,
        appCooldownHours: d.appEnabled && d.appCooldownHours ? Number(d.appCooldownHours) : null,
        appDpointsBonus: d.appEnabled ? d.appDpointsBonus : 0,
        appMissionType: d.appEnabled ? d.appMissionType || null : null,
        appCtaLabel: d.appEnabled ? d.appCtaLabel || null : null,
        appTheme: d.appEnabled ? d.appTheme || null : null,
      };
      if (dealId) return updateAutomaticDeal(dealId, payload);
      return createAutomaticDeal(payload);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: dealsQueryKey });
      router.push(draft.appEnabled ? "/deals?tab=app" : "/deals?tab=kampanjer");
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
    if (draft.discountType === "NONE" && !draft.appEnabled) { setError("Ingen kontantrabatt kräver att App i Swift är aktivt, t.ex. fri leverans eller Dpoints."); return; }
    if (draft.scopeType === "MIN_ORDER" && draft.minOrder <= 0) { setError("Minimiorder måste vara > 0 för min-order-kampanj."); return; }
    if (draft.validFrom && draft.validUntil && draft.validFrom > draft.validUntil) { setError("Startdatum måste vara före slutdatum."); return; }
    setError(null);
    saveMutation.mutate(draft);
  };

  const isLoading = (isEditing && existingDeal.isLoading) || restaurants.isLoading;
  if (isLoading) return <div className="px-6 py-12 text-sm text-[var(--text-secondary)]">Laddar...</div>;

  const discountLabel =
    draft.discountType === "NONE" ? "Ingen kontantrabatt" : draft.discountType === "PERCENTAGE" ? "Rabatt (%)" : draft.discountType === "FIXED_PRICE" ? "Fast pris (kr)" : "Rabattbelopp (kr)";

  // Live badge-text för förhandsvisningen, speglar aktuellt rabattvärde/typ.
  const previewDiscount =
    draft.discountType === "NONE"
      ? (draft.appDpointsBonus > 0 ? `+${draft.appDpointsBonus} Dpoints` : "Fri leverans / app-only")
      : draft.discountType === "PERCENTAGE"
      ? `${draft.discountValue}% rabatt`
      : draft.discountType === "FIXED_PRICE"
        ? `${draft.discountValue} kr fast pris`
        : `${draft.discountValue} kr rabatt`;
  const previewRestaurant = draft.isGlobal
    ? "Alla restauranger"
    : (restaurants.data ?? []).find((r) => r.id === draft.restaurantId)?.name || "Ingen restaurang";

  return (
    <div className="page-stack">
      <PageHeader
        breadcrumb="Katalog / Deals"
        title={isEditing ? draft.title || "Redigera deal" : "Ny deal"}
        onBack={() => router.push("/deals?tab=kampanjer")}
        actions={
          <>
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
              {saveMutation.isPending ? <><Loader2 size={14} className="animate-spin" /> Sparar...</> : "Publicera"}
            </Button>
          </>
        }
      />

      {error && (
        <p className="rounded-xl border border-[var(--danger)] bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger-text)]">{error}</p>
      )}

      <div className="grid gap-3.5 lg:grid-cols-[1.4fr_1fr]">
        {/* Left column */}
        <div className="grid gap-3.5 content-start">
          {/* Basic info */}
          <Surface className="px-5 py-5 grid gap-5">
            <p className={CARD_TITLE}>Grunduppgifter</p>
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
          <Surface className="px-5 py-5">
            <p className={CARD_TITLE}>Typ av deal</p>
            <div className="mt-3.5 grid grid-cols-3 gap-2.5">
              {SCOPE_OPTIONS.map((opt) => {
                const selected = draft.scopeType === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setDraft((prev) => ({
                      ...prev,
                      scopeType: opt.value,
                      targetIds: [],
                      discountType: (opt.value !== "PRODUCT" && opt.value !== "CATEGORY" && prev.discountType === "FIXED_PRICE") ? "PERCENTAGE" : prev.discountType,
                    }))}
                    className={`rounded-[11px] p-3.5 text-left transition-all ${
                      selected
                        ? "border-2 border-[var(--accent)] bg-[#fff7f3]"
                        : "border border-[var(--border-strong)] hover:border-[var(--accent)]"
                    }`}
                  >
                    <div className={`text-lg font-black leading-none ${selected ? "text-[var(--accent)]" : "text-[var(--text-secondary)]"}`}>{opt.glyph}</div>
                    <div className="mt-1.5 text-[12.5px] font-bold text-[var(--text-primary)]">{opt.label}</div>
                    <div className="mt-0.5 text-[11px] text-[var(--text-muted)]">{opt.description}</div>
                  </button>
                );
              })}
            </div>
          </Surface>

          {/* Villkor */}
          <Surface className="px-5 py-5">
            <p className={CARD_TITLE}>Villkor</p>
            <div className="mt-3">
              {/* Rabatt — primär rabatt: typ + värde (orange-kantad input) */}
              <div className="flex items-center justify-between gap-3 border-t border-[var(--row-divider)] py-3">
                <span className="text-[13px] font-semibold text-[var(--text-primary)]">Rabatt</span>
                <div className="flex items-center gap-2">
                  <Select
                    value={draft.discountType}
                    onChange={(e) => set("discountType", e.target.value as DealDiscountType)}
                    className="w-auto"
                    aria-label={discountLabel}
                  >
                    <option value="NONE">Ingen kontantrabatt</option>
                    <option value="PERCENTAGE">Procent (%)</option>
                    {supportsFixedPrice && <option value="FIXED_PRICE">Fast pris (kr)</option>}
                    {!supportsFixedPrice && <option value="FIXED">Fast belopp (kr)</option>}
                  </Select>
                  {draft.discountType !== "NONE" && (
                    <Input
                      type="number"
                      min="0"
                      value={draft.discountValue}
                      onChange={(e) => set("discountValue", Number(e.target.value))}
                      aria-label={discountLabel}
                      className="w-24 border-2 border-[var(--accent)] text-right font-extrabold"
                    />
                  )}
                </div>
              </div>
              {/* Min. ordervärde — endast meningsfullt för MIN_ORDER-scope */}
              {draft.scopeType === "MIN_ORDER" && (
                <div className="flex items-center justify-between gap-3 border-t border-[var(--row-divider)] py-3">
                  <span className="text-[13px] font-semibold text-[var(--text-primary)]">Min. ordervärde</span>
                  <Input
                    type="number"
                    min="0"
                    value={draft.minOrder}
                    onChange={(e) => set("minOrder", Number(e.target.value))}
                    aria-label="Minimiorder (kr)"
                    className="w-28 text-right"
                  />
                </div>
              )}
              {/* Max rabatt — taket sätts via max antal användningar (befintligt fält) */}
              <div className="flex items-center justify-between gap-3 border-t border-[var(--row-divider)] py-3">
                <span className="text-[13px] font-semibold text-[var(--text-primary)]">Max antal användningar</span>
                <Input
                  type="number"
                  min="1"
                  value={draft.maxUsages}
                  onChange={(e) => set("maxUsages", e.target.value)}
                  placeholder="∞"
                  aria-label="Max antal användningar"
                  className="w-28 text-right"
                />
              </div>
            </div>
          </Surface>

          <Surface className="px-5 py-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className={CARD_TITLE}>App i Swift</p>
                <p className="mt-1 text-xs font-medium text-[var(--text-muted)]">
                  Styr korten som syns i hemskärmen, sticky hot deal och appens claim-flöde.
                </p>
              </div>
              <label className="flex items-center gap-2 text-xs font-extrabold text-[var(--text-primary)]">
                <input
                  type="checkbox"
                  checked={draft.appEnabled}
                  onChange={(e) => set("appEnabled", e.target.checked)}
                  className="h-4 w-4 accent-[var(--accent)]"
                />
                Aktiv
              </label>
            </div>

            {draft.appEnabled && (
              <div className="mt-4 grid gap-4">
                <div className="grid gap-3 md:grid-cols-3">
                  <Field label="Placering">
                    <Select value={draft.appPlacement} onChange={(e) => set("appPlacement", e.target.value)}>
                      <option value="HOME_TOP">Hem topp</option>
                      <option value="HOME_INLINE">Hem mellan restauranger</option>
                      <option value="CART">Kassa</option>
                      <option value="REWARDS">Rewards</option>
                      <option value="POST_ORDER">Efter order</option>
                    </Select>
                  </Field>
                  <Field label="Målgrupp">
                    <Select value={draft.appAudience} onChange={(e) => set("appAudience", e.target.value)}>
                      <option value="ALL">Alla</option>
                      <option value="GUEST">Gäst</option>
                      <option value="LOGGED_IN">Inloggad</option>
                      <option value="NEW_CUSTOMER">Ny kund</option>
                      <option value="NEW_LOGGED_IN">Ny inloggad kund</option>
                      <option value="RETURNING">Återkommande</option>
                    </Select>
                  </Field>
                  <Field label="Design">
                    <Select value={draft.appTemplate} onChange={(e) => set("appTemplate", e.target.value)}>
                      <option value="DEAL_HERO">Stor hero</option>
                      <option value="TICKET">Rabatt-ticket</option>
                      <option value="FREE_DELIVERY">Fri leverans</option>
                      <option value="PRODUCT_SPOTLIGHT">Produkt/Restaurang</option>
                      <option value="MISSION">Uppdrag</option>
                    </Select>
                  </Field>
                </div>

                <div className="grid gap-3 md:grid-cols-4">
                  <Field label="Storlek">
                    <Select value={draft.appSize} onChange={(e) => set("appSize", e.target.value)}>
                      <option value="LARGE">Stor</option>
                      <option value="COMPACT">Liten</option>
                    </Select>
                  </Field>
                  <Field label="Vikt/rotation">
                    <Input type="number" min="1" value={draft.appWeight} onChange={(e) => set("appWeight", Number(e.target.value))} />
                  </Field>
                  <Field label="CTA">
                    <Input value={draft.appCtaLabel} onChange={(e) => set("appCtaLabel", e.target.value)} placeholder="Hämta" />
                  </Field>
                  <Field label="Tema">
                    <Select value={draft.appTheme} onChange={(e) => set("appTheme", e.target.value)}>
                      <option value="sunrise">Orange premium</option>
                      <option value="fresh">Grön fräsch</option>
                      <option value="blue">Blå fri leverans</option>
                      <option value="pink">Rosa rabatt</option>
                      <option value="dark">Mörk launch</option>
                    </Select>
                  </Field>
                </div>

                <div className="grid gap-3 md:grid-cols-4">
                  <label className="flex min-h-[44px] items-center gap-2 rounded-xl border border-[var(--border-strong)] px-3 text-xs font-bold text-[var(--text-primary)]">
                    <input type="checkbox" checked={draft.appRotating} onChange={(e) => set("appRotating", e.target.checked)} className="h-4 w-4 accent-[var(--accent)]" />
                    Roterar i appen
                  </label>
                  <label className="flex min-h-[44px] items-center gap-2 rounded-xl border border-[var(--border-strong)] px-3 text-xs font-bold text-[var(--text-primary)]">
                    <input type="checkbox" checked={draft.appClaimRequired} onChange={(e) => set("appClaimRequired", e.target.checked)} className="h-4 w-4 accent-[var(--accent)]" />
                    Måste claimas
                  </label>
                  <Field label="Claim gäller (min)">
                    <Input type="number" min="1" value={draft.appClaimExpiresMinutes} onChange={(e) => set("appClaimExpiresMinutes", e.target.value)} placeholder="1440" />
                  </Field>
                  <Field label="Cooldown (h)">
                    <Input type="number" min="0" value={draft.appCooldownHours} onChange={(e) => set("appCooldownHours", e.target.value)} placeholder="24" />
                  </Field>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <Field label="Dpoints bonus">
                    <Input type="number" min="0" value={draft.appDpointsBonus} onChange={(e) => set("appDpointsBonus", Number(e.target.value))} />
                  </Field>
                  <Field label="Uppdrag">
                    <Select
                      value={draft.appMissionType}
                      onChange={(e) => setDraft((prev) => ({
                        ...prev,
                        appMissionType: e.target.value,
                        appTemplate: e.target.value ? "MISSION" : prev.appTemplate,
                        discountType: e.target.value ? "NONE" : prev.discountType,
                      }))}
                    >
                      <option value="">Ingen</option>
                      <option value="THREE_ORDERS_WEEK">Köp 3 gånger / vecka</option>
                    </Select>
                  </Field>
                </div>
              </div>
            )}
          </Surface>

          {/* Targets - only for item scopes */}
          {isItemScope && (
            <Surface className="px-5 py-5">
              <div className="flex items-center justify-between">
                <p className={CARD_TITLE}>{draft.scopeType === "CATEGORY" ? "Välj kategorier" : "Välj produkter"}</p>
                {draft.targetIds.length > 0 && <Badge tone="info">{draft.targetIds.length} valda</Badge>}
              </div>
              <div className="mt-3.5">
                {!activeRestaurantId ? (
                  <p className="text-sm text-[var(--text-muted)]">Välj restaurang för att se {draft.scopeType === "CATEGORY" ? "kategorier" : "produkter"}.</p>
                ) : availableTargets.length === 0 ? (
                  <p className="text-sm text-[var(--text-muted)]">Inga {draft.scopeType === "CATEGORY" ? "kategorier" : "produkter"} hittades.</p>
                ) : (
                  <div className="max-h-64 overflow-y-auto grid gap-1.5">
                    {availableTargets.map((t) => {
                      const checked = draft.targetIds.includes(t.id);
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => toggleTarget(t.id)}
                          className={`rounded-xl border px-4 py-3 text-left transition-all ${
                            checked
                              ? "border-2 border-[var(--accent)] bg-[#fff7f3]"
                              : "border border-[var(--border-strong)] hover:border-[var(--accent)]"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className={`font-semibold text-sm ${checked ? "text-[var(--accent)]" : "text-[var(--text-primary)]"}`}>{t.label}</p>
                              <p className="text-xs text-[var(--text-muted)] mt-0.5">{t.meta}</p>
                            </div>
                            {checked && <Badge tone="success">Vald</Badge>}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </Surface>
          )}
        </div>

        {/* Right column */}
        <div className="grid gap-3.5 content-start">
          {/* Gäller */}
          <Surface className="px-5 py-5">
            <p className={CARD_TITLE}>Gäller</p>
            <div className="mt-3">
              {/* Restauranger */}
              <div className="border-t border-[var(--row-divider)] py-3">
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={draft.isGlobal}
                    onChange={(e) => setDraft((prev) => ({ ...prev, isGlobal: e.target.checked, restaurantId: e.target.checked ? "" : prev.restaurantId }))}
                    className="h-4 w-4 accent-[var(--accent)]"
                  />
                  <span className="text-[13px] font-semibold text-[var(--text-primary)]">Gäller alla restauranger</span>
                </label>
                {!draft.isGlobal && (
                  <Select value={draft.restaurantId} onChange={(e) => set("restaurantId", e.target.value)} className="mt-2.5" aria-label="Restaurang">
                    <option value="">Välj restaurang...</option>
                    {(restaurants.data ?? []).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </Select>
                )}
              </div>
              {/* Period */}
              <div className="border-t border-[var(--row-divider)] py-3">
                <span className="text-[13px] font-semibold text-[var(--text-primary)]">Period</span>
                <div className="mt-2.5 grid grid-cols-2 gap-3">
                  <Field label="Giltig från (valfritt)">
                    <Input type="date" value={draft.validFrom} onChange={(e) => set("validFrom", e.target.value)} />
                  </Field>
                  <Field label="Giltig till (valfritt)">
                    <Input type="date" value={draft.validUntil} onChange={(e) => set("validUntil", e.target.value)} />
                  </Field>
                </div>
              </div>
              {/* Synlighet/status */}
              <div className="border-t border-[var(--row-divider)] py-3 grid gap-3">
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
              </div>
            </div>
          </Surface>

          {/* Förhandsvisning — mörkt kort, speglar live-rabatt */}
          <Surface className="!bg-[#111113] !border-transparent px-[18px] py-[18px] text-white">
            <p className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-[#9CA3AF]">Förhandsvisning</p>
            <div
              className="relative mt-3 h-[120px] overflow-hidden rounded-[14px]"
              style={{
                background: draft.imageUrl
                  ? `center/cover no-repeat url(${draft.imageUrl})`
                  : "linear-gradient(150deg,#3a2a20,#1a120d)",
              }}
            >
              <span className="absolute left-3 bottom-3 rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-extrabold text-white">
                {draft.badgeText || previewDiscount}
              </span>
              <span className="absolute right-3 top-3 font-mono text-[9px] text-white/40">så ser kunden den</span>
            </div>
            {draft.title && (
              <div className="mt-3">
                <p className="text-sm font-black leading-snug">{draft.title}</p>
                <p className="mt-0.5 text-[11px] text-white/50">{previewRestaurant}</p>
              </div>
            )}
          </Surface>
        </div>
      </div>
    </div>
  );
}
