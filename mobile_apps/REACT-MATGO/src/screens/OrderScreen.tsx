import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { io, Socket } from "socket.io-client";
import { useAppStore } from "../store/useAppStore";
import { api, SOCKET_URL } from "../lib/api";
import { palette } from "../constants/theme";
import { ScreenWrap, Header, EmptyPanel, PulseIndicator, SpinningLoader } from "../components/ui";
import { OrderScreenSkeleton } from "../components/SkeletonLoader";
import type { Order } from "../types";



function getStatusDisplay(status: string, danger: string, gold: string, success: string) {
  switch (status) {
    case "PENDING":
      return { label: "GRANSKAS", desc: "Vi har tagit emot din beställning. Väntar på att köket ska bekräfta.", icon: "time-outline", color: "#f59e0b" };
    case "ACCEPTED":
    case "PREPARING":
      return { label: "TILLAGAS", desc: "Dina råvaror förvandlas till en fantastisk måltid just nu.", icon: "flame-outline", color: "#f97316" };
    case "READY":
      return { label: "REDO!", desc: "Maten är klar! Din beställning är packad och redo att hämtas upp.", icon: "checkmark-circle-outline", color: "#0ea5e9" };
    case "OUT_FOR_DELIVERY":
    case "DELIVERING":
      return { label: "PÅ VÄG!", desc: "Utkörning pågår! Håll ett öga på dörren.", icon: "bicycle-outline", color: "#10b981" };
    case "DELIVERED":
    case "COMPLETED":
      return { label: "LEVERERAD", desc: "Hoppas det smakar! Tack för att du handlar hos oss.", icon: "checkmark-done-outline", color: success };
    case "CANCELLED":
    case "REJECTED":
      return { label: "AVBRUTEN", desc: "Tyvärr blev beställningen avbruten. Du har inte debiterats.", icon: "close-circle-outline", color: danger };
    default:
      return { label: status, desc: "Status uppdateras strax...", icon: "ellipse-outline", color: gold };
  }
}

