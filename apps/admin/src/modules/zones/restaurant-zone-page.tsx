"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, MapPin, Save, Store } from "lucide-react";
import ZoneEditor from "@/modules/zones/components/zone-editor";
import { parseZones, serializeZones, type ZoneRecord } from "@/modules/zones/api";
import { getRestaurantDetail, patchRestaurant, restaurantDetailQueryKey } from "@/modules/restaurants/api";
import { Badge, Button, ErrorPanel, Field, Input, PageHeader, Surface } from "@/shared/components/ui";
import { useToast } from "@/shared/components/toast";

/**
 * Standalone full-skärm-sida för att rita zoner för EN restaurang.
 *
 * Ersätter den tidigare RestaurantOverrideModal — varje restaurang har egen
 * URL (/zones/restaurant/{id}) som låter editor breda ut sig över hela
 * viewporten utan modal-ramen runt om. Kartan får mycket mer plats att
 * andas, vilket är poängen med polygon-baserad zon-redigering.
 *
 * Sparar via PATCH /api/admin/restaurants/{id} med deliveryZones JSON-fältet.
 * Detta är den endpoint restaurang-formen redan använder — ingen ny backend
 * behöver byggas och datat hamnar på rätt plats (Restaurant.deliveryZones).
 */

interface Props {
  restaurantId: string;
}

