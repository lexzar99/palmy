"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Sparkles, Trash2, X } from "lucide-react";
import {
  createPopupDeal,
  deletePopupDeal,
  getPopupDeals,
  popupDealsQueryKey,
  updatePopupDeal,
  type PopupDealPayload,
  type PopupDealRecord,
} from "@/modules/popup-builder/api";
import { getRestaurantOverview } from "@/modules/restaurants/api";
import {
  Badge,
  Button,
  EmptyState,
  ErrorPanel,
  Field,
  Input,
  MetricCard,
  SectionHeader,
  Select,
  Surface,
  Textarea,
} from "@/shared/components/ui";
import { ImageUploadField } from "@/shared/components/image-upload";

// ─── Live preview-komponent ─────────────────────────────────────────────────
// Rendererar exakt samma popup som kunden ser i web/RN. När admin redigerar
// fälten uppdateras previewen direkt. Cementerar att det vi designar i
// admin är vad kunden får.
function PopupPreview({ draft }: { draft: PopupDealPayload & { restaurants?: { name: string }[] } }) {
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

      <p className="mt-2 text-sm text-[var(--text-secondary)]">Detta är vad kunden ser första gången appen öppnas:</p>

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
            <div className="mb-4 flex h-40 w-full items-center justify-center rounded-2xl bg-[rgba(243,191,87,0.1)] text-4xl">
              🎁
            </div>
          )}

          {badge ? (
            <div className="mb-3 inline-block rounded-full bg-[#f3bf57] px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-[#11151b]">
              {badge}
            </div>
          ) : null}

          <h3 className="text-2xl font-black tracking-[-0.04em]">{headline}</h3>
          {body ? <p className="mt-3 text-sm leading-6 text-white/80">{body}</p> : null}

          {draft.minOrder && draft.minOrder > 0 ? (
            <p className="mt-3 text-xs font-bold uppercase tracking-wider text-white/50">
              Minsta order {draft.minOrder} kr
            </p>
          ) : null}
          {draft.validUntil ? (
            <p className="mt-1 text-xs font-bold uppercase tracking-wider text-white/50">
              Gäller t.o.m. {draft.validUntil}
            </p>
          ) : null}

          {code ? (
            <div className="mt-4 rounded-2xl border border-dashed border-[#f3bf57]/40 bg-[#f3bf57]/10 px-4 py-3 text-center">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#f3bf57]">Använd kod</p>
              <p className="mt-1 text-lg font-black tracking-wider text-white">{code}</p>
            </div>
          ) : null}

          <button
            type="button"
            className="mt-5 w-full rounded-2xl bg-[#f3bf57] py-4 text-sm font-black uppercase tracking-[0.2em] text-[#11151b]"
          >
            {cta}
          </button>
          <button
            type="button"
            className="mt-2 w-full rounded-2xl py-3 text-xs font-bold uppercase tracking-[0.2em] text-white/50"
          >
            Inte just nu
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Editor-formulär ────────────────────────────────────────────────────────
function PopupEditor({
  draft,
  setDraft,
  restaurants,
}: {
  draft: PopupDealPayload;
  setDraft: (next: PopupDealPayload) => void;
  restaurants: Array<{ id: string; name: string }>;
}) {
  const update = (patch: Partial<PopupDealPayload>) => setDraft({ ...draft, ...patch });

  const toggleRestaurant = (id: string) => {
    const current = draft.applicableRestaurantIds || [];
    update({
      applicableRestaurantIds: current.includes(id)
        ? current.filter((r) => r !== id)
        : [...current, id],
      isGlobal: false,
    });
  };

  return (
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
          <ImageUploadField
            label="Hero-bild i popupen"
            value={draft.imageUrl || ""}
            onChange={(url) => update({ imageUrl: url })}
          />
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
            <Input type="date" value={draft.validUntil ? String(draft.validUntil).slice(0, 10) : ""} onChange={(e) => update({ validUntil: e.target.value || null })} />
          </Field>
          <Field label="Max användningar (totalt)">
            <Input type="number" value={draft.maxUsages ?? ""} onChange={(e) => update({ maxUsages: e.target.value ? Number(e.target.value) : null })} placeholder="∞" />
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

      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Status">
          <Select value={draft.isActive ? "yes" : "no"} onChange={(e) => update({ isActive: e.target.value === "yes" })}>
            <option value="yes">Aktiv (visas för kunder)</option>
            <option value="no">Inaktiv (utkast)</option>
          </Select>
        </Field>
        <Field label="Sortordning">
          <Input type="number" value={(draft as any).sortOrder || 0} onChange={(e) => update({ ...(draft as any), sortOrder: Number(e.target.value) })} />
        </Field>
      </div>
    </div>
  );
}