export default function OrderScreen({ id, goBack }: { id: string; goBack: () => void }) {
  const token = useAppStore((s) => s.token);
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [reviewing, setReviewing] = useState(false);
  const [userRating, setUserRating] = useState(0);
  const [userReview, setUserReview] = useState("");
  const [reviewSubmitted, setReviewSubmitted] = useState(false);
  const socketRef = useRef<Socket | null>(null);

  const fetchOrder = useCallback(async () => {
    try {
      const response = await api.get(`/api/orders/${id}`);
      setOrder(response.data || null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchOrder();

    const socket = io(SOCKET_URL, { path: "/socket.io", transports: ["websocket", "polling"] });
    socketRef.current = socket;
    socket.on("connect", () => socket.emit("join:order", id));
    socket.on("order:status", (payload: any) => {
      if (payload.orderId === id) {
        setOrder((current) =>
          current
            ? {
                ...current,
                status: payload.status,
                estimatedTime: payload.estimatedTime ?? current.estimatedTime,
                deliveringAt: payload.deliveringAt ?? (current as any).deliveringAt,
              }
            : current
        );
      }
    });

    const pollInterval = setInterval(() => {
      fetchOrder();
    }, 15000);

    return () => {
      socket.disconnect();
      clearInterval(pollInterval);
    };
  }, [fetchOrder, id]);

  // Auto-transition from DELIVERING to DELIVERED after 12 minutes
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

  const setActiveOrderId = useAppStore((s) => s.setActiveOrder);
  useEffect(() => {
    if (order?.status === "DELIVERED" || order?.status === "COMPLETED") {
      setActiveOrderId(null);
    }
  }, [order?.status, setActiveOrderId]);

  const submitReview = useCallback(async () => {
    if (!token || userRating === 0) return;
    setReviewing(true);
    try {
      await api.post(
        `/api/profile/orders/${id}/review`,
        { rating: userRating, review: userReview || null },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setReviewSubmitted(true);
      fetchOrder();
    } catch {
      Alert.alert("Fel", "Kunde inte skicka recensionen. Försök igen.");
    } finally {
      setReviewing(false);
    }
  }, [token, userRating, userReview, id, fetchOrder]);

  if (loading) {
    return (
      <ScreenWrap>
        <Header title="Spårar beställning..." subtitle={`Laddar #...`} onBack={goBack} />
        <OrderScreenSkeleton />
      </ScreenWrap>
    );
  }

  if (!order) {
    return (
      <ScreenWrap>
        <Header title="Order hittades inte" subtitle={id} onBack={goBack} />
        <EmptyPanel label="Kunde inte hitta beställningen." />
      </ScreenWrap>
    );
  }

  const statusInfo = getStatusDisplay(order.status, palette.danger, palette.gold, palette.success);
  const isRejected = order.status === "REJECTED" || order.status === "CANCELLED";
  const steps =
    order.type === "DELIVERY"
      ? ["PENDING", "ACCEPTED", "PREPARING", "OUT_FOR_DELIVERY"]
      : ["PENDING", "ACCEPTED", "PREPARING", "READY"];
  const currentIdx = steps.indexOf(order.status);

  return (
    <ScreenWrap>
      <View style={{ flex: 1, backgroundColor: palette.bg, padding: 20 }}>
        <Pressable
          onPress={() => goBack()}
          style={{ width: 44, height: 44, backgroundColor: palette.panelMuted, borderRadius: 22, alignItems: "center", justifyContent: "center", marginBottom: 20, borderWidth: 1, borderColor: palette.border }}
        >
          <Ionicons name="arrow-back" size={22} color={palette.text} />
        </Pressable>

        <View style={{ marginBottom: 30 }}>
          <View
            style={{
              alignSelf: "flex-start",
              backgroundColor:
                order.status === "DELIVERED" || order.status === "COMPLETED"
                  ? "rgba(34, 197, 94, 0.1)"
                  : "rgba(231, 178, 75, 0.1)",
              borderWidth: 1,
              borderColor:
                order.status === "DELIVERED" || order.status === "COMPLETED"
                  ? "rgba(34, 197, 94, 0.3)"
                  : "rgba(231, 178, 75, 0.3)",
              paddingHorizontal: 12,
              paddingVertical: 6,
              borderRadius: 20,
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              marginBottom: 12,
            }}
          >
            <Ionicons
              name={order.status === "DELIVERED" || order.status === "COMPLETED" ? "checkmark-done-outline" : "flash"}
              size={14}
              color={order.status === "DELIVERED" || order.status === "COMPLETED" ? palette.success : palette.gold}
            />
            <Text
              style={{
                color: order.status === "DELIVERED" || order.status === "COMPLETED" ? palette.success : palette.gold,
                fontSize: 10,
                fontWeight: "900",
                letterSpacing: 1.5,
              }}
            >
              {order.status === "DELIVERED" || order.status === "COMPLETED" ? "LEVERERAD" : "LIVE TRACKING"}
            </Text>
          </View>
          <Text style={{ fontSize: 38, fontWeight: "900", color: palette.text, fontStyle: "italic", letterSpacing: -1 }}>
            ORDER <Text style={{ color: palette.gold }}>{(order as any).orderNumber || `#${id.slice(0, 8)}`}</Text>
          </Text>
          <Text style={{ fontSize: 10, fontWeight: "900", color: palette.muted, letterSpacing: 2, marginTop: 4 }}>
            {order.status === "DELIVERED" || order.status === "COMPLETED"
              ? "TACK FÖR DIN BESTÄLLNING"
              : "DIN BESTÄLLNING BEHANDLAS I REALTID"}
          </Text>
        </View>

        {/* ETA Panel */}
        {order.status !== "COMPLETED" && order.status !== "DELIVERED" && !isRejected && (
          <View style={{ backgroundColor: palette.panel, borderRadius: 32, padding: 24, flexDirection: "row", alignItems: "center", gap: 20, marginBottom: 20, borderWidth: 1, borderColor: palette.border, shadowColor: "#1C1C1E", shadowOpacity: 0.05, shadowRadius: 12, elevation: 2 }}>
            <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: palette.gold, alignItems: "center", justifyContent: "center" }}>
              <Ionicons name="time" size={32} color="#000" />
            </View>
            <View>
              <Text style={{ color: palette.muted, fontSize: 10, fontWeight: "900", letterSpacing: 2, marginBottom: 4 }}>KLAR OM UNGEFÄR</Text>
              <Text style={{ color: palette.text, fontSize: 28, fontWeight: "900", fontStyle: "italic", letterSpacing: -1 }}>
                ~{(order as any).estimatedTime} MIN
              </Text>
            </View>
          </View>
        )}

        {/* Status Panel */}
        <View style={{ backgroundColor: `${statusInfo.color}10`, borderRadius: 40, padding: 30, alignItems: "center", marginBottom: 30, borderWidth: 1, borderColor: `${statusInfo.color}30` }}>
          <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: palette.panelMuted, borderWidth: 1, borderColor: palette.border, alignItems: "center", justifyContent: "center", marginBottom: 20 }}>
            <View style={{ position: "absolute" }}>
              <PulseIndicator color={statusInfo.color} size={60} />
            </View>
            <Ionicons name={statusInfo.icon as any} size={36} color={statusInfo.color} />
          </View>
          <Text style={{ color: statusInfo.color, fontSize: 26, fontWeight: "900", fontStyle: "italic", letterSpacing: -1, marginBottom: 8 }}>{statusInfo.label}</Text>
          <Text style={{ color: palette.muted, fontSize: 12, fontWeight: "700", letterSpacing: 1, textAlign: "center", lineHeight: 20, textTransform: "uppercase" }}>{statusInfo.desc}</Text>
          {order.status === "PENDING" && (
            <View style={{ marginTop: 20 }}>
              <SpinningLoader color={statusInfo.color} size={24} />
            </View>
          )}
        </View>

        {/* Progress Bar */}
        {!isRejected && currentIdx !== -1 && (
          <View style={{ marginBottom: 40, paddingHorizontal: 10 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              {steps.map((step, idx) => {
                const isDone = currentIdx >= idx;
                const isActive = currentIdx === idx;
                return (
                  <View key={step} style={{ alignItems: "center", gap: 10, flex: 1, position: "relative" }}>
                    {idx < steps.length - 1 && (
                      <View
                        style={{
                          position: "absolute",
                          top: 15,
                          left: "50%",
                          right: "-50%",
                          height: 2,
                          backgroundColor: isDone && currentIdx > idx ? palette.gold : palette.border,
                          zIndex: 0,
                        }}
                      />
                    )}
                    <View
                      style={{
                        width: 30,
                        height: 30,
                        borderRadius: 15,
                        backgroundColor: isDone ? palette.gold : palette.panelMuted,
                        borderWidth: 2,
                        borderColor: isDone ? palette.gold : palette.border,
                        alignItems: "center",
                        justifyContent: "center",
                        zIndex: 1,
                      }}
                    >
                      {isDone ? (
                        <Ionicons name="checkmark" size={16} color="#000" />
                      ) : (
                        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: palette.border }} />
                      )}
                    </View>
                    <Text style={{ fontSize: 8, fontWeight: "900", color: isActive ? palette.gold : isDone ? palette.text : palette.muted, letterSpacing: 1 }}>
                      {step.split("_")[0]}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* Order details */}
        <View style={{ backgroundColor: palette.panel, borderRadius: 32, padding: 24, marginBottom: 20, borderWidth: 1, borderColor: palette.border, shadowColor: "#1C1C1E", shadowOpacity: 0.04, shadowRadius: 16, elevation: 2 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
            <Text style={{ color: palette.text, fontSize: 18, fontWeight: "900", fontStyle: "italic", letterSpacing: -0.5 }}>BESTÄLLNINGSDETALJER</Text>
            <Ionicons name="basket-outline" size={24} color={palette.gold} />
          </View>

          {(order as any).items?.map((item: any, i: number) => (
            <View key={i} style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 16 }}>
              <View style={{ flexDirection: "row", gap: 12, flex: 1 }}>
                <View style={{ backgroundColor: "rgba(231, 178, 75, 0.1)", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, alignSelf: "flex-start", marginTop: 2 }}>
                  <Text style={{ color: palette.gold, fontSize: 10, fontWeight: "900" }}>{item.quantity}x</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: palette.text, fontSize: 14, fontWeight: "900", fontStyle: "italic", textTransform: "uppercase", marginBottom: 4 }}>
                    {item.productName || item.name}
                  </Text>
                  {(() => {
                    let extras: any[] = [];
                    try {
                      extras = typeof item.selectedExtras === "string" ? JSON.parse(item.selectedExtras) : (item.selectedExtras || []);
                    } catch { extras = []; }
                    return Array.isArray(extras)
                      ? extras.map((extra: any, j: number) => (
                          <Text key={j} style={{ color: palette.muted, fontSize: 10, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase" }}>
                            {extra.extraName} {extra.priceAddon > 0 ? `(+${extra.priceAddon} kr)` : ""}
                          </Text>
                        ))
                      : null;
                  })()}
                </View>
              </View>
              <Text style={{ color: palette.muted, fontSize: 12, fontWeight: "900", fontStyle: "italic" }}>{item.subtotal} KR</Text>
            </View>
          ))}

          <View style={{ height: 1, backgroundColor: palette.border, marginVertical: 20 }} />
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
            <Text style={{ color: palette.text, fontSize: 24, fontWeight: "900", fontStyle: "italic", letterSpacing: -1 }}>SUMMA</Text>
            <Text style={{ color: palette.gold, fontSize: 32, fontWeight: "900", fontStyle: "italic", letterSpacing: -1 }}>
              {(order as any).total || 0} <Text style={{ fontSize: 12, fontWeight: "700", fontStyle: "normal" }}>SEK</Text>
            </Text>
          </View>
        </View>

        {/* Review section */}
        {(order.status === "DELIVERED" || order.status === "COMPLETED") && !(order as any).rating && !reviewSubmitted && (
          <View style={{ backgroundColor: palette.panel, borderRadius: 32, padding: 24, marginBottom: 40, borderWidth: 1, borderColor: "rgba(234,181,69,0.3)", shadowColor: "#1C1C1E", shadowOpacity: 0.04, shadowRadius: 12, elevation: 2 }}>
            <Text style={{ color: palette.gold, fontSize: 18, fontWeight: "900", fontStyle: "italic", marginBottom: 16 }}>LÄMNA RECENSION</Text>
            <View style={{ flexDirection: "row", justifyContent: "center", gap: 12, marginBottom: 20 }}>
              {[1, 2, 3, 4, 5].map((star) => (
                <Pressable key={star} onPress={() => setUserRating(star)}>
                  <Ionicons name={star <= userRating ? "star" : "star-outline"} size={36} color={palette.gold} />
                </Pressable>
              ))}
            </View>
            <TextInput
              value={userReview}
              onChangeText={setUserReview}
              placeholder="Skriv en recension (valfritt)..."
              placeholderTextColor={palette.muted}
              multiline
              numberOfLines={3}
              style={{ color: palette.text, fontSize: 14, fontWeight: "700", textAlignVertical: "top", minHeight: 80, backgroundColor: palette.panelMuted, borderRadius: 16, padding: 16, marginBottom: 20, borderWidth: 1, borderColor: palette.border }}
            />
            <Pressable
              onPress={submitReview}
              disabled={userRating === 0 || reviewing}
              style={{ backgroundColor: userRating === 0 ? "rgba(231,178,75,0.3)" : palette.gold, borderRadius: 20, paddingVertical: 16, alignItems: "center" }}
            >
              <Text style={{ color: userRating === 0 ? palette.muted : "#000", fontSize: 14, fontWeight: "900", letterSpacing: 1 }}>
                {reviewing ? "SKICKAR..." : "SKICKA RECENSION"}
              </Text>
            </Pressable>
          </View>
        )}

        {(order.status === "DELIVERED" || order.status === "COMPLETED") && ((order as any).rating || reviewSubmitted) && (
          <View style={{ backgroundColor: palette.panel, borderRadius: 32, padding: 24, marginBottom: 40, borderWidth: 1, borderColor: "rgba(52,199,89,0.3)", shadowColor: "#1C1C1E", shadowOpacity: 0.04, shadowRadius: 12, elevation: 2 }}>
            <Text style={{ color: palette.success, fontSize: 18, fontWeight: "900", fontStyle: "italic", marginBottom: 12 }}>TACK FÖR DIN RECENSION</Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              {[1, 2, 3, 4, 5].map((star) => (
                <Ionicons key={star} name={star <= ((order as any).rating || userRating) ? "star" : "star-outline"} size={20} color={palette.gold} />
              ))}
            </View>
          </View>
        )}
      </View>
    </ScreenWrap>
  );
}
