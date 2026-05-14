import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Easing,
  FlatList,
  I18nManager,
  Image,
  KeyboardAvoidingView,
  LayoutAnimation,
  Linking,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
  ActivityIndicator,
  BackHandler,
} from "react-native";

// Keep layout LTR for all languages — no RTL flip even for Arabic
I18nManager.allowRTL(false);
I18nManager.forceRTL(false);
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { NavigationContainer, createNavigationContainerRef, StackActions, CommonActions } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

const Stack = createNativeStackNavigator();
export const navigationRef = createNavigationContainerRef<any>();
import { StatusBar as ExpoStatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import { useFonts } from "expo-font";
import {
  Outfit_400Regular,
  Outfit_500Medium,
  Outfit_600SemiBold,
  Outfit_700Bold,
  Outfit_800ExtraBold,
  Outfit_900Black,
} from "@expo-google-fonts/outfit";
import { io, Socket } from "socket.io-client";
import * as WebBrowser from "expo-web-browser";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";

import { I18nextProvider } from 'react-i18next';
import { initI18n } from './src/i18n';
import { RestartContext } from './src/contexts/restart';
import { supabase } from "./src/lib/supabase";
import { validateEnv } from "./src/lib/env";
import { initSentry, wrap as sentryWrap } from "./src/lib/sentry";
import { requestTracking } from "./src/lib/tracking";
import ErrorBoundary from "./src/components/ErrorBoundary";

initSentry();
import {
  API_URL,
  SOCKET_URL,
  STRIPE_PUBLISHABLE_KEY,
  WEB_URL,
  api,
  getImageUrl,
  setUnauthorizedHandler,
} from "./src/lib/api";
import {
  APP_AUTH_CALLBACK_URL,
  isAuthRedirectUrl,
  parseAuthRedirect,
} from "./src/lib/authRedirect";
import { AppStripeProvider, useAppPaymentSheet } from "./src/lib/stripeProvider";
import { startOrderActivity, updateOrderActivity, endOrderActivity } from "./src/lib/liveActivities";
import { ThemeProvider, setBrandFontLoaded, useSharedStyles, useTheme, useThemeMode } from "./src/theme";
import { useAppStore } from "./src/store/useAppStore";
import { usePushNotifications } from "./src/hooks/usePushNotifications";
import { useOrderActivitySync } from "./src/hooks/useOrderActivitySync";

import type {
  AppRoute,
  CartItem,
  City,
  DeliveryCheck,
  MenuCategory,
  MenuExtra,
  MenuExtraGroup,
  MenuProduct,
  Order,
  OrderType,
  Profile,
  PublicDeal,
  Restaurant,
  ReviewPayload,
} from "./src/types";

// ─── Screen imports ────────────────────────────────────────────────────────────
import HomeScreen from "./src/screens/HomeScreen";
import DiscoverScreen from "./src/screens/DiscoverScreen";
import SearchScreen from "./src/screens/SearchScreen";
import RestaurantScreen from "./src/screens/RestaurantScreen";
import CartScreen from "./src/screens/CartScreen";
import ProfileScreen from "./src/screens/ProfileScreen";
import RegisterScreen from "./src/screens/RegisterScreen";
import EmailLoginScreen from "./src/screens/EmailLoginScreen";
import ForgotPasswordScreen from "./src/screens/ForgotPasswordScreen";
import ResetPasswordScreen from "./src/screens/ResetPasswordScreen";
import OrderScreen from "./src/screens/OrderScreen";
import OrdersListScreen from "./src/screens/OrdersListScreen";
import DealScreen from "./src/screens/DealScreen";
import OnboardingScreen from "./src/screens/OnboardingScreen";
import PhoneGateScreen from "./src/screens/PhoneGateScreen";

// ─── Component imports ─────────────────────────────────────────────────────────
import ProductModal from "./src/components/ProductModal";
import SplashLoader from "./src/components/SplashLoader";
import LiveOrderBanner from "./src/components/LiveOrderBanner";
import ClaimDealPopup from "./src/components/ClaimDealPopup";
import BottomTabs from "./src/components/BottomTabs";
import CityModal from "./src/components/CityModal";
import RestaurantInfoModal from "./src/components/RestaurantInfoModal";
import SponsorTile from "./src/components/SponsorTile";
import AddressModal from "./src/components/AddressModal";
import DealFlipCard, { type DealFlipCardData } from "./src/components/DealFlipCard";
import HomeAddressInput from "./src/components/HomeAddressInput";
import AddressAutocomplete from "./src/components/AddressAutocomplete";
import ZipAutocomplete from "./src/components/ZipAutocomplete";

// ─── Shared UI atoms (no longer exported from App — live in src/components/ui) ─
import ScalePressable from "./src/components/ScalePressable";
import StarRating from "./src/components/StarRating";
import NetworkBanner from "./src/components/NetworkBanner";

// Required for expo-auth-session to handle redirects on Android/web
WebBrowser.maybeCompleteAuthSession();

// Configure notifications. We honour a `silent: true` payload field so the
// content-available wake-pushes that resync the Live Activity don't ding the
// user every time the order moves between status states. Only the review
// prompt is allowed to set a badge — every other push is either an LA-wake
// (silent) or a status banner that the user has already seen as the LA.
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const data = notification?.request?.content?.data as Record<string, any> | undefined;
    const silent = data?.silent === true || data?.silent === "true";
    const isReviewPrompt = data?.status === 'REVIEW_PROMPT';
    return {
      shouldShowAlert: !silent,
      shouldPlaySound: !silent,
      shouldSetBadge: isReviewPrompt,
      shouldShowBanner: !silent,
      shouldShowList: !silent,
    };
  },
});

