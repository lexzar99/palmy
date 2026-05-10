"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Trash2 } from "lucide-react";
import {
  createAutomaticDeal,
  dealsQueryKey,
  dealCategoriesQueryKey,
  dealProductsQueryKey,
  dealRestaurantsQueryKey,
  deleteAutomaticDeal,
  getDealCategories,
  getDealProducts,
  getDealRestaurants,
  updateAutomaticDeal,
  type AutomaticDealRecord,
} from "@/modules/deals/api";
import { Button, Field, Input, Modal, Select } from "@/shared/components/ui";
import { ImageUploadField } from "@/shared/components/image-upload";

type TriggerMode = "category" | "minorder" | "products";

type Draft = {
  title: string;
  imageUrl: string;
  restaurantId: string;
  triggerMode: TriggerMode;
  // category mode
  triggerCategoryId: string;
  triggerQuantity: number;
  // minorder mode
  bogoMinOrderAmount: string;
  // products mode
  bogoTriggerProductIds: string[];
  // reward
  rewardCategoryId: string;
  bogoExcludedProductIds: string[];
  bogoMaxRewardPrice: string;
  // meta
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
  bogoExcludedProductIds: [],
  bogoMaxRewardPrice: "",
  isActive: true,
  showAsBanner: true,
  validUntil: "",
});

function inferTriggerMode(deal: AutomaticDealRecord): TriggerMode {
  if ((deal.bogoTriggerProductIds ?? []).length > 0) return "products";
  if (deal.bogoMinOrderAmount != null && deal.bogoMinOrderAmount > 0) return "minorder";
  return "category";
}

interface Props {
  open: boolean;
  onClose: () => void;
  deal?: AutomaticDealRecord | null;
  prefillRestaurantId?: string | null;
}

