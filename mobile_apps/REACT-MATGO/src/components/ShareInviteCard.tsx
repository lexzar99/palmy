import { useEffect, useState, useCallback } from "react";
import { View, Text, Pressable, Share, Platform, Clipboard } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../lib/api";
import { useTheme } from "../theme";
import { useAppStore } from "../store/useAppStore";

/**
 * ShareInviteCard — visas på OrderScreen mellan status-banner och
 * detalj-sektionen. Triggar share-impulsen medan kunden väntar på
 * maten. Visar dealen dynamiskt (samma logik som ProfileScreen-kortet).
 *
 * Returnerar null om referral är locked, deal saknas, eller fetch failar.
 * Detta är best-effort — order-tracking ska fungera utan referral-prompt.
 */

type DealInfo = {
  title: string;
  discountType: string;
  discountPercent: number | null;
  amountKr: number | null;
  freeDelivery: boolean;
  minOrderKr: number;
  validUntil: string | null;
};

type ReferralData = {
  locked: boolean;
  code: string | null;
  shareUrl: string | null;
  enabled: boolean;
  rewardLabel: string;
  deal: DealInfo | null;
  stats: { invited: number; registered: number; ordered: number; totalEarnedKr: number };
};

export default function ShareInviteCard() {
  const { palette } = useTheme();
  const token = useAppStore((s) => s.token);
  const [data, setData] = useState<ReferralData | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    const headers = { Authorization: `Bearer ${token}` };
    api
      .get("/api/account/referral", { headers })
      .then((r) => {
        if (!cancelled) setData(r.data as ReferralData);
      })
      .catch(() => {
        // Tyst — kortet visas bara om vi har data
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const handleCopy = useCallback(() => {
    if (!data?.code) return;
    try {
      Clipboard.setString(data.code);
    } catch {}
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }, [data]);

  const handleShare = useCallback(async () => {
    if (!data?.code || !data?.shareUrl) return;
    const message = `Kom till FoodGo med min kod ${data.code} — vi får båda ${data.rewardLabel} på nästa beställning! ${data.shareUrl}`;
    try {
      await Share.share({
        title: "FoodGo",
        message,
        url: data.shareUrl,
      } as any);
    } catch {
      // User cancelled
    }
  }, [data]);

  // Visa inte om locked, deal saknas, inte enabled, eller ingen kod.
  if (!data || !data.enabled || data.locked || !data.code || !data.deal) {
    return null;
  }

  const isFirstUnlock = data.stats.invited === 0;
  const deal = data.deal;
  const hasDiscount =
    (deal.discountType === "PERCENTAGE" && (deal.discountPercent ?? 0) > 0) ||
    (deal.discountType === "FIXED" && (deal.amountKr ?? 0) > 0);
  const isPercent = deal.discountType === "PERCENTAGE";

  return (
    <View
      style={{
        marginBottom: 24,
        borderRadius: 24,
        backgroundColor: "rgba(234,181,69,0.08)",
        borderWidth: 1,
        borderColor: "rgba(234,181,69,0.32)",
        padding: 20,
        gap: 14,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Ionicons
          name={isFirstUnlock ? "sparkles" : "gift"}
          size={16}
          color={palette.gold}
        />
        <Text style={{
          color: palette.gold, fontSize: 10, fontWeight: "900",
          letterSpacing: 2,
        }}>
          {isFirstUnlock ? "DU HAR LÅST UPP!" : "TIPSA EN VÄN"}
        </Text>
      </View>

      <Text style={{
        color: palette.text, fontSize: 17, fontWeight: "900",
        fontStyle: "italic", letterSpacing: -0.3, lineHeight: 22,
      }}>
        {isFirstUnlock ? "Bjud in en vän medan du väntar — " : "Tipsa en vän — "}
        <Text style={{ color: palette.gold }}>{data.rewardLabel}</Text>
        {" "}åt båda
      </Text>

      <Text style={{ color: palette.muted, fontSize: 12, fontWeight: "600", lineHeight: 17 }}>
        Dela din kod medan du väntar på maten — ni får båda {data.rewardLabel} på er nästa beställning.
      </Text>

      {/* Mini deal-hero */}
      <View style={{
        backgroundColor: palette.panelMuted,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: "rgba(234,181,69,0.25)",
        paddingVertical: 14,
        paddingHorizontal: 16,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
      }}>
        {hasDiscount && (
          <View style={{ alignItems: "center" }}>
            <Text style={{
              color: palette.gold, fontSize: 32, fontWeight: "900",
              fontStyle: "italic", letterSpacing: -1.5, lineHeight: 36,
            }}>
              {isPercent ? deal.discountPercent : deal.amountKr}
              <Text style={{ fontSize: 14, fontStyle: "italic" }}>
                {isPercent ? "%" : " kr"}
              </Text>
            </Text>
            <Text style={{ color: palette.muted, fontSize: 8, fontWeight: "900", letterSpacing: 1.5, marginTop: 2 }}>
              RABATT
            </Text>
          </View>
        )}

        {hasDiscount && deal.freeDelivery && (
          <Text style={{ color: palette.muted, fontSize: 22, fontWeight: "900", opacity: 0.4 }}>+</Text>
        )}

        {deal.freeDelivery && (
          <View style={{ alignItems: "center" }}>
            <View style={{
              width: 42, height: 42, borderRadius: 12,
              backgroundColor: "rgba(234,181,69,0.15)",
              borderWidth: 1, borderColor: "rgba(234,181,69,0.3)",
              alignItems: "center", justifyContent: "center",
            }}>
              <Ionicons name="car-outline" size={20} color={palette.gold} />
            </View>
            <Text style={{ color: palette.muted, fontSize: 8, fontWeight: "900", letterSpacing: 1.5, marginTop: 3 }}>
              FRI LEVERANS
            </Text>
          </View>
        )}
      </View>

      {/* Kod + actions */}
      <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
        <View style={{
          flex: 1,
          backgroundColor: palette.panelMuted,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: "rgba(234,181,69,0.35)",
          paddingVertical: 10,
          paddingHorizontal: 14,
        }}>
          <Text style={{ color: palette.muted, fontSize: 8, fontWeight: "900", letterSpacing: 1.5 }}>
            DIN KOD
          </Text>
          <Text style={{
            color: palette.gold,
            fontSize: 18,
            fontWeight: "900",
            letterSpacing: 3,
            fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
            marginTop: 2,
          }}>
            {data.code}
          </Text>
        </View>
        <Pressable
          onPress={handleCopy}
          style={{
            width: 42, height: 42, borderRadius: 14,
            backgroundColor: palette.panelMuted,
            borderWidth: 1, borderColor: palette.border,
            alignItems: "center", justifyContent: "center",
          }}
        >
          <Ionicons
            name={copied ? "checkmark-circle" : "copy-outline"}
            size={17}
            color={copied ? "#10b981" : palette.text}
          />
        </Pressable>
        <Pressable
          onPress={handleShare}
          style={{
            width: 42, height: 42, borderRadius: 14,
            backgroundColor: palette.gold,
            alignItems: "center", justifyContent: "center",
          }}
        >
          <Ionicons name="share-outline" size={17} color="#000" />
        </Pressable>
      </View>
    </View>
  );
}
