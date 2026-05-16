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

      // Två svars-format:
      // 1. Ny user: { ok: true, token, email, user } → vi loggar in direkt
      // 2. Email finns redan: { ok: true, message } UTAN token →
      //    email-enumeration-skydd. Vi visar success-vyn ändå så user vet
      //    att registrering togs emot (oavsett om kontot var nytt eller
      //    befintligt). User får klicka mejl-länk för att aktivera/logga in.
      const tok = data?.token;

      if (tok) {
        setToken(tok);
        let prof: any = data?.user;
        try {
          const profileRes = await api.get("/api/profile", {
            headers: { Authorization: `Bearer ${tok}` },
          });
          prof = profileRes.data;
        } catch {
          // Profil-fetch är best-effort
        }
        if (prof) setProfile(prof);
      }
      // Visa success-vyn även om vi inte fick token (email-existerar-fall).
      // User får läsa "Verifieringsmejl skickat" och klicka "Fortsätt"
      // manuellt — bumpar dem till login om de inte loggades in automatiskt.
      setSuccess(true);
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
            <View style={{ backgroundColor: "rgba(16,185,129,0.10)", borderRadius: 18, padding: 22, borderWidth: 1, borderColor: "rgba(16,185,129,0.25)", gap: 10 }}>
              <Text style={{ color: "#34d399", fontSize: 13, fontWeight: "900", textAlign: "center", letterSpacing: 0.4 }}>
                ✓ KONTO SKAPAT
              </Text>
              <Text style={{ color: palette.text, fontSize: 16, fontWeight: "700", textAlign: "center", lineHeight: 22 }}>
                Verifieringsmejl skickat till{"\n"}
                <Text style={{ color: palette.gold, fontWeight: "900" }}>{email.trim()}</Text>
              </Text>
              <Text style={{ color: palette.muted, fontSize: 12, fontWeight: "500", textAlign: "center", lineHeight: 18, marginTop: 4 }}>
                Klicka på länken i mejlet för att verifiera din e-post. Du
                kan börja använda appen direkt — verifiering är frivillig
                men hjälper oss att skydda kontot.
              </Text>
              <Text style={{ color: palette.muted, fontSize: 10, fontWeight: "500", textAlign: "center", marginTop: 2, fontStyle: "italic" }}>
                Hittar du inte mejlet? Kolla i skräppost.
              </Text>
            </View>
            <Pressable
              onPress={onRegistered}
              style={{
                backgroundColor: palette.gold,
                borderRadius: 22,
                paddingVertical: 18,
                alignItems: "center",
                marginTop: 6,
                shadowColor: palette.gold,
                shadowOpacity: 0.35,
                shadowOffset: { width: 0, height: 6 },
                shadowRadius: 14,
              }}
            >
              <Text style={{ color: "#000", fontSize: 14, fontWeight: "900", letterSpacing: 1 }}>
                FORTSÄTT TILL APPEN
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
          <View>
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
            {/* Password strength — visas bara när användaren har börjat
                skriva. Standard 4-nivå-bar (weak/okay/good/strong) baserat
                på längd + variation. Ingen tvingande regel, bara hint. */}
            {password.length > 0 && (() => {
              // Räkna ut styrka 0-4
              let score = 0;
              if (password.length >= 6) score++;
              if (password.length >= 10) score++;
              if (/[a-zåäö]/.test(password) && /[A-ZÅÄÖ]/.test(password)) score++;
              if (/\d/.test(password) || /[^a-zA-ZåäöÅÄÖ0-9]/.test(password)) score++;
              const labels = ["Svagt", "Okej", "Bra", "Starkt"];
              const colors = ["#ef4444", "#f59e0b", "#3b82f6", "#10b981"];
              const idx = Math.min(3, Math.max(0, score - 1));
              const activeBars = Math.max(1, score);
              return (
                <View style={{ marginTop: 8, paddingHorizontal: 4 }}>
                  <View style={{ flexDirection: "row", gap: 4 }}>
                    {[0, 1, 2, 3].map((i) => (
                      <View
                        key={i}
                        style={{
                          flex: 1,
                          height: 4,
                          borderRadius: 2,
                          backgroundColor: i < activeBars ? colors[idx] : palette.border,
                        }}
                      />
                    ))}
                  </View>
                  <Text style={{ color: colors[idx], fontSize: 11, fontWeight: "700", marginTop: 6, letterSpacing: 0.3 }}>
                    Lösenord: {labels[idx]}
                  </Text>
                </View>
              );
            })()}
          </View>

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
