import React, { useEffect, useRef } from "react";
import { Animated, Platform, View } from "react-native";
import { palette } from "../constants/theme";

/**
 * A single shimmer bone for skeleton loading.
 */
function Bone({ width, height, style }: { width?: number | string; height: number; style?: any }) {
  const shimmer = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, {
          toValue: 1,
          duration: 900,
          useNativeDriver: Platform.OS !== "web",
        }),
        Animated.timing(shimmer, {
          toValue: 0,
          duration: 900,
          useNativeDriver: Platform.OS !== "web",
        }),
      ])
    ).start();
  }, [shimmer]);

  const opacity = shimmer.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0.5] });

  return (
    <Animated.View
      style={[
        {
          width: width ?? "100%",
          height,
          borderRadius: height / 2,
          backgroundColor: palette.border,
          opacity,
        },
        style,
      ]}
    />
  );
}

/** Skeleton for a RestaurantCard */
export function RestaurantCardSkeleton() {
  return (
    <View
      style={{
        backgroundColor: palette.panel,
        borderRadius: 36,
        padding: 14,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: palette.border,
        gap: 12,
      }}
    >
      <Bone height={230} style={{ borderRadius: 28 }} />
      <Bone width="60%" height={20} />
      <Bone width="40%" height={14} />
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Bone width="30%" height={34} style={{ borderRadius: 20 }} />
        <Bone width="30%" height={34} style={{ borderRadius: 20 }} />
        <Bone width="30%" height={34} style={{ borderRadius: 20 }} />
      </View>
    </View>
  );
}

/** Skeleton list for HomeScreen / DiscoverScreen */
export function RestaurantListSkeleton({ count = 3 }: { count?: number }) {
  return (
    <View style={{ gap: 0 }}>
      {Array.from({ length: count }).map((_, i) => (
        <RestaurantCardSkeleton key={i} />
      ))}
    </View>
  );
}

/** Skeleton for the HomeScreen header area */
export function HomeScreenSkeleton() {
  return (
    <View style={{ paddingHorizontal: 20, paddingTop: 16, gap: 18 }}>
      {/* Title */}
      <Bone width="70%" height={44} style={{ borderRadius: 8 }} />
      <Bone width="50%" height={44} style={{ borderRadius: 8 }} />

      {/* Toggle */}
      <Bone height={52} style={{ borderRadius: 26 }} />

      {/* Address input */}
      <Bone height={58} style={{ borderRadius: 20 }} />

      {/* Deal cards */}
      <View style={{ flexDirection: "row", gap: 12 }}>
        <Bone width={220} height={120} style={{ borderRadius: 20 }} />
        <Bone width={220} height={120} style={{ borderRadius: 20 }} />
      </View>

      <RestaurantListSkeleton count={2} />
    </View>
  );
}

/** Skeleton for RestaurantScreen (menu loading) */
export function RestaurantScreenSkeleton() {
  return (
    <View style={{ paddingHorizontal: 16, paddingTop: 16, gap: 16 }}>
      {/* Hero */}
      <Bone height={420} style={{ borderRadius: 0, marginHorizontal: -16 }} />
      {/* Stats row */}
      <View style={{ flexDirection: "row", gap: 10 }}>
        <Bone height={80} style={{ flex: 1, borderRadius: 22 }} />
        <Bone height={80} style={{ flex: 1, borderRadius: 22 }} />
        <Bone height={80} style={{ flex: 1, borderRadius: 22 }} />
      </View>
      {/* Category rail */}
      <Bone height={48} style={{ borderRadius: 24 }} />
      {/* Menu items */}
      {[1, 2, 3, 4].map((i) => (
        <View
          key={i}
          style={{
            backgroundColor: palette.panel,
            borderRadius: 22,
            padding: 14,
            flexDirection: "row",
            gap: 14,
            borderWidth: 1,
            borderColor: palette.border,
          }}
        >
          <Bone width={90} height={90} style={{ borderRadius: 18 }} />
          <View style={{ flex: 1, gap: 8 }}>
            <Bone width="70%" height={16} />
            <Bone width="90%" height={11} />
            <Bone width="40%" height={11} />
          </View>
        </View>
      ))}
    </View>
  );
}

/** Generic full-page spinner skeleton */
export function PageSkeleton() {
  return (
    <View style={{ flex: 1, padding: 20, gap: 16 }}>
      <Bone height={32} width="50%" />
      <Bone height={16} width="30%" />
      {[1, 2, 3].map((i) => (
        <Bone key={i} height={80} style={{ borderRadius: 20 }} />
      ))}
    </View>
  );
}
