import React, { useEffect, useState } from "react";
import { View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { api } from "../lib/api";
import { useTheme } from "../theme";

// Sponsor-banner för UTLOGGADE: "skapa konto & få X Dpoints". Informativ —
// kunden registrerar via formuläret nedanför. Göms om inget aktivt kort finns.
interface Card {
  id: string;
  title: string;
  sponsorName: string | null;
  description: string | null;
  bonusPoints: number;
  ctaLabel: string | null;
}

export default function DpointsSponsorBanner() {
  const { palette } = useTheme();
  const [card, setCard] = useState<Card | null>(null);

  useEffect(() => {
    api
      .get("/api/dpoints/sponsor-card")
      .then((r) => setCard(r.data?.card ?? null))
      .catch(() => {});
  }, []);

  if (!card) return null;

  return (
    <LinearGradient
      colors={["#F4D086", palette.gold]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{ borderRadius: 24, padding: 18, marginBottom: 18 }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
        <View
          style={{
            width: 52,
            height: 52,
            borderRadius: 16,
            backgroundColor: "rgba(28,28,30,0.10)",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons name="diamond-outline" size={26} color="#1c1c1e" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: "#1c1c1e", fontWeight: "900", fontSize: 15 }}>{card.title}</Text>
          {!!card.description && (
            <Text style={{ color: "#1c1c1e", opacity: 0.8, fontSize: 12, fontWeight: "600" }}>{card.description}</Text>
          )}
          {!!card.sponsorName && (
            <Text style={{ color: "#1c1c1e", opacity: 0.65, fontSize: 11, marginTop: 1 }}>{card.sponsorName}</Text>
          )}
        </View>
        <View style={{ backgroundColor: "#1c1c1e", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 }}>
          <Text style={{ color: palette.goldLight, fontWeight: "900", fontSize: 13 }}>+{card.bonusPoints} p</Text>
        </View>
      </View>
      <Text style={{ color: "#1c1c1e", fontWeight: "800", fontSize: 13, textAlign: "center", marginTop: 12 }}>
        {card.ctaLabel || `Skapa konto & få ${card.bonusPoints} Dpoints`}
      </Text>
    </LinearGradient>
  );
}
