"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, ChevronDown, Loader2, MapPin, MapPinned, Plus, Save, Settings2, Store, Trash2 } from "lucide-react";
import ZoneEditor from "@/modules/zones/components/zone-editor";
import { CityHierarchyManager } from "@/modules/zones/city-hierarchy-manager";
import { createCity, deleteCity, getCities, getZoneRestaurants, parseZones, saveCity, serializeZones, zonesCitiesQueryKey, zonesRestaurantsQueryKey, type CityRecord, type CityRestaurantLink, type RestaurantLocationRecord, type ZoneRecord } from "@/modules/zones/api";
import { Badge, Button, EmptyState, ErrorPanel, Field, Input, MetricCard, Modal, PageHeader, Select, Surface } from "@/shared/components/ui";
import { formatNumber } from "@/shared/utils/format";

type EnrichedCity = CityRecord & { restaurants: CityRestaurantLink[] };

const toKr = (value: unknown) => {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric)) return 0;
  return Math.abs(numeric) >= 1000 ? numeric / 100 : numeric;
};

function mergeCityRestaurants(cityRestaurants: CityRecord["restaurants"], allRestaurants: RestaurantLocationRecord[]): CityRestaurantLink[] {
  const restaurantMap = new Map(allRestaurants.map((restaurant) => [restaurant.id, restaurant]));
  return (cityRestaurants || []).map((cityRestaurant) => {
    const matchingRestaurant = restaurantMap.get(cityRestaurant.id);
    return {
      ...matchingRestaurant,
      ...cityRestaurant,
      deliveryZones: matchingRestaurant?.deliveryZones,
      freeDeliveryAbove: toKr(cityRestaurant.freeDeliveryAbove),
    };
  });
}

function RestaurantOverrideModal({
  open,
  restaurant,
  centerLat,
  centerLng,
  onClose,
  onSave,
}: {
  open: boolean;
  restaurant: CityRestaurantLink | null;
  centerLat?: number | null;
  centerLng?: number | null;
  onClose: () => void;
  onSave: (restaurantId: string, zones: ZoneRecord[], freeDeliveryAbove: number) => void;
}) {
  const [zones, setZones] = useState<ZoneRecord[]>([]);
  const [freeDeliveryAbove, setFreeDeliveryAbove] = useState(0);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!open || !restaurant) return;
    setZones(parseZones(restaurant.deliveryZones));
    setFreeDeliveryAbove(restaurant.freeDeliveryAbove || 0);
  }, [open, restaurant]);
  /* eslint-enable react-hooks/set-state-in-effect */

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={restaurant ? `${restaurant.name} override` : "Restaurant override"}
      widthClassName="max-w-[1600px]"
      footer={<div className="flex items-center justify-end gap-2"><Button onClick={onClose}>Close</Button><Button variant="primary" onClick={() => restaurant && onSave(restaurant.id, zones, freeDeliveryAbove)}>Save override</Button></div>}
    >
      {restaurant ? (
        <div className="space-y-5">
          <div className="grid gap-4 md:grid-cols-3">
            <MetricCard label="Zones" value={formatNumber(zones.length)} />
            <MetricCard label="Status" value={restaurant.isOpen ? "Open" : "Closed"} />
            <div className="surface-muted px-4 py-4">
              <Field label="Free delivery above">
                <Input type="number" value={freeDeliveryAbove} onChange={(event) => setFreeDeliveryAbove(Number(event.target.value))} />
              </Field>
            </div>
          </div>
          <ZoneEditor zones={zones} onChange={setZones} cityName={restaurant.name} centerLat={centerLat} centerLng={centerLng} mapHeight={720} />
        </div>
      ) : null}
    </Modal>
  );
}

function CitySettingsModal({ open, city, onClose, onChange }: { open: boolean; city: EnrichedCity | null; onClose: () => void; onChange: (patch: Partial<EnrichedCity>) => void }) {
  return (
    <Modal open={open} onClose={onClose} title={city ? `${city.name} settings` : "City settings"} footer={<div className="flex justify-end"><Button onClick={onClose}>Close</Button></div>}>
      {city ? (
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Name"><Input value={city.name} onChange={(event) => onChange({ name: event.target.value })} /></Field>
          <Field label="Slug"><Input value={city.slug} onChange={(event) => onChange({ slug: event.target.value })} /></Field>
          <Field label="Delivery mode"><Select value={city.deliveryMode} onChange={(event) => onChange({ deliveryMode: event.target.value as EnrichedCity["deliveryMode"] })}><option value="ALL">All</option><option value="ONLY_DELIVERY">Only delivery</option><option value="ONLY_PICKUP">Only pickup</option></Select></Field>
          <Field label="Status"><Select value={city.isActive ? "active" : "inactive"} onChange={(event) => onChange({ isActive: event.target.value === "active" })}><option value="active">Active</option><option value="inactive">Inactive</option></Select></Field>
          <Field label="Free delivery above"><Input type="number" value={city.freeDeliveryAbove} onChange={(event) => onChange({ freeDeliveryAbove: Number(event.target.value) })} /></Field>
          <Field label="Fallback radius km"><Input type="number" value={city.radiusKm || 10} onChange={(event) => onChange({ radiusKm: Number(event.target.value) })} /></Field>
        </div>
      ) : null}
    </Modal>
  );
}

