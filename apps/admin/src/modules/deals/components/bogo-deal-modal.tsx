"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Trash2 } from "lucide-react";
import {
  createAutomaticDeal,
  dealsQueryKey,
  dealCategoriesQueryKey,
  dealRestaurantsQueryKey,
  deleteAutomaticDeal,
  getDealCategories,
  getDealRestaurants,
  updateAutomaticDeal,
  type AutomaticDealRecord,
} from "@/modules/deals/api";
import { Button, Field, Input, Modal, Select } from "@/shared/components/ui";

type Draft = {
  title: string;
  restaurantId: string;
  triggerCategoryId: string;
  triggerQuantity: number;
  rewardCategoryId: string;
  isActive: boolean;
  validUntil: string;
};

const defaultDraft = (): Draft => ({
  title: "",
  restaurantId: "",
  triggerCategoryId: "",
  triggerQuantity: 2,
  rewardCategoryId: "",
  isActive: true,
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

  useEffect(() => {
    if (!open) return;
    if (deal) {
      setDraft({
        title: deal.title,
        restaurantId: deal.restaurantId || "",
        triggerCategoryId: deal.triggerCategoryId || "",
        triggerQuantity: deal.triggerQuantity ?? 2,
        rewardCategoryId: deal.rewardCategoryId || "",
        isActive: deal.isActive,
        validUntil: deal.validUntil ? deal.validUntil.slice(0, 10) : "",
      });
    } else {
      setDraft({ ...defaultDraft(), restaurantId: prefillRestaurantId ?? "" });
    }
    setError(null);
  }, [open, deal, prefillRestaurantId]);

  const set = <K extends keyof Draft>(key: K, val: Draft[K]) =>
    setDraft((prev) => ({ ...prev, [key]: val }));

  const saveMutation = useMutation({
    mutationFn: async (d: Draft) => {
      const payload = {
        title: d.title,
        description: `Köp ${d.triggerQuantity} från kategorin och få 1 gratis`,
        scopeType: "BOGO_CATEGORY",
        triggerType: "BOGO_CATEGORY",
        discountType: "FIXED",
        discountValue: 0,
        restaurantId: d.restaurantId || null,
        triggerCategoryId: d.triggerCategoryId || null,
        triggerQuantity: d.triggerQuantity,
        rewardCategoryId: d.rewardCategoryId || null,
        isActive: d.isActive,
        showOnSite: true,
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

        <Field label="Restaurang">
          <Select value={draft.restaurantId} onChange={(e) => { set("restaurantId", e.target.value); set("triggerCategoryId", ""); set("rewardCategoryId", ""); }}>
            <option value="">Välj restaurang...</option>
            {(restaurants.data ?? []).map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </Select>
        </Field>

        <Field label="Utlösarkategori (kunden köper härifrån)">
          <Select
            value={draft.triggerCategoryId}
            onChange={(e) => set("triggerCategoryId", e.target.value)}
            disabled={!draft.restaurantId || categories.isLoading}
          >
            <option value="">Välj kategori...</option>
            {catOptions.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
        </Field>

        <Field label="Antal som krävs för att utlösa erbjudandet">
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
            onChange={(e) => set("rewardCategoryId", e.target.value)}
            disabled={!draft.restaurantId || categories.isLoading}
          >
            <option value="">Samma kategori som ovan</option>
            {catOptions.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Giltig till (valfritt)">
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
        </div>

        <p className="text-xs text-[var(--text-muted)] rounded-lg bg-[rgba(255,255,255,0.03)] border border-[var(--border-subtle)] px-3 py-2">
          Kunden köper <strong>{draft.triggerQuantity}</strong> artikel{draft.triggerQuantity !== 1 ? "r" : ""} från utlösarkategorin → den billigaste artikeln i gratis-kategorin läggs till gratis.
        </p>
      </form>
    </Modal>
  );
}
