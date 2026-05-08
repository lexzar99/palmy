"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Shield } from "lucide-react";
import { getRestaurantOverview, patchRestaurant, restaurantsQueryKey, type ControlCenterRestaurantSnapshot } from "@/modules/restaurants/api";
import { Badge, Button, EmptyState, ErrorPanel, Field, MetricCard, Modal, PageHeader, Select, Surface } from "@/shared/components/ui";
import { formatCurrency, formatNumber, restaurantTierLabel } from "@/shared/utils/format";

const tierMeta = {
  1: { label: "Gold", commissionPct: 8, subscriptionFee: 1990 },
  2: { label: "Silver", commissionPct: 10, subscriptionFee: 990 },
  3: { label: "Standard", commissionPct: 12, subscriptionFee: 490 },
  0: { label: "Hidden", commissionPct: 12, subscriptionFee: 0 },
} as const;

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
      onClose();
    },
  });

  const activeMeta = tierMeta[featuredClass as keyof typeof tierMeta] || tierMeta[3];

  return (
    <Modal open={open} onClose={onClose} title={restaurant ? `${restaurant.name} tier` : "Tier"} footer={<div className="flex justify-end gap-2"><Button onClick={onClose}>Close</Button><Button variant="primary" onClick={() => saveMutation.mutate()}>Save tier</Button></div>}>
      {restaurant ? (
        <div className="space-y-5">
          <div className="grid gap-4 md:grid-cols-3">
            <MetricCard label="Current month revenue" value={formatCurrency(restaurant.monthRevenue)} />
            <MetricCard label="Current payout estimate" value={formatCurrency(restaurant.payoutEstimate)} />
            <MetricCard label="Pending orders" value={formatNumber(restaurant.pendingOrders)} />
          </div>
          <Field label="Tier class">
            <Select value={String(featuredClass)} onChange={(event) => setFeaturedClass(Number(event.target.value))}>
              <option value="1">Gold</option>
              <option value="2">Silver</option>
              <option value="3">Standard</option>
              <option value="0">Hidden</option>
            </Select>
          </Field>
          <Surface className="px-5 py-5">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">Tier effect</p>
            <div className="mt-3 grid gap-2 text-sm text-[var(--text-secondary)]">
              <div>Label: {activeMeta.label}</div>
              <div>Commission: {activeMeta.commissionPct}%</div>
              <div>Subscription fee: {formatCurrency(activeMeta.subscriptionFee)}</div>
            </div>
          </Surface>
        </div>
      ) : null}
    </Modal>
  );
}

export function TiersPage() {
  const [activeRestaurant, setActiveRestaurant] = useState<ControlCenterRestaurantSnapshot | null>(null);
  const restaurants = useQuery({ queryKey: ["tiers", "restaurants"], queryFn: getRestaurantOverview });

  if (restaurants.isLoading) {
    return <Surface className="px-6 py-12 text-sm text-[var(--text-secondary)]">Loading tier system...</Surface>;
  }

  if (restaurants.isError || !restaurants.data) {
    return <ErrorPanel title="Tier system could not be loaded" description="Restaurant snapshots for tier management are unavailable." action={<Button onClick={() => void restaurants.refetch()}>Retry</Button>} />;
  }

  const counts = {
    gold: restaurants.data.filter((restaurant) => restaurant.featuredClass === 1).length,
    silver: restaurants.data.filter((restaurant) => restaurant.featuredClass === 2).length,
    standard: restaurants.data.filter((restaurant) => restaurant.featuredClass === 3).length,
    hidden: restaurants.data.filter((restaurant) => restaurant.featuredClass === 0).length,
  };

  return (
    <div className="page-stack">
      <PageHeader title="Tiers" />

      <Surface className="px-6 py-6">
        {restaurants.data.length === 0 ? (
          <EmptyState title="No restaurants available" />
        ) : (
          <div className="table-shell">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Restaurant</th>
                  <th>Tier</th>
                  <th>Month revenue</th>
                  <th>Payout estimate</th>
                  <th>Commission estimate</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {restaurants.data.map((restaurant) => (
                  <tr key={restaurant.id}>
                    <td>
                      <div>
                        <p className="font-black">{restaurant.name}</p>
                        <p className="mt-1 text-sm text-[var(--text-secondary)]">{restaurant.city || "No city"}</p>
                      </div>
                    </td>
                    <td><Badge tone={restaurant.featuredClass === 1 ? "warning" : restaurant.featuredClass === 2 ? "info" : restaurant.featuredClass === 0 ? "danger" : "neutral"}>{restaurantTierLabel(restaurant.featuredClass)}</Badge></td>
                    <td>{formatCurrency(restaurant.monthRevenue)}</td>
                    <td>{formatCurrency(restaurant.payoutEstimate)}</td>
                    <td>{formatCurrency(restaurant.commissionEstimate)}</td>
                    <td><div className="flex justify-end"><Button variant="secondary" onClick={() => setActiveRestaurant(restaurant)}><Shield size={16} /> Edit</Button></div></td>
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
