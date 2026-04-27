import React, { useRef } from "react";
import { Animated, Platform, Pressable } from "react-native";

export default function ScalePressable({ children, onPress, style, onLayout, disabled }: { children: React.ReactNode; onPress?: () => void; style?: any; onLayout?: any; disabled?: boolean }) {
  const scale = useRef(new Animated.Value(1)).current;
  const handlePressIn = () => {
    Animated.timing(scale, { toValue: 0.92, duration: 80, useNativeDriver: Platform.OS !== "web" }).start();
  };
  const handlePressOut = () => {
    Animated.timing(scale, { toValue: 1, duration: 120, useNativeDriver: Platform.OS !== "web" }).start();
  };
  return (
    <Pressable 
      onPressIn={handlePressIn} 
      onPressOut={handlePressOut} 
      onPress={onPress}
      onLayout={onLayout}
      disabled={disabled}
      unstable_pressDelay={50} // Förhindrar att skärmen flimrar in/ut om man bara snabbt swipar för att scrolla
    >
      <Animated.View style={[{ transform: [{ scale }] }, style]}>
        {children}
      </Animated.View>
    </Pressable>
  );
}
