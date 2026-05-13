import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { io } from "socket.io-client";
import { useAppStore } from "../store/useAppStore";
import { api, SOCKET_URL } from "../lib/api";
import { useTheme } from "../theme";
import { ScreenWrap, Header, EmptyPanel, PulseIndicator, SpinningLoader } from "../components/ui";
import { OrderScreenSkeleton } from "../components/SkeletonLoader";
import { DELIVERY_AUTO_DISMISS_MS } from "../lib/orderTiming";
import type { Order } from "../types";



function getStatusDisplay(status: string, danger: string, gold: string, success: string, isScheduled: boolean) {
  switch (status) {
    case "PENDING":
      return { label: "GRANSKAS", desc: "Vi har tagit emot din beställning. Väntar på att köket ska bekräfta.", icon: "time-outline", color: "#f59e0b" };
    case "ACCEPTED":
      return {
        label: "BEKRÄFTAD",
        desc: isScheduled
          ? "Restaurangen har bekräftat din förbeställning till den tid du valde."
          : "Restaurangen har bekräftat din beställning. Köket drar igång strax.",
        icon: "checkmark-circle-outline",
        color: gold,
      };
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

export default function OrderScreen({ id, phone, goBack }: { id: string; phone?: string; goBack: () => void }) {
  const { palette } = useTheme();
  const token = useAppStore((s) => s.token);
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [reviewing, setReviewing] = useState(false);
  const [userRating, setUserRating] = useState(0);
  const [userReview, setUserReview] = useState("");
  const [likedItemIds, setLikedItemIds] = useState<string[]>([]);
  const [reviewSubmitted, setReviewSubmitted] = useState(false);
  const [minutesLeft, setMinutesLeft] = useState<number | null>(null);

  const fetchOrder = useCallback(async () => {
    try {
      // Phone som ownership-bevis när användaren kommer från Orders-listan
      // utan att vara inloggad (mirror av web order/[id]/page.tsx).
      // Backend matchar query.phone mot order.customerPhone om JWT saknas.
      const response = await api.get(`/api/orders/${id}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        params: phone ? { phone } : undefined,
      });
      setOrder(response.data || null);
    } catch {
      setOrder(null);
    } finally {
      setLoading(false);
    }
  }, [id, token, phone]);

  useEffect(() => {
    fetchOrder();

    const socket = io(SOCKET_URL, { path: "/socket.io", transports: ["websocket", "polling"] });
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

  // Auto-transition from DELIVERING to DELIVERED.
  //
  // Source of truth for "when": `etaEndsAt` (Unix seconds) returned by the
  // backend per order — backend uses computeDeliveryWindowMs (rush-hour 25 min
  // / off-peak deterministic 10–20 min). Falls back to deliveringAt +
  // DELIVERY_AUTO_DISMISS_MS (25 min) when etaEndsAt is missing.
  //
  // We can't physically verify delivery, so once the local timer fires we also
  // PATCH /api/orders/:id/status DELIVERED so the DB row + restaurant tablet +
  // bud + LA all see the same status (no client-side ghost state). The PATCH
  // is idempotent, owner-checked, and ignored if status isn't DELIVERING.
  useEffect(() => {
    const deliveringAt = (order as any)?.deliveringAt;
    const etaEndsAt = (order as any)?.etaEndsAt;
    if (!deliveringAt || order?.status !== "DELIVERING") return;

    // Backend may send etaEndsAt as ISO string OR Unix epoch seconds.
    // Both shapes are accepted; ISO is the current production format.
    const etaMs = typeof etaEndsAt === "number"
      ? etaEndsAt * 1000
      : typeof etaEndsAt === "string"
      ? new Date(etaEndsAt).getTime()
      : NaN;
    const flipAt = Number.isFinite(etaMs)
      ? etaMs
      : new Date(deliveringAt).getTime() + DELIVERY_AUTO_DISMISS_MS;

    const flip = () => {
      setOrder((prev) => prev ? { ...prev, status: "DELIVERED" } : prev);
      if (token && order?.id) {
        api.patch(
          `/api/orders/${order.id}/status`,
          { status: "DELIVERED" },
          { headers: { Authorization: `Bearer ${token}` } },
        ).catch(() => { /* Backend will catch up next read; ignore. */ });
      }
    };

    const msRemaining = flipAt - Date.now();
    if (msRemaining <= 0) { flip(); return; }
    const timer = setTimeout(flip, msRemaining);
    return () => clearTimeout(timer);
  }, [(order as any)?.deliveringAt, (order as any)?.etaEndsAt, order?.status, order?.id, token]);

  // LIVE NEDRÄKNING FÖR "MINUTER KVAR"
  useEffect(() => {
    const calcTime = () => {
      if (!order) return;
      if (order.status === "DELIVERED" || order.status === "COMPLETED") return;

      if (order.status === "DELIVERING" && (order as any).deliveringAt) {
        const deliveringTime = new Date((order as any).deliveringAt).getTime();
        const msLeft = (deliveringTime + DELIVERY_AUTO_DISMISS_MS) - Date.now();
        setMinutesLeft(Math.max(0, Math.ceil(msLeft / 60000)));
      } else if (order.estimatedTime) {
        // Annars, räkna ner estimatedTime från när ordern skapades
        if (!order.createdAt) {
          setMinutesLeft(null);
          return;
        }
        const placedAt = new Date(order.createdAt).getTime();
        const msLeft = (placedAt + order.estimatedTime * 60000) - Date.now();
        if (msLeft <= 0) {
          setMinutesLeft(-1); // Flagga för "Försenad"
        } else {
          setMinutesLeft(Math.ceil(msLeft / 60000));
        }
      } else {
        setMinutesLeft(null);
      }
    };
    
    calcTime(); // Kör direkt
    const interval = setInterval(calcTime, 10000); // Uppdatera var tionde sekund (så den slår över snyggt)
    return () => clearInterval(interval);
  }, [order?.createdAt, order?.estimatedTime, order?.status, (order as any)?.deliveringAt]);

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
        { rating: userRating, review: userReview || null, likedItemIds },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setReviewSubmitted(true);
      fetchOrder();
    } catch {
      Alert.alert("Fel", "Kunde inte skicka recensionen. Försök igen.");
    } finally {
      setReviewing(false);
    }
  }, [token, userRating, userReview, likedItemIds, id, fetchOrder]);

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

  const statusInfo = getStatusDisplay(order.status, palette.danger, palette.gold, palette.success, Boolean(order.scheduledFor));
  const isRejected = order.status === "REJECTED" || order.status === "CANCELLED";
  const steps =
    order.type === "DELIVERY"
      ? ["PENDING", "ACCEPTED", "PREPARING", "DELIVERING"]
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
            <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: minutesLeft === -1 ? palette.danger : palette.gold, alignItems: "center", justifyContent: "center" }}>
              <Ionicons name={order.scheduledFor ? "calendar-outline" : minutesLeft === -1 ? "alert-circle" : "time"} size={32} color={minutesLeft === -1 ? "#FFF" : "#000"} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: palette.muted, fontSize: 10, fontWeight: "900", letterSpacing: 2, marginBottom: 4 }}>
                {order.scheduledFor ? "SCHEMALAGD TID" : order.status === "DELIVERING" ? "FRAMME OM UNGEFÄR" : minutesLeft === -1 ? "NÅGOT FÖRSENAD" : "KLAR OM UNGEFÄR"}
              </Text>
              <Text style={{ color: minutesLeft === -1 ? palette.danger : palette.text, fontSize: 28, fontWeight: "900", fontStyle: "italic", letterSpacing: -1 }}>
                {order.scheduledFor
                  ? new Date(order.scheduledFor).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" })
                  : minutesLeft === -1
                    ? "+15 MIN"
                    : minutesLeft !== null 
                      ? `~${minutesLeft} MIN` 
                      : "UPPSKATTAR..."
                }
              </Text>
              {minutesLeft === -1 && !order.scheduledFor && (
                <Text style={{ color: palette.muted, fontSize: 11, fontWeight: "800", marginTop: 4, lineHeight: 16 }}>
                  Restaurangen har fullt upp och vi gör vårt bästa. Tolerera en liten försening.
                </Text>
              )}
              {order.scheduledFor && (
                <Text style={{ color: palette.muted, fontSize: 11, fontWeight: "800", textTransform: "uppercase", letterSpacing: 1.1, marginTop: 4 }}>
                  {new Date(order.scheduledFor).toLocaleDateString("sv-SE", { weekday: "long", day: "numeric", month: "long" })}
                </Text>
              )}
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

        {/* Hantering — restaurang, adress, betalning.
            Mirror av apps/web/app/order/[id]/page.tsx "Hantering"-sidebar.
            Restaurangbild ingår INTE i /api/orders/:id-svaret än, så vi
            visar bara namn + adress + telefon. TODO: lägg till
            restaurant.imageUrl/heroImageUrl i backend-svaret för att
            kunna visa en restaurangsbild. */}
        <View style={{ backgroundColor: palette.panel, borderRadius: 32, padding: 24, marginBottom: 20, borderWidth: 1, borderColor: palette.border }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
            <Text style={{ color: palette.text, fontSize: 18, fontWeight: "900", fontStyle: "italic", letterSpacing: -0.5 }}>HANTERING</Text>
            <Ionicons name={order.type === "DELIVERY" ? "bicycle-outline" : "storefront-outline"} size={22} color={palette.gold} />
          </View>

          <View style={{ gap: 18 }}>
            {/* Kundens telefon */}
            {(order as any).customerPhone ? (
              <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 14 }}>
                <Ionicons name="call-outline" size={18} color={palette.gold} style={{ marginTop: 2 }} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: palette.muted, fontSize: 9, fontWeight: "900", letterSpacing: 1.5, marginBottom: 4, textTransform: "uppercase" }}>
                    Ditt nummer
                  </Text>
                  <Text style={{ color: palette.text, fontSize: 14, fontWeight: "900", letterSpacing: 0.5 }}>
                    {(order as any).customerPhone}
                  </Text>
                </View>
              </View>
            ) : null}

            {/* Restaurang */}
            {(order as any).restaurantName ? (
              <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 14 }}>
                <Ionicons name="storefront-outline" size={18} color={palette.gold} style={{ marginTop: 2 }} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: palette.muted, fontSize: 9, fontWeight: "900", letterSpacing: 1.5, marginBottom: 4, textTransform: "uppercase" }}>
                    Restaurang
                  </Text>
                  <Text style={{ color: palette.text, fontSize: 14, fontWeight: "900", textTransform: "uppercase", letterSpacing: 0.3 }}>
                    {(order as any).restaurantName}
                  </Text>
                  {(order as any).restaurantPhone ? (
                    <Text style={{ color: palette.gold, fontSize: 11, fontWeight: "800", marginTop: 3 }}>
                      {(order as any).restaurantPhone}
                    </Text>
                  ) : null}
                </View>
              </View>
            ) : null}

            {/* Leveransadress (DELIVERY) eller upphämtningsadress (PICKUP) */}
            {order.type === "DELIVERY" && (order as any).deliveryStreet ? (
              <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 14 }}>
                <Ionicons name="location-outline" size={18} color={palette.info} style={{ marginTop: 2 }} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: palette.muted, fontSize: 9, fontWeight: "900", letterSpacing: 1.5, marginBottom: 4, textTransform: "uppercase" }}>
                    Leveransadress
                  </Text>
                  <Text style={{ color: palette.text, fontSize: 13, fontWeight: "900", textTransform: "uppercase", lineHeight: 18 }}>
                    {(order as any).deliveryStreet}
                  </Text>
                  {((order as any).deliveryZip || (order as any).deliveryCity || (order as any).restaurantCity) ? (
                    <Text style={{ color: palette.muted, fontSize: 11, fontWeight: "800", letterSpacing: 1, marginTop: 3, textTransform: "uppercase" }}>
                      {[(order as any).deliveryZip, (order as any).deliveryCity || (order as any).restaurantCity].filter(Boolean).join(" ")}
                    </Text>
                  ) : null}
                </View>
              </View>
            ) : order.type !== "DELIVERY" && (order as any).restaurantAddress ? (
              <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 14 }}>
                <Ionicons name="location-outline" size={18} color={palette.success} style={{ marginTop: 2 }} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: palette.success, fontSize: 9, fontWeight: "900", letterSpacing: 1.5, marginBottom: 4, textTransform: "uppercase" }}>
                    Hämta hos
                  </Text>
                  <Text style={{ color: palette.text, fontSize: 13, fontWeight: "900", textTransform: "uppercase", lineHeight: 18 }}>
                    {(order as any).restaurantAddress}
                  </Text>
                  {((order as any).restaurantZip || (order as any).restaurantCity) ? (
                    <Text style={{ color: palette.muted, fontSize: 11, fontWeight: "800", letterSpacing: 1, marginTop: 3, textTransform: "uppercase" }}>
                      {[(order as any).restaurantZip, (order as any).restaurantCity].filter(Boolean).join(" ")}
                    </Text>
                  ) : null}
                </View>
              </View>
            ) : null}

            {/* Betalningsmetod — backend returnerar paymentMethod="ONLINE"
                för Stripe-betalda orders, null för kontant/pending. */}
            {(order as any).paymentMethod ? (
              <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 14 }}>
                <Ionicons name="card-outline" size={18} color={palette.gold} style={{ marginTop: 2 }} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: palette.muted, fontSize: 9, fontWeight: "900", letterSpacing: 1.5, marginBottom: 4, textTransform: "uppercase" }}>
                    Betalning
                  </Text>
                  <Text style={{ color: palette.text, fontSize: 13, fontWeight: "900", letterSpacing: 0.3 }}>
                    {(order as any).paymentMethod === "ONLINE" ? "Betalt med kort" : (order as any).paymentMethod}
                  </Text>
                </View>
              </View>
            ) : null}

            {/* Beställd kl. */}
            {order.createdAt ? (
              <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 14 }}>
                <Ionicons name="time-outline" size={18} color={palette.muted} style={{ marginTop: 2 }} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: palette.muted, fontSize: 9, fontWeight: "900", letterSpacing: 1.5, marginBottom: 4, textTransform: "uppercase" }}>
                    Beställd
                  </Text>
                  <Text style={{ color: palette.text, fontSize: 12, fontWeight: "900", letterSpacing: 1, textTransform: "uppercase" }}>
                    {new Date(order.createdAt).toLocaleString("sv-SE", { dateStyle: "short", timeStyle: "short" })}
                  </Text>
                </View>
              </View>
            ) : null}
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
              style={{ color: palette.text, fontSize: 14, fontWeight: "700", textAlignVertical: "top", minHeight: 80, backgroundColor: palette.panelMuted, borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: palette.border }}
            />
            {/* Lika rätter — taggar för items i ordern. Toggleas av/på.
                Visas på restaurangens reviews-sida som "Gillade: ...". */}
            {Array.isArray(order.items) && order.items.length > 0 ? (
              <View style={{ marginBottom: 20 }}>
                <Text style={{ color: palette.muted, fontSize: 11, fontWeight: "900", letterSpacing: 1, marginBottom: 10, textTransform: "uppercase" }}>
                  Vad gillade du? (valfritt)
                </Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {order.items.map((item: any) => {
                    const itemId = item.productId || item.id;
                    const active = likedItemIds.includes(itemId);
                    return (
                      <Pressable
                        key={itemId}
                        onPress={() =>
                          setLikedItemIds((current) =>
                            active ? current.filter((x) => x !== itemId) : [...current, itemId],
                          )
                        }
                        style={{
                          paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999,
                          backgroundColor: active ? palette.gold : palette.panelMuted,
                          borderWidth: 1, borderColor: active ? palette.gold : palette.border,
                        }}
                      >
                        <Text style={{ color: active ? "#000" : palette.text, fontSize: 12, fontWeight: "800" }}>
                          {active ? "♥ " : ""}{item.productName}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ) : null}
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
