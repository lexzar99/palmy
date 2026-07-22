"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Shield } from "lucide-react";
import { economyQueryKey, getEconomy } from "@/modules/finance/api";
import { getRestaurantOverview, patchRestaurant, type ControlCenterRestaurantSnapshot } from "@/modules/restaurants/api";
import { Badge, Button, EmptyState, ErrorPanel, Field, Input, MetricCard, Modal, PageHeader, Select, Surface } from "@/shared/components/ui";
import { DeliveryModeBadge } from "@/shared/components/delivery-mode";
import { formatCurrencyExact as formatCurrency, formatNumber, restaurantTierLabel } from "@/shared/utils/format";

// Tier = abonnemang + placering i listan. INTE provision — provisionen styrs
// av leveransmodellen (selfDelivery 10/20%) och sätts på restaurangen/Ekonomi.
const TIER_META: Record<number, { blurb: string; tone: "warning" | "info" | "neutral" | "danger" }> = {
  1: { blurb: "Topp-placering i listan", tone: "warning" },
  2: { blurb: "Förhöjd placering", tone: "info" },
  3: { blurb: "Vanlig placering", tone: "neutral" },
  0: { blurb: "Visas inte publikt", tone: "danger" },
};
const tierTone = (fc: number) => TIER_META[fc]?.tone ?? "neutral";

// Presentations-katalog för tier-korten. featuredClass kopplar varje kort till
// restaurangernas faktiska tier-klass; chip = liten färgad ruta per nivå.
const TIER_CARDS = [
  {
    featuredClass: 3,
    name: "Brons",
    chip: "#c9a36b",
    placement: "Vanlig placering",
    benefits: ["Standardplacering", "Standardsupport"],
    highlight: false,
  },
  {
    featuredClass: 2,
    name: "Silver",
    chip: "#b6bdc6",
    placement: "Förhöjd placering",
    benefits: ["Förhöjd placering", "Prioriterad support"],
    highlight: false,
  },
  {
    featuredClass: 1,
    name: "Guld",
    chip: "var(--accent)",
    placement: "Topp-placering",
    benefits: ["Topp-placering + boost", "Dedikerad kontakt"],
    highlight: true,
  },
] as const;

