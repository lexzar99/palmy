import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  Text,
  View,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../lib/api";
import { useTheme } from "../theme";

type DealRestaurant = {
  id: string;
  slug: string;
  name: string;
  cuisine: string;
  city: string | null;
  imageUrl: string | null;
  heroImageUrl: string | null;
  rating: number | null;
  ratingCount: number | null;
  deliveryFee: number;
  etaMinutes: number | null;
  isOpen: boolean;
  pausedUntil: string | null;
};

type DealDetail = {
  id: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  badgeText: string | null;
  popupHeadline: string | null;
  popupBody: string | null;
  popupCode: string | null;
  discountType: "PERCENTAGE" | "FIXED" | "FIXED_PRICE";
  discountValue: number;
  minOrder: number;
  validUntil: string | null;
  isGlobal: boolean;
  restaurantId: string | null;
  restaurant: { id: string; name: string; slug: string } | null;
};

/**
 * DealScreen: dedikerad detalj-vy för en deal. Hämtar
 * /api/deals/:id/restaurants och visar erbjudandet i toppen + alla
 * matchande restauranger nedanför. Spegel av web `/deals/[id]`-sidan.
 */
export default function DealScreen({
  id,
  goBack,
  openRestaurant,
}: {
  id: string;
  goBack: () => void;
  openRestaurant: (slug: string) => void;
}) {
  const { palette } = useTheme();
  const [deal, setDeal] = useState<DealDetail | null>(null);
  const [restaurants, setRestaurants] = useState<DealRestaurant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    api
      .get(`/api/deals/${id}/restaurants`)
      .then((res) => {
        if (cancelled) return;
        setDeal(res.data?.deal || null);
        setRestaurants(res.data?.restaurants || []);
      })
      .catch((e: any) => {
        if (cancelled) return;
        setError(e?.response?.data?.error || "Kunde inte hämta erbjudandet");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: palette.bg, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={palette.gold} size="large" />
      </SafeAreaView>
    );
  }

  if (error || !deal) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: palette.bg, alignItems: "center", justifyContent: "center", padding: 24 }}>
        <Text style={{ color: palette.text, fontSize: 18, fontWeight: "900", textAlign: "center" }}>
          Erbjudandet hittades inte
        </Text>
        <Pressable
          onPress={goBack}
          style={{ marginTop: 24, paddingHorizontal: 32, paddingVertical: 14, borderRadius: 16, backgroundColor: palette.gold }}
        >
          <Text style={{ color: "#000", fontSize: 12, fontWeight: "900", letterSpacing: 2 }}>TILLBAKA</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const headline = deal.popupHeadline || deal.title;
  const body = deal.popupBody || deal.description || "";
  const badge = deal.badgeText || (deal.discountType === "PERCENTAGE" ? `-${deal.discountValue}%` : `${deal.discountValue} kr`);
  const scopeLabel = deal.isGlobal
    ? "Gäller alla restauranger"
    : deal.restaurantId
      ? `Endast ${deal.restaurant?.name || "vald restaurang"}`
      : `Gäller ${restaurants.length} restauranger`;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.bg }} edges={["top"]}>
      {/* Header med tillbaka */}
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingVertical: 12 }}>
        <Pressable onPress={goBack} hitSlop={12} style={{ padding: 6 }}>
          <Ionicons name="chevron-back" size={26} color={palette.text} />
        </Pressable>
        <Text style={{ color: palette.muted, fontSize: 11, fontWeight: "900", letterSpacing: 2, marginLeft: 8 }}>
          ERBJUDANDE
        </Text>
      </View>

      <FlatList
        data={restaurants}
        keyExtractor={(r) => r.id}
        contentContainerStyle={{ paddingBottom: 80 }}
        ListHeaderComponent={
          <View style={{ paddingHorizontal: 20 }}>
            {/* Hero-card */}
            <View
              style={{
                borderRadius: 28,
                overflow: "hidden",
                backgroundColor: palette.panel,
                borderWidth: 1,
                borderColor: "rgba(243,191,87,0.3)",
                marginBottom: 24,
              }}
            >
              {deal.imageUrl ? (
                <Image source={{ uri: deal.imageUrl }} style={{ width: "100%", height: 200 }} resizeMode="cover" />
              ) : (
                <View style={{ height: 200, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(243,191,87,0.1)" }}>
                  <Text style={{ fontSize: 64 }}>🎁</Text>
                </View>
              )}

              <View style={{ padding: 22 }}>
                <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
                  <View style={{ paddingHorizontal: 12, paddingVertical: 5, borderRadius: 999, backgroundColor: palette.gold }}>
                    <Text style={{ color: "#11151b", fontSize: 10, fontWeight: "900", letterSpacing: 1.4 }}>{badge}</Text>
                  </View>
                  <Text style={{ color: palette.muted, fontSize: 10, fontWeight: "900", letterSpacing: 1.6 }}>
                    {scopeLabel.toUpperCase()}
                  </Text>
                </View>

                <Text style={{ color: palette.text, fontSize: 26, fontWeight: "900", letterSpacing: -0.6 }}>{headline}</Text>
                {body ? (
                  <Text style={{ color: palette.muted, fontSize: 14, lineHeight: 22, marginTop: 12 }}>{body}</Text>
                ) : null}

                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginTop: 16, paddingBottom: 4 }}>
                  {deal.minOrder > 0 ? (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: palette.panelMuted }}>
                      <Ionicons name="pricetag-outline" size={12} color={palette.muted} />
                      <Text style={{ color: palette.text, fontSize: 11, fontWeight: "800" }}>Min {deal.minOrder} kr</Text>
                    </View>
                  ) : null}
                  {deal.validUntil ? (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: palette.panelMuted }}>
                      <Ionicons name="time-outline" size={12} color={palette.muted} />
                      <Text style={{ color: palette.text, fontSize: 11, fontWeight: "800" }}>
                        T.o.m. {new Date(deal.validUntil).toLocaleDateString("sv-SE")}
                      </Text>
                    </View>
                  ) : null}
                </ScrollView>

                {deal.popupCode ? (
                  <View
                    style={{
                      marginTop: 16,
                      paddingVertical: 14,
                      paddingHorizontal: 16,
                      borderRadius: 16,
                      borderWidth: 1,
                      borderStyle: "dashed",
                      borderColor: "rgba(243,191,87,0.4)",
                      backgroundColor: "rgba(243,191,87,0.08)",
                      alignItems: "center",
                    }}
                  >
                    <Text style={{ color: palette.gold, fontSize: 9, fontWeight: "900", letterSpacing: 2 }}>ANVÄND KOD</Text>
                    <Text style={{ color: palette.text, fontSize: 20, fontWeight: "900", letterSpacing: 2.5, marginTop: 4 }}>
                      {deal.popupCode}
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>

            {/* Restauranger-rubrik */}
            <Text style={{ color: palette.muted, fontSize: 10, fontWeight: "900", letterSpacing: 2.4 }}>
              RESTAURANGER MED DETTA ERBJUDANDE
            </Text>
            <Text style={{ color: palette.text, fontSize: 22, fontWeight: "900", letterSpacing: -0.6, marginTop: 6, marginBottom: 14 }}>
              {restaurants.length} {restaurants.length === 1 ? "restaurang" : "restauranger"}
            </Text>
          </View>
        }
        ListEmptyComponent={
          <View style={{ paddingHorizontal: 20 }}>
            <View
              style={{
                paddingVertical: 36,
                paddingHorizontal: 24,
                borderRadius: 24,
                borderWidth: 1,
                borderStyle: "dashed",
                borderColor: palette.border,
                alignItems: "center",
              }}
            >
              <Text style={{ color: palette.muted, fontSize: 12, fontWeight: "800", textAlign: "center" }}>
                Inga restauranger matchar erbjudandet just nu.
              </Text>
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <View style={{ paddingHorizontal: 20, marginBottom: 14 }}>
            <Pressable
              onPress={() => openRestaurant(item.slug)}
              style={{
                borderRadius: 24,
                overflow: "hidden",
                backgroundColor: palette.panel,
                borderWidth: 1,
                borderColor: palette.border,
                position: "relative",
              }}
            >
              {/* Diagonal deal-badge i hörnet */}
              <View
                style={{
                  position: "absolute",
                  top: 16,
                  left: -28,
                  zIndex: 10,
                  paddingVertical: 4,
                  paddingHorizontal: 36,
                  backgroundColor: palette.gold,
                  transform: [{ rotate: "-45deg" }],
                  shadowColor: "#000",
                  shadowOpacity: 0.2,
                  shadowRadius: 4,
                }}
              >
                <Text style={{ color: "#11151b", fontSize: 9, fontWeight: "900", letterSpacing: 1.2, textAlign: "center" }}>
                  {badge}
                </Text>
              </View>

              {item.heroImageUrl || item.imageUrl ? (
                <Image
                  source={{ uri: item.heroImageUrl || item.imageUrl || "" }}
                  style={{ width: "100%", height: 140 }}
                  resizeMode="cover"
                />
              ) : (
                <View style={{ height: 140, alignItems: "center", justifyContent: "center", backgroundColor: palette.panelMuted }}>
                  <Text style={{ fontSize: 36 }}>🍴</Text>
                </View>
              )}

              <View style={{ padding: 16 }}>
                <Text style={{ color: palette.text, fontSize: 16, fontWeight: "900", letterSpacing: -0.3 }}>
                  {item.name}
                </Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 6 }}>
                  {item.rating ? (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                      <Ionicons name="star" size={11} color={palette.gold} />
                      <Text style={{ color: palette.muted, fontSize: 11, fontWeight: "800" }}>
                        {item.rating.toFixed(1)}
                      </Text>
                    </View>
                  ) : null}
                  {item.etaMinutes ? (
                    <Text style={{ color: palette.muted, fontSize: 11, fontWeight: "800" }}>~{item.etaMinutes} min</Text>
                  ) : null}
                  {item.cuisine ? (
                    <Text style={{ color: palette.muted, fontSize: 11, fontWeight: "800" }}>• {item.cuisine}</Text>
                  ) : null}
                </View>
                {!item.isOpen ? (
                  <View
                    style={{
                      marginTop: 8,
                      paddingHorizontal: 8,
                      paddingVertical: 3,
                      borderRadius: 999,
                      backgroundColor: "rgba(244,63,94,0.12)",
                      alignSelf: "flex-start",
                    }}
                  >
                    <Text style={{ color: "#fb7185", fontSize: 9, fontWeight: "900", letterSpacing: 1 }}>STÄNGD</Text>
                  </View>
                ) : null}
              </View>
            </Pressable>
          </View>
        )}
      />
    </SafeAreaView>
  );
}
