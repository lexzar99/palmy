import React, { useState, useEffect, useRef, useMemo } from 'react';
import { View, Text, Pressable, Animated, Alert, Easing } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAppStore } from '../store/useAppStore';
import { palette } from '../constants/theme';
import type { Order } from '../types';

// ─── Status helper ─────────────────────────────────────────────────────────────
function getStatusDisplay(status: string) {
  switch (status) {
    case "PENDING":
      return { label: "GRANSKAS", icon: "time", color: "#B45309", bgColor: "rgba(245,158,11,0.16)", baseProgress: 10 };
    case "ACCEPTED":
      return { label: "BEKRÄFTAD", icon: "checkmark-circle", color: palette.goldDark, bgColor: "rgba(217,176,85,0.16)", baseProgress: 28 };
    case "PREPARING":
      return { label: "TILLAGAS", icon: "flame", color: "#EA580C", bgColor: "rgba(249,115,22,0.16)", baseProgress: 42 };
    case "READY":
      return { label: "REDO ATT HÄMTAS", icon: "checkmark-circle", color: "#0284C7", bgColor: "rgba(14,165,233,0.15)", baseProgress: 85 };
    case "OUT_FOR_DELIVERY":
    case "DELIVERING":
      return { label: "PÅ VÄG!", icon: "bicycle", color: "#059669", bgColor: "rgba(16,185,129,0.15)", baseProgress: 72 };
    case "DELIVERED":
    case "COMPLETED":
      return { label: "LEVERERAD", icon: "checkmark-done", color: "#059669", bgColor: "rgba(16,185,129,0.15)", baseProgress: 100 };
    default:
      return { label: "AKTIV", icon: "flash", color: palette.goldDark, bgColor: "rgba(217,176,85,0.16)", baseProgress: 5 };
  }
}

function getDynamicETA(order: Order) {
  const currentType = order.orderType || (order as any).type;
  if (order.status === "DELIVERED" || order.status === "COMPLETED") return "Klar! 🎉";
  if (currentType === "PICKUP") {
    if (order.status === "READY") return "Hämta nu! 🙌";
    if ((order as any).scheduledFor) {
      return new Date((order as any).scheduledFor).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" });
    }
    return "ca 10m";
  }
  if (order.status === "OUT_FOR_DELIVERY" || order.status === "DELIVERING") {
    // Backend etaEndsAt is the source of truth; the client-side rush
    // heuristic was wrong for restaurants in different time zones.
    const endsAt = (order as any).etaEndsAt;
    if (endsAt) {
      const ms = new Date(endsAt).getTime() - Date.now();
      if (ms <= 0) return "snart";
      const mins = Math.max(1, Math.round(ms / 60000));
      return `${mins}m`;
    }
    return "snart";
  }
  if ((order as any).scheduledFor) {
    return new Date((order as any).scheduledFor).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" });
  }
  return order.estimatedTime ? `${order.estimatedTime}m` : "Snart";
}

// ─── Tip carousel content ─────────────────────────────────────────────────────
const TIPS = [
  { text: "Tipsa en vän och få 50 kr! 🎁", action: "DEAL", icon: "gift-outline" as const },
  { text: "Bra mat är alltid värd att vänta på 👨‍🍳", action: "NONE", icon: "restaurant-outline" as const },
  { text: "Snart framme! Dukning rekommenderas 🍽️", action: "NONE", icon: "wine-outline" as const },
  { text: "Spana in våra aktuella deals 💸", action: "DEAL", icon: "pricetag-outline" as const },
];

