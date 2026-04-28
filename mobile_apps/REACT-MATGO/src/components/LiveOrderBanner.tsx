import React, { useState, useEffect, useRef } from 'react';
import { View, Text, Pressable, Animated, Alert, AppState } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAppStore } from '../store/useAppStore';
import { api, SOCKET_URL } from '../lib/api';
import * as Notifications from 'expo-notifications';
import { updateOrderActivity, endOrderActivity, mapServerStatusToActivity } from '../lib/liveActivities';
import { io } from 'socket.io-client';
import { palette } from '../constants/theme';
import type { Order } from '../types';

// ─── Status helper (defined BEFORE component to avoid hoisting issue) ──────────
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
    default:
      return { label: "AKTIV", icon: "flash", color: palette.goldDark, bgColor: "rgba(217,176,85,0.16)", baseProgress: 5 };
  }
}

function getDynamicETA(order: Order) {
  const currentType = order.orderType || order.type;
  if (currentType === "PICKUP") {
    if (order.status === "READY") return "Hämta nu! 🙌";
    if (order.scheduledFor) {
      return new Date(order.scheduledFor).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" });
    }
    return "ca 10m";
  }
  if (order.status === "OUT_FOR_DELIVERY" || order.status === "DELIVERING") {
    const hour = new Date().getHours();
    const isRush = hour >= 18 && hour <= 20;
    if (isRush) return "20-30m";
    return "10-15m";
  }
  if (order.scheduledFor) {
    return new Date(order.scheduledFor).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" });
  }
  return order.estimatedTime ? `${order.estimatedTime}m` : "Snart";
}

// ─── Rotating tip carousel ─────────────────────────────────────────────────────
const TIPS = [
  { text: "Tipsa en vän och få 50 kr! 🎁", action: "DEAL", icon: "gift-outline" as const },
  { text: "Bra mat är alltid värd att vänta på 👨‍🍳", action: "NONE", icon: "restaurant-outline" as const },
  { text: "Snart framme! Dukning rekommenderas 🍽️", action: "NONE", icon: "wine-outline" as const },
  { text: "Spana in våra aktuella deals 💸", action: "DEAL", icon: "pricetag-outline" as const },
];