// Use a fixed custom scheme so Supabase can whitelist one stable mobile redirect.
const SUPABASE_REDIRECT_URL = APP_AUTH_CALLBACK_URL;

const COUNTRY_CODES = [
  { code: "+46", flag: "🇸🇪", name: "Sverige" },
  { code: "+45", flag: "🇩🇰", name: "Danmark" },
  { code: "+47", flag: "🇳🇴", name: "Norge" },
  { code: "+358", flag: "🇫🇮", name: "Finland" },
];

const cuisineFilters = ["Alla", "Pizza", "Sushi", "Kebab", "Burgare", "Pasta", "Asiatiskt"];


// ─── Shared UI components (defined here for use by App-internal screens) ───────
function PulseIndicator({ color, size = 12 }: { color: string; size?: number }) {
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(0.6)).current;

  useEffect(() => {
    Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(scale, { toValue: 2, duration: 1500, useNativeDriver: Platform.OS !== "web" }),
          Animated.timing(scale, { toValue: 1, duration: 0, useNativeDriver: Platform.OS !== "web" }),
        ]),
        Animated.sequence([
          Animated.timing(opacity, { toValue: 0, duration: 1500, useNativeDriver: Platform.OS !== "web" }),
          Animated.timing(opacity, { toValue: 0.6, duration: 0, useNativeDriver: Platform.OS !== "web" }),
        ]),
      ])
    ).start();
  }, [scale, opacity]);

  return (
    <View style={{ alignItems: "center", justifyContent: "center", width: size * 2, height: size * 2 }}>
      <Animated.View
        style={{
          position: "absolute",
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
          transform: [{ scale }],
          opacity,
        }}
      />
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }} />
    </View>
  );
}

function SpinningLoader({ color, size = 20 }: { color: string; size?: number }) {
  const rotate = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.timing(rotate, {
        toValue: 1,
        duration: 2000,
        easing: Easing.linear,
        useNativeDriver: Platform.OS !== "web",
      })
    ).start();
  }, [rotate]);

  const spin = rotate.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });

  return (
    <Animated.View style={{ transform: [{ rotate: spin }] }}>
      <Ionicons name="reload-outline" size={size} color={color} />
    </Animated.View>
  );
}

function Header({
  title,
  subtitle,
  onBack,
}: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
}) {
  const { palette } = useTheme();
  const styles = useSharedStyles();
  return (
    <View style={styles.header}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        {onBack && (
          <Pressable style={styles.backButton} onPress={onBack}>
            <Ionicons name="chevron-back-outline" size={18} color={palette.text} />
          </Pressable>
        )}
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>{title}</Text>
          {!!subtitle && <Text style={styles.headerSubtitle}>{subtitle}</Text>}
        </View>
      </View>
    </View>
  );
}

function ScreenWrap({ children }: { children: React.ReactNode }) {
  const styles = useSharedStyles();
  return <ScrollView contentContainerStyle={styles.scrollContent}>{children}</ScrollView>;
}

