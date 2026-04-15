import React, { useEffect, useCallback, useRef } from "react";
import {
  Animated,
  Dimensions,
  Platform,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";

const { width, height } = Dimensions.get("window");

const palette = {
  bg: "#0b0a0f",
  gold: "#FFD700",
  goldLight: "#f5cc7a",
  text: "#f9f7f3",
  muted: "#b2a8bf",
};

/**
 * MatGoSplashScreen — shown on first cold start.
 * Displays a premium animated "MatGo" wordmark, then fades out and calls `onFinish`.
 */
export default function MatGoSplashScreen({ onFinish }: { onFinish: () => void }) {
  const logoScale = useRef(new Animated.Value(0.4)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const textOpacity = useRef(new Animated.Value(0)).current;
  const taglineOpacity = useRef(new Animated.Value(0)).current;
  const screenOpacity = useRef(new Animated.Value(1)).current;
  const iconPulse = useRef(new Animated.Value(1)).current;
  const ringScale = useRef(new Animated.Value(0.6)).current;
  const ringOpacity = useRef(new Animated.Value(0)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;

  const runAnimation = useCallback(() => {
    // Ring + logo entrance
    Animated.parallel([
      Animated.spring(logoScale, {
        toValue: 1,
        friction: 6,
        tension: 70,
        useNativeDriver: Platform.OS !== "web",
      }),
      Animated.timing(logoOpacity, {
        toValue: 1,
        duration: 450,
        useNativeDriver: Platform.OS !== "web",
      }),
      Animated.spring(ringScale, {
        toValue: 1,
        friction: 5,
        tension: 50,
        useNativeDriver: Platform.OS !== "web",
      }),
      Animated.timing(ringOpacity, {
        toValue: 1,
        duration: 600,
        useNativeDriver: Platform.OS !== "web",
      }),
    ]).start(() => {
      // Pulsing icon
      Animated.loop(
        Animated.sequence([
          Animated.timing(iconPulse, {
            toValue: 1.06,
            duration: 1000,
            useNativeDriver: Platform.OS !== "web",
          }),
          Animated.timing(iconPulse, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: Platform.OS !== "web",
          }),
        ])
      ).start();

      // Text fade in
      Animated.timing(textOpacity, {
        toValue: 1,
        duration: 380,
        useNativeDriver: Platform.OS !== "web",
      }).start(() => {
        // Tagline
        Animated.timing(taglineOpacity, {
          toValue: 1,
          duration: 350,
          useNativeDriver: Platform.OS !== "web",
        }).start();
      });

      // Progress bar animation
      Animated.timing(progressAnim, {
        toValue: 1,
        duration: 1800,
        useNativeDriver: false,
      }).start();

      // Hold then fade out
      setTimeout(() => {
        Animated.timing(screenOpacity, {
          toValue: 0,
          duration: 480,
          useNativeDriver: Platform.OS !== "web",
        }).start(() => {
          onFinish();
        });
      }, 1900);
    });
  }, [iconPulse, logoOpacity, logoScale, onFinish, progressAnim, ringOpacity, ringScale, screenOpacity, taglineOpacity, textOpacity]);

  useEffect(() => {
    runAnimation();
  }, [runAnimation]);

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0%", "100%"],
  });

  return (
    <Animated.View style={[StyleSheet.absoluteFillObject, { opacity: screenOpacity }]}>
      <LinearGradient
        colors={["#0f0c17", "#07060c"]}
        style={[StyleSheet.absoluteFillObject, { alignItems: "center", justifyContent: "center" }]}
      >
        {/* Background glow blob */}
        <View
          style={{
            position: "absolute",
            width: width * 0.7,
            height: width * 0.7,
            borderRadius: width * 0.35,
            backgroundColor: "rgba(231,178,75,0.04)",
            shadowColor: palette.gold,
            shadowOpacity: 0.25,
            shadowRadius: 100,
            shadowOffset: { width: 0, height: 0 },
          }}
        />

        {/* Outer ring */}
        <Animated.View
          style={{
            position: "absolute",
            width: 180,
            height: 180,
            borderRadius: 90,
            borderWidth: 1,
            borderColor: "rgba(231,178,75,0.12)",
            transform: [{ scale: ringScale }],
            opacity: ringOpacity,
          }}
        />

        {/* Middle ring */}
        <Animated.View
          style={{
            position: "absolute",
            width: 136,
            height: 136,
            borderRadius: 68,
            borderWidth: 1,
            borderColor: "rgba(231,178,75,0.18)",
            transform: [{ scale: ringScale }],
            opacity: ringOpacity,
          }}
        />

        {/* Icon */}
        <Animated.View
          style={{
            transform: [{ scale: Animated.multiply(logoScale, iconPulse) }],
            opacity: logoOpacity,
            marginBottom: 32,
          }}
        >
          <View
            style={{
              width: 100,
              height: 100,
              borderRadius: 32,
              backgroundColor: "rgba(231,178,75,0.1)",
              borderWidth: 1.5,
              borderColor: "rgba(231,178,75,0.35)",
              alignItems: "center",
              justifyContent: "center",
              shadowColor: palette.gold,
              shadowOpacity: 0.5,
              shadowRadius: 30,
              shadowOffset: { width: 0, height: 10 },
            }}
          >
            <Ionicons name="restaurant" size={46} color={palette.gold} />
          </View>
        </Animated.View>

        {/* WordMark */}
        <Animated.View style={{ opacity: textOpacity, alignItems: "center" }}>
          <Text
            style={{
              color: palette.gold,
              fontSize: 60,
              fontWeight: "900",
              letterSpacing: -2,
              fontStyle: "italic",
            }}
          >
            MatGo
          </Text>
        </Animated.View>

        {/* Tagline */}
        <Animated.View style={{ opacity: taglineOpacity, alignItems: "center", marginTop: 10 }}>
          <Text
            style={{
              color: palette.muted,
              fontSize: 11,
              fontWeight: "700",
              letterSpacing: 3.5,
              textTransform: "uppercase",
            }}
          >
            Leverans till din dörr
          </Text>
        </Animated.View>

        {/* Animated progress bar at bottom */}
        <View
          style={{
            position: "absolute",
            bottom: 60,
            left: "25%",
            right: "25%",
          }}
        >
          <View
            style={{
              height: 2,
              backgroundColor: "rgba(255,255,255,0.06)",
              borderRadius: 1,
              overflow: "hidden",
            }}
          >
            <Animated.View
              style={{
                height: "100%",
                width: progressWidth,
                backgroundColor: palette.gold,
                borderRadius: 1,
                opacity: 0.8,
              }}
            />
          </View>
        </View>
      </LinearGradient>
    </Animated.View>
  );
}
