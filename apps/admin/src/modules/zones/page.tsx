"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, ChevronDown, ChevronRight, Loader2, MapPin, Plus, Save, Settings2, Store, Trash2 } from "lucide-react";
import ZoneEditor from "@/modules/zones/components/zone-editor";
import { CityHierarchyManager } from "@/modules/zones/city-hierarchy-manager";
import { createCity, deleteCity, getCities, getZoneRestaurants, parseZones, saveCity, serializeZones, zonesCitiesQueryKey, zonesRestaurantsQueryKey, type CityRecord, type CityRestaurantLink, type RestaurantLocationRecord, type ZoneRecord } from "@/modules/zones/api";
import { Badge, Button, ErrorPanel, Field, Input, MetricCard, Modal, PageHeader, Select, Surface } from "@/shared/components/ui";
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
      title={restaurant ? `${restaurant.name}, egna zoner` : "Egna zoner"}
      widthClassName="max-w-[1600px]"
      footer={<div className="flex items-center justify-end gap-2"><Button onClick={onClose}>Stäng</Button><Button variant="primary" onClick={() => restaurant && onSave(restaurant.id, zones, freeDeliveryAbove)}>Spara zoner</Button></div>}
    >
      {restaurant ? (
        <div className="space-y-5">
          <div className="grid gap-4 md:grid-cols-3">
            <MetricCard label="Zoner" value={formatNumber(zones.length)} />
            <MetricCard label="Status" value={restaurant.isOpen ? "Öppen" : "Stängd"} />
            <div className="surface-muted px-4 py-4">
              <Field label="Fri leverans över (kr)">
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
    <Modal open={open} onClose={onClose} title={city ? `${city.name}, inställningar` : "Stadsinställningar"} footer={<div className="flex justify-end"><Button onClick={onClose}>Stäng</Button></div>}>
      {city ? (
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Namn"><Input value={city.name} onChange={(event) => onChange({ name: event.target.value })} /></Field>
          <Field label="Slug"><Input value={city.slug} onChange={(event) => onChange({ slug: event.target.value })} /></Field>
          <Field label="Leveransmodell"><Select value={city.deliveryMode} onChange={(event) => onChange({ deliveryMode: event.target.value as EnrichedCity["deliveryMode"] })}><option value="ALL">Alla</option><option value="ONLY_DELIVERY">Endast leverans</option><option value="ONLY_PICKUP">Endast avhämtning</option></Select></Field>
          <Field label="Status"><Select value={city.isActive ? "active" : "inactive"} onChange={(event) => onChange({ isActive: event.target.value === "active" })}><option value="active">Aktiv</option><option value="inactive">Inaktiv</option></Select></Field>
          <Field label="Fri leverans över (kr)"><Input type="number" value={city.freeDeliveryAbove} onChange={(event) => onChange({ freeDeliveryAbove: Number(event.target.value) })} /></Field>
          <Field label="Reservradie (km)"><Input type="number" value={city.radiusKm || 10} onChange={(event) => onChange({ radiusKm: Number(event.target.value) })} /></Field>
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
    return (
      <div className="page-stack">
        <PageHeader breadcrumb="Katalog" title="Zoner" />
        <Surface className="flex items-center gap-2 px-6 py-12 text-sm text-[var(--text-secondary)]">
          <Loader2 size={15} className="animate-spin" /> Hämtar zoner...
        </Surface>
      </div>
    );
  }

  if (citiesQuery.isError || restaurantsQuery.isError) {
    return (
      <div className="page-stack">
        <PageHeader breadcrumb="Katalog" title="Zoner" />
        <ErrorPanel
          title="Zoner kunde inte laddas"
          description="Städer eller restaurangdata gick inte att hämta."
          action={<Button onClick={() => { void citiesQuery.refetch(); void restaurantsQuery.refetch(); }}>Försök igen</Button>}
        />
      </div>
    );
  }

  return (
    <div className="page-stack">
      <PageHeader
        breadcrumb="Katalog"
        title="Zoner"
        actions={
          <>
            <Button variant="secondary" onClick={() => setNewCityOpen(true)}><Plus size={14} /> Lägg till stad/zon</Button>
            <Button variant="primary" onClick={() => saveMutation.mutate()} disabled={!selectedCity || saveMutation.isPending}><Save size={14} /> Spara stad</Button>
          </>
        }
      />

      {/* ── Stad → restaurang drill-down ──────────────────────────────────
          Zoner är restaurang-specifika (inga globala zoner). Varje stad är
          ett kort; restaurangerna är rader som länkar till sin zon-detalj. */}
      {cities.length === 0 ? (
        <Surface className="px-6 py-16 text-center">
          <MapPin size={28} className="mx-auto mb-3 text-[var(--text-muted)]" />
          <h3 className="text-[15px] font-extrabold tracking-[-0.3px]">Inga städer än</h3>
          <p className="mx-auto mt-2 max-w-sm text-sm text-[var(--text-secondary)]">
            Lägg till en stad för att börja koppla restauranger och rita deras zoner.
          </p>
          <div className="mt-5 flex justify-center">
            <Button variant="primary" onClick={() => setNewCityOpen(true)}><Plus size={14} /> Lägg till stad/zon</Button>
          </div>
        </Surface>
      ) : (
        <div className="space-y-4">
          {cities.map((city) => {
            const isSelected = city.id === selectedCityId;
            return (
              <Surface key={city.id} className="overflow-hidden">
                {/* Stad-rubrik */}
                <div className="flex items-center justify-between gap-3 border-b border-[var(--row-divider)] px-6 py-4">
                  <button
                    type="button"
                    onClick={() => setSelectedCityId(isSelected ? null : city.id)}
                    className="flex min-w-0 items-center gap-3 text-left"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-[var(--accent-soft)] text-[var(--accent-ink)]">
                      <MapPin size={16} />
                    </span>
                    <span className="min-w-0">
                      <span className="flex items-center gap-2">
                        <span className="text-[15px] font-extrabold tracking-[-0.3px] text-[var(--text-primary)]">{city.name}</span>
                        <ChevronDown
                          size={15}
                          className={`shrink-0 text-[var(--text-muted)] transition-transform ${isSelected ? "rotate-180" : ""}`}
                        />
                      </span>
                      <span className="mt-0.5 block text-xs font-medium text-[var(--text-muted)]">
                        {city.restaurants.length} restaurang{city.restaurants.length !== 1 ? "er" : ""}
                      </span>
                    </span>
                  </button>
                  <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                    <Badge tone={city.isActive ? "success" : "danger"}>{city.isActive ? "Aktiv" : "Inaktiv"}</Badge>
                    <button
                      type="button"
                      onClick={() => { setSelectedCityId(city.id); setSettingsOpen(true); }}
                      className="icon-button"
                      aria-label="Stadsinställningar"
                    >
                      <Settings2 size={15} />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedCityId(city.id);
                        const count = city.restaurants.length;
                        const msg = count > 0
                          ? `Radera ${city.name}?\n\n${count} restaurang${count !== 1 ? "er" : ""} länkad${count !== 1 ? "a" : ""} till denna stad får sin city-koppling rensad.\n\nFortsätt?`
                          : `Radera ${city.name}?`;
                        if (window.confirm(msg)) deleteMutation.mutate();
                      }}
                      className="icon-button"
                      aria-label="Radera stad"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>

                {/* Restauranger i staden (expanderbart) */}
                {isSelected && (
                  city.restaurants.length === 0 ? (
                    <div className="px-6 py-10 text-center">
                      <Store size={24} className="mx-auto mb-2.5 text-[var(--text-muted)]" />
                      <p className="text-sm font-semibold text-[var(--text-secondary)]">Inga restauranger kopplade till {city.name} ännu.</p>
                    </div>
                  ) : (
                    <div>
                      {city.restaurants.map((restaurant) => {
                        const zoneCount = parseZones(restaurant.deliveryZones).length;
                        const hasCoords = restaurant.latitude != null && restaurant.longitude != null;
                        return (
                          <button
                            key={restaurant.id}
                            type="button"
                            onClick={() => router.push(`/zones/restaurant/${restaurant.id}`)}
                            className="group flex w-full items-center justify-between gap-3 border-b border-[var(--row-divider)] px-6 py-3.5 text-left last:border-b-0 hover:bg-[var(--accent-soft)]"
                          >
                            <div className="flex min-w-0 items-center gap-3">
                              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--bg-panel-soft)] text-[var(--text-muted)]">
                                <Store size={14} />
                              </span>
                              <div className="min-w-0">
                                <p className="truncate text-sm font-bold text-[var(--text-primary)]">{restaurant.name}</p>
                                <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-[var(--text-muted)]">
                                  <MapPin size={10} className="shrink-0 opacity-70" />
                                  {restaurant.city || "Ingen stad"}
                                </p>
                              </div>
                            </div>
                            <div className="flex shrink-0 items-center gap-3">
                              {!hasCoords && <Badge tone="warning">Saknar koordinater</Badge>}
                              <Badge tone={zoneCount > 0 ? "info" : "neutral"}>{zoneCount} zon{zoneCount !== 1 ? "er" : ""}</Badge>
                              <span className="flex items-center gap-1 text-[13px] font-bold text-[var(--accent-ink)]">
                                Öppna zoner
                                <ChevronRight size={15} className="transition-transform group-hover:translate-x-0.5" />
                              </span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )
                )}
              </Surface>
            );
          })}
        </div>
      )}

      {/* ── Koppla fler restauranger (collapsible — sekundär flow) ─── */}
      {selectedCity && (
        <details className="group/details">
          <summary className="cursor-pointer list-none">
            <Surface className="flex items-center justify-between px-6 py-4 transition-colors hover:border-[var(--border-strong)]">
              <div>
                <p className="text-[15px] font-extrabold tracking-[-0.3px]">Koppla restauranger</p>
                <p className="mt-0.5 text-xs font-medium text-[var(--text-muted)]">Koppla eller koppla bort restauranger från {selectedCity.name}.</p>
              </div>
              <ChevronDown size={16} className="text-[var(--text-muted)] transition-transform group-open/details:rotate-180" />
            </Surface>
          </summary>
          <Surface className="mt-3 px-6 py-5">
            <div className="grid gap-2.5 lg:grid-cols-2">
              {restaurantsQuery.data?.map((restaurant) => {
                const linked = selectedCity.restaurants.some((item) => item.id === restaurant.id);
                return (
                  <div key={restaurant.id} className="flex items-center justify-between gap-3 surface-muted px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold">{restaurant.name}</p>
                      <p className="mt-0.5 truncate text-xs text-[var(--text-muted)]">{restaurant.city || "Ingen stad"}</p>
                    </div>
                    <Button variant="secondary" onClick={() => toggleRestaurantLink(restaurant)}>{linked ? "Koppla bort" : "Koppla"}</Button>
                  </div>
                );
              })}
            </div>
          </Surface>
        </details>
      )}

      {/* Stadsövergripande täckning är borttagen — varje restaurang har egna
          zoner via /zones/restaurant/{id}. Ingen "fallback"-täckning på
          city-nivå längre. Backend ignorerar city.zones helt vid
          validate-location. */}

      {/* ── Städer-hantering: hierarki + manuell merge + aliases ─────────
          Visas alltid (oavsett om en stad är vald), så admin kan se alla
          städer som auto-skapats från Google Places och slå ihop dem. */}
      <CityHierarchyManager />

      <CitySettingsModal open={settingsOpen} city={selectedCity} onClose={() => setSettingsOpen(false)} onChange={updateSelectedCity} />
      <Modal open={newCityOpen} onClose={() => setNewCityOpen(false)} title="Lägg till stad" footer={<div className="flex justify-end gap-2"><Button onClick={() => setNewCityOpen(false)}>Avbryt</Button><Button variant="primary" onClick={() => createMutation.mutate()} disabled={!newCityName.trim() || createMutation.isPending}>{createMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Building2 size={16} />} Skapa</Button></div>}>
        <Field label="Stadsnamn"><Input value={newCityName} onChange={(event) => setNewCityName(event.target.value)} placeholder="Lund" /></Field>
      </Modal>
      {/* RestaurantOverrideModal är borttagen — zone-redigering per restaurang
          sker nu på en standalone full-skärm-sida: /zones/restaurant/{id}.
          Klick på restaurang-kort ovan navigerar dit via router.push(). */}
    </div>
  );
}
