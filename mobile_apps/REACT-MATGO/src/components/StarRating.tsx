import React from "react";
import { View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../theme";

export default function StarRating({ rating, size = 12, showNumber = false }: { rating?: number; size?: number; showNumber?: boolean }) {
  const { palette } = useTheme();
  const stars = Math.round(rating || 0);
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Ionicons key={i} name={i <= stars ? "star" : "star-outline"} size={size} color={palette.gold} />
      ))}
      {showNumber && rating && (
        <Text style={{ color: palette.gold, fontSize: size - 2, fontWeight: "900", marginLeft: 4 }}>
          {rating.toFixed(1)}
        </Text>
      )}
    </View>
  );
}