// ─── Component ─────────────────────────────────────────────────────────────────
export default function LiveOrderBanner({
  id,
  openOrder,
  onDismiss,
}: {
  id: string;
  openOrder: (id: string) => void;
  onDismiss: () => void;
}) {
  const [order, setOrder] = useState<Order | null>(null);
  const lastStatus = useRef<string | null>(null);
  const setActiveOrder = useAppStore((s) => s.setActiveOrder);

  // Carousel
  const [tipIndex, setTipIndex] = useState(0);
  const fadeAnim = useRef(new Animated.Value(1)).current;

  // Progress bar — animated separately from status
  const progressAnim = useRef(new Animated.Value(0)).current;

  // ── Fetch + socket ────────────────────────────────────────────────────────────
  useEffect(() => {
    const fetchOrder = async () => {
      try {
        const res = await api.get(`/api/orders/${id}`);
        const data: Order = res.data;
        setOrder(data);

        const orderType = (data.orderType || (data as any).type) as
          | "DELIVERY"
          | "PICKUP"
          | undefined;

        if (lastStatus.current !== data.status) {
          const display = getStatusDisplay(data.status);
          const mapped = mapServerStatusToActivity(data.status, orderType);

          // Only fire notification when this is a *change*, not the first fetch
          if (lastStatus.current) {
            Notifications.scheduleNotificationAsync({
              content: {
                title: "Statusuppdatering 🍔",
                body: `Din beställning hos ${data.restaurantName || "restaurangen"} är nu: ${display.label}`,
                data: { orderId: id },
              },
              trigger: null,
            });
          }

          // Always sync the LiveActivity to the current server status, including
          // the very first fetch — covers the case where status moved past
          // "accepted" while the app was in the background.
          if (mapped && !mapped.ends) {
            updateOrderActivity(id, mapped.status, { etaMinutes: data.estimatedTime });
          }

          // Animate progress to new base (but only after first fetch initialised it)
          if (lastStatus.current) {
            Animated.spring(progressAnim, {
              toValue: display.baseProgress,
              friction: 8,
              tension: 30,
              useNativeDriver: false,
            }).start();
          } else {
            progressAnim.setValue(display.baseProgress);
          }
        }

        lastStatus.current = data.status;

        const mappedFinal = mapServerStatusToActivity(data.status, orderType);
        if (mappedFinal?.ends) {
          // Push the final state once before ending so the user sees "Levererad"
          // / "Avbruten" briefly in the Dynamic Island before it dismisses.
          updateOrderActivity(id, mappedFinal.status, { etaMinutes: data.estimatedTime });
          endOrderActivity(id);
          setActiveOrder(null);
        }
      } catch {}
    };

    fetchOrder();

    // Socket for real-time updates
    const socket = io(SOCKET_URL, { path: "/socket.io", transports: ["websocket", "polling"] });
    socket.emit("join:order", id);
    socket.on("order:status", (payload: any) => {
      if (payload.orderId === id) fetchOrder();
    });

    // Polling fallback every 15s
    const pollInterval = setInterval(fetchOrder, 15000);

    // Re-fetch the moment the app returns to foreground so the LiveActivity in
    // the Dynamic Island catches up immediately instead of waiting for the next
    // 15s poll tick.
    const appStateSub = AppState.addEventListener("change", (next) => {
      if (next === "active") fetchOrder();
    });

    return () => {
      socket.disconnect();
      clearInterval(pollInterval);
      appStateSub.remove();
    };
  }, [id, setActiveOrder, progressAnim]);

  // ── Auto-transition DELIVERING → DELIVERED after 12 min ──────────────────────
  useEffect(() => {
    const deliveringAt = (order as any)?.deliveringAt;
    if (!deliveringAt || order?.status !== "DELIVERING") return;
    const deliveringTime = new Date(deliveringAt).getTime();
    const msRemaining = (deliveringTime + 12 * 60 * 1000) - Date.now();
    if (msRemaining <= 0) {
      setOrder((prev) => prev ? { ...prev, status: "DELIVERED" } : prev);
      return;
    }
    const timer = setTimeout(() => {
      setOrder((prev) => prev ? { ...prev, status: "DELIVERED" } : prev);
    }, msRemaining);
    return () => clearTimeout(timer);
  }, [(order as any)?.deliveringAt, order?.status]);

  // ── Slowly creep the progress bar forward within the current status band ──────
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

  // ── Tip carousel ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const iv = setInterval(() => {
      Animated.timing(fadeAnim, { toValue: 0, duration: 350, useNativeDriver: true }).start(() => {
        setTipIndex((p) => (p + 1) % TIPS.length);
        Animated.timing(fadeAnim, { toValue: 1, duration: 350, useNativeDriver: true }).start();
      });
    }, 6000);
    return () => clearInterval(iv);
  }, [fadeAnim]);

  // ── Guards ────────────────────────────────────────────────────────────────────
  if (!order) return null;
  const finished = ["DELIVERED", "COMPLETED", "REJECTED", "CANCELLED"].includes(order.status);
  if (finished) return null;

  const display = getStatusDisplay(order.status);
  const currentTip = TIPS[tipIndex];

  const handleTipPress = () => {
    if (currentTip.action === "DEAL") {
      Alert.alert("Deals 🎉", "Bjud in vänner och tjäna 50 kr per värvning!");
    } else {
      openOrder(id);
    }
  };

  return (
    <View
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
          <View
            style={{
              width: 50,
              height: 50,
              borderRadius: 18,
              backgroundColor: "rgba(255,255,255,0.82)",
              alignItems: "center",
              justifyContent: "center",
              borderWidth: 1,
              borderColor: "rgba(125,97,38,0.12)",
            }}
          >
            <Ionicons name={display.icon as any} size={22} color={display.color} />
          </View>

          {/* Centre — text + progress */}
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 2 }}>
              {/* Live pulse dot */}
              <LiveDot color={display.color} />
              <Text style={{ color: display.color, fontSize: 10, fontWeight: "900", letterSpacing: 1.8 }}>
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

            {/* Animated progress bar */}
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
                  backgroundColor: display.color,
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
            </View>
          </View>

          {/* Right column — ETA + close */}
          <View style={{ alignItems: "flex-end", gap: 8 }}>
            <View
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
              }}
            >
              <Ionicons name="time-outline" size={12} color={palette.goldDark} />
              <Text style={{ color: palette.text, fontSize: 12, fontWeight: "900", fontStyle: "italic" }}>
                {getDynamicETA(order)}
              </Text>
            </View>

            <Pressable
              onPress={onDismiss}
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
          <Animated.View style={{ flex: 1, flexDirection: "row", alignItems: "center", opacity: fadeAnim, gap: 8 }}>
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
    </View>
  );
}

// ─── Tiny pulsing live indicator ───────────────────────────────────────────────
function LiveDot({ color }: { color: string }) {
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(scale, { toValue: 1.8, duration: 900, useNativeDriver: true }),
          Animated.timing(scale, { toValue: 1, duration: 0, useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.timing(opacity, { toValue: 0, duration: 900, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 1, duration: 0, useNativeDriver: true }),
        ]),
      ])
    ).start();
  }, []);

  return (
    <View style={{ width: 10, height: 10, alignItems: "center", justifyContent: "center" }}>
      <Animated.View
        style={{
          position: "absolute",
          width: 8, height: 8,
          borderRadius: 4,
          backgroundColor: color,
          transform: [{ scale }],
          opacity,
        }}
      />
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color }} />
    </View>
  );
}
