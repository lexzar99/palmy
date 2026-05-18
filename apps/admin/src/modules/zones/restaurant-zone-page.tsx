"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2, MapPin, Save, Store } from "lucide-react";
import ZoneEditor from "@/modules/zones/components/zone-editor";
import { parseZones, serializeZones, type ZoneRecord } from "@/modules/zones/api";
import { getRestaurantDetail, patchRestaurant, restaurantDetailQueryKey } from "@/modules/restaurants/api";
import { Badge, Button, ErrorPanel, Field, Input, Surface } from "@/shared/components/ui";
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

  const saveMutation = useMutation({
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
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="animate-spin text-[var(--text-muted)]" size={32} />
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

  return (
    <div className="page-stack">
      {/* ── Header: back + namn + status + save ──────────────────────── */}
      <Surface className="px-5 py-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => router.push("/zones")}
              className="shrink-0 w-10 h-10 rounded-xl border border-[var(--border-subtle)] flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-strong)] transition-all"
              aria-label="Tillbaka till zoner"
            >
              <ArrowLeft size={16} />
            </button>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-muted)]">Zoner</p>
                {dirty && <Badge tone="warning">Osparade ändringar</Badge>}
              </div>
              <h1 className="text-2xl font-black tracking-[-0.02em] truncate">{restaurant.name}</h1>
              {restaurant.address && (
                <p className="mt-1 text-xs text-[var(--text-secondary)] flex items-center gap-1.5 truncate">
                  <MapPin size={11} className="opacity-60 shrink-0" />
                  {restaurant.address}
                </p>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={restaurant.manualIsOpen ? "success" : "neutral"}>{restaurant.manualIsOpen ? "Öppen" : "Stängd"}</Badge>
            {!hasCoords && <Badge tone="warning">Saknar koordinater</Badge>}
            <Badge tone={zones.length > 0 ? "info" : "neutral"}>{zonesSummary}</Badge>
            <Button
              variant="primary"
              onClick={() => saveMutation.mutate()}
              disabled={!dirty || saveMutation.isPending}
            >
              {saveMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              {saveMutation.isPending ? "Sparar..." : "Spara zoner"}
            </Button>
          </div>
        </div>
      </Surface>

      {/* ── Saknar koordinater-varning ───────────────────────────────── */}
      {!hasCoords && (
        <Surface className="px-5 py-4 border-l-4 border-l-amber-500">
          <div className="flex items-start gap-3">
            <Store size={20} className="text-amber-500 shrink-0 mt-0.5" />
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

      {/* ── Free delivery threshold + kart-editor ────────────────────── */}
      <Surface className="px-5 py-5">
        <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end mb-4">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)] mb-1.5">Rita zoner på kartan</p>
            <p className="text-sm text-[var(--text-secondary)]">
              Klicka <strong>POLYGON</strong> eller <strong>CIRCLE</strong> för att rita. Varje zon kan ha
              egen leveransavgift, min-order och ETA. Sparas på restaurangen och används direkt vid
              checkout för adresser inom zonen.
            </p>
          </div>
          <div className="md:w-56">
            <Field label="Fri leverans över (kr)">
              <Input
                type="number"
                value={freeDeliveryAbove}
                onChange={(e) => handleFreeDeliveryChange(Number(e.target.value))}
                placeholder="0 = inaktivt"
              />
            </Field>
          </div>
        </div>

        <ZoneEditor
          zones={zones}
          onChange={handleZonesChange}
          cityName={restaurant.name}
          centerLat={restaurant.latitude}
          centerLng={restaurant.longitude}
          mapHeight={780}
        />
      </Surface>
    </div>
  );
}
