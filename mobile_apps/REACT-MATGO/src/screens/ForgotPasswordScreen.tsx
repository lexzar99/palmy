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
import { styles } from "../constants/theme";
import { useTheme } from "../theme";
import { Header, ScreenWrap } from "../components/ui";

// Glömt-lösenord-flöde — steg 1 av 2.
//   POST /api/account/forgot-password { email } → alltid 200
// Backend skickar mejl med både en webb-länk (https://matgo.se/reset-password)
// och en deep-link (foodgo://reset-password). När användaren klickar på
// deep-linken fångas den i App.tsx-Linking-handlern och navigerar till
// ResetPasswordScreen.
export default function ForgotPasswordScreen({
  goBack,
}: {
  goBack: () => void;
}) {
  const { palette } = useTheme();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  const enterAnim = useRef(new Animated.Value(0)).current;

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
    const trimmed = email.trim();
    if (!trimmed || !trimmed.includes("@")) {
      setError("Ange en giltig e-postadress");
      return;
    }

    setLoading(true);
    try {
      await api.post("/api/account/forgot-password", { email: trimmed });
      setSent(true);
    } catch (e: any) {
      // Endpoint:n returnerar alltid 200 — om vi får 4xx här är det
      // valideringsfel. Visa servermeddelandet eller fallback-text.
      setError(
        e?.response?.data?.error ||
          "Kunde inte skicka länken just nu. Försök igen."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScreenWrap>
      <Header title="Glömt lösenord" onBack={goBack} />

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
          Återställ lösenord
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
          Skriv in din e-post så skickar vi en länk för att välja ett nytt
          lösenord. Länken gäller 1 timme.
        </Text>

        {sent ? (
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
              Klart!
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
              Om kontot finns har vi skickat en länk till din mejl. Kolla även
              skräpposten.
            </Text>
            <Text
              style={{
                color: palette.muted,
                fontSize: 10,
                fontWeight: "900",
                letterSpacing: 2,
                marginTop: 4,
              }}
            >
              LÄNKEN GÄLLER I 1 TIMME
            </Text>
            <Pressable
              onPress={goBack}
              style={{
                marginTop: 8,
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
                Tillbaka till login
              </Text>
            </Pressable>
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
              placeholder="din.epost@exempel.se"
              placeholderTextColor={palette.muted}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              textContentType="emailAddress"
              value={email}
              onChangeText={(t) => {
                setEmail(t);
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
                  Skicka återställningslänk
                </Text>
              )}
            </Pressable>

            <Pressable
              onPress={goBack}
              style={{
                alignItems: "center",
                marginTop: 6,
                paddingVertical: 12,
              }}
            >
              <Text
                style={{
                  color: palette.muted,
                  fontSize: 12,
                  fontWeight: "700",
                }}
              >
                Tillbaka till login
              </Text>
            </Pressable>
          </View>
        )}
      </Animated.View>
    </ScreenWrap>
  );
}