function TierModal({ restaurant, open, onClose }: { restaurant: ControlCenterRestaurantSnapshot | null; open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [featuredClass, setFeaturedClass] = useState(restaurant?.featuredClass || 3);
  const [goldPrice, setGoldPrice] = useState("");
  const [silverPrice, setSilverPrice] = useState("");
  const [standardPrice, setStandardPrice] = useState("");
  const economy = useQuery({ queryKey: economyQueryKey, queryFn: getEconomy, enabled: open });

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!open || !restaurant) return;
    setFeaturedClass(restaurant.featuredClass || 3);
    setGoldPrice(restaurant.tierGoldFeeOverride == null ? "" : String(restaurant.tierGoldFeeOverride));
    setSilverPrice(restaurant.tierSilverFeeOverride == null ? "" : String(restaurant.tierSilverFeeOverride));
    setStandardPrice(restaurant.tierStandardFeeOverride == null ? "" : String(restaurant.tierStandardFeeOverride));
  }, [open, restaurant]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const toNullableNumber = (value: string) => {
    const trimmed = value.trim();
    const parsed = Number(trimmed);
    return trimmed === "" || !Number.isFinite(parsed) ? null : Math.max(0, parsed);
  };

  const previewSubscription =
    featuredClass === 1
      ? toNullableNumber(goldPrice) ?? economy.data?.tierGoldFee ?? restaurant?.subscriptionEstimate ?? 0
      : featuredClass === 2
        ? toNullableNumber(silverPrice) ?? economy.data?.tierSilverFee ?? restaurant?.subscriptionEstimate ?? 0
        : toNullableNumber(standardPrice) ?? economy.data?.tierStandardFee ?? restaurant?.subscriptionEstimate ?? 0;

  const saveMutation = useMutation({
    mutationFn: () => patchRestaurant(restaurant!.id, {
      featuredClass,
      tierGoldFeeOverride: toNullableNumber(goldPrice),
      tierSilverFeeOverride: toNullableNumber(silverPrice),
      tierStandardFeeOverride: toNullableNumber(standardPrice),
    }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      await queryClient.invalidateQueries({ queryKey: ["restaurants"] });
      await queryClient.invalidateQueries({ queryKey: ["tiers"] });
      await queryClient.invalidateQueries({ queryKey: ["finance"] });
      onClose();
    },
  });

  if (!restaurant) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`${restaurant.name}, tier`}
      footer={
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Avbryt</Button>
          <Button variant="primary" onClick={() => saveMutation.mutate()}>
            {saveMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : "Spara tier"}
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        <div className="grid gap-4 md:grid-cols-3">
          <MetricCard label="Månadsförsäljning" value={formatCurrency(restaurant.monthRevenue)} />
          <MetricCard label="Abonnemang (mån)" value={formatCurrency(previewSubscription)} />
          <MetricCard label="Väntande ordrar" value={formatNumber(restaurant.pendingOrders)} />
        </div>
        <Field label="Tier-klass">
          <Select value={String(featuredClass)} onChange={(event) => setFeaturedClass(Number(event.target.value))}>
            <option value="1">Guld</option>
            <option value="2">Silver</option>
            <option value="3">Brons</option>
            <option value="0">Dold</option>
          </Select>
        </Field>
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Guldpris">
            <Input
              type="number"
              min={0}
              value={goldPrice}
              placeholder={economy.data ? `Globalt ${formatCurrency(economy.data.tierGoldFee)}` : "Globalt"}
              onChange={(event) => setGoldPrice(event.target.value)}
            />
          </Field>
          <Field label="Silverpris">
            <Input
              type="number"
              min={0}
              value={silverPrice}
              placeholder={economy.data ? `Globalt ${formatCurrency(economy.data.tierSilverFee)}` : "Globalt"}
              onChange={(event) => setSilverPrice(event.target.value)}
            />
          </Field>
          <Field label="Standardpris">
            <Input
              type="number"
              min={0}
              value={standardPrice}
              placeholder={economy.data ? `Globalt ${formatCurrency(economy.data.tierStandardFee)}` : "Globalt"}
              onChange={(event) => setStandardPrice(event.target.value)}
            />
          </Field>
        </div>
        <Surface className="px-5 py-5">
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">Effekt</p>
          <div className="mt-3 grid gap-2 text-sm text-[var(--text-secondary)]">
            <div>Placering: {TIER_META[featuredClass]?.blurb ?? "Vanlig placering"}</div>
            <div className="flex items-center gap-2">Leveransmodell: <DeliveryModeBadge selfDelivery={restaurant.selfDelivery} /></div>
            <div className="text-xs">Provision ({restaurant.commissionPct}%) styrs av leveransmodellen, ändra den på restaurangsidan eller i Ekonomi.</div>
          </div>
        </Surface>
      </div>
    </Modal>
  );
}

