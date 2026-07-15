"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, ChevronRight, Loader2, MapPin, Plus, Save, Settings2, Store, Trash2 } from "lucide-react";
import ZoneEditor from "@/modules/zones/components/zone-editor";
import { CityHierarchyManager } from "@/modules/zones/city-hierarchy-manager";
import { createCity, deleteCity, getCities, getZoneRestaurants, parseZones, saveCity, serializeZones, zonesCitiesQueryKey, zonesRestaurantsQueryKey, type CityRecord, type CityRestaurantLink, type RestaurantLocationRecord } from "@/modules/zones/api";
import { Badge, Button, ConfirmDialog, ErrorPanel, Field, Input, MoneyInput, Modal, NumberInput, PageHeader, Select, Surface, SwitchField } from "@/shared/components/ui";

type EnrichedCity = CityRecord & { restaurants: CityRestaurantLink[] };

const oreToKr = (value: unknown) => {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric / 100 : 0;
};

const parseNumericDraft = (value: string): number | null => {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) return null;
  const numeric = Number(normalized);
  return Number.isFinite(numeric) ? numeric : null;
};

const normalizeNonNegativeDraft = (value: string, fallback = 0) => {
  const numeric = parseNumericDraft(value);
  return Math.max(0, numeric ?? fallback);
};

function mergeCityRestaurants(cityRestaurants: CityRecord["restaurants"], allRestaurants: RestaurantLocationRecord[]): CityRestaurantLink[] {
  const restaurantMap = new Map(allRestaurants.map((restaurant) => [restaurant.id, restaurant]));
  return (cityRestaurants || []).map((cityRestaurant) => {
    const matchingRestaurant = restaurantMap.get(cityRestaurant.id);
    return {
      ...matchingRestaurant,
      ...cityRestaurant,
      deliveryZones: matchingRestaurant?.deliveryZones,
      freeDeliveryAbove: oreToKr(cityRestaurant.freeDeliveryAboveOre ?? cityRestaurant.freeDeliveryAbove),
    };
  });
}

function CitySettingsFields({ city, onChange }: { city: EnrichedCity; onChange: (patch: Partial<EnrichedCity>) => void }) {
  const [freeDeliveryDraft, setFreeDeliveryDraft] = useState(() => String(city.freeDeliveryAbove ?? 0));
  const [radiusDraft, setRadiusDraft] = useState(() => String(city.radiusKm || 10));

  const updateFreeDelivery = (raw: string) => {
    setFreeDeliveryDraft(raw);
    const numeric = parseNumericDraft(raw);
    if (numeric != null) onChange({ freeDeliveryAbove: Math.max(0, numeric) });
  };

  const commitFreeDelivery = () => {
    const next = normalizeNonNegativeDraft(freeDeliveryDraft, city.freeDeliveryAbove ?? 0);
    setFreeDeliveryDraft(String(next));
    onChange({ freeDeliveryAbove: next });
  };

  const updateRadius = (raw: string) => {
    setRadiusDraft(raw);
    const numeric = parseNumericDraft(raw);
    if (numeric != null) onChange({ radiusKm: Math.max(0, numeric) });
  };

  const commitRadius = () => {
    const next = normalizeNonNegativeDraft(radiusDraft, city.radiusKm || 10);
    setRadiusDraft(String(next));
    onChange({ radiusKm: next });
  };

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Field label="Namn"><Input value={city.name} onChange={(event) => onChange({ name: event.target.value })} /></Field>
      <Field label="Slug"><Input value={city.slug} onChange={(event) => onChange({ slug: event.target.value })} /></Field>
      <Field label="Leveransmodell"><Select value={city.deliveryMode} onChange={(event) => onChange({ deliveryMode: event.target.value as EnrichedCity["deliveryMode"] })}><option value="ALL">Alla</option><option value="ONLY_DELIVERY">Endast leverans</option><option value="ONLY_PICKUP">Endast avhämtning</option></Select></Field>
      <SwitchField
        label="Aktiv stad"
        hint={city.isActive ? "Staden är synlig och kan användas." : "Staden är dold för kunder."}
        checked={city.isActive}
        onChange={(isActive) => onChange({ isActive })}
      />
      <Field label="Fri leverans över" hint="0 kr inaktiverar gränsen.">
        <MoneyInput
          value={freeDeliveryDraft}
          onValueChange={updateFreeDelivery}
          onBlur={commitFreeDelivery}
          min={0}
          placeholder="0"
        />
      </Field>
      <Field label="Reservradie" hint="Används när en exakt leveranszon saknas.">
        <NumberInput
          value={radiusDraft}
          onValueChange={updateRadius}
          onBlur={commitRadius}
          min={0}
          step={0.1}
          suffix="km"
          placeholder="10"
        />
      </Field>
    </div>
  );
}

