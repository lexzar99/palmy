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
import { Ionicons } from "@expo/vector-icons";
import { api } from "../lib/api";
import { useSharedStyles, useTheme } from "../theme";
import { Header, ScreenWrap } from "../components/ui";

// Glömt-lösenord-flöde — steg 2 av 2.
//   POST /api/account/reset-password { token, newPassword }
// Tokenen kommer in via deep-link (foodgo://reset-password?token=…), App.tsx
// parsar URL:en och navigerar hit med token-paramen. Vid lyckad reset
// returneras användaren till email-login så de kan logga in med nya
// lösenordet (vi auto-loggar inte in — backend håller bara hash:en).
export default function ResetPasswordScreen({
  token,
  goBack,
  onResetComplete,
}: {
  token: string;
  goBack: () => void;
  onResetComplete: () => void;
}) {
  const { palette } = useTheme();
  const styles = useSharedStyles();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const enterAnim = useRef(new Animated.Value(0)).current;

  // Klient-side guard — token saknas eller är uppenbart för kort. Mejlet
  // skickar alltid en 64-tecken hex, så <32 är garanterat ogiltigt.
  const tokenMissing = !token || token.length < 32;

  useEffect(() => {
    Animated.spring(enterAnim, {
      toValue: 1,
      tension: 60,
      friction: 10,
      useNativeDriver: Platform.OS !== "web",
    }).start();
  }, []);

  const handleSubmit = async () => {
    setError("");
    if (newPassword.length < 8) {
      setError("Lösenordet måste vara minst 8 tecken");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Lösenorden matchar inte");
      return;
    }
    setLoading(true);
    try {
      await api.post("/api/account/reset-password", { token, newPassword });
      setSuccess(true);
      // Lämna någon sekund så användaren hinner se success-state innan vi
      // navigerar bort.
      setTimeout(() => onResetComplete(), 2000);
    } catch (e: any) {
      setError(
        e?.response?.data?.error ||
          "Länken är ogiltig eller har gått ut. Be om en ny."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScreenWrap>
      <Header title="Nytt lösenord" onBack={goBack} />

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
          Välj nytt lösenord
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
          Minst 8 tecken. Logga in med det nya lösenordet efteråt.
        </Text>

        {tokenMissing ? (
          <View
            style={{
              backgroundColor: "rgba(239,68,68,0.08)",
              borderColor: "rgba(239,68,68,0.25)",
              borderWidth: 1,
              borderRadius: 22,
              padding: 22,
              gap: 14,
              alignItems: "center",
            }}
          >
            <Ionicons name="alert-circle" size={42} color="#ef4444" />
            <Text
              style={{
                color: "#ef4444",
                fontSize: 16,
                fontWeight: "900",
                letterSpacing: -0.3,
              }}
            >
              Länk saknas
            </Text>
            <Text
              style={{
                color: palette.muted,
                fontSize: 13,
                fontWeight: "500",
                textAlign: "center",
                lineHeight: 19,
              }}
            >
              Den här sidan kräver en återställningslänk. Be om en ny via
              "Glömt lösenord?" på inloggningssidan.
            </Text>
            <Pressable
              onPress={goBack}
              style={{
                marginTop: 6,
                borderRadius: 18,
                paddingVertical: 14,
                paddingHorizontal: 28,
                borderWidth: 1.5,
                borderColor: palette.gold,
              }}
            >
              <Text
                style={{
                  color: palette.gold,
                  fontWeight: "900",
                  fontSize: 13,
                }}
              >
                Tillbaka
              </Text>
            </Pressable>
          </View>
        ) : success ? (
          <View
            style={{
              backgroundColor: "rgba(34,197,94,0.08)",
              borderColor: "rgba(34,197,94,0.25)",
              borderWidth: 1,
              borderRadius: 22,
              padding: 22,
              gap: 14,
              alignItems: "center",
            }}
          >
            <Ionicons name="checkmark-circle" size={42} color="#22c55e" />
            <Text
              style={{
                color: "#22c55e",
                fontSize: 16,
                fontWeight: "900",
                letterSpacing: -0.3,
              }}
            >
              Lösenordet är ändrat
            </Text>
            <Text
              style={{
                color: palette.muted,
                fontSize: 13,
                fontWeight: "500",
                textAlign: "center",
                lineHeight: 19,
              }}
            >
              Skickar dig till inloggning...
            </Text>
          </View>
        ) : (
          <View style={{ gap: 12 }}>
            <TextInput
              style={[
                styles.input,
                {
                  fontSize: 16,
                  fontWeight: "700",
                  paddingVertical: 18,
                  marginBottom: 0,
                },
              ]}
              placeholder="Nytt lösenord (min 8 tecken)"
              placeholderTextColor={palette.muted}
              secureTextEntry
              autoCapitalize="none"
              autoComplete="password-new"
              textContentType="newPassword"
              value={newPassword}
              onChangeText={(t) => {
                setNewPassword(t);
                setError("");
              }}
            />
            <TextInput
              style={[
                styles.input,
                {
                  fontSize: 16,
                  fontWeight: "700",
                  paddingVertical: 18,
                  marginBottom: 0,
                },
              ]}
              placeholder="Bekräfta lösenord"
              placeholderTextColor={palette.muted}
              secureTextEntry
              autoCapitalize="none"
              autoComplete="password-new"
              textContentType="newPassword"
              value={confirmPassword}
              onChangeText={(t) => {
                setConfirmPassword(t);
                setError("");
              }}
              onSubmitEditing={handleSubmit}
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
              onPress={handleSubmit}
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
                  Spara nytt lösenord
                </Text>
              )}
            </Pressable>
          </View>
        )}
      </Animated.View>
    </ScreenWrap>
  );
}
