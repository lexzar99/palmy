"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, RefreshCw, ChevronRight } from "lucide-react";
import {
  dealsQueryKey,
  dealRestaurantsQueryKey,
  getAutomaticDeals,
  getDealRestaurants,
  updateAutomaticDeal,
  type AutomaticDealRecord,
} from "@/modules/deals/api";
import { apiGet } from "@/shared/api/client";
import { Badge, Button, EmptyState, ErrorPanel, PageHeader, Surface, Toggle } from "@/shared/components/ui";
import { CityRestaurantPicker } from "@/shared/components/city-restaurant-picker";
import { cn } from "@/shared/utils/cn";
import { formatDate } from "@/shared/utils/format";
import { getRestaurantOverview, restaurantsQueryKey, type ControlCenterRestaurantSnapshot } from "@/modules/restaurants/api";

type Tab = "kampanjer" | "bogo" | "app";

// Gamla flik-länkar ska inte ge 404-känsla: mappa till närmaste nya flik.
const LEGACY_TABS: Record<string, Tab> = {
  auto: "kampanjer",
  kupongkoder: "kampanjer",
  appdeals: "app",
  iappen: "app",
};

const normalizeTab = (raw: string | null): Tab => {
  if (raw === "kampanjer" || raw === "bogo" || raw === "app") return raw;
  if (raw && LEGACY_TABS[raw]) return LEGACY_TABS[raw];
  return "kampanjer";
};

const isPopupDeal = (deal: AutomaticDealRecord) =>
  Boolean(deal.popupHeadline?.trim() || deal.popupBody?.trim() || deal.popupCode?.trim());

const isBogoDeal = (deal: AutomaticDealRecord) => deal.triggerType === "BOGO_CATEGORY";

export function DealsPage() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const searchParams = useSearchParams();

  const tabParam = searchParams.get("tab");
  const [tab, setTab] = useState<Tab>(normalizeTab(tabParam));
  const [filterRestaurantId, setFilterRestaurantId] = useState<string | null>(null);

  useEffect(() => {
    const next = normalizeTab(tabParam);
    if (next !== tab) setTab(next);
  }, [tabParam]);

  const automaticDeals = useQuery({ queryKey: dealsQueryKey, queryFn: getAutomaticDeals });
  const restaurants = useQuery({ queryKey: dealRestaurantsQueryKey, queryFn: getDealRestaurants });
  const allRestaurants = useQuery({ queryKey: restaurantsQueryKey, queryFn: getRestaurantOverview });

  // Aktivera/inaktivera deal direkt från listan.
  const toggleDealMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => updateAutomaticDeal(id, { isActive }),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: dealsQueryKey }); },
  });

  const bogoDeals = useMemo(() => {
    const all = (automaticDeals.data || []).filter(isBogoDeal);
    if (!filterRestaurantId) return all;
    return all.filter((d) => d.restaurantId === filterRestaurantId || d.isGlobal);
  }, [automaticDeals.data, filterRestaurantId]);

  const appDeals = useMemo(
    () => (automaticDeals.data || []).filter((d) => d.appEnabled),
    [automaticDeals.data],
  );

  const kampanjDeals = useMemo(() => {
    const all = (automaticDeals.data || []).filter((d) => !isBogoDeal(d));
    if (!filterRestaurantId) return all;
    return all.filter((d) => d.isGlobal || d.restaurantId === filterRestaurantId || d.applicableRestaurantIds?.includes(filterRestaurantId));
  }, [automaticDeals.data, filterRestaurantId]);

  if (automaticDeals.isLoading || restaurants.isLoading) {
    return (
      <div className="page-stack">
        <PageHeader breadcrumb="Tillväxt" title="Deals" />
        <Surface className="px-6 py-14 text-center text-sm text-[var(--text-secondary)]">Laddar deals...</Surface>
      </div>
    );
  }
  if (automaticDeals.isError || !automaticDeals.data || !restaurants.data) {
    return <ErrorPanel title="Kunde inte ladda deals" action={<Button onClick={() => void automaticDeals.refetch()}><RefreshCw size={16} /> Försök igen</Button>} />;
  }

  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: "kampanjer", label: "Kampanjer", count: kampanjDeals.filter((d) => d.isActive).length },
    { id: "bogo", label: "BOGO", count: bogoDeals.filter((d) => d.isActive).length },
    { id: "app", label: "I appen", count: appDeals.filter((d) => d.isActive).length },
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
        breadcrumb="Tillväxt"
        title="Deals"
        actions={
          <>
            <Button variant="secondary" onClick={() => void automaticDeals.refetch()} aria-label="Uppdatera"><RefreshCw size={14} /></Button>
            {tab === "bogo" && <Button variant="primary" onClick={() => router.push("/deals/bogo/new")}><Plus size={15} /> Ny BOGO-deal</Button>}
            {tab !== "bogo" && <Button variant="primary" onClick={() => router.push("/deals/kampanj/new")}><Plus size={15} /> Ny kampanj</Button>}
          </>
        }
      />

      {/* Flikar som filter-chips + stad/restaurang-väljare */}
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
        {tab !== "app" && (
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
        )}
      </div>

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

      {/* I appen: hantera app-deals + se exakt vad kunderna ser, på samma flik */}
      {tab === "app" && (
        <div className="grid gap-4">
          <AppDealsTable
            deals={appDeals}
            onOpen={(deal) => router.push(`/deals/kampanj/${deal.id}`)}
            onToggle={(deal, next) => toggleDealMutation.mutate({ id: deal.id, isActive: next })}
            togglePending={toggleDealMutation.isPending}
          />
          <div>
            <p className="mb-2 text-[13px] font-extrabold tracking-[-0.2px]">Så ser kunderna det just nu</p>
            <AppFeedPreview />
          </div>
        </div>
      )}
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

