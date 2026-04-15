import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../lib/api';
import { palette, styles } from '../constants/theme';
import type { Restaurant } from '../types';
import { Header, ScreenWrap, RestaurantCard, EmptyPanel } from '../components/ui';
import ScalePressable from '../components/ScalePressable';

const DISCOVER_CATEGORIES = [
  { name: "Pizza", icon: "pizza-outline" as const, tint: "#ef4444", bg: "#2c1217" },
  { name: "Burgare", icon: "fast-food-outline" as const, tint: "#f59e0b", bg: "#33200d" },
  { name: "Sallad", icon: "leaf-outline" as const, tint: "#22c55e", bg: "#123020" },
  { name: "Sushi", icon: "fish-outline" as const, tint: "#38bdf8", bg: "#132b36" },
  { name: "Kebab", icon: "restaurant-outline" as const, tint: "#f97316", bg: "#351b12" },
  { name: "Snabbmat", icon: "bicycle-outline" as const, tint: "#a855f7", bg: "#251434" },
];

export default function SearchScreen({ openRestaurant }: { openRestaurant: (slug: string) => void }) {
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const response = await api.get("/api/restaurants");
        if (active) setRestaurants(response.data || []);
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
            borderColor: "rgba(255,255,255,0.08)",
            backgroundColor: "#17171b",
            paddingHorizontal: 20,
            paddingVertical: 16,
            marginBottom: 18,
          }}
        >
          <Ionicons name="search-outline" size={24} color="#6f667d" />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Hitta din favorit..."
            placeholderTextColor="#6f667d"
            style={{ flex: 1, color: palette.text, fontSize: 16, fontWeight: "700", marginBottom: 0, padding: 0 }}
          />
          {!!query && (
            <Pressable onPress={() => setQuery("")}>
              <Ionicons name="close-circle" size={20} color="#6f667d" />
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
                      backgroundColor: "#19191d",
                      borderWidth: 1,
                      borderColor: "rgba(255,255,255,0.05)",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 12,
                    }}
                  >
                    <View style={{ width: 48, height: 48, borderRadius: 16, backgroundColor: category.bg, alignItems: "center", justifyContent: "center" }}>
                      <Ionicons name={category.icon as any} size={24} color={category.tint} />
                    </View>
                    <Text style={{ color: "#b8b2c2", fontSize: 12, fontWeight: "900", letterSpacing: 1 }}>{category.name.toUpperCase()}</Text>
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