"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, RefreshCw, Zap, Tag, Gift } from "lucide-react";
import {
  dealsQueryKey,
  dealRestaurantsQueryKey,
  getAutomaticDeals,
  getDealRestaurants,
  type AutomaticDealRecord,
} from "@/modules/deals/api";
import { discountsQueryKey, getDiscounts, createDiscount, updateDiscount, deleteDiscount, type DiscountRecord } from "@/modules/coupons/api";
import { Badge, Button, EmptyState, ErrorPanel, Field, Input, Modal, PageHeader, Select, Surface, Textarea } from "@/shared/components/ui";
import { CityRestaurantPicker } from "@/shared/components/city-restaurant-picker";
import { formatDate, formatNumber } from "@/shared/utils/format";
import { getRestaurantOverview, restaurantsQueryKey, type ControlCenterRestaurantSnapshot } from "@/modules/restaurants/api";

type Tab = "bogo" | "kampanjer" | "kupongkoder";

type CouponForm = {
  code: string;
  description: string;
  discountType: "percentage" | "fixed" | "free_delivery";
  discountValue: string;
  minOrderAmount: string;
  maxUses: string;
  startsAt: string;
  expiresAt: string;
  applicableRestaurantIds: string[];
  isActive: boolean;
};

const emptyCouponForm = (): CouponForm => ({
  code: "", description: "", discountType: "percentage", discountValue: "",
  minOrderAmount: "", maxUses: "", startsAt: "", expiresAt: "",
  applicableRestaurantIds: [], isActive: true,
});

const isPopupDeal = (deal: AutomaticDealRecord) =>
  Boolean(deal.popupHeadline?.trim() || deal.popupBody?.trim() || deal.popupCode?.trim());

const isBogoDeal = (deal: AutomaticDealRecord) => deal.triggerType === "BOGO_CATEGORY";

