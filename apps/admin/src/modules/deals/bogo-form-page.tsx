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
} from "@/modules/deals/api";
import { Button, Field, Input, Select, Surface } from "@/shared/components/ui";
import { CityRestaurantPicker } from "@/shared/components/city-restaurant-picker";
import { ImageUploadField } from "@/shared/components/image-upload";

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
  showAsBanner: boolean;
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
  showAsBanner: true,
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
        showAsBanner: deal.showAsBanner ?? true,
        validFrom: deal.validFrom ? deal.validFrom.slice(0, 10) : "",
        validUntil: deal.validUntil ? deal.validUntil.slice(0, 10) : "",
      });
      setInitialized(true);
    }
  }, [existingDeal.data, initialized]);

  const set = <K extends keyof Draft>(key: K, val: Draft[K]) =>
    setDraft((prev) => ({ ...prev, [key]: val }));

  const toggleExcluded = (id: string) =>
    setDraft((prev) => ({
      ...prev,
      bogoExcludedProductIds: prev.bogoExcludedProductIds.includes(id)
        ? prev.bogoExcludedProductIds.filter((x) => x !== id)
        : [...prev.bogoExcludedProductIds, id],
    }));

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
        showAsBanner: d.showAsBanner,
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

  return (
    <div className="page-stack">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 px-1">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.push("/deals")}
            className="flex items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] px-3 py-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
          >
            <ArrowLeft size={14} /> Tillbaka
          </button>
          <h1 className="text-xl font-black tracking-[-0.02em]">
            {isEditing ? "Redigera BOGO-deal" : "Ny BOGO-deal"}
          </h1>
        </div>
        <div className="flex items-center gap-2">
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
            {saveMutation.isPending ? <><Loader2 size={14} className="animate-spin" /> Sparar...</> : "Spara deal"}
          </Button>
        </div>
      </div>

      {error && (
        <p className="rounded-xl bg-[rgba(239,68,68,0.1)] px-4 py-3 text-sm text-red-400">{error}</p>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
        {/* Left column - main fields */}
        <div className="grid gap-4 content-start">
          <Surface className="px-6 py-6 grid gap-5">
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

            <ImageUploadField
              label="Bannerbild (valfritt)"
              value={draft.imageUrl}
              onChange={(url) => set("imageUrl", url)}
            />
          </Surface>

          {/* Trigger */}
          <Surface className="px-6 py-6 grid gap-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-3">Utlösare — när aktiveras dealen?</p>
              <div className="grid grid-cols-3 gap-2">
                {(["category", "minorder", "products"] as TriggerMode[]).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setDraft((prev) => ({ ...prev, triggerMode: mode, bogoExcludedProductIds: [], bogoTriggerProductIds: [] }))}
                    className={`rounded-xl border px-4 py-3 text-sm font-semibold transition-all ${
                      draft.triggerMode === mode
                        ? "border-[var(--accent)] bg-[rgba(99,102,241,0.15)] text-[var(--accent)]"
                        : "border-[var(--border-subtle)] bg-[var(--surface-secondary)] text-[var(--text-secondary)] hover:border-[var(--border-default)]"
                    }`}
                  >
                    {mode === "category" && "Kategori"}
                    {mode === "minorder" && "Minimiorder"}
                    {mode === "products" && "Produkter"}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-xs text-[var(--text-muted)]">
                {draft.triggerMode === "category" && "Kunden köper ett visst antal produkter från en kategori."}
                {draft.triggerMode === "minorder" && "Kunden beställer för ett minimibelopp och får en produkt gratis."}
                {draft.triggerMode === "products" && "Kunden köper specifika produkter och får en gratis."}
              </p>
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
                    onChange={(e) => set("triggerQuantity", Math.max(1, Number(e.target.value)))} />
                </Field>
              </div>
            )}

            {draft.triggerMode === "minorder" && (
              <div className="grid grid-cols-2 gap-4">
                <Field label="Minimiorder (kr)">
                  <Input type="number" min="1" step="1" value={draft.bogoMinOrderAmount}
                    onChange={(e) => set("bogoMinOrderAmount", e.target.value)}
                    placeholder="t.ex. 200" disabled={!draft.restaurantId} />
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
                    <div className="max-h-48 overflow-y-auto rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)] p-2 flex flex-col gap-0.5">
                      {allProducts.map((p) => {
                        const selected = draft.bogoTriggerProductIds.includes(p.id);
                        return (
                          <label key={p.id} className={`flex items-center gap-2.5 cursor-pointer rounded-lg px-3 py-2 text-sm select-none transition-colors ${selected ? "bg-[rgba(99,102,241,0.12)]" : "hover:bg-[rgba(255,255,255,0.04)]"}`}>
                            <input type="checkbox" checked={selected} onChange={() => toggleTriggerProduct(p.id)} className="accent-indigo-500 h-3.5 w-3.5 shrink-0" />
                            <span className={selected ? "text-[var(--accent)]" : ""}>{p.name}</span>
                            <span className="ml-auto text-xs text-[var(--text-muted)]">{(p.price / 100).toFixed(0)} kr</span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </Field>
                <Field label="Antal som krävs">
                  <Input type="number" min="1" step="1" value={draft.triggerQuantity}
                    onChange={(e) => set("triggerQuantity", Math.max(1, Number(e.target.value)))} />
                </Field>
              </div>
            )}
          </Surface>

          {/* Reward */}
          <Surface className="px-6 py-6 grid gap-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1">Belöning — vilka produkter kan väljas gratis?</p>
              <p className="text-xs text-[var(--text-muted)]">Bocka i exakt de produkter kunden kan välja. Tom lista = hela menyn är valbara.</p>
            </div>

            {!draft.restaurantId ? (
              <p className="text-xs text-[var(--text-muted)] py-2">Välj restaurang först</p>
            ) : (
              <>
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
                  <div className="max-h-52 overflow-y-auto rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)] p-2 flex flex-col gap-0.5">
                    {rewardProductOptions.length === 0 ? (
                      <p className="px-3 py-4 text-xs text-[var(--text-muted)] text-center">Inga produkter hittades</p>
                    ) : rewardProductOptions.map((p) => {
                      const selected = draft.bogoRewardProductIds.includes(p.id);
                      return (
                        <label key={p.id} className={`flex items-center gap-2.5 cursor-pointer rounded-lg px-3 py-2 text-sm select-none transition-colors ${selected ? "bg-[rgba(99,102,241,0.12)]" : "hover:bg-[rgba(255,255,255,0.04)]"}`}>
                          <input type="checkbox" checked={selected} onChange={() => toggleRewardProduct(p.id)} className="accent-indigo-500 h-3.5 w-3.5 shrink-0" />
                          <span className={selected ? "font-semibold text-[var(--accent)]" : ""}>{p.name}</span>
                          <span className="ml-auto text-xs text-[var(--text-muted)]">{(p.price / 100).toFixed(0)} kr</span>
                        </label>
                      );
                    })}
                  </div>
                  {draft.bogoRewardProductIds.length > 0 && (
                    <button type="button" onClick={() => set("bogoRewardProductIds", [])} className="mt-1 text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)] underline">
                      Rensa val ({draft.bogoRewardProductIds.length} valda)
                    </button>
                  )}
                </Field>

                <Field label="Max gratis-basepris (kr, valfritt)">
                  <Input type="number" min="1" step="1" value={draft.bogoMaxRewardPrice}
                    onChange={(e) => set("bogoMaxRewardPrice", e.target.value)}
                    placeholder="t.ex. 15 — kunden betalar mellanskillnad vid dyrare val" />
                </Field>

                <div className="grid gap-3 md:grid-cols-2">
                  <Field label="Antal gratis per gång trigger uppfylls">
                    <Input
                      type="number"
                      min="1"
                      step="1"
                      value={String(draft.bogoRewardsPerTrigger)}
                      onChange={(e) => set("bogoRewardsPerTrigger", Math.max(1, Number(e.target.value) || 1))}
                      placeholder="1"
                    />
                    <p className="text-[10px] text-[var(--text-muted)] mt-1">
                      T.ex. <strong>2</strong> = "köp 1 pizza → få 2 drycker"
                    </p>
                  </Field>

                  <Field label="Max gratis per order (tomt = obegränsat)">
                    <Input
                      type="number"
                      min="1"
                      step="1"
                      value={draft.bogoMaxRewardsPerOrder}
                      onChange={(e) => set("bogoMaxRewardsPerOrder", e.target.value)}
                      placeholder="t.ex. 1 (cap) eller tom (skalär)"
                    />
                    <p className="text-[10px] text-[var(--text-muted)] mt-1">
                      Tomt: kund får 1 gratis per kvalificerande artikel ("köp 2 pizzor → 2 gratis").
                      <br />Sätt t.ex. <strong>1</strong> för att alltid bara ge 1 gratis oavsett cart-storlek.
                    </p>
                  </Field>
                </div>
              </>
            )}
          </Surface>

          {/* Excluded extras — admin kan hindra specifika tillval för gratisvaran */}
          {draft.bogoRewardProductIds.length > 0 && rewardExtraGroups.length > 0 && (
            <Surface className="px-6 py-6 grid gap-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1">Hindrade tillval för gratisvaran</p>
                <p className="text-xs text-[var(--text-muted)]">Bocka i tillval som kunden INTE ska kunna välja när hen plockar gratisvaran (t.ex. dyra storlekar som "Familjepizza" eller specifika tillbehör). Tillval som tillåts kostar fortfarande sitt vanliga pris.</p>
              </div>
              <div className="grid gap-4">
                {rewardExtraGroups.map((group) => (
                  <div key={group.id} className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)] p-4">
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
                          <label key={extra.id} className={`flex items-center gap-2 cursor-pointer rounded-lg px-2.5 py-1.5 text-xs select-none transition-colors ${blocked ? "bg-rose-500/10 text-rose-400" : "hover:bg-[rgba(255,255,255,0.04)] text-[var(--text-secondary)]"}`}>
                            <input
                              type="checkbox"
                              checked={blocked}
                              onChange={() => toggleExcludedExtra(extra.id)}
                              className="accent-rose-500 h-3.5 w-3.5 shrink-0"
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

        {/* Right column - settings */}
        <div className="grid gap-4 content-start">
          <Surface className="px-6 py-6 grid gap-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Inställningar</p>
            <Field label="Status">
              <Select value={draft.isActive ? "active" : "inactive"} onChange={(e) => set("isActive", e.target.value === "active")}>
                <option value="active">Aktiv</option>
                <option value="inactive">Inaktiv</option>
              </Select>
            </Field>
            <Field label="Visa som banner">
              <Select value={draft.showAsBanner ? "yes" : "no"} onChange={(e) => set("showAsBanner", e.target.value === "yes")}>
                <option value="yes">Ja — visas på restaurangsidan</option>
                <option value="no">Nej</option>
              </Select>
            </Field>
            <Field label="Giltig från (valfritt)">
              <Input type="date" value={draft.validFrom} onChange={(e) => set("validFrom", e.target.value)} />
            </Field>
            <Field label="Giltig till (valfritt)">
              <Input type="date" value={draft.validUntil} onChange={(e) => set("validUntil", e.target.value)} />
            </Field>
          </Surface>

          {/* Summary */}
          <Surface className="px-6 py-6">
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-3">Sammanfattning</p>
            <div className="grid gap-1.5 text-sm text-[var(--text-secondary)]">
              {draft.triggerMode === "category" && (
                <p>Kunden köper <strong className="text-[var(--text-primary)]">{draft.triggerQuantity}</strong> artikel{draft.triggerQuantity !== 1 ? "r" : ""} från utlösarkategorin → billigaste icke-uteslutna artikel dras av.</p>
              )}
              {draft.triggerMode === "minorder" && (
                <p>Kunden beställer för minst <strong className="text-[var(--text-primary)]">{draft.bogoMinOrderAmount || "?"} kr</strong> → billigaste icke-uteslutna artikel dras av.</p>
              )}
              {draft.triggerMode === "products" && (
                <p>Kunden köper <strong className="text-[var(--text-primary)]">{draft.triggerQuantity}</strong> av de valda produkterna → billigaste icke-uteslutna artikel dras av.</p>
              )}
              {draft.bogoRewardProductIds.length > 0 ? (
                <p className="text-indigo-400"><strong>{draft.bogoRewardProductIds.length}</strong> produkt{draft.bogoRewardProductIds.length !== 1 ? "er" : ""} vald{draft.bogoRewardProductIds.length !== 1 ? "a" : ""} som gratis-alternativ.</p>
              ) : (
                <p className="text-[var(--text-muted)] text-xs">Inga gratis-produkter valda — hela menyn är valbar.</p>
              )}
              {draft.bogoMaxRewardPrice && Number(draft.bogoMaxRewardPrice) > 0 && (
                <p className="text-amber-400">Max gratis-basepris: <strong>{draft.bogoMaxRewardPrice} kr</strong> — kunden betalar mellanskillnaden för dyrare val.</p>
              )}
              {draft.bogoExcludedExtraIds.length > 0 && (
                <p className="text-rose-400"><strong>{draft.bogoExcludedExtraIds.length}</strong> tillval blockerade för gratisvaran.</p>
              )}
              <p className="text-xs text-[var(--text-muted)] mt-1">Extratillval betalas alltid av kunden (utom blockerade som inte kan väljas alls).</p>
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
