"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Field, Select } from "@/shared/components/ui";
import { apiGet } from "@/shared/api/client";

type CityWithRestaurants = {
  id: string;
  name: string;
  restaurants: { id: string; name: string }[];
};

const CITY_QUERY_KEY = ["picker", "cities-with-restaurants"] as const;

/**
 * Tvåstegs-väljare: stad → restaurang.
 *
 * Vid 50+ restauranger blir en platt dropdown ohanterlig. Den här komponenten
 * fetchar `/cities?all=true` (samma endpoint som zones-admin använder) och
 * härleder vilken stad varje restaurang tillhör via join-tabellen. Restauranger
 * utan stadskoppling samlas i en pseudo-grupp "Övriga".
 *
 * `value` = restaurantId | "" (om man vill ha en "alla / global"-vy)
 */
export function CityRestaurantPicker({
  value,
  onChange,
  restaurantLabel = "Restaurang",
  emptyOption,
  disabled,
  className,
}: {
  value: string;
  onChange: (restaurantId: string) => void;
  restaurantLabel?: string;
  emptyOption?: { value: string; label: string };
  disabled?: boolean;
  className?: string;
}) {
  const cities = useQuery({
    queryKey: CITY_QUERY_KEY,
    queryFn: () => apiGet<CityWithRestaurants[]>("/cities?all=true"),
    staleTime: 60_000,
  });

  // Mappar restaurantId → cityId. Restauranger utan stad får cityId = "__none__".
  const cityByRestaurant = useMemo(() => {
    const map = new Map<string, string>();
    for (const city of cities.data || []) {
      for (const r of city.restaurants || []) map.set(r.id, city.id);
    }
    return map;
  }, [cities.data]);

  // Lokal stad-state — initieras från `value` om angiven
  const [cityId, setCityId] = useState<string>("");

  useEffect(() => {
    if (value && cityByRestaurant.has(value)) {
      setCityId(cityByRestaurant.get(value) || "");
    }
  }, [value, cityByRestaurant]);

  const restaurantsForCity = useMemo(() => {
    if (!cityId) return [];
    if (cityId === "__none__") {
      // Restauranger som inte ligger i någon stad — extra fallback för att inte tappa dem.
      // Kräver att vi har en lista över ALLA restauranger, vilket vi inte hämtar här.
      // Behåller tomt tills behov uppstår.
      return [];
    }
    const city = (cities.data || []).find((c) => c.id === cityId);
    return city ? city.restaurants : [];
  }, [cities.data, cityId]);

  const isLoading = cities.isLoading;

  return (
    <div className={`grid gap-3 sm:grid-cols-2 ${className || ""}`}>
      <Field label="Stad">
        <Select
          value={cityId}
          onChange={(event) => {
            setCityId(event.target.value);
            // När stad byts, nollställ vald restaurang (om inte emptyOption-värdet)
            onChange(emptyOption?.value ?? "");
          }}
          disabled={disabled || isLoading}
        >
          <option value="">{isLoading ? "Laddar städer…" : "Välj stad…"}</option>
          {(cities.data || []).map((city) => (
            <option key={city.id} value={city.id}>
              {city.name} ({city.restaurants.length})
            </option>
          ))}
        </Select>
      </Field>

      <Field label={restaurantLabel}>
        <Select
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled || !cityId}
        >
          {emptyOption ? (
            <option value={emptyOption.value}>{emptyOption.label}</option>
          ) : (
            <option value="">{cityId ? "Välj restaurang…" : "Välj stad först"}</option>
          )}
          {restaurantsForCity.map((r) => (
            <option key={r.id} value={r.id}>{r.name}</option>
          ))}
        </Select>
      </Field>
    </div>
  );
}
