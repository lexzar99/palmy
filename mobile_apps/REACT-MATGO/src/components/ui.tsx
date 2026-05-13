/**
 * src/components/ui.tsx
 *
 * Shared UI primitives barrel.
 * All components that previously did require('../../App') should import from here instead.
 */

import React, { useEffect, useRef } from "react";
import {
  Animated,
  Easing,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getBottomTabsContentPadding, getScreenTopPadding } from "../constants/layout";
import { styles } from "../constants/theme";
import { useTheme } from "../theme";
import { getImageUrl } from "../lib/api";
import ScalePressable from "./ScalePressable";
import StarRating from "./StarRating";
import type { Restaurant } from "../types";

// ─── PulseIndicator ────────────────────────────────────────────────────────────
export function PulseIndicator({ color, size = 12 }: { color: string; size?: number }) {
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(0.6)).current;

  useEffect(() => {
    Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(scale, { toValue: 2, duration: 1500, useNativeDriver: Platform.OS !== "web" }),
          Animated.timing(scale, { toValue: 1, duration: 0, useNativeDriver: Platform.OS !== "web" }),
        ]),
        Animated.sequence([
          Animated.timing(opacity, { toValue: 0, duration: 1500, useNativeDriver: Platform.OS !== "web" }),
          Animated.timing(opacity, { toValue: 0.6, duration: 0, useNativeDriver: Platform.OS !== "web" }),
        ]),
      ])
    ).start();
  }, [scale, opacity]);

  return (
    <View style={{ alignItems: "center", justifyContent: "center", width: size * 2, height: size * 2 }}>
      <Animated.View
        style={{
          position: "absolute",
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
          transform: [{ scale }],
          opacity,
        }}
      />
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }} />
    </View>
  );
}

// ─── SpinningLoader ────────────────────────────────────────────────────────────
export function SpinningLoader({ color, size = 20 }: { color: string; size?: number }) {
  const rotate = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.timing(rotate, {
        toValue: 1,
        duration: 2000,
        easing: Easing.linear,
        useNativeDriver: Platform.OS !== "web",
      })
    ).start();
  }, [rotate]);

  const spin = rotate.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });

  return (
    <Animated.View style={{ transform: [{ rotate: spin }] }}>
      <Ionicons name="reload-outline" size={size} color={color} />
    </Animated.View>
  );
}

// ─── Header ────────────────────────────────────────────────────────────────────
export function Header({
  title,
  subtitle,
  onBack,
}: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
}) {
  const { palette } = useTheme();
  return (
    <View style={styles.header}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        {onBack && (
          <Pressable style={styles.backButton} onPress={onBack}>
            <Ionicons name="chevron-back-outline" size={18} color={palette.text} />
          </Pressable>
        )}
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>{title}</Text>
          {!!subtitle && <Text style={styles.headerSubtitle}>{subtitle}</Text>}
        </View>
      </View>
    </View>
  );
}

// ─── ScreenWrap ────────────────────────────────────────────────────────────────
export function ScreenWrap({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={[
        styles.scrollContent,
        {
          paddingTop: getScreenTopPadding(insets.top),
          paddingBottom: getBottomTabsContentPadding(insets.bottom),
        },
      ]}
    >
      {children}
    </ScrollView>
  );
}

