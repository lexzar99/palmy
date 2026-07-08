"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Send, Trash2 } from "lucide-react";
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

const CARD_TITLE = "text-[15px] font-extrabold tracking-[-0.3px]";

type Draft = {
  title: string;
  description: string;
  restaurantId: string;
  applicableRestaurantIds: string[];
  isGlobal: boolean;
  scopeType: DealScopeType;
  discountType: DealDiscountType;
  discountValue: number;
  freeDelivery: boolean;
  minOrder: number;
  targetIds: string[];
  isActive: boolean;
  maxUsages: string;
  maxUsesPerCustomer: string;
  validFrom: string;
  validUntil: string;
};

const defaultDraft = (): Draft => ({
  title: "",
  description: "",
  restaurantId: "",
  applicableRestaurantIds: [],
  isGlobal: false,
  scopeType: "RESTAURANT",
  discountType: "PERCENTAGE",
  discountValue: 10,
  freeDelivery: false,
  minOrder: 0,
  targetIds: [],
  isActive: true,
  maxUsages: "",
  maxUsesPerCustomer: "0",
  validFrom: "",
  validUntil: "",
});

const SCOPE_OPTIONS: { value: DealScopeType; label: string; description: string; glyph: string }[] = [
  { value: "RESTAURANT", label: "Restaurang", description: "Rabatt på hela menyn", glyph: "%" },
  { value: "CATEGORY", label: "Kategori", description: "Rabatt på en kategoris produkter", glyph: "▦" },
  { value: "PRODUCT", label: "Produkt", description: "Rabatt på specifika produkter", glyph: "◷" },
  { value: "MIN_ORDER", label: "Min.order", description: "Rabatt vid beställning över X kr", glyph: "kr" },
];

