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
} from "@/modules/deals/api";
import { Button, Field, Input, PageHeader, Select, Surface } from "@/shared/components/ui";
import { CityRestaurantPicker } from "@/shared/components/city-restaurant-picker";

const CARD_TITLE = "text-[15px] font-extrabold tracking-[-0.3px]";

type TriggerMode = "category" | "minorder" | "products";

type Draft = {
  title: string;
  imageUrl: string;
  restaurantId: string;
  triggerMode: TriggerMode;
  triggerCategoryId: string;
  triggerQuantity: number;
  bogoMinOrderAmount: string;
  bogoTriggerProductIds: string[];
  rewardCategoryId: string;
  bogoRewardProductIds: string[];
  bogoExcludedProductIds: string[];
  bogoExcludedExtraIds: string[];
  bogoMaxRewardPrice: string;
  // Antal gratis-varor som ges PER trigger-uppfyllelse (default 1).
  // Exempel: rewardsPerTrigger=2 + minorder → "köp för 200 kr, få 2 drycker".
  bogoRewardsPerTrigger: number;
  // Hård cap per order. Tom (null) = obegränsat (skalär med antal triggers).
  // Default 1 så befintligt beteende inte ändras. Sätt till null för
  // "1 dryck per kebabpizza, ingen cap".
  bogoMaxRewardsPerOrder: string;
  isActive: boolean;
  validFrom: string;
  validUntil: string;
};

const defaultDraft = (): Draft => ({
  title: "",
  imageUrl: "",
  restaurantId: "",
  triggerMode: "category",
  triggerCategoryId: "",
  triggerQuantity: 2,
  bogoMinOrderAmount: "",
  bogoTriggerProductIds: [],
  rewardCategoryId: "",
  bogoRewardProductIds: [],
  bogoExcludedProductIds: [],
  bogoExcludedExtraIds: [],
  bogoMaxRewardPrice: "",
  bogoRewardsPerTrigger: 1,
  bogoMaxRewardsPerOrder: "1",
  isActive: true,
  validFrom: "",
  validUntil: "",
});

function inferTriggerMode(deal: any): TriggerMode {
  if ((deal.bogoTriggerProductIds ?? []).length > 0) return "products";
  if (deal.bogoMinOrderAmount != null && deal.bogoMinOrderAmount > 0) return "minorder";
  return "category";
}