export function BogoDealModal({ open, onClose, deal, prefillRestaurantId }: Props) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Draft>(defaultDraft());
  const [error, setError] = useState<string | null>(null);

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
    if (!open) return;
    if (deal) {
      setDraft({
        title: deal.title,
        imageUrl: (deal as any).imageUrl || "",
        restaurantId: deal.restaurantId || "",
        triggerMode: inferTriggerMode(deal),
        triggerCategoryId: deal.triggerCategoryId || "",
        triggerQuantity: deal.triggerQuantity ?? 2,
        bogoMinOrderAmount: deal.bogoMinOrderAmount != null ? String(deal.bogoMinOrderAmount) : "",
        bogoTriggerProductIds: deal.bogoTriggerProductIds ?? [],
        rewardCategoryId: deal.rewardCategoryId || "",
        bogoExcludedProductIds: deal.bogoExcludedProductIds ?? [],
        bogoMaxRewardPrice: deal.bogoMaxRewardPrice != null ? String(deal.bogoMaxRewardPrice) : "",
        isActive: deal.isActive,
        showAsBanner: deal.showAsBanner ?? false,
        validUntil: deal.validUntil ? deal.validUntil.slice(0, 10) : "",
      });
    } else {
      setDraft({ ...defaultDraft(), restaurantId: prefillRestaurantId ?? "" });
    }
    setError(null);
  }, [open, deal, prefillRestaurantId]);

  const set = <K extends keyof Draft>(key: K, val: Draft[K]) =>
    setDraft((prev) => ({ ...prev, [key]: val }));

  const resetCategorySelections = () =>
    setDraft((prev) => ({ ...prev, triggerCategoryId: "", rewardCategoryId: "", bogoExcludedProductIds: [], bogoTriggerProductIds: [] }));

  const toggleExcluded = (productId: string) =>
    setDraft((prev) => ({
      ...prev,
      bogoExcludedProductIds: prev.bogoExcludedProductIds.includes(productId)
        ? prev.bogoExcludedProductIds.filter((id) => id !== productId)
        : [...prev.bogoExcludedProductIds, productId],
    }));

  const toggleTriggerProduct = (productId: string) =>
    setDraft((prev) => ({
      ...prev,
      bogoTriggerProductIds: prev.bogoTriggerProductIds.includes(productId)
        ? prev.bogoTriggerProductIds.filter((id) => id !== productId)
        : [...prev.bogoTriggerProductIds, productId],
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

      if (deal) return updateAutomaticDeal(deal.id, payload);
      return createAutomaticDeal(payload);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: dealsQueryKey });
      onClose();
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg ?? "Kunde inte spara deal.");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteAutomaticDeal(deal!.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: dealsQueryKey });
      onClose();
    },
    onError: () => setError("Kunde inte radera deal."),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.title.trim()) { setError("Titel krävs."); return; }
    if (!draft.restaurantId) { setError("Välj restaurang."); return; }
    if (draft.triggerMode === "category" && !draft.triggerCategoryId) { setError("Välj utlösarkategori."); return; }
    if (draft.triggerMode === "minorder" && !draft.bogoMinOrderAmount) { setError("Ange minimibelopp."); return; }
    if (draft.triggerMode === "products" && draft.bogoTriggerProductIds.length === 0) { setError("Välj minst en utlösarprodukt."); return; }
    setError(null);
    saveMutation.mutate(draft);
  };

  const catOptions = categories.data ?? [];
  const allProducts = products.data ?? [];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={deal ? "Redigera BOGO-deal" : "Ny BOGO-deal"}
      footer={
        <div className="flex items-center justify-between gap-3">
          <div>
            {deal && (
              <Button
                variant="danger"
                onClick={() => {
                  if (!confirm(`Radera "${deal.title}"? Kan inte ångras.`)) return;
                  deleteMutation.mutate();
                }}
                disabled={deleteMutation.isPending}
              >
                <Trash2 size={14} /> Radera
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button onClick={onClose}>Avbryt</Button>
            <Button variant="primary" onClick={handleSubmit} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? <><Loader2 size={14} className="animate-spin" /> Sparar...</> : "Spara"}
            </Button>
          </div>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="grid gap-5">
        {error && (
          <p className="rounded-lg bg-[rgba(239,68,68,0.1)] px-4 py-3 text-sm text-red-400">{error}</p>
        )}

        {/* Basic info */}
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
            onChange={(e) => { set("restaurantId", e.target.value); resetCategorySelections(); }}
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

        {/* TRIGGER section */}
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)] p-4 grid gap-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Utlösare — när aktiveras dealen?</p>

          <Field label="Typ av utlösare">
            <div className="grid grid-cols-3 gap-2">
              {(["category", "minorder", "products"] as TriggerMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setDraft((prev) => ({ ...prev, triggerMode: mode, bogoExcludedProductIds: [], bogoTriggerProductIds: [] }))}
                  className={`rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                    draft.triggerMode === mode
                      ? "border-[var(--accent)] bg-[rgba(99,102,241,0.15)] text-[var(--accent)]"
                      : "border-[var(--border-subtle)] text-[var(--text-muted)] hover:border-[var(--border-default)]"
                  }`}
                >
                  {mode === "category" && "Kategori"}
                  {mode === "minorder" && "Minimiorder"}
                  {mode === "products" && "Produkter"}
                </button>
              ))}
            </div>
          </Field>

          {draft.triggerMode === "category" && (
            <div className="grid grid-cols-2 gap-4">
              <Field label="Kategori">
                <Select
                  value={draft.triggerCategoryId}
                  onChange={(e) => { set("triggerCategoryId", e.target.value); set("bogoExcludedProductIds", []); }}
                  disabled={!draft.restaurantId || categories.isLoading}
                >
                  <option value="">Välj kategori...</option>
                  {catOptions.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Antal som krävs">
                <Input
                  type="number"
                  min="1"
                  step="1"
                  value={draft.triggerQuantity}
                  onChange={(e) => set("triggerQuantity", Math.max(1, Number(e.target.value)))}
                />
              </Field>
            </div>
          )}

          {draft.triggerMode === "minorder" && (
            <div className="grid grid-cols-2 gap-4">
              <Field label="Minimiorder (kr)">
                <Input
                  type="number"
                  min="1"
                  step="1"
                  value={draft.bogoMinOrderAmount}
                  onChange={(e) => set("bogoMinOrderAmount", e.target.value)}
                  placeholder="t.ex. 200"
                  disabled={!draft.restaurantId}
                />
              </Field>
              <Field label="Reward-kategori (valfritt)">
                <Select
                  value={draft.triggerCategoryId}
                  onChange={(e) => { set("triggerCategoryId", e.target.value); set("bogoExcludedProductIds", []); }}
                  disabled={!draft.restaurantId || categories.isLoading}
                >
                  <option value="">Hela menyn</option>
                  {catOptions.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </Select>
              </Field>
            </div>
          )}

          {draft.triggerMode === "products" && (
            <>
              <Field label="Välj utlösarprodukter">
                {!draft.restaurantId ? (
                  <p className="text-xs text-[var(--text-muted)]">Välj restaurang först</p>
                ) : products.isLoading ? (
                  <p className="text-xs text-[var(--text-muted)]">Laddar produkter...</p>
                ) : (
                  <div className="max-h-40 overflow-y-auto rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-primary)] p-2 flex flex-col gap-0.5">
                    {allProducts.map((p) => {
                      const selected = draft.bogoTriggerProductIds.includes(p.id);
                      return (
                        <label
                          key={p.id}
                          className={`flex items-center gap-2 cursor-pointer rounded px-2 py-1.5 text-sm select-none transition-colors ${selected ? "bg-[rgba(99,102,241,0.12)]" : "hover:bg-[rgba(255,255,255,0.04)]"}`}
                        >
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={() => toggleTriggerProduct(p.id)}
                            className="accent-indigo-500 h-3.5 w-3.5 shrink-0"
                          />
                          <span className={selected ? "text-[var(--accent)]" : "text-[var(--text-primary)]"}>{p.name}</span>
                          <span className="ml-auto text-xs text-[var(--text-muted)]">{(p.price / 100).toFixed(0)} kr</span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </Field>
              <Field label="Antal som krävs">
                <Input
                  type="number"
                  min="1"
                  step="1"
                  value={draft.triggerQuantity}
                  onChange={(e) => set("triggerQuantity", Math.max(1, Number(e.target.value)))}
                />
              </Field>
            </>
          )}
        </div>

        {/* REWARD section */}
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)] p-4 grid gap-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Belöning — vad är gratis?</p>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Gratis-kategori">
              <Select
                value={draft.rewardCategoryId}
                onChange={(e) => { set("rewardCategoryId", e.target.value); set("bogoExcludedProductIds", []); }}
                disabled={!draft.restaurantId || categories.isLoading}
              >
                <option value="">
                  {draft.triggerMode === "category" ? "Samma kategori" : draft.triggerMode === "minorder" ? "Fritt val" : "Välj kategori..."}
                </option>
                {catOptions.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Max gratis-basepris (kr)">
              <Input
                type="number"
                min="1"
                step="1"
                value={draft.bogoMaxRewardPrice}
                onChange={(e) => set("bogoMaxRewardPrice", e.target.value)}
                placeholder="valfritt, t.ex. 15"
              />
            </Field>
          </div>

          {rewardCategoryProducts.length > 0 && (
            <Field label="Uteslut produkter från gratis-erbjudandet">
              <div className="max-h-36 overflow-y-auto rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-primary)] p-2 flex flex-col gap-0.5">
                {rewardCategoryProducts.map((p) => {
                  const excluded = draft.bogoExcludedProductIds.includes(p.id);
                  return (
                    <label
                      key={p.id}
                      className={`flex items-center gap-2 cursor-pointer rounded px-2 py-1.5 text-sm select-none transition-colors ${excluded ? "bg-[rgba(239,68,68,0.08)]" : "hover:bg-[rgba(255,255,255,0.04)]"}`}
                    >
                      <input
                        type="checkbox"
                        checked={excluded}
                        onChange={() => toggleExcluded(p.id)}
                        className="accent-red-500 h-3.5 w-3.5 shrink-0"
                      />
                      <span className={excluded ? "line-through text-[var(--text-muted)]" : "text-[var(--text-primary)]"}>{p.name}</span>
                      <span className="ml-auto text-xs text-[var(--text-muted)]">{(p.price / 100).toFixed(0)} kr</span>
                    </label>
                  );
                })}
              </div>
              {draft.bogoExcludedProductIds.length > 0 && (
                <button
                  type="button"
                  onClick={() => set("bogoExcludedProductIds", [])}
                  className="mt-1 text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)] underline"
                >
                  Rensa uteslutningar ({draft.bogoExcludedProductIds.length})
                </button>
              )}
            </Field>
          )}
        </div>

        {/* Settings */}
        <div className="grid grid-cols-3 gap-4">
          <Field label="Giltig till">
            <Input
              type="date"
              value={draft.validUntil}
              onChange={(e) => set("validUntil", e.target.value)}
            />
          </Field>
          <Field label="Status">
            <Select value={draft.isActive ? "active" : "inactive"} onChange={(e) => set("isActive", e.target.value === "active")}>
              <option value="active">Aktiv</option>
              <option value="inactive">Inaktiv</option>
            </Select>
          </Field>
          <Field label="Visa som banner">
            <Select value={draft.showAsBanner ? "yes" : "no"} onChange={(e) => set("showAsBanner", e.target.value === "yes")}>
              <option value="yes">Ja</option>
              <option value="no">Nej</option>
            </Select>
          </Field>
        </div>

        {/* Summary */}
        <DealSummary draft={draft} />
      </form>
    </Modal>
  );
}

function buildDescription(d: Draft): string {
  if (d.triggerMode === "category") return `Köp ${d.triggerQuantity} från kategorin och få 1 gratis`;
  if (d.triggerMode === "minorder") return `Beställ för minst ${d.bogoMinOrderAmount} kr och få 1 gratis`;
  return `Köp ${d.triggerQuantity} av valda produkter och få 1 gratis`;
}

function DealSummary({ draft }: { draft: Draft }) {
  const lines: { text: string; color?: string }[] = [];

  if (draft.triggerMode === "category") {
    lines.push({ text: `Kunden köper ${draft.triggerQuantity} artikel${draft.triggerQuantity !== 1 ? "r" : ""} från utlösarkategorin → den billigaste icke-uteslutna artikeln i gratis-kategorin dras av (endast baspris).` });
  } else if (draft.triggerMode === "minorder") {
    lines.push({ text: `Kunden beställer för minst ${draft.bogoMinOrderAmount || "?"} kr → den billigaste icke-uteslutna artikeln dras av (endast baspris).` });
  } else {
    lines.push({ text: `Kunden köper ${draft.triggerQuantity} av de valda produkterna → den billigaste icke-uteslutna artikeln dras av (endast baspris).` });
  }

  if (draft.bogoMaxRewardPrice && Number(draft.bogoMaxRewardPrice) > 0) {
    lines.push({ text: `Max gratis-basepris: ${draft.bogoMaxRewardPrice} kr — väljer kunden något dyrare betalar de mellanskillnaden.`, color: "text-amber-400" });
  }
  if (draft.bogoExcludedProductIds.length > 0) {
    lines.push({ text: `${draft.bogoExcludedProductIds.length} produkt${draft.bogoExcludedProductIds.length !== 1 ? "er" : ""} utesluten${draft.bogoExcludedProductIds.length !== 1 ? "a" : ""} från reward.`, color: "text-red-400" });
  }

  return (
    <div className="rounded-lg bg-[rgba(255,255,255,0.03)] border border-[var(--border-subtle)] px-3 py-2 text-xs text-[var(--text-muted)] grid gap-1">
      {lines.map((l, i) => (
        <span key={i} className={l.color}>{l.text}</span>
      ))}
    </div>
  );
}