// ─── Component ────────────────────────────────────────────────────────────────
export default function LiveOrderBanner({
  id,
  openOrder,
  onDismiss,
}: {
  id: string;
  openOrder: (id: string) => void;
  onDismiss: () => void;
}) {
  // Order data is owned by `useOrderActivitySync` (mounted at App level) and
  // pushed into the store. The banner is purely presentational so we don't
  // double up on socket connections, polls, or auto-dismiss timers.
  const order = useAppStore((s) => s.activeOrder);

  // ── Animated values ─────────────────────────────────────────────────────────
  // Entrance: spring up + scale + fade
  const entranceTranslate = useRef(new Animated.Value(40)).current;
  const entranceScale = useRef(new Animated.Value(0.92)).current;
  const entranceOpacity = useRef(new Animated.Value(0)).current;

  // Exit: slide down + fade
  const exitProgress = useRef(new Animated.Value(0)).current;
  const [isExiting, setIsExiting] = useState(false);

  // Status colour crossfade — interpolated between previous and current colours
  const statusBlend = useRef(new Animated.Value(1)).current;
  const [colorPair, setColorPair] = useState<{ prev: ReturnType<typeof getStatusDisplay>; next: ReturnType<typeof getStatusDisplay> } | null>(null);

  // Progress bar
  const progressAnim = useRef(new Animated.Value(0)).current;
  const shimmerAnim = useRef(new Animated.Value(0)).current;

  // Status icon morph (scale + rotate + opacity on swap)
  const iconScale = useRef(new Animated.Value(1)).current;
  const iconRotate = useRef(new Animated.Value(0)).current;
  const [renderedIcon, setRenderedIcon] = useState<string>("flash");

  // ETA pill micro-bounce
  const etaScale = useRef(new Animated.Value(1)).current;
  const lastEtaText = useRef<string | null>(null);

  // Tip carousel
  const [tipIndex, setTipIndex] = useState(0);
  const tipFade = useRef(new Animated.Value(1)).current;
  const tipSlide = useRef(new Animated.Value(0)).current;

  // Cancellation X-press feedback
  const closeScale = useRef(new Animated.Value(1)).current;

  // Track previous status so we can detect changes for crossfades / morphs.
  const lastStatus = useRef<string | null>(null);

  // ── Entrance animation (mount) ──────────────────────────────────────────────
  useEffect(() => {
    Animated.parallel([
      Animated.spring(entranceTranslate, {
        toValue: 0,
        tension: 60,
        friction: 9,
        useNativeDriver: true,
      }),
      Animated.spring(entranceScale, {
        toValue: 1,
        tension: 70,
        friction: 8,
        useNativeDriver: true,
      }),
      Animated.timing(entranceOpacity, {
        toValue: 1,
        duration: 380,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start();
  }, [entranceTranslate, entranceScale, entranceOpacity]);

  // ── Status change side-effects: crossfade colour, morph icon, animate progress
  useEffect(() => {
    if (!order) return;
    const display = getStatusDisplay(order.status);

    if (lastStatus.current === null) {
      // First render — snap, don't animate.
      progressAnim.setValue(display.baseProgress);
      setRenderedIcon(display.icon as string);
      lastStatus.current = order.status;
      return;
    }

    if (lastStatus.current !== order.status) {
      const prev = getStatusDisplay(lastStatus.current);

      // Colour crossfade
      setColorPair({ prev, next: display });
      statusBlend.setValue(0);
      Animated.timing(statusBlend, {
        toValue: 1,
        duration: 600,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: false, // colour interpolation can't run on native driver
      }).start(() => {
        setColorPair(null);
      });

      // Icon morph: shrink → swap → spring back with rotate
      Animated.sequence([
        Animated.parallel([
          Animated.timing(iconScale, {
            toValue: 0,
            duration: 180,
            easing: Easing.in(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(iconRotate, {
            toValue: 1,
            duration: 180,
            easing: Easing.in(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
      ]).start(() => {
        setRenderedIcon(display.icon as string);
        iconRotate.setValue(-1);
        Animated.parallel([
          Animated.spring(iconScale, {
            toValue: 1,
            tension: 90,
            friction: 6,
            useNativeDriver: true,
          }),
          Animated.spring(iconRotate, {
            toValue: 0,
            tension: 80,
            friction: 7,
            useNativeDriver: true,
          }),
        ]).start();
      });

      // Progress bar
      Animated.spring(progressAnim, {
        toValue: display.baseProgress,
        friction: 8,
        tension: 30,
        useNativeDriver: false,
      }).start();

      lastStatus.current = order.status;
    }
  }, [order?.status, progressAnim, iconScale, iconRotate, statusBlend, order]);

  // ── Slow progress creep within the active band ──────────────────────────────
  useEffect(() => {
    if (!order) return;
    const display = getStatusDisplay(order.status);
    const targetMax = Math.min(display.baseProgress + 22, 96);

    const creepTimer = setInterval(() => {
      progressAnim.stopAnimation((current) => {
        if (current < targetMax) {
          Animated.timing(progressAnim, {
            toValue: Math.min(current + 0.4, targetMax),
            duration: 800,
            useNativeDriver: false,
          }).start();
        }
      });
    }, 2000);

    return () => clearInterval(creepTimer);
  }, [order?.status, progressAnim]);

  // ── Shimmer sweep on the progress bar ───────────────────────────────────────
  useEffect(() => {
    Animated.loop(
      Animated.timing(shimmerAnim, {
        toValue: 1,
        duration: 1800,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    ).start();
  }, [shimmerAnim]);

  // ── ETA pill micro-bounce when the value changes ────────────────────────────
  useEffect(() => {
    if (!order) return;
    const eta = getDynamicETA(order);
    if (lastEtaText.current && lastEtaText.current !== eta) {
      Animated.sequence([
        Animated.timing(etaScale, {
          toValue: 1.18,
          duration: 130,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.spring(etaScale, {
          toValue: 1,
          tension: 100,
          friction: 6,
          useNativeDriver: true,
        }),
      ]).start();
    }
    lastEtaText.current = eta;
  }, [order, etaScale]);

  // ── Tip carousel: slide + fade ──────────────────────────────────────────────
  useEffect(() => {
    const iv = setInterval(() => {
      Animated.parallel([
        Animated.timing(tipFade, { toValue: 0, duration: 280, useNativeDriver: true }),
        Animated.timing(tipSlide, { toValue: -16, duration: 280, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      ]).start(() => {
        setTipIndex((p) => (p + 1) % TIPS.length);
        tipSlide.setValue(16);
        Animated.parallel([
          Animated.timing(tipFade, { toValue: 1, duration: 320, useNativeDriver: true }),
          Animated.spring(tipSlide, { toValue: 0, tension: 80, friction: 10, useNativeDriver: true }),
        ]).start();
      });
    }, 6000);
    return () => clearInterval(iv);
  }, [tipFade, tipSlide]);

  // ── Exit animation runner (X-press) ─────────────────────────────────────────
  const runExit = (then: () => void) => {
    setIsExiting(true);
    Animated.parallel([
      Animated.timing(exitProgress, {
        toValue: 1,
        duration: 280,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(() => then());
  };

  const handleClose = () => {
    Animated.sequence([
      Animated.timing(closeScale, {
        toValue: 0.82,
        duration: 80,
        useNativeDriver: true,
      }),
      Animated.spring(closeScale, {
        toValue: 1,
        tension: 200,
        friction: 5,
        useNativeDriver: true,
      }),
    ]).start();
    runExit(() => onDismiss());
  };

  // ── Derived values + memoised AnimatedNodes (must run BEFORE any
  // conditional return — Rules of Hooks). Recreating these on every render
  // also rebuilds the native AnimatedNode graph, which can briefly leak NaN
  // values through to UIKit and crash the view tree.
  const safeStatus = order?.status ?? "PENDING";
  const display = getStatusDisplay(safeStatus);
  const accentColor: string = display.color;

  const { containerTransform, containerOpacity } = useMemo(() => {
    const exitTranslate = exitProgress.interpolate({ inputRange: [0, 1], outputRange: [0, 80] });
    const exitScale = exitProgress.interpolate({ inputRange: [0, 1], outputRange: [1, 0.94] });
    const exitOpacity = exitProgress.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });
    return {
      containerTransform: [
        { translateY: Animated.add(entranceTranslate, exitTranslate) },
        { scale: Animated.multiply(entranceScale, exitScale) },
      ],
      containerOpacity: Animated.multiply(entranceOpacity, exitOpacity),
    };
  }, [entranceTranslate, entranceScale, entranceOpacity, exitProgress]);

  const shimmerTranslate = useMemo(
    () => shimmerAnim.interpolate({ inputRange: [0, 1], outputRange: [-60, 320] }),
    [shimmerAnim],
  );

  // ── Guards ──────────────────────────────────────────────────────────────────
  // Render nothing until the global sync hook has populated the snapshot
  // for *this* order. Without the id check we'd briefly show a stale order
  // when the user places a second one back-to-back.
  if (!order || (order.id != null && String(order.id) !== String(id))) return null;
  // Mirror the LA: once the order hits a terminal state we hide instantly
  // (the parent will unmount us via setActiveOrder(null)). The `isExiting`
  // path only handles user-initiated dismissal.
  const finished = ["DELIVERED", "COMPLETED", "REJECTED", "CANCELLED"].includes(order.status);
  if (finished && !isExiting) return null;

  const currentTip = TIPS[tipIndex];

  const handleTipPress = () => {
    if (currentTip.action === "DEAL") {
      Alert.alert("Deals 🎉", "Bjud in vänner och tjäna 50 kr per värvning!");
    } else {
      openOrder(id);
    }
  };

  return (
    <Animated.View
      style={{
        position: "absolute",
        bottom: 115,
        left: 14,
        right: 14,
        borderRadius: 28,
        overflow: "hidden",
        backgroundColor: palette.panel,
        borderWidth: 1,
        borderColor: "rgba(125,97,38,0.14)",
        shadowColor: display.color,
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.14,
        shadowRadius: 18,
        elevation: 10,
        opacity: containerOpacity,
        transform: containerTransform,
      }}
    >
      <LinearGradient
        colors={[display.bgColor, "rgba(255,248,239,0.98)", "rgba(255,255,255,0.98)"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ padding: 16 }}
      >
        {/* ── Main row ── */}
        <Pressable
          onPress={() => openOrder(id)}
          style={{ flexDirection: "row", alignItems: "center", gap: 14 }}
        >
          {/* Status icon */}
          <Animated.View
            style={{
              width: 50,
              height: 50,
              borderRadius: 18,
              backgroundColor: "rgba(255,255,255,0.82)",
              alignItems: "center",
              justifyContent: "center",
              borderWidth: 1,
              borderColor: "rgba(125,97,38,0.12)",
              transform: [
                { scale: iconScale },
                {
                  rotate: iconRotate.interpolate({
                    inputRange: [-1, 0, 1],
                    outputRange: ["-15deg", "0deg", "15deg"],
                  }),
                },
              ],
            }}
          >
            <Ionicons name={renderedIcon as any} size={22} color={accentColor} />
          </Animated.View>

          {/* Centre — text + progress */}
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 2 }}>
              {/* Live pulse dot — opacity pulse + radial wave */}
              <LiveDot color={display.color} />
              <Text style={{ color: accentColor, fontSize: 10, fontWeight: "900", letterSpacing: 1.8 }}>
                {display.label}
              </Text>
              <View style={{ width: 3, height: 3, borderRadius: 2, backgroundColor: "rgba(33,22,15,0.18)" }} />
              <Text style={{ color: palette.muted, fontSize: 10, fontWeight: "700" }}>
                #{order.orderNumber?.slice(-4) || "..."}
              </Text>
            </View>

            <Text
              numberOfLines={1}
              style={{ color: palette.text, fontSize: 15, fontWeight: "900", letterSpacing: -0.3 }}
            >
              {order.restaurantName || "Din beställning"}
            </Text>

            {/* Animated progress bar w/ shimmer */}
            <View
              style={{
                height: 5,
                backgroundColor: "rgba(33,22,15,0.08)",
                borderRadius: 3,
                marginTop: 10,
                overflow: "hidden",
                width: "92%",
              }}
            >
              <Animated.View
                style={{
                  height: "100%",
                  borderRadius: 3,
                  backgroundColor: accentColor,
                  width: progressAnim.interpolate({
                    inputRange: [0, 100],
                    outputRange: ["0%", "100%"],
                  }),
                  shadowColor: display.color,
                  shadowOffset: { width: 0, height: 0 },
                  shadowRadius: 6,
                  shadowOpacity: 0.8,
                }}
              />
              {/* Shimmer overlay sweeping left→right */}
              <Animated.View
                pointerEvents="none"
                style={{
                  position: "absolute",
                  top: 0,
                  bottom: 0,
                  left: 0,
                  width: 60,
                  transform: [{ translateX: shimmerTranslate }],
                }}
              >
                <LinearGradient
                  colors={["rgba(255,255,255,0)", "rgba(255,255,255,0.6)", "rgba(255,255,255,0)"]}
                  start={{ x: 0, y: 0.5 }}
                  end={{ x: 1, y: 0.5 }}
                  style={{ flex: 1 }}
                />
              </Animated.View>
            </View>
          </View>

          {/* Right column — ETA + close */}
          <View style={{ alignItems: "flex-end", gap: 8 }}>
            <Animated.View
              style={{
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: 14,
                backgroundColor: "rgba(255,255,255,0.86)",
                borderWidth: 1,
                borderColor: "rgba(125,97,38,0.12)",
                flexDirection: "row",
                alignItems: "center",
                gap: 4,
                transform: [{ scale: etaScale }],
              }}
            >
              <Ionicons name="time-outline" size={12} color={palette.goldDark} />
              <Text style={{ color: palette.text, fontSize: 12, fontWeight: "900", fontStyle: "italic" }}>
                {getDynamicETA(order)}
              </Text>
            </Animated.View>

            <Animated.View style={{ transform: [{ scale: closeScale }] }}>
              <Pressable
                onPress={handleClose}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 14,
                  backgroundColor: palette.panelMuted,
                  alignItems: "center",
                  justifyContent: "center",
                }}
                hitSlop={10}
              >
                <Ionicons name="close" size={14} color={palette.muted} />
              </Pressable>
            </Animated.View>
          </View>
        </Pressable>

        {/* ── Tip carousel ── */}
        <Pressable
          onPress={handleTipPress}
          style={{
            marginTop: 14,
            paddingTop: 14,
            borderTopWidth: 1,
            borderTopColor: "rgba(125,97,38,0.12)",
            flexDirection: "row",
            alignItems: "center",
          }}
        >
          <Animated.View
            style={{
              flex: 1,
              flexDirection: "row",
              alignItems: "center",
              opacity: tipFade,
              transform: [{ translateX: tipSlide }],
              gap: 8,
            }}
          >
            <View
              style={{
                width: 24,
                height: 24,
                borderRadius: 12,
                backgroundColor: "rgba(217,176,85,0.16)",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons name={currentTip.icon} size={12} color={palette.gold} />
            </View>
            <Text style={{ color: palette.text, fontSize: 12, fontWeight: "600", flex: 1 }} numberOfLines={1}>
              {currentTip.text}
            </Text>
            {currentTip.action !== "NONE" && (
              <Ionicons name="chevron-forward" size={14} color={palette.gold} />
            )}
          </Animated.View>
        </Pressable>
      </LinearGradient>
    </Animated.View>
  );
}

// ─── Pulsing live indicator with expanding ring ───────────────────────────────
function LiveDot({ color }: { color: string }) {
  const pulseScale = useRef(new Animated.Value(1)).current;
  const pulseOpacity = useRef(new Animated.Value(1)).current;
  const ringScale = useRef(new Animated.Value(0.4)).current;
  const ringOpacity = useRef(new Animated.Value(0.6)).current;

  useEffect(() => {
    Animated.loop(
      Animated.parallel([
        // Outer ring: expands and fades out
        Animated.sequence([
          Animated.parallel([
            Animated.timing(ringScale, { toValue: 2.6, duration: 1200, easing: Easing.out(Easing.quad), useNativeDriver: true }),
            Animated.timing(ringOpacity, { toValue: 0, duration: 1200, easing: Easing.out(Easing.quad), useNativeDriver: true }),
          ]),
          Animated.parallel([
            Animated.timing(ringScale, { toValue: 0.4, duration: 0, useNativeDriver: true }),
            Animated.timing(ringOpacity, { toValue: 0.6, duration: 0, useNativeDriver: true }),
          ]),
        ]),
        // Inner dot: gentle breath
        Animated.sequence([
          Animated.timing(pulseScale, { toValue: 1.4, duration: 600, useNativeDriver: true }),
          Animated.timing(pulseOpacity, { toValue: 0.55, duration: 600, useNativeDriver: true }),
          Animated.timing(pulseScale, { toValue: 1, duration: 600, useNativeDriver: true }),
          Animated.timing(pulseOpacity, { toValue: 1, duration: 600, useNativeDriver: true }),
        ]),
      ])
    ).start();
  }, [pulseScale, pulseOpacity, ringScale, ringOpacity]);

  return (
    <View style={{ width: 14, height: 14, alignItems: "center", justifyContent: "center" }}>
      <Animated.View
        style={{
          position: "absolute",
          width: 10,
          height: 10,
          borderRadius: 5,
          borderWidth: 1.5,
          borderColor: color,
          transform: [{ scale: ringScale }],
          opacity: ringOpacity,
        }}
      />
      <Animated.View
        style={{
          width: 6,
          height: 6,
          borderRadius: 3,
          backgroundColor: color,
          transform: [{ scale: pulseScale }],
          opacity: pulseOpacity,
        }}
      />
    </View>
  );
}