export function TiersPage({ embedded = false }: { embedded?: boolean } = {}) {
  const [activeRestaurant, setActiveRestaurant] = useState<ControlCenterRestaurantSnapshot | null>(null);
  const restaurants = useQuery({ queryKey: ["tiers", "restaurants"], queryFn: getRestaurantOverview });

  const tierCounts = useMemo(() => {
    const counts: Record<number, number> = {};
    for (const restaurant of restaurants.data ?? []) {
      counts[restaurant.featuredClass] = (counts[restaurant.featuredClass] ?? 0) + 1;
    }
    return counts;
  }, [restaurants.data]);

  if (restaurants.isLoading) {
    return (
      <div className="page-stack">
        {!embedded && <PageHeader breadcrumb="System" title="Tiers" />}
        <Surface className="px-6 py-12 text-sm text-[var(--text-secondary)]">Laddar tier-systemet…</Surface>
      </div>
    );
  }

  if (restaurants.isError || !restaurants.data) {
    return <ErrorPanel title="Tier-systemet kunde inte laddas" description="Restaurang-data för tier-hantering är otillgänglig." action={<Button onClick={() => void restaurants.refetch()}>Försök igen</Button>} />;
  }

  return (
    <div className="page-stack">
      {!embedded && <PageHeader breadcrumb="System" title="Tiers" />}

      <div className="grid gap-3.5 md:grid-cols-3">
        {TIER_CARDS.map((tier) => {
          const count = tierCounts[tier.featuredClass] ?? 0;
          return (
            <article
              key={tier.name}
              className="rounded-2xl border bg-[var(--bg-panel)] px-5 py-5"
              style={
                tier.highlight
                  ? { borderWidth: 2, borderColor: "var(--accent)", background: "#fff7f3" }
                  : { borderColor: "var(--border-subtle)" }
              }
            >
              <div className="flex items-center gap-2.5">
                <span className="h-[13px] w-[13px] rounded-[4px]" style={{ background: tier.chip }} />
                <span
                  className="text-[16px] font-extrabold tracking-[-0.3px]"
                  style={tier.highlight ? { color: "var(--accent-ink)" } : undefined}
                >
                  {tier.name}
                </span>
              </div>

              <p className="mt-3 text-[12px] font-medium text-[var(--text-muted)]">Placering</p>
              <p className="text-[15px] font-bold text-[var(--text-primary)]">{tier.placement}</p>

              <p className="mt-3 text-[12px] font-medium text-[var(--text-muted)]">Restauranger</p>
              <p
                className="text-[24px] font-extrabold tracking-[-0.6px]"
                style={tier.highlight ? { color: "var(--accent-ink)" } : { color: "var(--text-primary)" }}
              >
                {formatNumber(count)}
              </p>

              <div
                className="mt-3.5 border-t pt-3.5 text-[12.5px] leading-relaxed text-[var(--text-secondary)]"
                style={{ borderColor: tier.highlight ? "color-mix(in srgb, var(--accent) 20%, transparent)" : "var(--row-divider)" }}
              >
                {tier.benefits.map((benefit) => (
                  <div key={benefit}>{benefit}</div>
                ))}
              </div>
            </article>
          );
        })}
      </div>

      <Surface className="px-6 py-6">
        {restaurants.data.length === 0 ? (
          <EmptyState title="Inga restauranger tillgängliga" />
        ) : (
          <div className="table-shell">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Restaurang</th>
                  <th>Tier</th>
                  <th>Abonnemang</th>
                  <th>Leveransmodell</th>
                  <th>Månadsförsäljning</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {restaurants.data.map((restaurant) => (
                  <tr key={restaurant.id}>
                    <td>
                      <div>
                        <p className="font-black">{restaurant.name}</p>
                        <p className="mt-1 text-sm text-[var(--text-secondary)]">{restaurant.city || "Ingen stad"}</p>
                      </div>
                    </td>
                    <td><Badge tone={tierTone(restaurant.featuredClass)}>{restaurantTierLabel(restaurant.featuredClass)}</Badge></td>
                    <td className="tabular-nums">{formatCurrency(restaurant.subscriptionEstimate)}</td>
                    <td><DeliveryModeBadge selfDelivery={restaurant.selfDelivery} /></td>
                    <td className="tabular-nums">{formatCurrency(restaurant.monthRevenue)}</td>
                    <td><div className="flex justify-end"><Button variant="secondary" onClick={() => setActiveRestaurant(restaurant)}><Shield size={16} /> Ändra</Button></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Surface>

      <TierModal restaurant={activeRestaurant} open={Boolean(activeRestaurant)} onClose={() => setActiveRestaurant(null)} />
    </div>
  );
}
