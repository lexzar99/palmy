"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Loader2, MapPinned, Plus, Save, Settings2, Store, Trash2 } from "lucide-react";
import ZoneEditor from "@/modules/zones/components/zone-editor";
import { createCity, deleteCity, getCities, getZoneRestaurants, parseZones, saveCity, serializeZones, zonesCitiesQueryKey, zonesRestaurantsQueryKey, type CityRecord, type CityRestaurantLink, type RestaurantLocationRecord, type ZoneRecord } from "@/modules/zones/api";
import { Badge, Button, EmptyState, ErrorPanel, Field, Input, MetricCard, Modal, SectionHeader, Select, Surface } from "@/shared/components/ui";
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
      description="Restaurant-specific zones override the city default when needed."
      widthClassName="max-w-[1320px]"
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
          <ZoneEditor zones={zones} onChange={setZones} cityName={restaurant.name} centerLat={centerLat} centerLng={centerLng} />
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
  const queryClient = useQueryClient();
  const [cities, setCities] = useState<EnrichedCity[]>([]);
  const [selectedCityId, setSelectedCityId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [newCityOpen, setNewCityOpen] = useState(false);
  const [newCityName, setNewCityName] = useState("");
  const [overrideRestaurantId, setOverrideRestaurantId] = useState<string | null>(null);

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
  const selectedRestaurantOverride = selectedCity?.restaurants.find((restaurant) => restaurant.id === overrideRestaurantId) || null;
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
      <Surface className="px-6 py-6">
        <SectionHeader
          eyebrow="Zones"
          title="Cities and delivery zones"
          description="Zone pricing stays API-driven and cities remain the source of truth for delivery coverage."
          actions={
            <>
              <Button variant="secondary" onClick={() => setNewCityOpen(true)}><Plus size={16} /> New city</Button>
              <Button variant="primary" onClick={() => saveMutation.mutate()} disabled={!selectedCity || saveMutation.isPending}><Save size={16} /> Save city</Button>
            </>
          }
        />
      </Surface>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Cities" value={formatNumber(stats.cities)} />
        <MetricCard label="Active cities" value={formatNumber(stats.active)} />
        <MetricCard label="Linked restaurants" value={formatNumber(stats.restaurants)} />
        <MetricCard label="Zones" value={formatNumber(stats.zones)} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[320px_1fr]">
        <Surface className="px-4 py-4">
          <div className="mb-3 flex items-center justify-between gap-3 px-2">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">Cities</p>
            <Badge tone="info">{cities.length}</Badge>
          </div>
          <div className="grid gap-2">
            {cities.map((city) => (
              <button key={city.id} type="button" onClick={() => setSelectedCityId(city.id)} className={`rounded-2xl border px-4 py-4 text-left transition-all ${selectedCityId === city.id ? "border-[rgba(94,166,255,0.3)] bg-[rgba(94,166,255,0.08)]" : "border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)]"}`}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-black">{city.name}</p>
                    <p className="mt-1 text-sm text-[var(--text-secondary)]">{parseZones(city.zones).length} zones • {city.restaurants.length} restaurants</p>
                  </div>
                  <Badge tone={city.isActive ? "success" : "danger"}>{city.isActive ? "Active" : "Inactive"}</Badge>
                </div>
              </button>
            ))}
          </div>
        </Surface>

        {!selectedCity ? (
          <EmptyState title="Select a city" description="Choose a city from the list to manage delivery zones and restaurant links." />
        ) : (
          <div className="page-stack">
            <Surface className="px-6 py-6">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <Badge tone={selectedCity.isActive ? "success" : "danger"}>{selectedCity.isActive ? "Active" : "Inactive"}</Badge>
                    <Badge tone="info">{selectedCity.deliveryMode}</Badge>
                  </div>
                  <h2 className="mt-3 text-2xl font-black tracking-[-0.04em]">{selectedCity.name}</h2>
                  <p className="mt-2 text-sm text-[var(--text-secondary)]">{selectedCity.restaurants.length} linked restaurants • free delivery above {selectedCity.freeDeliveryAbove} kr</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="secondary" onClick={() => setSettingsOpen(true)}><Settings2 size={16} /> Settings</Button>
                  <Button variant="danger" onClick={() => { if (window.confirm(`Delete ${selectedCity.name}?`)) deleteMutation.mutate(); }}><Trash2 size={16} /> Delete</Button>
                </div>
              </div>
            </Surface>

            <ZoneEditor
              zones={cityZones}
              onChange={setCityZones}
              cityName={selectedCity.name}
              centerLat={selectedCity.centerLat ?? selectedCity.latitude}
              centerLng={selectedCity.centerLng ?? selectedCity.longitude}
              onCenterChange={(lat, lng) => updateSelectedCity({ centerLat: lat, centerLng: lng })}
            />

            <Surface className="px-6 py-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">Restaurant links</p>
                  <h3 className="mt-2 text-2xl font-black tracking-[-0.04em]">City membership and overrides</h3>
                </div>
                <Badge tone="info">{selectedCity.restaurants.length} linked</Badge>
              </div>

              <div className="mt-5 grid gap-3 lg:grid-cols-2">
                {restaurantsQuery.data?.map((restaurant) => {
                  const linked = selectedCity.restaurants.some((item) => item.id === restaurant.id);
                  const overrideCount = linked ? parseZones(selectedCity.restaurants.find((item) => item.id === restaurant.id)?.deliveryZones).length : 0;
                  return (
                    <div key={restaurant.id} className="surface-muted px-4 py-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-black">{restaurant.name}</p>
                            <Badge tone={linked ? "success" : "neutral"}>{linked ? "Linked" : "Not linked"}</Badge>
                          </div>
                          <p className="mt-1 text-sm text-[var(--text-secondary)]">{restaurant.city || "No city"}</p>
                        </div>
                        <Button variant="secondary" onClick={() => toggleRestaurantLink(restaurant)}>{linked ? "Unlink" : "Link"}</Button>
                      </div>
                      {linked ? (
                        <div className="mt-4 flex flex-wrap items-center gap-2">
                          <Badge tone="info">{overrideCount} override zones</Badge>
                          <Button variant="secondary" onClick={() => setOverrideRestaurantId(restaurant.id)}><Store size={16} /> Override</Button>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </Surface>
          </div>
        )}
      </div>

      <CitySettingsModal open={settingsOpen} city={selectedCity} onClose={() => setSettingsOpen(false)} onChange={updateSelectedCity} />
      <Modal open={newCityOpen} onClose={() => setNewCityOpen(false)} title="New city" footer={<div className="flex justify-end gap-2"><Button onClick={() => setNewCityOpen(false)}>Close</Button><Button variant="primary" onClick={() => createMutation.mutate()} disabled={!newCityName.trim() || createMutation.isPending}>{createMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Building2 size={16} />} Create</Button></div>}>
        <Field label="City name"><Input value={newCityName} onChange={(event) => setNewCityName(event.target.value)} placeholder="Lund" /></Field>
      </Modal>
      <RestaurantOverrideModal open={Boolean(selectedRestaurantOverride)} restaurant={selectedRestaurantOverride} centerLat={selectedCity?.centerLat ?? selectedCity?.latitude} centerLng={selectedCity?.centerLng ?? selectedCity?.longitude} onClose={() => setOverrideRestaurantId(null)} onSave={(restaurantId, zones, freeDeliveryAbove) => {
        if (!selectedCity) return;
        setCities((current) => current.map((city) => {
          if (city.id !== selectedCity.id) return city;
          return {
            ...city,
            restaurants: city.restaurants.map((restaurant) => restaurant.id === restaurantId ? { ...restaurant, deliveryZones: JSON.stringify(serializeZones(zones)), freeDeliveryAbove } : restaurant),
          };
        }));
        setOverrideRestaurantId(null);
      }} />
    </div>
  );
}
