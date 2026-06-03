import React, { useEffect, useState, useCallback } from "react";
import { View, Text, Pressable, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { api } from "../lib/api";
import { useAppStore } from "../store/useAppStore";
import { useTheme } from "../theme";

// Dpoints-sektion i profilen: saldo, inlösen-katalog och historik.
// Self-contained: hämtar själv med kontots token. Göms om Dpoints är av.

interface Tx {
  id: string;
  amount: number;
  type: string;
  reason: string | null;
  balanceAfter: number;
  createdAt: string;
}
interface Reward {
  id: string;
  title: string;
  description: string | null;
  pointsCost: number;
  discountType: string;
  discountKr: number | null;
  discountPercent: number | null;
  minOrderKr: number;
}
interface Me {
  enabled: boolean;
  balance: number;
  valuePerKr: number;
  transactions: Tx[];
}

function txLabel(t: Tx): string {
  if (t.reason) return t.reason;
  const map: Record<string, string> = {
    EARN_ORDER: "Köp",
    SIGNUP_BONUS: "Välkomstbonus",
    CAMPAIGN: "Kampanj",
    REDEEM: "Inlöst",
    ADMIN_ADJUST: "Justering",
    REVERSAL: "Återtag",
  };
  return map[t.type] || t.type;
}

export default function DpointsSection() {
  const token = useAppStore((s) => s.token);
  const { palette } = useTheme();
  const [me, setMe] = useState<Me | null>(null);
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [loading, setLoading] = useState(true);
  const [redeeming, setRedeeming] = useState<string | null>(null);
  const [codes, setCodes] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const headers = token ? { Authorization: `Bearer ${token}` } : undefined;

  const load = useCallback(async () => {
    if (!token) {
      setLoading(false);
      return;
    }
    try {
      const [meRes, rewardRes] = await Promise.all([
        api.get("/api/dpoints/me", { headers }),
        api.get("/api/dpoints/rewards"),
      ]);
      setMe(meRes.data);
      setRewards(rewardRes.data?.rewards || []);
    } catch {
      // tyst — sektionen göms
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const handleRedeem = async (reward: Reward) => {
    setError(null);
    setRedeeming(reward.id);
    try {
      const res = await api.post("/api/dpoints/redeem", { rewardId: reward.id }, { headers });
      setCodes((c) => ({ ...c, [reward.id]: res.data.code }));
      setMe((m) => (m ? { ...m, balance: res.data.balanceAfter } : m));
      api.get("/api/dpoints/me", { headers }).then((r) => setMe(r.data)).catch(() => {});
    } catch (e: any) {
      setError(e?.response?.data?.error || "Kunde inte lösa in just nu");
    } finally {
      setRedeeming(null);
    }
  };

  if (loading) {
    return (
      <View style={{ paddingVertical: 24, alignItems: "center" }}>
        <ActivityIndicator color={palette.gold} />
      </View>
    );
  }
  if (!me || !me.enabled) return null;

  const valueKr = me.valuePerKr > 0 ? Math.floor(me.balance / me.valuePerKr) : 0;

  return (
    <View style={{ gap: 16, marginBottom: 16 }}>
      {/* Saldo-kort */}
      <LinearGradient
        colors={["#F4D086", palette.gold]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ borderRadius: 26, padding: 22 }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Ionicons name="diamond-outline" size={15} color="#1c1c1e" />
          <Text style={{ color: "#1c1c1e", fontSize: 12, fontWeight: "900", letterSpacing: 1 }}>DPOINTS</Text>
        </View>
        <Text style={{ color: "#1c1c1e", fontSize: 40, fontWeight: "900", marginTop: 6 }}>
          {me.balance.toLocaleString("sv-SE")}
        </Text>
        <Text style={{ color: "#1c1c1e", opacity: 0.75, fontSize: 13, fontWeight: "700" }}>≈ {valueKr} kr i värde</Text>
      </LinearGradient>

      {/* Inlösen-katalog */}
      {rewards.length > 0 && (
        <View style={{ gap: 8 }}>
          <Text style={{ color: palette.text, fontSize: 13, fontWeight: "900" }}>Lös in poäng</Text>
          {rewards.map((r) => {
            const code = codes[r.id];
            const affordable = me.balance >= r.pointsCost;
            return (
              <View
                key={r.id}
                style={{ borderRadius: 18, borderWidth: 1, borderColor: palette.border, padding: 14, backgroundColor: palette.panel }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: palette.text, fontWeight: "800", fontSize: 14 }}>{r.title}</Text>
                    {!!r.description && <Text style={{ color: palette.muted, fontSize: 11 }}>{r.description}</Text>}
                    {r.minOrderKr > 0 && <Text style={{ color: palette.muted, fontSize: 11 }}>Min. order {r.minOrderKr} kr</Text>}
                  </View>
                  {code ? (
                    <View style={{ alignItems: "flex-end" }}>
                      <Text style={{ color: palette.muted, fontSize: 9, fontWeight: "700" }}>DIN KOD</Text>
                      <Text style={{ color: palette.goldDark, fontSize: 18, fontWeight: "900" }}>{code}</Text>
                    </View>
                  ) : (
                    <Pressable
                      disabled={!affordable || redeeming === r.id}
                      onPress={() => handleRedeem(r)}
                      style={{
                        borderRadius: 999,
                        paddingHorizontal: 16,
                        paddingVertical: 9,
                        backgroundColor: affordable ? palette.gold : palette.panelMuted,
                      }}
                    >
                      {redeeming === r.id ? (
                        <ActivityIndicator size="small" color="#1c1c1e" />
                      ) : (
                        <Text style={{ color: affordable ? "#1c1c1e" : palette.muted, fontWeight: "900", fontSize: 13 }}>
                          {r.pointsCost} p
                        </Text>
                      )}
                    </Pressable>
                  )}
                </View>
                {!!code && (
                  <Text style={{ color: palette.success, fontSize: 11, marginTop: 6 }}>
                    Använd koden i kassan — funkar bara på ditt konto.
                  </Text>
                )}
              </View>
            );
          })}
          {!!error && <Text style={{ color: palette.danger, fontSize: 12 }}>{error}</Text>}
        </View>
      )}

      {/* Historik */}
      {me.transactions.length > 0 && (
        <View style={{ gap: 4 }}>
          <Text style={{ color: palette.text, fontSize: 13, fontWeight: "900", marginBottom: 4 }}>Historik</Text>
          {me.transactions.slice(0, 12).map((t) => (
            <View
              key={t.id}
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                paddingVertical: 8,
                borderBottomWidth: 1,
                borderBottomColor: palette.borderMuted,
              }}
            >
              <Text style={{ color: palette.muted, fontSize: 13 }}>{txLabel(t)}</Text>
              <Text style={{ color: t.amount >= 0 ? palette.success : palette.muted, fontWeight: "800", fontSize: 13 }}>
                {t.amount >= 0 ? "+" : ""}
                {t.amount}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