export function KampanjFormPage({ dealId }: { dealId?: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const isEditing = Boolean(dealId);

  const existingDeal = useQuery({
    queryKey: dealByIdQueryKey(dealId!),
    queryFn: () => getDealById(dealId!),
    enabled: Boolean(dealId),
  });

  // Prefill från t.ex. menyns "Skapa produktdeal": ?scope=PRODUCT&restaurant=<id>&target=<produktId>&title=...
  const [draft, setDraft] = useState<Draft>(() => {
    const d = defaultDraft();
    if (dealId) return d;
    const scope = searchParams.get("scope");
    if (scope === "PRODUCT" || scope === "CATEGORY" || scope === "MIN_ORDER" || scope === "RESTAURANT") d.scopeType = scope as DealScopeType;
    const restaurant = searchParams.get("restaurant");
    if (restaurant) {
      d.restaurantId = restaurant;
      d.applicableRestaurantIds = [restaurant];
    }
    const target = searchParams.get("target");
    if (target) d.targetIds = [target];
    const title = searchParams.get("title");
    if (title) d.title = title;
    return d;
  });
  const [error, setError] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);

  const restaurants = useQuery({ queryKey: dealRestaurantsQueryKey, queryFn: getDealRestaurants });
  const activeRestaurantId = draft.isGlobal ? null : (draft.restaurantId || draft.applicableRestaurantIds[0] || null);

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
        restaurantId: d.restaurantId || d.applicableRestaurantIds?.[0] || "",
        applicableRestaurantIds: d.applicableRestaurantIds?.length ? d.applicableRestaurantIds : d.restaurantId ? [d.restaurantId] : [],
        isGlobal: d.isGlobal,
        scopeType: d.scopeType,
        discountType: (d.discountType === "NONE" ? "NONE" : d.discountType === "FIXED_PRICE" ? "FIXED_PRICE" : d.discountType === "FIXED" ? "FIXED" : "PERCENTAGE") as DealDiscountType,
        discountValue: d.discountValue,
        freeDelivery: Boolean(d.freeDelivery),
        minOrder: d.minOrder || 0,
        targetIds: d.targetIds || [],
        isActive: d.isActive,
        maxUsages: d.maxUsages ? String(d.maxUsages) : "",
        maxUsesPerCustomer: d.maxUsesPerCustomer != null ? String(d.maxUsesPerCustomer) : "0",
        validFrom: d.validFrom ? d.validFrom.slice(0, 10) : "",
        validUntil: d.validUntil ? d.validUntil.slice(0, 10) : "",
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

  const toggleRestaurant = (id: string) =>
    setDraft((prev) => {
      const nextIds = prev.applicableRestaurantIds.includes(id)
        ? prev.applicableRestaurantIds.filter((x) => x !== id)
        : [...prev.applicableRestaurantIds, id];
      return {
        ...prev,
        applicableRestaurantIds: nextIds,
        restaurantId: nextIds[0] || "",
      };
    });

  const set = <K extends keyof Draft>(key: K, val: Draft[K]) =>
    setDraft((prev) => ({ ...prev, [key]: val }));

  const saveMutation = useMutation({
    mutationFn: async (d: Draft) => {
      const payload = {
        title: d.title,
        description: d.description || null,
        scopeType: d.scopeType,
        discountType: d.discountType,
        discountValue: d.discountValue,
        freeDelivery: d.freeDelivery,
        minOrder: d.scopeType === "MIN_ORDER" ? d.minOrder : 0,
        targetIds: d.targetIds,
        applicableRestaurantIds: d.isGlobal ? [] : d.applicableRestaurantIds,
        restaurantId: d.isGlobal ? null : d.restaurantId || d.applicableRestaurantIds[0] || null,
        isGlobal: d.isGlobal,
        isActive: d.isActive,
        // Deals visas alltid på webben, aldrig som manuellt app-kort (rabattkorten genereras server-side).
        showOnSite: true,
        appEnabled: false,
        popupEnabled: false,
        maxUsages: d.maxUsages ? Number(d.maxUsages) : null,
        maxUsesPerCustomer: d.maxUsesPerCustomer === "" ? null : Number(d.maxUsesPerCustomer),
        validFrom: d.validFrom || null,
        validUntil: d.validUntil || null,
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
    if (!draft.isGlobal && draft.applicableRestaurantIds.length === 0) { setError("Välj minst en restaurang eller aktivera alla."); return; }
    if (isItemScope && !activeRestaurantId) { setError("Välj restaurang för produkter eller kategorier."); return; }
    if (!Number.isFinite(draft.discountValue) || draft.discountValue < 0) { setError("Rabattvärde måste vara ≥ 0."); return; }
    if (draft.discountType === "PERCENTAGE" && draft.discountValue > 100) { setError("Procent-rabatt får inte överstiga 100%."); return; }
    if (draft.discountType === "NONE" && !draft.freeDelivery) { setError("Välj rabatt eller fri leverans."); return; }
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
      ? (draft.freeDelivery ? "Fri leverans" : "Ingen rabatt")
      : draft.discountType === "PERCENTAGE"
      ? `${draft.discountValue}% rabatt${draft.freeDelivery ? " + fri leverans" : ""}`
      : draft.discountType === "FIXED_PRICE"
        ? `${draft.discountValue} kr fast pris${draft.freeDelivery ? " + fri leverans" : ""}`
        : `${draft.discountValue} kr rabatt${draft.freeDelivery ? " + fri leverans" : ""}`;
  const previewScope = SCOPE_OPTIONS.find((o) => o.value === draft.scopeType)?.label ?? "";
  const previewRestaurant = draft.isGlobal
    ? "Alla restauranger"
    : draft.applicableRestaurantIds.length > 1
      ? `${draft.applicableRestaurantIds.length} restauranger`
      : (restaurants.data ?? []).find((r) => r.id === (draft.restaurantId || draft.applicableRestaurantIds[0]))?.name || "Ingen restaurang";
  const activeRestaurantSlug = (restaurants.data ?? []).find((r) => r.id === activeRestaurantId)?.slug || "";

  return (
    <div className="page-stack">
      <PageHeader
        breadcrumb="Tillväxt / Deals"
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
            {isEditing && (
              <Button
                variant="secondary"
                onClick={() => {
                  const params = new URLSearchParams({
                    title: draft.title,
                    body: draft.description || previewDiscount,
                  });
                  if (!draft.isGlobal && activeRestaurantSlug) params.set("restaurant", activeRestaurantSlug);
                  router.push(`/push?${params.toString()}`);
                }}
              >
                <Send size={14} /> Skicka push
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
          <Surface className="px-5 py-5 grid gap-4">
            <p className={CARD_TITLE}>Grunduppgifter</p>
            <Field label="Titel">
              <Input value={draft.title} onChange={(e) => set("title", e.target.value)} placeholder="Sommarens pizzaerbjudande" autoFocus />
            </Field>
            <Field label="Beskrivning (valfritt)">
              <Textarea value={draft.description} onChange={(e) => set("description", e.target.value)} placeholder="Beskriv erbjudandet för kunderna" />
            </Field>
          </Surface>

          {/* Deal type */}
          <Surface className="px-5 py-5">
            <p className={CARD_TITLE}>Typ av deal</p>
            <div className="mt-3.5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
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
              <div className="flex items-center justify-between gap-3 border-t border-[var(--row-divider)] py-3">
                <span className="text-[13px] font-semibold text-[var(--text-primary)]">Fri leverans</span>
                <label className="flex items-center gap-2 text-xs font-bold text-[var(--text-primary)]">
                  <input
                    type="checkbox"
                    checked={draft.freeDelivery}
                    onChange={(e) => set("freeDelivery", e.target.checked)}
                    className="h-4 w-4 accent-[var(--accent)]"
                  />
                  Aktiv
                </label>
              </div>
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
              <div className="flex items-center justify-between gap-3 border-t border-[var(--row-divider)] py-3">
                <div>
                  <span className="text-[13px] font-semibold text-[var(--text-primary)]">Max per kund</span>
                  <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">0 = ingen gräns</p>
                </div>
                <Input
                  type="number"
                  min="0"
                  value={draft.maxUsesPerCustomer}
                  onChange={(e) => set("maxUsesPerCustomer", e.target.value)}
                  placeholder="0"
                  aria-label="Max per kund"
                  className="w-28 text-right"
                />
              </div>
            </div>
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
                    onChange={(e) => setDraft((prev) => ({
                      ...prev,
                      isGlobal: e.target.checked,
                      restaurantId: e.target.checked ? "" : prev.restaurantId,
                      applicableRestaurantIds: e.target.checked ? [] : prev.applicableRestaurantIds,
                    }))}
                    className="h-4 w-4 accent-[var(--accent)]"
                  />
                  <span className="text-[13px] font-semibold text-[var(--text-primary)]">Gäller alla restauranger</span>
                </label>
                {!draft.isGlobal && (
                  <div className="mt-2.5 grid max-h-56 gap-1.5 overflow-y-auto">
                    {(restaurants.data ?? []).map((r) => {
                      const checked = draft.applicableRestaurantIds.includes(r.id);
                      return (
                        <label
                          key={r.id}
                          className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-2 text-sm ${
                            checked ? "border-[var(--accent)] bg-[#fff7f3]" : "border-[var(--border-strong)]"
                          }`}
                        >
                          <span className="min-w-0 truncate font-semibold text-[var(--text-primary)]">{r.name}</span>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleRestaurant(r.id)}
                            className="h-4 w-4 accent-[var(--accent)]"
                          />
                        </label>
                      );
                    })}
                  </div>
                )}
                {!draft.isGlobal && isItemScope && draft.applicableRestaurantIds.length > 1 && (
                  <p className="mt-2 text-xs text-[var(--text-muted)]">Produkter hämtas från första valda restaurangen.</p>
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
              {/* Status */}
              <div className="border-t border-[var(--row-divider)] py-3">
                <Field label="Status">
                  <Select value={draft.isActive ? "active" : "inactive"} onChange={(e) => set("isActive", e.target.value === "active")}>
                    <option value="active">Aktiv</option>
                    <option value="inactive">Inaktiv</option>
                  </Select>
                </Field>
              </div>
            </div>
          </Surface>

          {/* Förhandsvisning — mörkt kort, speglar live-rabatt */}
          <Surface className="!bg-[#111113] !border-transparent px-[18px] py-[18px] text-white">
            <p className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-[#9CA3AF]">Förhandsvisning</p>
            <div className="relative mt-3 flex h-[100px] items-end overflow-hidden rounded-[14px] p-3" style={{ background: "linear-gradient(150deg,#3a2a20,#1a120d)" }}>
              <span className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-extrabold text-white">{previewDiscount}</span>
            </div>
            <div className="mt-3">
              <p className="text-sm font-black leading-snug">{draft.title || "Ny deal"}</p>
              <p className="mt-0.5 text-[11px] text-white/50">{previewScope} · {previewRestaurant}</p>
            </div>
          </Surface>
        </div>
      </div>
    </div>
  );
}
