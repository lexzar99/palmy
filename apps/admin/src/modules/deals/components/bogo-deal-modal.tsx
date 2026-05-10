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

type Draft = {
  title: string;
  imageUrl: string;
  restaurantId: string;
  triggerCategoryId: string;
  triggerQuantity: number;
  rewardCategoryId: string;
  bogoExcludedProductIds: string[];
  isActive: boolean;
  showAsBanner: boolean;
  validUntil: string;
};

const defaultDraft = (): Draft => ({
  title: "",
  imageUrl: "",
  restaurantId: "",
  triggerCategoryId: "",
  triggerQuantity: 2,
  rewardCategoryId: "",
  bogoExcludedProductIds: [],
  isActive: true,
  showAsBanner: true,
  validUntil: "",
});

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

  // Products that belong to the reward category (or trigger if reward is empty)
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
        triggerCategoryId: deal.triggerCategoryId || "",
        triggerQuantity: deal.triggerQuantity ?? 2,
        rewardCategoryId: deal.rewardCategoryId || "",
        bogoExcludedProductIds: deal.bogoExcludedProductIds ?? [],
        isActive: deal.isActive,
        showAsBanner: deal.showAsBanner ?? false,
        validUntil: deal.validUntil ? deal.validUntil.slice(0, 10) : "",
      });
    } else {
      setDraft({ ...defaultDraft(), restaurantId: prefillRestaurantId ?? "", imageUrl: "" });
    }
    setError(null);
  }, [open, deal, prefillRestaurantId]);

  const set = <K extends keyof Draft>(key: K, val: Draft[K]) =>
    setDraft((prev) => ({ ...prev, [key]: val }));

  const resetCategorySelections = () => {
    setDraft((prev) => ({ ...prev, triggerCategoryId: "", rewardCategoryId: "", bogoExcludedProductIds: [] }));
  };

  const toggleExcluded = (productId: string) => {
    setDraft((prev) => ({
      ...prev,
      bogoExcludedProductIds: prev.bogoExcludedProductIds.includes(productId)
        ? prev.bogoExcludedProductIds.filter((id) => id !== productId)
        : [...prev.bogoExcludedProductIds, productId],
    }));
  };

  const saveMutation = useMutation({
    mutationFn: async (d: Draft) => {
      const payload = {
        title: d.title,
        imageUrl: d.imageUrl || null,
        description: `Köp ${d.triggerQuantity} från kategorin och få 1 gratis`,
        scopeType: "BOGO_CATEGORY",
        triggerType: "BOGO_CATEGORY",
        discountType: "FIXED",
        discountValue: 0,
        restaurantId: d.restaurantId || null,
        triggerCategoryId: d.triggerCategoryId || null,
        triggerQuantity: d.triggerQuantity,
        rewardCategoryId: d.rewardCategoryId || null,
        bogoExcludedProductIds: d.bogoExcludedProductIds,
        isActive: d.isActive,
        showOnSite: true,
        showAsBanner: d.showAsBanner,
        popupEnabled: false,
        validUntil: d.validUntil || null,
      };
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
    if (!draft.triggerCategoryId) { setError("Välj utlösarkategori."); return; }
    setError(null);
    saveMutation.mutate(draft);
  };

  const catOptions = categories.data ?? [];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={deal ? "Redigera BOGO-deal" : "Ny BOGO-deal (köp X, få 1 gratis)"}
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
      <form onSubmit={handleSubmit} className="grid gap-4">
        {error && (
          <p className="rounded-lg bg-[rgba(239,68,68,0.1)] px-4 py-3 text-sm text-red-400">{error}</p>
        )}

        <Field label="Titel">
          <Input
            value={draft.title}
            onChange={(e) => set("title", e.target.value)}
            placeholder="Köp 2 pizzor, få 1 gratis"
            autoFocus
          />
        </Field>

        <ImageUploadField
          label="Bannerbild (valfritt — visas på restaurangsidan)"
          value={draft.imageUrl}
          onChange={(url) => set("imageUrl", url)}
        />

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

        <Field label="Utlösarkategori (kunden köper härifrån)">
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

        <Field label="Antal artiklar som krävs för att utlösa erbjudandet">
          <Input
            type="number"
            min="1"
            step="1"
            value={draft.triggerQuantity}
            onChange={(e) => set("triggerQuantity", Math.max(1, Number(e.target.value)))}
          />
        </Field>

        <Field label="Gratis-kategori (lämna tom = samma som utlösare)">
          <Select
            value={draft.rewardCategoryId}
            onChange={(e) => { set("rewardCategoryId", e.target.value); set("bogoExcludedProductIds", []); }}
            disabled={!draft.restaurantId || categories.isLoading}
          >
            <option value="">Samma kategori som ovan</option>
            {catOptions.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
        </Field>

        {rewardCategoryProducts.length > 0 && (
          <Field label="Uteslut dessa produkter från gratis-erbjudandet">
            <div className="max-h-44 overflow-y-auto rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-secondary)] p-2 flex flex-col gap-0.5">
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
                    <span className={excluded ? "line-through text-[var(--text-muted)]" : "text-[var(--text-primary)]"}>
                      {p.name}
                    </span>
                    <span className="ml-auto text-xs text-[var(--text-muted)]">
                      {(p.price / 100).toFixed(0)} kr
                    </span>
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
                Rensa uteslutningar
              </button>
            )}
          </Field>
        )}

        <div className="grid grid-cols-2 gap-4">
          <Field label="Giltig till (valfritt)">
            <Input
              type="date"
              value={draft.validUntil}
              onChange={(e) => set("validUntil", e.target.value)}
            />
          </Field>
          <Field label="Status">
            <Select
              value={draft.isActive ? "active" : "inactive"}
              onChange={(e) => set("isActive", e.target.value === "active")}
            >
              <option value="active">Aktiv</option>
              <option value="inactive">Inaktiv</option>
            </Select>
          </Field>
          <Field label="Visa som banner">
            <Select
              value={draft.showAsBanner ? "yes" : "no"}
              onChange={(e) => set("showAsBanner", e.target.value === "yes")}
            >
              <option value="no">Nej</option>
              <option value="yes">Ja — banner på restaurangsidan</option>
            </Select>
          </Field>
        </div>

        <p className="text-xs text-[var(--text-muted)] rounded-lg bg-[rgba(255,255,255,0.03)] border border-[var(--border-subtle)] px-3 py-2">
          Kunden köper <strong>{draft.triggerQuantity}</strong> artikel{draft.triggerQuantity !== 1 ? "r" : ""} från utlösarkategorin → den billigaste <em>icke-uteslutna</em> artikeln i gratis-kategorin dras av (endast baspris, extratillval betalas alltid).
          {draft.bogoExcludedProductIds.length > 0 && (
            <span className="block mt-1 text-red-400">{draft.bogoExcludedProductIds.length} produkt{draft.bogoExcludedProductIds.length !== 1 ? "er" : ""} utesluten{draft.bogoExcludedProductIds.length !== 1 ? "a" : ""}.</span>
          )}
        </p>
      </form>
    </Modal>
  );
}
