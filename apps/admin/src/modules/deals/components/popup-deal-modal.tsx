"use client";

import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Sparkles, Trash2 } from "lucide-react";
import {
  createPopupDeal,
  deletePopupDeal,
  popupDealsQueryKey,
  updatePopupDeal,
  type PopupDealPayload,
  type PopupDealRecord,
} from "@/modules/popup-builder/api";
import { dealsQueryKey } from "@/modules/deals/api";
import { Badge, Button, Field, Input, Modal, Select, Textarea } from "@/shared/components/ui";
import { ImageUploadField } from "@/shared/components/image-upload";

const emptyDraft: PopupDealPayload = {
  title: "",
  description: "",
  badgeText: "",
  imageUrl: null,
  popupHeadline: "",
  popupBody: "",
  popupCtaLabel: "Spara erbjudande",
  popupCode: "",
  discountType: "PERCENTAGE",
  discountValue: 10,
  minOrder: 0,
  isActive: true,
  popupEnabled: true,
  showOnSite: true,
  isGlobal: true,
  applicableRestaurantIds: [],
  validUntil: null,
  maxUsages: null,
  scopeType: "RESTAURANT",
};

// Live preview-komponent — renderar samma popup som kunden ser i webb/RN.
function PopupPreview({ draft }: { draft: PopupDealPayload }) {
  const headline = draft.popupHeadline?.trim() || draft.title?.trim() || "Erbjudande";
  const body = draft.popupBody?.trim() || draft.description?.trim() || "";
  const cta = draft.popupCtaLabel?.trim() || "Spara erbjudande";
  const badge = draft.badgeText?.trim() || (draft.discountType === "PERCENTAGE" ? `-${draft.discountValue || 0}%` : "");
  const code = draft.popupCode?.trim();

  return (
    <div className="surface-muted px-5 py-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">Live-preview</p>
        <Sparkles size={14} className="text-[var(--accent-strong)]" />
      </div>
      <p className="mt-2 text-sm text-[var(--text-secondary)]">Kundens vy första gången appen öppnas:</p>

      <div className="mt-4 flex justify-center">
        <div
          className="w-[340px] max-w-full rounded-[28px] p-6 shadow-2xl"
          style={{
            background: "linear-gradient(180deg, #1a1f29 0%, #11151b 100%)",
            border: "1px solid rgba(243,191,87,0.3)",
            color: "#fff",
          }}
        >
          {draft.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={draft.imageUrl} alt="" className="mb-4 h-40 w-full rounded-2xl object-cover" />
          ) : (
            <div className="mb-4 flex h-40 w-full items-center justify-center rounded-2xl bg-[rgba(243,191,87,0.1)] text-4xl">🎁</div>
          )}
          {badge ? (
            <div className="mb-3 inline-block rounded-full bg-[#f3bf57] px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-[#11151b]">
              {badge}
            </div>
          ) : null}
          <h3 className="text-2xl font-black tracking-[-0.04em]">{headline}</h3>
          {body ? <p className="mt-3 text-sm leading-6 text-white/80">{body}</p> : null}
          {draft.minOrder && draft.minOrder > 0 ? (
            <p className="mt-3 text-xs font-bold uppercase tracking-wider text-white/50">Minsta order {draft.minOrder} kr</p>
          ) : null}
          {draft.validUntil ? (
            <p className="mt-1 text-xs font-bold uppercase tracking-wider text-white/50">Gäller t.o.m. {String(draft.validUntil).slice(0, 10)}</p>
          ) : null}
          {code ? (
            <div className="mt-4 rounded-2xl border border-dashed border-[#f3bf57]/40 bg-[#f3bf57]/10 px-4 py-3 text-center">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#f3bf57]">Använd kod</p>
              <p className="mt-1 text-lg font-black tracking-wider text-white">{code}</p>
            </div>
          ) : null}
          <button type="button" className="mt-5 w-full rounded-2xl bg-[#f3bf57] py-4 text-sm font-black uppercase tracking-[0.2em] text-[#11151b]">
            {cta}
          </button>
          <button type="button" className="mt-2 w-full rounded-2xl py-3 text-xs font-bold uppercase tracking-[0.2em] text-white/50">
            Inte just nu
          </button>
        </div>
      </div>
    </div>
  );
}

