"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Shield } from "lucide-react";
import { getRestaurantOverview, patchRestaurant, type ControlCenterRestaurantSnapshot } from "@/modules/restaurants/api";
import { Badge, Button, EmptyState, ErrorPanel, Field, MetricCard, Modal, PageHeader, Select, Surface } from "@/shared/components/ui";
import { DeliveryModeBadge } from "@/shared/components/delivery-mode";
import { formatCurrency, formatNumber, restaurantTierLabel } from "@/shared/utils/format";

// Tier = abonnemang + placering i listan. INTE provision — provisionen styrs
// av leveransmodellen (selfDelivery 10/20%) och sätts på restaurangen/Ekonomi.
const TIER_META: Record<number, { blurb: string; tone: "warning" | "info" | "neutral" | "danger" }> = {
  1: { blurb: "Topp-placering i listan", tone: "warning" },
  2: { blurb: "Förhöjd placering", tone: "info" },
  3: { blurb: "Vanlig placering", tone: "neutral" },
  0: { blurb: "Visas inte publikt", tone: "danger" },
};
const tierTone = (fc: number) => TIER_META[fc]?.tone ?? "neutral";

function TierModal({ restaurant, open, onClose }: { restaurant: ControlCenterRestaurantSnapshot | null; open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [featuredClass, setFeaturedClass] = useState(restaurant?.featuredClass || 3);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!open || !restaurant) return;
    setFeaturedClass(restaurant.featuredClass || 3);
  }, [open, restaurant]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const saveMutation = useMutation({
    mutationFn: () => patchRestaurant(restaurant!.id, { featuredClass }),
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
      title={`${restaurant.name} — tier`}
      description="Tier styr abonnemang och placering. Provisionen styrs separat av leveransmodellen."
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
          <MetricCard label="Abonnemang (mån)" value={formatCurrency(restaurant.subscriptionEstimate)} />
          <MetricCard label="Väntande ordrar" value={formatNumber(restaurant.pendingOrders)} />
        </div>
        <Field label="Tier-klass">
          <Select value={String(featuredClass)} onChange={(event) => setFeaturedClass(Number(event.target.value))}>
            <option value="1">Gold</option>
            <option value="2">Silver</option>
            <option value="3">Standard</option>
            <option value="0">Dold</option>
          </Select>
        </Field>
        <Surface className="px-5 py-5">
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">Effekt</p>
          <div className="mt-3 grid gap-2 text-sm text-[var(--text-secondary)]">
            <div>Placering: {TIER_META[featuredClass]?.blurb ?? "Vanlig placering"}</div>
            <div className="flex items-center gap-2">Leveransmodell: <DeliveryModeBadge selfDelivery={restaurant.selfDelivery} /></div>
            <div className="text-xs">Provision ({restaurant.commissionPct}%) styrs av leveransmodellen — ändra den på restaurangsidan eller i Ekonomi.</div>
          </div>
        </Surface>
      </div>
    </Modal>
  );
}

export function TiersPage() {
  const [activeRestaurant, setActiveRestaurant] = useState<ControlCenterRestaurantSnapshot | null>(null);
  const restaurants = useQuery({ queryKey: ["tiers", "restaurants"], queryFn: getRestaurantOverview });

  if (restaurants.isLoading) {
    return <Surface className="px-6 py-12 text-sm text-[var(--text-secondary)]">Laddar tier-systemet…</Surface>;
  }

  if (restaurants.isError || !restaurants.data) {
    return <ErrorPanel title="Tier-systemet kunde inte laddas" description="Restaurang-data för tier-hantering är otillgänglig." action={<Button onClick={() => void restaurants.refetch()}>Försök igen</Button>} />;
  }

  return (
    <div className="page-stack">
      <PageHeader title="Tiers" />

      <Surface className="px-5 py-4 text-sm text-[var(--text-secondary)]">
        Tier = <strong>abonnemang + placering</strong> i kund-appen. Provisionen (10/20 %) är en separat axel som styrs av leveransmodellen.
      </Surface>

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
