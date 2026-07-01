"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, RefreshCw, ChevronRight, Play, Trash2 } from "lucide-react";
import {
  dealsQueryKey,
  dealRestaurantsQueryKey,
  getAutomaticDeals,
  getDealRestaurants,
  updateAutomaticDeal,
  type AutomaticDealRecord,
} from "@/modules/deals/api";
import {
  campaignStatusLabel,
  dealCampaignsQueryKey,
  deleteDealCampaign,
  getDealCampaigns,
  runDealCampaign,
  segmentLabel,
  type DealCampaignRecord,
} from "@/modules/deals/campaigns-api";
import { apiGet } from "@/shared/api/client";
import { useToast } from "@/shared/components/toast";
import { discountsQueryKey, getDiscounts, createDiscount, updateDiscount, deleteDiscount, type DiscountRecord } from "@/modules/coupons/api";
import { Badge, Button, EmptyState, ErrorPanel, Field, Input, Modal, PageHeader, Select, Surface, Toggle } from "@/shared/components/ui";
import { CityRestaurantPicker } from "@/shared/components/city-restaurant-picker";
import { cn } from "@/shared/utils/cn";
import { formatDate } from "@/shared/utils/format";
import { getRestaurantOverview, restaurantsQueryKey, type ControlCenterRestaurantSnapshot } from "@/modules/restaurants/api";

