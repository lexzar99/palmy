import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useArabic } from "../hooks/useArabic";
import { useAppStore } from "../store/useAppStore";
import { api } from "../lib/api";
import { styles } from "../constants/theme";
import { useTheme } from "../theme";
import type { Palette } from "../theme/palette";
import { getBottomTabsContentPadding, getScreenTopPadding } from "../constants/layout";
import { getGuestOrders, removeGuestOrder, type GuestOrder } from "../lib/guestOrders";
import type { Order } from "../types";

// Visuell motsvarighet till apps/web/app/orders/page.tsx — visar
// både backend-orders (om inloggad) och lokala guest-orders (om
// utloggad eller på en ny enhet). Tap → OrderScreen.

type LoadedRow = {
  loaded: true;
  id: string;
  phone: string;
  createdAt: string;
  restaurantName?: string | null;
  restaurantSlug?: string | null;
  orderNumber?: string;
  status?: string;
  total?: number;
  source: "backend" | "guest";
};

type FailedRow = {
  loaded: false;
  id: string;
  phone: string;
  createdAt: string;
  error: "not_found" | "network";
  source: "guest";
};

type OrderRow = LoadedRow | FailedRow;

const STATUS_LABEL: Record<string, { label: string; tone: "warn" | "ok" | "info" | "muted" }> = {
  PENDING: { label: "Granskas", tone: "warn" },
  AWAITING_PAYMENT: { label: "Väntar betalning", tone: "warn" },
  ACCEPTED: { label: "Bekräftad", tone: "info" },
  PREPARING: { label: "Tillagas", tone: "info" },
  READY: { label: "Klar", tone: "ok" },
  DELIVERING: { label: "På väg", tone: "info" },
  OUT_FOR_DELIVERY: { label: "På väg", tone: "info" },
  DELIVERED: { label: "Levererad", tone: "ok" },
  COMPLETED: { label: "Levererad", tone: "ok" },
  CANCELLED: { label: "Avbruten", tone: "muted" },
  REJECTED: { label: "Avvisad", tone: "muted" },
  DELIVERY_FAILED: { label: "Leverans misslyckades", tone: "muted" },
};

// Built per-render so dark mode can swap `muted`.
const buildToneColors = (palette: Palette): Record<string, { bg: string; text: string; border: string }> => ({
  warn: { bg: "rgba(245,158,11,0.10)", text: "#B45309", border: "rgba(245,158,11,0.30)" },
  ok: { bg: "rgba(16,163,74,0.10)", text: "#15803D", border: "rgba(16,163,74,0.30)" },
  info: { bg: "rgba(37,99,235,0.10)", text: "#1D4ED8", border: "rgba(37,99,235,0.30)" },
  muted: { bg: "rgba(110,110,115,0.10)", text: palette.muted, border: "rgba(110,110,115,0.25)" },
});

function StatusBadge({ status }: { status?: string }) {
  const { palette } = useTheme();
  const TONE_COLORS = React.useMemo(() => buildToneColors(palette), [palette]);
  if (!status) {
    return (
      <View
        style={{
          paddingHorizontal: 10,
          paddingVertical: 4,
          borderRadius: 999,
          backgroundColor: "rgba(110,110,115,0.10)",
          borderWidth: 1,
          borderColor: "rgba(110,110,115,0.25)",
        }}
      >
        <Text style={{ color: palette.muted, fontSize: 9, fontWeight: "900", letterSpacing: 1 }}>
          HÄMTAR…
        </Text>
      </View>
    );
  }
  const info = STATUS_LABEL[status] ?? { label: status, tone: "muted" as const };
  const tone = TONE_COLORS[info.tone];
  return (
    <View
      style={{
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 999,
        backgroundColor: tone.bg,
        borderWidth: 1,
        borderColor: tone.border,
      }}
    >
      <Text style={{ color: tone.text, fontSize: 9, fontWeight: "900", letterSpacing: 1 }}>
        {info.label.toUpperCase()}
      </Text>
    </View>
  );
}

function EmptyState({ onExplore }: { onExplore: () => void }) {
  const { palette } = useTheme();
  const floatAnim = React.useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim, {
          toValue: -8,
          duration: 1500,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(floatAnim, {
          toValue: 0,
          duration: 1500,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    ).start();
  }, [floatAnim]);

  return (
    <View
      style={{
        backgroundColor: palette.panel,
        borderRadius: 32,
        borderWidth: 1,
        borderColor: palette.border,
        padding: 32,
        alignItems: "center",
        marginTop: 16,
      }}
    >
      <Animated.Text style={{ fontSize: 56, marginBottom: 16, transform: [{ translateY: floatAnim }] }}>
        🍕
      </Animated.Text>
      <Text
        style={{
          color: palette.text,
          fontSize: 22,
          fontWeight: "900",
          fontStyle: "italic",
          textAlign: "center",
          letterSpacing: -0.5,
          marginBottom: 8,
        }}
      >
        Inga beställningar än
      </Text>
      <Text
        style={{
          color: palette.muted,
          fontSize: 11,
          fontWeight: "800",
          letterSpacing: 1.5,
          textTransform: "uppercase",
          textAlign: "center",
          marginBottom: 24,
        }}
      >
        Lägg din första så hamnar den här
      </Text>
      <Pressable
        onPress={onExplore}
        style={{
          backgroundColor: palette.gold,
          borderRadius: 22,
          paddingHorizontal: 22,
          paddingVertical: 14,
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
        }}
      >
        <Ionicons name="restaurant-outline" size={16} color="#000" />
        <Text style={{ color: "#000", fontSize: 11, fontWeight: "900", letterSpacing: 1.5 }}>
          UTFORSKA RESTAURANGER
        </Text>
      </Pressable>
    </View>
  );
}

