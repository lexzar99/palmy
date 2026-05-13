import React, { useEffect, useRef } from "react";
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

const { width } = Dimensions.get("window");
const ND = Platform.OS !== "web";

// ─────────────────────────────────────────────────────────────────────────────
// Modern dark-mode SplashLoader — visuell paritet med web's OG-image:
//   - Mörk backdrop (#09090b)
//   - Italic "MATGO" wordmark, "GO" i gold (#E7B24B)
//   - Radial gold-glow bakom logotypen
//   - Pulserande dot-indikator (ingen stor spinner)
//   - Fade-in logo → scale-up → hold → loop dots
//
// OBS: native iOS/Android splash är cream (#FFF8EF) i app.json, så vi har en
// kort cross-fade-perception när JS-bundle laddas. Det är OK — den native
// splash försvinner direkt när detta komponent monterar.
// ─────────────────────────────────────────────────────────────────────────────

const BG = "#09090b";
const GOLD = "#E7B24B";

const GLOW_SIZE = Math.min(width * 1.4, 560);

export default function SplashLoader(_props: { message?: string }) {
  // Logo entrance
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const logoScale = useRef(new Animated.Value(0.85)).current;
  const logoY = useRef(new Animated.Value(8)).current;

  // Radial glow — slow breathing
  const glowOpacity = useRef(new Animated.Value(0)).current;
  const glowScale = useRef(new Animated.Value(0.7)).current;

  // Tagline + badge fade-in
  const badgeOpacity = useRef(new Animated.Value(0)).current;
  const taglineOpacity = useRef(new Animated.Value(0)).current;

  // Loading dots (3 dots, each pulses staggered)
  const dot1 = useRef(new Animated.Value(0.3)).current;
  const dot2 = useRef(new Animated.Value(0.3)).current;
  const dot3 = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    // Glow appears first, then keeps slow-breathing
    Animated.parallel([
      Animated.timing(glowOpacity, {
        toValue: 1, duration: 700, easing: Easing.out(Easing.quad), useNativeDriver: ND,
      }),
      Animated.timing(glowScale, {
        toValue: 1, duration: 900, easing: Easing.out(Easing.cubic), useNativeDriver: ND,
      }),
    ]).start(() => {
      Animated.loop(
        Animated.sequence([
          Animated.timing(glowScale, { toValue: 1.08, duration: 2800, easing: Easing.inOut(Easing.quad), useNativeDriver: ND }),
          Animated.timing(glowScale, { toValue: 1, duration: 2800, easing: Easing.inOut(Easing.quad), useNativeDriver: ND }),
        ]),
      ).start();
    });

    // Logo entrance — delayed slightly so the glow sets the stage
    Animated.sequence([
      Animated.delay(180),
      Animated.parallel([
        Animated.timing(logoOpacity, { toValue: 1, duration: 520, easing: Easing.out(Easing.quad), useNativeDriver: ND }),
        Animated.timing(logoScale, { toValue: 1, duration: 640, easing: Easing.out(Easing.back(1.1)), useNativeDriver: ND }),
        Animated.timing(logoY, { toValue: 0, duration: 520, easing: Easing.out(Easing.cubic), useNativeDriver: ND }),
      ]),
    ]).start();

    // Badge appears after logo
    Animated.sequence([
      Animated.delay(580),
      Animated.timing(badgeOpacity, { toValue: 1, duration: 400, useNativeDriver: ND }),
    ]).start();

    // Tagline appears last
    Animated.sequence([
      Animated.delay(780),
      Animated.timing(taglineOpacity, { toValue: 1, duration: 460, useNativeDriver: ND }),
    ]).start();

    // Dots — staggered pulse, loops indefinitely
    const pulseDot = (anim: Animated.Value, delay: number) => {
      const pulse = () =>
        Animated.sequence([
          Animated.timing(anim, { toValue: 1, duration: 420, easing: Easing.out(Easing.quad), useNativeDriver: ND }),
          Animated.timing(anim, { toValue: 0.3, duration: 420, easing: Easing.in(Easing.quad), useNativeDriver: ND }),
        ]);
      Animated.sequence([Animated.delay(delay), Animated.loop(pulse())]).start();
    };
    pulseDot(dot1, 900);
    pulseDot(dot2, 1050);
    pulseDot(dot3, 1200);
  }, []);

  return (
    <View style={styles.container}>
      {/* Radial gold glow — uppe till höger, paritet med OG-image */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.glowWrap,
          {
            opacity: glowOpacity,
            transform: [{ scale: glowScale }],
          },
        ]}
      >
        <LinearGradient
          colors={[
            "rgba(212,167,74,0.45)",
            "rgba(212,167,74,0.10)",
            "transparent",
          ]}
          locations={[0, 0.4, 0.75]}
          start={{ x: 0.5, y: 0.5 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>

      {/* Centerblock — badge + wordmark + tagline */}
      <View style={styles.center}>
        {/* Badge */}
        <Animated.View style={[styles.badge, { opacity: badgeOpacity }]}>
          <Text style={styles.badgeText}>BESTÄLLNINGSPLATTFORM</Text>
        </Animated.View>

        {/* Wordmark */}
        <Animated.View
          style={{
            opacity: logoOpacity,
            transform: [
              { scale: logoScale },
              { translateY: logoY },
            ],
          }}
        >
          <Text style={styles.wordmark}>
            MAT<Text style={styles.wordmarkGold}>GO</Text>
          </Text>
        </Animated.View>

        {/* Tagline */}
        <Animated.Text style={[styles.tagline, { opacity: taglineOpacity }]}>
          Mat från dem bästa av dem bästa
        </Animated.Text>
      </View>

      {/* Pulserande dots — botten */}
      <View style={styles.dotsWrap}>
        {[dot1, dot2, dot3].map((anim, i) => (
          <Animated.View
            key={i}
            style={[
              styles.dot,
              {
                opacity: anim,
                transform: [
                  {
                    scale: anim.interpolate({ inputRange: [0.3, 1], outputRange: [0.85, 1.15] }),
                  },
                ],
              },
            ]}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BG,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  glowWrap: {
    position: "absolute",
    top: -GLOW_SIZE * 0.2,
    right: -GLOW_SIZE * 0.3,
    width: GLOW_SIZE,
    height: GLOW_SIZE,
    borderRadius: GLOW_SIZE / 2,
    overflow: "hidden",
  },
  center: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  badge: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(212,167,74,0.4)",
    backgroundColor: "rgba(212,167,74,0.12)",
    marginBottom: 24,
  },
  badgeText: {
    fontFamily: "Outfit_900Black",
    color: GOLD,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 3.5,
  },
  wordmark: {
    fontFamily: "Outfit_900Black",
    fontSize: 76,
    fontWeight: "900",
    fontStyle: "italic",
    color: "#FFFFFF",
    letterSpacing: -3.5,
    lineHeight: 80,
    textAlign: "center",
  },
  wordmarkGold: {
    color: GOLD,
  },
  tagline: {
    fontFamily: "Outfit_700Bold",
    marginTop: 22,
    color: "rgba(255,255,255,0.65)",
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: 0.2,
    textAlign: "center",
    maxWidth: 320,
    lineHeight: 20,
  },
  dotsWrap: {
    position: "absolute",
    bottom: 80,
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: GOLD,
  },
});
