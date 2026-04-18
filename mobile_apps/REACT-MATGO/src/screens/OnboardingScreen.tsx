import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, Pressable, Platform, ScrollView, Animated, ActivityIndicator, StatusBar, StyleSheet, Modal, KeyboardAvoidingView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAppStore } from '../store/useAppStore';
import { api } from '../lib/api';
import { supabase } from '../lib/supabase';
import { palette, styles } from '../constants/theme';
import { useGoogleAuth } from '../hooks/useGoogleAuth';
import ScalePressable from '../components/ScalePressable';
import { PrimaryButton } from '../components/ui';

// ─── OnboardingScreen ─────────────────────────────────────────────────────────
const COUNTRY_CODES = [
  { code: "+46", flag: "🇸🇪", name: "Sweden" },
  { code: "+45", flag: "🇩🇰", name: "Denmark" },
  { code: "+47", flag: "🇳🇴", name: "Norway" },
  { code: "+358", flag: "🇫🇮", name: "Finland" },
  { code: "+44", flag: "🇬🇧", name: "UK" },
  { code: "+1", flag: "🇺🇸", name: "USA" },
];

const PREFERENCE_OPTIONS = [
  "Gluten", "Laktos", "Nötter", "Ägg", "Fisk", "Skaldjur", 
  "Soja", "Selleri", "Senap", "Sesam", "Vetemjöl", "Mjölk"
];

