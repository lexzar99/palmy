import React, { useRef } from "react";
import { Animated, Platform, Pressable } from "react-native";

export default function ScalePressable({ children, onPress, style }: { children: React.ReactNode; onPress?: () => void; style?: any }) {
  const scale = useRef(new Animated.Value(1)).current;
  const handlePressIn = () => {
    Animated.timing(scale, { toValue: 0.92, duration: 80, useNativeDriver: Platform.OS !== "web" }).start();
  };
  const handlePressOut = () => {
    Animated.spring(scale, { toValue: 1, friction: 3, tension: 150, useNativeDriver: Platform.OS !== "web" }).start();
  };
  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable onPressIn={handlePressIn} onPressOut={handlePressOut} onPress={onPress} style={style}>
        {children}
      </Pressable>
    </Animated.View>
  );
}
