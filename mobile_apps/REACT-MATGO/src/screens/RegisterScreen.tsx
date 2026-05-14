import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, Pressable, Platform, Animated, ActivityIndicator } from 'react-native';
import { useAppStore } from '../store/useAppStore';
import { api } from '../lib/api';
import { useSharedStyles, useTheme } from '../theme';
import { Header, ScreenWrap } from '../components/ui';

// Mirrors the web register flow (apps/web/app/register/page.tsx):
//   POST /api/account/register-user  { firstName, lastName, email, phone, password }
//   → { token, user }
//
// We no longer call /api/auth/send-otp or /api/auth/verify-otp — those routes
// were removed from the backend. Phone is collected as contact info (required
// by the API for uniqueness) but is never SMS-verified by this client.
export default function RegisterScreen({
  initialPhone = "",
  goBack,
  onRegistered,
}: {
  initialPhone?: string;
  goBack: () => void;
  onRegistered: () => void;
}) {
  const { palette } = useTheme();
  const styles = useSharedStyles();
  const setToken = useAppStore((s) => s.setToken);
  const setProfile = useAppStore((s) => s.setProfile);

  // Single-form flow now: collect everything on one screen and POST once.
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState(initialPhone || "");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  // Visa en kort bekräftelse efter registreringen så användaren förstår att
  // ett verifieringsmejl är på väg innan vi skickar dem vidare till hub:en.
  const [verificationSent, setVerificationSent] = useState(false);

  const enterAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(enterAnim, { toValue: 1, tension: 60, friction: 10, useNativeDriver: Platform.OS !== "web" }).start();
  }, []);

  const handleRegister = async () => {
    setError("");
    if (!firstName.trim()) { setError("Ange ditt förnamn"); return; }
    if (!lastName.trim()) { setError("Ange ditt efternamn"); return; }
    if (!email.trim() || !email.includes("@")) { setError("Ange en giltig e-post"); return; }
    if (!phone.trim()) { setError("Ange ditt telefonnummer"); return; }
    if (!password || password.length < 6) { setError("Lösenordet måste vara minst 6 tecken"); return; }

    // Default to Swedish country code when the user types a local-format number.
    // The web's input accepts the international form already; on RN we mirror
    // the OTP screen's helper that strips a leading zero and prefixes +46.
    const trimmedPhone = phone.trim();
    const internationalPhone = trimmedPhone.startsWith("+")
      ? trimmedPhone
      : `+46${trimmedPhone.replace(/\D/g, "").replace(/^0/, "")}`;

    setLoading(true);
    try {
      const { data } = await api.post("/api/account/register-user", {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim(),
        phone: internationalPhone,
        password,
      });
      const tok = data?.token;
      if (!tok) throw new Error("Ingen session mottogs");

      setToken(tok);

      // Trigger verification email — fire-and-forget. Backend returnerar alltid
      // 200 (läcker inte konto-existens) men nätverksfel ska inte fälla flödet.
      // Matchar OnboardingScreen email-flow så alla register-paths skickar mejlet.
      api.post("/api/account/send-verification-email", { email: email.trim() }).catch(() => null);

      // Fetch the full profile so the rest of the app sees the same shape it
      // gets after OAuth login (needsPhone flag, isVerified, image, etc.).
      try {
        const profileRes = await api.get("/api/profile", {
          headers: { Authorization: `Bearer ${tok}` },
        });
        setProfile(profileRes.data);
      } catch {
        // Fallback to the minimal user object the register endpoint returned.
        if (data?.user) setProfile(data.user);
      }
      // Litet inline-notis-fönster så användaren vet att verifieringslänken är
      // skickad innan vi flyttar till nästa steg (App.tsx-routing tar över).
      setVerificationSent(true);
      setTimeout(() => onRegistered(), 2200);
    } catch (e: any) {
      setError(e?.response?.data?.error || e?.message || "Registrering misslyckades");
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScreenWrap>
      <Header title="Registrering" onBack={goBack} />

      <Animated.View
        style={{
          paddingHorizontal: 6,
          paddingTop: 18,
          paddingBottom: 40,
          opacity: enterAnim,
          transform: [{ translateY: enterAnim.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }],
        }}
      >
        <Text style={{ color: palette.text, fontSize: 32, fontWeight: "900", letterSpacing: -0.5, marginBottom: 8 }}>
          Skapa konto
        </Text>
        <Text style={{ color: palette.muted, fontSize: 13, fontWeight: "500", marginBottom: 24, lineHeight: 20 }}>
          Fyll i dina uppgifter för att skapa ett konto.
        </Text>

        <View style={{ gap: 12 }}>
          <TextInput
            style={[styles.input, { fontSize: 16, fontWeight: "700", paddingVertical: 18, marginBottom: 0 }]}
            placeholder="Förnamn"
            placeholderTextColor={palette.muted}
            value={firstName}
            onChangeText={(t) => { setFirstName(t); setError(""); }}
            autoCapitalize="words"
            autoComplete="given-name"
            textContentType="givenName"
          />
          <TextInput
            style={[styles.input, { fontSize: 16, fontWeight: "700", paddingVertical: 18, marginBottom: 0 }]}
            placeholder="Efternamn"
            placeholderTextColor={palette.muted}
            value={lastName}
            onChangeText={(t) => { setLastName(t); setError(""); }}
            autoCapitalize="words"
            autoComplete="family-name"
            textContentType="familyName"
          />
          <TextInput
            style={[styles.input, { fontSize: 16, fontWeight: "700", paddingVertical: 18, marginBottom: 0 }]}
            placeholder="din.epost@exempel.se"
            placeholderTextColor={palette.muted}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            textContentType="emailAddress"
            value={email}
            onChangeText={(t) => { setEmail(t); setError(""); }}
          />
          <TextInput
            style={[styles.input, { fontSize: 16, fontWeight: "700", paddingVertical: 18, marginBottom: 0 }]}
            placeholder="070 123 45 67"
            placeholderTextColor={palette.muted}
            keyboardType="phone-pad"
            autoComplete="tel"
            textContentType="telephoneNumber"
            value={phone}
            onChangeText={(t) => { setPhone(t); setError(""); }}
          />
          <TextInput
            style={[styles.input, { fontSize: 16, fontWeight: "700", paddingVertical: 18, marginBottom: 0 }]}
            placeholder="Välj lösenord (minst 6 tecken)"
            placeholderTextColor={palette.muted}
            secureTextEntry
            autoCapitalize="none"
            autoComplete="password-new"
            textContentType="newPassword"
            value={password}
            onChangeText={(t) => { setPassword(t); setError(""); }}
            onSubmitEditing={handleRegister}
          />

          {!!error && (
            <View style={{ backgroundColor: "rgba(239,68,68,0.1)", borderRadius: 14, padding: 12, borderWidth: 1, borderColor: "rgba(239,68,68,0.2)" }}>
              <Text style={{ color: "#fca5a5", fontSize: 12, fontWeight: "700", textAlign: "center" }}>{error}</Text>
            </View>
          )}

          {verificationSent && (
            <View style={{ backgroundColor: "rgba(16,185,129,0.10)", borderRadius: 14, padding: 14, borderWidth: 1, borderColor: "rgba(16,185,129,0.25)", gap: 4 }}>
              <Text style={{ color: "#34d399", fontSize: 12, fontWeight: "900", textAlign: "center", letterSpacing: 0.4 }}>
                Verifieringslänk skickad
              </Text>
              <Text style={{ color: palette.muted, fontSize: 11, fontWeight: "500", textAlign: "center", lineHeight: 15 }}>
                Kolla {email.trim()} för att slutföra ditt konto.
              </Text>
            </View>
          )}

          <Pressable
            onPress={handleRegister}
            disabled={loading || verificationSent}
            style={{
              backgroundColor: palette.gold,
              borderRadius: 22,
              paddingVertical: 18,
              alignItems: "center",
              opacity: loading || verificationSent ? 0.55 : 1,
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
                  Skapa konto
                </Text>
            }
          </Pressable>
        </View>
      </Animated.View>
    </ScreenWrap>
  );
}
