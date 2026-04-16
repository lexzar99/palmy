import React, { useState, useEffect, useRef } from 'react';
import { View, Text, Pressable, Platform, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAppStore } from '../store/useAppStore';
import { palette, styles } from '../constants/theme';

export default function BottomTabs({
  active,
  onChange,
}: {
  active: string;
  onChange: (name: "home" | "search" | "cart" | "profile" | "discover") => void;
}) {
  const itemCount = useAppStore((state) => state.items.reduce((sum, item) => sum + item.quantity, 0));
  const tabs: { key: "home" | "discover" | "cart" | "profile"; label: string; icon: keyof typeof Ionicons.glyphMap; count?: number }[] = [
    { key: "home", label: "HEM", icon: "home-outline" },
    { key: "discover", label: "UPPTÄCK", icon: "compass-outline" },
    { key: "cart", label: "KASSE", icon: "bag-handle-outline", count: itemCount },
    { key: "profile", label: "PROFIL", icon: "person-outline" },
  ];

  const translateX = useRef(new Animated.Value(0)).current;
  const pillWidth = useRef(new Animated.Value(0)).current;
  const [layouts, setLayouts] = useState<Record<string, { x: number; width: number }>>({});

  useEffect(() => {
    if (layouts[active]) {
      Animated.parallel([
        Animated.spring(translateX, {
          toValue: layouts[active].x,
          useNativeDriver: false,
          friction: 8,
          tension: 40,
        }),
        Animated.spring(pillWidth, {
          toValue: layouts[active].width,
          useNativeDriver: false,
          friction: 8,
          tension: 40,
        }),
      ]).start();
    }
  }, [active, layouts, translateX, pillWidth]);

  return (
    <View
      style={[
        styles.bottomTabs,
        {
          left: 18,
          right: 18,
          bottom: 28,
          borderRadius: 45,
          paddingVertical: 8,
          paddingHorizontal: 8,
          backgroundColor: "rgba(33, 28, 25, 0.9)",
          borderWidth: 1,
          borderColor: palette.border,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 20 },
          shadowOpacity: 0.6,
          shadowRadius: 30,
          elevation: 15,
          flexDirection: "row",
        },
      ]}
    >
      <Animated.View
        style={{
          position: "absolute",
          top: 8,
          bottom: 8,
          left: 8,
          width: pillWidth,
          transform: [{ translateX }],
          zIndex: 0,
          borderRadius: 38,
          overflow: "hidden",
        }}
      >
        <LinearGradient
          colors={[palette.gold, palette.goldDark]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ 
            flex: 1, 
            shadowColor: palette.gold, 
            shadowOffset: { width: 0, height: 4 }, 
            shadowOpacity: 0.3, 
            shadowRadius: 10,
            borderWidth: 1,
            borderColor: "rgba(0,0,0,0.1)", // Darker border for definition
          }}
        />
      </Animated.View>

      {tabs.map((tab) => (
        <TabItem
          key={tab.key}
          tab={tab}
          isFocused={active === tab.key}
          onLayout={(e) => {
            const { x, width } = e.nativeEvent.layout;
            setLayouts((prev) => ({ ...prev, [tab.key]: { x, width } }));
          }}
          onPress={() => onChange(tab.key)}
        />
      ))}
    </View>
  );
}

function TabItem({ 
  tab, 
  isFocused, 
  onLayout,
  onPress 
}: { 
  tab: any; 
  isFocused: boolean; 
  onLayout: (e: any) => void;
  onPress: () => void 
}) {
  const scale = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(scale, {
      toValue: 0.9,
      useNativeDriver: Platform.OS !== "web",
      friction: 4,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: Platform.OS !== "web",
      friction: 4,
    }).start();
  };

  return (
    <Pressable
      onLayout={onLayout}
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={{
        flex: isFocused ? 1.5 : 1,
        height: 58,
        justifyContent: "center",
        alignItems: "center",
        zIndex: 1,
      }}
    >
      <Animated.View 
        style={{ 
          flexDirection: "column", 
          alignItems: "center", 
          justifyContent: "center", 
          gap: 2,
          transform: [{ scale }]
        }}
      >
        <View style={{ position: "relative" }}>
          <Ionicons 
            name={isFocused ? (tab.icon.replace("-outline", "") as any) : tab.icon} 
            size={22} 
            color={isFocused ? "#000" : palette.muted}
          />
          {tab.count !== undefined && tab.count > 0 && !isFocused && (
            <View style={{
              position: "absolute",
              top: -4,
              right: -8,
              backgroundColor: palette.gold,
              width: 14,
              height: 14,
              borderRadius: 7,
              borderWidth: 1.5,
              borderColor: palette.panel,
              alignItems: "center",
              justifyContent: "center",
              shadowColor: palette.gold,
              shadowOpacity: 0.5,
              shadowRadius: 4,
              elevation: 2,
            }}>
              <Text style={{ color: "#000", fontSize: 7, fontWeight: "900" }}>{tab.count}</Text>
            </View>
          )}
        </View>
        
        {isFocused && (
          <Text 
            numberOfLines={1} 
            style={{ 
              color: "#000", // Changed to black for contrast
              fontSize: 8, 
              fontWeight: "900",
              letterSpacing: 2,
              textTransform: "uppercase"
            }}
          >
            {tab.label}
          </Text>
        )}
      </Animated.View>
    </Pressable>
  );
}
