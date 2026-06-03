import React, { useEffect, useState } from "react";
import { View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../lib/api";
import { useTheme } from "../theme";

// Liten "≈ X poäng"-etikett nära produktpriset. Läser den publika dpoints-raten
// (poäng per 1 kr) en gång och cachar promisen på modulnivå. Göms om Dpoints av.
let cached: Promise<{ enabled: boolean; valuePerKr: number }> | null = null;
function getRate() {
  if (!cached) {
    cached = api
      .get("/api/settings")
      .then((r) => ({
        enabled: !!r.data?.dpoints?.enabled,
        valuePerKr: Number(r.data?.dpoints?.valuePerKr ?? 10),
      }))
      .catch(() => ({ enabled: false, valuePerKr: 10 }));
  }
  return cached;
}

export default function DpointsProductBadge({ priceKr }: { priceKr: number }) {
  const { palette } = useTheme();
  const [rate, setRate] = useState<{ enabled: boolean; valuePerKr: number } | null>(null);
  useEffect(() => {
    getRate().then(setRate);
  }, []);

  if (!rate || !rate.enabled || !priceKr || priceKr <= 0) return null;
  const points = Math.round(priceKr * rate.valuePerKr);
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 }}>
      <Ionicons name="diamond-outline" size={11} color={palette.goldDark} />
      <Text style={{ color: palette.goldDark, fontSize: 11, fontWeight: "800" }}>≈ {points} p</Text>
    </View>
  );
}
