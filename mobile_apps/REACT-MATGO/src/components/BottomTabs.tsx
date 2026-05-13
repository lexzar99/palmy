import React, { useState, useEffect, useRef } from 'react';
import { View, Text, Pressable, Platform, Animated, Easing } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useArabic } from '../hooks/useArabic';
import { getBottomTabsBottomOffset } from '../constants/layout';
import { useAppStore } from '../store/useAppStore';
import { styles } from '../constants/theme';
import { useTheme } from '../theme';

export default function BottomTabs({
  active,
  onChange,
}: {
  active: string;
  onChange: (name: "home" | "search" | "cart" | "profile" | "discover" | "orders") => void;
}) {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { ls } = useArabic();
  const { palette } = useTheme();
  const itemCount = useAppStore((state) => state.items.reduce((sum, item) => sum + item.quantity, 0));
  // Tab order matches the web's BottomNav: home, discover, cart, orders, profile.
  // "Orders" uses a receipt-style icon (Ionicons receipt-outline ~ lucide ReceiptText).
  const tabs: { key: "home" | "discover" | "cart" | "orders" | "profile"; label: string; icon: keyof typeof Ionicons.glyphMap; count?: number }[] = [
    { key: "home", label: t('tabs.home'), icon: "home-outline" },
    { key: "discover", label: t('tabs.discover'), icon: "compass-outline" },
    { key: "cart", label: t('tabs.cart'), icon: "bag-handle-outline", count: itemCount },
    { key: "orders", label: t('tabs.orders', { defaultValue: 'ORDER' }), icon: "receipt-outline" },
    { key: "profile", label: t('tabs.profile'), icon: "person-outline" },
  ];

  const translateX = useRef(new Animated.Value(0)).current;
  const pillWidth = useRef(new Animated.Value(0)).current;
  const [layouts, setLayouts] = useState<Record<string, { x: number; width: number }>>({});

  useEffect(() => {
    if (layouts[active]) {
      Animated.parallel([
        Animated.timing(translateX, {
          toValue: layouts[active].x,
          duration: 240,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false,
        }),
        Animated.timing(pillWidth, {
          toValue: layouts[active].width,
          duration: 240,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false,
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
          bottom: getBottomTabsBottomOffset(insets.bottom),
          borderRadius: 45,
          paddingVertical: 8,
          paddingHorizontal: 8,
          backgroundColor: "rgba(252, 252, 249, 0.9)", // slightly transparent light bg
          borderWidth: 1,
          borderColor: palette.border,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 10 },
          shadowOpacity: 0.08,
          shadowRadius: 20,
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
          colors={["#E8C978", palette.gold]}
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
          ls={ls}
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
  ls,
  onLayout,
  onPress,
}: {
  tab: any;
  isFocused: boolean;
  ls: (v: number) => number;
  onLayout: (e: any) => void;
  onPress: () => void;
}) {
  const { palette } = useTheme();
  const scale = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.timing(scale, {
      toValue: 0.94,
      duration: 100,
      easing: Easing.out(Easing.quad),
      useNativeDriver: Platform.OS !== "web",
    }).start();
  };

  const handlePressOut = () => {
    Animated.timing(scale, {
      toValue: 1,
      duration: 160,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: Platform.OS !== "web",
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
              color: "#000",
              fontSize: 8,
              fontWeight: "900",
              letterSpacing: ls(2),
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