function RestaurantCard({
  restaurant,
  onPress,
  containerStyle,
  isOutOfZone = false,
}: {
  restaurant: Restaurant;
  onPress: () => void;
  containerStyle?: any;
  isOutOfZone?: boolean;
}) {
  const { palette } = useTheme();
  const styles = useSharedStyles();
  return (
    <ScalePressable
      style={[
        styles.restaurantCard,
        {
          borderRadius: 36,
          padding: 14,
          borderWidth: 1.5,
          borderColor: "rgba(231,178,75,0.45)",
          shadowColor: palette.gold,
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: 0.25,
          shadowRadius: 18,
          elevation: 10,
          backgroundColor: palette.panel,
        },
        containerStyle,
      ]}
      onPress={onPress}
    >
      {!!restaurant.imageUrl && (
        <Image
          source={{ uri: getImageUrl(restaurant.heroImageUrl || restaurant.imageUrl) }}
          style={[styles.restaurantImage, { borderRadius: 28, height: 230 }]}
        />
      )}
      <View style={{ flex: 1, paddingTop: 18, paddingHorizontal: 6 }}>
        <Text
          style={{ color: palette.text, fontSize: 24, fontWeight: "900", marginBottom: 6 }}
          numberOfLines={1}
        >
          {restaurant.name.toUpperCase()}
        </Text>

        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 }}>
          {isOutOfZone ? (
            <View
              style={{
                paddingHorizontal: 10,
                paddingVertical: 5,
                borderRadius: 12,
                backgroundColor: "rgba(220,38,38,0.15)",
              }}
            >
              <Text style={{ color: "#fb7185", fontSize: 10, fontWeight: "900" }}>UTANFÖR ZON</Text>
            </View>
          ) : (
            <View
              style={{
                paddingHorizontal: 10,
                paddingVertical: 5,
                borderRadius: 12,
                backgroundColor:
                  restaurant.isOpen === false
                    ? "rgba(220,38,38,0.15)"
                    : "rgba(16,185,129,0.15)",
              }}
            >
              <Text
                style={{
                  color: restaurant.isOpen === false ? "#fb7185" : "#10b981",
                  fontSize: 10,
                  fontWeight: "900",
                }}
              >
                {restaurant.isOpen === false ? "STÄNGD" : "ÖPPET"}
              </Text>
            </View>
          )}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <StarRating rating={restaurant.rating || 4.5} size={14} />
            <Text style={{ color: palette.gold, fontSize: 13, fontWeight: "900", marginLeft: 2 }}>
              {restaurant.rating?.toFixed(1) || "4.5"}
            </Text>
          </View>
        </View>

        <Text style={{ color: "#6f667d", fontSize: 12, fontWeight: "800", marginBottom: 16 }}>
          {(restaurant.description || restaurant.cuisine || "Restaurang").toUpperCase()}
        </Text>

        <View
          style={{
            paddingTop: 16,
            borderTopWidth: 1,
            borderTopColor: "rgba(255,255,255,0.03)",
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <View style={{ flexDirection: "row", gap: 20 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Ionicons name="time-outline" size={14} color={palette.gold} />
              <Text style={{ color: "#9c96a5", fontSize: 12, fontWeight: "900" }}>
                {Math.round(restaurant.etaMinutes || 30)} MIN
              </Text>
            </View>
            {restaurant.deliveryFee && restaurant.deliveryFee > 0 ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Ionicons name="bicycle-outline" size={14} color={palette.gold} />
                <Text style={{ color: "#9c96a5", fontSize: 12, fontWeight: "900" }}>
                  {Math.round(restaurant.deliveryFee)} KR
                </Text>
              </View>
            ) : (
              <Text style={{ color: "#10b981", fontSize: 12, fontWeight: "900" }}>
                Fri leverans
              </Text>
            )}
          </View>
          <Ionicons name="chevron-forward" size={18} color={palette.gold} />
        </View>
      </View>
    </ScalePressable>
  );
}

function SectionTitle({
  title,
  actionLabel,
  onPress,
}: {
  title: string;
  actionLabel?: string;
  onPress?: () => void;
}) {
  const styles = useSharedStyles();
  return (
    <View style={styles.sectionTitleRow}>
      <Text style={styles.sectionHeading}>{title}</Text>
      {!!actionLabel && !!onPress && (
        <Pressable onPress={onPress}>
          <Text style={styles.linkText}>{actionLabel}</Text>
        </Pressable>
      )}
    </View>
  );
}

function ToggleChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const styles = useSharedStyles();
  return (
    <ScalePressable style={[styles.chip, active && styles.chipActive]} onPress={onPress}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </ScalePressable>
  );
}

function Badge({
  label,
  tone,
}: {
  label: string;
  tone: "success" | "danger" | "gold" | "info";
}) {
  const { palette } = useTheme();
  const styles = useSharedStyles();
  const map = {
    success: { bg: "rgba(52,199,89,0.12)", text: palette.success },
    danger: { bg: "rgba(255,59,48,0.12)", text: palette.danger },
    gold: { bg: "rgba(234,181,69,0.12)", text: palette.gold },
    info: { bg: "rgba(0,122,255,0.12)", text: palette.info },
  };
  return (
    <View style={[styles.badge, { backgroundColor: map[tone].bg }]}>
      <Text style={[styles.badgeText, { color: map[tone].text }]}>{label}</Text>
    </View>
  );
}

function Counter({
  value,
  onDecrease,
  onIncrease,
}: {
  value: number;
  onDecrease: () => void;
  onIncrease: () => void;
}) {
  const { palette } = useTheme();
  const styles = useSharedStyles();
  return (
    <View style={styles.counter}>
      <Pressable onPress={onDecrease}>
        <Ionicons name="remove-outline" size={18} color={palette.text} />
      </Pressable>
      <Text style={styles.counterText}>{value}</Text>
      <Pressable onPress={onIncrease}>
        <Ionicons name="add-outline" size={18} color={palette.text} />
      </Pressable>
    </View>
  );
}