function CitySettingsModal({ open, city, onClose, onChange }: { open: boolean; city: EnrichedCity | null; onClose: () => void; onChange: (patch: Partial<EnrichedCity>) => void }) {
  return (
    <Modal open={open} onClose={onClose} size="md" title={city ? `${city.name}, inställningar` : "Stadsinställningar"} footer={<div className="flex justify-end"><Button onClick={onClose}>Stäng</Button></div>}>
      {city ? <CitySettingsFields key={city.id} city={city} onChange={onChange} /> : null}
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
  const [deleteTarget, setDeleteTarget] = useState<EnrichedCity | null>(null);
  const [activeTab, setActiveTab] = useState<"overview" | "hierarchy">("overview");

  const citiesQuery = useQuery({ queryKey: zonesCitiesQueryKey, queryFn: getCities });
  const restaurantsQuery = useQuery({ queryKey: zonesRestaurantsQueryKey, queryFn: getZoneRestaurants });

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!citiesQuery.data || !restaurantsQuery.data) return;
    const nextCities = citiesQuery.data.map((city) => ({
      ...city,
      freeDeliveryAbove: oreToKr(city.freeDeliveryAboveOre ?? city.freeDeliveryAbove),
      restaurants: mergeCityRestaurants(city.restaurants, restaurantsQuery.data),
    }));
    setCities(nextCities);
    setSelectedCityId((current) => current || nextCities[0]?.id || null);
  }, [citiesQuery.data, restaurantsQuery.data]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const selectedCity = useMemo(() => cities.find((city) => city.id === selectedCityId) || null, [cities, selectedCityId]);
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
    mutationFn: (cityId: string) => deleteCity(cityId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["zones"] });
      setSelectedCityId(null);
      setDeleteTarget(null);
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
            {activeTab === "overview" && <Button variant="primary" onClick={() => saveMutation.mutate()} disabled={!selectedCity} loading={saveMutation.isPending}><Save size={14} /> Spara stad</Button>}
          </>
        }
      />

      <div className="flex items-center gap-1 border-b border-[var(--row-divider)] pb-1">
        {([['overview', 'Zonöversikt'], ['hierarchy', 'Stadshierarki']] as const).map(([value, label]) => (
          <button key={value} type="button" onClick={() => setActiveTab(value)} className={`rounded-[10px] px-4 py-2.5 text-sm font-bold transition-colors ${activeTab === value ? "bg-[var(--text-primary)] text-white" : "text-[var(--text-secondary)] hover:bg-[var(--bg-panel-soft)]"}`}>{label}</button>
        ))}
      </div>

      {activeTab === "hierarchy" ? <CityHierarchyManager /> : (
        cities.length === 0 ? (
          <Surface className="px-6 py-16 text-center"><MapPin size={28} className="mx-auto mb-3 text-[var(--text-muted)]" /><h3 className="text-[15px] font-extrabold tracking-[-0.3px]">Inga städer än</h3><p className="mx-auto mt-2 max-w-sm text-sm text-[var(--text-secondary)]">Lägg till en stad för att börja koppla restauranger och rita deras zoner.</p><div className="mt-5 flex justify-center"><Button variant="primary" onClick={() => setNewCityOpen(true)}><Plus size={14} /> Lägg till stad/zon</Button></div></Surface>
        ) : (
          <div className="grid items-start gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
            <Surface className="overflow-hidden p-2">
              <div className="px-3 py-2"><p className="text-[11px] font-black uppercase tracking-[0.16em] text-[var(--text-muted)]">Städer</p><p className="mt-1 text-xs text-[var(--text-secondary)]">Välj en stad för att hantera dess restauranger.</p></div>
              <div className="mt-1 grid gap-1">
                {cities.map((city) => <button key={city.id} type="button" onClick={() => setSelectedCityId(city.id)} className={`flex items-center justify-between gap-2 rounded-[10px] px-3 py-3 text-left transition-colors ${city.id === selectedCityId ? "bg-[var(--accent-soft)] text-[var(--accent-ink)]" : "text-[var(--text-primary)] hover:bg-[var(--bg-panel-soft)]"}`}><span className="flex min-w-0 items-center gap-2"><MapPin size={15} className="shrink-0" /><span className="truncate text-sm font-bold">{city.name}</span></span><span className="text-xs font-semibold text-[var(--text-muted)]">{city.restaurants.length}</span></button>)}
              </div>
              <button type="button" onClick={() => setNewCityOpen(true)} className="mt-2 flex w-full items-center gap-2 rounded-[10px] border border-dashed border-[var(--border-subtle)] px-3 py-2.5 text-sm font-bold text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent-ink)]"><Plus size={14} /> Ny stad</button>
            </Surface>
            {selectedCity && <Surface className="overflow-hidden">
              <div className="flex items-center justify-between gap-3 border-b border-[var(--row-divider)] px-5 py-4"><div className="flex min-w-0 items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-[var(--accent-soft)] text-[var(--accent-ink)]"><MapPin size={16} /></span><div><div className="flex items-center gap-2"><h2 className="text-[17px] font-extrabold tracking-[-0.3px]">{selectedCity.name}</h2><Badge tone={selectedCity.isActive ? "success" : "danger"}>{selectedCity.isActive ? "Aktiv" : "Inaktiv"}</Badge></div><p className="mt-0.5 text-xs text-[var(--text-muted)]">{selectedCity.restaurants.length} kopplade restauranger</p></div></div><div className="flex items-center gap-1"><button type="button" onClick={() => setSettingsOpen(true)} className="icon-button" aria-label="Stadsinställningar"><Settings2 size={15} /></button><button type="button" onClick={() => setDeleteTarget(selectedCity)} className="icon-button" aria-label="Radera stad"><Trash2 size={15} /></button></div></div>
              {selectedCity.restaurants.length === 0 ? <div className="px-5 py-14 text-center"><Store size={24} className="mx-auto mb-2.5 text-[var(--text-muted)]" /><p className="text-sm font-semibold text-[var(--text-secondary)]">Inga restauranger kopplade ännu.</p></div> : <div>{selectedCity.restaurants.map((restaurant) => { const zoneCount = parseZones(restaurant.deliveryZones).length; const hasCoords = restaurant.latitude != null && restaurant.longitude != null; return <button key={restaurant.id} type="button" onClick={() => router.push(`/zones/restaurant/${restaurant.id}`)} className="group flex w-full items-center justify-between gap-3 border-b border-[var(--row-divider)] px-5 py-3.5 text-left last:border-b-0 hover:bg-[var(--accent-soft)]"><div className="flex min-w-0 items-center gap-3"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--bg-panel-soft)] text-[var(--text-muted)]"><Store size={14} /></span><div className="min-w-0"><p className="truncate text-sm font-bold">{restaurant.name}</p><p className="mt-0.5 truncate text-xs text-[var(--text-muted)]">{restaurant.city || selectedCity.name}</p></div></div><div className="flex shrink-0 items-center gap-2">{!hasCoords && <Badge tone="warning">Saknar koordinater</Badge>}<Badge tone={zoneCount > 0 ? "info" : "neutral"}>{zoneCount} zon{zoneCount !== 1 ? "er" : ""}</Badge><ChevronRight size={15} className="text-[var(--accent-ink)] transition-transform group-hover:translate-x-0.5" /></div></button>; })}</div>}
              <details className="border-t border-[var(--row-divider)]"><summary className="cursor-pointer list-none px-5 py-3.5 text-sm font-bold text-[var(--text-secondary)]">Koppla restauranger</summary><div className="grid gap-2 border-t border-[var(--row-divider)] px-5 py-4 lg:grid-cols-2">{restaurantsQuery.data?.map((restaurant) => { const linked = selectedCity.restaurants.some((item) => item.id === restaurant.id); return <div key={restaurant.id} className="flex items-center justify-between gap-3 surface-muted px-3 py-2.5"><div className="min-w-0"><p className="truncate text-sm font-bold">{restaurant.name}</p><p className="truncate text-xs text-[var(--text-muted)]">{restaurant.city || "Ingen stad"}</p></div><Button variant="secondary" onClick={() => toggleRestaurantLink(restaurant)}>{linked ? "Koppla bort" : "Koppla"}</Button></div>; })}</div></details>
            </Surface>}
          </div>
        )
      )}

      <CitySettingsModal open={settingsOpen} city={selectedCity} onClose={() => setSettingsOpen(false)} onChange={updateSelectedCity} />
      <Modal open={newCityOpen} onClose={() => setNewCityOpen(false)} title="Lägg till stad" footer={<div className="flex justify-end gap-2"><Button onClick={() => setNewCityOpen(false)}>Avbryt</Button><Button variant="primary" onClick={() => createMutation.mutate()} disabled={!newCityName.trim()} loading={createMutation.isPending}><Building2 size={16} /> Skapa</Button></div>}>
        <Field label="Stadsnamn"><Input value={newCityName} onChange={(event) => setNewCityName(event.target.value)} placeholder="Lund" /></Field>
      </Modal>
      <ConfirmDialog
        open={deleteTarget !== null}
        title={`Radera ${deleteTarget?.name ?? "staden"}?`}
        description={deleteTarget && deleteTarget.restaurants.length > 0
          ? `${deleteTarget.restaurants.length} restaurang${deleteTarget.restaurants.length === 1 ? "" : "er"} får sin stadskoppling rensad. Restaurangerna raderas inte.`
          : "Staden tas bort permanent."}
        confirmLabel="Radera stad"
        danger
        loading={deleteMutation.isPending}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => { if (deleteTarget) deleteMutation.mutate(deleteTarget.id); }}
      />
      {/* RestaurantOverrideModal är borttagen — zone-redigering per restaurang
          sker nu på en standalone full-skärm-sida: /zones/restaurant/{id}.
          Klick på restaurang-kort ovan navigerar dit via router.push(). */}
    </div>
  );
}
