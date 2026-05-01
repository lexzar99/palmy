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

const BG = "#FFF8EF";
const GOLD = "#E7B24B";
const INK = "#21160F";

/**
 * Splash → app handoff. Frame 0 of this component is identical to the iOS /
 * Android splash (cream `#FFF8EF` background, FoodGo icon centred, contain
 * fit). After the seamless handoff: gentle breath on the icon, expanding
 * halo ring, ambient golden glow, and the wordmark "FoodGo" fades up
 * underneath. Replaces the old PremiumLoader (dark bg + fork/spoon ionicon).
 */
export default function SplashLoader(_props: { message?: string }) {
  const breath = useRef(new Animated.Value(1)).current;
  const halo = useRef(new Animated.Value(0)).current;
  const haloFade = useRef(new Animated.Value(0.45)).current;
  const glow = useRef(new Animated.Value(0)).current;
  const word = useRef(new Animated.Value(0)).current;
  const wordY = useRef(new Animated.Value(10)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(breath, { toValue: 1.05, duration: 1300, easing: Easing.inOut(Easing.quad), useNativeDriver: Platform.OS !== "web" }),
        Animated.timing(breath, { toValue: 1, duration: 1300, easing: Easing.inOut(Easing.quad), useNativeDriver: Platform.OS !== "web" }),
      ])
    ).start();

    Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(halo, { toValue: 1, duration: 1700, easing: Easing.out(Easing.quad), useNativeDriver: Platform.OS !== "web" }),
          Animated.timing(haloFade, { toValue: 0, duration: 1700, easing: Easing.out(Easing.quad), useNativeDriver: Platform.OS !== "web" }),
        ]),
        Animated.parallel([
          Animated.timing(halo, { toValue: 0, duration: 0, useNativeDriver: Platform.OS !== "web" }),
          Animated.timing(haloFade, { toValue: 0.45, duration: 0, useNativeDriver: Platform.OS !== "web" }),
        ]),
      ])
    ).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: 1900, easing: Easing.inOut(Easing.quad), useNativeDriver: Platform.OS !== "web" }),
        Animated.timing(glow, { toValue: 0, duration: 1900, easing: Easing.inOut(Easing.quad), useNativeDriver: Platform.OS !== "web" }),
      ])
    ).start();

    Animated.sequence([
      Animated.delay(220),
      Animated.parallel([
        Animated.timing(word, { toValue: 1, duration: 460, easing: Easing.out(Easing.cubic), useNativeDriver: Platform.OS !== "web" }),
        Animated.timing(wordY, { toValue: 0, duration: 460, easing: Easing.out(Easing.cubic), useNativeDriver: Platform.OS !== "web" }),
      ]),
    ]).start();
  }, [breath, halo, haloFade, glow, word, wordY]);

  const ringSize = Math.min(width * 0.6, 260);
  const haloScale = halo.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1.7] });
  const glowOpacity = glow.interpolate({ inputRange: [0, 1], outputRange: [0.18, 0.42] });

  return (
    <View style={styles.container}>
      <Animated.View
        pointerEvents="none"
        style={[styles.halo, { width: ringSize, height: ringSize, borderRadius: ringSize / 2, opacity: haloFade, transform: [{ scale: haloScale }] }]}
      />
      <Animated.View
        pointerEvents="none"
        style={[styles.glow, { width: ringSize * 0.95, height: ringSize * 0.95, borderRadius: ringSize * 0.475, opacity: glowOpacity }]}
      />
      <Animated.View style={{ transform: [{ scale: breath }] }}>
        <Image source={require("../../assets/icon.png")} style={styles.icon} resizeMode="contain" />
      </Animated.View>
      <Animated.Text style={[styles.word, { opacity: word, transform: [{ translateY: wordY }] }]}>
        FoodGo
      </Animated.Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG, alignItems: "center", justifyContent: "center" },
  icon: { width: 132, height: 132 },
  halo: { position: "absolute", borderWidth: 1.5, borderColor: GOLD },
  glow: { position: "absolute", backgroundColor: GOLD, shadowColor: GOLD, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.6, shadowRadius: 40 },
  word: { marginTop: 28, fontSize: 28, fontWeight: "900", letterSpacing: 1.2, color: INK },
});
