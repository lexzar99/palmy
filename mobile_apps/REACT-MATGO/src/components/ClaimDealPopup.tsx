import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  Modal,
  Pressable,
  Image,
  ActivityIndicator,
  Alert,
  AppState,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import * as Notifications from "expo-notifications";
import { api } from "../lib/api";
import { useAppStore } from "../store/useAppStore";
import { palette } from "../constants/theme";

const DISMISS_KEY = "matgo_claim_dismissed_at";

/**
 * Claim-popup som visas första gången inloggad RN-användare öppnar appen
 * efter att admin skapat en popup-deal. Spegel av web-versionen.
 *
 *  - Hämtar /api/profile/claimed-deals för att se vad som redan är claimat.
 *  - Hämtar /api/deals för aktiva globala deals med popupEnabled.
 *  - Visar första matchande som modal.
 *  - "Spara" → POST /api/profile/deals/:id/claim → läggs i claimedDealIds.
 *  - "Inte just nu" → 24h-cooldown via AsyncStorage.
 */
export default function ClaimDealPopup({
  currentRouteName,
}: {
  currentRouteName: string;
}) {
  const token = useAppStore((s) => s.token);
  const profile = useAppStore((s) => s.profile);
  const [deal, setDeal] = useState<any | null>(null);
  const [claiming, setClaiming] = useState(false);

  // Popupen visas BARA på home. Är användaren i kassan/order/restaurang
  // när admin skickar en popup väntar vi tills hen kommer tillbaka.
  const isHome = currentRouteName === "home";

  const findCandidate = useCallback(
    async (specificDealId?: string) => {
      if (!token) return null;
      try {
        const dismissedRaw = await AsyncStorage.getItem(DISMISS_KEY);
        const dismissedAt = Number(dismissedRaw || 0);
        // Om push-tap pekar på en specifik deal hoppar vi över cooldown —
        // användaren har explicit tryckt på notisen så hen vill se det.
        if (!specificDealId && dismissedAt && Date.now() - dismissedAt < 24 * 60 * 60 * 1000) {
          return null;
        }
        const headers = { Authorization: `Bearer ${token}` };
        const [allDealsRes, claimedRes] = await Promise.all([
          api.get("/api/deals").catch(() => ({ data: [] as any[] })),
          api.get("/api/profile/claimed-deals", { headers }).catch(() => ({ data: { claimed: [], global: [] } })),
        ]);
        const claimedIds = new Set<string>(
          ((claimedRes.data?.claimed || []) as any[]).map((d: any) => d.id),
        );
        const candidates = (allDealsRes.data || []) as any[];
        // Om push tappades med specifik dealId, prio den.
        if (specificDealId) {
          const exact = candidates.find((d: any) => d?.id === specificDealId && d?.isActive);
          if (exact) return exact;
        }
        return (
          candidates.find((d: any) => {
            if (!d?.isActive || claimedIds.has(d.id)) return false;
            const hasPopupContent = Boolean(
              (d.popupHeadline && String(d.popupHeadline).trim()) ||
                (d.popupBody && String(d.popupBody).trim()) ||
                (d.popupCode && String(d.popupCode).trim()),
            );
            return hasPopupContent && d.popupEnabled !== false;
          }) || null
        );
      } catch {
        return null;
      }
    },
    [token],
  );

  // Initial fetch + när användaren kommer tillbaka till home från annan
  // skärm. Visar popupen om en aktiv unclaimed-deal finns.
  useEffect(() => {
    if (!token || !profile?.id || !isHome) return;
    let cancelled = false;
    findCandidate().then((c) => {
      if (!cancelled && c) setDeal(c);
    });
    return () => {
      cancelled = true;
    };
  }, [token, profile?.id, isHome, findCandidate]);

  // Push-tap-handler: när användaren tappar en notis triggas
  // popupen för den dealId som låg i notification data. Också:
  // när appen återgår till foreground, refetcha så nya popups
  // som kommit medan appen var i bakgrunden hittas.
  useEffect(() => {
    if (!token) return;
    const responseSubscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response?.notification?.request?.content?.data as any;
      if (data?.kind === "popup-claim" && data?.dealId) {
        // Vänta lite så Stack hinner navigera tillbaka till home när
        // användaren tappar notisen.
        setTimeout(() => {
          findCandidate(String(data.dealId)).then((c) => c && setDeal(c));
        }, 400);
      }
    });
    const appStateSub = AppState.addEventListener("change", (next) => {
      if (next === "active" && isHome && !deal) {
        findCandidate().then((c) => c && setDeal(c));
      }
    });
    return () => {
      responseSubscription.remove();
      appStateSub.remove();
    };
  }, [token, isHome, deal, findCandidate]);

  const handleClaim = async () => {
    if (!deal || claiming || !token) return;
    setClaiming(true);
    try {
      await api.post(
        `/api/profile/deals/${deal.id}/claim`,
        {},
        { headers: { Authorization: `Bearer ${token}` } },
      );
      // Lokal dismiss + close. Användaren ser dealen i Profile efteråt.
      await AsyncStorage.setItem(DISMISS_KEY, String(Date.now()));
      setDeal(null);
    } catch (e: any) {
      Alert.alert("Kunde inte spara", e?.response?.data?.error || "Försök igen senare.");
    } finally {
      setClaiming(false);
    }
  };

  const handleDismiss = async () => {
    await AsyncStorage.setItem(DISMISS_KEY, String(Date.now()));
    setDeal(null);
  };

  if (!deal) return null;

  const headline = deal.popupHeadline || deal.title || "Erbjudande";
  const body = deal.popupBody || deal.description || "";
  const cta = deal.popupCtaLabel || "Spara erbjudande";
  const badge =
    deal.badgeText ||
    (deal.discountType === "PERCENTAGE" ? `-${deal.discountValue}%` : "");

  return (
    <Modal visible transparent animationType="fade" onRequestClose={handleDismiss}>
      <Pressable
        onPress={handleDismiss}
        style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.65)", justifyContent: "flex-end", padding: 16 }}
      >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={{
            width: "100%",
            maxWidth: 420,
            alignSelf: "center",
            borderRadius: 28,
            padding: 24,
            backgroundColor: palette.panel,
            borderWidth: 1,
            borderColor: "rgba(243,191,87,0.3)",
            marginBottom: 24,
          }}
        >
          <Pressable
            onPress={handleDismiss}
            hitSlop={12}
            style={{ position: "absolute", right: 16, top: 16, zIndex: 10 }}
          >
            <Ionicons name="close" size={22} color={palette.muted} />
          </Pressable>

          {deal.imageUrl ? (
            <Image
              source={{ uri: deal.imageUrl }}
              style={{ width: "100%", height: 160, borderRadius: 18, marginBottom: 14 }}
              resizeMode="cover"
            />
          ) : (
            <View
              style={{
                height: 160,
                borderRadius: 18,
                marginBottom: 14,
                backgroundColor: "rgba(243,191,87,0.1)",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ fontSize: 56 }}>🎁</Text>
            </View>
          )}

          {!!badge && (
            <View
              style={{
                alignSelf: "flex-start",
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: 999,
                backgroundColor: palette.gold,
                marginBottom: 10,
              }}
            >
              <Text style={{ color: "#11151b", fontSize: 10, fontWeight: "900", letterSpacing: 1 }}>
                {badge}
              </Text>
            </View>
          )}

          <Text style={{ color: palette.text, fontSize: 22, fontWeight: "900", letterSpacing: -0.5 }}>
            {headline}
          </Text>
          {!!body && (
            <Text style={{ color: palette.muted, fontSize: 14, lineHeight: 22, marginTop: 10 }}>
              {body}
            </Text>
          )}

          {deal.minOrder && deal.minOrder > 0 ? (
            <Text style={{ color: palette.muted, fontSize: 11, fontWeight: "800", letterSpacing: 1, marginTop: 10, textTransform: "uppercase" }}>
              Minsta order {deal.minOrder} kr
            </Text>
          ) : null}
          {deal.validUntil ? (
            <Text style={{ color: palette.muted, fontSize: 11, fontWeight: "800", letterSpacing: 1, marginTop: 4, textTransform: "uppercase" }}>
              Gäller t.o.m. {String(deal.validUntil).slice(0, 10)}
            </Text>
          ) : null}

          {deal.popupCode ? (
            <View
              style={{
                marginTop: 14,
                paddingVertical: 12,
                paddingHorizontal: 16,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: "rgba(243,191,87,0.4)",
                borderStyle: "dashed",
                backgroundColor: "rgba(243,191,87,0.1)",
                alignItems: "center",
              }}
            >
              <Text style={{ color: palette.gold, fontSize: 9, fontWeight: "900", letterSpacing: 2 }}>
                ANVÄND KOD
              </Text>
              <Text style={{ color: palette.text, fontSize: 18, fontWeight: "900", letterSpacing: 2, marginTop: 4 }}>
                {deal.popupCode}
              </Text>
            </View>
          ) : null}

          {deal.popupOkOnly ? (
            <Pressable
              onPress={handleDismiss}
              style={{ marginTop: 18, paddingVertical: 16, borderRadius: 16, backgroundColor: palette.gold, alignItems: "center" }}
            >
              <Text style={{ color: "#11151b", fontSize: 13, fontWeight: "900", letterSpacing: 2 }}>OK</Text>
            </Pressable>
          ) : (
            <>
              <Pressable
                onPress={handleClaim}
                disabled={claiming}
                style={{
                  marginTop: 18,
                  paddingVertical: 16,
                  borderRadius: 16,
                  backgroundColor: palette.gold,
                  alignItems: "center",
                  opacity: claiming ? 0.6 : 1,
                }}
              >
                {claiming ? (
                  <ActivityIndicator color="#11151b" />
                ) : (
                  <Text style={{ color: "#11151b", fontSize: 13, fontWeight: "900", letterSpacing: 2 }}>
                    {cta.toUpperCase()}
                  </Text>
                )}
              </Pressable>
              <Pressable
                onPress={handleDismiss}
                style={{ marginTop: 8, paddingVertical: 12, alignItems: "center" }}
              >
                <Text style={{ color: palette.muted, fontSize: 12, fontWeight: "800", letterSpacing: 1 }}>
                  INTE JUST NU
                </Text>
              </Pressable>
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
