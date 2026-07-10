"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Save, Store } from "lucide-react";
import ZoneEditor from "@/modules/zones/components/zone-editor";
import { parseZones, serializeZones, type ZoneRecord } from "@/modules/zones/api";
import { getRestaurantDetail, patchRestaurant, restaurantDetailQueryKey } from "@/modules/restaurants/api";
import { Badge, Button, ErrorPanel, Field, MoneyInput, PageHeader, Surface } from "@/shared/components/ui";
import { RestaurantAvailabilitySummary } from "@/shared/components/restaurant-availability";
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

const parseMoneyDraft = (value: string): number | null => {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) return null;
  const numeric = Number(normalized);
  return Number.isFinite(numeric) ? Math.max(0, numeric) : null;
};

export function RestaurantZonePage({ restaurantId }: Props) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [zones, setZones] = useState<ZoneRecord[]>([]);
  const [freeDeliveryDraft, setFreeDeliveryDraft] = useState("0");
  const [dirty, setDirty] = useState(false);

  const restaurantQuery = useQuery({
    queryKey: restaurantDetailQueryKey(restaurantId),
    queryFn: () => getRestaurantDetail(restaurantId),
  });

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!restaurantQuery.data) return;
    setZones(parseZones(restaurantQuery.data.deliveryZones));
    setFreeDeliveryDraft(String(
      restaurantQuery.data.freeDeliveryAboveOre != null
        ? restaurantQuery.data.freeDeliveryAboveOre / 100
        : Number(restaurantQuery.data.freeDeliveryAbove ?? 0),
    ));
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

  const handleFreeDeliveryChange = useCallback((value: string) => {
    setFreeDeliveryDraft(value);
    setDirty(true);
  }, []);

  const commitFreeDelivery = useCallback(() => {
    const next = parseMoneyDraft(freeDeliveryDraft) ?? 0;
    setFreeDeliveryDraft(String(next));
  }, [freeDeliveryDraft]);

  const saveMutation = useMutation({ meta: { toast: false },
    mutationFn: async () => {
      return patchRestaurant(restaurantId, {
        deliveryZones: serializeZones(zones),
        freeDeliveryAboveOre: Math.round((parseMoneyDraft(freeDeliveryDraft) ?? 0) * 100),
      });
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

  return (
    <div className="page-stack">
      <PageHeader
        title="Leveranszoner"
        breadcrumb={<span>Restauranger / {restaurant.name}</span>}
        onBack={() => router.push("/zones")}
        actions={
          <>
            {dirty && <Badge tone="warning">Osparade ändringar</Badge>}
            <RestaurantAvailabilitySummary isOpen={restaurant.isOpen} reason={restaurant.availabilityReason} compact />
            <div className="w-full sm:w-52">
              <Field label="Fri leverans över" hint="0 kr = inaktivt">
                <MoneyInput
                  value={freeDeliveryDraft}
                  onValueChange={handleFreeDeliveryChange}
                  onBlur={commitFreeDelivery}
                  min={0}
                  placeholder="0"
                />
              </Field>
            </div>
            <Button
              variant="primary"
              onClick={() => saveMutation.mutate()}
              disabled={!dirty || saveMutation.isPending}
              loading={saveMutation.isPending}
            >
              {!saveMutation.isPending ? <Save size={14} /> : null}
              Spara zoner
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

      {/* Karta + zon-panel (ZoneEditor sköter ritning av cirkel/polygon och
          redigering per zon — designens layout ligger i komponenten). */}
      <ZoneEditor
        zones={zones}
        onChange={handleZonesChange}
        cityName={restaurant.name}
        centerLat={restaurant.latitude}
        centerLng={restaurant.longitude}
        mapHeight={720}
      />
    </div>
  );
}
