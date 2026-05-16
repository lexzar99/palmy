import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, Pressable, Platform, Animated, ActivityIndicator } from 'react-native';
import { api } from '../lib/api';
import { useAppStore } from '../store/useAppStore';
import { useSharedStyles, useTheme } from '../theme';
import { Header, ScreenWrap } from '../components/ui';

// Mirrors the web register flow (apps/web/app/register/page.tsx):
//   POST /api/account/register-user  { firstName, lastName, email, phone, password }
//   → { ok, token, user, message }
//
// Backend auto-loggar-in användaren: returnerar JWT + user direkt.
// Verifieringsmejlet skickas fire-and-forget — användaren kan klicka senare
// för att markera kontot som verifierat, men inloggning blockas inte.
// Vi visar en kort "verifieringsmejl skickat"-banner och rör vidare via
// onRegistered().
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
  // Kort success-banner medan vi övergår till inloggat läge. Visas ~2.2s
  // innan vi anropar onRegistered() så användaren ser bekräftelse.
  const [success, setSuccess] = useState(false);

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
      let prof: any = data?.user;
      try {
        const profileRes = await api.get("/api/profile", {
          headers: { Authorization: `Bearer ${tok}` },
        });
        prof = profileRes.data;
      } catch {
        // Profil-fetch är best-effort. /register-user skickar med en basal
        // user-payload som fallback.
      }
      if (prof) setProfile(prof);
      setSuccess(true);
      setTimeout(() => { onRegistered(); }, 2200);
    } catch (e: any) {
      setError(e?.response?.data?.error || e?.message || "Registrering misslyckades");
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScreenWrap keyboardAware>
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
          {success ? "Välkommen!" : "Skapa konto"}
        </Text>
        <Text style={{ color: palette.muted, fontSize: 13, fontWeight: "500", marginBottom: 24, lineHeight: 20 }}>
          {success
            ? "Vi loggar in dig direkt och har skickat en verifieringslänk till din mejl."
            : "Fyll i dina uppgifter för att skapa ett konto."}
        </Text>

        {success ? (
          <View style={{ gap: 14 }}>
            <View style={{ backgroundColor: "rgba(16,185,129,0.10)", borderRadius: 18, padding: 18, borderWidth: 1, borderColor: "rgba(16,185,129,0.25)", gap: 6 }}>
              <Text style={{ color: "#34d399", fontSize: 12, fontWeight: "900", textAlign: "center", letterSpacing: 0.4 }}>
                Verifieringsmejl skickat
              </Text>
              <Text style={{ color: palette.text, fontSize: 14, fontWeight: "700", textAlign: "center", lineHeight: 20 }}>
                {email.trim()}
              </Text>
              <Text style={{ color: palette.muted, fontSize: 11, fontWeight: "500", textAlign: "center", lineHeight: 16 }}>
                Klicka på länken i mejlet när du har en stund för att verifiera din e-post.
              </Text>
            </View>
            <ActivityIndicator color={palette.gold} />
          </View>
        ) : (
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

          <Pressable
            onPress={handleRegister}
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
                  Skapa konto
                </Text>
            }
          </Pressable>
        </View>
        )}
      </Animated.View>
    </ScreenWrap>
  );
}
