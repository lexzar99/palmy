import React, { useEffect, useRef } from "react";
import {
  Animated,
  Dimensions,
  Easing,
  Image,
  Platform,
  StyleSheet,
  View,
} from "react-native";

const { width } = Dimensions.get("window");
const ND = Platform.OS !== "web";
const BG = "#FFF8EF";
const GOLD = "#E7B24B";
const INK = "#21160F";

export default function SplashLoader(_props: { message?: string }) {
  const iconOpacity = useRef(new Animated.Value(0)).current;
  const iconScale = useRef(new Animated.Value(0.8)).current;
  const breath = useRef(new Animated.Value(1)).current;

  const ringScale = useRef(new Animated.Value(0.55)).current;
  const ringOpacity = useRef(new Animated.Value(0.85)).current;

  const glowOpacity = useRef(new Animated.Value(0)).current;

  const wordOpacity = useRef(new Animated.Value(0)).current;
  const wordY = useRef(new Animated.Value(18)).current;
  const dotScale = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Icon fades + scales in with a soft spring overshoot
    Animated.parallel([
      Animated.timing(iconOpacity, {
        toValue: 1, duration: 480,
        easing: Easing.out(Easing.quad), useNativeDriver: ND,
      }),
      Animated.timing(iconScale, {
        toValue: 1, duration: 600,
        easing: Easing.out(Easing.back(1.4)), useNativeDriver: ND,
      }),
    ]).start(() => {
      // Gentle breathing starts only after icon has landed
      Animated.loop(
        Animated.sequence([
          Animated.timing(breath, { toValue: 1.045, duration: 1700, easing: Easing.inOut(Easing.quad), useNativeDriver: ND }),
          Animated.timing(breath, { toValue: 1, duration: 1700, easing: Easing.inOut(Easing.quad), useNativeDriver: ND }),
        ])
      ).start();
    });

    // Ring expands once and disappears — no looping
    Animated.parallel([
      Animated.timing(ringScale, { toValue: 1.95, duration: 1050, easing: Easing.out(Easing.cubic), useNativeDriver: ND }),
      Animated.timing(ringOpacity, { toValue: 0, duration: 1050, easing: Easing.out(Easing.quad), useNativeDriver: ND }),
    ]).start();

    // Glow fades in then pulses softly
    Animated.sequence([
      Animated.delay(200),
      Animated.timing(glowOpacity, { toValue: 0.2, duration: 500, useNativeDriver: ND }),
    ]).start(() => {
      Animated.loop(
        Animated.sequence([
          Animated.timing(glowOpacity, { toValue: 0.32, duration: 2100, easing: Easing.inOut(Easing.quad), useNativeDriver: ND }),
          Animated.timing(glowOpacity, { toValue: 0.12, duration: 2100, easing: Easing.inOut(Easing.quad), useNativeDriver: ND }),
        ])
      ).start();
    });

    // Wordmark slides up
    Animated.sequence([
      Animated.delay(290),
      Animated.parallel([
        Animated.timing(wordOpacity, { toValue: 1, duration: 430, easing: Easing.out(Easing.quad), useNativeDriver: ND }),
        Animated.timing(wordY, { toValue: 0, duration: 430, easing: Easing.out(Easing.cubic), useNativeDriver: ND }),
      ]),
    ]).start();

    // Gold dot pops in after wordmark
    Animated.sequence([
      Animated.delay(600),
      Animated.timing(dotScale, { toValue: 1, duration: 280, easing: Easing.out(Easing.back(2.2)), useNativeDriver: ND }),
    ]).start();
  }, []);

  const glowSize = Math.min(width * 0.48, 192);
  const ringSize = Math.min(width * 0.52, 210);

  return (
    <View style={styles.container}>
      {/* Soft ambient glow behind icon */}
      <Animated.View
        pointerEvents="none"
        style={{
          position: "absolute",
          width: glowSize, height: glowSize, borderRadius: glowSize / 2,
          backgroundColor: GOLD,
          opacity: glowOpacity,
          shadowColor: GOLD, shadowOpacity: 1, shadowRadius: 55, shadowOffset: { width: 0, height: 0 },
        }}
      />

      {/* One-shot expanding ring */}
      <Animated.View
        pointerEvents="none"
        style={{
          position: "absolute",
          width: ringSize, height: ringSize, borderRadius: ringSize / 2,
          borderWidth: 1.5, borderColor: GOLD,
          opacity: ringOpacity,
          transform: [{ scale: ringScale }],
        }}
      />

      {/* Icon: outer = breathing, inner = entrance */}
      <Animated.View style={{ transform: [{ scale: breath }] }}>
        <Animated.View style={{ opacity: iconOpacity, transform: [{ scale: iconScale }] }}>
          <Image
            source={require("../../assets/icon.png")}
            style={styles.icon}
            resizeMode="contain"
          />
        </Animated.View>
      </Animated.View>

      {/* Wordmark + gold dot */}
      <Animated.View
        style={{
          flexDirection: "row", alignItems: "center",
          marginTop: 26,
          opacity: wordOpacity,
          transform: [{ translateY: wordY }],
        }}
      >
        <Animated.Text style={styles.word}>FoodGo</Animated.Text>
        <Animated.View
          style={{
            width: 6, height: 6, borderRadius: 3,
            backgroundColor: GOLD,
            marginLeft: 5, marginBottom: 2,
            transform: [{ scale: dotScale }],
          }}
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG, alignItems: "center", justifyContent: "center" },
  icon: { width: 124, height: 124 },
  word: { fontSize: 28, fontWeight: "900", letterSpacing: 0.4, color: INK },
});
