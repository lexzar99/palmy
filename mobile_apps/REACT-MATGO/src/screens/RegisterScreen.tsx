import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, Pressable, Platform, Animated, ActivityIndicator } from 'react-native';
import { api } from '../lib/api';
import { useSharedStyles, useTheme } from '../theme';
import { Header, ScreenWrap } from '../components/ui';

// Mirrors the web register flow (apps/web/app/register/page.tsx):
//   POST /api/account/register-user  { firstName, lastName, email, phone, password }
//   → { ok, email, message }   ← INGEN JWT längre
//
// Sedan email-verification-gaten infördes utfärdar /register-user inte längre
// någon token. Backend skickar verifieringsmejlet inline. Klienten visar
// "kolla din mejl"-state och låter användaren resendera mejlet eller gå
// tillbaka till login. Användaren loggas in först när de klickar i mejlet —
// då tar deep-länken `foodgo://verify-email` över i App.tsx och får JWT från
// /verify-email.
//
// Vi anropar inte längre /api/auth/send-otp eller /api/auth/verify-otp —
// rutterna är borttagna från backend. Telefon samlas som kontaktinfo (krävs
// av API:t för uniqueness) men SMS-verifieras inte av klienten.
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

  // Single-form flow now: collect everything on one screen and POST once.
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState(initialPhone || "");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  // Persistent "kolla din mejl"-state efter lyckad registrering. Visar
  // bekräftelse + resend-knapp + möjlighet att gå tillbaka. INGEN auto-
  // redirect — användaren stannar tills de klickar i mejlet eller
  // navigerar bort manuellt.
  const [registeredEmail, setRegisteredEmail] = useState<string>("");
  const [resending, setResending] = useState(false);
  const [resendStatus, setResendStatus] = useState<"idle" | "sent" | "error">("idle");

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
      await api.post("/api/account/register-user", {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim(),
        phone: internationalPhone,
        password,
      });
      // Backend svarade { ok, email, message } — kontot är skapat och
      // verifieringsmejlet är skickat. INGEN setToken här (backend
      // returnerar inte längre någon JWT). Visa "kolla din mejl"-state.
      setRegisteredEmail(email.trim());
    } catch (e: any) {
      setError(e?.response?.data?.error || e?.message || "Registrering misslyckades");
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (!registeredEmail) return;
    setResending(true);
    setResendStatus("idle");
    try {
      await api.post("/api/account/send-verification-email", { email: registeredEmail });
      setResendStatus("sent");
    } catch {
      setResendStatus("error");
    } finally {
      setResending(false);
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
          {registeredEmail ? "Kolla din mejl" : "Skapa konto"}
        </Text>
        <Text style={{ color: palette.muted, fontSize: 13, fontWeight: "500", marginBottom: 24, lineHeight: 20 }}>
          {registeredEmail
            ? "Vi skickade en verifieringslänk. Klicka på den för att slutföra registreringen och logga in."
            : "Fyll i dina uppgifter för att skapa ett konto."}
        </Text>

        {registeredEmail ? (
          <View style={{ gap: 14 }}>
            <View style={{ backgroundColor: "rgba(16,185,129,0.10)", borderRadius: 18, padding: 18, borderWidth: 1, borderColor: "rgba(16,185,129,0.25)", gap: 6 }}>
              <Text style={{ color: "#34d399", fontSize: 12, fontWeight: "900", textAlign: "center", letterSpacing: 0.4 }}>
                Verifieringslänk skickad
              </Text>
              <Text style={{ color: palette.text, fontSize: 14, fontWeight: "700", textAlign: "center", lineHeight: 20 }}>
                {registeredEmail}
              </Text>
              <Text style={{ color: palette.muted, fontSize: 11, fontWeight: "500", textAlign: "center", lineHeight: 16 }}>
                Klicka på länken i mejlet på samma enhet — appen loggar in dig automatiskt.
                Länken gäller i 24 timmar.
              </Text>
            </View>

            {resendStatus === "sent" && (
              <View style={{ backgroundColor: "rgba(16,185,129,0.1)", borderRadius: 14, padding: 10, borderWidth: 1, borderColor: "rgba(16,185,129,0.2)" }}>
                <Text style={{ color: "#34d399", fontSize: 11, fontWeight: "700", textAlign: "center" }}>
                  Vi skickade länken igen.
                </Text>
              </View>
            )}
            {resendStatus === "error" && (
              <View style={{ backgroundColor: "rgba(239,68,68,0.1)", borderRadius: 14, padding: 10, borderWidth: 1, borderColor: "rgba(239,68,68,0.2)" }}>
                <Text style={{ color: "#fca5a5", fontSize: 11, fontWeight: "700", textAlign: "center" }}>
                  Kunde inte skicka igen — försök strax.
                </Text>
              </View>
            )}

            <Pressable
              onPress={handleResend}
              disabled={resending || resendStatus === "sent"}
              style={{
                backgroundColor: "rgba(231,178,75,0.08)",
                borderWidth: 1,
                borderColor: "rgba(231,178,75,0.35)",
                borderRadius: 18,
                paddingVertical: 14,
                alignItems: "center",
                opacity: resending || resendStatus === "sent" ? 0.6 : 1,
              }}
            >
              {resending ? (
                <ActivityIndicator color={palette.gold} />
              ) : (
                <Text style={{ color: palette.gold, fontWeight: "900", fontSize: 13 }}>
                  Skicka igen
                </Text>
              )}
            </Pressable>

            <Pressable
              onPress={() => { onRegistered(); }}
              style={{ alignItems: "center", paddingVertical: 12 }}
            >
              <Text style={{ color: palette.muted, fontSize: 12, fontWeight: "700" }}>
                Tillbaka till login
              </Text>
            </Pressable>
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
