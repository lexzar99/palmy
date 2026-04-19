import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  Easing,
  Platform,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";

const { width } = Dimensions.get("window");

const palette = {
  bg: "#FFF8EF",
  gold: "#D9B055",
  text: "#21160F",
  muted: "#7C6854",
};

const TypewriterText = ({ message }: { message: string }) => {
  const [displayedText, setDisplayedText] = useState("");
  useEffect(() => {
    let index = 0;
    const interval = setInterval(() => {
      if (index < message.length) {
        setDisplayedText(message.slice(0, index + 1));
        index++;
      } else {
        clearInterval(interval);
      }
    }, 45); // Adjust speed here for faster/slower typing
    return () => clearInterval(interval);
  }, [message]);

  return <Text style={styles.message}>{displayedText.toUpperCase()}</Text>;
};

export default function PremiumLoader({ message }: { message?: string }) {
  const letters = "MatGo".split("");
  const animatedValues = useRef(letters.map(() => new Animated.Value(0))).current;
  const logoScale = useRef(new Animated.Value(0.8)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const glowOpacity = useRef(new Animated.Value(0.2)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;
  const shimmerAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // 1. Logo entrance
    Animated.parallel([
      Animated.spring(logoScale, {
        toValue: 1,
        tension: 50,
        friction: 7,
        useNativeDriver: Platform.OS !== "web",
      }),
      Animated.timing(logoOpacity, {
        toValue: 1,
        duration: 600,
        useNativeDriver: Platform.OS !== "web",
      }),
    ]).start();

    // 2. Letter stagger
    const letterAnimations = animatedValues.map((val, i) =>
      Animated.sequence([
        Animated.delay(350 + i * 90),
        Animated.spring(val, {
          toValue: 1,
          tension: 45,
          friction: 6,
          useNativeDriver: Platform.OS !== "web",
        }),
      ])
    );
    Animated.parallel(letterAnimations).start();

    // 3. Glow pulse
    Animated.loop(
      Animated.sequence([
        Animated.timing(glowOpacity, {
          toValue: 0.55,
          duration: 1600,
          useNativeDriver: Platform.OS !== "web",
        }),
        Animated.timing(glowOpacity, {
          toValue: 0.15,
          duration: 1600,
          useNativeDriver: Platform.OS !== "web",
        }),
      ])
    ).start();

    // 4. Indeterminate progress bar (shuttle animation)
    Animated.loop(
      Animated.sequence([
        Animated.timing(progressAnim, {
          toValue: 1,
          duration: 1400,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: false,
        }),
        Animated.timing(progressAnim, {
          toValue: 0,
          duration: 0,
          useNativeDriver: false,
        }),
      ])
    ).start();

    // 5. Shimmer sweep on letters
    Animated.loop(
      Animated.sequence([
        Animated.timing(shimmerAnim, {
          toValue: 1,
          duration: 1800,
          easing: Easing.linear,
          useNativeDriver: Platform.OS !== "web",
        }),
        Animated.delay(400),
        Animated.timing(shimmerAnim, {
          toValue: 0,
          duration: 0,
          useNativeDriver: Platform.OS !== "web",
        }),
      ])
    ).start();
  }, []);

  const progressLeft = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["-50%", "120%"],
  });

  return (
    <View style={styles.container}>
      <LinearGradient colors={["#FFF6E7", "#FFF8EF"]} style={StyleSheet.absoluteFill} />

      {/* Background glow */}
      <Animated.View style={[styles.glow, { opacity: glowOpacity }]} />

      <View style={styles.content}>
        {/* Icon */}
        <Animated.View style={{ transform: [{ scale: logoScale }], opacity: logoOpacity, alignItems: "center" }}>
          <View style={styles.logoContainer}>
            <Ionicons name="restaurant" size={42} color={palette.gold} />
          </View>
        </Animated.View>

        {/* Animated wordmark */}
        <View style={styles.textRow}>
          {letters.map((char, i) => (
            <Animated.Text
              key={i}
              style={[
                styles.letter,
                {
                  opacity: animatedValues[i],
                  transform: [
                    {
                      translateY: animatedValues[i].interpolate({
                        inputRange: [0, 1],
                        outputRange: [18, 0],
                      }),
                    },
                  ],
                },
              ]}
            >
              {char}
            </Animated.Text>
          ))}
        </View>

        {message && (
          <TypewriterText message={message} />
        )}
      </View>

      {/* Animated indeterminate progress bar */}
      <View style={styles.footer}>
        <View style={styles.loadingBarContainer}>
          <Animated.View
            style={[
              styles.loadingBar,
              { left: progressLeft },
            ]}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.bg,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    alignItems: "center",
  },
  glow: {
    position: "absolute",
    width: width * 0.7,
    height: width * 0.7,
    borderRadius: width * 0.35,
    backgroundColor: palette.gold,
    opacity: 0.3,
    // Note: filter/blur only works on web; native uses shadowColor pattern
    ...(Platform.OS === "web" ? { filter: "blur(60px)" } as any : {}),
  },
  logoContainer: {
    width: 100,
    height: 100,
    borderRadius: 32,
    backgroundColor: "rgba(217,176,85,0.18)",
    borderWidth: 1.5,
    borderColor: "rgba(125,97,38,0.14)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
    shadowColor: palette.gold,
    shadowOpacity: 0.22,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
  },
  textRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  letter: {
    color: palette.gold,
    fontSize: 50,
    fontWeight: "900",
    letterSpacing: 1.5,
    fontStyle: "italic",
    textShadowColor: "rgba(217,176,85,0.24)",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 12,
  },
  message: {
    color: "rgba(125,97,38,0.58)",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 4,
    marginTop: 22,
    textAlign: "center",
  },
  footer: {
    position: "absolute",
    bottom: 60,
    width: "50%",
    alignItems: "center",
  },
  loadingBarContainer: {
    width: "100%",
    height: 2,
    backgroundColor: "rgba(33,22,15,0.08)",
    borderRadius: 1,
    overflow: "hidden",
    position: "relative",
  },
  loadingBar: {
    position: "absolute",
    width: "50%",
    height: "100%",
    backgroundColor: palette.gold,
    borderRadius: 1,
    opacity: 0.9,
  },
});