function SummaryRow({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  const { palette } = useTheme();
  const styles = useSharedStyles();
  return (
    <View style={styles.inlineSummary}>
      <Text style={[styles.summaryLabel, highlight && { color: palette.text }]}>{label}</Text>
      <Text style={[styles.summaryValue, highlight && { color: palette.gold }]}>{value}</Text>
    </View>
  );
}

function EmptyPanel({ label }: { label: string }) {
  const styles = useSharedStyles();
  return (
    <View style={styles.emptyPanel}>
      <Text style={styles.helperText}>{label}</Text>
    </View>
  );
}

function PrimaryButton({
  label,
  onPress,
  disabled,
  icon,
  style,
}: {
  label: string;
  onPress: () => void | Promise<void>;
  disabled?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  style?: any;
}) {
  const styles = useSharedStyles();
  return (
    <Pressable
      style={[styles.primaryButton, disabled && styles.primaryButtonDisabled, style]}
      onPress={onPress}
      disabled={disabled}
    >
      {icon && <Ionicons name={icon} size={18} color="#000" />}
      <Text style={styles.primaryButtonLabel}>{label}</Text>
    </Pressable>
  );
}

// ─── App-level data helpers ────────────────────────────────────────────────────
const DISCOVER_CATEGORIES = [
  { name: "Pizza", icon: "pizza-outline" as const, tint: "#ef4444", bg: "rgba(239,68,68,0.1)" },
  { name: "Burgare", icon: "fast-food-outline" as const, tint: "#f59e0b", bg: "rgba(245,158,11,0.1)" },
  { name: "Sallad", icon: "leaf-outline" as const, tint: "#22c55e", bg: "rgba(34,197,94,0.1)" },
  { name: "Sushi", icon: "fish-outline" as const, tint: "#38bdf8", bg: "rgba(56,189,248,0.1)" },
  { name: "Kebab", icon: "restaurant-outline" as const, tint: "#f97316", bg: "rgba(249,115,22,0.1)" },
  { name: "Snabbmat", icon: "bicycle-outline" as const, tint: "#a855f7", bg: "rgba(168,85,247,0.1)" },
];

const PREFERENCE_OPTIONS = ["Lök", "Vitlök", "Nötter", "Fisk", "Skaldjur", "Ägg", "Mjölk", "Gluten"];
type SavedAddress = {
  id: string;
  label: string;
  street: string;
  city: string;
  zip: string;
  note?: string | null;
  isDefault?: boolean;
};

type PersonalDeal = {
  id?: string;
  code: string;
  campaign?: {
    title?: string;
    description?: string;
    discountType?: string;
    discountValue?: number;
    minOrder?: number;
    validUntil?: string | null;
  } | null;
};

const dayOrder = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const dayLabels: Record<string, string> = {
  monday: "Mån",
  tuesday: "Tis",
  wednesday: "Ons",
  thursday: "Tors",
  friday: "Fre",
  saturday: "Lör",
  sunday: "Sön",
};

function sortRestaurantsForHome(restaurants: Restaurant[], zoneIds: string[] | null = null) {
  return [...restaurants].sort((a, b) => {
    if (zoneIds !== null) {
      const aIn = zoneIds.includes(a.id) ? 1 : 0;
      const bIn = zoneIds.includes(b.id) ? 1 : 0;
      if (aIn !== bIn) return bIn - aIn;
    }
    const aOpen = a.isOpen !== false ? 1 : 0;
    const bOpen = b.isOpen !== false ? 1 : 0;
    if (aOpen !== bOpen) return bOpen - aOpen;
    const aRank = a.featuredClass === 1 ? 2 : a.featuredClass === 2 ? 1 : 0;
    const bRank = b.featuredClass === 1 ? 2 : b.featuredClass === 2 ? 1 : 0;
    if (aRank !== bRank) return bRank - aRank;
    return a.name.localeCompare(b.name);
  });
}

function getRestaurantDeal(deals: PublicDeal[], restaurantId?: string) {
  return deals.find(
    (deal) =>
      deal.isGlobal ||
      deal.restaurantId === restaurantId ||
      !!(restaurantId && deal.applicableRestaurantIds?.includes(restaurantId))
  );
}

function formatPublicDealReward(deal: PublicDeal) {
  if (deal.discountType === "FIXED") {
    return `${Number(deal.discountValue || 0).toFixed(0)} KR RABATT`;
  }
  return `${Number(deal.discountValue || 0).toFixed(0)}% RABATT`;
}

function formatPersonalDealReward(deal: PersonalDeal) {
  const campaign = deal.campaign || {};
  if (campaign.discountType === "FIXED") {
    return `${Number(campaign.discountValue || 0).toFixed(0)} KR RABATT`;
  }
  return `${Number(campaign.discountValue || 0).toFixed(0)}% RABATT`;
}

function getTodayOpeningPreview(restaurant?: Restaurant | null) {
  const regular = restaurant?.openingHours?.regular;
  if (!regular) return null;
  const todayKey = dayOrder[new Date().getDay()];
  const today = regular[todayKey];
  if (!today) return null;
  if (today.closed || !today.shifts?.length) return "Stängt idag";
  return today.shifts.map((shift) => `${shift.open}-${shift.close}`).join(", ");
}

export function getOpeningHoursLines(restaurant?: Restaurant | null) {
  const regular = restaurant?.openingHours?.regular;
  if (!regular) return [];
  return dayOrder.map((day) => {
    const config = regular[day];
    if (!config || config.closed || !config.shifts?.length) {
      return `${dayLabels[day]}: Stängt`;
    }
    return `${dayLabels[day]}: ${config.shifts.map((shift) => `${shift.open}-${shift.close}`).join(", ")}`;
  });
}

// ─── AppContent ────────────────────────────────────────────────────────────────
function AppContent() {
  const { palette, mode } = useTheme();
  const styles = useSharedStyles();
  const [currentRouteName, setCurrentRouteName] = useState<string>("home");
  const [splashFinished, setSplashFinished] = useState(false);
  const hydrated = useAppStore((s) => s.hydrated);
  const hydrate = useAppStore((s) => s.hydrate);
  const { activeOrderId, setActiveOrder } = useAppStore();
  const onboardingComplete = useAppStore((s) => s.onboardingComplete);
  const token = useAppStore((s) => s.token);
  const setToken = useAppStore((s) => s.setToken);
  const profile = useAppStore((s) => s.profile);

  const handleNotificationTap = useCallback((data: Record<string, any>) => {
    if (!navigationRef.isReady()) return;
    if (data?.orderId) {
      setActiveOrder(data.orderId);
      navigationRef.navigate('order', { id: data.orderId });
    } else if (data?.restaurantSlug) {
      (navigationRef as any).navigate('restaurant', { slug: data.restaurantSlug });
    } else if (data?.screen) {
      (navigationRef as any).navigate(data.screen);
    }
  }, [setActiveOrder]);

  const { requestPermission: requestPushPermission, initialNotificationData } = usePushNotifications(token, handleNotificationTap);

  // Wire the axios interceptor's onUnauthorized callback to wipe local auth.
  // Backend returns 401 when a soft-deleted user (admin removed them) tries
  // to authenticate, or when the JWT is otherwise dead. This bounces the
  // user back to the auth screen instead of leaving them in a "logged in
  // but every API call fails" state.
  useEffect(() => {
    const setProfile = useAppStore.getState().setProfile;
    setUnauthorizedHandler(() => {
      setToken(null);
      setProfile(null);
      setActiveOrder(null);
    });
    return () => setUnauthorizedHandler(() => undefined);
  }, [setToken, setActiveOrder]);

  // Keep the iOS Live Activity / Dynamic Island in sync with whatever the
  // backend reports, regardless of which screen the user is currently on.
  // Previously this lived inside LiveOrderBanner, which is hidden on the
  // order detail screen — meaning statuses froze until the user backed out.
  useOrderActivitySync(activeOrderId);

  // When app is launched from a killed state by tapping a notification,
  // wait for NavigationContainer to be ready before navigating
  const handleNavReady = useCallback(() => {
    if (initialNotificationData) handleNotificationTap(initialNotificationData);
  }, [initialNotificationData, handleNotificationTap]);

  useEffect(() => {
    const missingKeys = validateEnv();
    if (missingKeys.length) {
      Alert.alert(
        "Konfigurationsfel",
        `Appen saknar nödvändiga miljövariabler:\n\n${missingKeys.join("\n")}\n\nKontakta support.`
      );
    }
  }, []);

  useEffect(() => {
    hydrate().catch(() => {});
    const timer = setTimeout(() => {
      setSplashFinished(true);
    }, 1500); // Tight hold — wordmark fade lands ~640 ms in, then a beat of breath
    return () => clearTimeout(timer);
  }, [hydrate]);

  const pushRoute = useCallback((next: AppRoute) => {
    if (navigationRef.isReady()) {
      navigationRef.navigate(next.name, next);
    }
  }, []);

  const replaceRoute = useCallback((next: AppRoute) => {
    if (navigationRef.isReady()) {
      navigationRef.dispatch(StackActions.replace(next.name, next));
    }
  }, []);

  const goBack = useCallback(() => {
    if (navigationRef.isReady() && navigationRef.canGoBack()) {
      navigationRef.goBack();
    }
  }, []);

  const openRoot = useCallback(
    (name: "home" | "search" | "cart" | "profile" | "discover" | "orders") => {
      if (navigationRef.isReady()) {
        const currentName = navigationRef.getCurrentRoute()?.name || "home";

        if (currentName === name) {
          return;
        }

        // StackActions.replace prevents the iOS back-swipe revealing a previous tab
        // while still keeping other mounted screens alive (unlike CommonActions.reset
        // which unmounts everything and wipes in-memory state like scroll position).
        navigationRef.dispatch(StackActions.replace(name, { _tabSwitch: true }));
      }
    },
    []
  );

  const setOnboardingComplete = useAppStore((s) => s.setOnboardingComplete);
  const setProfile = useAppStore((s) => s.setProfile);

  useEffect(() => {
    const checkSession = async () => {
      if (
        Platform.OS === "web" &&
        typeof window !== "undefined" &&
        window.location?.hash?.includes("access_token=")
      ) {
        const hash = window.location.hash.substring(1);
        const params = new URLSearchParams(hash);
        const accessToken = params.get("access_token");
        const refreshToken = params.get("refresh_token");

        if (accessToken && refreshToken) {
          try {
            const {
              data: { session },
            } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });
            if (session) {
              setToken(session.access_token);
              setOnboardingComplete(true);
              try {
                const profileRes = await api.get("/api/profile", {
                  headers: { Authorization: `Bearer ${session.access_token}` },
                });
                setProfile(profileRes.data);
              } catch {}
              openRoot("home");
              window.history.replaceState(null, "", window.location.pathname);
              return;
            }
          } catch (e) {
            console.error("Manual session set failed:", e);
          }
        }
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.access_token) {
        setToken(session.access_token);
        setOnboardingComplete(true);
        // Re-fetch profile on every cold start so the phone-gate flag (and
        // any name/avatar updates from the previous session) is fresh.
        try {
          const profileRes = await api.get("/api/profile", {
            headers: { Authorization: `Bearer ${session.access_token}` },
          });
          setProfile(profileRes.data);
        } catch {}
      }
    };

    checkSession();

    const {
      data: { subscription: authListener },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.access_token) {
        setToken(session.access_token);
        setOnboardingComplete(true);
        if (event === "SIGNED_IN") {
          setCurrentRouteName("home");
          try {
            const profileRes = await api.get("/api/profile", {
              headers: { Authorization: `Bearer ${session.access_token}` },
            });
            setProfile(profileRes.data);
          } catch {}
          openRoot("home");
        }
      } else if (event === "SIGNED_OUT") {
        setToken(null);
        // onboardingComplete stays true — notifications/location only asked once
      }
    });

    // Push registration is handled by usePushNotifications hook

    const handleUrl = async (url: string) => {
      // ── Reset-password deep link ──────────────────────────────────────────
      // Mejlets mobil-länk är `foodgo://reset-password?token=<hex>`. Vi
      // parsar tokenen själva — det är en separat URL-prefix från
      // foodgo://auth/* så isAuthRedirectUrl() skulle annars filtrera bort
      // den. Vi navigerar bara till ResetPasswordScreen; själva POST:en
      // sker när användaren skickar formuläret.
      if (url.startsWith("foodgo://reset-password")) {
        const queryIndex = url.indexOf("?");
        let token = "";
        if (queryIndex >= 0) {
          const params = new URLSearchParams(url.slice(queryIndex + 1));
          token = params.get("token") || "";
        }
        if (token) {
          pushRoute({ name: "reset-password", token } as any);
        }
        return;
      }

      // ── Verify-email deep link ───────────────────────────────────────────
      // Mejlets mobil-länk är `foodgo://verify-email?token=<hex>`. Sedan
      // email-verification-gaten infördes är det HÄR den första inloggningen
      // sker för email-registrerade användare. /verify-email returnerar nu
      // { ok, token, user } — vi sätter tokenen direkt i appens auth-store,
      // hämtar profilen och flippar onboarding-flaggan så root-tree:t
      // renderar in i appen.
      //
      // Fallback: om verify-anropet faller (ogiltig token, redan-använd, etc.)
      // sväljer vi felet tyst — onboarding-skärmens polling-loop kommer ändå
      // att hitta verified=true så länge användaren är aktiv i appen.
      if (url.startsWith("foodgo://verify-email")) {
        const queryIndex = url.indexOf("?");
        let token = "";
        if (queryIndex >= 0) {
          const params = new URLSearchParams(url.slice(queryIndex + 1));
          token = params.get("token") || "";
        }
        if (token) {
          try {
            const { data } = await api.post("/api/account/verify-email", { token });
            const jwt = data?.token;
            if (jwt) {
              setToken(jwt);
              setOnboardingComplete(true);
              try {
                const profileRes = await api.get("/api/profile", {
                  headers: { Authorization: `Bearer ${jwt}` },
                });
                setProfile(profileRes.data);
              } catch {
                // Profil-fetch är best-effort. /verify-email skickar
                // tillbaka en basal user-payload som fallback.
                if (data?.user) setProfile(data.user);
              }
              openRoot("home");
            }
          } catch {
            // Polling-loopen ger sin egen felhantering i UI:t.
          }
        }
        return;
      }

      if (!isAuthRedirectUrl(url)) return;

      const {
        code,
        token: appToken,
        accessToken,
        refreshToken,
        error: authError,
      } = parseAuthRedirect(url);

      if (authError) {
        Alert.alert("Inloggning misslyckades", authError);
        return;
      }

      if (accessToken && refreshToken) {
        try {
          const { data, error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (!error && data.session?.access_token) {
            setToken(data.session.access_token);
            setOnboardingComplete(true);
            try {
              const profileRes = await api.get("/api/profile", {
                headers: { Authorization: `Bearer ${data.session.access_token}` },
              });
              setProfile(profileRes.data);
            } catch {}
            openRoot("home");
          }
        } catch (e) {
          console.error("Session restore failed:", e);
        }
        return;
      }

      if (code) {
        try {
          const { data, error } = await supabase.auth.exchangeCodeForSession(code);
          if (!error && data.session?.access_token) {
            setToken(data.session.access_token);
            setOnboardingComplete(true);
            try {
              const profileRes = await api.get("/api/profile", {
                headers: { Authorization: `Bearer ${data.session.access_token}` },
              });
              setProfile(profileRes.data);
            } catch {}
            openRoot("home");
          }
        } catch (e) {
          console.error("Code exchange failed:", e);
        }
        return;
      }

      const redirectedToken = appToken ?? accessToken;
      if (redirectedToken) {
        setToken(redirectedToken);
        setOnboardingComplete(true);
        try {
          const profileRes = await api.get("/api/profile", {
            headers: { Authorization: `Bearer ${redirectedToken}` },
          });
          setProfile(profileRes.data);
        } catch {}
        openRoot("home");
      }
    };

    const linkSub = Linking.addEventListener("url", ({ url }) => {
      handleUrl(url).catch(() => {});
    });

    return () => {
      authListener.unsubscribe();
      linkSub.remove();
    };
  }, [openRoot, pushRoute, setOnboardingComplete, setProfile, setToken]);

  if (!hydrated || !splashFinished) {
    return <SplashLoader />;
  }

  if (!token && !onboardingComplete) {
    return (
      <OnboardingScreen
        onComplete={() => {}}
        requestPushPermission={requestPushPermission}
        skipPermissions={onboardingComplete}
      />
    );
  }

  // Hard gate per the strict Apple Sign-In persistence spec:
  //   - profileComplete=false  → "Complete Profile" name screen.
  //   - needsPhone=true        → phone verification screen.
  // Same screen handles both flags (PhoneGateScreen has nameOnlyMode for
  // the case where phone is already verified). Profile complete users
  // pass through to the app and NEVER see the gate again.
  const profileObj = profile as any;
  const needsCompleteProfile = profileObj && profileObj.profileComplete === false;
  if (token && (profileObj?.needsPhone || needsCompleteProfile)) {
    return <PhoneGateScreen />;
  }

  const tabValue =
    currentRouteName === "restaurant" ||
    currentRouteName === "order" ||
    currentRouteName === "register" ||
    currentRouteName === "email-login" ||
    currentRouteName === "forgot-password" ||
    currentRouteName === "reset-password"
      ? "home"
      : currentRouteName;

  return (
    <View style={styles.safe}>
      <ExpoStatusBar style={mode === "dark" ? "light" : "dark"} />
      <StatusBar barStyle={mode === "dark" ? "light-content" : "dark-content"} />
      <LinearGradient
        colors={[palette.panel, palette.bg, palette.panelMuted]}
        locations={[0, 0.22, 1]}
        style={StyleSheet.absoluteFill}
      />
      <SafeAreaView edges={["left", "right"]} style={{ flex: 1, backgroundColor: "transparent" }}>
        <View style={styles.appBg}>
          <NetworkBanner />
          <NavigationContainer
            ref={navigationRef}
            onReady={handleNavReady}
            onStateChange={() => {
              const currentRoute = navigationRef.getCurrentRoute();
              if (currentRoute) {
                setCurrentRouteName(currentRoute.name);
              }
            }}
          >
            <Stack.Navigator
              screenOptions={{
                headerShown: false,
                animation: "slide_from_right",
                animationDuration: 280,
                contentStyle: { backgroundColor: palette.bg }
              }}
            >
              <Stack.Screen
                name="home"
                options={({ route }: any) => ({
                  animation: "fade",
                  animationDuration: 180,
                })}
              >
                {() => (
                  <HomeScreen
                    openRestaurant={(slug) => pushRoute({ name: "restaurant", slug } as any)}
                    openTab={(tab) => {
                      if (tab === "discover") pushRoute({ name: "discover" });
                      else openRoot(tab as any);
                    }}
                    onSearchPress={() => pushRoute({ name: "discover", fromSearch: true } as any)}
                    pushRoute={pushRoute}
                  />
                )}
              </Stack.Screen>

              <Stack.Screen
                name="discover"
                options={({ route }: any) => ({
                  animation: "fade",
                  animationDuration: 180,
                })}
              >
                {(props: any) => (
                  <DiscoverScreen
                    openRestaurant={(slug) => pushRoute({ name: "restaurant", slug } as any)}
                    goBack={goBack}
                    autoFocus={!!props.route.params?.fromSearch}
                    initialCuisine={props.route.params?.cuisine}
                  />
                )}
              </Stack.Screen>

              <Stack.Screen name="discover-filtered">
                {(props: any) => (
                  <DiscoverScreen
                    openRestaurant={(slug) => pushRoute({ name: "restaurant", slug } as any)}
                    goBack={goBack}
                    initialFilteredIds={props.route.params?.restaurantIds}
                    filteredTitle={props.route.params?.dealTitle}
                  />
                )}
              </Stack.Screen>

              <Stack.Screen
                name="search"
                options={{
                  animation: "fade",
                  animationDuration: 180,
                }}
              >
                {() => <SearchScreen openRestaurant={(slug) => pushRoute({ name: "restaurant", slug } as any)} />}
              </Stack.Screen>

              <Stack.Screen name="restaurant">
                {(props: any) => (
                  <RestaurantScreen
                    slug={props.route.params?.slug}
                    goBack={goBack}
                    openCart={() => pushRoute({ name: "cart" })}
                  />
                )}
              </Stack.Screen>

              <Stack.Screen
                name="cart"
                options={{
                  animation: "fade",
                  animationDuration: 180,
                }}
              >
                {() => (
                  <CartScreen
                    openProfile={() => pushRoute({ name: "profile" })}
                    openOrder={(id) => {
                      setActiveOrder(id);
                      replaceRoute({ name: "order", id } as any);
                    }}
                    openHome={() => openRoot("home")}
                  />
                )}
              </Stack.Screen>

              <Stack.Screen
                name="orders"
                options={{
                  animation: "fade",
                  animationDuration: 180,
                }}
              >
                {() => (
                  <OrdersListScreen
                    openOrder={(id, phone) => pushRoute({ name: "order", id, phone } as any)}
                    openHome={() => openRoot("home")}
                  />
                )}
              </Stack.Screen>

              <Stack.Screen
                name="profile"
                options={{
                  animation: "fade",
                  animationDuration: 180,
                }}
              >
                {() => (
                  <ProfileScreen
                    openRegister={(initialPhone) => pushRoute({ name: "register", initialPhone } as any)}
                    openForgotPassword={() => pushRoute({ name: "forgot-password" } as any)}
                    openOrder={(id) => pushRoute({ name: "order", id } as any)}
                    openCart={() => openRoot("cart")}
                    openDeal={(id) => pushRoute({ name: "deal", id } as any)}
                  />
                )}
              </Stack.Screen>

              <Stack.Screen name="register">
                {(props: any) => (
                  <RegisterScreen
                    initialPhone={props.route.params?.initialPhone}
                    goBack={goBack}
                    onRegistered={() => {
                      setCurrentRouteName("profile");
                      replaceRoute({ name: "profile" });
                    }}
                  />
                )}
              </Stack.Screen>

              <Stack.Screen name="email-login">
                {() => (
                  <EmailLoginScreen
                    goBack={goBack}
                    openRegister={() => replaceRoute({ name: "register" } as any)}
                    openForgotPassword={() =>
                      pushRoute({ name: "forgot-password" } as any)
                    }
                    onLoggedIn={() => {
                      setCurrentRouteName("profile");
                      replaceRoute({ name: "profile" });
                    }}
                  />
                )}
              </Stack.Screen>

              <Stack.Screen name="forgot-password">
                {() => <ForgotPasswordScreen goBack={goBack} />}
              </Stack.Screen>

              <Stack.Screen name="reset-password">
                {(props: any) => (
                  <ResetPasswordScreen
                    token={props.route.params?.token || ""}
                    goBack={goBack}
                    onResetComplete={() => {
                      // Återställning klar — ta användaren till email-login
                      // så de kan logga in med nya lösenordet. Vi auto-loggar
                      // inte in eftersom backend bara håller hash:en.
                      setCurrentRouteName("email-login");
                      replaceRoute({ name: "email-login" } as any);
                    }}
                  />
                )}
              </Stack.Screen>

              <Stack.Screen name="order">
                {(props: any) => (
                  <OrderScreen
                    id={props.route.params?.id}
                    phone={props.route.params?.phone}
                    goBack={() => {
                      if (navigationRef.isReady() && navigationRef.canGoBack()) goBack();
                      else openRoot("home");
                    }}
                  />
                )}
              </Stack.Screen>

              <Stack.Screen name="deal">
                {(props: any) => (
                  <DealScreen
                    id={props.route.params?.id}
                    goBack={() => {
                      if (navigationRef.isReady() && navigationRef.canGoBack()) goBack();
                      else openRoot("home");
                    }}
                    openRestaurant={(slug) => pushRoute({ name: "restaurant", slug } as any)}
                  />
                )}
              </Stack.Screen>
            </Stack.Navigator>
          </NavigationContainer>

          {activeOrderId && (
            <LiveOrderBanner
              id={activeOrderId}
              openOrder={(id) => pushRoute({ name: "order", id } as any)}
              onDismiss={() => setActiveOrder(null)}
            />
          )}
          {!["restaurant", "order", "register", "email-login", "forgot-password", "reset-password", "deal"].includes(currentRouteName) && (
            <BottomTabs active={tabValue as any} onChange={openRoot} />
          )}
        </View>
      </SafeAreaView>
      {/* Claim-popup för broadcast-deals — visas på home (skickas
          currentRouteName så popupen pausar på cart/order/restaurant
          tills användaren kommer tillbaka). */}
      <ClaimDealPopup currentRouteName={currentRouteName} />
    </View>
  );
}

