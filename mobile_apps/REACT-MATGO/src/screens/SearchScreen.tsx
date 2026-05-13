import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../lib/api';
import { getScreenCache, setScreenCache } from '../lib/screenCache';
import { styles } from '../constants/theme';
import { useTheme } from '../theme';
import type { Restaurant } from '../types';
import { Header, ScreenWrap, RestaurantCard, EmptyPanel } from '../components/ui';
import ScalePressable from '../components/ScalePressable';
import { SearchScreenSkeleton } from '../components/SkeletonLoader';

const DISCOVER_CATEGORIES = [
  { name: "Pizza", icon: "pizza-outline" as const, tint: "#ef4444", bg: "rgba(239,68,68,0.1)" },
  { name: "Burgare", icon: "fast-food-outline" as const, tint: "#f59e0b", bg: "rgba(245,158,11,0.1)" },
  { name: "Sallad", icon: "leaf-outline" as const, tint: "#22c55e", bg: "rgba(34,197,94,0.1)" },
  { name: "Sushi", icon: "fish-outline" as const, tint: "#38bdf8", bg: "rgba(56,189,248,0.1)" },
  { name: "Kebab", icon: "restaurant-outline" as const, tint: "#f97316", bg: "rgba(249,115,22,0.1)" },
  { name: "Snabbmat", icon: "bicycle-outline" as const, tint: "#a855f7", bg: "rgba(168,85,247,0.1)" },
];

type SearchScreenCache = {
  restaurants: Restaurant[];
};

export default function SearchScreen({ openRestaurant }: { openRestaurant: (slug: string) => void }) {
  const { palette } = useTheme();
  const cachedData = getScreenCache<SearchScreenCache>('search', 'shared');
  const [restaurants, setRestaurants] = useState<Restaurant[]>(() => cachedData?.restaurants || []);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(!cachedData);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const response = await api.get("/api/restaurants");
        if (active) {
          const nextRestaurants = (response.data || []) as Restaurant[];
          setRestaurants(nextRestaurants);
          setScreenCache<SearchScreenCache>('search', 'shared', { restaurants: nextRestaurants });
        }
      } catch {}
      if (active) setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, []);

  const filtered = restaurants.filter((restaurant) => {
    const haystack = `${restaurant.name} ${restaurant.cuisine || ""} ${restaurant.description || ""}`.toLowerCase();
    return haystack.includes(query.toLowerCase());
  });

  if (loading) {
    return (
      <ScreenWrap>
        <SearchScreenSkeleton />
      </ScreenWrap>
    );
  }

  return (
    <ScreenWrap>
      <View style={{ paddingTop: 8 }}>
        <Header title="SÖK" subtitle="Hitta din nästa måltid" />
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
            borderRadius: 30,
            borderWidth: 1,
            borderColor: palette.border,
            backgroundColor: palette.panel,
            paddingHorizontal: 20,
            paddingVertical: 16,
            marginBottom: 18,
          }}
        >
          <Ionicons name="search-outline" size={24} color={palette.muted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Hitta din favorit..."
            placeholderTextColor={palette.muted}
            style={{ flex: 1, color: palette.text, fontSize: 16, fontWeight: "700", marginBottom: 0, padding: 0 }}
          />
          {!!query && (
            <Pressable onPress={() => setQuery("")}>
              <Ionicons name="close-circle" size={20} color={palette.muted} />
            </Pressable>
          )}
        </View>
      </View>

      {loading ? (
        <View style={styles.loaderWrap}>
          <ActivityIndicator color={palette.gold} />
        </View>
      ) : (
        <>
          {!query && (
            <View style={{ marginTop: 10 }}>
              <Text style={{ color: palette.text, fontSize: 16, fontWeight: "900", letterSpacing: 2, marginBottom: 16 }}>KATEGORIER</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: 14 }}>
                {DISCOVER_CATEGORIES.map((category: any) => (
                  <ScalePressable
                    key={category.name}
                    onPress={() => setQuery(category.name)}
                    style={{
                      width: "47%",
                      minHeight: 140,
                      borderRadius: 22,
                      backgroundColor: palette.panel,
                      borderWidth: 1,
                      borderColor: palette.border,
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 12,
                    }}
                  >
                    <View style={{ width: 48, height: 48, borderRadius: 16, backgroundColor: category.bg, alignItems: "center", justifyContent: "center" }}>
                      <Ionicons name={category.icon as any} size={24} color={category.tint} />
                    </View>
                    <Text style={{ color: palette.text, fontSize: 12, fontWeight: "900", letterSpacing: 1 }}>{category.name.toUpperCase()}</Text>
                  </ScalePressable>
                ))}
              </View>
            </View>
          )}

          {!!query && (
            <View style={{ marginTop: 10 }}>
               {filtered.length === 0 ? (
                 <EmptyPanel label="Inga restauranger hittade. Prova något annat." />
               ) : (
                 filtered.map((restaurant) => (
                   <RestaurantCard key={restaurant.id} restaurant={restaurant} onPress={() => openRestaurant(restaurant.slug)} />
                 ))
               )}
            </View>
          )}
        </>
      )}
    </ScreenWrap>
  );
}
