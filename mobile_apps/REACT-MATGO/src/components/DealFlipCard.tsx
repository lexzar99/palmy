import React, { useRef, useState } from "react";
import { Animated, Easing, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

export type DealFlipCardData = {
  id: string;
  badgeLabel: string;
  title: string;
  subtitle: string;
  rewardLabel: string;
  description?: string;
  code?: string;
  validUntil?: string | null;
  minOrderText?: string | null;
  tags?: string[];
  tone?: "gold" | "orange" | "purple";
  variant?: "public" | "personal";
  relatedRestaurantIds?: string[];
  onNavigateToFilteredRestaurants?: (restaurantIds: string[]) => void;
  onUseNow?: () => void;
};

type DealFlipCardProps = {
  deal: DealFlipCardData;
};

const tones = {
  gold: {
    accent: "#EAB545",
    accentSoft: "rgba(234,181,69,0.12)",
    border: "rgba(234,181,69,0.22)",
    tagBg: "rgba(234,181,69,0.12)",
  },
  orange: {
    accent: "#F07A13",
    accentSoft: "rgba(240,122,19,0.12)",
    border: "rgba(240,122,19,0.24)",
    tagBg: "rgba(240,122,19,0.12)",
  },
  purple: {
    accent: "#a855f7",
    accentSoft: "rgba(168,85,247,0.12)",
    border: "rgba(168,85,247,0.22)",
    tagBg: "rgba(168,85,247,0.12)",
  },
} as const;

export default function DealFlipCard({ deal }: DealFlipCardProps) {
  const [flipped, setFlipped] = useState(false);
  const progress = useRef(new Animated.Value(0)).current;
  const tone = tones[deal.tone || "gold"];

  const toggleFlip = () => {
    Animated.timing(progress, {
      toValue: flipped ? 0 : 1,
      duration: 360,
      easing: Easing.inOut(Easing.ease),
      useNativeDriver: true,
    }).start();
    setFlipped((current) => !current);
  };

  const frontOpacity = progress.interpolate({
    inputRange: [0, 0.45, 1],
    outputRange: [1, 0, 0],
  });

  const backOpacity = progress.interpolate({
    inputRange: [0, 0.55, 1],
    outputRange: [0, 0, 1],
  });

  const frontScale = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0.96],
  });

  const backScale = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0.96, 1],
  });

  const frontShift = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -20],
  });

  const backShift = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [20, 0],
  });

  return (
    <View style={styles.container}>
      <Animated.View
        pointerEvents={flipped ? "none" : "auto"}
        style={[
          styles.card,
          styles.front,
          {
            borderColor: tone.border,
            opacity: frontOpacity,
            transform: [{ scale: frontScale }, { translateX: frontShift }],
          },
        ]}
      >
        <Pressable onPress={toggleFlip} style={styles.pressable}>
          <View style={styles.rowBetween}>
            <View style={styles.badgeRow}>
              <View style={[styles.iconBubble, { backgroundColor: tone.accentSoft }]}> 
                <Ionicons name={deal.tone === "purple" ? "pricetag-outline" : "sparkles-outline"} size={14} color={tone.accent} />
              </View>
              <Text style={[styles.badgeText, { color: tone.accent }]}>{deal.badgeLabel}</Text>
            </View>
            <View style={styles.chevronBubble}>
              <Ionicons name="chevron-forward" size={15} color="#B8AA95" />
            </View>
          </View>

          <View style={styles.bodyBlock}>
            <Text numberOfLines={2} style={styles.title}>{deal.title}</Text>
            <Text numberOfLines={2} style={styles.subtitle}>{deal.subtitle}</Text>
          </View>

          <View style={styles.rowBetweenEnd}>
            <Text style={[styles.rewardLabel, { color: tone.accent }]}>{deal.rewardLabel}</Text>
            <Text style={styles.hint}>TRYCK FÖR INFO</Text>
          </View>
        </Pressable>
      </Animated.View>

      <Animated.View
        pointerEvents={flipped ? "auto" : "none"}
        style={[
          styles.card,
          styles.back,
          {
            borderColor: tone.border,
            opacity: backOpacity,
            transform: [{ scale: backScale }, { translateX: backShift }],
          },
        ]}
      >
        <View style={styles.pressable}>
          <View style={styles.rowBetween}>
            <Text style={[styles.badgeText, { color: tone.accent }]}>MER INFO</Text>
            <Pressable hitSlop={10} onPress={toggleFlip}>
              <Ionicons name="close" size={18} color="#B8AA95" />
            </Pressable>
          </View>

          <View style={[styles.bodyBlock, { gap: 10 }]}> 
            {!!deal.description && <Text style={styles.description}>{deal.description}</Text>}

            {deal.variant === "personal" && deal.code ? (
              <>
                <View style={styles.codePill}>
                  <Text style={styles.codeText}>KOD: {deal.code}</Text>
                </View>
                <Text style={styles.autoAppliedText}>Automatiskt i kassan när villkor uppfylls</Text>
              </>
            ) : deal.code ? (
              <View style={styles.codePill}>
                <Text style={styles.codeText}>KOD: {deal.code}</Text>
              </View>
            ) : null}

            <View style={styles.tagWrap}>
              {!!deal.minOrderText && (
                <View style={styles.tag}>
                  <Text style={styles.tagText}>{deal.minOrderText}</Text>
                </View>
              )}
              {(deal.tags || []).slice(0, 3).map((tag) => (
                <View key={tag} style={[styles.tag, { backgroundColor: tone.tagBg }]}> 
                  <Text style={[styles.tagText, { color: tone.accent }]}>{tag}</Text>
                </View>
              ))}
            </View>

            {!!deal.validUntil && (
              <Text style={styles.validUntil}>GÄLLER T.O.M {new Date(deal.validUntil).toLocaleDateString("sv-SE")}</Text>
            )}
          </View>

            {deal.variant === "personal" ? (
              <View style={styles.autoApplyContainer}>
                <Text style={styles.autoApplyText}>UTNYTTJAD AUTOMATISKT</Text>
              </View>
            ) : (
              <Pressable 
                onPress={() => {
                  if (deal.relatedRestaurantIds && deal.relatedRestaurantIds.length > 0 && deal.onNavigateToFilteredRestaurants) {
                    deal.onNavigateToFilteredRestaurants(deal.relatedRestaurantIds);
                  } else if (deal.onUseNow) {
                    deal.onUseNow();
                  }
                }} 
                style={[styles.useButton, { backgroundColor: tone.accent }]}
              > 
                <Text style={styles.useButtonText}>UTNYTTJA NU</Text>
              </Pressable>
            )}
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 260,
    height: 150,
  },
  card: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    borderRadius: 28,
    padding: 18,
    borderWidth: 1,
  },
  front: {
    backgroundColor: "#211C19",
  },
  back: {
    backgroundColor: "#171513",
  },
  pressable: {
    flex: 1,
  },
  rowBetween: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  rowBetweenEnd: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    marginTop: "auto",
    gap: 12,
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  iconBubble: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  chevronBubble: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(255,248,234,0.05)",
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: {
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 2,
  },
  bodyBlock: {
    flex: 1,
    justifyContent: "center",
    marginTop: 12,
  },
  title: {
    color: "#FFF8EA",
    fontSize: 19,
    lineHeight: 22,
    fontWeight: "900",
    fontStyle: "italic",
    textTransform: "uppercase",
  },
  subtitle: {
    color: "#B8AA95",
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "800",
    marginTop: 8,
    textTransform: "uppercase",
  },
  rewardLabel: {
    fontSize: 19,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  hint: {
    color: "#8D7C67",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1,
  },
  description: {
    color: "#D7CBB8",
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "700",
  },
  codePill: {
    alignSelf: "flex-start",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "rgba(255,248,234,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,248,234,0.07)",
  },
  codeText: {
    color: "#FFF8EA",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.5,
  },
  autoAppliedText: {
    color: "#8D7C67",
    fontSize: 10,
    fontWeight: "700",
  },
  autoApplyContainer: {
    marginTop: 14,
    borderRadius: 18,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(34,197,94,0.15)",
    borderWidth: 1,
    borderColor: "rgba(34,197,94,0.3)",
  },
  autoApplyText: {
    color: "#22c55e",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.5,
  },
  tagWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  tag: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  tagText: {
    color: "#B8AA95",
    fontSize: 9,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  validUntil: {
    color: "#8D7C67",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1,
  },
  useButton: {
    marginTop: 14,
    borderRadius: 18,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  useButtonText: {
    color: "#09090b",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 2,
  },
});
