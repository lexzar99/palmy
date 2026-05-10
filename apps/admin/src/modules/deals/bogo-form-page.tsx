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
  bogoMaxRewardPrice: string;
  isActive: boolean;
  showAsBanner: boolean;
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
  bogoMaxRewardPrice: "",
  isActive: true,
  showAsBanner: true,
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

  const rewardCatId = draft.rewardCategoryId || draft.triggerCategoryId;
  const rewardCategoryProducts = useMemo(
    () => (products.data ?? []).filter((p) => p.categoryId === rewardCatId),
    [products.data, rewardCatId]
  );

  useEffect(() => {
    if (existingDeal.data && !initialized) {
      const deal = existingDeal.data;
      setDraft({
        title: deal.title,
        imageUrl: (deal as any).imageUrl || "",
        restaurantId: deal.restaurantId || "",
        triggerMode: inferTriggerMode(deal),
        triggerCategoryId: deal.triggerCategoryId || "",
        triggerQuantity: deal.triggerQuantity ?? 2,
        bogoMinOrderAmount: (deal as any).bogoMinOrderAmount != null ? String((deal as any).bogoMinOrderAmount) : "",
        bogoTriggerProductIds: (deal as any).bogoTriggerProductIds ?? [],
        rewardCategoryId: deal.rewardCategoryId || "",
        bogoRewardProductIds: (deal as any).bogoRewardProductIds ?? [],
        bogoExcludedProductIds: deal.bogoExcludedProductIds ?? [],
        bogoMaxRewardPrice: deal.bogoMaxRewardPrice != null ? String(deal.bogoMaxRewardPrice) : "",
        isActive: deal.isActive,
        showAsBanner: deal.showAsBanner ?? true,
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
        bogoMaxRewardPrice: d.bogoMaxRewardPrice ? Number(d.bogoMaxRewardPrice) : null,
        isActive: d.isActive,
        showOnSite: true,
        showAsBanner: d.showAsBanner,
        popupEnabled: false,
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

            <Field label="Restaurang">
              <Select
                value={draft.restaurantId}
                onChange={(e) => {
                  setDraft((prev) => ({
                    ...prev,
                    restaurantId: e.target.value,
                    triggerCategoryId: "",
                    rewardCategoryId: "",
                    bogoExcludedProductIds: [],
                    bogoRewardProductIds: [],
                    bogoTriggerProductIds: [],
                  }));
                }}
              >
                <option value="">Välj restaurang...</option>
                {(restaurants.data ?? []).map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </Select>
            </Field>

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
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Belöning — vad är gratis?</p>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Gratis-kategori">
                <Select
                  value={draft.rewardCategoryId}
                  onChange={(e) => { set("rewardCategoryId", e.target.value); set("bogoExcludedProductIds", []); }}
                  disabled={!draft.restaurantId || categories.isLoading}
                >
                  <option value="">
                    {draft.triggerMode === "category" ? "Samma kategori" : "Fritt val"}
                  </option>
                  {catOptions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              </Field>
              <Field label="Max gratis-basepris (kr)">
                <Input type="number" min="1" step="1" value={draft.bogoMaxRewardPrice}
                  onChange={(e) => set("bogoMaxRewardPrice", e.target.value)}
                  placeholder="valfritt, t.ex. 15" />
              </Field>
            </div>

            {rewardCategoryProducts.length > 0 && (
              <Field label="Tillåtna gratis-produkter (whitelist — tom = alla)">
                <p className="mb-2 text-xs text-[var(--text-muted)]">Bock i de produkter kunden FÅR välja som gratis. Tom lista = alla produkter i kategorin.</p>
                <div className="max-h-40 overflow-y-auto rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)] p-2 flex flex-col gap-0.5">
                  {rewardCategoryProducts.map((p) => {
                    const allowed = draft.bogoRewardProductIds.includes(p.id);
                    return (
                      <label key={p.id} className={`flex items-center gap-2.5 cursor-pointer rounded-lg px-3 py-2 text-sm select-none transition-colors ${allowed ? "bg-[rgba(99,102,241,0.12)]" : "hover:bg-[rgba(255,255,255,0.04)]"}`}>
                        <input type="checkbox" checked={allowed} onChange={() => toggleRewardProduct(p.id)} className="accent-indigo-500 h-3.5 w-3.5 shrink-0" />
                        <span className={allowed ? "text-[var(--accent)]" : ""}>{p.name}</span>
                        <span className="ml-auto text-xs text-[var(--text-muted)]">{(p.price / 100).toFixed(0)} kr</span>
                      </label>
                    );
                  })}
                </div>
                {draft.bogoRewardProductIds.length > 0 && (
                  <button type="button" onClick={() => set("bogoRewardProductIds", [])} className="mt-1 text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)] underline">
                    Rensa whitelist ({draft.bogoRewardProductIds.length} valda)
                  </button>
                )}
              </Field>
            )}

            {rewardCategoryProducts.length > 0 && (
              <Field label="Uteslut produkter från gratis-erbjudandet">
                <div className="max-h-40 overflow-y-auto rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)] p-2 flex flex-col gap-0.5">
                  {rewardCategoryProducts.map((p) => {
                    const excluded = draft.bogoExcludedProductIds.includes(p.id);
                    return (
                      <label key={p.id} className={`flex items-center gap-2.5 cursor-pointer rounded-lg px-3 py-2 text-sm select-none transition-colors ${excluded ? "bg-[rgba(239,68,68,0.08)]" : "hover:bg-[rgba(255,255,255,0.04)]"}`}>
                        <input type="checkbox" checked={excluded} onChange={() => toggleExcluded(p.id)} className="accent-red-500 h-3.5 w-3.5 shrink-0" />
                        <span className={excluded ? "line-through text-[var(--text-muted)]" : ""}>{p.name}</span>
                        <span className="ml-auto text-xs text-[var(--text-muted)]">{(p.price / 100).toFixed(0)} kr</span>
                      </label>
                    );
                  })}
                </div>
                {draft.bogoExcludedProductIds.length > 0 && (
                  <button type="button" onClick={() => set("bogoExcludedProductIds", [])} className="mt-1 text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)] underline">
                    Rensa ({draft.bogoExcludedProductIds.length})
                  </button>
                )}
              </Field>
            )}
          </Surface>
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
              {draft.bogoMaxRewardPrice && Number(draft.bogoMaxRewardPrice) > 0 && (
                <p className="text-amber-400">Max gratis-basepris: <strong>{draft.bogoMaxRewardPrice} kr</strong> — kunden betalar mellanskillnaden för dyrare val.</p>
              )}
              {draft.bogoExcludedProductIds.length > 0 && (
                <p className="text-red-400">{draft.bogoExcludedProductIds.length} produkt{draft.bogoExcludedProductIds.length !== 1 ? "er" : ""} utesluten{draft.bogoExcludedProductIds.length !== 1 ? "a" : ""}.</p>
              )}
              <p className="text-xs text-[var(--text-muted)] mt-1">Extratillval betalas alltid av kunden.</p>
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
