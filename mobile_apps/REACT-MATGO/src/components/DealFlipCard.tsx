import React, { useRef, useState } from "react";
import { Animated, Easing, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { palette } from "../constants/theme";

export type DealFlipCardData = {
  id: string;
  badgeLabel: string;
  title: string;
  subtitle: string;
  rewardLabel: string;
  isGlobal?: boolean;
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
    accent: palette.gold,
    accentSoft: "rgba(217,176,85,0.18)",
    border: "rgba(125,97,38,0.16)",
    tagBg: "rgba(217,176,85,0.16)",
  },
  orange: {
    accent: palette.orange,
    accentSoft: "rgba(255,122,0,0.12)",
    border: "rgba(255,122,0,0.24)",
    tagBg: "rgba(255,122,0,0.1)",
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
              <Ionicons name="chevron-forward" size={15} color={palette.goldDark} />
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
              <Ionicons name="close" size={18} color={palette.muted} />
            </Pressable>
          </View>

          <View style={[styles.bodyBlock, { gap: 10 }]}> 
            {!!deal.description && <Text numberOfLines={2} style={styles.description}>{deal.description}</Text>}

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
              {(deal.tags || []).slice(0, 1).map((tag) => (
                <View key={tag} style={[styles.tag, { backgroundColor: tone.tagBg }]}> 
                  <Text style={[styles.tagText, { color: tone.accent }]}>{tag}</Text>
                </View>
              ))}
            </View>

            {!!deal.validUntil && (
              <Text numberOfLines={1} style={styles.validUntil}>GÄLLER T.O.M {new Date(deal.validUntil).toLocaleDateString("sv-SE")}</Text>
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
    borderRadius: 22,
    padding: 14,
    borderWidth: 1,
    shadowColor: palette.gold,
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  front: {
    backgroundColor: palette.panel,
  },
  back: {
    backgroundColor: palette.card,
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
    backgroundColor: palette.panelMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: {
    fontSize: 7,
    fontWeight: "900",
    letterSpacing: 1.2,
  },
  bodyBlock: {
    flex: 1,
    justifyContent: "center",
    marginTop: 8,
  },
  title: {
    color: palette.text,
    fontSize: 14,
    lineHeight: 16,
    fontWeight: "900",
    fontStyle: "italic",
    textTransform: "uppercase",
  },
  subtitle: {
    color: palette.muted,
    fontSize: 8,
    lineHeight: 11,
    fontWeight: "800",
    marginTop: 4,
    textTransform: "uppercase",
  },
  rewardLabel: {
    fontSize: 13,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  hint: {
    color: palette.goldDark,
    fontSize: 7,
    fontWeight: "900",
    letterSpacing: 1,
  },
  description: {
    color: palette.muted,
    fontSize: 9,
    lineHeight: 12,
    fontWeight: "700",
  },
  codePill: {
    alignSelf: "flex-start",
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 5,
    backgroundColor: palette.panel,
    borderWidth: 1,
    borderColor: palette.border,
  },
  codeText: {
    color: palette.text,
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 1,
  },
  autoAppliedText: {
    color: palette.muted,
    fontSize: 10,
    fontWeight: "700",
  },
  autoApplyContainer: {
    marginTop: 8,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(22,163,74,0.12)",
    borderWidth: 1,
    borderColor: "rgba(22,163,74,0.22)",
  },
  autoApplyText: {
    color: palette.success,
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 1,
  },
  tagWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  tag: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: palette.panelMuted,
  },
  tagText: {
    color: palette.muted,
    fontSize: 7,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  validUntil: {
    color: palette.muted,
    fontSize: 7,
    fontWeight: "900",
    letterSpacing: 1,
  },
  useButton: {
    marginTop: 8,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  useButtonText: {
    color: "#09090b",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.2,
  },
});