// ─── Root ──────────────────────────────────────────────────────────────────────
function App() {
  const { palette } = useTheme();
  const [appKey, setAppKey] = React.useState(0);
  const [i18nReady, setI18nReady] = React.useState(false);
  const [i18nInstance, setI18nInstance] = React.useState<any>(null);

  const [fontsLoaded] = useFonts({
    Outfit_400Regular,
    Outfit_500Medium,
    Outfit_600SemiBold,
    Outfit_700Bold,
    Outfit_800ExtraBold,
    Outfit_900Black,
  });

  React.useEffect(() => {
    initI18n().then((instance) => {
      setI18nInstance(instance);
      setI18nReady(true);
    });
  }, []);

  // Flip the brand-font flag once expo-font finishes registering the Outfit
  // weights, so `fontFamily.brand` (from src/theme/typography) starts
  // resolving to 'Outfit' for any consumer that uses the getter.
  React.useEffect(() => {
    if (fontsLoaded) setBrandFontLoaded(true);
  }, [fontsLoaded]);

  // Apple App Tracking Transparency (ATT) — krävs av App Store när IDFA
  // potentiellt används (Sentry m.fl.). Endast iOS, fire-and-forget så det
  // inte blockerar render. Apple kräver att prompten visas EFTER att UI är
  // synligt — vi väntar tills fonter + i18n är klara så ATT-dialogen kommer
  // ovanpå appen istället för splash.
  // ATT temporärt avstängt — kräver att NSUserTrackingUsageDescription
  // FAKTISKT är i Info.plist. App.json-ändringen tas in först efter pod
  // install + Xcode rebuild. Kan krascha release-builds om plist saknar
  // nyckeln. Aktivera igen när Info.plist är synkad.
  React.useEffect(() => {
    if (Platform.OS !== "ios") return;
    if (!fontsLoaded || !i18nReady) return;
    void requestTracking; // silencing unused-import
    // const t = setTimeout(() => {
    //   requestTracking().catch(() => {});
    // }, 600);
    // return () => clearTimeout(t);
  }, [fontsLoaded, i18nReady]);

  const restartApp = React.useCallback(() => {
    setAppKey((k) => k + 1);
  }, []);

  if (!i18nReady || !i18nInstance || !fontsLoaded) {
    return (
      <View style={{ flex: 1, backgroundColor: palette.bg }}>
        <SplashLoader />
      </View>
    );
  }

  return (
    <RestartContext.Provider value={restartApp}>
      <ErrorBoundary onReset={restartApp}>
        <I18nextProvider i18n={i18nInstance}>
          <SafeAreaProvider>
            <AppStripeProvider publishableKey={STRIPE_PUBLISHABLE_KEY} urlScheme="foodgo">
              <ThemedRoot appKey={appKey} />
            </AppStripeProvider>
          </SafeAreaProvider>
        </I18nextProvider>
      </ErrorBoundary>
    </RestartContext.Provider>
  );
}

// Subscribes ThemeProvider's preference to the persisted store. Reads the
// user's chosen theme (light/dark/system) from useAppStore and re-syncs the
// provider whenever it changes (settings toggle, app launch after hydrate).
function ThemedRoot({ appKey }: { appKey: number }) {
  const themePreference = useAppStore((s) => s.themePreference);
  return (
    <ThemeProvider initialMode={themePreference || "light"}>
      <ThemeBridge preference={themePreference || "light"} />
      <AppContent key={appKey} />
    </ThemeProvider>
  );
}

function ThemeBridge({ preference }: { preference: "light" | "dark" | "system" }) {
  const { setMode, preference: providerPref } = useThemeMode();
  React.useEffect(() => {
    if (preference !== providerPref) setMode(preference);
  }, [preference, providerPref, setMode]);
  return null;
}

export default sentryWrap(App);
