import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, Pressable, Platform, ScrollView, Animated, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppStore } from '../store/useAppStore';
import { api } from '../lib/api';
import { palette, styles } from '../constants/theme';
import { Header, ScreenWrap } from '../components/ui';

export default function RegisterScreen({
  initialPhone = "",
  goBack,
  onRegistered,
}: {
  initialPhone?: string;
  goBack: () => void;
  onRegistered: () => void;
}) {
  const setToken = useAppStore((s) => s.setToken);
  const setProfile = useAppStore((s) => s.setProfile);

  // Steps: "phone" -> "name" -> "email" -> "otp"
  const [step, setStep] = useState<"phone" | "name" | "email" | "otp">(initialPhone ? "name" : "phone");

  const [phone, setPhone] = useState(initialPhone?.replace(/^\+\d{1,4}0?/, '') || ""); // Stripping cc for visual (supports 1–4 digit country codes e.g. +358)
  const [fullPhone, setFullPhone] = useState(initialPhone || "");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [otpCode, setOtpCode] = useState("");
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  
  const stepAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    stepAnim.setValue(0);
    Animated.spring(stepAnim, { toValue: 1, tension: 60, friction: 10, useNativeDriver: Platform.OS !== "web" }).start();
  }, [step]);

  const nextStep = () => {
    setError("");
    if (step === "phone") {
      if (!phone.trim()) { setError("Ange ditt telefonnummer"); return; }
      const countryCode = "+46"; // Defaulting to Swedish for simplicity (could add picker)
      const parsedFull = `${countryCode}${phone.replace(/\D/g, "").replace(/^0/, "")}`;
      setFullPhone(parsedFull);
      setStep("name");
    } else if (step === "name") {
      if (!name.trim()) { setError("Ange ditt namn"); return; }
      setStep("email");
    } else if (step === "email") {
      if (!email.trim() || !email.includes("@")) { setError("Ange en giltig e-post"); return; }
      triggerOtp();
    }
  };

  const prevStep = () => {
    setError("");
    if (step === "name") setStep("phone");
    else if (step === "email") setStep("name");
    else if (step === "otp") setStep("email");
  };

  const triggerOtp = async () => {
    setLoading(true);
    try {
      const { data } = await api.post("/api/auth/send-otp", { phone: fullPhone });
      if (data?.devCode) setOtpCode(data.devCode);
      setStep("otp");
    } catch (e: any) {
      setError(e?.response?.data?.error || e?.message || "Kunde inte skicka SMS");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!otpCode.trim()) { setError("Ange koden från SMS:et"); return; }
    setLoading(true); setError("");
    try {
      // Verify with our Twilio-backed endpoint. Backend creates / fetches the
      // user keyed by phone (one phone = one account, enforced by the unique
      // constraint) and returns our own JWT.
      const { data } = await api.post("/api/auth/verify-otp", {
        phone: fullPhone,
        code: otpCode,
        name: name.trim(),
        email: email.trim() || undefined,
      });
      const tok = data?.token;
      if (!tok) throw new Error("Ingen session mottogs");

      setToken(tok);

      // Persist any extra fields collected during registration.
      try {
        await api.patch("/api/profile", {
          name: name.trim(),
          email: email.trim() || null,
        }, {
           headers: { Authorization: `Bearer ${tok}` },
        });
      } catch {}

      const profileRes = await api.get("/api/profile", {
         headers: { Authorization: `Bearer ${tok}` },
      });
      setProfile(profileRes.data);
      onRegistered();
    } catch (e: any) {
      setError(e?.response?.data?.error || e?.message || "Felaktig kod");
    } finally { setLoading(false); }
  };

  const getStepTitle = () => {
    if (step === "phone") return "Logga in / Skapa";
    if (step === "name") return "Ditt namn";
    if (step === "email") return "Din e-post";
    return "Verifiera";
  };

  const getStepSubtitle = () => {
    if (step === "phone") return "Vilket telefonnummer använder du?";
    if (step === "name") return "Vad heter du?";
    if (step === "email") return "Kvitto och erbjudanden skickas hit.";
    return `Ange koden som skickades till ${fullPhone}`;
  };

  return (
    <ScreenWrap>
      <Header title="Registrering" onBack={step === "phone" || (step === "name" && initialPhone) ? goBack : prevStep} />
      
      <View style={{ paddingHorizontal: 6, paddingTop: 18, paddingBottom: 40 }}>
        
        <Text style={{ color: palette.text, fontSize: 32, fontWeight: "900", letterSpacing: -0.5, marginBottom: 8 }}>
          {getStepTitle()}
        </Text>
        <Text style={{ color: palette.muted, fontSize: 13, fontWeight: "500", marginBottom: 32, lineHeight: 20 }}>
          {getStepSubtitle()}
        </Text>

        <Animated.View
          style={{
            opacity: stepAnim,
            transform: [{ translateX: stepAnim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }],
            gap: 16,
          }}
        >
          {step === "phone" && (
            <TextInput
              style={[styles.input, { fontSize: 20, fontWeight: "700", paddingVertical: 20 }]}
              placeholder="070 123 45 67"
              placeholderTextColor={palette.muted}
              keyboardType="phone-pad"
              value={phone}
              onChangeText={(t) => { setPhone(t); setError(""); }}
              autoFocus
              onSubmitEditing={nextStep}
            />
          )}

          {step === "name" && (
            <TextInput
              style={[styles.input, { fontSize: 18, fontWeight: "700", paddingVertical: 20 }]}
              placeholder="Förnamn & Efternamn"
              placeholderTextColor={palette.muted}
              value={name}
              onChangeText={(t) => { setName(t); setError(""); }}
              autoFocus
              onSubmitEditing={nextStep}
            />
          )}

          {step === "email" && (
            <TextInput
              style={[styles.input, { fontSize: 18, fontWeight: "700", paddingVertical: 20 }]}
              placeholder="din.epost@exempel.se"
              placeholderTextColor={palette.muted}
              keyboardType="email-address"
              autoCapitalize="none"
              value={email}
              onChangeText={(t) => { setEmail(t); setError(""); }}
              autoFocus
              onSubmitEditing={nextStep}
            />
          )}

          {step === "otp" && (
             <View
               style={{
                 backgroundColor: palette.panelMuted,
                 borderRadius: 20,
                 borderWidth: 1,
                 borderColor: palette.border,
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
                 autoFocus
                 onSubmitEditing={handleVerifyOtp}
               />
             </View>
          )}

          {!!error && (
            <View style={{ backgroundColor: "rgba(239,68,68,0.1)", borderRadius: 14, padding: 12, borderWidth: 1, borderColor: "rgba(239,68,68,0.2)" }}>
              <Text style={{ color: "#fca5a5", fontSize: 12, fontWeight: "700", textAlign: "center" }}>{error}</Text>
            </View>
          )}

          <Pressable
            onPress={step === "otp" ? handleVerifyOtp : nextStep}
            disabled={loading}
            style={{
              backgroundColor: palette.gold,
              borderRadius: 22,
              paddingVertical: 18,
              alignItems: "center",
              opacity: loading ? 0.55 : 1,
              marginTop: 10,
              shadowColor: palette.gold,
              shadowOpacity: 0.35,
              shadowRadius: 16,
              shadowOffset: { width: 0, height: 6 },
            }}
          >
            {loading
              ? <ActivityIndicator color="#000" />
              : <Text style={{ color: "#000", fontWeight: "900", fontSize: 15 }}>
                  {step === "otp" ? "Verifiera & Klar" : "Fortsätt →"}
                </Text>
            }
          </Pressable>

          {step === "otp" && (
            <Pressable onPress={triggerOtp} style={{ alignItems: "center", marginTop: 10, paddingVertical: 10 }}>
              <Text style={{ color: palette.muted, fontSize: 13, fontWeight: "600" }}>Skicka ny kod</Text>
            </Pressable>
          )}

        </Animated.View>
      </View>
    </ScreenWrap>
  );
}