export default function OnboardingScreen({ onComplete }: { onComplete: () => void }) {
  const setOnboardingComplete = useAppStore((s) => s.setOnboardingComplete);
  const setToken = useAppStore((s) => s.setToken);
  const setProfile = useAppStore((s) => s.setProfile);
  const setDislikedIngredients = useAppStore((s) => s.setDislikedIngredients);

  const [step, setStep] = useState<"landing" | "phone" | "profile" | "allergens" | "otp">("landing");
  const [countryCode, setCountryCode] = useState("+46");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [allergens, setAllergens] = useState<string[]>([]);
  const [otpCode, setOtpCode] = useState("");
  const [otpPhone, setOtpPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [countryPickerOpen, setCountryPickerOpen] = useState(false);
  const [isNewUser, setIsNewUser] = useState(false);
  const [isGoogleLinking, setIsGoogleLinking] = useState(false);

  // Entrance animation
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(28)).current;

  const { prompt: googlePrompt, loading: googleLoading, tokenResult: googleResult, error: googleError } = useGoogleAuth();

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 450, useNativeDriver: Platform.OS !== "web" }),
      Animated.spring(slideAnim, { toValue: 0, tension: 60, friction: 10, useNativeDriver: Platform.OS !== "web" }),
    ]).start();
  }, []);

  // Re-animate on step change
  const stepAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    stepAnim.setValue(0);
    Animated.spring(stepAnim, { toValue: 1, tension: 60, friction: 10, useNativeDriver: Platform.OS !== "web" }).start();
  }, [step]);

  // Handle Google OAuth result
  useEffect(() => {
    if (googleResult) {
      setToken(googleResult.token);
      setProfile(googleResult.user);
      
      // Mandatory phone link check
      if (googleResult.user.needsPhone) {
        setIsGoogleLinking(true);
        setStep("phone");
      } else {
        setOnboardingComplete(true);
        onComplete();
      }
    }
  }, [googleResult]);

  useEffect(() => {
    if (googleError && googleError !== "__cancelled__") {
      setError(googleError);
    }
  }, [googleError]);

  const handleSkip = () => {
    setOnboardingComplete(true);
    onComplete();
  };

  const buildPhone = (cc: string, raw: string) => `${cc}${raw.replace(/\D/g, "").replace(/^0/, "")}`;

  const handleCheckPhone = async () => {
    if (!phone.trim()) { setError("Ange ditt telefonnummer"); return; }
    const full = buildPhone(countryCode, phone);
    setLoading(true); setError("");
    try {
      // 1. Check if phone exists and is part of a previous registration
      const { data: lookup } = await api.post("/api/auth/lookup-phone", { phone: full });
      
      // Keep track of the full phone number for subsequent steps
      const phoneExists = !!lookup.exists;
      setOtpPhone(full);

      // We only prompt for profile info if it's a completely NEW phone number
      // However, if the user logged in via Google (isGoogleLinking), we consider it an existing flow where we just need to verify the phone.
      if (!isGoogleLinking && !phoneExists) {
        // New phone user: must fill profile first before sending OTP
        setIsNewUser(true);
        setStep("profile");
      } else {
        // Existing phone user OR Google linking flow: go straight to OTP
        setIsNewUser(false);
        await triggerOtp(full);
      }
    } catch (e: any) {
      setError(e.response?.data?.error || "Kunde inte kontrollera nummer");
    } finally { setLoading(false); }
  };

  const triggerOtp = async (full: string) => {
    try {
      const { error } = await supabase.auth.signInWithOtp({ phone: full });
      if (error) throw error;
      setOtpPhone(full);
      setStep("otp");
    } catch (e: any) {
      setError(e.message || "Kunde inte skicka SMS");
    }
  };

  const handleProfileSubmit = async () => {
    if (!name.trim()) { setError("Ange ditt namn"); return; }
    if (!email.trim() || !email.includes("@")) { setError("Ange en giltig e-post"); return; }
    
    // Once profile is filled, prompt for allergens
    setStep("allergens");
  };

  const handleAllergensSubmit = async () => {
    setLoading(true);
    await triggerOtp(otpPhone);
    setLoading(false);
  };

  const handleVerifyOtp = async () => {
    if (!otpCode.trim()) { setError("Ange koden från SMS:et"); return; }
    setLoading(true); setError("");
    try {
      const { data, error: verifyErr } = await supabase.auth.verifyOtp({
        phone: otpPhone,
        token: otpCode,
        type: 'sms',
      });
      
      if (verifyErr) throw verifyErr;
      
      if (data.session) {
        // If it was a new user, we might want to update the profile metadata immediately
        if (isNewUser) {
          await supabase.auth.updateUser({
            data: { name: name.trim(), full_name: name.trim() }
          });
        }

        const token = data.session.access_token;
        setToken(token);
        
        // Fetch full profile from API to ensure sync
        const profileRes = await api.get("/api/auth/me", {
           headers: { Authorization: `Bearer ${token}` }
        });

        setProfile(profileRes.data);
        setDislikedIngredients(allergens);
        setOnboardingComplete(true);
        onComplete();
      }
    } catch (e: any) {
      setError(e.message || "Felaktig kod");
    } finally { setLoading(false); }
  };

  // Top padding for Dynamic Island / notch on iOS (59pt covers island + status bar)
  const iosSafeTop = Platform.OS === "ios" ? 59 : (StatusBar.currentHeight || 0) + 12;

  return (
    <View style={{ flex: 1, backgroundColor: "#07060c" }}>
      <LinearGradient
        colors={[palette.panel, palette.bg, palette.panelMuted]}
        locations={[0, 0.6, 1]}
        style={StyleSheet.absoluteFill}
      />

      {/* Decorative gold glow in upper area */}
      <View
        style={{
          position: "absolute",
          top: -80,
          left: "15%",
          right: "15%",
          height: 260,
          borderRadius: 130,
          backgroundColor: "rgba(231,178,75,0.055)",
          shadowColor: palette.gold,
          shadowOpacity: 0.3,
          shadowRadius: 60,
          shadowOffset: { width: 0, height: 20 },
        }}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            paddingHorizontal: 26,
            paddingTop: iosSafeTop,
            paddingBottom: 48,
          }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Header row */}
          <Animated.View
            style={{
              opacity: fadeAnim,
              transform: [{ translateY: slideAnim }],
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 36,
            }}
          >
            {/* Brand mark */}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <View
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 14,
                  backgroundColor: "rgba(231,178,75,0.12)",
                  borderWidth: 1,
                  borderColor: "rgba(231,178,75,0.28)",
                  alignItems: "center",
                  justifyContent: "center",
                  shadowColor: palette.gold,
                  shadowOpacity: 0.35,
                  shadowRadius: 10,
                  shadowOffset: { width: 0, height: 4 },
                }}
              >
                <Ionicons name="restaurant" size={20} color={palette.gold} />
              </View>
              <Text style={{ color: palette.gold, fontSize: 22, fontWeight: "900", letterSpacing: -0.5, fontStyle: "italic" }}>
                MatGo
              </Text>
            </View>

            {/* Skip button */}
            <Pressable
              onPress={handleSkip}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 8,
                borderRadius: 20,
                backgroundColor: palette.card,
                borderWidth: 1,
                borderColor: palette.border,
              }}
            >
              <Text style={{ color: palette.muted, fontSize: 12, fontWeight: "700" }}>Hoppa över</Text>
            </Pressable>
          </Animated.View>

          {/* Hero section */}
          <Animated.View
            style={{
              opacity: fadeAnim,
              transform: [{ translateY: slideAnim }],
              marginBottom: 36,
            }}
          >
            {step === "landing" && (
              <>
                <Text style={{ color: palette.text, fontSize: 36, fontWeight: "900", lineHeight: 40, letterSpacing: -0.5 }}>
                  Välkommen{"\n"}<Text style={{ color: palette.gold }}>till MatGo</Text>
                </Text>
                <Text style={{ color: palette.muted, fontSize: 14, fontWeight: "500", marginTop: 10, lineHeight: 21 }}>
                  Snabb matleverans till din dörr. Skapa ett konto eller logga in för att komma igång.
                </Text>
              </>
            )}
            {step === "phone" && (
              <>
                <Text style={{ color: palette.text, fontSize: 30, fontWeight: "900", letterSpacing: -0.5 }}>
                  Ditt telefon{"\n"}nummer
                </Text>
                <Text style={{ color: palette.muted, fontSize: 13, fontWeight: "500", marginTop: 10, lineHeight: 20 }}>
                  Vi skickar ett engångslösenord via SMS för att verifiera din identitet.
                </Text>
              </>
            )}
            {step === "profile" && (
              <>
                <Text style={{ color: palette.text, fontSize: 30, fontWeight: "900", letterSpacing: -0.5 }}>
                  Din profil
                </Text>
                <Text style={{ color: palette.muted, fontSize: 13, fontWeight: "500", marginTop: 10, lineHeight: 20 }}>
                  Det verkar vara ditt första besök! Berätta lite mer om dig själv.
                </Text>
              </>
            )}
            {step === "otp" && (
              <>
                <Text style={{ color: palette.text, fontSize: 30, fontWeight: "900", letterSpacing: -0.5 }}>
                  Ange{"\n"}SMS-koden
                </Text>
                <Text style={{ color: palette.muted, fontSize: 13, fontWeight: "500", marginTop: 10, lineHeight: 20 }}>
                  Koden skickades till{" "}
                  <Text style={{ color: palette.text, fontWeight: "700" }}>{otpPhone}</Text>
                </Text>
              </>
            )}
          </Animated.View>

          {/* Step content */}
          <Animated.View
            style={{
              opacity: stepAnim,
              transform: [{ translateY: stepAnim.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }],
              gap: 14,
            }}
          >
            {/* ── LANDING ── */}
            {step === "landing" && (
              <>
                {/* Phone CTA — primary */}
                <Pressable
                  onPress={() => { 
                    setError(""); 
                    setIsGoogleLinking(false); 
                    setIsNewUser(false);
                    setStep("phone"); 
                  }}
                  style={{
                    backgroundColor: palette.gold,
                    borderRadius: 22,
                    paddingVertical: 18,
                    alignItems: "center",
                    shadowColor: palette.gold,
                    shadowOpacity: 0.4,
                    shadowRadius: 20,
                    shadowOffset: { width: 0, height: 8 },
                  }}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                    <Ionicons name="phone-portrait-outline" size={20} color="#000" />
                    <Text style={{ color: "#000", fontWeight: "900", fontSize: 15, letterSpacing: 0.2 }}>Logga in med telefonnummer</Text>
                  </View>
                </Pressable>

                {/* Divider */}
                <View style={{ flexDirection: "row", alignItems: "center", gap: 14, marginVertical: 2 }}>
                  <View style={{ flex: 1, height: 1, backgroundColor: palette.border }} />
                  <Text style={{ color: palette.muted, fontSize: 11, fontWeight: "700", letterSpacing: 1 }}>ELLER</Text>
                  <View style={{ flex: 1, height: 1, backgroundColor: palette.border }} />
                </View>

                {/* Google — secondary */}
                <Pressable
                  onPress={googlePrompt}
                  disabled={googleLoading}
                  style={{
                    backgroundColor: palette.panelMuted,
                    borderRadius: 22,
                    paddingVertical: 16,
                    alignItems: "center",
                    borderWidth: 1,
                    borderColor: palette.border,
                    opacity: googleLoading ? 0.6 : 1,
                  }}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                    {googleLoading
                      ? <ActivityIndicator size="small" color={palette.text} />
                      : <Text style={{ fontSize: 17, fontWeight: "700" }}>G</Text>
                    }
                    <Text style={{ color: palette.text, fontWeight: "700", fontSize: 14 }}>Fortsätt med Google</Text>
                  </View>
                </Pressable>

                {/* Guest */}
                <Pressable onPress={handleSkip} style={{ alignItems: "center", paddingVertical: 10 }}>
                  <Text style={{ color: palette.muted, fontSize: 13, fontWeight: "600" }}>
                    Fortsätt utan konto →
                  </Text>
                </Pressable>

                {!!error && (
                  <View style={{ backgroundColor: "rgba(239,68,68,0.1)", borderRadius: 14, padding: 12, borderWidth: 1, borderColor: "rgba(239,68,68,0.2)" }}>
                    <Text style={{ color: "#fca5a5", fontSize: 12, fontWeight: "700", textAlign: "center" }}>{error}</Text>
                  </View>
                )}

                {/* Value props */}
                <View style={{ marginTop: 28, gap: 14 }}>
                  {[
                    { icon: "flash-outline", title: "Snabb leverans", sub: "Leverans på under 45 minuter" },
                    { icon: "gift-outline", title: "Personliga deals", sub: "Exklusiva erbjudanden till ditt konto" },
                    { icon: "location-outline", title: "Spara adresser", sub: "Beställ snabbare nästa gång" },
                  ].map((item) => (
                    <View
                      key={item.icon}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 14,
                        backgroundColor: palette.card,
                        borderRadius: 18,
                        padding: 14,
                        borderWidth: 1,
                        borderColor: palette.border,
                      }}
                    >
                      <View
                        style={{
                          width: 44,
                          height: 44,
                          borderRadius: 14,
                          backgroundColor: "rgba(231,178,75,0.08)",
                          borderWidth: 1,
                          borderColor: "rgba(231,178,75,0.16)",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Ionicons name={item.icon as any} size={19} color={palette.gold} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: palette.text, fontSize: 14, fontWeight: "800" }}>{item.title}</Text>
                        <Text style={{ color: palette.muted, fontSize: 12, fontWeight: "500", marginTop: 2 }}>{item.sub}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              </>
            )}

            {/* ── PHONE ── */}
            {step === "phone" && (
              <>
                <View
                  style={{
                    flexDirection: "row",
                    gap: 10,
                    backgroundColor: palette.card,
                    borderRadius: 20,
                    borderWidth: 1,
                    borderColor: palette.border,
                    padding: 6,
                  }}
                >
                  <Pressable
                    onPress={() => setCountryPickerOpen(true)}
                    style={{
                      backgroundColor: palette.panelMuted,
                      borderRadius: 14,
                      paddingHorizontal: 14,
                      paddingVertical: 14,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <Text style={{ color: palette.text, fontSize: 15, fontWeight: "800" }}>
                      {COUNTRY_CODES.find(c => c.code === countryCode)?.flag || "🇸🇪"} {countryCode}
                    </Text>
                    <Ionicons name="chevron-down" size={13} color={palette.muted} />
                  </Pressable>
                  <TextInput
                    style={{
                      flex: 1,
                      color: palette.text,
                      fontSize: 17,
                      fontWeight: "700",
                      paddingHorizontal: 10,
                      paddingVertical: 14,
                    }}
                    placeholder="70 123 45 67"
                    placeholderTextColor={palette.muted}
                    keyboardType="phone-pad"
                    value={phone}
                    onChangeText={(t) => { setPhone(t); setError(""); }}
                    returnKeyType="done"
                    autoFocus
                  />
                </View>

                {/* Country picker modal */}
                <Modal visible={countryPickerOpen} transparent animationType="slide" onRequestClose={() => setCountryPickerOpen(false)}>
                  <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.7)" }} onPress={() => setCountryPickerOpen(false)}>
                    <View
                      style={{
                        position: "absolute",
                        bottom: 0,
                        left: 0,
                        right: 0,
                        backgroundColor: "#1a1624",
                        borderTopLeftRadius: 32,
                        borderTopRightRadius: 32,
                        padding: 28,
                        paddingBottom: 48,
                        gap: 6,
                      }}
                    >
                      {/* Drag handle */}
                      <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.15)", alignSelf: "center", marginBottom: 16 }} />
                      <Text style={{ color: palette.text, fontWeight: "900", fontSize: 15, marginBottom: 12, textAlign: "center" }}>Välj landsnummer</Text>
                      {COUNTRY_CODES.map(cc => (
                        <Pressable
                          key={cc.code}
                          onPress={() => { setCountryCode(cc.code); setCountryPickerOpen(false); }}
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 14,
                            paddingVertical: 14,
                            paddingHorizontal: 16,
                            borderRadius: 18,
                            backgroundColor: countryCode === cc.code ? "rgba(231,178,75,0.1)" : "transparent",
                            borderWidth: countryCode === cc.code ? 1 : 0,
                            borderColor: "rgba(231,178,75,0.2)",
                          }}
                        >
                          <Text style={{ fontSize: 26 }}>{cc.flag}</Text>
                          <Text style={{ color: palette.text, fontWeight: "700", flex: 1, fontSize: 15 }}>{cc.name}</Text>
                          <Text style={{ color: palette.gold, fontWeight: "900", fontSize: 14 }}>{cc.code}</Text>
                        </Pressable>
                      ))}
                    </View>
                  </Pressable>
                </Modal>

                {!!error && (
                  <View style={{ backgroundColor: "rgba(239,68,68,0.1)", borderRadius: 14, padding: 12, borderWidth: 1, borderColor: "rgba(239,68,68,0.2)" }}>
                    <Text style={{ color: "#fca5a5", fontSize: 12, fontWeight: "700", textAlign: "center" }}>{error}</Text>
                  </View>
                )}

                <Pressable
                  onPress={handleCheckPhone}
                  disabled={loading || !phone.trim()}
                  style={{
                    backgroundColor: palette.gold,
                    borderRadius: 22,
                    paddingVertical: 18,
                    alignItems: "center",
                    opacity: loading || !phone.trim() ? 0.55 : 1,
                    marginTop: 4,
                    shadowColor: palette.gold,
                    shadowOpacity: 0.35,
                    shadowRadius: 16,
                    shadowOffset: { width: 0, height: 6 },
                  }}
                >
                  {loading
                    ? <ActivityIndicator color="#000" />
                    : <Text style={{ color: "#000", fontWeight: "900", fontSize: 15 }}>{isGoogleLinking ? "Verifiera mitt nummer →" : "Fortsätt →"}</Text>
                  }
                </Pressable>
              </>
            )}

            {/* ── PROFILE ── */}
            {step === "profile" && (
              <>
                <TextInput
                  style={[styles.input, { paddingVertical: 18 }]}
                  placeholder="Förnamn & Efternamn"
                  placeholderTextColor={palette.muted}
                  value={name}
                  onChangeText={(t) => { setName(t); setError(""); }}
                />
                <TextInput
                  style={[styles.input, { paddingVertical: 18 }]}
                  placeholder="Din e-post"
                  placeholderTextColor={palette.muted}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  value={email}
                  onChangeText={(t) => { setEmail(t); setError(""); }}
                />

                {!!error && (
                  <View style={{ backgroundColor: "rgba(239,68,68,0.1)", borderRadius: 14, padding: 12, borderWidth: 1, borderColor: "rgba(239,68,68,0.2)" }}>
                    <Text style={{ color: "#fca5a5", fontSize: 12, fontWeight: "700", textAlign: "center" }}>{error}</Text>
                  </View>
                )}

                <Pressable
                  onPress={handleProfileSubmit}
                  disabled={!name.trim() || !email.trim()}
                  style={{
                    backgroundColor: palette.gold,
                    borderRadius: 22,
                    paddingVertical: 18,
                    alignItems: "center",
                    opacity: !name.trim() || !email.trim() ? 0.55 : 1,
                    marginTop: 4,
                  }}
                >
                  <Text style={{ color: "#000", fontWeight: "900", fontSize: 15 }}>Nästa →</Text>
                </Pressable>

                <Pressable onPress={() => { setStep("phone"); setError(""); }} style={{ alignItems: "center", paddingVertical: 10 }}>
                  <Text style={{ color: palette.muted, fontSize: 13, fontWeight: "600" }}>← Ändra nummer</Text>
                </Pressable>
              </>
            )}

            {/* ── ALLERGENS ── */}
            {step === "allergens" && (
              <>
                <Text style={{ color: palette.text, fontSize: 30, fontWeight: "900", letterSpacing: -0.5 }}>
                  Matallergier?
                </Text>
                <Text style={{ color: palette.muted, fontSize: 13, fontWeight: "500", marginTop: 10, lineHeight: 20 }}>
                  Välj om du har några allergier så kan vi dölja fel mat från din meny.
                </Text>
                
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 24, marginBottom: 16 }}>
                  {PREFERENCE_OPTIONS.map((pref) => {
                    const active = allergens.includes(pref);
                    return (
                      <Pressable
                        key={pref}
                        onPress={() => {
                          if (active) setAllergens(allergens.filter(a => a !== pref));
                          else setAllergens([...allergens, pref]);
                        }}
                        style={{
                          paddingHorizontal: 14,
                          paddingVertical: 10,
                          borderRadius: 14,
                          backgroundColor: active ? "rgba(234,181,69,0.15)" : palette.panelMuted,
                          borderWidth: 1,
                          borderColor: active ? palette.gold : palette.border,
                        }}
                      >
                        <Text style={{ color: active ? palette.gold : palette.muted, fontSize: 13, fontWeight: "800" }}>{pref}</Text>
                      </Pressable>
                    );
                  })}
                </View>

                {!!error && (
                  <View style={{ backgroundColor: "rgba(239,68,68,0.1)", borderRadius: 14, padding: 12, borderWidth: 1, borderColor: "rgba(239,68,68,0.2)" }}>
                    <Text style={{ color: "#fca5a5", fontSize: 12, fontWeight: "700", textAlign: "center" }}>{error}</Text>
                  </View>
                )}

                <Pressable
                  onPress={handleAllergensSubmit}
                  disabled={loading}
                  style={{
                    backgroundColor: palette.gold,
                    borderRadius: 22,
                    paddingVertical: 18,
                    alignItems: "center",
                    opacity: loading ? 0.55 : 1,
                    marginTop: 4,
                  }}
                >
                  {loading
                    ? <ActivityIndicator color="#000" />
                    : <Text style={{ color: "#000", fontWeight: "900", fontSize: 15 }}>Se koden →</Text>
                  }
                </Pressable>

                <Pressable onPress={() => { setStep("profile"); setError(""); }} style={{ alignItems: "center", paddingVertical: 10, marginTop: 10 }}>
                  <Text style={{ color: palette.muted, fontSize: 13, fontWeight: "600" }}>← Tillbaka</Text>
                </Pressable>
              </>
            )}

            {/* ── OTP ── */}
            {step === "otp" && (
              <>
                {/* OTP box */}
                <View
                  style={{
                    backgroundColor: palette.panelMuted,
                    borderRadius: 20,
                    borderWidth: 1,
                    borderColor: "rgba(234,181,69,0.2)",
                    padding: 6,
                  }}
                >
                  <TextInput
                    style={{
                      color: palette.gold,
                      fontSize: 32,
                      fontWeight: "900",
                      textAlign: "center",
                      letterSpacing: 14,
                      paddingVertical: 20,
                      paddingHorizontal: 14,
                    }}
                    placeholder="——————"
                    placeholderTextColor="rgba(234,181,69,0.2)"
                    keyboardType="number-pad"
                    maxLength={6}
                    value={otpCode}
                    onChangeText={(t) => { setOtpCode(t); setError(""); }}
                    returnKeyType="done"
                    onSubmitEditing={handleVerifyOtp}
                    autoFocus
                  />
                </View>

                {!!error && (
                  <View style={{ backgroundColor: "rgba(239,68,68,0.1)", borderRadius: 14, padding: 12, borderWidth: 1, borderColor: "rgba(239,68,68,0.2)" }}>
                    <Text style={{ color: "#fca5a5", fontSize: 12, fontWeight: "700", textAlign: "center" }}>{error}</Text>
                  </View>
                )}

                <Pressable
                  onPress={handleVerifyOtp}
                  disabled={loading || otpCode.length < 4}
                  style={{
                    backgroundColor: palette.gold,
                    borderRadius: 22,
                    paddingVertical: 18,
                    alignItems: "center",
                    opacity: loading || otpCode.length < 4 ? 0.55 : 1,
                    shadowColor: palette.gold,
                    shadowOpacity: 0.35,
                    shadowRadius: 16,
                    shadowOffset: { width: 0, height: 6 },
                  }}
                >
                  {loading
                    ? <ActivityIndicator color="#000" />
                    : <Text style={{ color: "#000", fontWeight: "900", fontSize: 15 }}>Verifiera och logga in →</Text>
                  }
                </Pressable>

                <Pressable
                  onPress={() => { setStep("phone"); setOtpCode(""); setError(""); }}
                  style={{ alignItems: "center", paddingVertical: 10 }}
                >
                  <Text style={{ color: palette.muted, fontSize: 13, fontWeight: "600" }}>Fick ingen kod? Skicka igen</Text>
                </Pressable>
              </>
            )}
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}