// ─── RestaurantCard ────────────────────────────────────────────────────────────
export function RestaurantCard({
  restaurant,
  onPress,
  containerStyle,
  isOutOfZone = false,
  dealText,
  dealTone = "gold",
  isFavorite,
  onToggleFavorite,
}: {
  restaurant: Restaurant;
  onPress: () => void;
  containerStyle?: any;
  isOutOfZone?: boolean;
  dealText?: string;
  dealTone?: "gold" | "purple" | "orange";
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
}) {
  const { palette } = useTheme();
  // Heart scale animation
  const heartScale = useRef(new Animated.Value(1)).current;

  const handleHeart = () => {
    if (!onToggleFavorite) return;
    Animated.sequence([
      Animated.timing(heartScale, { toValue: 1.4, duration: 120, useNativeDriver: Platform.OS !== "web" }),
      Animated.timing(heartScale, { toValue: 0.9, duration: 100, useNativeDriver: Platform.OS !== "web" }),
      Animated.timing(heartScale, { toValue: 1, duration: 80, useNativeDriver: Platform.OS !== "web" }),
    ]).start();
    onToggleFavorite();
  };

  return (
    <ScalePressable
      style={[
        {
          backgroundColor: palette.panel,
          borderRadius: 28,
          overflow: "hidden",
          marginBottom: 16,
          borderWidth: 1,
          borderColor: palette.border,
          shadowColor: "#1C1C1E",
          shadowOpacity: 0.05,
          shadowRadius: 20,
          shadowOffset: { width: 0, height: 6 },
          elevation: 3,
        },
        containerStyle,
      ]}
      onPress={onPress}
    >
      {/* IMAGE */}
      <View style={{ height: 195, width: "100%" }}>
        {!!restaurant.imageUrl && (
          <Image
            source={{ uri: getImageUrl(restaurant.heroImageUrl || restaurant.imageUrl) }}
            style={{ width: "100%", height: "100%" }}
            resizeMode="cover"
          />
        )}
        {/* Subtle gradient over image for text legibility */}
        <LinearGradient
          colors={["transparent", "rgba(0,0,0,0.50)"]}
          style={StyleSheet.absoluteFillObject}
        />

        {/* DEAL RIBBON – LEFT */}
        {dealText && (
          <View style={{
            position: "absolute", top: 14, left: 0,
            backgroundColor: dealTone === "purple" ? "#a855f7" : dealTone === "orange" ? "#fb923c" : palette.gold,
            paddingHorizontal: 14, paddingVertical: 5,
            borderTopRightRadius: 10, borderBottomRightRadius: 10,
            elevation: 4, shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 4,
            zIndex: 10,
          }}>
            <Text style={{ color: "#000", fontSize: 10, fontWeight: "900", letterSpacing: 0.8, textTransform: "uppercase" }}>
              ✨ {dealText}
            </Text>
          </View>
        )}

        {/* HEART – top-right, large hitSlop */}
        {onToggleFavorite && (
          <Pressable
            onPress={handleHeart}
            hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
            style={{ position: "absolute", top: 12, right: 12, zIndex: 20 }}
          >
            <Animated.View style={{
              transform: [{ scale: heartScale }],
              width: 36, height: 36, borderRadius: 18,
              backgroundColor: "rgba(255,255,255,0.92)",
              alignItems: "center", justifyContent: "center",
              shadowColor: "#000", shadowOpacity: 0.12, shadowRadius: 8, elevation: 4,
            }}>
              <Ionicons
                name={isFavorite ? "heart" : "heart-outline"}
                size={18}
                color={isFavorite ? "#FF3B30" : "#8E8E93"}
              />
            </Animated.View>
          </Pressable>
        )}

        {/* Restaurant name + cuisine overlaid on image */}
        <View style={{ position: "absolute", bottom: 14, left: 16, right: 52 }}>
          <Text numberOfLines={1} style={{ color: "#FFFFFF", fontSize: 22, fontWeight: "900", textTransform: "uppercase", fontStyle: "italic", letterSpacing: -0.4 }}>
            {restaurant.name}
          </Text>
          <Text numberOfLines={1} style={{ color: "rgba(255,255,255,0.72)", fontSize: 10, fontWeight: "800", textTransform: "uppercase", letterSpacing: 1.2, marginTop: 2 }}>
            {restaurant.cuisine || "Restaurang"}
          </Text>
        </View>
      </View>

      {/* CARD FOOTER – Metadata */}
      <View style={{ paddingHorizontal: 16, paddingVertical: 12, flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        {/* Left: star · eta · fee — shrinks first, never pushes the badge off */}
        <View style={{ flex: 1, flexShrink: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "nowrap" }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Ionicons name="star" size={12} color={palette.gold} />
            <Text style={{ color: palette.text, fontSize: 13, fontWeight: "800" }}>
              {restaurant.rating?.toFixed(1) || "4.5"}
            </Text>
          </View>
          <Text style={{ color: palette.muted, fontSize: 12 }}>•</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Ionicons name="time-outline" size={12} color={palette.muted} />
            <Text style={{ color: palette.muted, fontSize: 12, fontWeight: "700" }}>
              {Math.round(restaurant.etaMinutes || 30)} min
            </Text>
          </View>
          {!!restaurant.deliveryFee && restaurant.deliveryFee > 0 && (
            <>
              <Text style={{ color: palette.muted, fontSize: 12 }}>•</Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4, flexShrink: 1 }}>
                <Ionicons name="bicycle-outline" size={12} color={palette.muted} />
                <Text numberOfLines={1} style={{ color: palette.muted, fontSize: 12, fontWeight: "700" }}>
                  {Math.round(restaurant.deliveryFee)} kr
                </Text>
              </View>
            </>
          )}
          {(!restaurant.deliveryFee || restaurant.deliveryFee === 0) && (
            <>
              <Text style={{ color: palette.muted, fontSize: 12 }}>•</Text>
              <Text numberOfLines={1} style={{ color: palette.success, fontSize: 12, fontWeight: "800", flexShrink: 1 }}>Gratis</Text>
            </>
          )}
        </View>

        {/* Right: OPEN/PAUSAD/STÄNGT badge — never shrinks */}
        {(() => {
          const pausedUntil = restaurant.pausedUntil ? new Date(restaurant.pausedUntil) : null;
          const isPaused = pausedUntil !== null && pausedUntil.getTime() > Date.now();
          const isClosed = restaurant.isOpen === false;
          // Färg-tema per status
          const tone = isOutOfZone || (!isPaused && isClosed)
            ? "danger"
            : isPaused
              ? "warning"
              : "success";
          const colorMap = {
            danger: { bg: "rgba(255,59,48,0.10)", fg: palette.danger },
            warning: { bg: "rgba(255,167,73,0.14)", fg: "#FFA749" },
            success: { bg: "rgba(52,199,89,0.12)", fg: palette.success },
          };
          const c = colorMap[tone];
          const label = isOutOfZone
            ? "Ej zon"
            : isPaused
              ? `Pausad · ${pausedUntil!.getHours().toString().padStart(2, "0")}:${pausedUntil!.getMinutes().toString().padStart(2, "0")}`
              : isClosed
                ? "Stängt"
                : "Öppet";
          return (
            <View style={{
              flexShrink: 0,
              paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20,
              backgroundColor: c.bg,
            }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c.fg }} />
                <Text style={{ color: c.fg, fontSize: 10, fontWeight: "900" }}>
                  {label}
                </Text>
              </View>
            </View>
          );
        })()}
      </View>
    </ScalePressable>
  );
}

