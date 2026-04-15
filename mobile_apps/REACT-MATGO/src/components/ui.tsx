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
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { palette, styles } from "../constants/theme";
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
  return <ScrollView contentContainerStyle={styles.scrollContent}>{children}</ScrollView>;
}

// ─── RestaurantCard ────────────────────────────────────────────────────────────
export function RestaurantCard({
  restaurant,
  onPress,
  containerStyle,
  isOutOfZone = false,
}: {
  restaurant: Restaurant;
  onPress: () => void;
  containerStyle?: any;
  isOutOfZone?: boolean;
}) {
  return (
    <ScalePressable
      style={[
        {
          backgroundColor: "#121217",
          borderRadius: 32,
          overflow: "hidden",
          marginBottom: 20,
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.06)",
        },
        containerStyle,
      ]}
      onPress={onPress}
    >
      <View style={{ height: 200, width: "100%" }}>
        {!!restaurant.imageUrl && (
          <Image
            source={{ uri: getImageUrl(restaurant.heroImageUrl || restaurant.imageUrl) }}
            style={{ width: "100%", height: "100%" }}
          />
        )}
        <LinearGradient
          colors={["transparent", "rgba(0,0,0,0.9)"]}
          style={{ ...StyleSheet.absoluteFillObject }}
        />
        
        <View style={{ position: "absolute", top: 16, right: 16 }}>
          <View style={{ 
            backgroundColor: "rgba(0,0,0,0.6)", 
            paddingHorizontal: 10, 
            paddingVertical: 6, 
            borderRadius: 12,
            flexDirection: "row",
            alignItems: "center",
            gap: 4
          }}>
            <Ionicons name="star" size={12} color={palette.gold} />
            <Text style={{ color: "#FFF", fontSize: 12, fontWeight: "900" }}>
              {restaurant.rating?.toFixed(1) || "4.5"}
            </Text>
          </View>
        </View>

        <View style={{ position: "absolute", bottom: 16, left: 16, right: 16 }}>
          <Text style={{ color: "#FFF", fontSize: 24, fontWeight: "900", textTransform: "uppercase", fontStyle: "italic" }}>
            {restaurant.name}
          </Text>
          <Text style={{ color: "rgba(255,255,255,0.7)", fontSize: 11, fontWeight: "800", textTransform: "uppercase", letterSpacing: 1, marginTop: 4 }}>
            {restaurant.cuisine || "Restaurang"}
          </Text>
        </View>
      </View>

      <View style={{ padding: 16, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <View style={{ flexDirection: "row", gap: 16 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Ionicons name="time-outline" size={14} color={palette.gold} />
            <Text style={{ color: palette.muted, fontSize: 12, fontWeight: "800" }}>
              {Math.round(restaurant.etaMinutes || 30)} MIN
            </Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Ionicons name="bicycle-outline" size={14} color={palette.gold} />
            <Text style={{ color: palette.muted, fontSize: 12, fontWeight: "800" }}>
              {Math.round(restaurant.deliveryFee || 0)} KR
            </Text>
          </View>
        </View>
        
        <View style={{
          paddingHorizontal: 10,
          paddingVertical: 5,
          borderRadius: 8,
          backgroundColor: isOutOfZone || restaurant.isOpen === false ? "rgba(255,59,48,0.1)" : "rgba(52,199,89,0.1)",
        }}>
          <Text style={{
            color: isOutOfZone || restaurant.isOpen === false ? palette.danger : palette.success,
            fontSize: 10,
            fontWeight: "900"
          }}>
            {isOutOfZone ? "UTANFÖR ZON" : restaurant.isOpen === false ? "STÄNGD" : "ÖPPEN"}
          </Text>
        </View>
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
  const map = {
    success: { bg: "#163520", text: palette.success },
    danger: { bg: "#33151a", text: palette.danger },
    gold: { bg: "#32220b", text: palette.gold },
    info: { bg: "#132d36", text: palette.info },
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
        colors={[palette.gold, "#FFB800"]}
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
