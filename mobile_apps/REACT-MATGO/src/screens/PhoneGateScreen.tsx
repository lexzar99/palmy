import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  ScrollView,
  Platform,
  StatusBar,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useAppStore } from "../store/useAppStore";
import { api } from "../lib/api";
import { supabase } from "../lib/supabase";
import { palette } from "../constants/theme";

const COUNTRY_CODES = [
  { code: "+46", flag: "🇸🇪", name: "Sverige" },
  { code: "+45", flag: "🇩🇰", name: "Danmark" },
  { code: "+47", flag: "🇳🇴", name: "Norge" },
  { code: "+358", flag: "🇫🇮", name: "Finland" },
  { code: "+44", flag: "🇬🇧", name: "UK" },
  { code: "+1", flag: "🇺🇸", name: "USA" },
];

/**
 * Hard phone-verification gate.
 *
 * Rendered at App level whenever the active session is an OAuth account
 * (Apple/Google) without a verified phone. The user can ONLY:
 *   - Verify a phone via Twilio OTP, or
 *   - Sign out and try again.
 *
 * The rest of the app is hidden behind this until the gate clears.
 */
export default function PhoneGateScreen() {
  const token = useAppStore((s) => s.token);
  const profile = useAppStore((s) => s.profile);
  const setProfile = useAppStore((s) => s.setProfile);
  const clearSession = useAppStore((s) => s.clearSession);

  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [countryCode, setCountryCode] = useState("+46");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [otpPhone, setOtpPhone] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const needsName = !profile?.name || profile.name.trim().toLowerCase() === "användare";

  const buildPhone = (cc: string, raw: string) =>
    `${cc}${raw.replace(/\D/g, "").replace(/^0/, "")}`;

  const sendOtp = useCallback(async () => {
    if (needsName && !name.trim()) {
      setError("Ange ditt namn");
      return;
    }
    if (!phone.trim() || !token) {
      setError("Ange ditt telefonnummer");
      return;
    }
    const full = buildPhone(countryCode, phone);
    setLoading(true);
    setError("");
    try {
      const { data } = await api.post(
        "/api/auth/send-otp",
        { phone: full },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (data?.devCode) setOtpCode(data.devCode);
      setOtpPhone(full);
      setStep("otp");
    } catch (e: any) {
      setError(e?.response?.data?.error || e?.message || "Kunde inte skicka SMS");
    } finally {
      setLoading(false);
    }
  }, [phone, countryCode, token]);

  const verifyOtp = useCallback(async () => {
    if (!otpCode.trim() || !token) {
      setError("Ange koden från SMS:et");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await api.post(
        "/api/auth/verify-otp",
        { phone: otpPhone, code: otpCode },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      // Save name if provided
      if (name.trim()) {
        await api.patch(
          "/api/profile",
          { name: name.trim() },
          { headers: { Authorization: `Bearer ${token}` } },
        ).catch(() => null);
      }
      const profileRes = await api.get("/api/profile", {
        headers: { Authorization: `Bearer ${token}` },
      });
      // Override "Användare" placeholder if we have a real name
      if (name.trim() && profileRes.data) {
        profileRes.data.name = name.trim();
      }
      setProfile(profileRes.data);
    } catch (e: any) {
      setError(e?.response?.data?.error || e?.message || "Felaktig kod");
    } finally {
      setLoading(false);
    }
  }, [otpCode, otpPhone, token, name, setProfile]);

  const handleSignOut = useCallback(async () => {
    await supabase.auth.signOut().catch(() => null);
    clearSession();
  }, [clearSession]);

  const topInset = Platform.OS === "ios" ? 16 : (StatusBar.currentHeight || 0) + 16;
  const masked = profile?.email
    ? profile.email
    : profile?.name || "ditt konto";

  return (
    <View style={{ flex: 1, backgroundColor: "#07060c" }}>
      <LinearGradient
        colors={[palette.panel, palette.bg, palette.panelMuted]}
        locations={[0, 0.6, 1]}
        style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
      />
      <SafeAreaView style={{ flex: 1, backgroundColor: "transparent" }}>
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 26, paddingTop: topInset, paddingBottom: 48 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Brand */}
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 28 }}>
            <View style={{
              width: 38, height: 38, borderRadius: 12,
              backgroundColor: "rgba(231,178,75,0.12)",
              borderWidth: 1, borderColor: "rgba(231,178,75,0.28)",
              alignItems: "center", justifyContent: "center",
            }}>
              <Ionicons name="restaurant" size={18} color={palette.gold} />
            </View>
            <Text style={{ color: palette.gold, fontSize: 20, fontWeight: "900", letterSpacing: -0.5, fontStyle: "italic", marginLeft: 10 }}>
              FoodGo
            </Text>
            <Pressable
              onPress={handleSignOut}
              style={{ marginLeft: "auto", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14, borderWidth: 1, borderColor: "rgba(255,255,255,0.12)" }}
            >
              <Text style={{ color: palette.muted, fontSize: 12, fontWeight: "800" }}>Logga ut</Text>
            </Pressable>
          </View>

          {/* Big icon */}
          <View style={{ alignItems: "center", marginTop: 12, marginBottom: 32 }}>
            <View style={{
              width: 100, height: 100, borderRadius: 30,
              backgroundColor: "rgba(231,178,75,0.12)",
              borderWidth: 1.5, borderColor: "rgba(231,178,75,0.3)",
              alignItems: "center", justifyContent: "center",
            }}>
              <Ionicons name="call-outline" size={46} color={palette.gold} />
            </View>
          </View>

          <Text style={{ color: palette.text, fontSize: 32, fontWeight: "900", lineHeight: 38, letterSpacing: -0.5, marginBottom: 12 }}>
            Verifiera ditt{"\n"}
            <Text style={{ color: palette.gold }}>telefonnummer</Text>
          </Text>
          <Text style={{ color: palette.muted, fontSize: 14, fontWeight: "500", lineHeight: 22, marginBottom: 6 }}>
            För att kunna beställa kopplar vi numret till {masked}.
          </Text>
          <Text style={{ color: palette.muted, fontSize: 12, fontWeight: "500", lineHeight: 18, marginBottom: 28 }}>
            Endast ett nummer per konto. Vi skickar en kod via SMS för verifiering.
          </Text>

          {step === "phone" && (
            <View style={{ gap: 12 }}>
              {needsName && (
                <TextInput
                  style={{
                    paddingHorizontal: 16, paddingVertical: 16,
                    borderRadius: 16, backgroundColor: palette.card,
                    borderWidth: 1, borderColor: palette.border,
                    color: palette.text, fontSize: 16, fontWeight: "700",
                  }}
                  placeholder="Ditt namn"
                  placeholderTextColor={palette.muted}
                  value={name}
                  onChangeText={(t) => { setName(t); setError(""); }}
                  autoCapitalize="words"
                  returnKeyType="next"
                />
              )}
              <View style={{ flexDirection: "row", gap: 10 }}>
                <Pressable
                  onPress={() => setPickerOpen((v) => !v)}
                  style={{
                    flexDirection: "row", alignItems: "center", gap: 6,
                    paddingHorizontal: 14, paddingVertical: 16,
                    borderRadius: 16,
                    backgroundColor: palette.card,
                    borderWidth: 1, borderColor: palette.border,
                  }}
                >
                  <Text style={{ color: palette.text, fontSize: 16, fontWeight: "800" }}>
                    {COUNTRY_CODES.find((c) => c.code === countryCode)?.flag} {countryCode}
                  </Text>
                  <Ionicons name="chevron-down" size={14} color={palette.muted} />
                </Pressable>
                <TextInput
                  style={{
                    flex: 1, paddingHorizontal: 16, paddingVertical: 16,
                    borderRadius: 16, backgroundColor: palette.card,
                    borderWidth: 1, borderColor: palette.border,
                    color: palette.text, fontSize: 18, fontWeight: "700",
                  }}
                  placeholder="070 123 45 67"
                  placeholderTextColor={palette.muted}
                  keyboardType="phone-pad"
                  value={phone}
                  onChangeText={(t) => { setPhone(t); setError(""); }}
                  onSubmitEditing={sendOtp}
                  autoFocus
                />
              </View>

              {pickerOpen && (
                <View style={{ borderRadius: 16, backgroundColor: palette.card, borderWidth: 1, borderColor: palette.border, overflow: "hidden" }}>
                  {COUNTRY_CODES.map((c) => (
                    <Pressable
                      key={c.code}
                      onPress={() => { setCountryCode(c.code); setPickerOpen(false); }}
                      style={{ paddingHorizontal: 14, paddingVertical: 12, flexDirection: "row", alignItems: "center", gap: 10 }}
                    >
                      <Text style={{ fontSize: 18 }}>{c.flag}</Text>
                      <Text style={{ color: palette.text, fontSize: 14, fontWeight: "700" }}>{c.code}</Text>
                      <Text style={{ color: palette.muted, fontSize: 13, fontWeight: "500" }}>{c.name}</Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>
          )}

          {step === "otp" && (
            <View
              style={{
                backgroundColor: palette.panelMuted,
                borderRadius: 20,
                borderWidth: 1,
                borderColor: palette.border,
                padding: 6,
                marginBottom: 8,
              }}
            >
              <TextInput
                style={{
                  color: palette.gold,
                  fontSize: 30,
                  fontWeight: "900",
                  textAlign: "center",
                  letterSpacing: 12,
                  paddingVertical: 18,
                  paddingHorizontal: 14,
                }}
                placeholder="——————"
                placeholderTextColor="rgba(234,181,69,0.2)"
                keyboardType="number-pad"
                maxLength={6}
                value={otpCode}
                onChangeText={(t) => { setOtpCode(t); setError(""); }}
                onSubmitEditing={verifyOtp}
                autoFocus
              />
            </View>
          )}

          {!!error && (
            <View style={{ backgroundColor: "rgba(239,68,68,0.1)", borderRadius: 14, padding: 12, borderWidth: 1, borderColor: "rgba(239,68,68,0.2)", marginTop: 12 }}>
              <Text style={{ color: "#fca5a5", fontSize: 12, fontWeight: "700", textAlign: "center" }}>{error}</Text>
            </View>
          )}

          <Pressable
            onPress={step === "otp" ? verifyOtp : sendOtp}
            disabled={loading}
            style={{
              backgroundColor: palette.gold, borderRadius: 22, paddingVertical: 18,
              alignItems: "center", opacity: loading ? 0.7 : 1, marginTop: 18,
              shadowColor: palette.gold, shadowOpacity: 0.4, shadowRadius: 20, shadowOffset: { width: 0, height: 8 },
            }}
          >
            {loading
              ? <ActivityIndicator color="#000" />
              : (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Ionicons name={step === "otp" ? "shield-checkmark-outline" : "send-outline"} size={18} color="#000" />
                  <Text style={{ color: "#000", fontWeight: "900", fontSize: 15 }}>
                    {step === "otp" ? "Verifiera kod" : "Skicka SMS-kod"}
                  </Text>
                </View>
              )
            }
          </Pressable>

          {step === "otp" && (
            <Pressable onPress={() => { setStep("phone"); setOtpCode(""); setError(""); }} style={{ alignItems: "center", marginTop: 14, paddingVertical: 8 }}>
              <Text style={{ color: palette.muted, fontSize: 13, fontWeight: "600" }}>Använd ett annat nummer</Text>
            </Pressable>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
