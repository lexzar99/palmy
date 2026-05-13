import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { useAppStore } from "../store/useAppStore";
import { api } from "../lib/api";
import { useSharedStyles, useTheme } from "../theme";
import { Header, ScreenWrap } from "../components/ui";

// Email + password login screen. Mirrors the web platform flow
// (apps/web/app/profile/page.tsx → handleEmailLogin):
//   POST /api/account/login-user  { identifier, password } → { token, user }
//
// `identifier` accepts either email or phone, matching the backend route.
export default function EmailLoginScreen({
  goBack,
  openRegister,
  openForgotPassword,
  onLoggedIn,
}: {
  goBack: () => void;
  openRegister: () => void;
  openForgotPassword?: () => void;
  onLoggedIn: () => void;
}) {
  const { palette } = useTheme();
  const styles = useSharedStyles();
  const setToken = useAppStore((s) => s.setToken);
  const setProfile = useAppStore((s) => s.setProfile);

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const enterAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(enterAnim, {
      toValue: 1,
      tension: 60,
      friction: 10,
      useNativeDriver: Platform.OS !== "web",
    }).start();
  }, []);

  const handleLogin = async () => {
    setError("");
    if (!identifier.trim()) {
      setError("Ange din e-post");
      return;
    }
    if (!password) {
      setError("Ange ditt lösenord");
      return;
    }

    setLoading(true);
    try {
      const { data } = await api.post("/api/account/login-user", {
        identifier: identifier.trim(),
        password,
      });
      const tok = data?.token;
      if (!tok) throw new Error("Ingen session mottogs");

      setToken(tok);
      try {
        const profileRes = await api.get("/api/profile", {
          headers: { Authorization: `Bearer ${tok}` },
        });
        setProfile(profileRes.data);
      } catch {
        if (data?.user) setProfile(data.user);
      }
      onLoggedIn();
    } catch (e: any) {
      // Web translates everything to "Felaktigt lösenord eller e-post" —
      // mirror that string so the two clients stay in sync.
      const apiErr = e?.response?.data?.error;
      if (e?.response?.status === 401) {
        setError("Felaktig email eller lösenord");
      } else {
        setError(apiErr || e?.message || "Inloggning misslyckades");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = () => {
    // Navigerar till ForgotPasswordScreen där användaren kan begära en
    // återställningslänk. Backend (POST /api/account/forgot-password) returnerar
    // alltid 200 och skickar mejlet om kontot finns — så detta läcker inte
    // information om vilka mejlkonton som är registrerade.
    openForgotPassword?.();
  };

  return (
    <ScreenWrap>
      <Header title="Logga in" onBack={goBack} />

      <Animated.View
        style={{
          paddingHorizontal: 6,
          paddingTop: 18,
          paddingBottom: 40,
          opacity: enterAnim,
          transform: [
            {
              translateY: enterAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [16, 0],
              }),
            },
          ],
        }}
      >
        <Text
          style={{
            color: palette.text,
            fontSize: 32,
            fontWeight: "900",
            letterSpacing: -0.5,
            marginBottom: 8,
          }}
        >
          Välkommen tillbaka
        </Text>
        <Text
          style={{
            color: palette.muted,
            fontSize: 13,
            fontWeight: "500",
            marginBottom: 24,
            lineHeight: 20,
          }}
        >
          Logga in med din e-post och lösenord.
        </Text>

        <View style={{ gap: 12 }}>
          <TextInput
            style={[
              styles.input,
              { fontSize: 16, fontWeight: "700", paddingVertical: 18, marginBottom: 0 },
            ]}
            placeholder="din.epost@exempel.se"
            placeholderTextColor={palette.muted}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            textContentType="emailAddress"
            value={identifier}
            onChangeText={(t) => {
              setIdentifier(t);
              setError("");
            }}
          />
          <TextInput
            style={[
              styles.input,
              { fontSize: 16, fontWeight: "700", paddingVertical: 18, marginBottom: 0 },
            ]}
            placeholder="Lösenord"
            placeholderTextColor={palette.muted}
            secureTextEntry
            autoCapitalize="none"
            autoComplete="password"
            textContentType="password"
            value={password}
            onChangeText={(t) => {
              setPassword(t);
              setError("");
            }}
            onSubmitEditing={handleLogin}
          />

          {!!error && (
            <View
              style={{
                backgroundColor: "rgba(239,68,68,0.1)",
                borderRadius: 14,
                padding: 12,
                borderWidth: 1,
                borderColor: "rgba(239,68,68,0.2)",
              }}
            >
              <Text
                style={{
                  color: "#fca5a5",
                  fontSize: 12,
                  fontWeight: "700",
                  textAlign: "center",
                }}
              >
                {error}
              </Text>
            </View>
          )}

          <Pressable
            onPress={handleLogin}
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
            {loading ? (
              <ActivityIndicator color="#000" />
            ) : (
              <Text style={{ color: "#000", fontWeight: "900", fontSize: 15 }}>
                Logga in
              </Text>
            )}
          </Pressable>

          <Pressable
            onPress={handleForgotPassword}
            style={{ alignItems: "center", marginTop: 12, paddingVertical: 8 }}
          >
            <Text
              style={{
                color: palette.muted,
                fontSize: 12,
                fontWeight: "700",
              }}
            >
              Glömt lösenord?
            </Text>
          </Pressable>

          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
              marginTop: 16,
              marginBottom: 4,
            }}
          >
            <View style={{ flex: 1, height: 1, backgroundColor: palette.border }} />
            <Text
              style={{
                color: palette.muted,
                fontSize: 10,
                fontWeight: "900",
                letterSpacing: 2,
              }}
            >
              ELLER
            </Text>
            <View style={{ flex: 1, height: 1, backgroundColor: palette.border }} />
          </View>

          <Pressable
            onPress={openRegister}
            style={{
              borderRadius: 22,
              paddingVertical: 18,
              alignItems: "center",
              borderWidth: 1.5,
              borderColor: palette.gold,
              backgroundColor: "transparent",
            }}
          >
            <Text
              style={{ color: palette.gold, fontWeight: "900", fontSize: 14 }}
            >
              Skapa konto
            </Text>
          </Pressable>
        </View>
      </Animated.View>
    </ScreenWrap>
  );
}