export function DealsPage() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const searchParams = useSearchParams();

  const tabParam = searchParams.get("tab") as Tab | null;
  const [tab, setTab] = useState<Tab>(tabParam || "bogo");
  const [filterRestaurantId, setFilterRestaurantId] = useState<string | null>(null);

  // Kupong modal state
  const [couponModalOpen, setCouponModalOpen] = useState(false);
  const [editingCoupon, setEditingCoupon] = useState<DiscountRecord | null>(null);
  const [couponForm, setCouponForm] = useState<CouponForm>(emptyCouponForm());
  const [couponError, setCouponError] = useState<string | null>(null);

  useEffect(() => {
    if (tabParam && tabParam !== tab) setTab(tabParam);
  }, [tabParam]);

  // Data
  const automaticDeals = useQuery({ queryKey: dealsQueryKey, queryFn: getAutomaticDeals });
  const restaurants = useQuery({ queryKey: dealRestaurantsQueryKey, queryFn: getDealRestaurants });
  const allRestaurants = useQuery({ queryKey: restaurantsQueryKey, queryFn: getRestaurantOverview });
  const discounts = useQuery({ queryKey: discountsQueryKey, queryFn: getDiscounts });

  useEffect(() => { if (!couponModalOpen) setCouponError(null); }, [couponModalOpen]);

  const saveCouponMutation = useMutation({
    mutationFn: async (f: CouponForm) => {
      const payload: Record<string, unknown> = {
        code: f.code.toUpperCase(),
        description: f.description || null,
        type: f.discountType === "percentage" ? "PERCENTAGE" : f.discountType === "fixed" ? "FIXED" : "FREE_DELIVERY",
        value: f.discountType === "free_delivery" ? 0 : Number(f.discountValue) || 0,
        minOrder: Number(f.minOrderAmount) || 0,
        maxUsages: f.maxUses ? Number(f.maxUses) : null,
        validFrom: f.startsAt || null,
        validUntil: f.expiresAt || null,
        applicableRestaurantIds: f.applicableRestaurantIds,
        isActive: f.isActive,
      };
      if (editingCoupon) return updateDiscount(editingCoupon.id, payload);
      return createDiscount(payload);
    },
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: discountsQueryKey }); setCouponModalOpen(false); setEditingCoupon(null); },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setCouponError(msg ?? "Kunde inte spara kupong.");
    },
  });

  const deleteCouponMutation = useMutation({
    mutationFn: () => deleteDiscount(editingCoupon!.id),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: discountsQueryKey }); setCouponModalOpen(false); setEditingCoupon(null); },
    onError: () => setCouponError("Kunde inte radera kupong."),
  });

  const openEditCoupon = (r: DiscountRecord) => {
    setEditingCoupon(r);
    setCouponForm({
      code: r.code, description: r.description ?? "",
      discountType: r.discountType,
      discountValue: r.discountType === "free_delivery" ? "" : String(r.discountValue),
      minOrderAmount: r.minOrderAmount > 0 ? String(r.minOrderAmount) : "",
      maxUses: r.maxUses != null ? String(r.maxUses) : "",
      startsAt: r.startsAt ? r.startsAt.slice(0, 10) : "",
      expiresAt: r.expiresAt ? r.expiresAt.slice(0, 10) : "",
      applicableRestaurantIds: r.applicableRestaurantIds?.length ? r.applicableRestaurantIds : r.restaurantId ? [r.restaurantId] : [],
      isActive: r.isActive,
    });
    setCouponModalOpen(true);
  };

  const bogoDeals = useMemo(() => {
    const all = (automaticDeals.data || []).filter(isBogoDeal);
    if (!filterRestaurantId) return all;
    return all.filter((d) => d.restaurantId === filterRestaurantId || d.isGlobal);
  }, [automaticDeals.data, filterRestaurantId]);

  const kampanjDeals = useMemo(() => {
    const all = (automaticDeals.data || []).filter((d) => !isBogoDeal(d));
    if (!filterRestaurantId) return all;
    return all.filter((d) => d.isGlobal || d.restaurantId === filterRestaurantId || d.applicableRestaurantIds?.includes(filterRestaurantId));
  }, [automaticDeals.data, filterRestaurantId]);

  if (automaticDeals.isLoading || restaurants.isLoading) {
    return <Surface className="px-6 py-12 text-sm text-[var(--text-secondary)]">Laddar deals...</Surface>;
  }
  if (automaticDeals.isError || !automaticDeals.data || !restaurants.data) {
    return <ErrorPanel title="Kunde inte ladda deals" action={<Button onClick={() => void automaticDeals.refetch()}><RefreshCw size={16} /> Försök igen</Button>} />;
  }

  const tabs: { id: Tab; label: string; icon: React.ReactNode; count: number }[] = [
    { id: "bogo", label: "BOGO", icon: <Gift size={16} />, count: bogoDeals.filter((d) => d.isActive).length },
    { id: "kampanjer", label: "Kampanjer", icon: <Zap size={16} />, count: kampanjDeals.filter((d) => d.isActive).length },
    { id: "kupongkoder", label: "Kupongkoder", icon: <Tag size={16} />, count: (discounts.data || []).filter((d) => d.isActive).length },
  ];

  const changeTab = (t: Tab) => {
    setTab(t);
    router.replace(`/deals?tab=${t}`, { scroll: false });
  };

  return (
    <div className="page-stack">
      <PageHeader
        title="Deals"
        actions={
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={() => void automaticDeals.refetch()}><RefreshCw size={13} /></Button>
            {tab === "bogo" && <Button variant="primary" onClick={() => router.push("/deals/bogo/new")}><Plus size={14} /> Ny BOGO-deal</Button>}
            {tab === "kampanjer" && <Button variant="primary" onClick={() => router.push("/deals/kampanj/new")}><Plus size={14} /> Ny kampanj</Button>}
            {tab === "kupongkoder" && <Button variant="primary" onClick={() => { setEditingCoupon(null); setCouponForm(emptyCouponForm()); setCouponModalOpen(true); }}><Plus size={14} /> Ny kupongkod</Button>}
          </div>
        }
      />

      <Surface className="px-6 py-6">
        {/* Restaurant filter — stad först, sen restaurang */}
        <div className="mb-6">
          <CityRestaurantPicker
            value={filterRestaurantId || ""}
            onChange={(rid) => setFilterRestaurantId(rid || null)}
            emptyOption={{ value: "", label: "Alla restauranger i stad" }}
          />
          {filterRestaurantId && (
            <button type="button" onClick={() => setFilterRestaurantId(null)} className="mt-2 text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)] underline">
              Visa alla
            </button>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-3 mb-8">
          {tabs.map(({ id, label, icon, count }) => (
            <button
              key={id}
              type="button"
              onClick={() => changeTab(id)}
              className={`flex items-center gap-2.5 rounded-xl border px-5 py-3 text-sm font-semibold transition-all ${
                tab === id
                  ? "border-[var(--accent)] bg-[rgba(99,102,241,0.12)] text-[var(--accent)] shadow-sm"
                  : "border-[var(--border-subtle)] bg-[var(--surface-secondary)] text-[var(--text-secondary)] hover:border-[var(--border-default)] hover:text-[var(--text-primary)]"
              }`}
            >
              {icon}
              <span>{label}</span>
              {count > 0 && (
                <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${tab === id ? "bg-[var(--accent)] text-white" : "bg-[var(--accent-soft)] text-[var(--text-muted)]"}`}>
                  {count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* BOGO tab */}
        {tab === "bogo" && (
          <DealGrid
            deals={bogoDeals}
            emptyTitle="Inga BOGO-deals"
            emptyDescription='BOGO = köp X, få 1 gratis. Tryck "Ny BOGO-deal" för att skapa.'
            renderCard={(deal) => (
              <DealCard
                key={deal.id}
                deal={deal}
                typeLabel={bogoTriggerLabel(deal)}
                valueLine="1 gratis"
                onClick={() => router.push(`/deals/bogo/${deal.id}`)}
              />
            )}
          />
        )}

        {/* Kampanjer tab */}
        {tab === "kampanjer" && (
          <DealGrid
            deals={kampanjDeals}
            emptyTitle="Inga kampanjer"
            emptyDescription='Kampanjer ger rabatt på restaurang, kategori eller produkt. Tryck "Ny kampanj".'
            renderCard={(deal) => {
              const discountLine =
                deal.discountType === "PERCENTAGE" ? `-${deal.discountValue}%`
                : deal.scopeType === "MIN_ORDER" ? `${deal.discountValue} kr · min ${deal.minOrder} kr`
                : `${deal.discountValue} kr`;
              const typeLabel =
                isPopupDeal(deal) ? "Popup"
                : deal.scopeType === "RESTAURANT" ? "Restaurang"
                : deal.scopeType === "PRODUCT" ? "Produkt"
                : deal.scopeType === "CATEGORY" ? "Kategori"
                : deal.scopeType === "COMBO" ? "Combo"
                : deal.scopeType === "MIN_ORDER" ? "Min.order"
                : deal.scopeType;
              return (
                <DealCard
                  key={deal.id}
                  deal={deal}
                  typeLabel={typeLabel}
                  valueLine={discountLine}
                  onClick={() => router.push(`/deals/kampanj/${deal.id}`)}
                />
              );
            }}
          />
        )}

        {/* Kupongkoder tab */}
        {tab === "kupongkoder" && (
          <div>
            {discounts.isLoading ? (
              <p className="text-sm text-[var(--text-secondary)] py-8 text-center">Laddar...</p>
            ) : (discounts.data || []).length === 0 ? (
              <EmptyState title="Inga kupongkoder" description="Skapa din första kupong med knappen ovan." />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {(discounts.data || []).map((record) => (
                  <button
                    key={record.id}
                    type="button"
                    onClick={() => openEditCoupon(record)}
                    className="surface-muted px-5 py-5 text-left"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-mono text-xl font-black tracking-widest">{record.code}</p>
                      <Badge tone={record.isActive ? "success" : "neutral"}>{record.isActive ? "Aktiv" : "Inaktiv"}</Badge>
                    </div>
                    <p className="mt-2 text-sm font-semibold text-[var(--text-primary)]">
                      {record.discountType === "free_delivery" ? "Fri leverans" : record.discountType === "percentage" ? `-${record.discountValue}%` : `-${record.discountValue} kr`}
                      {record.minOrderAmount > 0 ? <span className="text-[var(--text-muted)] font-normal"> · min {record.minOrderAmount} kr</span> : null}
                    </p>
                    <p className="mt-1 text-xs text-[var(--text-muted)]">
                      {record.applicableRestaurantIds?.length > 0
                        ? record.applicableRestaurantIds.map((id) => (allRestaurants.data || []).find((r: ControlCenterRestaurantSnapshot) => r.id === id)?.name ?? id).join(", ")
                        : record.restaurantId
                          ? ((allRestaurants.data || []).find((r: ControlCenterRestaurantSnapshot) => r.id === record.restaurantId)?.name ?? record.restaurantId)
                          : "Alla restauranger"}
                      {record.expiresAt ? ` · t.o.m. ${formatDate(record.expiresAt)}` : ""}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </Surface>

      {/* Kupong-modal */}
      <Modal
        open={couponModalOpen}
        onClose={() => { setCouponModalOpen(false); setEditingCoupon(null); }}
        title={editingCoupon ? `Redigera ${editingCoupon.code}` : "Ny kupongkod"}
        footer={
          <div className="flex items-center justify-between gap-3">
            <div>
              {editingCoupon && (
                <Button variant="danger" onClick={() => { if (!confirm(`Radera ${editingCoupon.code}?`)) return; deleteCouponMutation.mutate(); }} disabled={deleteCouponMutation.isPending}>Radera</Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button onClick={() => { setCouponModalOpen(false); setEditingCoupon(null); }}>Avbryt</Button>
              <Button variant="primary" onClick={() => {
                if (!couponForm.code.trim()) { setCouponError("Kod krävs."); return; }
                if (couponForm.discountType !== "free_delivery" && (!couponForm.discountValue || Number(couponForm.discountValue) <= 0)) { setCouponError("Värde måste vara > 0."); return; }
                setCouponError(null);
                saveCouponMutation.mutate(couponForm);
              }} disabled={saveCouponMutation.isPending}>
                {saveCouponMutation.isPending ? "Sparar..." : "Spara"}
              </Button>
            </div>
          </div>
        }
      >
        <div className="grid gap-4">
          {couponError && <p className="rounded-lg bg-[rgba(239,68,68,0.1)] px-4 py-3 text-sm text-red-400">{couponError}</p>}
          <Field label="Kod"><Input value={couponForm.code} onChange={(e) => setCouponForm((p) => ({ ...p, code: e.target.value.toUpperCase() }))} placeholder="SOMMAR25" autoFocus /></Field>
          <Field label="Beskrivning (valfritt)"><Input value={couponForm.description} onChange={(e) => setCouponForm((p) => ({ ...p, description: e.target.value }))} placeholder="Sommarkampanj 2026" /></Field>
          <Field label="Typ">
            <Select value={couponForm.discountType} onChange={(e) => setCouponForm((p) => ({ ...p, discountType: e.target.value as CouponForm["discountType"] }))}>
              <option value="percentage">Procent</option>
              <option value="fixed">Fast belopp</option>
              <option value="free_delivery">Fri leverans</option>
            </Select>
          </Field>
          {couponForm.discountType !== "free_delivery" && (
            <Field label={couponForm.discountType === "percentage" ? "Värde (%)" : "Värde (kr)"}>
              <Input type="number" min="0" value={couponForm.discountValue} onChange={(e) => setCouponForm((p) => ({ ...p, discountValue: e.target.value }))} placeholder={couponForm.discountType === "percentage" ? "15" : "50"} />
            </Field>
          )}
          <div className="grid grid-cols-2 gap-4">
            <Field label="Min. ordervärde (kr)"><Input type="number" min="0" value={couponForm.minOrderAmount} onChange={(e) => setCouponForm((p) => ({ ...p, minOrderAmount: e.target.value }))} placeholder="0" /></Field>
            <Field label="Max antal (tom = ∞)"><Input type="number" min="1" value={couponForm.maxUses} onChange={(e) => setCouponForm((p) => ({ ...p, maxUses: e.target.value }))} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Giltig från"><Input type="date" value={couponForm.startsAt} onChange={(e) => setCouponForm((p) => ({ ...p, startsAt: e.target.value }))} /></Field>
            <Field label="Giltig till"><Input type="date" value={couponForm.expiresAt} onChange={(e) => setCouponForm((p) => ({ ...p, expiresAt: e.target.value }))} /></Field>
          </div>
          <Field label="Restauranger (tom = alla)">
            <div className="max-h-36 overflow-y-auto rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-secondary)] p-2 flex flex-col gap-1">
              {(allRestaurants.data ?? []).map((r: ControlCenterRestaurantSnapshot) => {
                const checked = couponForm.applicableRestaurantIds.includes(r.id);
                return (
                  <label key={r.id} className="flex items-center gap-2 cursor-pointer px-2 py-1 rounded hover:bg-[var(--bg-hover)] text-sm select-none">
                    <input type="checkbox" checked={checked} onChange={() => setCouponForm((p) => ({ ...p, applicableRestaurantIds: checked ? p.applicableRestaurantIds.filter((id) => id !== r.id) : [...p.applicableRestaurantIds, r.id] }))} className="accent-emerald-500 h-3.5 w-3.5 shrink-0" />
                    <span className="text-[var(--text-primary)]">{r.name}</span>
                  </label>
                );
              })}
            </div>
          </Field>
          <Field label="Status">
            <Select value={couponForm.isActive ? "active" : "inactive"} onChange={(e) => setCouponForm((p) => ({ ...p, isActive: e.target.value === "active" }))}>
              <option value="active">Aktiv</option>
              <option value="inactive">Inaktiv</option>
            </Select>
          </Field>
        </div>
      </Modal>
    </div>
  );
}

// ---- Helpers ----

function bogoTriggerLabel(deal: AutomaticDealRecord): string {
  if ((deal.bogoTriggerProductIds ?? []).length > 0) return "Produkter";
  if ((deal as any).bogoMinOrderAmount != null && (deal as any).bogoMinOrderAmount > 0) return `Min ${(deal as any).bogoMinOrderAmount} kr`;
  return deal.triggerQuantity != null ? `Köp ${deal.triggerQuantity}` : "BOGO";
}

function DealGrid({ deals, emptyTitle, emptyDescription, renderCard }: {
  deals: AutomaticDealRecord[];
  emptyTitle: string;
  emptyDescription?: string;
  renderCard: (deal: AutomaticDealRecord) => React.ReactNode;
}) {
  if (deals.length === 0) return <EmptyState title={emptyTitle} description={emptyDescription} />;
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {deals.map(renderCard)}
    </div>
  );
}

function DealCard({ deal, typeLabel, valueLine, onClick }: {
  deal: AutomaticDealRecord;
  typeLabel: string;
  valueLine: string;
  onClick: () => void;
}) {
  const expired = deal.validUntil ? new Date(deal.validUntil) < new Date() : false;
  return (
    <button type="button" onClick={onClick} className="surface-muted px-5 py-5 text-left hover:brightness-110 transition-all">
      {deal.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={deal.imageUrl} alt="" className="mb-3 h-28 w-full rounded-xl object-cover" />
      )}
      <div className="flex items-start justify-between gap-2">
        <p className="text-base font-black tracking-[-0.02em] leading-snug">{deal.title}</p>
        <Badge tone={!deal.isActive || expired ? "danger" : "success"}>
          {expired ? "Utgången" : deal.isActive ? "Aktiv" : "Inaktiv"}
        </Badge>
      </div>
      <p className="mt-1.5 text-sm font-semibold text-[var(--text-primary)]">{valueLine}</p>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <Badge tone="info">{typeLabel}</Badge>
      </div>
      <p className="mt-2 text-xs text-[var(--text-muted)]">
        {deal.restaurant?.name || (deal.isGlobal ? "Alla restauranger" : "Ingen restaurang")}
        {deal.validUntil ? ` · t.o.m. ${formatDate(deal.validUntil)}` : ""}
      </p>
    </button>
  );
}