/** "12 hämtade · 5 inlösta" eller "–" när ingen aktivitet finns. */
function dealOutcomeLabel(deal: AutomaticDealRecord): string {
  const claims = deal.stats?.claims ?? 0;
  const redeemed = deal.stats?.redeemed ?? 0;
  const used = deal.usageCount ?? 0;
  if (claims === 0 && redeemed === 0 && used === 0) return "–";
  if (claims === 0) return `${used} använda`;
  return `${claims} hämtade · ${redeemed} inlösta`;
}

/** Var visas dealen: appen, webben eller båda. */
function dealVisibilityLabel(deal: AutomaticDealRecord): { label: string; tone: TypeTone } {
  if (deal.appEnabled && deal.showOnSite) return { label: "App + webb", tone: "info" };
  if (deal.appEnabled) return { label: "Endast appen", tone: "accent" };
  if (deal.showOnSite) return { label: "Webben", tone: "neutral" };
  return { label: "Dold", tone: "warning" };
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
  const cols = "1.6fr 0.8fr 0.9fr 0.9fr 0.9fr 0.9fr 90px 56px";
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
            <span>Visas i</span>
            <span>Restauranger</span>
            <span>Period</span>
            <span>Utfall</span>
            <span>Status</span>
            <span />
          </div>
          {deals.map((deal, i) => {
            const visibility = dealVisibilityLabel(deal);
            return (
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
                <span><TypeBadge tone={visibility.tone}>{visibility.label}</TypeBadge></span>
                <span className="truncate text-[var(--text-secondary)]">{getRestaurants(deal)}</span>
                <span className="text-[var(--text-secondary)]">{getPeriod(deal)}</span>
                <span className="text-[var(--text-secondary)]">{dealOutcomeLabel(deal)}</span>
                <span>
                  <Toggle checked={deal.isActive} disabled={togglePending} onChange={(next) => onToggle(deal, next)} />
                </span>
                <span className="flex justify-end">
                  <button type="button" onClick={() => onOpen(deal)} aria-label={`Öppna ${deal.title}`} className="text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]">
                    <ChevronRight size={18} />
                  </button>
                </span>
              </div>
            );
          })}
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


// ── App-deals: deals och uppdrag som lever i Swift-appen ────────────────────

const APP_PLACEMENT_LABELS: Record<string, string> = {
  HOME_TOP: "Hemskärmen",
  HOME_INLINE: "Hemskärmen (inline)",
  CART: "Kassan",
  REWARDS: "Rewards",
  POST_ORDER: "Efter order",
};

function appDealValueLabel(deal: AutomaticDealRecord): string {
  if (deal.appMissionType) return "Uppdrag";
  if (deal.freeDelivery) return "Fri leverans";
  if (deal.discountType === "PERCENTAGE") return `-${deal.discountValue}%`;
  if (deal.discountType === "FIXED") return `-${deal.discountValue} kr`;
  return "–";
}

function AppDealsTable({
  deals,
  onOpen,
  onToggle,
  togglePending,
}: {
  deals: AutomaticDealRecord[];
  onOpen: (deal: AutomaticDealRecord) => void;
  onToggle: (deal: AutomaticDealRecord, next: boolean) => void;
  togglePending: boolean;
}) {
  const cols = "1.6fr 0.9fr 1fr 0.9fr 0.7fr 90px";
  if (deals.length === 0) {
    return (
      <Surface className="p-6">
        <EmptyState title="Inga app-deals" description="Skapa en kampanj och välj 'Endast appen' eller 'App + webb' så hamnar den här." />
      </Surface>
    );
  }
  return (
    <Surface className="overflow-hidden p-0">
      <div role="table">
        <div
          role="row"
          className="grid items-center gap-3 border-b border-[var(--border-subtle)] px-[18px] py-[11px] text-[10.5px] font-extrabold uppercase tracking-[0.06em] text-[var(--text-muted)]"
          style={{ gridTemplateColumns: cols }}
        >
          <span>Titel</span>
          <span>Värde</span>
          <span>Placering</span>
          <span>Målgrupp</span>
          <span>Utfall</span>
          <span>Status</span>
        </div>
        {deals.map((deal, i, arr) => (
          <div
            key={deal.id}
            role="row"
            className={cn("grid items-center gap-3 px-[18px] py-[13px] text-[13px] transition-colors hover:bg-[var(--bg-hover)]", i !== arr.length - 1 && "border-b border-[var(--row-divider)]")}
            style={{ gridTemplateColumns: cols }}
          >
            <span className="min-w-0">
              <button type="button" onClick={() => onOpen(deal)} className="block truncate text-left font-bold tracking-[-0.01em] hover:text-[var(--accent-ink)]">
                {deal.title}
              </button>
              <span className="block truncate text-[11.5px] text-[var(--text-muted)]">
                {deal.appMissionType ? `Uppdrag · mål ${deal.triggerQuantity ?? 3}` : deal.appClaimRequired ? "Hämtas av kund" : "Visas direkt"}
              </span>
            </span>
            <span className="font-extrabold">{appDealValueLabel(deal)}</span>
            <span className="text-[var(--text-secondary)]">{APP_PLACEMENT_LABELS[deal.appPlacement ?? "HOME_TOP"] ?? deal.appPlacement}</span>
            <span className="text-[var(--text-secondary)]">{(deal.appAudience ?? "ALL") === "ALL" ? "Alla" : (deal.appAudience ?? "").toLowerCase().replace(/_/g, " ")}</span>
            <span className="text-[var(--text-secondary)]">{dealOutcomeLabel(deal)}</span>
            <span>
              <Toggle checked={deal.isActive} onChange={(next) => onToggle(deal, next)} disabled={togglePending} />
            </span>
          </div>
        ))}
      </div>
    </Surface>
  );
}