export function ZonesPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [cities, setCities] = useState<EnrichedCity[]>([]);
  const [selectedCityId, setSelectedCityId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [newCityOpen, setNewCityOpen] = useState(false);
  const [newCityName, setNewCityName] = useState("");

  const citiesQuery = useQuery({ queryKey: zonesCitiesQueryKey, queryFn: getCities });
  const restaurantsQuery = useQuery({ queryKey: zonesRestaurantsQueryKey, queryFn: getZoneRestaurants });

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!citiesQuery.data || !restaurantsQuery.data) return;
    const nextCities = citiesQuery.data.map((city) => ({
      ...city,
      freeDeliveryAbove: toKr(city.freeDeliveryAbove),
      restaurants: mergeCityRestaurants(city.restaurants, restaurantsQuery.data),
    }));
    setCities(nextCities);
    setSelectedCityId((current) => current || nextCities[0]?.id || null);
  }, [citiesQuery.data, restaurantsQuery.data]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const selectedCity = useMemo(() => cities.find((city) => city.id === selectedCityId) || null, [cities, selectedCityId]);
  const cityZones = selectedCity ? parseZones(selectedCity.zones) : [];

  const setCityZones = (zones: ZoneRecord[]) => {
    if (!selectedCity) return;
    setCities((current) => current.map((city) => (city.id === selectedCity.id ? { ...city, zones: JSON.stringify(serializeZones(zones)) } : city)));
  };

  const updateSelectedCity = (patch: Partial<EnrichedCity>) => {
    if (!selectedCity) return;
    setCities((current) => current.map((city) => (city.id === selectedCity.id ? { ...city, ...patch } : city)));
  };

  const toggleRestaurantLink = (restaurant: RestaurantLocationRecord) => {
    if (!selectedCity) return;
    setCities((current) => current.map((city) => {
      if (city.id !== selectedCity.id) return city;
      const alreadyLinked = city.restaurants.some((item) => item.id === restaurant.id);
      if (alreadyLinked) {
        return { ...city, restaurants: city.restaurants.filter((item) => item.id !== restaurant.id) };
      }
      return {
        ...city,
        restaurants: [
          ...city.restaurants,
          {
            id: restaurant.id,
            name: restaurant.name,
            slug: restaurant.slug,
            city: restaurant.city,
            isOpen: restaurant.isOpen,
            latitude: restaurant.latitude,
            longitude: restaurant.longitude,
            deliveryZones: restaurant.deliveryZones,
            freeDeliveryAbove: 0,
          },
        ],
      };
    }));
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!selectedCity) return;
      const restaurantZones = Object.fromEntries(
        selectedCity.restaurants.map((restaurant) => [
          restaurant.id,
          {
            zones: serializeZones(parseZones(restaurant.deliveryZones)),
            freeDeliveryAbove: Number(restaurant.freeDeliveryAbove || 0),
          },
        ]),
      );

      await saveCity({
        id: selectedCity.id,
        name: selectedCity.name,
        slug: selectedCity.slug,
        deliveryMode: selectedCity.deliveryMode,
        isActive: selectedCity.isActive,
        latitude: selectedCity.centerLat ?? selectedCity.latitude,
        longitude: selectedCity.centerLng ?? selectedCity.longitude,
        centerLat: selectedCity.centerLat ?? selectedCity.latitude,
        centerLng: selectedCity.centerLng ?? selectedCity.longitude,
        radiusKm: selectedCity.radiusKm,
        polygon: selectedCity.polygon,
        freeDeliveryAbove: Number(selectedCity.freeDeliveryAbove || 0),
        zones: parseZones(selectedCity.zones),
        restaurantIds: selectedCity.restaurants.map((restaurant) => restaurant.id),
        restaurantZones,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["zones"] });
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => createCity(newCityName),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["zones"] });
      setNewCityName("");
      setNewCityOpen(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!selectedCity) return;
      await deleteCity(selectedCity.id);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["zones"] });
      setSelectedCityId(null);
    },
  });

  if (citiesQuery.isLoading || restaurantsQuery.isLoading) {
    return <Surface className="px-6 py-12 text-sm text-[var(--text-secondary)]">Loading zone control...</Surface>;
  }

  if (citiesQuery.isError || restaurantsQuery.isError) {
    return <ErrorPanel title="Zone module could not be loaded" description="Cities or restaurant data failed to load." action={<Button onClick={() => { void citiesQuery.refetch(); void restaurantsQuery.refetch(); }}>Retry</Button>} />;
  }

  const stats = {
    cities: cities.length,
    active: cities.filter((city) => city.isActive).length,
    restaurants: cities.reduce((sum, city) => sum + city.restaurants.length, 0),
    zones: cities.reduce((sum, city) => sum + parseZones(city.zones).length, 0),
  };

  return (
    <div className="page-stack">
      <PageHeader
        title="Zones"
        actions={
          <>
            <Button variant="secondary" onClick={() => setNewCityOpen(true)}><Plus size={13} /> New city</Button>
            <Button variant="primary" onClick={() => saveMutation.mutate()} disabled={!selectedCity || saveMutation.isPending}><Save size={13} /> Save city</Button>
          </>
        }
      />

      {/* ── Stad-dropdown + city-actions överst ─────────────────────────── */}
      <Surface className="px-6 py-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex-1 max-w-md">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)] mb-2">Välj stad</p>
            <div className="relative">
              <MapPinned size={14} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
              <select
                value={selectedCityId || ""}
                onChange={(event) => setSelectedCityId(event.target.value || null)}
                className="w-full appearance-none rounded-lg border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] py-2.5 pl-10 pr-10 text-sm font-bold text-[var(--text-primary)] focus:border-[rgba(231,178,75,0.4)] focus:outline-none focus:ring-2 focus:ring-[rgba(231,178,75,0.15)]"
              >
                {cities.length === 0 && <option value="">Inga städer än</option>}
                {cities.map((city) => (
                  <option key={city.id} value={city.id}>
                    {city.name} — {city.restaurants.length} restauranger
                  </option>
                ))}
              </select>
              <ChevronDown size={14} className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
            </div>
          </div>
          {selectedCity && (
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={selectedCity.isActive ? "success" : "danger"}>{selectedCity.isActive ? "Active" : "Inactive"}</Badge>
              <Badge tone="info">{selectedCity.deliveryMode}</Badge>
              <Button variant="secondary" onClick={() => setSettingsOpen(true)}><Settings2 size={14} /> Stadsinställningar</Button>
              <Button variant="danger" onClick={() => {
                const count = selectedCity.restaurants.length;
                const msg = count > 0
                  ? `Radera ${selectedCity.name}?\n\n⚠️  ${count} restaurang${count !== 1 ? "er" : ""} länkad${count !== 1 ? "a" : ""} till denna stad får sin city-koppling rensad.\n\nFortsätt?`
                  : `Radera ${selectedCity.name}?`;
                if (window.confirm(msg)) deleteMutation.mutate();
              }}><Trash2 size={14} /> Radera stad</Button>
            </div>
          )}
        </div>
      </Surface>

      {!selectedCity ? (
        <EmptyState title="Välj en stad" />
      ) : (
        <>
          {/* ── Restaurang-grid: alla restauranger i staden, klickbara → polygon-editor ── */}
          <Surface className="px-6 py-6">
            <div className="flex items-center justify-between gap-3 mb-5">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">Restauranger i {selectedCity.name}</p>
                <h3 className="mt-1.5 text-xl font-black tracking-[-0.02em]">Klicka en restaurang för att rita zoner</h3>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">Kartan centreras på restaurangens adress. Polygon eller cirkel-zoner med eget pris och min-order.</p>
              </div>
              <Badge tone="info">{selectedCity.restaurants.length} kopplade</Badge>
            </div>

            {selectedCity.restaurants.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[var(--border-subtle)] px-6 py-12 text-center">
                <Store size={28} className="mx-auto text-[var(--text-muted)] mb-3" />
                <p className="text-sm font-bold text-[var(--text-secondary)]">Inga restauranger kopplade till {selectedCity.name} ännu.</p>
                <p className="mt-1.5 text-xs text-[var(--text-muted)]">Använd "Koppla restauranger"-knappen nedan för att lägga till.</p>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {selectedCity.restaurants.map((restaurant) => {
                  const overrideCount = parseZones(restaurant.deliveryZones).length;
                  const hasCoords = restaurant.latitude != null && restaurant.longitude != null;
                  return (
                    <button
                      key={restaurant.id}
                      type="button"
                      onClick={() => router.push(`/zones/restaurant/${restaurant.id}`)}
                      className="group surface-muted px-4 py-4 text-left rounded-2xl border border-[var(--border-subtle)] hover:border-[rgba(231,178,75,0.4)] hover:bg-[rgba(231,178,75,0.04)] transition-all"
                    >
                      <div className="flex items-start justify-between gap-3 mb-2.5">
                        <div className="min-w-0 flex-1">
                          <p className="font-black text-base truncate group-hover:text-[rgba(231,178,75,1)] transition-colors">{restaurant.name}</p>
                          {restaurant.city && (
                            <p className="mt-0.5 text-xs text-[var(--text-secondary)] truncate flex items-center gap-1">
                              <MapPin size={11} className="opacity-60" />
                              {restaurant.city}
                            </p>
                          )}
                        </div>
                        <Badge tone={restaurant.isOpen ? "success" : "neutral"}>{restaurant.isOpen ? "Öppen" : "Stängd"}</Badge>
                      </div>
                      <div className="flex items-center justify-between gap-2 mt-3 pt-3 border-t border-[var(--border-subtle)]">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge tone={overrideCount > 0 ? "info" : "neutral"}>{overrideCount} zon{overrideCount !== 1 ? "er" : ""}</Badge>
                          {!hasCoords && <Badge tone="warning">Saknar koordinater</Badge>}
                        </div>
                        <span className="text-[10px] font-black uppercase tracking-wider text-[var(--text-muted)] group-hover:text-[rgba(231,178,75,1)] transition-colors">
                          Konfigurera →
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </Surface>

          {/* ── Koppla fler restauranger (collapsible — sekundär flow) ─── */}
          <details className="group">
            <summary className="cursor-pointer list-none">
              <Surface className="px-6 py-4 flex items-center justify-between hover:border-[rgba(231,178,75,0.3)] transition-all">
                <div>
                  <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">Avancerat</p>
                  <p className="mt-1 text-sm font-bold">Koppla / koppla bort restauranger från {selectedCity.name}</p>
                </div>
                <ChevronDown size={16} className="text-[var(--text-muted)] group-open:rotate-180 transition-transform" />
              </Surface>
            </summary>
            <Surface className="px-6 py-6 mt-3">
              <div className="grid gap-3 lg:grid-cols-2">
                {restaurantsQuery.data?.map((restaurant) => {
                  const linked = selectedCity.restaurants.some((item) => item.id === restaurant.id);
                  return (
                    <div key={restaurant.id} className="surface-muted px-4 py-3 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-bold text-sm truncate">{restaurant.name}</p>
                        <p className="mt-0.5 text-xs text-[var(--text-secondary)] truncate">{restaurant.city || "Ingen stad"}</p>
                      </div>
                      <Button variant="secondary" onClick={() => toggleRestaurantLink(restaurant)}>{linked ? "Koppla bort" : "Koppla"}</Button>
                    </div>
                  );
                })}
              </div>
            </Surface>
          </details>

          {/* Stadsövergripande täckning är borttagen — varje restaurang har egna
              zoner via /zones/restaurant/{id}. Ingen "fallback"-täckning på
              city-nivå längre. Backend ignorerar city.zones helt vid
              validate-location. */}

        </>
      )}

      {/* ── Städer-hantering: hierarki + manuell merge + aliases ─────────
          Visas alltid (oavsett om en stad är vald), så admin kan se alla
          städer som auto-skapats från Google Places och slå ihop dem. */}
      <CityHierarchyManager />

      <CitySettingsModal open={settingsOpen} city={selectedCity} onClose={() => setSettingsOpen(false)} onChange={updateSelectedCity} />
      <Modal open={newCityOpen} onClose={() => setNewCityOpen(false)} title="New city" footer={<div className="flex justify-end gap-2"><Button onClick={() => setNewCityOpen(false)}>Close</Button><Button variant="primary" onClick={() => createMutation.mutate()} disabled={!newCityName.trim() || createMutation.isPending}>{createMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Building2 size={16} />} Create</Button></div>}>
        <Field label="City name"><Input value={newCityName} onChange={(event) => setNewCityName(event.target.value)} placeholder="Lund" /></Field>
      </Modal>
      {/* RestaurantOverrideModal är borttagen — zone-redigering per restaurang
          sker nu på en standalone full-skärm-sida: /zones/restaurant/{id}.
          Klick på restaurang-kort ovan navigerar dit via router.push(). */}
    </div>
  );
}