export function PopupDealModal({
  open,
  onClose,
  initialDeal,
  restaurants,
}: {
  open: boolean;
  onClose: () => void;
  initialDeal: PopupDealRecord | null;
  restaurants: Array<{ id: string; name: string }>;
}) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<PopupDealPayload>(emptyDraft);
  const [error, setError] = useState<string | null>(null);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!open) return;
    if (initialDeal) {
      setDraft({
        title: initialDeal.title,
        description: initialDeal.description || "",
        badgeText: initialDeal.badgeText || "",
        imageUrl: initialDeal.imageUrl,
        popupHeadline: initialDeal.popupHeadline || "",
        popupBody: initialDeal.popupBody || "",
        popupCtaLabel: initialDeal.popupCtaLabel || "Spara erbjudande",
        popupCode: initialDeal.popupCode || "",
        discountType: initialDeal.discountType,
        discountValue: initialDeal.discountValue,
        minOrder: initialDeal.minOrder,
        isActive: initialDeal.isActive,
        popupEnabled: true,
        showOnSite: initialDeal.showOnSite,
        isGlobal: initialDeal.isGlobal,
        applicableRestaurantIds: initialDeal.applicableRestaurantIds || [],
        validUntil: initialDeal.validUntil,
        maxUsages: initialDeal.maxUsages,
        scopeType: initialDeal.scopeType,
      });
    } else {
      setDraft(emptyDraft);
    }
    setError(null);
  }, [open, initialDeal]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const update = (patch: Partial<PopupDealPayload>) => setDraft((current) => ({ ...current, ...patch }));

  const toggleRestaurant = (id: string) => {
    const current = draft.applicableRestaurantIds || [];
    update({
      applicableRestaurantIds: current.includes(id) ? current.filter((r) => r !== id) : [...current, id],
      isGlobal: false,
    });
  };

  const saveMutation = useMutation({
    mutationFn: () => (initialDeal ? updatePopupDeal(initialDeal.id, draft) : createPopupDeal(draft)),
    onSuccess: async () => {
      setError(null);
      await queryClient.invalidateQueries({ queryKey: popupDealsQueryKey });
      await queryClient.invalidateQueries({ queryKey: dealsQueryKey });
      onClose();
    },
    onError: (e: any) => {
      setError(e?.response?.data?.error || "Kunde inte spara popupen.");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => {
      if (!initialDeal) return Promise.resolve({ success: true });
      return deletePopupDeal(initialDeal.id);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: popupDealsQueryKey });
      await queryClient.invalidateQueries({ queryKey: dealsQueryKey });
      onClose();
    },
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={initialDeal ? `Redigera popup: ${initialDeal.title}` : "Ny popup-deal"}
      description="Detta erbjudande visas som popup första gången kunden öppnar appen. Live-preview till höger."
      widthClassName="max-w-[1200px]"
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            {initialDeal ? (
              <Button variant="danger" onClick={() => deleteMutation.mutate()} disabled={deleteMutation.isPending}>
                <Trash2 size={16} /> Radera
              </Button>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={onClose}>Stäng</Button>
            <Button variant="primary" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !draft.title?.trim()}>
              {saveMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : null}
              {initialDeal ? "Uppdatera" : "Skapa popup"}
            </Button>
          </div>
        </div>
      }
    >
      <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="grid gap-4">
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Titel (intern)">
              <Input value={draft.title || ""} onChange={(e) => update({ title: e.target.value })} placeholder="t.ex. Höstkampanj 2026" />
            </Field>
            <Field label="Badge / liten etikett">
              <Input value={draft.badgeText || ""} onChange={(e) => update({ badgeText: e.target.value })} placeholder="-20% eller HALAL" />
            </Field>
            <Field label="Popup-rubrik (det stora som syns)">
              <Input value={draft.popupHeadline || ""} onChange={(e) => update({ popupHeadline: e.target.value })} placeholder="20% rabatt på hela menyn!" />
            </Field>
            <Field label="CTA-knappens text">
              <Input value={draft.popupCtaLabel || ""} onChange={(e) => update({ popupCtaLabel: e.target.value })} placeholder="Spara erbjudande" />
            </Field>
            <div className="md:col-span-2">
              <Field label="Brödtext">
                <Textarea value={draft.popupBody || ""} onChange={(e) => update({ popupBody: e.target.value })} placeholder="Beskriv villkoren och varför kunden ska klämma den." />
              </Field>
            </div>
            <div className="md:col-span-2">
              <ImageUploadField label="Hero-bild i popupen" value={draft.imageUrl || ""} onChange={(url) => update({ imageUrl: url })} />
            </div>
          </div>

          <div className="surface-muted px-5 py-4">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">Rabatt och villkor</p>
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <Field label="Typ">
                <Select value={draft.discountType || "PERCENTAGE"} onChange={(e) => update({ discountType: e.target.value as any })}>
                  <option value="PERCENTAGE">Procent</option>
                  <option value="FIXED">Fast belopp (kr)</option>
                </Select>
              </Field>
              <Field label="Värde">
                <Input type="number" value={draft.discountValue || 0} onChange={(e) => update({ discountValue: Number(e.target.value) })} />
              </Field>
              <Field label="Minsta ordervärde (kr)">
                <Input type="number" value={draft.minOrder || 0} onChange={(e) => update({ minOrder: Number(e.target.value) })} />
              </Field>
              <Field label="Kod kunden ser">
                <Input value={draft.popupCode || ""} onChange={(e) => update({ popupCode: e.target.value })} placeholder="HÖST20" />
              </Field>
              <Field label="Slutdatum">
                <Input
                  type="date"
                  value={draft.validUntil ? String(draft.validUntil).slice(0, 10) : ""}
                  onChange={(e) => update({ validUntil: e.target.value || null })}
                />
              </Field>
              <Field label="Max användningar (totalt)">
                <Input
                  type="number"
                  value={draft.maxUsages ?? ""}
                  onChange={(e) => update({ maxUsages: e.target.value ? Number(e.target.value) : null })}
                  placeholder="∞"
                />
              </Field>
            </div>
          </div>

          <div className="surface-muted px-5 py-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">Vilka restauranger gäller?</p>
              <div className="flex gap-2">
                <Button variant={draft.isGlobal ? "primary" : "secondary"} onClick={() => update({ isGlobal: true, applicableRestaurantIds: [] })}>
                  Alla restauranger
                </Button>
                <Button variant={!draft.isGlobal ? "primary" : "secondary"} onClick={() => update({ isGlobal: false })}>
                  Specifika
                </Button>
              </div>
            </div>
            {!draft.isGlobal ? (
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {restaurants.map((restaurant) => {
                  const active = (draft.applicableRestaurantIds || []).includes(restaurant.id);
                  return (
                    <button
                      key={restaurant.id}
                      type="button"
                      onClick={() => toggleRestaurant(restaurant.id)}
                      className={`rounded-2xl border px-4 py-3 text-left transition-all ${
                        active
                          ? "border-[var(--accent-strong)] bg-[rgba(243,191,87,0.1)]"
                          : "border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)]"
                      }`}
                    >
                      <p className="font-black tracking-[-0.02em]">{restaurant.name}</p>
                      {active ? <Badge tone="success">Vald</Badge> : null}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>

          <Field label="Status">
            <Select value={draft.isActive ? "yes" : "no"} onChange={(e) => update({ isActive: e.target.value === "yes" })}>
              <option value="yes">Aktiv (visas för kunder)</option>
              <option value="no">Inaktiv (utkast)</option>
            </Select>
          </Field>

          {error ? <p className="text-sm text-rose-400">{error}</p> : null}
        </div>

        <PopupPreview draft={draft} />
      </div>
    </Modal>
  );
}
