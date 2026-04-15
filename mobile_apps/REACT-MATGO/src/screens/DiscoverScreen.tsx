import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, ScrollView, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppStore } from '../store/useAppStore';
import { api, getImageUrl } from '../lib/api';
import { palette, styles } from '../constants/theme';
import type { Order, Restaurant } from '../types';
import { Header, ScreenWrap, RestaurantCard, EmptyPanel } from '../components/ui';
import ScalePressable from '../components/ScalePressable';
import StarRating from '../components/StarRating';

const DISCOVER_CATEGORIES = [
  { name: "Pizza", icon: "pizza-outline" as const, tint: "#ef4444", bg: "#2c1217" },
  { name: "Burgare", icon: "fast-food-outline" as const, tint: "#f59e0b", bg: "#33200d" },
  { name: "Sallad", icon: "leaf-outline" as const, tint: "#22c55e", bg: "#123020" },
  { name: "Sushi", icon: "fish-outline" as const, tint: "#38bdf8", bg: "#132b36" },
  { name: "Kebab", icon: "restaurant-outline" as const, tint: "#f97316", bg: "#351b12" },
  { name: "Snabbmat", icon: "bicycle-outline" as const, tint: "#a855f7", bg: "#251434" },
];

export default function DiscoverScreen({ openRestaurant, goBack, initialFilteredIds, filteredTitle }: { openRestaurant: (slug: string) => void; goBack: () => void; initialFilteredIds?: string[]; filteredTitle?: string }) {
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [activeSearch, setActiveSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const token = useAppStore((s) => s.token);
  const clearFilteredIds = useAppStore((s) => s.setFilteredRestaurantIds);

  useEffect(() => {
    if (initialFilteredIds) {
      clearFilteredIds(null);
    }
  }, [initialFilteredIds, clearFilteredIds]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [restaurantsRes, ordersRes] = await Promise.all([
          api.get("/api/restaurants"),
          token ? api.get("/api/profile/orders", { headers: { Authorization: `Bearer ${token}` } }) : Promise.resolve({ data: [] }),
        ]);
        if (!active) return;
        setRestaurants(restaurantsRes.data || []);
        setOrders(ordersRes.data || []);
      } catch {
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [token]);

  const recentOrders = orders.slice(0, 3);
  const storedFilteredIds = useAppStore((s) => s.filteredRestaurantIds);
  const activeFilteredIds = initialFilteredIds || storedFilteredIds;
  const filteredRestaurants = (activeFilteredIds ? restaurants.filter((r) => activeFilteredIds.includes(r.id)) : restaurants).filter((restaurant) => {
    const haystack = `${restaurant.name} ${restaurant.cuisine || ""} ${(restaurant.tags || []).join(" ")}`.toLowerCase();
    return haystack.includes(activeSearch.toLowerCase());
  });

  const trendingRestaurants = [...restaurants].sort((a, b) => (b.rating || 0) - (a.rating || 0)).slice(0, 5);

  return (
    <ScreenWrap>
      <View style={{ paddingTop: 8 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
          <View>
            <Text style={{ fontSize: 34, fontWeight: "900" }}>
              {filteredTitle ? (
                <Text style={{ color: palette.text }}>{filteredTitle.toUpperCase()}</Text>
              ) : (
                <>
                  <Text style={{ color: palette.text }}>UPPTÄCK</Text>
                  <Text style={{ color: palette.gold }}>MATGO</Text>
                </>
              )}
            </Text>
            <Text style={{ color: "#6f667d", fontSize: 11, fontWeight: "900", letterSpacing: 2, marginTop: 6 }}>
              {filteredTitle ? `${filteredRestaurants.length} RESTAURANGER` : "HITTA DIN NÄSTA FAVORITUPPLEVELSE"}
            </Text>
          </View>
          {filteredTitle ? (
            <Pressable
              onPress={() => { clearFilteredIds(null); goBack(); }}
              style={{
                width: 58,
                height: 58,
                borderRadius: 20,
                backgroundColor: "#17171b",
                borderWidth: 1,
                borderColor: "#2b2a31",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons name="close" size={26} color="#7f798a" />
            </Pressable>
          ) : (
            <Pressable
              onPress={goBack}
              style={{
                width: 58,
                height: 58,
                borderRadius: 20,
                backgroundColor: "#17171b",
                borderWidth: 1,
                borderColor: "#2b2a31",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons name="compass-outline" size={26} color={palette.gold} />
            </Pressable>
          )}
        </View>

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
            value={activeSearch}
            onChangeText={setActiveSearch}
            placeholder="Hitta din favorit..."
            placeholderTextColor="#6f667d"
            style={{ flex: 1, color: palette.text, fontSize: 16, fontWeight: "700", marginBottom: 0, padding: 0 }}
          />
        </View>
      </View>

      {loading && (
        <View style={styles.loaderWrap}>
          <ActivityIndicator color={palette.gold} />
        </View>
      )}



      {!loading && !activeSearch && !activeFilteredIds && (
        <View style={{ marginTop: 10 }}>
          <Text style={{ color: palette.text, fontSize: 16, fontWeight: "900", letterSpacing: 2, marginBottom: 16 }}>KATEGORIER</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 14 }}>
            {DISCOVER_CATEGORIES.map((category: any) => (
              <ScalePressable
                key={category.name}
                onPress={() => setActiveSearch(category.name)}
                style={{
                  width: 100,
                  height: 120,
                  borderRadius: 24,
                  backgroundColor: "#19191d",
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.05)",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 12,
                }}
              >
                <View
                  style={{
                    width: 46,
                    height: 46,
                    borderRadius: 14,
                    backgroundColor: category.bg,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Ionicons name={category.icon as any} size={22} color={category.tint} />
                </View>
                <Text style={{ color: "#b8b2c2", fontSize: 11, fontWeight: "900", letterSpacing: 0.5 }}>{category.name.toUpperCase()}</Text>
              </ScalePressable>
            ))}
          </ScrollView>
        </View>
      )}

      {!loading && !activeSearch && !activeFilteredIds && (
        <View style={{ marginTop: 16 }}>
          <View style={[styles.sectionTitleRow, { marginBottom: 18 }]}>
            <Text style={{ color: palette.text, fontSize: 16, fontWeight: "900", letterSpacing: 2 }}>POPULÄRT JUST NU</Text>
          </View>
          {trendingRestaurants.map((restaurant) => (
            <ScalePressable
              key={restaurant.id}
              onPress={() => openRestaurant(restaurant.slug)}
              style={{
                backgroundColor: "#19191d",
                borderRadius: 30,
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.05)",
                padding: 16,
                flexDirection: "row",
                alignItems: "center",
                gap: 16,
                marginBottom: 14,
              }}
            >
              <View style={{ width: 82, height: 82, borderRadius: 24, overflow: "hidden", backgroundColor: "#111015" }}>
                {!!(restaurant.heroImageUrl || restaurant.imageUrl) && (
                  <Image source={{ uri: getImageUrl(restaurant.heroImageUrl || restaurant.imageUrl) }} style={{ width: "100%", height: "100%" }} />
                )}
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <Text style={{ color: palette.text, fontSize: 19, fontWeight: "900" }}>{restaurant.name.toUpperCase()}</Text>
                  <View
                    style={{
                      paddingHorizontal: 8,
                      paddingVertical: 4,
                      borderRadius: 12,
                      backgroundColor: restaurant.isOpen === false ? "rgba(244,63,94,0.15)" : "rgba(16,185,129,0.15)",
                    }}
                  >
                    <Text style={{ color: restaurant.isOpen === false ? "#fb7185" : "#10b981", fontSize: 10, fontWeight: "900" }}>
                      {restaurant.isOpen === false ? "STÄNGD" : "ÖPPET"}
                    </Text>
                  </View>
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <StarRating rating={restaurant.rating} size={12} showNumber={true} />
                  <Text style={{ color: "#7f798a", fontSize: 12, fontWeight: "700" }}>{(restaurant.city || "").toUpperCase()}</Text>
                </View>
              </View>
              <Ionicons name="chevron-forward-outline" size={20} color={palette.gold} />
            </ScalePressable>
          ))}
        </View>
      )}

      {!loading && !!activeFilteredIds && !activeSearch && (
        <View style={{ marginTop: 16 }}>
          <View style={styles.sectionTitleRow}>
            <Text style={{ color: palette.text, fontSize: 16, fontWeight: "900", letterSpacing: 2 }}>
              {filteredRestaurants.length} RESTAURANG{filteredRestaurants.length !== 1 ? "ER" : ""} MED DENNA DEAL
            </Text>
          </View>
          {filteredRestaurants.length === 0 ? (
            <EmptyPanel label="Inga restauranger hittade." />
          ) : (
            filteredRestaurants.map((restaurant) => (
              <ScalePressable
                key={restaurant.id}
                onPress={() => openRestaurant(restaurant.slug)}
                style={{
                  backgroundColor: "#19191d",
                  borderRadius: 28,
                  borderWidth: 1,
                  borderColor: "rgba(168,85,247,0.3)",
                  padding: 16,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 16,
                  marginBottom: 14,
                }}
              >
                <View style={{ width: 90, height: 90, borderRadius: 22, overflow: "hidden", backgroundColor: "#111015" }}>
                  {!!(restaurant.heroImageUrl || restaurant.imageUrl) && (
                    <Image source={{ uri: getImageUrl(restaurant.heroImageUrl || restaurant.imageUrl) }} style={{ width: "100%", height: "100%" }} />
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 6 }}>
                    <Text style={{ color: palette.text, fontSize: 18, fontWeight: "900" }}>{restaurant.name.toUpperCase()}</Text>
                    <View
                      style={{
                        paddingHorizontal: 8,
                        paddingVertical: 4,
                        borderRadius: 10,
                        backgroundColor: restaurant.isOpen === false ? "rgba(244,63,94,0.15)" : "rgba(16,185,129,0.15)",
                      }}
                    >
                      <Text style={{ color: restaurant.isOpen === false ? "#fb7185" : "#10b981", fontSize: 9, fontWeight: "900" }}>
                        {restaurant.isOpen === false ? "STÄNGD" : "ÖPPET"}
                      </Text>
                    </View>
                  </View>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 16, marginBottom: 8 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <Ionicons name="time-outline" size={13} color="#a855f7" />
                      <Text style={{ color: "#a855f7", fontSize: 11, fontWeight: "900" }}>{Math.round(restaurant.etaMinutes || 30)} MIN</Text>
                    </View>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <Ionicons name="receipt-outline" size={13} color="#a855f7" />
                      <Text style={{ color: "#a855f7", fontSize: 11, fontWeight: "900" }}>MIN {restaurant.minOrderAmount || 0} KR</Text>
                    </View>
                  </View>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <StarRating rating={restaurant.rating} size={12} />
                    <Text style={{ color: "#7f798a", fontSize: 11, fontWeight: "700" }}>{(restaurant.city || "").toUpperCase()}</Text>
                  </View>
                </View>
                <Ionicons name="chevron-forward-outline" size={20} color="#a855f7" />
              </ScalePressable>
            ))
          )}
        </View>
      )}

      {!loading && !!activeSearch && (
        <View style={{ marginTop: 16 }}>
          <View style={styles.sectionTitleRow}>
            <Text style={{ color: palette.text, fontSize: 16, fontWeight: "900", letterSpacing: 2 }}>
              SÖKRESULTAT FÖR "{activeSearch.toUpperCase()}"
            </Text>
            <Pressable onPress={() => setActiveSearch("")}>
              <Text style={{ color: "#7f798a", fontSize: 12, fontWeight: "900" }}>RENSA</Text>
            </Pressable>
          </View>
          {filteredRestaurants.length === 0 ? (
            <EmptyPanel label="Inga restauranger hittade. Prova att söka på något annat." />
          ) : (
            filteredRestaurants.map((restaurant) => (
              <RestaurantCard key={restaurant.id} restaurant={restaurant} onPress={() => openRestaurant(restaurant.slug)} />
            ))
          )}
        </View>
      )}
    </ScreenWrap>
  );
}