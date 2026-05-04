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
  KeyboardAvoidingView,
  Modal,
  FlatList,
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
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [otpPhone, setOtpPhone] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Use Apple-supplied first/last when available; only prompt when nothing
  // structured is on the profile yet.
  const profileFirst = (profile as any)?.firstName?.trim?.() || "";
  const profileLast = (profile as any)?.lastName?.trim?.() || "";
  const profileName = profile?.name?.trim?.() || "";
  const isPlaceholder = profileName.toLowerCase() === "användare";
  // Single source of truth: backend's profileComplete flag. We still keep
  // the local fallbacks for older API responses but the new strict rule is
  // "profile_complete iff first AND last AND non-empty".
  const profileComplete = (profile as any)?.profileComplete === true
    || (!!profileFirst && !!profileLast);
  const needsName = !profileComplete;
  // When the user already has a verified phone but no name, this screen
  // becomes a name-only gate. Skip the SMS step entirely.
  const nameOnlyMode = !((profile as any)?.needsPhone) && needsName;
  const greetingName = profileFirst || profileLast
    ? [profileFirst, profileLast].filter(Boolean).join(" ")
    : (!isPlaceholder ? profileName : "");

  const saveNameOnly = useCallback(async () => {
    const first = firstName.trim();
    const last = lastName.trim();
    if (!first) { setError("Ange ditt förnamn"); return; }
    if (!last) { setError("Ange ditt efternamn"); return; }
    if (!token) { setError("Sessionen tappades"); return; }
    setLoading(true);
    setError("");
    try {
      await api.patch(
        "/api/profile",
        { firstName: first, lastName: last, name: `${first} ${last}` },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const profileRes = await api.get("/api/profile", {
        headers: { Authorization: `Bearer ${token}` },
      });
      setProfile(profileRes.data);
    } catch (e: any) {
      setError(e?.response?.data?.error || e?.message || "Kunde inte spara namn");
    } finally {
      setLoading(false);
    }
  }, [firstName, lastName, token, setProfile]);

  const buildPhone = (cc: string, raw: string) =>
    `${cc}${raw.replace(/\D/g, "").replace(/^0/, "")}`;

  const sendOtp = useCallback(async () => {
    if (needsName && (!firstName.trim() || !lastName.trim())) {
      setError(!firstName.trim() ? "Ange ditt förnamn" : "Ange ditt efternamn");
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
  }, [phone, countryCode, token, firstName, lastName, needsName]);

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
      // Save first/last name if the user just provided them on this screen.
      const first = firstName.trim();
      const last = lastName.trim();
      if (first || last) {
        const joined = [first, last].filter(Boolean).join(" ");
        await api.patch(
          "/api/profile",
          {
            firstName: first || undefined,
            lastName: last || undefined,
            name: joined || undefined,
          },
          { headers: { Authorization: `Bearer ${token}` } },
        ).catch(() => null);
      }
      const profileRes = await api.get("/api/profile", {
        headers: { Authorization: `Bearer ${token}` },
      });
      setProfile(profileRes.data);
    } catch (e: any) {
      setError(e?.response?.data?.error || e?.message || "Felaktig kod");
    } finally {
      setLoading(false);
    }
  }, [otpCode, otpPhone, token, firstName, lastName, setProfile]);

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
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
        >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 26, paddingTop: topInset, paddingBottom: 220 }}
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

          {!!greetingName && (
            <View style={{
              flexDirection: "row", alignItems: "center", gap: 10,
              alignSelf: "flex-start",
              paddingHorizontal: 14, paddingVertical: 8,
              borderRadius: 999,
              backgroundColor: "rgba(231,178,75,0.12)",
              borderWidth: 1, borderColor: "rgba(231,178,75,0.25)",
              marginBottom: 14,
            }}>
              <Ionicons name="person-circle-outline" size={16} color={palette.gold} />
              <Text style={{ color: palette.gold, fontSize: 13, fontWeight: "800" }}>
                {greetingName}
              </Text>
            </View>
          )}
          <Text style={{ color: palette.text, fontSize: 32, fontWeight: "900", lineHeight: 38, letterSpacing: -0.5, marginBottom: 12 }}>
            {nameOnlyMode ? (
              <>Vad heter{"\n"}<Text style={{ color: palette.gold }}>du?</Text></>
            ) : (
              <>Verifiera ditt{"\n"}<Text style={{ color: palette.gold }}>telefonnummer</Text></>
            )}
          </Text>
          <Text style={{ color: palette.muted, fontSize: 14, fontWeight: "500", lineHeight: 22, marginBottom: 28 }}>
            {nameOnlyMode
              ? "Apple delade inte ditt namn. Fyll i för- och efternamn så vi kan visa dig korrekt i appen."
              : "Vi skickar en kod via SMS för att verifiera numret till ditt konto."}
          </Text>

          {step === "phone" && nameOnlyMode && (
            <View style={{ gap: 12 }}>
              <TextInput
                style={{
                  paddingHorizontal: 16, paddingVertical: 16,
                  borderRadius: 16, backgroundColor: palette.card,
                  borderWidth: 1, borderColor: palette.border,
                  color: palette.text, fontSize: 16, fontWeight: "700",
                }}
                placeholder="Förnamn"
                placeholderTextColor={palette.muted}
                value={firstName}
                onChangeText={(t) => { setFirstName(t); setError(""); }}
                autoCapitalize="words"
                autoComplete="name-given"
                textContentType="givenName"
                returnKeyType="next"
                autoFocus
              />
              <TextInput
                style={{
                  paddingHorizontal: 16, paddingVertical: 16,
                  borderRadius: 16, backgroundColor: palette.card,
                  borderWidth: 1, borderColor: palette.border,
                  color: palette.text, fontSize: 16, fontWeight: "700",
                }}
                placeholder="Efternamn"
                placeholderTextColor={palette.muted}
                value={lastName}
                onChangeText={(t) => { setLastName(t); setError(""); }}
                autoCapitalize="words"
                autoComplete="name-family"
                textContentType="familyName"
                returnKeyType="done"
                onSubmitEditing={saveNameOnly}
              />
            </View>
          )}

          {step === "phone" && !nameOnlyMode && (
            <View style={{ gap: 12 }}>
              {needsName && (
                <>
                  <TextInput
                    style={{
                      paddingHorizontal: 16, paddingVertical: 16,
                      borderRadius: 16, backgroundColor: palette.card,
                      borderWidth: 1, borderColor: palette.border,
                      color: palette.text, fontSize: 16, fontWeight: "700",
                    }}
                    placeholder="Förnamn"
                    placeholderTextColor={palette.muted}
                    value={firstName}
                    onChangeText={(t) => { setFirstName(t); setError(""); }}
                    autoCapitalize="words"
                    autoComplete="name-given"
                    textContentType="givenName"
                    returnKeyType="next"
                  />
                  <TextInput
                    style={{
                      paddingHorizontal: 16, paddingVertical: 16,
                      borderRadius: 16, backgroundColor: palette.card,
                      borderWidth: 1, borderColor: palette.border,
                      color: palette.text, fontSize: 16, fontWeight: "700",
                    }}
                    placeholder="Efternamn"
                    placeholderTextColor={palette.muted}
                    value={lastName}
                    onChangeText={(t) => { setLastName(t); setError(""); }}
                    autoCapitalize="words"
                    autoComplete="name-family"
                    textContentType="familyName"
                    returnKeyType="next"
                  />
                </>
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

              {/* Native bottom-sheet modal istället för inline ScrollView —
                  ger riktig dropdown-känsla med backdrop, slide-up och
                  större träffyta. Stänger via tap utanför eller på country. */}
              <Modal
                visible={pickerOpen}
                transparent
                animationType="slide"
                onRequestClose={() => setPickerOpen(false)}
              >
                <Pressable
                  onPress={() => setPickerOpen(false)}
                  style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.45)" }}
                >
                  <Pressable
                    onPress={(e) => e.stopPropagation()}
                    style={{
                      backgroundColor: palette.bg,
                      borderTopLeftRadius: 28,
                      borderTopRightRadius: 28,
                      paddingTop: 14,
                      paddingBottom: 28,
                      maxHeight: "70%",
                    }}
                  >
                    <View style={{ alignItems: "center", marginBottom: 10 }}>
                      <View style={{ width: 44, height: 5, borderRadius: 3, backgroundColor: palette.border }} />
                    </View>
                    <Text style={{ paddingHorizontal: 20, fontSize: 18, fontWeight: "900", color: palette.text, marginBottom: 8 }}>
                      Välj land
                    </Text>
                    <FlatList
                      data={COUNTRY_CODES}
                      keyExtractor={(item) => item.code}
                      renderItem={({ item }) => {
                        const active = item.code === countryCode;
                        return (
                          <Pressable
                            onPress={() => { setCountryCode(item.code); setPickerOpen(false); }}
                            style={{
                              paddingHorizontal: 20, paddingVertical: 16,
                              flexDirection: "row", alignItems: "center", gap: 14,
                              backgroundColor: active ? palette.panelMuted : "transparent",
                            }}
                          >
                            <Text style={{ fontSize: 28 }}>{item.flag}</Text>
                            <View style={{ flex: 1 }}>
                              <Text style={{ color: palette.text, fontSize: 16, fontWeight: "800" }}>{item.name}</Text>
                              <Text style={{ color: palette.muted, fontSize: 13, fontWeight: "600", marginTop: 2 }}>{item.code}</Text>
                            </View>
                            {active && <Ionicons name="checkmark" size={22} color={palette.gold} />}
                          </Pressable>
                        );
                      }}
                    />
                  </Pressable>
                </Pressable>
              </Modal>
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
            onPress={nameOnlyMode ? saveNameOnly : (step === "otp" ? verifyOtp : sendOtp)}
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
                  <Ionicons
                    name={nameOnlyMode ? "checkmark-circle-outline" : (step === "otp" ? "shield-checkmark-outline" : "send-outline")}
                    size={18}
                    color="#000"
                  />
                  <Text style={{ color: "#000", fontWeight: "900", fontSize: 15 }}>
                    {nameOnlyMode ? "Spara" : (step === "otp" ? "Verifiera kod" : "Skicka SMS-kod")}
                  </Text>
                </View>
              )
            }
          </Pressable>

          {!nameOnlyMode && step === "otp" && (
            <Pressable onPress={() => { setStep("phone"); setOtpCode(""); setError(""); }} style={{ alignItems: "center", marginTop: 14, paddingVertical: 8 }}>
              <Text style={{ color: palette.muted, fontSize: 13, fontWeight: "600" }}>Använd ett annat nummer</Text>
            </Pressable>
          )}
        </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}
