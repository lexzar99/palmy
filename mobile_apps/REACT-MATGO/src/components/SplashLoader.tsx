import React, { useEffect, useMemo, useRef } from "react";
import {
  Animated,
  Dimensions,
  Easing,
  Image,
  Platform,
  StyleSheet,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";

const { width } = Dimensions.get("window");
const ND = Platform.OS !== "web";

// Cream backdrop matches the native iOS/Android splash for a frame-perfect
// handoff — frame 0 of this component is identical to what the OS shows.
const BG = "#FFF8EF";
const GOLD = "#E7B24B";
const GOLD_DEEP = "#C8932E";
const INK = "#1A0F08";

const PARTICLE_COUNT = 10;
const PARTICLE_RADIUS = Math.min(width * 0.42, 180);

export default function SplashLoader(_props: { message?: string }) {
  // Background warm wash — slowly pulses up + down
  const wash = useRef(new Animated.Value(0)).current;

  // Icon "stamp" entry: drop from above + bounce settle, then breathe
  const iconY = useRef(new Animated.Value(-40)).current;
  const iconOpacity = useRef(new Animated.Value(0)).current;
  const iconScale = useRef(new Animated.Value(1.15)).current;
  const iconSquishX = useRef(new Animated.Value(1)).current;
  const iconSquishY = useRef(new Animated.Value(1)).current;
  const iconBreath = useRef(new Animated.Value(1)).current;

  // Burst particles fired outward from icon center on entry
  const particles = useMemo(
    () => new Array(PARTICLE_COUNT).fill(0).map((_, i) => ({
      progress: new Animated.Value(0),
      angle: (i / PARTICLE_COUNT) * Math.PI * 2,
      size: 4 + (i % 3) * 2, // varied sizes for organic feel
    })),
    []
  );

  // Wordmark + shimmer
  const wordOpacity = useRef(new Animated.Value(0)).current;
  const wordY = useRef(new Animated.Value(20)).current;
  const shimmerX = useRef(new Animated.Value(-1)).current; // -1 → 1, normalized

  // Tagline appears last
  const taglineOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Background warm wash (continuous breathing wash)
    Animated.loop(
      Animated.sequence([
        Animated.timing(wash, { toValue: 1, duration: 3200, easing: Easing.inOut(Easing.quad), useNativeDriver: ND }),
        Animated.timing(wash, { toValue: 0, duration: 3200, easing: Easing.inOut(Easing.quad), useNativeDriver: ND }),
      ])
    ).start();

    // Icon stamp: drop in, squish on impact, settle
    Animated.parallel([
      Animated.timing(iconOpacity, { toValue: 1, duration: 280, easing: Easing.out(Easing.quad), useNativeDriver: ND }),
      Animated.timing(iconY, { toValue: 0, duration: 460, easing: Easing.bezier(0.34, 1.56, 0.64, 1), useNativeDriver: ND }),
      Animated.timing(iconScale, { toValue: 1, duration: 460, easing: Easing.out(Easing.cubic), useNativeDriver: ND }),
    ]).start(() => {
      // Squish-and-rebound on landing
      Animated.sequence([
        Animated.parallel([
          Animated.timing(iconSquishX, { toValue: 1.12, duration: 110, easing: Easing.out(Easing.quad), useNativeDriver: ND }),
          Animated.timing(iconSquishY, { toValue: 0.88, duration: 110, easing: Easing.out(Easing.quad), useNativeDriver: ND }),
        ]),
        Animated.parallel([
          Animated.spring(iconSquishX, { toValue: 1, friction: 4, tension: 140, useNativeDriver: ND }),
          Animated.spring(iconSquishY, { toValue: 1, friction: 4, tension: 140, useNativeDriver: ND }),
        ]),
      ]).start(() => {
        // Continuous gentle breathing
        Animated.loop(
          Animated.sequence([
            Animated.timing(iconBreath, { toValue: 1.04, duration: 2000, easing: Easing.inOut(Easing.quad), useNativeDriver: ND }),
            Animated.timing(iconBreath, { toValue: 1, duration: 2000, easing: Easing.inOut(Easing.quad), useNativeDriver: ND }),
          ])
        ).start();
      });

      // Particle burst fires AFTER icon lands so they appear to come from impact
      Animated.stagger(20, particles.map((p) =>
        Animated.timing(p.progress, {
          toValue: 1,
          duration: 900,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: ND,
        })
      )).start();
    });

    // Wordmark slides up after icon settles
    Animated.sequence([
      Animated.delay(550),
      Animated.parallel([
        Animated.timing(wordOpacity, { toValue: 1, duration: 420, easing: Easing.out(Easing.quad), useNativeDriver: ND }),
        Animated.timing(wordY, { toValue: 0, duration: 480, easing: Easing.out(Easing.cubic), useNativeDriver: ND }),
      ]),
    ]).start(() => {
      // Shimmer sweep across wordmark (and loop slowly)
      Animated.loop(
        Animated.sequence([
          Animated.timing(shimmerX, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.quad), useNativeDriver: ND }),
          Animated.delay(1800),
          Animated.timing(shimmerX, { toValue: -1, duration: 0, useNativeDriver: ND }),
        ])
      ).start();
    });

    // Tagline fades in last
    Animated.sequence([
      Animated.delay(1100),
      Animated.timing(taglineOpacity, { toValue: 1, duration: 460, useNativeDriver: ND }),
    ]).start();
  }, []);

  const washOpacity = wash.interpolate({ inputRange: [0, 1], outputRange: [0.08, 0.18] });
  const shimmerTranslate = shimmerX.interpolate({ inputRange: [-1, 1], outputRange: [-160, 160] });

  return (
    <View style={styles.container}>
      {/* Warm radial wash (subtle, breathing) */}
      <Animated.View pointerEvents="none" style={[styles.wash, { opacity: washOpacity }]}>
        <LinearGradient
          colors={[GOLD, "rgba(231,178,75,0)"]}
          style={StyleSheet.absoluteFill}
          start={{ x: 0.5, y: 0.5 }}
          end={{ x: 1, y: 1 }}
        />
      </Animated.View>

      {/* Burst particles — radiate outward from center */}
      {particles.map((p, i) => {
        const tx = p.progress.interpolate({ inputRange: [0, 1], outputRange: [0, Math.cos(p.angle) * PARTICLE_RADIUS] });
        const ty = p.progress.interpolate({ inputRange: [0, 1], outputRange: [0, Math.sin(p.angle) * PARTICLE_RADIUS] });
        const opacity = p.progress.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 1, 0] });
        const scale = p.progress.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 1, 0.4] });
        return (
          <Animated.View
            key={i}
            pointerEvents="none"
            style={{
              position: "absolute",
              width: p.size, height: p.size, borderRadius: p.size / 2,
              backgroundColor: GOLD,
              opacity,
              transform: [{ translateX: tx }, { translateY: ty }, { scale }],
              shadowColor: GOLD, shadowOpacity: 0.7, shadowRadius: 6, shadowOffset: { width: 0, height: 0 },
            }}
          />
        );
      })}

      {/* Icon — stamp entry (translateY + scale + squish) then breathing */}
      <Animated.View style={{ transform: [{ scale: iconBreath }] }}>
        <Animated.View
          style={{
            opacity: iconOpacity,
            transform: [
              { translateY: iconY },
              { scale: iconScale },
              { scaleX: iconSquishX },
              { scaleY: iconSquishY },
            ],
          }}
        >
          <Image
            source={require("../../assets/icon.png")}
            style={styles.icon}
            resizeMode="contain"
          />
        </Animated.View>
      </Animated.View>

      {/* Wordmark with looping gold shimmer sweep */}
      <Animated.View
        style={{
          marginTop: 32,
          opacity: wordOpacity,
          transform: [{ translateY: wordY }],
          overflow: "hidden",
          borderRadius: 8,
        }}
      >
        <View style={styles.wordWrap}>
          <Animated.Text style={styles.word}>FoodGo</Animated.Text>
          {/* Shimmer overlay — a thin angled gold band sliding across */}
          <Animated.View
            pointerEvents="none"
            style={[
              styles.shimmerOverlay,
              { transform: [{ translateX: shimmerTranslate }, { rotate: "20deg" }] },
            ]}
          >
            <LinearGradient
              colors={[
                "rgba(231,178,75,0)",
                "rgba(231,178,75,0.7)",
                "rgba(231,178,75,0)",
              ]}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>
        </View>
      </Animated.View>

      {/* Tagline */}
      <Animated.Text style={[styles.tagline, { opacity: taglineOpacity }]}>
        Maten på vägen
      </Animated.Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BG,
    alignItems: "center",
    justifyContent: "center",
  },
  wash: {
    position: "absolute",
    width: 420, height: 420, borderRadius: 210,
    overflow: "hidden",
  },
  icon: {
    width: 140, height: 140,
  },
  wordWrap: {
    paddingHorizontal: 4,
    paddingVertical: 2,
    position: "relative",
  },
  word: {
    fontSize: 36,
    fontWeight: "900",
    letterSpacing: 1.2,
    color: INK,
  },
  shimmerOverlay: {
    position: "absolute",
    top: -10,
    left: 0,
    width: 60,
    height: 80,
  },
  tagline: {
    marginTop: 16,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 3,
    textTransform: "uppercase",
    color: GOLD_DEEP,
  },
});