export function RestaurantZonePage({ restaurantId }: Props) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [zones, setZones] = useState<ZoneRecord[]>([]);
  const [freeDeliveryAbove, setFreeDeliveryAbove] = useState(0);
  const [dirty, setDirty] = useState(false);

  const restaurantQuery = useQuery({
    queryKey: restaurantDetailQueryKey(restaurantId),
    queryFn: () => getRestaurantDetail(restaurantId),
  });

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!restaurantQuery.data) return;
    setZones(parseZones((restaurantQuery.data as any).deliveryZones));
    setFreeDeliveryAbove(Number((restaurantQuery.data as any).freeDeliveryAbove ?? 0));
    setDirty(false);
  }, [restaurantQuery.data]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // useCallback med tom deps → stabil referens. Zone-editor's huvud-useEffect
  // har onChange i sin deps-array; om referensen ändras vid varje render
  // → useEffect re-runs → kartan rebuildas och centern resettas. Med stabil
  // referens behåller kartan sin position vid varje liten fee/eta-ändring.
  const handleZonesChange = useCallback((next: ZoneRecord[]) => {
    setZones(next);
    setDirty(true);
  }, []);

  const handleFreeDeliveryChange = useCallback((value: number) => {
    setFreeDeliveryAbove(value);
    setDirty(true);
  }, []);

  const saveMutation = useMutation({ meta: { toast: false },
    mutationFn: async () => {
      return patchRestaurant(restaurantId, {
        deliveryZones: serializeZones(zones) as unknown as never,
        freeDeliveryAbove,
      } as any);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: restaurantDetailQueryKey(restaurantId) });
      await queryClient.invalidateQueries({ queryKey: ["zones"] });
      setDirty(false);
      showToast({ type: "success", message: "Zoner sparade" });
    },
    onError: (e: any) => {
      showToast({ type: "error", message: e?.response?.data?.error || "Kunde inte spara zoner" });
    },
  });

  if (restaurantQuery.isLoading) {
    return (
      <div className="page-stack">
        <PageHeader title="Leveranszoner" breadcrumb="Restauranger" onBack={() => router.push("/zones")} />
        <Surface className="flex min-h-[480px] items-center justify-center">
          <Loader2 className="animate-spin text-[var(--text-muted)]" size={32} />
        </Surface>
      </div>
    );
  }

  if (restaurantQuery.isError || !restaurantQuery.data) {
    return (
      <ErrorPanel
        title="Kunde inte hämta restaurang"
        description="Restaurangen finns inte eller du saknar behörighet."
        action={<Button onClick={() => router.push("/zones")}>Tillbaka till zoner</Button>}
      />
    );
  }

  const restaurant = restaurantQuery.data;
  const hasCoords = restaurant.latitude != null && restaurant.longitude != null;
  const zonesSummary = zones.length === 0
    ? "Inga zoner — använder default radie runt restaurangen"
    : `${zones.length} zon${zones.length !== 1 ? "er" : ""} ritade`;

  // Decreasing-opacity orange square chips, like the prototype (full, 0.55, 0.3, …).
  const chipColor = (index: number) => {
    const opacities = [1, 0.55, 0.3];
    return `rgba(240, 83, 28, ${opacities[index] ?? 0.3})`;
  };

  return (
    <div className="page-stack">
      <PageHeader
        title="Leveranszoner"
        breadcrumb={<span>Restauranger / {restaurant.name}</span>}
        onBack={() => router.push("/zones")}
        actions={
          <>
            {dirty && <Badge tone="warning">Osparade ändringar</Badge>}
            <Badge tone={restaurant.manualIsOpen ? "success" : "neutral"}>{restaurant.manualIsOpen ? "Öppen" : "Stängd"}</Badge>
            <div className="md:w-48">
              <Field label="Fri leverans över (kr)">
                <Input
                  type="number"
                  value={freeDeliveryAbove}
                  onChange={(e) => handleFreeDeliveryChange(Number(e.target.value))}
                  placeholder="0 = inaktivt"
                />
              </Field>
            </div>
            <Button
              variant="primary"
              onClick={() => saveMutation.mutate()}
              disabled={!dirty || saveMutation.isPending}
            >
              {saveMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              {saveMutation.isPending ? "Sparar..." : "Spara zoner"}
            </Button>
          </>
        }
      />

      {/* ── Saknar koordinater-varning ───────────────────────────────── */}
      {!hasCoords && (
        <Surface className="px-5 py-4 border-l-4 border-l-[var(--accent)]">
          <div className="flex items-start gap-3">
            <Store size={20} className="text-[var(--accent)] shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-bold mb-1">Restaurangen saknar koordinater</p>
              <p className="text-xs text-[var(--text-secondary)]">
                Gå till restaurangens inställningar och välj adress via Google Places-autocomplete så
                kartan kan centrera på rätt punkt. Zoner kan inte placeras meningsfullt utan en
                startposition.
              </p>
              <Button variant="secondary" onClick={() => router.push(`/restaurants/${restaurantId}`)} className="mt-3">
                Öppna restaurang-inställningar
              </Button>
            </div>
          </div>
        </Surface>
      )}

      {/* ── Two-pane: karta (vänster) + zon-sammanfattning (höger) ───── */}
      <Surface className="overflow-hidden p-0">
        <div className="flex flex-col xl:flex-row">
          {/* LEFT: existing Google Maps zone editor (drawing/editing intact). */}
          <div className="min-w-0 flex-1 border-b border-[var(--border-subtle)] p-4 xl:border-b-0 xl:border-r">
            <ZoneEditor
              zones={zones}
              onChange={handleZonesChange}
              cityName={restaurant.name}
              centerLat={restaurant.latitude}
              centerLng={restaurant.longitude}
              mapHeight={780}
            />
          </div>

          {/* RIGHT: ~380px summary column. */}
          <aside className="w-full shrink-0 bg-[var(--bg-page)] p-5 xl:w-[380px]">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-[14px] font-extrabold">Zoner</p>
              {restaurant.address && (
                <span className="flex items-center gap-1 text-[11px] font-semibold text-[var(--text-muted)]">
                  <MapPin size={11} className="shrink-0 opacity-70" />
                  {zonesSummary}
                </span>
              )}
            </div>

            {zones.length === 0 ? (
              <div className="surface px-4 py-8 text-center">
                <p className="text-sm font-bold">Inga zoner ännu</p>
                <p className="mt-1.5 text-xs text-[var(--text-secondary)]">
                  Rita en zon på kartan med Circle eller Polygon. Avgift och min. order sätts per zon.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-[11px]">
                {zones.map((zone, index) => (
                  <div
                    key={zone.id}
                    className="surface p-[14px]"
                    style={index === 0 ? { borderColor: "rgba(240, 83, 28, 0.3)" } : undefined}
                  >
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-2 text-[14px] font-extrabold">
                        <span
                          className="h-[11px] w-[11px] rounded-[3px]"
                          style={{ background: zone.color || chipColor(index) }}
                        />
                        Zon {index + 1} · {zone.name || "Namnlös"}
                      </span>
                      {zone.type === "circle" && zone.radiusKm ? (
                        <span className="text-[11.5px] font-bold text-[var(--text-muted)]">{zone.radiusKm} km</span>
                      ) : (
                        <span className="text-[11.5px] font-bold text-[var(--text-muted)]">Polygon</span>
                      )}
                    </div>
                    <div className="mt-[11px] flex gap-[18px]">
                      <span>
                        <span className="block text-[11px] font-semibold text-[var(--text-muted)]">Avgift</span>
                        <span className="text-[15px] font-extrabold">{zone.deliveryFee} kr</span>
                      </span>
                      <span>
                        <span className="block text-[11px] font-semibold text-[var(--text-muted)]">Min. order</span>
                        <span className="text-[15px] font-extrabold">{zone.minOrder} kr</span>
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </aside>
        </div>
      </Surface>
    </div>
  );
}
