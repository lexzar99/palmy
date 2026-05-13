import React, { useEffect, useMemo, useRef } from "react";
import {
  Animated,
  Appearance,
  Dimensions,
  Easing,
  Platform,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useAppStore } from "../store/useAppStore";

const { width } = Dimensions.get("window");
const ND = Platform.OS !== "web";

// ─────────────────────────────────────────────────────────────────────────────
// Modern theme-aware SplashLoader — visuell paritet med web's OG-image.
//
// OBS: SplashLoader renderas FÖRE ThemeProvider monteras (splash-gate i App.tsx
// kör innan provider-trädet sätts upp). Därför läser vi temat direkt från
// useAppStore istället för useTheme().
//
// Glow-cirkeln: tidigare scale-loop (1 ↔ 1.08) flyttade gradient-peak eftersom
// transform-origin är center. Resultat: synlig "rör sig och resettas"-glitch.
// Ny lösning: opacity-loop (ingen position-förändring), längre + mjukare sin-
// liknande easing.
// ─────────────────────────────────────────────────────────────────────────────

const GOLD = "#E7B24B";

const GLOW_SIZE = Math.min(width * 1.4, 560);

type ThemeVariant = "light" | "dark";

interface SplashTheme {
  bg: string;
  wordmarkPrimary: string; // "MAT"-delen
  badgeBg: string;
  badgeBorder: string;
  tagline: string;
  glowColors: [string, string, string];
}

const themes: Record<ThemeVariant, SplashTheme> = {
  light: {
    bg: "#FFF8EF",
    wordmarkPrimary: "#1C1C1E",
    badgeBg: "rgba(212,167,74,0.12)",
    badgeBorder: "rgba(212,167,74,0.45)",
    tagline: "rgba(28,28,30,0.7)",
    glowColors: [
      "rgba(231,178,75,0.35)",
      "rgba(231,178,75,0.10)",
      "transparent",
    ],
  },
  dark: {
    bg: "#09090b",
    wordmarkPrimary: "#FFFFFF",
    badgeBg: "rgba(212,167,74,0.12)",
    badgeBorder: "rgba(212,167,74,0.4)",
    tagline: "rgba(255,255,255,0.65)",
    glowColors: [
      "rgba(212,167,74,0.45)",
      "rgba(212,167,74,0.10)",
      "transparent",
    ],
  },
};

function resolveSplashVariant(preference: "light" | "dark" | "system"): ThemeVariant {
  if (preference === "dark") return "dark";
  if (preference === "light") return "light";
  // system — använd Appearance synkront eftersom vi inte har ThemeProvider här
  const system = Appearance.getColorScheme();
  return system === "dark" ? "dark" : "light";
}

export default function SplashLoader(_props: { message?: string }) {
  // Theme — läs direkt från store (ThemeProvider finns inte än vid splash)
  const preference = useAppStore((s) => s.themePreference);
  const variant = useMemo(() => resolveSplashVariant(preference), [preference]);
  const theme = themes[variant];

  // Logo entrance
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const logoScale = useRef(new Animated.Value(0.85)).current;
  const logoY = useRef(new Animated.Value(8)).current;

  // Radial glow — opacity-breathing istället för scale (ingen position-drift).
  // Startar på 0.5 så cirkeln är synlig direkt, även om splash hinner
  // unmount:as innan entrance-animationen är klar.
  const glowOpacity = useRef(new Animated.Value(0.5)).current;

  // Tagline + badge fade-in
  const badgeOpacity = useRef(new Animated.Value(0)).current;
  const taglineOpacity = useRef(new Animated.Value(0)).current;

  // Loading dots (3 dots, each pulses staggered)
  const dot1 = useRef(new Animated.Value(0.3)).current;
  const dot2 = useRef(new Animated.Value(0.3)).current;
  const dot3 = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    // ── Entrance ─────────────────────────────────────────────────────────────
    // Glow startar redan på 0.5 (synlig direkt). Snabb fade till 1.0 så hela
    // cirkeln är synlig under splashens första frame, sedan mjuk breathe.
    Animated.timing(glowOpacity, {
      toValue: 1,
      duration: 400,
      easing: Easing.out(Easing.quad),
      useNativeDriver: ND,
    }).start(() => {
      // Opacity-breathing — INGEN scale = ingen position-drift = ingen glitch.
      // Behåller HÖG opacity hela tiden (0.85 ↔ 1.0) så cirkeln aldrig
      // upplevs försvinna ens när splashen är kort.
      Animated.loop(
        Animated.sequence([
          Animated.timing(glowOpacity, {
            toValue: 0.85,
            duration: 2800,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: ND,
          }),
          Animated.timing(glowOpacity, {
            toValue: 1,
            duration: 2800,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: ND,
          }),
        ]),
      ).start();
    });

    // Logo entrance — delayed slightly så glow sätter scenen
    Animated.sequence([
      Animated.delay(280),
      Animated.parallel([
        Animated.timing(logoOpacity, { toValue: 1, duration: 720, easing: Easing.out(Easing.quad), useNativeDriver: ND }),
        Animated.timing(logoScale, { toValue: 1, duration: 840, easing: Easing.out(Easing.back(1.1)), useNativeDriver: ND }),
        Animated.timing(logoY, { toValue: 0, duration: 720, easing: Easing.out(Easing.cubic), useNativeDriver: ND }),
      ]),
    ]).start();

    // Badge efter logo
    Animated.sequence([
      Animated.delay(780),
      Animated.timing(badgeOpacity, { toValue: 1, duration: 480, useNativeDriver: ND }),
    ]).start();

    // Tagline sist
    Animated.sequence([
      Animated.delay(1000),
      Animated.timing(taglineOpacity, { toValue: 1, duration: 540, useNativeDriver: ND }),
    ]).start();

    // Dots — staggered pulse, loops indefinitely
    const pulseDot = (anim: Animated.Value, delay: number) => {
      const pulse = () =>
        Animated.sequence([
          Animated.timing(anim, { toValue: 1, duration: 500, easing: Easing.inOut(Easing.sin), useNativeDriver: ND }),
          Animated.timing(anim, { toValue: 0.3, duration: 500, easing: Easing.inOut(Easing.sin), useNativeDriver: ND }),
        ]);
      Animated.sequence([Animated.delay(delay), Animated.loop(pulse())]).start();
    };
    pulseDot(dot1, 1200);
    pulseDot(dot2, 1380);
    pulseDot(dot3, 1560);
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      {/* Radial gold glow — uppe till höger, paritet med OG-image.
          Ingen scale-animation = ingen position-drift. Bara opacity-breathing. */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.glowWrap,
          { opacity: glowOpacity },
        ]}
      >
        <LinearGradient
          colors={theme.glowColors}
          locations={[0, 0.4, 0.75]}
          start={{ x: 0.5, y: 0.5 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>

      {/* Centerblock — badge + wordmark + tagline */}
      <View style={styles.center}>
        {/* Badge */}
        <Animated.View
          style={[
            styles.badge,
            {
              opacity: badgeOpacity,
              backgroundColor: theme.badgeBg,
              borderColor: theme.badgeBorder,
            },
          ]}
        >
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
          <Text style={[styles.wordmark, { color: theme.wordmarkPrimary }]}>
            MAT<Text style={styles.wordmarkGold}>GO</Text>
          </Text>
        </Animated.View>

        {/* Tagline */}
        <Animated.Text
          style={[
            styles.tagline,
            { opacity: taglineOpacity, color: theme.tagline },
          ]}
        >
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
