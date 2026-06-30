"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Gift, Percent, Plus, RefreshCw, ChevronRight, Sparkles, Truck, Coins, Flame } from "lucide-react";
import {
  createAutomaticDeal,
  dealsQueryKey,
  dealRestaurantsQueryKey,
  getAutomaticDeals,
  getDealRestaurants,
  updateAutomaticDeal,
  type AutomaticDealRecord,
} from "@/modules/deals/api";
import { discountsQueryKey, getDiscounts, createDiscount, updateDiscount, deleteDiscount, type DiscountRecord } from "@/modules/coupons/api";
import { Badge, Button, EmptyState, ErrorPanel, Field, Input, Modal, PageHeader, Select, Surface, Toggle } from "@/shared/components/ui";
import { CityRestaurantPicker } from "@/shared/components/city-restaurant-picker";
import { cn } from "@/shared/utils/cn";
import { formatDate } from "@/shared/utils/format";
import { getRestaurantOverview, restaurantsQueryKey, type ControlCenterRestaurantSnapshot } from "@/modules/restaurants/api";

type Tab = "app" | "bogo" | "kampanjer" | "kupongkoder";

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
const isAppDeal = (deal: AutomaticDealRecord) => deal.appEnabled === true;

export function DealsPage() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const searchParams = useSearchParams();

  const tabParam = searchParams.get("tab") as Tab | null;
  const [tab, setTab] = useState<Tab>(tabParam || "app");
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

  // Aktivera/inaktivera automatisk deal (BOGO + kampanj) direkt från listan.
  const toggleDealMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => updateAutomaticDeal(id, { isActive }),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: dealsQueryKey }); },
  });

  const quickCreateAppDealMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) => createAutomaticDeal(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: dealsQueryKey });
      changeTab("app");
    },
  });

  const patchAppDealMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) => updateAutomaticDeal(id, payload),
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

  const appDeals = useMemo(() => {
    const all = (automaticDeals.data || []).filter(isAppDeal);
    if (!filterRestaurantId) return all;
    return all.filter((d) => d.isGlobal || d.restaurantId === filterRestaurantId || d.applicableRestaurantIds?.includes(filterRestaurantId));
  }, [automaticDeals.data, filterRestaurantId]);

  const kampanjDeals = useMemo(() => {
    const all = (automaticDeals.data || []).filter((d) => !isBogoDeal(d) && !isAppDeal(d));
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
    { id: "app", label: "App-deals", count: appDeals.filter((d) => d.isActive).length },
    { id: "bogo", label: "BOGO", count: bogoDeals.filter((d) => d.isActive).length },
    { id: "kampanjer", label: "Kampanjer", count: kampanjDeals.filter((d) => d.isActive).length },
    { id: "kupongkoder", label: "Kupongkoder", count: (discounts.data || []).filter((d) => d.isActive).length },
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
            {tab === "app" && <Button variant="primary" onClick={() => quickCreateAppDealMutation.mutate(appDealPresetPayload("free-delivery"))} disabled={quickCreateAppDealMutation.isPending}><Plus size={15} /> Snabb fri leverans</Button>}
            {tab === "bogo" && <Button variant="primary" onClick={() => router.push("/deals/bogo/new")}><Plus size={15} /> Ny BOGO-deal</Button>}
            {tab === "kampanjer" && <Button variant="primary" onClick={() => router.push("/deals/kampanj/new")}><Plus size={15} /> Ny kampanj</Button>}
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

      {tab === "app" && (
        <AppDealsPanel
          deals={appDeals}
          creating={quickCreateAppDealMutation.isPending}
          onCreate={(preset) => quickCreateAppDealMutation.mutate(appDealPresetPayload(preset))}
          onOpen={(deal) => router.push(`/deals/kampanj/${deal.id}`)}
          onToggle={(deal, next) => toggleDealMutation.mutate({ id: deal.id, isActive: next })}
          togglePending={toggleDealMutation.isPending}
          onPatch={(deal, payload) => patchAppDealMutation.mutate({ id: deal.id, payload })}
          patchPending={patchAppDealMutation.isPending}
        />
      )}

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

type AppDealPreset = "free-delivery" | "percent" | "fixed" | "dpoints" | "mission";

function appDealPresetPayload(preset: AppDealPreset): Record<string, unknown> {
  const base = {
    appEnabled: true,
    appPlacement: "HOME_TOP",
    appRotating: true,
    appWeight: 10,
    appClaimRequired: true,
    appClaimExpiresMinutes: 240,
    appCooldownHours: 24,
    isActive: true,
    isGlobal: true,
    showOnSite: true,
    popupEnabled: false,
    scopeType: "MIN_ORDER",
    minOrder: 149,
    maxUsesPerCustomer: 1,
    validFrom: new Date().toISOString(),
  };
  switch (preset) {
    case "free-delivery":
      return {
        ...base,
        title: "Fri leverans idag",
        description: "Hämta dealen och få fri leverans på nästa order.",
        badgeText: "Fri leverans",
        appTemplate: "FREE_DELIVERY_HERO",
        appAudience: "ALL",
        appCtaLabel: "Hämta",
        appTheme: "sky",
        discountType: "NONE",
        discountValue: 0,
        freeDelivery: true,
      };
    case "percent":
      return {
        ...base,
        title: "20% på din nästa order",
        description: "Gäller när villkoren matchar i kassan.",
        badgeText: "20%",
        appTemplate: "PERCENT",
        appAudience: "NEW_CUSTOMER",
        appCtaLabel: "Spara",
        appTheme: "orange",
        discountType: "PERCENTAGE",
        discountValue: 20,
      };
    case "fixed":
      return {
        ...base,
        title: "50 kr rabatt",
        description: "Ett snabbt kort för kunder som behöver en liten knuff.",
        badgeText: "50 kr",
        appTemplate: "FIXED",
        appAudience: "RETURNING",
        appCtaLabel: "Hämta",
        appTheme: "rose",
        discountType: "FIXED",
        discountValue: 50,
        minOrder: 199,
      };
    case "dpoints":
      return {
        ...base,
        title: "Bonus på Dpoints",
        description: "Tjäna extra Dpoints när du slutför ordern.",
        badgeText: "+75 Dpoints",
        appTemplate: "DPOINTS",
        appAudience: "LOGGED_IN",
        appCtaLabel: "Aktivera",
        appTheme: "amber",
        discountType: "NONE",
        discountValue: 0,
        appDpointsBonus: 75,
      };
    case "mission":
      return {
        ...base,
        title: "Köp 3 gånger denna vecka",
        description: "Uppdrag för inloggade kunder. Backend håller koll på claims.",
        badgeText: "Uppdrag",
        appTemplate: "MISSION",
        appAudience: "LOGGED_IN",
        appMissionType: "THREE_ORDERS_WEEK",
        appCtaLabel: "Starta",
        appTheme: "green",
        discountType: "NONE",
        discountValue: 0,
        appDpointsBonus: 150,
        appClaimExpiresMinutes: 10080,
      };
  }
}

function AppDealsPanel({
  deals,
  creating,
  onCreate,
  onOpen,
  onToggle,
  togglePending,
  onPatch,
  patchPending,
}: {
  deals: AutomaticDealRecord[];
  creating: boolean;
  onCreate: (preset: AppDealPreset) => void;
  onOpen: (deal: AutomaticDealRecord) => void;
  onToggle: (deal: AutomaticDealRecord, next: boolean) => void;
  togglePending: boolean;
  onPatch: (deal: AutomaticDealRecord, payload: Record<string, unknown>) => void;
  patchPending: boolean;
}) {
  const presets: Array<{ id: AppDealPreset; title: string; subtitle: string; icon: React.ReactNode; tone: string }> = [
    { id: "free-delivery", title: "Fri leverans", subtitle: "Hero eller litet kort, claimad i appen", icon: <Truck size={18} />, tone: "from-sky-500 to-cyan-300" },
    { id: "percent", title: "Procent", subtitle: "Ny kund, ny inloggad eller alla", icon: <Percent size={18} />, tone: "from-orange-500 to-amber-300" },
    { id: "fixed", title: "Kr rabatt", subtitle: "Winback eller returning-kunder", icon: <Gift size={18} />, tone: "from-rose-500 to-orange-300" },
    { id: "dpoints", title: "Dpoints", subtitle: "Bonus som betalas ut efter order", icon: <Coins size={18} />, tone: "from-yellow-500 to-orange-400" },
    { id: "mission", title: "Uppdrag", subtitle: "Köp 3 gånger, streaks och rewards", icon: <Sparkles size={18} />, tone: "from-emerald-500 to-lime-300" },
  ];
  const audienceOptions = [
    ["ALL", "Alla"],
    ["GUEST", "Gäst"],
    ["LOGGED_IN", "Inloggad"],
    ["NEW_CUSTOMER", "Ny kund"],
    ["NEW_LOGGED_IN", "Ny inloggad"],
    ["RETURNING", "Återkommande"],
  ];
  const placementOptions = [
    ["HOME_TOP", "Home"],
    ["HOME_INLINE", "Feed"],
    ["CART", "Cart"],
    ["REWARDS", "Rewards"],
    ["POST_ORDER", "Efter order"],
  ];

  return (
    <div className="grid gap-5">
      <Surface className="p-5">
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.12em] text-[var(--text-muted)]">App-deals</p>
            <h2 className="mt-1 text-xl font-black tracking-[-0.03em] text-[var(--text-primary)]">Roterande kort i Swift</h2>
            <p className="mt-1 max-w-2xl text-sm text-[var(--text-secondary)]">
              Skapa deals som kan visas på startsidan, claimas av kunden och auto-valideras i kassan via UserDeal.
            </p>
          </div>
          <Badge tone="info">{deals.length} kort</Badge>
        </div>
        <div className="grid gap-3 md:grid-cols-5">
          {presets.map((preset) => (
            <button
              key={preset.id}
              type="button"
              disabled={creating}
              onClick={() => onCreate(preset.id)}
              className="group overflow-hidden rounded-[18px] border border-[var(--border-subtle)] bg-[var(--surface-secondary)] p-0 text-left transition hover:-translate-y-0.5 hover:border-[var(--accent)] disabled:opacity-60"
            >
              <div className={cn("h-20 bg-gradient-to-br p-4 text-white", preset.tone)}>
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20 text-white shadow-sm backdrop-blur">
                  {preset.icon}
                </div>
              </div>
              <div className="p-4">
                <p className="font-black tracking-[-0.02em] text-[var(--text-primary)]">{preset.title}</p>
                <p className="mt-1 text-xs font-semibold leading-snug text-[var(--text-muted)]">{preset.subtitle}</p>
              </div>
            </button>
          ))}
        </div>
      </Surface>

      <Surface className="overflow-hidden p-0">
        {deals.length === 0 ? (
          <div className="p-6"><EmptyState title="Inga app-deals än" description="Skapa en snabbmall ovan så syns den i Swift via /api/deals/app." /></div>
        ) : (
          <div role="table">
            <div
              role="row"
              className="grid items-center gap-3 border-b border-[var(--border-subtle)] px-[18px] py-[11px] text-[10.5px] font-extrabold uppercase tracking-[0.06em] text-[var(--text-muted)]"
              style={{ gridTemplateColumns: "1.35fr 0.75fr 0.9fr 0.9fr 1fr 86px 76px 40px" }}
            >
              <span>Kort</span>
              <span>Typ</span>
              <span>Målgrupp</span>
              <span>Placering</span>
              <span>Villkor</span>
              <span>Rotation</span>
              <span>Status</span>
              <span />
            </div>
            {deals.map((deal, i) => (
              <div
                key={deal.id}
                role="row"
                className={cn("grid items-center gap-3 px-[18px] py-[14px] text-[13px] transition-colors hover:bg-[var(--bg-hover)]", i !== deals.length - 1 && "border-b border-[var(--row-divider)]")}
                style={{ gridTemplateColumns: "1.35fr 0.75fr 0.9fr 0.9fr 1fr 86px 76px 40px" }}
              >
                <span className="min-w-0">
                  <button type="button" onClick={() => onOpen(deal)} className="flex min-w-0 items-center gap-3 text-left">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[rgba(255,78,28,0.12)] text-[var(--accent-ink)]">
                      {deal.appTemplate === "DPOINTS" ? <Coins size={17} /> : deal.freeDelivery ? <Truck size={17} /> : <Flame size={17} />}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-black tracking-[-0.02em] text-[var(--text-primary)]">{deal.title}</span>
                      <span className="block truncate text-xs font-semibold text-[var(--text-muted)]">{deal.description || deal.badgeText || "Appkort"}</span>
                    </span>
                  </button>
                </span>
                <span><TypeBadge tone={deal.appTemplate === "DPOINTS" ? "warning" : deal.freeDelivery ? "info" : "accent"}>{appTemplateLabel(deal)}</TypeBadge></span>
                <span>
                  <Select
                    value={deal.appAudience || "ALL"}
                    disabled={patchPending}
                    onChange={(event) => onPatch(deal, { appAudience: event.target.value })}
                    className="h-9 text-xs font-bold"
                  >
                    {audienceOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </Select>
                </span>
                <span>
                  <Select
                    value={deal.appPlacement || "HOME_TOP"}
                    disabled={patchPending}
                    onChange={(event) => onPatch(deal, { appPlacement: event.target.value })}
                    className="h-9 text-xs font-bold"
                  >
                    {placementOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </Select>
                </span>
                <span className="truncate text-[var(--text-secondary)]">{appDealValueLabel(deal)}</span>
                <span><Toggle checked={deal.appRotating !== false} disabled={patchPending} onChange={(next) => onPatch(deal, { appRotating: next })} /></span>
                <span><Toggle checked={deal.isActive} disabled={togglePending} onChange={(next) => onToggle(deal, next)} /></span>
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
    </div>
  );
}

function appTemplateLabel(deal: AutomaticDealRecord): string {
  if (deal.freeDelivery) return "Fri leverans";
  if (deal.appTemplate === "DPOINTS") return "Dpoints";
  if (deal.appTemplate === "MISSION") return "Uppdrag";
  if (deal.discountType === "PERCENTAGE") return "Procent";
  if (deal.discountType === "FIXED") return "Kr";
  return "Kort";
}

function appDealValueLabel(deal: AutomaticDealRecord): string {
  const parts: string[] = [];
  if (deal.freeDelivery) parts.push("fri leverans");
  if (deal.discountType === "PERCENTAGE") parts.push(`${deal.discountValue}%`);
  if (deal.discountType === "FIXED") parts.push(`${deal.discountValue} kr`);
  if ((deal.appDpointsBonus ?? 0) > 0) parts.push(`+${deal.appDpointsBonus} Dpoints`);
  if ((deal.minOrder ?? 0) > 0) parts.push(`min ${deal.minOrder} kr`);
  return parts.join(" + ") || "Visningskort";
}

function audienceLabel(value?: string): string {
  switch (value) {
    case "GUEST": return "Gäst";
    case "LOGGED_IN": return "Inloggad";
    case "NEW_CUSTOMER": return "Ny kund";
    case "NEW_LOGGED_IN": return "Ny inloggad";
    case "RETURNING": return "Återkommande";
    default: return "Alla";
  }
}

function placementLabel(value?: string): string {
  switch (value) {
    case "HOME_INLINE": return "Feed";
    case "CART": return "Cart";
    case "REWARDS": return "Rewards";
    case "POST_ORDER": return "Efter order";
    default: return "Home";
  }
}

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