export function BogoFormPage({ dealId }: { dealId?: string }) {
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
  const activeRestaurantId = draft.restaurantId || null;

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

  const rewardProductOptions = useMemo(
    () => draft.rewardCategoryId
      ? (products.data ?? []).filter((p) => p.categoryId === draft.rewardCategoryId)
      : (products.data ?? []),
    [products.data, draft.rewardCategoryId]
  );

  useEffect(() => {
    if (existingDeal.data && !initialized) {
      const deal = existingDeal.data;
      setDraft({
        title: deal.title,
        imageUrl: deal.imageUrl || "",
        restaurantId: deal.restaurantId || "",
        triggerMode: inferTriggerMode(deal),
        triggerCategoryId: deal.triggerCategoryId || "",
        triggerQuantity: deal.triggerQuantity ?? 2,
        bogoMinOrderAmount: deal.bogoMinOrderAmount != null ? String(deal.bogoMinOrderAmount) : "",
        bogoTriggerProductIds: deal.bogoTriggerProductIds ?? [],
        rewardCategoryId: deal.rewardCategoryId || "",
        bogoRewardProductIds: deal.bogoRewardProductIds ?? [],
        bogoExcludedProductIds: deal.bogoExcludedProductIds ?? [],
        bogoExcludedExtraIds: deal.bogoExcludedExtraIds ?? [],
        bogoMaxRewardPrice: deal.bogoMaxRewardPrice != null ? String(deal.bogoMaxRewardPrice) : "",
        bogoRewardsPerTrigger: (deal as any).bogoRewardsPerTrigger ?? 1,
        bogoMaxRewardsPerOrder:
          (deal as any).bogoMaxRewardsPerOrder == null
            ? ""
            : String((deal as any).bogoMaxRewardsPerOrder),
        isActive: deal.isActive,
        validFrom: deal.validFrom ? deal.validFrom.slice(0, 10) : "",
        validUntil: deal.validUntil ? deal.validUntil.slice(0, 10) : "",
      });
      setInitialized(true);
    }
  }, [existingDeal.data, initialized]);

  const set = <K extends keyof Draft>(key: K, val: Draft[K]) =>
    setDraft((prev) => ({ ...prev, [key]: val }));

  const toggleTriggerProduct = (id: string) =>
    setDraft((prev) => ({
      ...prev,
      bogoTriggerProductIds: prev.bogoTriggerProductIds.includes(id)
        ? prev.bogoTriggerProductIds.filter((x) => x !== id)
        : [...prev.bogoTriggerProductIds, id],
    }));

  const toggleRewardProduct = (id: string) =>
    setDraft((prev) => ({
      ...prev,
      bogoRewardProductIds: prev.bogoRewardProductIds.includes(id)
        ? prev.bogoRewardProductIds.filter((x) => x !== id)
        : [...prev.bogoRewardProductIds, id],
    }));

  const toggleExcludedExtra = (id: string) =>
    setDraft((prev) => ({
      ...prev,
      bogoExcludedExtraIds: prev.bogoExcludedExtraIds.includes(id)
        ? prev.bogoExcludedExtraIds.filter((x) => x !== id)
        : [...prev.bogoExcludedExtraIds, id],
    }));

  // Extras-grupper aggregerade från valda reward-produkter (för excluded-extras-UI).
  // Samma extra-grupp kan dyka upp på flera produkter — vi dedup:ar på extraGroup.id.
  // Extras utan id (kan hända under create-flöde i menu-modulen) hoppar vi över
  // eftersom vi behöver id för whitelisting.
  const rewardExtraGroups = useMemo(() => {
    const selectedProducts = (products.data ?? []).filter((p) => draft.bogoRewardProductIds.includes(p.id));
    const groupMap = new Map<string, { id: string; name: string; type: string; extras: { id: string; name: string; priceAddon: number }[]; sourceProducts: Set<string> }>();
    selectedProducts.forEach((product) => {
      (product.extraGroups ?? []).forEach((group) => {
        const existing = groupMap.get(group.id);
        if (existing) {
          existing.sourceProducts.add(product.name);
          return;
        }
        const extras = (group.extras ?? [])
          .filter((e): e is { id: string; name: string; priceAddon: number } & typeof e => typeof e.id === "string" && e.id.length > 0)
          .map((e) => ({ id: e.id as string, name: e.name, priceAddon: e.priceAddon }));
        groupMap.set(group.id, {
          id: group.id,
          name: group.name,
          type: group.type,
          extras,
          sourceProducts: new Set([product.name]),
        });
      });
    });
    return [...groupMap.values()].filter((g) => g.extras.length > 0);
  }, [products.data, draft.bogoRewardProductIds]);

  const saveMutation = useMutation({
    mutationFn: async (d: Draft) => {
      const payload: Record<string, unknown> = {
        title: d.title,
        imageUrl: d.imageUrl || null,
        description: buildDescription(d),
        scopeType: "BOGO_CATEGORY",
        triggerType: "BOGO_CATEGORY",
        discountType: "FIXED",
        discountValue: 0,
        restaurantId: d.restaurantId || null,
        rewardCategoryId: d.rewardCategoryId || null,
        bogoRewardProductIds: d.bogoRewardProductIds,
        bogoExcludedProductIds: d.bogoExcludedProductIds,
        bogoExcludedExtraIds: d.bogoExcludedExtraIds,
        bogoMaxRewardPrice: d.bogoMaxRewardPrice ? Number(d.bogoMaxRewardPrice) : null,
        // Skalning: rewardsPerTrigger >=1, maxPerOrder null = obegränsat.
        bogoRewardsPerTrigger: Math.max(1, d.bogoRewardsPerTrigger || 1),
        bogoMaxRewardsPerOrder:
          d.bogoMaxRewardsPerOrder.trim() === "" ? null : Math.max(1, Number(d.bogoMaxRewardsPerOrder) || 1),
        isActive: d.isActive,
        showOnSite: true,
        popupEnabled: false,
        validFrom: d.validFrom || null,
        validUntil: d.validUntil || null,
      };

      if (d.triggerMode === "category") {
        payload.triggerCategoryId = d.triggerCategoryId || null;
        payload.triggerQuantity = d.triggerQuantity;
        payload.bogoMinOrderAmount = null;
        payload.bogoTriggerProductIds = [];
      } else if (d.triggerMode === "minorder") {
        payload.triggerCategoryId = d.triggerCategoryId || null;
        payload.triggerQuantity = 1;
        payload.bogoMinOrderAmount = d.bogoMinOrderAmount ? Number(d.bogoMinOrderAmount) : null;
        payload.bogoTriggerProductIds = [];
      } else {
        payload.triggerCategoryId = null;
        payload.triggerQuantity = d.triggerQuantity;
        payload.bogoMinOrderAmount = null;
        payload.bogoTriggerProductIds = d.bogoTriggerProductIds;
      }

      if (dealId) return updateAutomaticDeal(dealId, payload);
      return createAutomaticDeal(payload);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: dealsQueryKey });
      router.push("/deals");
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
      router.push("/deals");
    },
    onError: () => setError("Kunde inte radera deal."),
  });

  const handleSave = () => {
    if (!draft.title.trim()) { setError("Titel krävs."); return; }
    if (!draft.restaurantId) { setError("Välj restaurang."); return; }
    if (draft.triggerMode === "category" && !draft.triggerCategoryId) { setError("Välj utlösarkategori."); return; }
    if (draft.triggerMode === "minorder" && !draft.bogoMinOrderAmount) { setError("Ange minimibelopp."); return; }
    if (draft.triggerMode === "products" && draft.bogoTriggerProductIds.length === 0) { setError("Välj minst en utlösarprodukt."); return; }
    if (draft.validFrom && draft.validUntil && draft.validFrom > draft.validUntil) { setError("Startdatum måste vara före slutdatum."); return; }
    if (draft.bogoMaxRewardPrice && Number(draft.bogoMaxRewardPrice) < 0) { setError("Max gratis-pris kan inte vara negativt."); return; }
    setError(null);
    saveMutation.mutate(draft);
  };

  const isLoading = (isEditing && existingDeal.isLoading) || restaurants.isLoading;
  if (isLoading) return <div className="px-6 py-12 text-sm text-[var(--text-secondary)]">Laddar...</div>;

  const catOptions = categories.data ?? [];
  const allProducts = products.data ?? [];

  // Live-text för förhandsvisningens orange deal-badge, speglar konfigurerat erbjudande.
  const previewBadge =
    draft.triggerMode === "category"
      ? `Köp ${draft.triggerQuantity}, få 1`
      : draft.triggerMode === "minorder"
        ? `${draft.bogoMinOrderAmount || "?"} kr, få 1`
        : `Köp ${draft.triggerQuantity}, få 1`;
  const previewRestaurant =
    (restaurants.data ?? []).find((r) => r.id === draft.restaurantId)?.name || "Ingen restaurang";

  return (
    <div className="page-stack">
      <PageHeader
        breadcrumb="Katalog / Deals"
        title={isEditing ? draft.title || "Redigera combo/BOGO" : "Ny combo/BOGO"}
        onBack={() => router.push("/deals")}
        actions={
          <>
            {isEditing && (
              <Button
                variant="danger"
                onClick={() => { if (!confirm("Radera denna deal? Kan inte ångras.")) return; deleteMutation.mutate(); }}
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
          {/* Grunduppgifter */}
          <Surface className="px-5 py-5 grid gap-5">
            <p className={CARD_TITLE}>Grunduppgifter</p>
            <Field label="Titel">
              <Input
                value={draft.title}
                onChange={(e) => set("title", e.target.value)}
                placeholder="Köp 2 pizzor, få 1 gratis"
                autoFocus
              />
            </Field>
            <CityRestaurantPicker
              value={draft.restaurantId}
              onChange={(rid) => {
                setDraft((prev) => ({
                  ...prev,
                  restaurantId: rid,
                  triggerCategoryId: "",
                  rewardCategoryId: "",
                  bogoExcludedProductIds: [],
                  bogoRewardProductIds: [],
                  bogoTriggerProductIds: [],
                }));
              }}
            />
          </Surface>

          {/* Combo / BOGO — köp X, få Y */}
          <Surface className="px-5 py-5 grid gap-5">
            <p className={CARD_TITLE}>Combo / BOGO</p>

            {/* Köp X — utlösare */}
            <div>
              <p className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-[var(--text-muted)] mb-3">Köp X</p>
              <div className="grid grid-cols-3 gap-2.5">
                {(["category", "minorder", "products"] as TriggerMode[]).map((mode) => {
                  const selected = draft.triggerMode === mode;
                  return (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setDraft((prev) => ({ ...prev, triggerMode: mode, bogoExcludedProductIds: [], bogoTriggerProductIds: [] }))}
                      className={`rounded-[11px] p-3.5 text-left transition-all ${
                        selected
                          ? "border-2 border-[var(--accent)] bg-[#fff7f3]"
                          : "border border-[var(--border-strong)] hover:border-[var(--accent)]"
                      }`}
                    >
                      <div className={`text-[12.5px] font-bold ${selected ? "text-[var(--accent)]" : "text-[var(--text-primary)]"}`}>
                        {mode === "category" && "Kategori"}
                        {mode === "minorder" && "Minimiorder"}
                        {mode === "products" && "Produkter"}
                      </div>
                      <div className="mt-0.5 text-[11px] text-[var(--text-muted)]">
                        {mode === "category" && "Antal från en kategori"}
                        {mode === "minorder" && "Beställ för ett belopp"}
                        {mode === "products" && "Specifika produkter"}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {draft.triggerMode === "category" && (
              <div className="grid grid-cols-2 gap-4">
                <Field label="Kategori">
                  <Select
                    value={draft.triggerCategoryId}
                    onChange={(e) => { set("triggerCategoryId", e.target.value); set("bogoExcludedProductIds", []); }}
                    disabled={!draft.restaurantId || categories.isLoading}
                  >
                    <option value="">Välj kategori...</option>
                    {catOptions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </Select>
                </Field>
                <Field label="Antal som krävs">
                  <Input type="number" min="1" step="1" value={draft.triggerQuantity}
                    onChange={(e) => set("triggerQuantity", Math.max(1, Number(e.target.value)))}
                    className="border-2 border-[var(--accent)] font-extrabold" />
                </Field>
              </div>
            )}

            {draft.triggerMode === "minorder" && (
              <div className="grid grid-cols-2 gap-4">
                <Field label="Minimiorder (kr)">
                  <Input type="number" min="1" step="1" value={draft.bogoMinOrderAmount}
                    onChange={(e) => set("bogoMinOrderAmount", e.target.value)}
                    placeholder="t.ex. 200" disabled={!draft.restaurantId}
                    className="border-2 border-[var(--accent)] font-extrabold" />
                </Field>
                <Field label="Begränsa till kategori (valfritt)">
                  <Select value={draft.triggerCategoryId}
                    onChange={(e) => { set("triggerCategoryId", e.target.value); set("bogoExcludedProductIds", []); }}
                    disabled={!draft.restaurantId || categories.isLoading}
                  >
                    <option value="">Hela menyn</option>
                    {catOptions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </Select>
                </Field>
              </div>
            )}

            {draft.triggerMode === "products" && (
              <div className="grid gap-4">
                <Field label="Välj utlösarprodukter">
                  {!draft.restaurantId ? (
                    <p className="text-xs text-[var(--text-muted)] py-2">Välj restaurang först</p>
                  ) : (
                    <div className="max-h-48 overflow-y-auto grid gap-1.5">
                      {allProducts.map((p) => {
                        const selected = draft.bogoTriggerProductIds.includes(p.id);
                        return (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => toggleTriggerProduct(p.id)}
                            className={`rounded-xl border px-4 py-2.5 text-left transition-all ${
                              selected
                                ? "border-2 border-[var(--accent)] bg-[#fff7f3]"
                                : "border border-[var(--border-strong)] hover:border-[var(--accent)]"
                            }`}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <span className={`text-sm font-semibold ${selected ? "text-[var(--accent)]" : "text-[var(--text-primary)]"}`}>{p.name}</span>
                              <span className="text-xs text-[var(--text-muted)]">{(p.price / 100).toFixed(0)} kr</span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </Field>
                <Field label="Antal som krävs">
                  <Input type="number" min="1" step="1" value={draft.triggerQuantity}
                    onChange={(e) => set("triggerQuantity", Math.max(1, Number(e.target.value)))}
                    className="border-2 border-[var(--accent)] font-extrabold" />
                </Field>
              </div>
            )}

            {/* Få Y — belöning */}
            <div className="border-t border-[var(--row-divider)] pt-5">
              <p className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-[var(--text-muted)] mb-1">Få Y gratis</p>
              <p className="text-xs text-[var(--text-muted)] mb-3.5">Bocka i exakt de produkter kunden kan välja. Tom lista, hela menyn är valbar.</p>

              {!draft.restaurantId ? (
                <p className="text-xs text-[var(--text-muted)] py-2">Välj restaurang först</p>
              ) : (
                <div className="grid gap-5">
                  <Field label="Filtrera produktlistan efter kategori (valfritt)">
                    <Select
                      value={draft.rewardCategoryId}
                      onChange={(e) => { set("rewardCategoryId", e.target.value); set("bogoRewardProductIds", []); }}
                      disabled={categories.isLoading}
                    >
                      <option value="">Alla kategorier</option>
                      {catOptions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </Select>
                  </Field>

                  <Field label="Välj tillåtna gratis-produkter">
                    <div className="max-h-52 overflow-y-auto grid gap-1.5">
                      {rewardProductOptions.length === 0 ? (
                        <p className="px-3 py-4 text-xs text-[var(--text-muted)] text-center">Inga produkter hittades</p>
                      ) : rewardProductOptions.map((p) => {
                        const selected = draft.bogoRewardProductIds.includes(p.id);
                        return (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => toggleRewardProduct(p.id)}
                            className={`rounded-xl border px-4 py-2.5 text-left transition-all ${
                              selected
                                ? "border-2 border-[var(--accent)] bg-[#fff7f3]"
                                : "border border-[var(--border-strong)] hover:border-[var(--accent)]"
                            }`}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <span className={`text-sm font-semibold ${selected ? "text-[var(--accent)]" : "text-[var(--text-primary)]"}`}>{p.name}</span>
                              <span className="text-xs text-[var(--text-muted)]">{(p.price / 100).toFixed(0)} kr</span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                    {draft.bogoRewardProductIds.length > 0 && (
                      <button type="button" onClick={() => set("bogoRewardProductIds", [])} className="mt-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)] underline">
                        Rensa val ({draft.bogoRewardProductIds.length} valda)
                      </button>
                    )}
                  </Field>
                </div>
              )}
            </div>
          </Surface>

          {/* Villkor */}
          <Surface className="px-5 py-5">
            <p className={CARD_TITLE}>Villkor</p>
            <div className="mt-3">
              {/* Max gratis-baspris */}
              <div className="flex items-center justify-between gap-3 border-t border-[var(--row-divider)] py-3">
                <span className="text-[13px] font-semibold text-[var(--text-primary)]">Max gratis-baspris (kr)</span>
                <Input
                  type="number"
                  min="1"
                  step="1"
                  value={draft.bogoMaxRewardPrice}
                  onChange={(e) => set("bogoMaxRewardPrice", e.target.value)}
                  placeholder="∞"
                  aria-label="Max gratis-baspris (kr)"
                  className="w-28 text-right"
                />
              </div>
              {/* Antal gratis per trigger */}
              <div className="flex items-center justify-between gap-3 border-t border-[var(--row-divider)] py-3">
                <span className="text-[13px] font-semibold text-[var(--text-primary)]">Antal gratis per uppfylld trigger</span>
                <Input
                  type="number"
                  min="1"
                  step="1"
                  value={String(draft.bogoRewardsPerTrigger)}
                  onChange={(e) => set("bogoRewardsPerTrigger", Math.max(1, Number(e.target.value) || 1))}
                  placeholder="1"
                  aria-label="Antal gratis per uppfylld trigger"
                  className="w-28 text-right"
                />
              </div>
              {/* Max gratis per order */}
              <div className="flex items-center justify-between gap-3 border-t border-[var(--row-divider)] py-3">
                <span className="text-[13px] font-semibold text-[var(--text-primary)]">Max gratis per order</span>
                <Input
                  type="number"
                  min="1"
                  step="1"
                  value={draft.bogoMaxRewardsPerOrder}
                  onChange={(e) => set("bogoMaxRewardsPerOrder", e.target.value)}
                  placeholder="∞ (skalär)"
                  aria-label="Max gratis per order"
                  className="w-28 text-right"
                />
              </div>
            </div>
            <p className="mt-3 text-[11px] text-[var(--text-muted)]">
              Tomt max-baspris och max per order = obegränsat (skalär med antal triggers). Per trigger 2 = "köp 1 pizza, få 2 drycker".
            </p>
          </Surface>

          {/* Hindrade tillval — admin kan hindra specifika tillval för gratisvaran */}
          {draft.bogoRewardProductIds.length > 0 && rewardExtraGroups.length > 0 && (
            <Surface className="px-5 py-5">
              <p className={CARD_TITLE}>Hindrade tillval för gratisvaran</p>
              <div className="mt-3.5 grid gap-4">
                {rewardExtraGroups.map((group) => (
                  <div key={group.id} className="rounded-xl border border-[var(--border-strong)] p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <p className="text-sm font-semibold text-[var(--text-primary)]">{group.name}</p>
                        <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mt-0.5">
                          {group.type === "RADIO" ? "Välj en" : "Välj flera"} · finns på {[...group.sourceProducts].slice(0, 3).join(", ")}
                          {group.sourceProducts.size > 3 ? ` +${group.sourceProducts.size - 3}` : ""}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const allIds = group.extras.map((e) => e.id);
                          const allBlocked = allIds.every((id) => draft.bogoExcludedExtraIds.includes(id));
                          setDraft((prev) => ({
                            ...prev,
                            bogoExcludedExtraIds: allBlocked
                              ? prev.bogoExcludedExtraIds.filter((id) => !allIds.includes(id))
                              : [...new Set([...prev.bogoExcludedExtraIds, ...allIds])],
                          }));
                        }}
                        className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                      >
                        {group.extras.every((e) => draft.bogoExcludedExtraIds.includes(e.id)) ? "Tillåt alla" : "Hindra alla"}
                      </button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                      {group.extras.map((extra) => {
                        const blocked = draft.bogoExcludedExtraIds.includes(extra.id);
                        return (
                          <label key={extra.id} className={`flex items-center gap-2 cursor-pointer rounded-lg px-2.5 py-1.5 text-xs select-none transition-colors ${blocked ? "bg-[var(--danger-soft)] text-[var(--danger-text)]" : "hover:bg-[var(--bg-hover)] text-[var(--text-secondary)]"}`}>
                            <input
                              type="checkbox"
                              checked={blocked}
                              onChange={() => toggleExcludedExtra(extra.id)}
                              className="accent-[var(--danger)] h-3.5 w-3.5 shrink-0"
                            />
                            <span className={blocked ? "line-through" : ""}>{extra.name}</span>
                            {extra.priceAddon > 0 && (
                              <span className="ml-auto text-[10px] text-[var(--text-muted)]">+{extra.priceAddon} kr</span>
                            )}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
                {draft.bogoExcludedExtraIds.length > 0 && (
                  <button type="button" onClick={() => set("bogoExcludedExtraIds", [])} className="text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)] underline self-start">
                    Rensa alla blockerade tillval ({draft.bogoExcludedExtraIds.length} blockerade)
                  </button>
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
              {/* Restaurang */}
              <div className="flex items-center justify-between gap-3 border-t border-[var(--row-divider)] py-3">
                <span className="text-[13px] font-semibold text-[var(--text-primary)]">Restaurang</span>
                <span className="text-[12.5px] font-bold text-[var(--text-secondary)] text-right">{previewRestaurant}</span>
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

          {/* Förhandsvisning — mörkt kort, speglar live-erbjudande */}
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
                {previewBadge}
              </span>
              <span className="absolute right-3 top-3 font-mono text-[9px] text-white/40">så ser kunden den</span>
            </div>
            {draft.title && (
              <div className="mt-3">
                <p className="text-sm font-black leading-snug">{draft.title}</p>
                <p className="mt-0.5 text-[11px] text-white/50">{previewRestaurant}</p>
              </div>
            )}
            <div className="mt-3 grid gap-1 text-[11px] text-white/60">
              {draft.bogoRewardProductIds.length > 0 ? (
                <p>{draft.bogoRewardProductIds.length} gratis-produkt{draft.bogoRewardProductIds.length !== 1 ? "er" : ""} valbara</p>
              ) : (
                <p>Hela menyn valbar som gratisvara</p>
              )}
              {draft.bogoMaxRewardPrice && Number(draft.bogoMaxRewardPrice) > 0 && (
                <p>Max gratis-baspris {draft.bogoMaxRewardPrice} kr</p>
              )}
              {draft.bogoExcludedExtraIds.length > 0 && (
                <p>{draft.bogoExcludedExtraIds.length} tillval blockerade</p>
              )}
            </div>
          </Surface>
        </div>
      </div>
    </div>
  );
}

function buildDescription(d: Draft): string {
  if (d.triggerMode === "category") return `Köp ${d.triggerQuantity} från kategorin och få 1 gratis`;
  if (d.triggerMode === "minorder") return `Beställ för minst ${d.bogoMinOrderAmount} kr och få 1 gratis`;
  return `Köp ${d.triggerQuantity} av valda produkter och få 1 gratis`;
}
