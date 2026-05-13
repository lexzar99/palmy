import React, { useEffect, useRef } from "react";
import { Animated, Platform, View } from "react-native";
import { styles } from "../constants/theme";
import { useTheme } from "../theme";

/**
 * A single shimmer bone for skeleton loading.
 */
function Bone({ width, height, style }: { width?: number | string; height: number; style?: any }) {
  const { palette } = useTheme();
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

  const opacity = shimmer.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0.92] });

  return (
    <Animated.View
      style={[
        {
          width: width ?? "100%",
          height,
          borderRadius: height / 2,
          backgroundColor: palette.skeletonBase,
          opacity,
        },
        style,
      ]}
    />
  );
}

function SurfaceCard({ children, style }: { children: React.ReactNode; style?: any }) {
  const { palette } = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: palette.panel,
          borderRadius: 28,
          borderWidth: 1,
          borderColor: palette.border,
          padding: 18,
          gap: 12,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

/** Skeleton for a RestaurantCard */
export function RestaurantCardSkeleton() {
  const { palette } = useTheme();
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
export function RestaurantScreenSkeleton({ heroTopInset = 18 }: { heroTopInset?: number }) {
  const { palette } = useTheme();
  return (
    <View style={{ gap: 12 }}>
      <View style={[styles.restaurantHeroWrap, { paddingTop: heroTopInset }]}> 
        <View style={[styles.restaurantHeroCardPremium, { minHeight: 244 }]}> 
          <Bone
            height={244}
            style={{ position: "absolute", top: 0, left: 0, right: 0, borderRadius: 34 }}
          />
          <View style={styles.restaurantHeroTopBar}>
            <Bone width={102} height={36} style={{ borderRadius: 16, backgroundColor: palette.skeletonHighlight }} />
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Bone width={66} height={36} style={{ borderRadius: 16, backgroundColor: palette.skeletonHighlight }} />
              <Bone width={88} height={36} style={{ borderRadius: 16, backgroundColor: palette.skeletonHighlight }} />
            </View>
          </View>
          <View style={styles.restaurantHeroContentPremium}>
            <Bone width={96} height={22} style={{ borderRadius: 999 }} />
            <Bone width="66%" height={30} style={{ borderRadius: 12, backgroundColor: palette.skeletonHighlight }} />
            <Bone width="40%" height={12} style={{ borderRadius: 8 }} />
          </View>
        </View>
      </View>

      <View style={styles.restaurantQuickStatsRow}>
        {[1, 2, 3].map((i) => (
          <Bone key={i} height={58} style={{ flex: 1, borderRadius: 18 }} />
        ))}
      </View>

      <View style={styles.restaurantStickyNavWrap}>
        <View style={styles.restaurantStickyNavCard}>
          <Bone height={42} style={{ borderRadius: 20, backgroundColor: palette.skeletonHighlight }} />
          <View style={{ flexDirection: "row", gap: 8 }}>
            {[1, 2, 3].map((i) => (
              <Bone key={i} width={80} height={36} style={{ borderRadius: 18 }} />
            ))}
          </View>
        </View>
      </View>

      <View style={styles.restaurantMenuSectionsWrap}>
        <View style={styles.restaurantMenuSection}>
          <View style={styles.restaurantMenuSectionHeader}>
            <Bone width="42%" height={28} style={{ borderRadius: 10 }} />
            <Bone height={1} style={{ flex: 1, borderRadius: 1 }} />
          </View>
          {[1, 2, 3, 4].map((i) => (
            <View key={i} style={styles.restaurantMenuProductCard}>
              <Bone width={98} height={98} style={{ borderRadius: 24 }} />
              <View style={{ flex: 1, gap: 8 }}>
                <Bone width="74%" height={16} />
                <Bone width="92%" height={11} />
                <Bone width="38%" height={11} />
              </View>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

/** Generic full-page spinner skeleton */
export function PageSkeleton() {
  return (
    <View style={{ flex: 1, gap: 16 }}>
      <Bone height={32} width="50%" />
      <Bone height={16} width="30%" />
      {[1, 2, 3].map((i) => (
        <Bone key={i} height={80} style={{ borderRadius: 20 }} />
      ))}
    </View>
  );
}

export function DiscoverScreenSkeleton() {
  return (
    <View style={{ gap: 18 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
        <View style={{ flex: 1, gap: 8 }}>
          <Bone width="56%" height={34} style={{ borderRadius: 10 }} />
          <Bone width="34%" height={12} style={{ borderRadius: 6 }} />
        </View>
        <Bone width={58} height={58} style={{ borderRadius: 20 }} />
      </View>

      <Bone height={58} style={{ borderRadius: 30 }} />

      <View style={{ flexDirection: "row", gap: 14 }}>
        {[1, 2, 3].map((i) => (
          <Bone key={i} width={100} height={120} style={{ borderRadius: 24 }} />
        ))}
      </View>

      <RestaurantListSkeleton count={3} />
    </View>
  );
}

export function SearchScreenSkeleton() {
  return (
    <View style={{ gap: 18 }}>
      <View style={{ gap: 8 }}>
        <Bone width="34%" height={28} style={{ borderRadius: 10 }} />
        <Bone width="48%" height={14} style={{ borderRadius: 6 }} />
      </View>

      <Bone height={58} style={{ borderRadius: 30 }} />

      <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: 14 }}>
        {[1, 2, 3, 4].map((i) => (
          <Bone key={i} width="47%" height={136} style={{ borderRadius: 22 }} />
        ))}
      </View>
    </View>
  );
}

export function ProfileScreenSkeleton() {
  return (
    <View style={{ gap: 14 }}>
      <SurfaceCard style={{ borderRadius: 34, gap: 18 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
          <Bone width={58} height={58} style={{ borderRadius: 20 }} />
          <View style={{ flex: 1, gap: 8 }}>
            <Bone width="54%" height={20} />
            <Bone width="40%" height={12} />
            <Bone width="28%" height={10} />
          </View>
        </View>
      </SurfaceCard>

      <SurfaceCard style={{ borderRadius: 24, padding: 6 }}>
        <View style={{ flexDirection: "row", gap: 8 }}>
          {[1, 2, 3, 4, 5].map((i) => (
            <Bone key={i} height={52} style={{ flex: 1, borderRadius: 18 }} />
          ))}
        </View>
      </SurfaceCard>

      <SurfaceCard>
        <Bone width="42%" height={18} />
        <Bone width="100%" height={14} />
        <Bone width="72%" height={14} />
        <Bone width="86%" height={14} />
      </SurfaceCard>

      <SurfaceCard>
        <Bone width="38%" height={18} />
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Bone key={i} width={88} height={34} style={{ borderRadius: 14 }} />
          ))}
        </View>
      </SurfaceCard>
    </View>
  );
}

export function CartScreenSkeleton() {
  return (
    <View style={{ gap: 16 }}>
      {[1, 2].map((i) => (
        <SurfaceCard key={i} style={{ borderRadius: 22, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <View style={{ flex: 1, gap: 8 }}>
            <Bone width="62%" height={16} />
            <Bone width="44%" height={10} />
          </View>
          <Bone width={92} height={38} style={{ borderRadius: 999 }} />
        </SurfaceCard>
      ))}

      <View style={{ flexDirection: "row", gap: 10 }}>
        <Bone height={54} style={{ flex: 1, borderRadius: 22 }} />
        <Bone height={54} style={{ flex: 1, borderRadius: 22 }} />
      </View>

      <SurfaceCard>
        <Bone width="34%" height={12} />
        <Bone height={54} style={{ borderRadius: 18 }} />
        <Bone height={54} style={{ borderRadius: 18 }} />
      </SurfaceCard>

      <SurfaceCard>
        <Bone width="40%" height={12} />
        <Bone height={58} style={{ borderRadius: 18 }} />
        <Bone width="70%" height={14} />
      </SurfaceCard>

      <SurfaceCard style={{ backgroundColor: "transparent", borderWidth: 0, paddingHorizontal: 4 }}>
        <Bone width="28%" height={12} />
        <Bone width="100%" height={14} />
        <Bone width="100%" height={14} />
        <Bone height={58} style={{ borderRadius: 22, marginTop: 8 }} />
      </SurfaceCard>
    </View>
  );
}

export function OrderScreenSkeleton() {
  return (
    <View style={{ gap: 20 }}>
      <View style={{ gap: 10 }}>
        <Bone width="26%" height={12} />
        <Bone width="58%" height={36} style={{ borderRadius: 10 }} />
        <Bone width="42%" height={12} />
      </View>

      <SurfaceCard style={{ borderRadius: 32, alignItems: "center", paddingVertical: 28 }}>
        <Bone width={80} height={80} style={{ borderRadius: 40 }} />
        <Bone width="40%" height={18} />
        <Bone width="72%" height={12} />
      </SurfaceCard>

      <View style={{ flexDirection: "row", gap: 12 }}>
        {[1, 2, 3, 4].map((i) => (
          <View key={i} style={{ flex: 1, alignItems: "center", gap: 8 }}>
            <Bone width={30} height={30} style={{ borderRadius: 15 }} />
            <Bone width="70%" height={8} />
          </View>
        ))}
      </View>

      <SurfaceCard style={{ borderRadius: 32 }}>
        <Bone width="44%" height={18} />
        {[1, 2, 3].map((i) => (
          <View key={i} style={{ flexDirection: "row", justifyContent: "space-between", gap: 14 }}>
            <View style={{ flex: 1, gap: 8 }}>
              <Bone width="48%" height={14} />
              <Bone width="76%" height={10} />
            </View>
            <Bone width={52} height={12} />
          </View>
        ))}
      </SurfaceCard>
    </View>
  );
}