// ─── SectionTitle ──────────────────────────────────────────────────────────────
export function SectionTitle({
  title,
  actionLabel,
  onPress,
}: {
  title: string;
  actionLabel?: string;
  onPress?: () => void;
}) {
  return (
    <View style={styles.sectionTitleRow}>
      <Text style={styles.sectionHeading}>{title}</Text>
      {!!actionLabel && !!onPress && (
        <Pressable onPress={onPress}>
          <Text style={styles.linkText}>{actionLabel}</Text>
        </Pressable>
      )}
    </View>
  );
}

// ─── ToggleChip ────────────────────────────────────────────────────────────────
export function ToggleChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <ScalePressable style={[styles.chip, active && styles.chipActive]} onPress={onPress}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </ScalePressable>
  );
}

// ─── Badge ─────────────────────────────────────────────────────────────────────
export function Badge({
  label,
  tone,
}: {
  label: string;
  tone: "success" | "danger" | "gold" | "info";
}) {
  const { palette } = useTheme();
  const map = {
    success: { bg: "rgba(52,199,89,0.14)", text: palette.success },
    danger: { bg: "rgba(255,107,107,0.14)", text: palette.danger },
    gold: { bg: "rgba(234,181,69,0.14)", text: palette.gold },
    info: { bg: "rgba(104,182,255,0.14)", text: palette.info },
  };
  return (
    <View style={[styles.badge, { backgroundColor: map[tone].bg }]}>
      <Text style={[styles.badgeText, { color: map[tone].text }]}>{label}</Text>
    </View>
  );
}

// ─── Counter ───────────────────────────────────────────────────────────────────
export function Counter({
  value,
  onDecrease,
  onIncrease,
}: {
  value: number;
  onDecrease: () => void;
  onIncrease: () => void;
}) {
  const { palette } = useTheme();
  return (
    <View style={styles.counter}>
      <Pressable onPress={onDecrease}>
        <Ionicons name="remove-outline" size={18} color={palette.text} />
      </Pressable>
      <Text style={styles.counterText}>{value}</Text>
      <Pressable onPress={onIncrease}>
        <Ionicons name="add-outline" size={18} color={palette.text} />
      </Pressable>
    </View>
  );
}

// ─── SummaryRow ────────────────────────────────────────────────────────────────
export function SummaryRow({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  const { palette } = useTheme();
  return (
    <View style={styles.inlineSummary}>
      <Text style={[styles.summaryLabel, highlight && { color: palette.text }]}>{label}</Text>
      <Text style={[styles.summaryValue, highlight && { color: palette.gold }]}>{value}</Text>
    </View>
  );
}

// ─── EmptyPanel ────────────────────────────────────────────────────────────────
export function EmptyPanel({ label }: { label: string }) {
  return (
    <View style={styles.emptyPanel}>
      <Text style={styles.helperText}>{label}</Text>
    </View>
  );
}

// ─── PrimaryButton ─────────────────────────────────────────────────────────────
export function PrimaryButton({
  label,
  onPress,
  disabled,
  icon,
  style,
}: {
  label: string;
  onPress: () => void | Promise<void>;
  disabled?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  style?: any;
}) {
  const { palette } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        {
          borderRadius: 18,
          overflow: "hidden",
          opacity: disabled ? 0.5 : pressed ? 0.9 : 1,
          transform: [{ scale: pressed ? 0.98 : 1 }],
        },
        style,
      ]}
    >
      <LinearGradient
        colors={["#E8C978", palette.gold]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={{
          height: 60,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
          paddingHorizontal: 24,
        }}
      >
        {icon && <Ionicons name={icon} size={20} color="#000" />}
        <Text
          style={{
            color: "#000",
            fontSize: 15,
            fontWeight: "900",
            textTransform: "uppercase",
            letterSpacing: 1,
          }}
        >
          {label}
        </Text>
      </LinearGradient>
    </Pressable>
  );
}

// ─── Re-exports for convenience ────────────────────────────────────────────────
export { default as ScalePressable } from "./ScalePressable";
export { default as StarRating } from "./StarRating";