// ─── Huvudsidan ─────────────────────────────────────────────────────────────
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

export function PopupBuilderPage() {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<PopupDealPayload>(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dealsQuery = useQuery({ queryKey: popupDealsQueryKey, queryFn: getPopupDeals });
  const restaurantsQuery = useQuery({ queryKey: ["restaurants", "overview"], queryFn: getRestaurantOverview });

  const restaurantOptions = useMemo(
    () => (restaurantsQuery.data || []).map((r) => ({ id: r.id, name: r.name })),
    [restaurantsQuery.data],
  );

  const saveMutation = useMutation({
    mutationFn: () => (editingId ? updatePopupDeal(editingId, draft) : createPopupDeal(draft)),
    onSuccess: async () => {
      setError(null);
      setShowEditor(false);
      setEditingId(null);
      setDraft(emptyDraft);
      await queryClient.invalidateQueries({ queryKey: popupDealsQueryKey });
      await queryClient.invalidateQueries({ queryKey: ["deals"] });
    },
    onError: (e: any) => {
      setError(e?.response?.data?.error || "Kunde inte spara popupen.");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deletePopupDeal(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: popupDealsQueryKey });
    },
  });

  const startCreate = () => {
    setEditingId(null);
    setDraft(emptyDraft);
    setShowEditor(true);
    setError(null);
  };

  const startEdit = (deal: PopupDealRecord) => {
    setEditingId(deal.id);
    setDraft({
      title: deal.title,
      description: deal.description || "",
      badgeText: deal.badgeText || "",
      imageUrl: deal.imageUrl,
      popupHeadline: deal.popupHeadline || "",
      popupBody: deal.popupBody || "",
      popupCtaLabel: deal.popupCtaLabel || "Spara erbjudande",
      popupCode: deal.popupCode || "",
      discountType: deal.discountType,
      discountValue: deal.discountValue,
      minOrder: deal.minOrder,
      isActive: deal.isActive,
      popupEnabled: true,
      showOnSite: deal.showOnSite,
      isGlobal: deal.isGlobal,
      applicableRestaurantIds: deal.applicableRestaurantIds || [],
      validUntil: deal.validUntil,
      maxUsages: deal.maxUsages,
      scopeType: deal.scopeType,
    });
    setShowEditor(true);
    setError(null);
  };

  if (dealsQuery.isError) {
    return (
      <ErrorPanel
        title="Popup-deals kunde inte hämtas"
        description={(dealsQuery.error as any)?.message}
        action={<Button onClick={() => void dealsQuery.refetch()}>Försök igen</Button>}
      />
    );
  }

  const deals = dealsQuery.data || [];
  const activeCount = deals.filter((d) => d.isActive).length;

  return (
    <div className="page-stack">
      <Surface className="px-6 py-6">
        <SectionHeader
          eyebrow="Popup-erbjudanden"
          title="Popup builder"
          description="Skapa erbjudanden som visas som popup första gången kunden öppnar appen. Kunder kan spara dem till sitt konto med ett klick."
          actions={
            <Button variant="primary" onClick={startCreate}>
              <Plus size={16} /> Ny popup
            </Button>
          }
        />
      </Surface>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Totalt" value={deals.length} />
        <MetricCard label="Aktiva" value={activeCount} />
        <MetricCard
          label="Globala"
          value={deals.filter((d) => d.isGlobal).length}
          detail="Visas för alla restauranger"
        />
        <MetricCard
          label="Med kod"
          value={deals.filter((d) => Boolean(d.popupCode)).length}
        />
      </div>

      {showEditor ? (
        <Surface className="px-6 py-6">
          <div className="flex items-center justify-between gap-3">
            <SectionHeader
              eyebrow={editingId ? "Redigera" : "Ny"}
              title={editingId ? "Uppdatera popup" : "Skapa popup"}
            />
            <Button onClick={() => { setShowEditor(false); setEditingId(null); }}>
              <X size={14} /> Stäng
            </Button>
          </div>
          <div className="mt-4 grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
            <PopupEditor draft={draft} setDraft={setDraft} restaurants={restaurantOptions} />
            <PopupPreview draft={draft} />
          </div>
          {error ? <p className="mt-3 text-sm text-rose-400">{error}</p> : null}
          <div className="mt-5 flex justify-end gap-2">
            <Button onClick={() => { setShowEditor(false); setEditingId(null); }}>Avbryt</Button>
            <Button
              variant="primary"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending || !draft.title?.trim()}
            >
              {saveMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : null}
              {editingId ? "Uppdatera" : "Skapa popup"}
            </Button>
          </div>
        </Surface>
      ) : null}

      <Surface className="px-6 py-6">
        <SectionHeader eyebrow="Befintliga popups" title="Aktiva och utkast" />
        {dealsQuery.isLoading ? (
          <div className="surface-muted px-5 py-12 text-center text-sm text-[var(--text-secondary)]">Hämtar...</div>
        ) : deals.length === 0 ? (
          <EmptyState
            title="Inga popups än"
            description="Tryck Ny popup för att skapa den första. Den visas första gången kunden öppnar appen."
            action={<Button variant="primary" onClick={startCreate}><Plus size={14} /> Ny popup</Button>}
          />
        ) : (
          <div className="mt-4 grid gap-3">
            {deals.map((deal) => (
              <div key={deal.id} className="surface-muted px-5 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    {deal.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={deal.imageUrl} alt="" className="h-16 w-16 rounded-xl object-cover" />
                    ) : (
                      <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-[rgba(243,191,87,0.12)] text-2xl">🎁</div>
                    )}
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-lg font-black tracking-[-0.02em]">{deal.popupHeadline || deal.title}</p>
                        <Badge tone={deal.isActive ? "success" : "neutral"}>{deal.isActive ? "Aktiv" : "Inaktiv"}</Badge>
                        {deal.isGlobal ? <Badge tone="info">Alla</Badge> : <Badge tone="info">{deal.applicableRestaurantIds.length} restauranger</Badge>}
                        {deal.popupCode ? <Badge tone="warning">Kod: {deal.popupCode}</Badge> : null}
                      </div>
                      {deal.popupBody ? <p className="mt-2 text-sm text-[var(--text-secondary)]">{deal.popupBody}</p> : null}
                      <p className="mt-2 text-xs text-[var(--text-muted)]">
                        {deal.discountType === "PERCENTAGE" ? `${deal.discountValue}%` : `${deal.discountValue} kr`}
                        {deal.minOrder > 0 ? ` • min ${deal.minOrder} kr` : ""}
                        {deal.validUntil ? ` • t.o.m. ${String(deal.validUntil).slice(0, 10)}` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="primary" onClick={() => startEdit(deal)}>Redigera</Button>
                    <Button variant="danger" onClick={() => { if (confirm(`Radera "${deal.title}"?`)) deleteMutation.mutate(deal.id); }} disabled={deleteMutation.isPending}>
                      <Trash2 size={14} /> Radera
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Surface>
    </div>
  );
}