export default function OrdersListScreen({
  openOrder,
  openHome,
}: {
  openOrder: (id: string, phone?: string) => void;
  openHome: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { ls } = useArabic();
  const { palette } = useTheme();
  const token = useAppStore((s) => s.token);

  const [rows, setRows] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadAll = useCallback(async () => {
    // 1) Visa guest-orders direkt — vi har basinfo (namn, total, datum)
    //    så listan blir klickbar omedelbart. Status fylls i async.
    const guestRefs = await getGuestOrders();
    const initial: OrderRow[] = guestRefs.map((ref) => ({
      loaded: true as const,
      id: ref.id,
      phone: ref.phone,
      createdAt: ref.createdAt,
      restaurantName: ref.restaurantName ?? null,
      restaurantSlug: ref.restaurantSlug ?? null,
      total: ref.total,
      source: "guest" as const,
    }));
    setRows(
      [...initial].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      ),
    );

    // 2) Om inloggad, hämta backend-orders (kan inkludera orders från
    //    andra enheter som inte ligger i lokal storage).
    if (token) {
      try {
        const res = await api.get("/api/profile/orders", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (Array.isArray(res.data)) {
          const backendRows: OrderRow[] = (res.data as Order[]).map((o: any) => ({
            loaded: true as const,
            id: o.id,
            phone: o.customerPhone || "",
            createdAt: o.createdAt || new Date().toISOString(),
            restaurantName: o.restaurant?.name ?? o.restaurantName ?? null,
            restaurantSlug: o.restaurant?.slug ?? null,
            orderNumber: o.orderNumber,
            status: o.status,
            total: o.total ?? o.totalAmount,
            source: "backend" as const,
          }));
          const seen = new Set(backendRows.map((r) => r.id));
          setRows((prev) => {
            const localOnly = prev.filter((r) => !seen.has(r.id));
            return [...backendRows, ...localOnly].sort(
              (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
            );
          });
        }
      } catch {
        // Inte inloggad / backend nere — vi har redan guest-rader om de finns
      }
    }

    // 3) Per guest-order: hämta status från /api/orders/:id?phone=...
    //    Var och en uppdaterar sin egen rad utan att blockera resten.
    guestRefs.forEach((ref) => {
      api
        .get(`/api/orders/${ref.id}`, { params: { phone: ref.phone }, timeout: 5000 })
        .then((res) => {
          setRows((prev) =>
            prev.map((row): OrderRow => {
              if (row.id !== ref.id) return row;
              const prevTotal = row.loaded ? row.total : undefined;
              const prevRestaurantName = row.loaded ? row.restaurantName : null;
              return {
                loaded: true as const,
                id: row.id,
                phone: row.phone,
                createdAt: row.createdAt,
                restaurantName: res.data.restaurantName ?? prevRestaurantName ?? null,
                restaurantSlug: row.loaded ? row.restaurantSlug ?? null : null,
                orderNumber: res.data.orderNumber,
                status: res.data.status,
                total: res.data.total ?? prevTotal,
                source: row.source,
              };
            }),
          );
        })
        .catch((err: any) => {
          const httpStatus = err?.response?.status;
          if (httpStatus === 404) {
            setRows((prev) =>
              prev.map((row) =>
                row.id === ref.id
                  ? {
                      loaded: false as const,
                      id: row.id,
                      phone: row.phone,
                      createdAt: row.createdAt,
                      error: "not_found" as const,
                      source: "guest" as const,
                    }
                  : row,
              ),
            );
          }
        });
    });
  }, [token]);

  useEffect(() => {
    let cancelled = false;
    loadAll().finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [loadAll]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadAll();
    setRefreshing(false);
  }, [loadAll]);

  const handleRemove = useCallback(async (id: string) => {
    await removeGuestOrder(id);
    setRows((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const hasGuestRows = rows.some((r) => r.source === "guest");

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
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={palette.gold}
          colors={[palette.gold]}
        />
      }
    >
      {/* Header — mirror av web's <h1>Mina beställningar</h1> */}
      <View style={{ marginBottom: 18 }}>
        <Text
          style={{
            color: palette.gold,
            fontSize: 10,
            fontWeight: "900",
            letterSpacing: ls(3),
            marginBottom: 8,
            textTransform: "uppercase",
          }}
        >
          Beställningar
        </Text>
        <Text
          style={{
            color: palette.text,
            fontSize: 36,
            fontWeight: "900",
            fontStyle: "italic",
            letterSpacing: -1,
            marginBottom: 8,
          }}
        >
          MINA <Text style={{ color: palette.gold }}>BESTÄLLNINGAR</Text>
        </Text>
        {!token && (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              backgroundColor: "rgba(231,178,75,0.10)",
              borderWidth: 1,
              borderColor: "rgba(231,178,75,0.25)",
              borderRadius: 16,
              paddingHorizontal: 12,
              paddingVertical: 10,
              marginTop: 6,
            }}
          >
            <Ionicons name="phone-portrait-outline" size={14} color={palette.gold} />
            <Text
              style={{
                color: palette.text,
                fontSize: 11,
                fontWeight: "700",
                flex: 1,
                lineHeight: 16,
              }}
            >
              Sparas lokalt på din enhet — logga in för att synka mellan enheter.
            </Text>
          </View>
        )}
      </View>

      {loading ? (
        <View style={{ alignItems: "center", paddingVertical: 60 }}>
          <ActivityIndicator color={palette.gold} size="large" />
        </View>
      ) : rows.length === 0 ? (
        <EmptyState onExplore={openHome} />
      ) : (
        <View style={{ gap: 12 }}>
          {rows.map((row) => {
            if (!row.loaded) {
              return (
                <View
                  key={row.id}
                  style={{
                    backgroundColor: palette.panel,
                    borderRadius: 22,
                    borderWidth: 1,
                    borderColor: palette.border,
                    padding: 16,
                    gap: 10,
                  }}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <Text
                      style={{
                        color: palette.danger,
                        fontSize: 10,
                        fontWeight: "900",
                        letterSpacing: 1.5,
                      }}
                    >
                      ORDER HITTADES INTE
                    </Text>
                    <Pressable
                      onPress={() => handleRemove(row.id)}
                      hitSlop={10}
                      style={{ padding: 4 }}
                    >
                      <Text
                        style={{
                          color: palette.muted,
                          fontSize: 10,
                          fontWeight: "800",
                          letterSpacing: 1,
                        }}
                      >
                        TA BORT
                      </Text>
                    </Pressable>
                  </View>
                  <Text style={{ color: palette.muted, fontSize: 12, fontWeight: "700" }}>
                    {new Date(row.createdAt).toLocaleString("sv-SE")}
                  </Text>
                </View>
              );
            }
            return (
              <Pressable
                key={row.id}
                onPress={() => openOrder(row.id, row.phone || undefined)}
                style={({ pressed }) => ({
                  backgroundColor: palette.panel,
                  borderRadius: 22,
                  borderWidth: 1,
                  borderColor: palette.border,
                  padding: 18,
                  opacity: pressed ? 0.85 : 1,
                  transform: [{ scale: pressed ? 0.99 : 1 }],
                })}
              >
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    marginBottom: 12,
                  }}
                >
                  <View style={{ flex: 1, paddingRight: 12 }}>
                    <Text
                      style={{
                        color: palette.muted,
                        fontSize: 9,
                        fontWeight: "900",
                        letterSpacing: 1.5,
                        textTransform: "uppercase",
                        marginBottom: 4,
                      }}
                      numberOfLines={1}
                    >
                      {row.restaurantName || "Beställning"}
                    </Text>
                    <Text
                      style={{
                        color: palette.text,
                        fontSize: 18,
                        fontWeight: "900",
                        fontStyle: "italic",
                        letterSpacing: -0.5,
                      }}
                      numberOfLines={1}
                    >
                      {row.orderNumber
                        ? `#${row.orderNumber}`
                        : `#${row.id.slice(-6).toUpperCase()}`}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={palette.muted} />
                </View>

                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 8,
                    flexWrap: "wrap",
                    marginBottom: 10,
                  }}
                >
                  <StatusBadge status={row.status} />
                  {typeof row.total === "number" && (
                    <Text
                      style={{ color: palette.gold, fontSize: 13, fontWeight: "900" }}
                    >
                      {row.total.toFixed(0)} kr
                    </Text>
                  )}
                </View>

                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Ionicons name="time-outline" size={11} color={palette.muted} />
                  <Text
                    style={{
                      color: palette.muted,
                      fontSize: 10,
                      fontWeight: "700",
                      letterSpacing: 0.5,
                    }}
                  >
                    {new Date(row.createdAt).toLocaleString("sv-SE", {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      )}

      {rows.length > 0 && hasGuestRows && (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            marginTop: 18,
            opacity: 0.6,
          }}
        >
          <Ionicons name="document-text-outline" size={12} color={palette.muted} />
          <Text
            style={{
              color: palette.muted,
              fontSize: 9,
              fontWeight: "700",
              letterSpacing: 1.2,
              flex: 1,
            }}
          >
            BESTÄLLNINGAR LAGRAS LOKALT. LOGGA IN FÖR ATT SYNKA MELLAN ENHETER.
          </Text>
        </View>
      )}
    </ScrollView>
  );
}
