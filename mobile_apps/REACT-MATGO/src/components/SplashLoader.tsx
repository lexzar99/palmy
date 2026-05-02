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

const { width } = Dimensions.get("window");
const ND = Platform.OS !== "web";

// Premium palette — cream backdrop matches the native iOS/Android splash for
// a frame-perfect handoff. The native splash shows the icon centred on
// #FFF8EF; this component picks up at frame 0 so there's no visible swap.
const BG = "#FFF8EF";
const GOLD = "#E7B24B";
const GOLD_DEEP = "#C8932E";
const INK = "#1A0F08";

const WORD = "FoodGo";

export default function SplashLoader(_props: { message?: string }) {
  // Icon entrance
  const iconOpacity = useRef(new Animated.Value(0)).current;
  const iconScale = useRef(new Animated.Value(0.7)).current;
  const iconRotate = useRef(new Animated.Value(-1)).current; // -10° → 0°
  const breath = useRef(new Animated.Value(1)).current;

  // Three concentric ripples that loop with staggered phase
  const ripple1 = useRef(new Animated.Value(0)).current;
  const ripple2 = useRef(new Animated.Value(0)).current;
  const ripple3 = useRef(new Animated.Value(0)).current;

  // Soft ambient glow behind icon
  const glow = useRef(new Animated.Value(0)).current;

  // Letter-by-letter wordmark — one Animated.Value per letter
  const letters = useMemo(
    () => WORD.split("").map(() => ({
      opacity: new Animated.Value(0),
      y: new Animated.Value(14),
      scale: new Animated.Value(0.6),
    })),
    []
  );

  // Gold underline that draws from center outward after letters land
  const underlineScale = useRef(new Animated.Value(0)).current;
  const underlineOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Icon: fade + scale + de-rotate, with a tiny back-overshoot
    Animated.parallel([
      Animated.timing(iconOpacity, { toValue: 1, duration: 520, easing: Easing.out(Easing.quad), useNativeDriver: ND }),
      Animated.timing(iconScale, { toValue: 1, duration: 700, easing: Easing.out(Easing.back(1.5)), useNativeDriver: ND }),
      Animated.timing(iconRotate, { toValue: 0, duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver: ND }),
    ]).start(() => {
      // Subtle continuous breathing once landed
      Animated.loop(
        Animated.sequence([
          Animated.timing(breath, { toValue: 1.04, duration: 1900, easing: Easing.inOut(Easing.quad), useNativeDriver: ND }),
          Animated.timing(breath, { toValue: 1, duration: 1900, easing: Easing.inOut(Easing.quad), useNativeDriver: ND }),
        ])
      ).start();
    });

    // Three ripples — each loops independently, staggered start so they
    // form a continuous wave outward. Pure transforms = native-driven.
    const startRipple = (val: Animated.Value, delay: number) => {
      val.setValue(0);
      Animated.sequence([
        Animated.delay(delay),
        Animated.loop(
          Animated.timing(val, {
            toValue: 1,
            duration: 2400,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: ND,
          })
        ),
      ]).start();
    };
    startRipple(ripple1, 0);
    startRipple(ripple2, 800);
    startRipple(ripple3, 1600);

    // Glow fades in then breathes
    Animated.sequence([
      Animated.delay(180),
      Animated.timing(glow, { toValue: 0.22, duration: 500, useNativeDriver: ND }),
    ]).start(() => {
      Animated.loop(
        Animated.sequence([
          Animated.timing(glow, { toValue: 0.34, duration: 2200, easing: Easing.inOut(Easing.quad), useNativeDriver: ND }),
          Animated.timing(glow, { toValue: 0.16, duration: 2200, easing: Easing.inOut(Easing.quad), useNativeDriver: ND }),
        ])
      ).start();
    });

    // Letter stagger — each letter gets a 65 ms head start
    const letterDelay = 380;
    letters.forEach((letter, i) => {
      Animated.sequence([
        Animated.delay(letterDelay + i * 65),
        Animated.parallel([
          Animated.timing(letter.opacity, { toValue: 1, duration: 320, easing: Easing.out(Easing.quad), useNativeDriver: ND }),
          Animated.timing(letter.y, { toValue: 0, duration: 380, easing: Easing.out(Easing.cubic), useNativeDriver: ND }),
          Animated.timing(letter.scale, { toValue: 1, duration: 420, easing: Easing.out(Easing.back(1.6)), useNativeDriver: ND }),
        ]),
      ]).start();
    });

    // Underline draws after the last letter lands
    const underlineDelay = letterDelay + WORD.length * 65 + 280;
    Animated.sequence([
      Animated.delay(underlineDelay),
      Animated.parallel([
        Animated.timing(underlineOpacity, { toValue: 1, duration: 220, useNativeDriver: ND }),
        Animated.timing(underlineScale, { toValue: 1, duration: 520, easing: Easing.out(Easing.cubic), useNativeDriver: ND }),
      ]),
    ]).start();
  }, []);

  const iconRotateDeg = iconRotate.interpolate({ inputRange: [-1, 0], outputRange: ["-10deg", "0deg"] });
  const ringMax = Math.min(width * 0.85, 360);

  return (
    <View style={styles.container}>
      {/* Three concentric ripples behind the icon */}
      {[ripple1, ripple2, ripple3].map((val, i) => {
        const scale = val.interpolate({ inputRange: [0, 1], outputRange: [0.4, 2.2] });
        const opacity = val.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 0.5, 0] });
        return (
          <Animated.View
            key={i}
            pointerEvents="none"
            style={{
              position: "absolute",
              width: ringMax, height: ringMax, borderRadius: ringMax / 2,
              borderWidth: 1, borderColor: GOLD,
              opacity, transform: [{ scale }],
            }}
          />
        );
      })}

      {/* Soft ambient glow */}
      <Animated.View
        pointerEvents="none"
        style={{
          position: "absolute",
          width: 200, height: 200, borderRadius: 100,
          backgroundColor: GOLD,
          opacity: glow,
          shadowColor: GOLD, shadowOpacity: 1, shadowRadius: 60, shadowOffset: { width: 0, height: 0 },
        }}
      />

      {/* Icon — outer = breathing loop, inner = entrance (scale + fade + rotate) */}
      <Animated.View style={{ transform: [{ scale: breath }] }}>
        <Animated.View
          style={{
            opacity: iconOpacity,
            transform: [{ scale: iconScale }, { rotate: iconRotateDeg }],
          }}
        >
          <Image
            source={require("../../assets/icon.png")}
            style={styles.icon}
            resizeMode="contain"
          />
        </Animated.View>
      </Animated.View>

      {/* Wordmark — letter-by-letter stagger */}
      <View style={styles.wordRow}>
        {letters.map((letter, i) => (
          <Animated.Text
            key={i}
            style={[
              styles.letter,
              {
                opacity: letter.opacity,
                transform: [{ translateY: letter.y }, { scale: letter.scale }],
              },
            ]}
          >
            {WORD[i]}
          </Animated.Text>
        ))}
      </View>

      {/* Gold underline that draws outward from center */}
      <Animated.View
        style={{
          marginTop: 14,
          width: 64, height: 3, borderRadius: 1.5,
          backgroundColor: GOLD,
          opacity: underlineOpacity,
          transform: [{ scaleX: underlineScale }],
          shadowColor: GOLD_DEEP, shadowOpacity: 0.5, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
        }}
      />
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
  icon: { width: 130, height: 130 },
  wordRow: {
    flexDirection: "row",
    marginTop: 30,
  },
  letter: {
    fontSize: 32,
    fontWeight: "900",
    letterSpacing: 0.5,
    color: INK,
  },
});
