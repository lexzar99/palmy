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
  // 403 EMAIL_NOT_VERIFIED från /login-user innebär att email-verification-
  // gaten är aktiv för det här kontot. Vi visar då en egen "kolla din mejl"-
  // panel med resend-knapp istället för det generiska fel-meddelandet.
  const [needsVerification, setNeedsVerification] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendStatus, setResendStatus] = useState<"idle" | "sent" | "error">("idle");

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
    setNeedsVerification(false);
    setResendStatus("idle");
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
      // Backend 403 + code: "EMAIL_NOT_VERIFIED" → visa special-state med
      // resend-knapp. Övriga 401/4xx → generiskt felmeddelande.
      const status = e?.response?.status;
      const code = e?.response?.data?.code;
      if (status === 403 && code === "EMAIL_NOT_VERIFIED") {
        setNeedsVerification(true);
      } else if (status === 401) {
        setError("Felaktig email eller lösenord");
      } else {
        const apiErr = e?.response?.data?.error;
        setError(apiErr || e?.message || "Inloggning misslyckades");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResendVerification = async () => {
    if (!identifier.trim()) return;
    setResending(true);
    setResendStatus("idle");
    try {
      await api.post("/api/account/send-verification-email", { email: identifier.trim() });
      setResendStatus("sent");
    } catch {
      setResendStatus("error");
    } finally {
      setResending(false);
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
              setNeedsVerification(false);
              setResendStatus("idle");
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
              setNeedsVerification(false);
              setResendStatus("idle");
            }}
            onSubmitEditing={handleLogin}
          />

          {needsVerification && (
            <View
              style={{
                backgroundColor: "rgba(245,158,11,0.10)",
                borderRadius: 14,
                padding: 14,
                borderWidth: 1,
                borderColor: "rgba(245,158,11,0.30)",
                gap: 10,
              }}
            >
              <Text
                style={{
                  color: "#fbbf24",
                  fontSize: 12,
                  fontWeight: "900",
                  letterSpacing: 0.4,
                  textAlign: "center",
                }}
              >
                Kolla din mejl
              </Text>
              <Text
                style={{
                  color: palette.text,
                  fontSize: 12,
                  fontWeight: "600",
                  lineHeight: 17,
                  textAlign: "center",
                }}
              >
                Du måste verifiera din e-post innan du loggar in. Vi har skickat en
                länk till{" "}
                <Text style={{ color: "#fbbf24", fontWeight: "900" }}>
                  {identifier.trim()}
                </Text>
                .
              </Text>
              <Pressable
                onPress={handleResendVerification}
                disabled={resending || resendStatus === "sent"}
                style={{
                  backgroundColor: "rgba(255,255,255,0.06)",
                  borderRadius: 12,
                  paddingVertical: 10,
                  alignItems: "center",
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.10)",
                  opacity: resending || resendStatus === "sent" ? 0.6 : 1,
                }}
              >
                {resending ? (
                  <ActivityIndicator color={palette.text} />
                ) : (
                  <Text style={{ color: palette.text, fontSize: 11, fontWeight: "900", letterSpacing: 0.5 }}>
                    {resendStatus === "sent"
                      ? "LÄNKEN SKICKAD"
                      : resendStatus === "error"
                      ? "FÖRSÖK IGEN"
                      : "SKICKA IGEN"}
                  </Text>
                )}
              </Pressable>
            </View>
          )}

          {!needsVerification && !!error && (
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