type Tab = "bogo" | "kampanjer" | "auto" | "kupongkoder" | "iappen";

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
  const { showToast } = useToast();

  const tabParam = searchParams.get("tab") as Tab | null;
  const [tab, setTab] = useState<Tab>(tabParam || "kampanjer");
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
  const campaigns = useQuery({ queryKey: dealCampaignsQueryKey, queryFn: getDealCampaigns });

  const runCampaignMutation = useMutation({
    mutationFn: (id: string) => runDealCampaign(id),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: dealCampaignsQueryKey });
      showToast({ type: "success", message: `Tilldelade ${result.assigned}, hoppade över ${result.skipped}.` });
    },
    onError: () => showToast({ type: "error", message: "Kunde inte köra kampanj." }),
  });

  const deleteCampaignMutation = useMutation({
    mutationFn: (id: string) => deleteDealCampaign(id),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: dealCampaignsQueryKey }); },
    onError: () => showToast({ type: "error", message: "Kunde inte radera kampanj." }),
  });

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

  // Aktivera/inaktivera automatisk deal (BOGO + kampanj) direkt från listan.
  const toggleDealMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => updateAutomaticDeal(id, { isActive }),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: dealsQueryKey }); },
  });

  // Aktivera/inaktivera kupongkod direkt från listan.
  const toggleCouponMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => updateDiscount(id, { isActive }),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: discountsQueryKey }); },
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
    return (
      <div className="page-stack">
        <PageHeader breadcrumb="Katalog" title="Deals" />
        <Surface className="px-6 py-14 text-center text-sm text-[var(--text-secondary)]">Laddar deals...</Surface>
      </div>
    );
  }
  if (automaticDeals.isError || !automaticDeals.data || !restaurants.data) {
    return <ErrorPanel title="Kunde inte ladda deals" action={<Button onClick={() => void automaticDeals.refetch()}><RefreshCw size={16} /> Försök igen</Button>} />;
  }

  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: "bogo", label: "BOGO", count: bogoDeals.filter((d) => d.isActive).length },
    { id: "kampanjer", label: "Kampanjer", count: kampanjDeals.filter((d) => d.isActive).length },
    { id: "auto", label: "Auto-kampanjer", count: (campaigns.data || []).filter((c) => c.status === "ACTIVE").length },
    { id: "kupongkoder", label: "Kupongkoder", count: (discounts.data || []).filter((d) => d.isActive).length },
    { id: "iappen", label: "I appen nu", count: 0 },
  ];

  const changeTab = (t: Tab) => {
    setTab(t);
    router.replace(`/deals?tab=${t}`, { scroll: false });
  };

  const restaurantName = (id: string) =>
    (allRestaurants.data || []).find((r: ControlCenterRestaurantSnapshot) => r.id === id)?.name ?? id;

  return (
    <div className="page-stack">
      <PageHeader
        breadcrumb="Katalog"
        title="Deals"
        actions={
          <>
            <Button variant="secondary" onClick={() => void automaticDeals.refetch()} aria-label="Uppdatera"><RefreshCw size={14} /></Button>
            {tab === "bogo" && <Button variant="primary" onClick={() => router.push("/deals/bogo/new")}><Plus size={15} /> Ny BOGO-deal</Button>}
            {tab === "kampanjer" && <Button variant="primary" onClick={() => router.push("/deals/kampanj/new")}><Plus size={15} /> Ny kampanj</Button>}
            {tab === "auto" && <Button variant="primary" onClick={() => router.push("/deals/auto/new")}><Plus size={15} /> Ny kampanj</Button>}
            {tab === "kupongkoder" && <Button variant="primary" onClick={() => { setEditingCoupon(null); setCouponForm(emptyCouponForm()); setCouponModalOpen(true); }}><Plus size={15} /> Ny kupongkod</Button>}
          </>
        }
      />

      {/* Tabs som filter-chips + stad/restaurang-väljare */}
      <div className="chip-row items-center">
        {tabs.map(({ id, label, count }) => (
          <button
            key={id}
            type="button"
            onClick={() => changeTab(id)}
            className={cn("chip", tab === id && "is-active")}
          >
            {label} {count > 0 ? count : ""}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-3">
          <CityRestaurantPicker
            value={filterRestaurantId || ""}
            onChange={(rid) => setFilterRestaurantId(rid || null)}
            emptyOption={{ value: "", label: "Alla restauranger i stad" }}
          />
          {filterRestaurantId && (
            <button type="button" onClick={() => setFilterRestaurantId(null)} className="text-xs font-semibold text-[var(--text-muted)] underline hover:text-[var(--text-secondary)]">
              Visa alla
            </button>
          )}
        </div>
      </div>

      {/* BOGO tab */}
      {tab === "bogo" && (
        <DealTable
          deals={bogoDeals}
          emptyTitle="Inga BOGO-deals"
          getTypeLabel={() => bogoTriggerLabel}
          getTypeTone={() => "info"}
          getPeriod={(deal) => dealPeriod(deal)}
          getRestaurants={(deal) => dealRestaurantsLabel(deal, restaurantName)}
          onOpen={(deal) => router.push(`/deals/bogo/${deal.id}`)}
          onToggle={(deal, next) => toggleDealMutation.mutate({ id: deal.id, isActive: next })}
          togglePending={toggleDealMutation.isPending}
        />
      )}

      {/* Kampanjer tab */}
      {tab === "kampanjer" && (
        <DealTable
          deals={kampanjDeals}
          emptyTitle="Inga kampanjer"
          getTypeLabel={() => kampanjTypeLabel}
          getTypeTone={kampanjTypeTone}
          getPeriod={(deal) => dealPeriod(deal)}
          getRestaurants={(deal) => dealRestaurantsLabel(deal, restaurantName)}
          onOpen={(deal) => router.push(`/deals/kampanj/${deal.id}`)}
          onToggle={(deal, next) => toggleDealMutation.mutate({ id: deal.id, isActive: next })}
          togglePending={toggleDealMutation.isPending}
        />
      )}

      {/* Auto-kampanjer tab */}
      {tab === "auto" && (
        <CampaignTable
          campaigns={campaigns.data || []}
          loading={campaigns.isLoading}
          onOpen={(c) => router.push(`/deals/auto/${c.id}`)}
          onRun={(c) => runCampaignMutation.mutate(c.id)}
          runPending={runCampaignMutation.isPending}
          onDelete={(c) => { if (!confirm(`Radera ${c.title}?`)) return; deleteCampaignMutation.mutate(c.id); }}
          deletePending={deleteCampaignMutation.isPending}
        />
      )}

      {/* I appen nu: exakt det kund-feeden returnerar, per placering */}
      {tab === "iappen" && <AppFeedPreview />}

      {/* Kupongkoder tab */}
      {tab === "kupongkoder" && (
        <Surface className="overflow-hidden p-0">
          {discounts.isLoading ? (
            <div className="px-6 py-14 text-center text-sm text-[var(--text-secondary)]">Laddar...</div>
          ) : (discounts.data || []).length === 0 ? (
            <div className="p-6"><EmptyState title="Inga kupongkoder" /></div>
          ) : (
            <div role="table">
              <div
                role="row"
                className="grid items-center gap-3 border-b border-[var(--border-subtle)] px-[18px] py-[11px] text-[10.5px] font-extrabold uppercase tracking-[0.06em] text-[var(--text-muted)]"
                style={{ gridTemplateColumns: "1.6fr 0.9fr 1fr 1fr 90px 56px" }}
              >
                <span>Kod</span>
                <span>Typ</span>
                <span>Restauranger</span>
                <span>Period</span>
                <span>Status</span>
                <span />
              </div>
              {(discounts.data || []).map((record, i, arr) => {
                const typeLabel = record.discountType === "free_delivery" ? "Leverans" : record.discountType === "percentage" ? "Procent" : "Belopp";
                const typeTone = record.discountType === "free_delivery" ? "accent" : record.discountType === "percentage" ? "info" : "success";
                const valueLine = record.discountType === "free_delivery" ? "Fri leverans" : record.discountType === "percentage" ? `-${record.discountValue}%` : `-${record.discountValue} kr`;
                const restLabel = record.applicableRestaurantIds?.length > 0
                  ? record.applicableRestaurantIds.length === 1
                    ? restaurantName(record.applicableRestaurantIds[0])
                    : `${record.applicableRestaurantIds.length} ställen`
                  : record.restaurantId
                    ? restaurantName(record.restaurantId)
                    : "Alla";
                return (
                  <div
                    key={record.id}
                    role="row"
                    className={cn("grid items-center gap-3 px-[18px] py-[13px] text-[13px] transition-colors hover:bg-[var(--bg-hover)]", i !== arr.length - 1 && "border-b border-[var(--row-divider)]")}
                    style={{ gridTemplateColumns: "1.6fr 0.9fr 1fr 1fr 90px 56px" }}
                  >
                    <span className="min-w-0">
                      <button type="button" onClick={() => openEditCoupon(record)} className="block truncate text-left font-mono font-bold tracking-widest hover:text-[var(--accent-ink)]">
                        {record.code}
                      </button>
                      <span className="block truncate text-[11.5px] text-[var(--text-muted)]">
                        {valueLine}{record.minOrderAmount > 0 ? ` · min ${record.minOrderAmount} kr` : ""}
                      </span>
                    </span>
                    <span><TypeBadge tone={typeTone}>{typeLabel}</TypeBadge></span>
                    <span className="truncate text-[var(--text-secondary)]">{restLabel}</span>
                    <span className="text-[var(--text-secondary)]">{record.expiresAt ? `t.o.m. ${formatDate(record.expiresAt)}` : "Pågående"}</span>
                    <span>
                      <Toggle checked={record.isActive} disabled={toggleCouponMutation.isPending} onChange={(next) => toggleCouponMutation.mutate({ id: record.id, isActive: next })} />
                    </span>
                    <span className="flex justify-end">
                      <button type="button" onClick={() => openEditCoupon(record)} aria-label={`Öppna ${record.code}`} className="text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]">
                        <ChevronRight size={18} />
                      </button>
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </Surface>
      )}

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

/** Tonad typ-badge. "accent" mappar till badge-accent (orange), övriga till Badge-toner. */
type TypeTone = "accent" | "info" | "success" | "warning" | "neutral";

function TypeBadge({ tone, children }: { tone: TypeTone; children: React.ReactNode }) {
  if (tone === "accent") return <span className="badge badge-accent">{children}</span>;
  return <Badge tone={tone}>{children}</Badge>;
}

function bogoTriggerLabel(deal: AutomaticDealRecord): string {
  if ((deal.bogoTriggerProductIds ?? []).length > 0) return "Produkter";
  if ((deal as any).bogoMinOrderAmount != null && (deal as any).bogoMinOrderAmount > 0) return `Min ${(deal as any).bogoMinOrderAmount} kr`;
  return deal.triggerQuantity != null ? `Köp ${deal.triggerQuantity}` : "BOGO";
}

function kampanjTypeLabel(deal: AutomaticDealRecord): string {
  if (isPopupDeal(deal)) return "Popup";
  switch (deal.scopeType) {
    case "RESTAURANT": return "Leverans";
    case "PRODUCT": return "Produkt";
    case "CATEGORY": return "Procent";
    case "COMBO": return "Combo";
    case "MIN_ORDER": return "Belopp";
    default: return deal.scopeType;
  }
}

function kampanjTypeTone(deal: AutomaticDealRecord): TypeTone {
  if (isPopupDeal(deal)) return "warning";
  switch (deal.scopeType) {
    case "RESTAURANT": return "accent";
    case "COMBO": return "info";
    case "MIN_ORDER": return "success";
    case "CATEGORY": return deal.discountType === "PERCENTAGE" ? "info" : "success";
    default: return "info";
  }
}

/** "2–4 aug" / "t.o.m. X" / "Pågående" beroende på vilka datum som finns. */
function dealPeriod(deal: AutomaticDealRecord): string {
  if (deal.validUntil && new Date(deal.validUntil) < new Date()) return "Avslutad";
  if (deal.validUntil) return `t.o.m. ${formatDate(deal.validUntil)}`;
  if (deal.validFrom) return `fr.o.m. ${formatDate(deal.validFrom)}`;
  return "Pågående";
}

function dealRestaurantsLabel(deal: AutomaticDealRecord, restaurantName: (id: string) => string): string {
  if (deal.restaurant?.name) return deal.restaurant.name;
  if (deal.applicableRestaurantIds && deal.applicableRestaurantIds.length > 1) return `${deal.applicableRestaurantIds.length} ställen`;
  if (deal.applicableRestaurantIds && deal.applicableRestaurantIds.length === 1) return restaurantName(deal.applicableRestaurantIds[0]);
  if (deal.restaurantId) return restaurantName(deal.restaurantId);
  if (deal.isGlobal) return "Alla";
  return "Alla";
}

function DealTable({
  deals,
  emptyTitle,
  getTypeLabel,
  getTypeTone,
  getPeriod,
  getRestaurants,
  onOpen,
  onToggle,
  togglePending,
}: {
  deals: AutomaticDealRecord[];
  emptyTitle: string;
  getTypeLabel: () => (deal: AutomaticDealRecord) => string;
  getTypeTone: (deal: AutomaticDealRecord) => TypeTone;
  getPeriod: (deal: AutomaticDealRecord) => string;
  getRestaurants: (deal: AutomaticDealRecord) => string;
  onOpen: (deal: AutomaticDealRecord) => void;
  onToggle: (deal: AutomaticDealRecord, next: boolean) => void;
  togglePending: boolean;
}) {
  const typeLabelFn = getTypeLabel();
  const cols = "1.6fr 0.9fr 1fr 1fr 90px 56px";
  return (
    <Surface className="overflow-hidden p-0">
      {deals.length === 0 ? (
        <div className="p-6"><EmptyState title={emptyTitle} /></div>
      ) : (
        <div role="table">
          <div
            role="row"
            className="grid items-center gap-3 border-b border-[var(--border-subtle)] px-[18px] py-[11px] text-[10.5px] font-extrabold uppercase tracking-[0.06em] text-[var(--text-muted)]"
            style={{ gridTemplateColumns: cols }}
          >
            <span>Kampanj</span>
            <span>Typ</span>
            <span>Restauranger</span>
            <span>Period</span>
            <span>Status</span>
            <span />
          </div>
          {deals.map((deal, i) => (
            <div
              key={deal.id}
              role="row"
              className={cn("grid items-center gap-3 px-[18px] py-[13px] text-[13px] transition-colors hover:bg-[var(--bg-hover)]", i !== deals.length - 1 && "border-b border-[var(--row-divider)]")}
              style={{ gridTemplateColumns: cols }}
            >
              <span className="min-w-0">
                <button type="button" onClick={() => onOpen(deal)} className="block truncate text-left font-bold tracking-[-0.01em] hover:text-[var(--accent-ink)]">
                  {deal.title}
                </button>
              </span>
              <span><TypeBadge tone={getTypeTone(deal)}>{typeLabelFn(deal)}</TypeBadge></span>
              <span className="truncate text-[var(--text-secondary)]">{getRestaurants(deal)}</span>
              <span className="text-[var(--text-secondary)]">{getPeriod(deal)}</span>
              <span>
                <Toggle checked={deal.isActive} disabled={togglePending} onChange={(next) => onToggle(deal, next)} />
              </span>
              <span className="flex justify-end">
                <button type="button" onClick={() => onOpen(deal)} aria-label={`Öppna ${deal.title}`} className="text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]">
                  <ChevronRight size={18} />
                </button>
              </span>
            </div>
          ))}
        </div>
      )}
    </Surface>
  );
}

function CampaignTable({
  campaigns,
  loading,
  onOpen,
  onRun,
  runPending,
  onDelete,
  deletePending,
}: {
  campaigns: DealCampaignRecord[];
  loading: boolean;
  onOpen: (c: DealCampaignRecord) => void;
  onRun: (c: DealCampaignRecord) => void;
  runPending: boolean;
  onDelete: (c: DealCampaignRecord) => void;
  deletePending: boolean;
}) {
  const cols = "1.4fr 0.9fr 0.7fr 0.6fr 0.5fr 0.9fr 1fr 150px";
  const statusTone = (status: string): TypeTone =>
    status === "ACTIVE" ? "success" : status === "SCHEDULED" ? "info" : status === "PAUSED" ? "warning" : status === "DONE" ? "neutral" : "neutral";
  return (
    <Surface className="overflow-hidden p-0">
      {loading ? (
        <div className="px-6 py-14 text-center text-sm text-[var(--text-secondary)]">Laddar...</div>
      ) : campaigns.length === 0 ? (
        <div className="p-6"><EmptyState title="Inga auto-kampanjer" description="Skapa en kampanj som tilldelar deals till kunder efter segment." /></div>
      ) : (
        <div role="table">
          <div
            role="row"
            className="grid items-center gap-3 border-b border-[var(--border-subtle)] px-[18px] py-[11px] text-[10.5px] font-extrabold uppercase tracking-[0.06em] text-[var(--text-muted)]"
            style={{ gridTemplateColumns: cols }}
          >
            <span>Kampanj</span>
            <span>Segment</span>
            <span>Status</span>
            <span>Giltig</span>
            <span>Cap</span>
            <span>Utfall</span>
            <span>Senast körd</span>
            <span />
          </div>
          {campaigns.map((c, i, arr) => (
            <div
              key={c.id}
              role="row"
              className={cn("grid items-center gap-3 px-[18px] py-[13px] text-[13px] transition-colors hover:bg-[var(--bg-hover)]", i !== arr.length - 1 && "border-b border-[var(--row-divider)]")}
              style={{ gridTemplateColumns: cols }}
            >
              <span className="min-w-0">
                <button type="button" onClick={() => onOpen(c)} className="block truncate text-left font-bold tracking-[-0.01em] hover:text-[var(--accent-ink)]">
                  {c.title}
                </button>
                <span className="block truncate text-[11.5px] text-[var(--text-muted)]">{c.variants?.length ?? 0} mallar</span>
              </span>
              <span className="truncate text-[var(--text-secondary)]">{segmentLabel(c.segment)}</span>
              <span><TypeBadge tone={statusTone(c.status)}>{campaignStatusLabel(c.status)}</TypeBadge></span>
              <span className="text-[var(--text-secondary)]">{c.validDays} d</span>
              <span className="text-[var(--text-secondary)]">{c.capPerCustomer}</span>
              <span className="text-[var(--text-secondary)]">
                {c.stats ? `${c.stats.assigned} ut · ${c.stats.redeemed} in` : "–"}
              </span>
              <span className="text-[var(--text-secondary)]">{c.lastRunAt ? formatDate(c.lastRunAt) : "Aldrig"}</span>
              <span className="flex items-center justify-end gap-2">
                <Button variant="secondary" onClick={() => onRun(c)} disabled={runPending}><Play size={13} /> Kör nu</Button>
                <button type="button" onClick={() => onDelete(c)} disabled={deletePending} aria-label={`Radera ${c.title}`} className="text-[var(--text-muted)] transition-colors hover:text-[var(--danger-text)] disabled:opacity-40">
                  <Trash2 size={16} />
                </button>
              </span>
            </div>
          ))}
        </div>
      )}
    </Surface>
  );
}


// ── I appen nu ───────────────────────────────────────────────────────────────
// Läser samma publika feed som Swift-appen (GET /api/deals/app) så admin ser
// exakt vad kunderna ser, per placering. Inget eget urval eller filter här.

interface AppFeedDeal {
  id: string;
  title: string;
  subtitle?: string | null;
  badge?: string | null;
  audience: string;
  claimRequired: boolean;
  missionType?: string | null;
  freeDelivery: boolean;
  discountPercent?: number | null;
  amountKr?: number | null;
  dpointsBonus?: number | null;
  minOrderKr: number;
  restaurant?: { name: string } | null;
}

const APP_FEED_PLACEMENTS: { key: string; label: string; hint: string }[] = [
  { key: "HOME_TOP", label: "Hemskärmen", hint: "Deal-rälsen under sponsorkorten" },
  { key: "REWARDS", label: "Rewards", hint: "Uppdrag och extra-erbjudanden under Tjäna" },
  { key: "CART", label: "Kassan", hint: "Visas i varukorgen" },
];

function appFeedValue(deal: AppFeedDeal): string {
  if (deal.freeDelivery) return "Fri leverans";
  if (deal.discountPercent) return `-${deal.discountPercent}%`;
  if (deal.amountKr) return `-${deal.amountKr} kr`;
  if (deal.dpointsBonus) return `+${deal.dpointsBonus} p`;
  return deal.badge || "";
}

function AppFeedPreview() {
  const feeds = useQuery({
    queryKey: ["deals", "app-feed-preview"],
    queryFn: async () => {
      const results = await Promise.all(
        APP_FEED_PLACEMENTS.map((p) =>
          apiGet<{ deals: AppFeedDeal[] }>(`/deals/app?placement=${p.key}&limit=20&loggedIn=1`)
            .then((r) => [p.key, r.deals] as const)
            .catch(() => [p.key, [] as AppFeedDeal[]] as const),
        ),
      );
      return Object.fromEntries(results) as Record<string, AppFeedDeal[]>;
    },
    refetchOnWindowFocus: false,
  });

  if (feeds.isLoading) {
    return <Surface className="px-6 py-14 text-center text-sm text-[var(--text-secondary)]">Läser app-feeden...</Surface>;
  }

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {APP_FEED_PLACEMENTS.map((placement) => {
        const deals = feeds.data?.[placement.key] ?? [];
        return (
          <Surface key={placement.key} className="p-0 overflow-hidden">
            <div className="border-b border-[var(--border-subtle)] px-4 py-3">
              <div className="text-[13px] font-extrabold">{placement.label}</div>
              <div className="text-[11.5px] text-[var(--text-muted)]">{placement.hint}</div>
            </div>
            {deals.length === 0 ? (
              <div className="px-4 py-8 text-center text-[12.5px] text-[var(--text-muted)]">Tomt. Inget visas här i appen.</div>
            ) : (
              deals.map((deal, i) => (
                <div key={deal.id} className={cn("px-4 py-3", i !== deals.length - 1 && "border-b border-[var(--row-divider)]")}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-[13px] font-bold">{deal.title}</span>
                    <span className="shrink-0 text-[12px] font-extrabold">{appFeedValue(deal)}</span>
                  </div>
                  <div className="mt-0.5 flex flex-wrap gap-x-3 text-[11.5px] text-[var(--text-muted)]">
                    <span>{deal.restaurant?.name || "Alla restauranger"}</span>
                    {deal.minOrderKr > 0 && <span>min {deal.minOrderKr} kr</span>}
                    {deal.missionType && <span>uppdrag</span>}
                    {deal.claimRequired && !deal.missionType && <span>hämtas av kund</span>}
                    <span>{deal.audience === "ALL" ? "alla" : deal.audience.toLowerCase().replace(/_/g, " ")}</span>
                  </div>
                </div>
              ))
            )}
          </Surface>
        );
      })}
    </div>
  );
}
