import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { AddressCollectionMode, CollectionMode, isPlatformPaySupported } from "@stripe/stripe-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppStore } from "../store/useAppStore";
import { api } from "../lib/api";
import { useAppPaymentSheet } from "../lib/stripeProvider";
import { placesAutocomplete, placesResolveCoords } from "../lib/places";
import { captureError } from "../lib/sentry";
import { STRIPE_PUBLISHABLE_KEY } from "../lib/api";
import * as Crypto from "expo-crypto";
import { getBottomTabsContentPadding, getScreenTopPadding } from "../constants/layout";
import {
  type QuickAddress,
  findQuickAddressByText,
  formatQuickAddress,
  readQuickAddresses,
  rememberQuickAddress,
  writeQuickAddresses,
} from "../lib/quickAddresses";
import { saveGuestOrder } from "../lib/guestOrders";
import ScalePressable from "../components/ScalePressable";
import { useSharedStyles, useTheme } from "../theme";
import { useTranslation } from 'react-i18next';
import { useArabic } from '../hooks/useArabic';
import { startOrderActivity } from '../lib/liveActivities';
import { maybeShowFrequentUpdatesPrompt } from '../lib/permissionPrompts';

import { CartItem, DeliveryCheck, City } from "../types";


import AddressAutocomplete from "../components/AddressAutocomplete";
import ProductModal from "../components/ProductModal";
import { Header, ScreenWrap, PrimaryButton } from "../components/ui";
import { CartScreenSkeleton } from "../components/SkeletonLoader";

function CartEmptyState({ onExplore }: { onExplore: () => void }) {
  const { t } = useTranslation();
  const { palette } = useTheme();
  const floatAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Fade in
    Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }).start();

    // Gentle float loop
    Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim, { toValue: -12, duration: 1400, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(floatAnim, { toValue: 0, duration: 1400, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    ).start();

    // Subtle shadow pulse (scale of shadow placeholder)
    Animated.loop(
      Animated.sequence([
        Animated.timing(scaleAnim, { toValue: 0.75, duration: 1400, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(scaleAnim, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    ).start();
  }, []);

  return (
    <Animated.View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 40, marginTop: 80, opacity: fadeAnim }}>
      <Animated.View style={{ transform: [{ translateY: floatAnim }], alignItems: "center" }}>
        {/* Icon with gold ring */}
        <View style={{
          width: 100, height: 100, borderRadius: 30,
          backgroundColor: "rgba(231,178,75,0.08)",
          borderWidth: 1.5, borderColor: "rgba(231,178,75,0.2)",
          alignItems: "center", justifyContent: "center",
          marginBottom: 4,
        }}>
          <Ionicons name="bag-outline" size={46} color={palette.gold} />
        </View>
      </Animated.View>

      {/* Shadow that shrinks as icon rises */}
      <Animated.View style={{
        width: 48, height: 6, borderRadius: 3,
        backgroundColor: "rgba(125,97,38,0.12)",
        marginBottom: 28,
        transform: [{ scaleX: scaleAnim }],
      }} />

      <Text style={{ color: palette.text, fontSize: 22, fontWeight: "900", marginBottom: 8, letterSpacing: -0.3 }}>
        {t('cart.empty.title')}
      </Text>
      <Text style={{ color: palette.muted, fontSize: 13, fontWeight: "600", textAlign: "center", marginBottom: 32, lineHeight: 20 }}>
        {t('cart.empty.description')}
      </Text>
      <PrimaryButton label={t('cart.empty.cta')} onPress={onExplore} />
    </Animated.View>
  );
}

type SavedAddress = {
  id: string;
  label: string;
  street: string;
  zip: string;
  city: string;
  note?: string;
  isDefault?: boolean;
  latitude?: number;
  longitude?: number;
};

const SCHEDULE_MINUTES_AHEAD = 45;
const SCHEDULE_INTERVAL_MINUTES = 5;
const QUICK_SCHEDULE_OFFSETS = [45, 60, 90, 120, 180];

function roundDateUpToInterval(date: Date, intervalMinutes = SCHEDULE_INTERVAL_MINUTES) {
  const rounded = new Date(date);
  rounded.setSeconds(0, 0);
  const remainder = rounded.getMinutes() % intervalMinutes;
  if (remainder !== 0) {
    rounded.setMinutes(rounded.getMinutes() + (intervalMinutes - remainder));
  }
  return rounded;
}

function getMinimumScheduledTime(reference = new Date()) {
  return roundDateUpToInterval(new Date(reference.getTime() + SCHEDULE_MINUTES_AHEAD * 60 * 1000));
}

function getLastScheduledTimeToday(reference = new Date()) {
  const latest = new Date(reference);
  latest.setHours(23, 55, 0, 0);
  return latest;
}

function clampScheduledTimeToToday(candidate: Date, reference = new Date()) {
  const rounded = roundDateUpToInterval(candidate);
  const minTime = getMinimumScheduledTime(reference);
  const maxTime = getLastScheduledTimeToday(reference);

  if (maxTime.getTime() < minTime.getTime()) return null;
  if (rounded.getTime() < minTime.getTime()) return minTime;
  if (rounded.getTime() > maxTime.getTime()) return maxTime;
  return rounded;
}

function getQuickScheduledTimes(reference = new Date()) {
  const latest = getLastScheduledTimeToday(reference).getTime();
  const seen = new Set<number>();

  return QUICK_SCHEDULE_OFFSETS
    .map((offset) => ({
      label:
        offset === 45
          ? "45 min"
          : offset === 60
            ? "1 timme"
            : offset === 90
              ? "1.5 timmar"
              : offset === 120
                ? "2 timmar"
                : "3 timmar",
      time: roundDateUpToInterval(new Date(reference.getTime() + offset * 60 * 1000)),
    }))
    .filter(({ time }) => {
      const key = time.getTime();
      if (key > latest || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export default function CartScreen({
  openHome,
  openProfile,
  openOrder,
}: {
  openHome: () => void;
  openProfile: () => void;
  openOrder: (id: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { ls } = useArabic();
  const { palette } = useTheme();
  const styles = useSharedStyles();
  const screenTopPadding = getScreenTopPadding(insets.top);
  const screenBottomPadding = getBottomTabsContentPadding(insets.bottom);

  const items = useAppStore((s) => s.items);
  const removeItem = useAppStore((s) => s.removeItem);
  const updateQuantity = useAppStore((s) => s.updateQuantity);
  const updateItem = useAppStore((s) => s.updateItem);
  const clearCart = useAppStore((s) => s.clearCart);
  const [editing, setEditing] = useState<{ product: any; item: CartItem } | null>(null);

  const handleEditCartItem = useCallback(async (item: CartItem) => {
    try {
      const res = await api.get(`/api/menu/products/${item.productId}`);
      setEditing({ product: res.data, item });
    } catch {}
  }, []);
  const token = useAppStore((s) => s.token);
  const profile = useAppStore((s) => s.profile);
  const setProfile = useAppStore((s) => s.setProfile);
  const pendingPromoCode = useAppStore((s) => s.pendingPromoCode);
  const setPendingPromoCode = useAppStore((s) => s.setPendingPromoCode);
  const currentRestaurantId = useAppStore((s) => s.restaurantId);
  const currentRestaurantSlug = useAppStore((s) => s.restaurantSlug);
  const coords = useAppStore((s) => s.coords);
  const orderType = useAppStore((s) => s.orderType);
  const setOrderType = useAppStore((s) => s.setOrderType);
  const setAddress = useAppStore((s) => s.setAddress);
  const deliveryOverrides = useAppStore((s) => s.deliveryOverrides);
  const storeAddress = useAppStore((s) => s.address);
  const hydrated = useAppStore((s) => s.hydrated);

  const [pageLoading, setPageLoading] = useState(true);
  const [cartRestaurant, setCartRestaurant] = useState<{ name: string; slug: string } | null>(null);
  const [restaurantSettings, setRestaurantSettings] = useState({
    isOpen: true,
    deliveryFee: 49,
    minOrderAmount: 150,
    estimatedDeliveryTime: 35,
  });

  const { initPaymentSheet, presentPaymentSheet } = useAppPaymentSheet();

  // Sync delivery fees from global overrides
  useEffect(() => {
    if (currentRestaurantId && deliveryOverrides[currentRestaurantId] && orderType === "DELIVERY") {
      const ovr = deliveryOverrides[currentRestaurantId];
      if (restaurantSettings.deliveryFee !== ovr.deliveryFee || restaurantSettings.minOrderAmount !== ovr.minOrderAmount) {
        setRestaurantSettings((prev) => ({
          ...prev,
          deliveryFee: ovr.deliveryFee,
          minOrderAmount: ovr.minOrderAmount,
        }));
      }
    }
  }, [currentRestaurantId, restaurantSettings.deliveryFee, restaurantSettings.minOrderAmount, deliveryOverrides, orderType]);

  const [personalDeals, setPersonalDeals] = useState<any[]>([]);
  const [savedAddresses, setSavedAddresses] = useState<SavedAddress[]>([]);
  const [quickAddresses, setQuickAddresses] = useState<QuickAddress[]>([]);
  const [promoCode, setPromoCode] = useState("");
  const [selectedPersonalDeal, setSelectedPersonalDeal] = useState<any | null>(null);
  const [deliveryCheck, setDeliveryCheck] = useState<DeliveryCheck | null>(null);
  const [zoneCheckStatus, setZoneCheckStatus] = useState<"ok" | "error" | "checking" | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [pickupCities, setPickupCities] = useState<City[]>([]);
  const [formData, setFormData] = useState({
    customerName: "",
    customerPhone: "",
    deliveryStreet: "",
    deliveryZip: "",
    deliveryCity: "",
    deliveryInstructions: "",
    note: "",
  });
  const [scheduledFor, setScheduledFor] = useState<Date | null>(null);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [autocompleteValue, setAutocompleteValue] = useState("");
  const [tipAmount, setTipAmount] = useState<number>(0);

  const scheduleWindow = useMemo(() => {
    const minTime = getMinimumScheduledTime();
    const maxTime = getLastScheduledTimeToday();

    return {
      minTime,
      maxTime,
      available: maxTime.getTime() >= minTime.getTime(),
    };
  }, [showTimePicker]);

  const quickScheduleTimes = useMemo(() => getQuickScheduledTimes(), [showTimePicker]);

  const availableHours = useMemo(() => {
    if (!scheduleWindow.available) return [];

    const hours: number[] = [];
    for (let hour = scheduleWindow.minTime.getHours(); hour <= scheduleWindow.maxTime.getHours(); hour += 1) {
      hours.push(hour);
    }
    return hours;
  }, [scheduleWindow]);

  const selectedScheduleHour = scheduledFor?.getHours() ?? scheduleWindow.minTime.getHours();

  const getScheduleValidationMessage = useCallback((value: Date | null) => {
    if (!value) return null;
    const minTime = getMinimumScheduledTime();
    const maxTime = getLastScheduledTimeToday();

    if (maxTime.getTime() < minTime.getTime()) {
      return t('cart.schedule.noSlots');
    }
    if (value.getTime() < minTime.getTime()) {
      return t('cart.schedule.tooSoon', { min: SCHEDULE_MINUTES_AHEAD });
    }
    if (value.getTime() > maxTime.getTime()) {
      return t('cart.schedule.onlyTodayError');
    }
    return null;
  }, []);

  const handleOpenSchedulePicker = useCallback(() => {
    const nextValue = clampScheduledTimeToToday(scheduledFor || getMinimumScheduledTime());
    if (!nextValue) {
      Alert.alert(t('cart.schedule.noMore'), t('cart.schedule.noSlots'));
      return;
    }

    setScheduledFor(nextValue);
    setShowTimePicker(true);
  }, [scheduledFor]);

  const updateScheduledSelection = useCallback((updater: (current: Date) => Date) => {
    setScheduledFor((current) => {
      const base = current ? new Date(current) : getMinimumScheduledTime();
      const next = clampScheduledTimeToToday(updater(base));
      return next || current || getMinimumScheduledTime();
    });
  }, []);

  const loadQuickAddresses = useCallback(async () => {
    setQuickAddresses(await readQuickAddresses());
  }, []);

  useEffect(() => {
    void loadQuickAddresses();
  }, [loadQuickAddresses]);

  // Auto-fill address when store is hydrated or address changes
  useEffect(() => {
    if (!hydrated) return;
    if (!storeAddress) return;

    setAutocompleteValue(storeAddress);

    const parts = storeAddress.split(",");
    const street = parts[0]?.trim() || "";
    const zipMatch = storeAddress.match(/\b(\d{3})\s?(\d{2})\b/);
    const zip = zipMatch ? `${zipMatch[1]}${zipMatch[2]}` : "";
    const cityMatch = storeAddress.match(/\d{3}\s?\d{2}\s+([^,]+)/);
    const city = cityMatch ? cityMatch[1].trim() : (parts[1]?.trim() || "");

    setFormData((prev) => ({
      ...prev,
      deliveryStreet: street || prev.deliveryStreet,
      deliveryZip: zip || prev.deliveryZip,
      deliveryCity: city || prev.deliveryCity,
    }));

    if (coords && storeAddress) {
      void rememberQuickAddress({
        street: storeAddress,
        city,
        zip,
        latitude: coords.lat,
        longitude: coords.lng,
      }).then(setQuickAddresses);
      return;
    }

    if (!coords && storeAddress) {
      (async () => {
        try {
          const cached = await findQuickAddressByText(storeAddress);
          if (cached?.latitude != null && cached?.longitude != null) {
            setAddress(storeAddress, { lat: cached.latitude, lng: cached.longitude });
            setQuickAddresses(await rememberQuickAddress(cached));
            return;
          }

          // Backend-proxied: top-1 autocomplete result, then resolve coords.
          const items = await placesAutocomplete(storeAddress);
          const top = items[0];
          const coords = top ? await placesResolveCoords(top) : null;
          if (coords) {
            setAddress(storeAddress, coords);
            setQuickAddresses(
              await rememberQuickAddress({
                street: storeAddress,
                city,
                zip,
                latitude: coords.lat,
                longitude: coords.lng,
              }),
            );
          }
        } catch {}
      })();
    }
  }, [hydrated, storeAddress, coords, setAddress]);

  const subtotal = useMemo(
    () =>
      items.reduce((sum, item) => {
        const extras = item.extras.reduce((extraSum: number, extra: any) => extraSum + extra.price, 0);
        return sum + (item.price + extras) * item.quantity;
      }, 0),
    [items]
  );

  const personalDiscount = useMemo(() => {
    if (!selectedPersonalDeal) return 0;
    const campaign = selectedPersonalDeal.campaign || {};
    if (subtotal < (campaign.minOrder || 0)) return 0;
    if (campaign.discountType === "PERCENTAGE") return (subtotal * campaign.discountValue) / 100;
    return campaign.discountValue || 0;
  }, [selectedPersonalDeal, subtotal]);

  const ovr = currentRestaurantId ? deliveryOverrides[currentRestaurantId] : undefined;
  const deliveryFee =
    orderType === "DELIVERY"
      ? (deliveryCheck?.deliveryFee ?? ovr?.deliveryFee ?? restaurantSettings.deliveryFee)
      : 0;
  const isTestCode = __DEV__ && (selectedPersonalDeal?.code === "test" || selectedPersonalDeal?.code === "testa");
  const total = isTestCode ? 0 : Math.max(0, subtotal + deliveryFee - personalDiscount + tipAmount);

  // Initial data fetch
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [settingsRes, profileRes, dealsRes, restaurantRes, citiesRes] = await Promise.all([
          api.get("/api/settings").catch(() => ({ data: {} })),
          token
            ? api.get("/api/profile", { headers: { Authorization: `Bearer ${token}` } }).catch(() => ({ data: null }))
            : Promise.resolve({ data: null }),
          token
            ? api.get("/api/profile/deals", { headers: { Authorization: `Bearer ${token}` } }).catch(() => ({ data: [] }))
            : Promise.resolve({ data: [] }),
          currentRestaurantId
            ? api.get(`/api/restaurants/${currentRestaurantId}`).catch(() => ({ data: null }))
            : Promise.resolve({ data: null }),
          api.get("/api/cities").catch(() => ({ data: [] })),
        ]);

        if (!active) return;

        const { deliveryFee: _df, minOrderAmount: _mo, ...nonFeeSettings } = settingsRes.data || {};
        setRestaurantSettings((current) => {
          const zoneAlreadyChecked = zoneCheckStatus === "ok";
          return {
            ...current,
            ...nonFeeSettings,
            deliveryFee: zoneAlreadyChecked ? current.deliveryFee : (restaurantRes.data?.deliveryFee ?? current.deliveryFee),
            minOrderAmount: zoneAlreadyChecked ? current.minOrderAmount : (restaurantRes.data?.minOrderAmount ?? current.minOrderAmount),
            isOpen: restaurantRes.data?.isOpen ?? settingsRes.data?.isOpen ?? current.isOpen,
          };
        });

        if (restaurantRes.data?.name) {
          setCartRestaurant({ name: restaurantRes.data.name, slug: restaurantRes.data.slug });
        }

        setProfile(profileRes.data || null);
        setPersonalDeals(dealsRes.data || []);
        setPickupCities(citiesRes.data || []);

        // Detect guest profile (auto-generated "Gäst XXXX" name or empty id) and
        // skip auto-fill of name/phone so they explicitly enter their details.
        const profName = profileRes.data?.name || "";
        const isGuestProfile =
          !profileRes.data?.id || /^Gäst\s+\d{2,}$/i.test(profName.trim());
        setFormData((current) => ({
          ...current,
          customerName: current.customerName || (isGuestProfile ? "" : profName),
          customerPhone: current.customerPhone || (isGuestProfile ? "" : (profileRes.data?.phone || "")),
          deliveryStreet: current.deliveryStreet || profileRes.data?.address || "",
          deliveryZip: current.deliveryZip || profileRes.data?.zip || "",
        }));

        // Main data is in — reveal content immediately. Saved addresses below
        // are a secondary fetch and shouldn't block the whole screen on a slow
        // network. Previously, if /api/profile/addresses hung or rate-limited
        // mid-flight and the effect cleanup ran (e.g. token churn from the 401
        // interceptor), the `finally if (active) setPageLoading(false)` branch
        // never fired and the skeleton stayed forever.
        setPageLoading(false);

        if (token) {
          const addressRes = await api
            .get("/api/profile/addresses", { headers: { Authorization: `Bearer ${token}` } })
            .catch(() => ({ data: [] }));
          if (active) {
            setSavedAddresses(addressRes.data || []);
            if ((await readQuickAddresses()).length === 0) {
              const bootstrap = (addressRes.data || [])
                .slice(0, 3)
                .map((address: any, index: number) => ({
                  label: address.label,
                  street: address.street,
                  city: address.city,
                  zip: address.zip,
                  isDefault: address.isDefault ?? index === 0,
                }));
              if (bootstrap.length > 0) {
                await writeQuickAddresses(bootstrap);
                setQuickAddresses(bootstrap);
              }
            }
          }
        }
      } finally {
        // Safety net — fires even if Promise.all threw or the effect was torn
        // down before we hit the early setPageLoading(false) above. Setting
        // state on an unmounted component is a tolerated no-op in React 18+,
        // so we drop the `if (active)` guard that previously caused the
        // skeleton to get stuck whenever the effect was cleaned up mid-flight.
        setPageLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [currentRestaurantId, setProfile, token]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-apply pending promo code (kept in Zustand so it survives unmounting
  // CartScreen — fixes the bug where applying a code, navigating away, then
  // returning to cart wiped the discount).
  useEffect(() => {
    if (!pendingPromoCode || !personalDeals.length) return;

    const normalizedCode = pendingPromoCode.trim().toLowerCase();
    const match = personalDeals.find((deal) => deal.code?.trim().toLowerCase() === normalizedCode);
    if (!match) return;

    setSelectedPersonalDeal(match);
    setPromoCode(match.code);
    // NOTE: do NOT clear pendingPromoCode here — keep it set so the next
    // re-mount can re-resolve. It's cleared only when the user removes the
    // code or the order is placed (cart cleared via clearCart).
  }, [pendingPromoCode, personalDeals]);

  // Zone check — runs when coords, restaurant, or orderType change
  useEffect(() => {
    let active = true;
    (async () => {
      if (orderType !== "DELIVERY" || !coords || !currentRestaurantId) {
        if (active) {
          setDeliveryCheck(null);
          setZoneCheckStatus(null);
        }
        return;
      }
      if (active) setZoneCheckStatus("checking");
      try {
        const res = await api.post("/api/cities/validate-location", {
          lat: coords.lat,
          lng: coords.lng,
        });
        if (!active) return;

        if (!res.data?.covered) {
          setDeliveryCheck({ available: false, deliveryFee: 0, minOrder: 0 });
          setZoneCheckStatus("error");
          return;
        }

        const allRests: any[] = (res.data.cities || []).flatMap((c: any) => c.restaurants || []);
        const thisRest = allRests.find((r: any) => 
          r.id === currentRestaurantId || 
          (r.slug && currentRestaurantSlug && r.slug.toLowerCase() === currentRestaurantSlug.toLowerCase())
        );

        if (!thisRest) {
          setDeliveryCheck({ available: false, deliveryFee: 0, minOrder: 0 });
          setZoneCheckStatus("error");
          return;
        }

        if (thisRest.isOpen === false) {
          setDeliveryCheck({ available: false, deliveryFee: 0, minOrder: 0 });
          setZoneCheckStatus("error");
          // Optionally we could set a specific status for closed here, 
          // but for now we'll stick to the existing error flow which is handled later.
          return;
        }

        const fee = (thisRest.matchedZone?.deliveryFee ?? 0) / 100;
        const min = (thisRest.matchedZone?.minOrder ?? 0) / 100;
        useAppStore.getState().updateDeliveryOverride(currentRestaurantId, fee, min);

        const finalData = { available: true, deliveryFee: fee, minOrder: min };
        setDeliveryCheck(finalData);
        setZoneCheckStatus("ok");
        setRestaurantSettings((prev) => ({
          ...prev,
          deliveryFee: fee,
          minOrderAmount: min,
        }));
      } catch {
        if (active) setZoneCheckStatus(null);
      }
    })();
    return () => {
      active = false;
    };
  }, [coords, currentRestaurantId, orderType]);

  // Apply a personal deal both locally and to Zustand so it survives a
  // mount/unmount cycle (e.g. user navigates away and back to cart).
  const applyPersonalDeal = useCallback((deal: any) => {
    setSelectedPersonalDeal(deal);
    setPromoCode(deal.code || "");
    if (deal?.code) setPendingPromoCode(deal.code);
  }, [setPendingPromoCode]);

  const removePersonalDeal = useCallback(() => {
    setSelectedPersonalDeal(null);
    setPromoCode("");
    setPendingPromoCode(null);
  }, [setPendingPromoCode]);

  const handlePromo = useCallback(() => {
    const code = promoCode.trim().toLowerCase();
    // Dev-only: free-order shortcut. Compiled out of release bundles
    // by Metro because __DEV__ is statically replaced with `false`.
    if (__DEV__ && (code === "test" || code === "testa")) {
      setSelectedPersonalDeal({ code, campaign: { discountType: "FIXED", discountValue: total, minOrder: 0 } });
      return;
    }
    const match = personalDeals.find((deal) => deal.code?.toLowerCase() === code);
    if (match) {
      applyPersonalDeal(match);
      return;
    }
    Alert.alert("Promo code", "That code was not valid.");
  }, [personalDeals, promoCode, total, applyPersonalDeal]);

  const handleCheckoutPress = async () => {
    if (submitting) return;
    // Tvinga inloggning för att beställa. Gäster kan se menyn och fylla
    // varukorgen men måste logga in via Profile-tabben innan checkout.
    if (!token || !profile?.id) {
      Alert.alert(
        "Logga in för att beställa",
        "Du kan se menyn och fylla varukorgen som gäst, men för att slutföra beställningen behöver du logga in. Gå till Profil-tabben.",
      );
      return;
    }
    if (!formData.customerName.trim()) {
      Alert.alert(t('cart.validation.noName'), t('cart.validation.noNameHelp'));
      return;
    }
    if (!formData.customerPhone.trim()) {
      Alert.alert(t('cart.validation.noPhone'), t('cart.validation.noPhoneHelp'));
      return;
    }
    if (orderType === "DELIVERY" && !formData.deliveryStreet.trim()) {
      Alert.alert(t('cart.validation.noAddress'), t('cart.validation.noAddressHelp'));
      return;
    }
    if (!items.length) {
      Alert.alert(t('cart.validation.empty'), t('cart.validation.emptyHelp'));
      return;
    }

    const scheduleError = getScheduleValidationMessage(scheduledFor);
    if (scheduleError) {
      Alert.alert(t('cart.schedule.label'), scheduleError);
      return;
    }

    setSubmitting(true);
    let finalPaymentIntentId = "FREE_PROMO";
    // Single idempotency key per checkout attempt — replayed across all
    // intent/order/refund calls so a network retry never double-charges.
    const idempotencyKey = Crypto.randomUUID();
    try {
      if (!restaurantSettings.isOpen) {
        Alert.alert(t('cart.errors.restaurantClosed'), t('cart.errors.restaurantClosedHelp'));
        setSubmitting(false);
        return;
      }

      if (orderType === "DELIVERY" && currentRestaurantId) {
        let currentCoords = coords;

        if (!currentCoords && formData.deliveryStreet) {
          try {
            const cached = await findQuickAddressByText(autocompleteValue || formData.deliveryStreet);
            if (cached?.latitude != null && cached?.longitude != null) {
              currentCoords = { lat: cached.latitude, lng: cached.longitude };
              setAddress(formatQuickAddress(cached), currentCoords);
            }
          } catch {}
        }

        if (!currentCoords && formData.deliveryStreet) {
          try {
            // Backend-proxied: top-1 autocomplete + resolve coords.
            const items = await placesAutocomplete(formData.deliveryStreet);
            const top = items[0];
            const coords = top ? await placesResolveCoords(top) : null;
            if (coords) {
              currentCoords = coords;
              setAddress(formData.deliveryStreet, currentCoords);
              setQuickAddresses(
                await rememberQuickAddress({
                  street: formData.deliveryStreet,
                  city: formData.deliveryCity,
                  zip: formData.deliveryZip,
                  latitude: coords.lat,
                  longitude: coords.lng,
                }),
              );
            }
          } catch {}
        }

        if (currentCoords) {
          try {
            const zRes = await api.post("/api/cities/validate-location", {
              lat: currentCoords.lat,
              lng: currentCoords.lng,
            });

            if (!zRes.data?.covered) {
              setZoneCheckStatus("error");
              Alert.alert(t('cart.errors.outOfZone'), t('cart.errors.outOfZoneHelp'), [{ text: t('common.confirm') }]);
              setSubmitting(false);
              return;
            }

            const allRests: any[] = (zRes.data.cities || []).flatMap((c: any) => c.restaurants || []);
            const thisRest = allRests.find((r: any) =>
              r.id === currentRestaurantId ||
              (r.slug && currentRestaurantSlug && r.slug.toLowerCase() === currentRestaurantSlug.toLowerCase())
            );

            if (!thisRest || (thisRest.isOpen === false)) {
              setZoneCheckStatus("error");
              Alert.alert(t('cart.errors.notPossible'), t('cart.errors.notPossibleHelp'), [{ text: t('common.confirm') }]);
              setSubmitting(false);
              return;
            }

            const freshFee = (thisRest.matchedZone.deliveryFee ?? 0) / 100;
            const freshMin = (thisRest.matchedZone.minOrder ?? 0) / 100;
            useAppStore.getState().updateDeliveryOverride(currentRestaurantId, freshFee, freshMin);
            setDeliveryCheck({ available: true, deliveryFee: freshFee, minOrder: freshMin });
            setRestaurantSettings((prev) => ({ ...prev, deliveryFee: freshFee, minOrderAmount: freshMin }));
            setZoneCheckStatus("ok");
          } catch {}
        } else if (formData.deliveryStreet) {
          Alert.alert(t('cart.errors.addressNotVerified'), t('cart.errors.addressNotVerifiedHelp'));
          setSubmitting(false);
          return;
        }
      }

      if (subtotal < restaurantSettings.minOrderAmount) {
        Alert.alert(t('cart.errors.minimumOrder'), t('cart.summary.minimum', { amount: restaurantSettings.minOrderAmount }));
        setSubmitting(false);
        return;
      }

      // ===== 1. STRIPE BETALNINGSFLÖDE (NATIVE) =====
      const isTestFlow = __DEV__ && (selectedPersonalDeal?.code === "test" || selectedPersonalDeal?.code === "testa");

      if (!isTestFlow && Platform.OS !== "web") {
        // Pre-flight: verify the publishable key is loaded. Without it,
        // initPaymentSheet fails with a confusing native error in release.
        if (!STRIPE_PUBLISHABLE_KEY || !STRIPE_PUBLISHABLE_KEY.startsWith("pk_")) {
          captureError(new Error("[checkout] missing STRIPE_PUBLISHABLE_KEY in release bundle"), {
            keyPrefix: STRIPE_PUBLISHABLE_KEY ? STRIPE_PUBLISHABLE_KEY.slice(0, 4) : "(empty)",
          });
          throw new Error("Betalning är inte konfigurerad i denna build. Kontakta support.");
        }

        let clientSecret: string;
        let paymentIntentId: string;
        try {
          const intentRes = await api.post(
            "/api/payments/create-intent",
            { amount: total },
            { headers: { "Idempotency-Key": `${idempotencyKey}:intent` } }
          );
          clientSecret = intentRes.data?.clientSecret;
          paymentIntentId = intentRes.data?.paymentIntentId;
          if (!clientSecret || !paymentIntentId) {
            throw new Error("Servern returnerade ofullständig betalningsdata.");
          }
        } catch (intentErr: any) {
          captureError(intentErr, { stage: "create-intent", amount: total });
          throw new Error(
            intentErr?.response?.data?.error
            || intentErr?.message
            || "Kunde inte skapa betalning. Försök igen."
          );
        }

        // Build the payment-sheet config. Apple Pay is OPT-IN via env var
        // because it throws hard if the iOS Apple Pay capability isn't in
        // the Xcode entitlements. Card / Google Pay always work.
        const buildSheetConfig = (includeApplePay: boolean) => ({
          merchantDisplayName: 'FoodGo',
          paymentIntentClientSecret: clientSecret,
          ...(includeApplePay ? { applePay: { merchantCountryCode: 'SE' } } : {}),
          googlePay: { merchantCountryCode: 'SE', testEnv: false },
          returnURL: 'foodgo://stripe-redirect',
          appearance: {
            colors: {
              primary: palette.gold,
              background: palette.bg,
              componentBackground: palette.panel,
              componentBorder: "#E8DFD1",
              primaryText: palette.text,
              secondaryText: palette.muted,
              componentText: palette.text,
              placeholderText: "#A3998D",
              icon: palette.text,
            },
            shapes: {
              borderRadius: 20,
            }
          },
          defaultBillingDetails: {
            name: formData.customerName,
            phone: formData.customerPhone,
            email: profile?.email || undefined,
            address: { country: 'SE' },
          },
          billingDetailsCollectionConfiguration: {
            address: AddressCollectionMode.NEVER,
            name: CollectionMode.NEVER,
            email: CollectionMode.NEVER,
            phone: CollectionMode.NEVER,
            attachDefaultsToPaymentMethod: true,
          }
        });

        // Pre-flight: ask Stripe SDK if Apple Pay is actually usable on this
        // device + with our merchantIdentifier entitlement. If it returns
        // false, log clearly so we know Stripe is going to filter Apple Pay
        // out of the sheet — that's why the button doesn't appear.
        // Note: on iOS this resolves to `StripeAPI.deviceSupportsApplePay()`
        // and ignores any params, so we don't pass `applePay` here (the
        // current Stripe SDK types only expose `googlePay` on this call).
        let applePaySupported = false;
        try {
          applePaySupported = await isPlatformPaySupported();
        } catch (probeErr: any) {
          captureError(probeErr, { stage: "isPlatformPaySupported" });
        }
        console.log(`[stripe] isPlatformPaySupported(applePay) → ${applePaySupported}`);
        if (!applePaySupported) {
          captureError(new Error("[stripe] Apple Pay not supported on this build/device — sheet will not show the button"), {
            platform: Platform.OS,
            note: "Check: (1) Apple Pay capability in Xcode, (2) merchant ID matches entitlement, (3) Apple Pay Payment Processing Cert uploaded to Stripe Dashboard for this merchant ID, (4) device has a card in Wallet, (5) you're on a real device not simulator",
          });
        }

        let initInfo = await initPaymentSheet(buildSheetConfig(true) as any);
        console.log("[stripe] initPaymentSheet result:", initInfo.error ? `ERROR ${initInfo.error.code}: ${initInfo.error.message}` : "OK");

        // Auto-degrade: if Apple Pay entitlement is missing for some reason,
        // retry without applePay so card payment still works.
        if (initInfo.error
            && String(initInfo.error.message || "").toLowerCase().includes("merchantidentifier")) {
          captureError(new Error("[stripe-init] Apple Pay entitlement missing — retrying without Apple Pay"), {
            stripeErrorMessage: initInfo.error.message,
          });
          initInfo = await initPaymentSheet(buildSheetConfig(false) as any);
        }

        if (initInfo.error) {
          captureError(new Error(`[stripe-init] ${initInfo.error.code}: ${initInfo.error.message}`), {
            stripeErrorCode: initInfo.error.code,
            stripeErrorMessage: initInfo.error.message,
          });
          throw new Error(initInfo.error.message || "Betalningsformuläret kunde inte öppnas.");
        }

        const presentInfo = await presentPaymentSheet();

        if (presentInfo.error) {
          if (presentInfo.error.code !== 'Canceled') {
            captureError(new Error(`[stripe-present] ${presentInfo.error.code}: ${presentInfo.error.message}`), {
              stripeErrorCode: presentInfo.error.code,
              stripeErrorMessage: presentInfo.error.message,
            });
            throw new Error(presentInfo.error.message || "Betalningen misslyckades.");
          }
          setSubmitting(false); // Användaren klickade avbryt
          return;
        }

        finalPaymentIntentId = paymentIntentId;
      } else if (!isTestFlow && Platform.OS === "web") {
         // Dev-only test channel for the web build — Metro replaces __DEV__
         // with `false` in release bundles so this branch is dead code in
         // production. Web release builds must hit Stripe like native does.
         if (!__DEV__) {
           Alert.alert("Betalning krävs", "Den här plattformen stöder inte direkt-checkout. Använd appen.");
           setSubmitting(false);
           return;
         }
         finalPaymentIntentId = "BYPASS_WEB_" + Math.random().toString();
      }

      // ===== 2. SKAPA ORDER PÅ BACKEND =====
      const payload = {
        type: orderType,
        customerName: formData.customerName,
        customerPhone: formData.customerPhone,
        deliveryStreet: orderType === "DELIVERY" ? formData.deliveryStreet : undefined,
        deliveryZip: orderType === "DELIVERY" ? formData.deliveryZip : undefined,
        deliveryCity: orderType === "DELIVERY" ? formData.deliveryCity : undefined,
        deliveryInstructions: orderType === "DELIVERY" ? formData.deliveryInstructions || undefined : undefined,
        deliveryNote: tipAmount > 0 ? `(Dricks gett: ${tipAmount} kr i appen) ${formData.note || ""}`.trim() : formData.note || undefined,
        note: tipAmount > 0 ? `(Dricks gett: ${tipAmount} kr i appen) ${formData.note || ""}`.trim() : formData.note || undefined,
        tip: tipAmount > 0 ? tipAmount : undefined,
        stripePaymentIntentId: finalPaymentIntentId,
        discountCode: selectedPersonalDeal?.code || undefined,
        appliedDealId: undefined,
        restaurantId: currentRestaurantId || undefined,
        restaurantSlug: currentRestaurantSlug || undefined,
        lat: coords?.lat,
        lng: coords?.lng,
        scheduledFor: scheduledFor?.toISOString() || undefined,
        items: items.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
          note: item.note,
          selectedExtras: item.extras.map((extra: any) => ({
            groupId: extra.groupId,
            groupName: extra.groupName,
            extraId: extra.extraId,
            extraName: extra.name,
            priceAddon: extra.price,
          })),
        })),
      };

      // Refresh Supabase token before submitting to ensure userId is linked
      let freshToken = token;
      if (token) {
        try {
          const { supabase } = await import("../lib/supabase");
          const { data } = await supabase.auth.getSession();
          if (data.session?.access_token) {
            freshToken = data.session.access_token;
            // Update stored token if it changed (e.g. after auto-refresh)
            if (freshToken !== token) {
              useAppStore.getState().setToken(freshToken);
            }
          }
        } catch {
          // Fall back to existing token
        }
      }

      const response = await api.post("/api/orders", payload, {
        headers: {
          ...(freshToken ? { Authorization: `Bearer ${freshToken}` } : {}),
          "Idempotency-Key": `${idempotencyKey}:order`,
        },
      });

      const successId = response.data?.orderId || response.data?.id;
      if (successId) {
        // Trust the server's ETA when it gives us one — the old "30 if
        // delivery fee else 25" heuristic was wrong for free-delivery
        // restaurants. Falling back to 30 / 25 only if the API is silent.
        const serverEta: number | undefined =
          typeof response.data?.estimatedTime === "number"
            ? response.data.estimatedTime
            : undefined;
        const etaMinutes = serverEta ?? (orderType === "PICKUP" ? 25 : 30);
        // Seed the Dynamic Island countdown immediately so the timer doesn't
        // sit blank for the first few seconds while we wait for the first
        // server-side push to arrive.
        const etaEndsAt = Math.floor(Date.now() / 1000) + etaMinutes * 60;
        startOrderActivity({
          orderId: String(successId),
          restaurantName: cartRestaurant?.name || "FoodGo",
          orderTotal: Math.round(total),
          etaMinutes,
          etaEndsAt,
          orderType,
        }).catch(() => {});
        // Soft nudge (once per install) to enable Frequent Updates so the
        // Dynamic Island countdown stays accurate. No-op outside iOS.
        void maybeShowFrequentUpdatesPrompt();
        // Spara ordern lokalt så gäster (utan login) kan se sin
        // beställningshistorik på Orders-tabben. Backend-orders för
        // inloggade users hämtas separat från /api/profile/orders, men
        // lokala kopior fungerar som fallback om JWT förfaller eller
        // appen körs på en ny enhet. Mirror av apps/web/lib/orderHistory.ts.
        saveGuestOrder({
          id: String(successId),
          phone: formData.customerPhone,
          createdAt: new Date().toISOString(),
          restaurantName: cartRestaurant?.name ?? null,
          restaurantSlug: cartRestaurant?.slug ?? null,
          total: Math.round(total),
        }).catch(() => {});
        clearCart();
        openOrder(successId);
      } else {
        Alert.alert("Serverfel", "Inget order-ID returnerades: " + JSON.stringify(response.data));
      }
    } catch (error: any) {
      // If Stripe already charged the card but order creation failed, attempt a refund immediately.
      const paymentWasTaken =
        finalPaymentIntentId &&
        finalPaymentIntentId !== "FREE_PROMO" &&
        !finalPaymentIntentId.startsWith("BYPASS_WEB_");

      // Always capture so we have telemetry on every checkout failure.
      captureError(error, {
        stage: paymentWasTaken ? "post-payment-order-create" : "pre-payment",
        paymentIntentId: finalPaymentIntentId,
        orderType,
        total,
        itemCount: items.length,
        restaurantId: currentRestaurantId,
      });

      if (paymentWasTaken) {
        try {
          await api.post(
            "/api/payments/refund",
            { paymentIntentId: finalPaymentIntentId },
            { headers: { "Idempotency-Key": `${idempotencyKey}:refund` } }
          );
          Alert.alert(
            t('cart.errors.paymentRefunded'),
            t('cart.errors.paymentRefundedHelp')
          );
        } catch (refundErr: any) {
          captureError(refundErr, { stage: "refund-failed", paymentIntentId: finalPaymentIntentId });
          Alert.alert(
            t('cart.errors.paymentFailed'),
            t('cart.errors.paymentFailedHelp', { code: finalPaymentIntentId })
          );
        }
      } else {
        const msg = error?.response?.data?.error || error?.message || "Okänt fel";
        Alert.alert(t('cart.errors.orderFailed'), typeof msg === "string" ? msg : JSON.stringify(msg));
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (pageLoading) {
    return (
      <ScreenWrap>
        <Header title={t('cart.header')} subtitle={t('cart.preparing')} />
        <CartScreenSkeleton />
      </ScreenWrap>
    );
  }

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={[
        styles.scrollContent,
        {
          paddingTop: screenTopPadding,
          paddingBottom: screenBottomPadding,
        },
      ]}
    >
      <Header
        title={t('cart.header')}
        subtitle={items.length === 1 ? "1 produkt" : `${items.length} produkter`}
      />

      {pageLoading && (
        <View style={{ alignItems: "center", paddingVertical: 36, gap: 10 }}>
          <ActivityIndicator size="large" color={palette.gold} />
          <Text style={{ color: palette.muted, fontSize: 10, fontWeight: "700", letterSpacing: ls(2), textTransform: "uppercase" }}>{t('cart.loading')}</Text>
        </View>
      )}

      {!pageLoading && !items.length && <CartEmptyState onExplore={openHome} />}

      {!pageLoading && !!items.length && (
        <>
          {/* 1. Item List */}
          <View style={styles.cartItemList}>
            {items.map((item) => (
              <View key={item.cartItemId} style={styles.cartItem}>
                <Pressable onPress={() => handleEditCartItem(item)} style={{ flex: 1 }}>
                  <Text style={{ color: palette.text, fontSize: 16, fontWeight: "900", fontStyle: "italic", textTransform: "uppercase" }}>
                    {item.quantity}x {item.name}
                  </Text>
                  {item.extras.length > 0 && (
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                      {item.extras.map((e: any) => (
                        <View
                          key={e.extraId}
                          style={{ backgroundColor: palette.panelMuted, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: palette.border }}
                        >
                          <Text style={{ color: palette.muted, fontSize: 9, fontWeight: "800", textTransform: "uppercase" }}>{e.name}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                  <Text style={{ color: palette.gold, fontSize: 9, fontWeight: "900", letterSpacing: ls(2), marginTop: 6, opacity: 0.7 }}>{t('cart.editHint')}</Text>
                </Pressable>
                <View style={[styles.cartActions, { flexDirection: "row", alignItems: "center", gap: 12 }]}>
                  <View style={styles.counter}>
                    <Pressable hitSlop={10} onPress={() => updateQuantity(item.cartItemId, -1)}>
                      <Ionicons name="remove" size={18} color={palette.muted} />
                    </Pressable>
                    <Text style={styles.counterText}>{item.quantity}</Text>
                    <Pressable hitSlop={10} onPress={() => updateQuantity(item.cartItemId, 1)}>
                      <Ionicons name="add" size={18} color={palette.gold} />
                    </Pressable>
                  </View>
                  <Pressable hitSlop={10} onPress={() => removeItem(item.cartItemId)}>
                    <Ionicons name="trash-outline" size={18} color={palette.danger} />
                  </Pressable>
                </View>
              </View>
            ))}
          </View>

          {/* 2. Order Type Toggle */}
          <View style={{ flexDirection: "row", gap: 10, paddingHorizontal: 4 }}>
            {(["DELIVERY", "PICKUP"] as const).map((type) => (
              <Pressable
                key={type}
                onPress={() => setOrderType(type)}
                style={{
                  flex: 1,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  backgroundColor: orderType === type ? palette.gold : palette.panel,
                  borderRadius: 22,
                  paddingVertical: 16,
                  borderWidth: 1,
                  borderColor: orderType === type ? palette.gold : palette.border,
                }}
              >
                <Ionicons
                  name={type === "DELIVERY" ? "bicycle-outline" : "storefront-outline"}
                  size={20}
                  color={orderType === type ? "#000" : palette.muted}
                />
                <Text
                  style={{
                    color: orderType === type ? "#000" : palette.text,
                    fontWeight: "900",
                    textTransform: "uppercase",
                    fontSize: 11,
                    letterSpacing: ls(1),
                  }}
                >
                  {type === "DELIVERY" ? t('cart.delivery') : t('cart.pickup')}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* 2b. Scheduled Order Toggle */}
          <View style={{ flexDirection: "row", gap: 10, paddingHorizontal: 4, marginTop: 4 }}>
            <Pressable
              onPress={() => setScheduledFor(null)}
              style={{
                flex: 1,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                backgroundColor: !scheduledFor ? palette.gold : palette.panel,
                borderRadius: 22,
                paddingVertical: 14,
                borderWidth: 1,
                borderColor: !scheduledFor ? palette.gold : palette.border,
              }}
            >
              <Ionicons name="flash-outline" size={18} color={!scheduledFor ? "#000" : palette.muted} />
              <Text style={{ color: !scheduledFor ? "#000" : palette.text, fontWeight: "900", textTransform: "uppercase", fontSize: 11, letterSpacing: ls(1) }}>
                {t('cart.asap')}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => {
                handleOpenSchedulePicker();
              }}
              style={{
                flex: 1,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                backgroundColor: scheduledFor ? palette.gold : palette.panel,
                borderRadius: 22,
                paddingVertical: 14,
                borderWidth: 1,
                borderColor: scheduledFor ? palette.gold : palette.border,
              }}
            >
              <Ionicons name="time-outline" size={18} color={scheduledFor ? "#000" : palette.muted} />
              <Text style={{ color: scheduledFor ? "#000" : palette.text, fontWeight: "900", textTransform: "uppercase", fontSize: 11, letterSpacing: ls(1) }}>
                {t('cart.schedule.label')}
              </Text>
            </Pressable>
          </View>

          {scheduledFor && (
            <View style={[styles.formCard, { borderColor: "rgba(231,178,75,0.2)", backgroundColor: "rgba(231,178,75,0.03)" }]}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <Ionicons name="calendar-outline" size={18} color={palette.gold} />
                  <View>
                    <Text style={{ color: palette.text, fontSize: 14, fontWeight: "900" }}>
                      {scheduledFor.toLocaleDateString("sv-SE", { weekday: "long", day: "numeric", month: "long" })}
                    </Text>
                    <Text style={{ color: palette.gold, fontSize: 18, fontWeight: "900", marginTop: 2 }}>
                      {scheduledFor.toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" })}
                    </Text>
                    <Text style={{ color: palette.muted, fontSize: 10, fontWeight: "800", marginTop: 4, textTransform: "uppercase", letterSpacing: ls(1.2) }}>
                      {t('cart.schedule.onlyToday')}
                    </Text>
                  </View>
                </View>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <Pressable onPress={handleOpenSchedulePicker} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(231,178,75,0.15)", alignItems: "center", justifyContent: "center" }}>
                    <Ionicons name="time-outline" size={16} color={palette.gold} />
                  </Pressable>
                  <Pressable onPress={() => setScheduledFor(null)} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,59,48,0.12)", alignItems: "center", justifyContent: "center" }}>
                    <Ionicons name="close-outline" size={16} color={palette.danger} />
                  </Pressable>
                </View>
              </View>
            </View>
          )}

          {/* Schedule Picker Modal */}
          <Modal
            visible={showTimePicker}
            transparent
            animationType="slide"
            onRequestClose={() => setShowTimePicker(false)}
          >
            <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)" }} onPress={() => setShowTimePicker(false)}>
              <Pressable
                style={{
                  position: "absolute",
                  bottom: 0,
                  left: 0,
                  right: 0,
                  backgroundColor: palette.bg,
                  borderTopLeftRadius: 32,
                  borderTopRightRadius: 32,
                  padding: 24,
                  paddingBottom: 40,
                }}
                onPress={(e) => e.stopPropagation()}
              >
                <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: palette.muted, alignSelf: "center", marginBottom: 20, opacity: 0.3 }} />
                <Text style={{ color: palette.text, fontSize: 18, fontWeight: "900", textAlign: "center", marginBottom: 20, textTransform: "uppercase", letterSpacing: ls(1) }}>
                  {t('cart.schedule.title')}
                </Text>

                {/* Quick times */}
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "center", marginBottom: 20 }}>
                  {quickScheduleTimes.map((qt) => {
                    const t = qt.time;
                    const isActive =
                      scheduledFor &&
                      scheduledFor.getDate() === t.getDate() &&
                      scheduledFor.getMonth() === t.getMonth() &&
                      scheduledFor.getHours() === t.getHours() &&
                      scheduledFor.getMinutes() === t.getMinutes();
                    return (
                      <Pressable
                        key={t.toISOString()}
                        onPress={() => setScheduledFor(t)}
                        style={{
                          paddingHorizontal: 16,
                          paddingVertical: 10,
                          borderRadius: 12,
                          backgroundColor: isActive ? palette.gold : palette.panel,
                          borderWidth: 1,
                          borderColor: isActive ? palette.gold : palette.border,
                        }}
                      >
                        <Text style={{ color: isActive ? "#000" : palette.muted, fontSize: 10, fontWeight: "900", textTransform: "uppercase", letterSpacing: ls(1) }}>
                          {qt.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                {/* Custom time picker */}
                <View style={{ marginBottom: 14, alignItems: "center" }}>
                  <Text style={{ color: palette.muted, fontSize: 10, fontWeight: "800", textTransform: "uppercase", letterSpacing: ls(1.3) }}>
                    {t('cart.schedule.onlyToday')}
                  </Text>
                </View>

                <View style={{ flexDirection: "row", gap: 8, marginBottom: 20 }}>
                  {/* Hour scroll */}
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: palette.muted, fontSize: 9, fontWeight: "900", textTransform: "uppercase", letterSpacing: ls(1.5), marginBottom: 8, textAlign: "center" }}>{t('cart.schedule.hourLabel')}</Text>
                    <ScrollView style={{ height: 120 }} showsVerticalScrollIndicator={false}>
                      {availableHours.map((hour) => {
                        const isSelected = scheduledFor && scheduledFor.getHours() === hour;
                        return (
                          <Pressable
                            key={hour}
                            onPress={() => {
                              updateScheduledSelection((current) => {
                                const next = new Date(current);
                                next.setHours(hour, next.getMinutes(), 0, 0);
                                return next;
                              });
                            }}
                            style={{
                              paddingVertical: 12,
                              borderRadius: 10,
                              backgroundColor: isSelected ? "rgba(231,178,75,0.15)" : "transparent",
                              marginBottom: 2,
                              alignItems: "center",
                            }}
                          >
                            <Text style={{ color: isSelected ? palette.gold : palette.text, fontSize: 14, fontWeight: isSelected ? "900" : "700" }}>
                              {String(hour).padStart(2, "0")}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </ScrollView>
                  </View>

                  {/* Minute scroll */}
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: palette.muted, fontSize: 9, fontWeight: "900", textTransform: "uppercase", letterSpacing: ls(1.5), marginBottom: 8, textAlign: "center" }}>{t('cart.schedule.minuteLabel')}</Text>
                    <ScrollView style={{ height: 120 }} showsVerticalScrollIndicator={false}>
                      {Array.from({ length: 12 }, (_, i) => {
                        const m = i * 5;
                        const isDisabled =
                          (selectedScheduleHour === scheduleWindow.minTime.getHours() && m < scheduleWindow.minTime.getMinutes()) ||
                          (selectedScheduleHour === scheduleWindow.maxTime.getHours() && m > scheduleWindow.maxTime.getMinutes());
                        const isSelected = scheduledFor && scheduledFor.getMinutes() === m;
                        return (
                          <Pressable
                            key={m}
                            disabled={isDisabled}
                            onPress={() => {
                              updateScheduledSelection((current) => {
                                const next = new Date(current);
                                next.setMinutes(m, 0, 0);
                                return next;
                              });
                            }}
                            style={{
                              paddingVertical: 12,
                              borderRadius: 10,
                              backgroundColor: isSelected ? "rgba(231,178,75,0.15)" : "transparent",
                              marginBottom: 2,
                              alignItems: "center",
                              opacity: isDisabled ? 0.3 : 1,
                            }}
                          >
                            <Text style={{ color: isSelected ? palette.gold : palette.text, fontSize: 14, fontWeight: isSelected ? "900" : "700" }}>
                              {String(m).padStart(2, "0")}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </ScrollView>
                  </View>
                </View>

                <Pressable
                  onPress={() => {
                    const scheduleError = getScheduleValidationMessage(scheduledFor);
                    if (scheduleError) {
                      Alert.alert(t('cart.schedule.label'), scheduleError);
                      return;
                    }
                    setShowTimePicker(false);
                  }}
                  style={{
                    backgroundColor: palette.gold,
                    borderRadius: 16,
                    paddingVertical: 16,
                    alignItems: "center",
                  }}
                >
                  <Text style={{ color: "#000", fontSize: 12, fontWeight: "900", textTransform: "uppercase", letterSpacing: ls(1) }}>{t('cart.schedule.confirm')}</Text>
                </Pressable>
              </Pressable>
            </Pressable>
          </Modal>

          {!token && (
            <View style={[styles.formCard, { borderColor: "rgba(231,178,75,0.2)", backgroundColor: "rgba(231,178,75,0.03)" }]}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: "rgba(231,178,75,0.1)", alignItems: "center", justifyContent: "center" }}>
                  <Ionicons name="person-outline" size={20} color={palette.gold} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: palette.text, fontSize: 13, fontWeight: "900", fontStyle: "italic", textTransform: "uppercase" }}>{t('cart.guest.title')}</Text>
                  <Text style={{ color: palette.muted, fontSize: 10, fontWeight: "700", marginTop: 2 }}>{t('cart.guest.description')}</Text>
                </View>
                <Pressable onPress={openProfile} style={{ backgroundColor: palette.gold, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12 }}>
                  <Text style={{ color: "#000", fontSize: 10, fontWeight: "900", textTransform: "uppercase" }}>{t('cart.guest.loginBtn')}</Text>
                </Pressable>
              </View>
            </View>
          )}

          {/* 3. Customer Info */}
          <View style={styles.formCard}>
            <Text style={{ color: palette.text, fontSize: 11, fontWeight: "900", textTransform: "uppercase", letterSpacing: ls(1.5), marginBottom: 12 }}>{t('cart.sections.customer')}</Text>
            <View style={{ gap: 10 }}>
              <TextInput
                style={styles.input}
                placeholder={t('cart.inputs.name')}
                placeholderTextColor={palette.muted}
                value={formData.customerName}
                onChangeText={(value) => setFormData((v) => ({ ...v, customerName: value }))}
              />
              <TextInput
                style={styles.input}
                placeholder={t('cart.inputs.phone')}
                placeholderTextColor={palette.muted}
                keyboardType="phone-pad"
                value={formData.customerPhone}
                onChangeText={(value) => setFormData((v) => ({ ...v, customerPhone: value }))}
              />
            </View>
          </View>

          {/* 4. Delivery Info */}
          {orderType === "DELIVERY" && (
            <View style={styles.formCard}>
              <Text style={{ color: palette.text, fontSize: 11, fontWeight: "900", textTransform: "uppercase", letterSpacing: ls(1.5), marginBottom: 12 }}>{t('cart.sections.delivery')}</Text>

              {quickAddresses.length > 0 && (
                <View style={{ marginBottom: 16 }}>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                    {quickAddresses.map((addr) => (
                      <Pressable
                        key={`${addr.street}-${addr.zip || ""}-${addr.city || ""}`}
                        onPress={async () => {
                          const full = formatQuickAddress(addr);
                          const next = await rememberQuickAddress(addr);
                          setQuickAddresses(next);
                          setAutocompleteValue(full);
                          setFormData((v) => ({
                            ...v,
                            deliveryStreet: addr.street,
                            deliveryZip: addr.zip || "",
                            deliveryCity: addr.city || "",
                          }));
                          if (addr.latitude && addr.longitude) {
                            setAddress(full, { lat: addr.latitude, lng: addr.longitude });
                            setZoneCheckStatus("checking");
                          } else {
                            setZoneCheckStatus(null);
                          }
                        }}
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 6,
                          paddingHorizontal: 16,
                          paddingVertical: 10,
                          borderRadius: 14,
                          backgroundColor: autocompleteValue === formatQuickAddress(addr) ? "rgba(234,181,69,0.12)" : palette.panelMuted,
                          borderWidth: 1,
                          borderColor: autocompleteValue === formatQuickAddress(addr) ? palette.gold : palette.border,
                        }}
                      >
                        <Ionicons
                          name={addr.label === "Hem" ? "home-outline" : addr.label === "Jobb" ? "briefcase-outline" : "map-outline"}
                          size={14}
                          color={autocompleteValue === formatQuickAddress(addr) ? palette.gold : palette.muted}
                        />
                        <Text numberOfLines={1} style={{ color: autocompleteValue === formatQuickAddress(addr) ? palette.gold : palette.text, fontSize: 10, fontWeight: "900" }}>
                          {formatQuickAddress(addr)}
                        </Text>
                        {addr.isDefault && <Text style={{ color: palette.gold, fontSize: 8, fontWeight: "900" }}>• {t('cart.address.default')}</Text>}
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>
              )}

              <View style={{ gap: 10 }}>
                <AddressAutocomplete
                  value={autocompleteValue}
                  onChangeText={(val: string) => {
                    setAutocompleteValue(val);
                    if (val !== autocompleteValue) setZoneCheckStatus(null);
                  }}
                  onSelect={(addr: string, selectedCoords: any, parts: any) => {
                    setAutocompleteValue(addr);
                    setAddress(addr, selectedCoords);
                    setFormData((v) => ({
                      ...v,
                      deliveryStreet: parts?.street || addr,
                      deliveryZip: parts?.zip || "",
                      deliveryCity: parts?.city || "",
                    }));
                    if (selectedCoords?.lat != null && selectedCoords?.lng != null) {
                      void rememberQuickAddress({
                        label: undefined,
                        street: parts?.street || addr,
                        city: parts?.city || "",
                        zip: parts?.zip || "",
                        latitude: selectedCoords.lat,
                        longitude: selectedCoords.lng,
                      }).then(setQuickAddresses);
                    }
                    setZoneCheckStatus("checking");
                  }}
                  placeholder={t('cart.inputs.addressSearch')}
                />

                {zoneCheckStatus === "checking" && (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 4 }}>
                    <ActivityIndicator size="small" color={palette.gold} />
                    <Text style={{ color: palette.muted, fontSize: 10, fontWeight: "900", textTransform: "uppercase", letterSpacing: ls(0.5) }}>{t('cart.address.checking')}</Text>
                  </View>
                )}
                {zoneCheckStatus === "ok" && (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 4, paddingVertical: 8, borderRadius: 12, backgroundColor: "rgba(34,197,94,0.08)", borderWidth: 1, borderColor: "rgba(34,197,94,0.2)" }}>
                    <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: palette.success, alignItems: "center", justifyContent: "center" }}>
                      <Ionicons name="checkmark" size={12} color="#000" />
                    </View>
                    <Text style={{ color: palette.success, fontSize: 10, fontWeight: "900", textTransform: "uppercase", letterSpacing: ls(0.5) }}>
                      {t('cart.address.deliverable')}{" "}
                      {deliveryCheck?.deliveryFee != null && deliveryCheck.deliveryFee > 0
                        ? `(${Math.round(deliveryCheck.deliveryFee)} kr)`
                        : deliveryCheck?.deliveryFee === 0
                          ? t('common.free')
                          : ""}
                    </Text>
                  </View>
                )}
                {zoneCheckStatus === "error" && (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 4, paddingVertical: 8, borderRadius: 12, backgroundColor: "rgba(239,68,68,0.08)", borderWidth: 1, borderColor: "rgba(239,68,68,0.2)" }}>
                    <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: palette.danger, alignItems: "center", justifyContent: "center" }}>
                      <Ionicons name="close" size={12} color="#fff" />
                    </View>
                    <Text style={{ color: palette.danger, fontSize: 10, fontWeight: "900", textTransform: "uppercase", letterSpacing: ls(0.5), flex: 1 }}>
                      {t('cart.address.notDeliverable')}
                    </Text>
                  </View>
                )}

                {!!formData.deliveryStreet && (
                  <View style={{ marginTop: 8, padding: 14, borderRadius: 16, backgroundColor: palette.panelMuted, borderWidth: 1, borderColor: palette.border }}>
                    <Text style={{ color: palette.muted, fontSize: 9, fontWeight: "900", textTransform: "uppercase", letterSpacing: ls(1), marginBottom: 4 }}>{t('cart.address.selected')}</Text>
                    <Text style={{ color: palette.text, fontSize: 13, fontWeight: "900" }}>{formData.deliveryStreet}</Text>
                    <Text style={{ color: palette.muted, fontSize: 11, fontWeight: "700", marginTop: 2 }}>
                      {formData.deliveryZip} {formData.deliveryCity}
                    </Text>
                  </View>
                )}

                <Text style={{ color: palette.text, fontSize: 11, fontWeight: "900", textTransform: "uppercase", letterSpacing: ls(1.5), marginTop: 12, marginBottom: 8 }}>{t('cart.sections.instructions')}</Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {[
                    { id: "RING_DOORBELL", label: t('cart.instructions.ringDoorbell'), icon: "notifications-outline" },
                    { id: "LEAVE_AT_DOOR", label: t('cart.instructions.leaveAtDoor'), icon: "exit-outline" },
                    { id: "MEET_OUTSIDE", label: t('cart.instructions.meetOutside'), icon: "person-outline" },
                    { id: "PORTKOD", label: t('cart.instructions.doorCode'), icon: "key-outline" },
                  ].map((opt) => (
                    <Pressable
                      key={opt.id}
                      onPress={() =>
                        setFormData((v) => ({
                          ...v,
                          deliveryInstructions: v.deliveryInstructions === opt.id ? "" : opt.id,
                        }))
                      }
                      style={{
                        flex: 1,
                        minWidth: "46%",
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 8,
                        paddingHorizontal: 14,
                        paddingVertical: 14,
                        borderRadius: 16,
                        backgroundColor: formData.deliveryInstructions === opt.id ? "rgba(234,181,69,0.12)" : palette.panelMuted,
                        borderWidth: 1,
                        borderColor: formData.deliveryInstructions === opt.id ? palette.gold : palette.border,
                      }}
                    >
                      <Ionicons name={opt.icon as any} size={16} color={formData.deliveryInstructions === opt.id ? palette.gold : palette.muted} />
                      <Text style={{ color: formData.deliveryInstructions === opt.id ? palette.gold : palette.text, fontSize: 10, fontWeight: "900", textTransform: "uppercase" }}>
                        {opt.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            </View>
          )}

          {/* 5. Notes & Promo */}
          <View style={styles.formCard}>
            <Text style={{ color: palette.text, fontSize: 11, fontWeight: "900", textTransform: "uppercase", letterSpacing: ls(1.5), marginBottom: 12 }}>{t('cart.sections.notes')}</Text>
            <TextInput
              style={[styles.input, { height: 80, textAlignVertical: "top", paddingTop: 14 }]}
              placeholder={t('cart.inputs.note')}
              placeholderTextColor={palette.muted}
              multiline
              value={formData.note}
              onChangeText={(value) => setFormData((v) => ({ ...v, note: value }))}
            />

            <View style={{ flexDirection: "row", gap: 10, marginTop: 14 }}>
              <TextInput
                style={[styles.input, { flex: 1, marginBottom: 0 }]}
                placeholder={t('cart.inputs.promo')}
                placeholderTextColor={palette.muted}
                autoCapitalize="none"
                value={selectedPersonalDeal ? selectedPersonalDeal.code : promoCode}
                onChangeText={(value) => {
                  if (selectedPersonalDeal) setSelectedPersonalDeal(null);
                  setPromoCode(value);
                }}
                editable={!selectedPersonalDeal}
              />
              <Pressable
                onPress={
                  selectedPersonalDeal
                    ? removePersonalDeal
                    : handlePromo
                }
                style={{
                  backgroundColor: selectedPersonalDeal ? palette.danger : palette.gold,
                  paddingHorizontal: 22,
                  justifyContent: "center",
                  borderRadius: 18,
                }}
              >
                <Text style={{ color: selectedPersonalDeal ? "#fff" : "#000", fontWeight: "900", textTransform: "uppercase", fontSize: 10 }}>
                  {selectedPersonalDeal ? t('cart.promo.remove') : t('cart.promo.check')}
                </Text>
              </Pressable>
            </View>
          </View>

          {/* 6. Tipping Section — wider, full-bleed within scroll padding */}
          {orderType === "DELIVERY" && (
            <View style={[styles.formCard, { paddingVertical: 22, paddingHorizontal: 22, marginHorizontal: -4 }]}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <Ionicons name="heart" size={20} color={palette.gold} />
                <Text style={{ color: palette.text, fontSize: 13, fontWeight: "900", textTransform: "uppercase", letterSpacing: ls(1.5) }}>
                  {t('cart.sections.tip')}
                </Text>
              </View>
              <Text style={{ color: palette.muted, fontSize: 10, fontWeight: "700", marginBottom: 16 }}>
                {t('cart.tip.description')}
              </Text>
              <View style={{ flexDirection: "row", gap: 10 }}>
                {[0, 10, 20, 50].map((amt) => {
                  const isActive = tipAmount === amt;
                  return (
                    <ScalePressable
                      key={amt}
                      onPress={() => setTipAmount(amt)}
                      style={{
                        flex: 1,
                        backgroundColor: isActive ? palette.gold : palette.panelMuted,
                        borderWidth: 1,
                        borderColor: isActive ? palette.gold : palette.border,
                        borderRadius: 14,
                        paddingVertical: 14,
                        alignItems: "center"
                      }}
                    >
                      <Text style={{ color: isActive ? "#000" : palette.text, fontWeight: "900", fontSize: 12 }}>
                        {amt === 0 ? t('cart.tip.none') : `+${amt} kr`}
                      </Text>
                    </ScalePressable>
                  );
                })}
              </View>
            </View>
          )}

          {/* 6b. Personal deals — horizontal scroller. Tap a card to apply. */}
          {personalDeals.length > 0 && (
            <View style={{ marginTop: 4, marginHorizontal: -4 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10, paddingHorizontal: 4 }}>
                <Ionicons name="pricetags" size={16} color={palette.gold} />
                <Text style={{ color: palette.text, fontSize: 12, fontWeight: "900", textTransform: "uppercase", letterSpacing: ls(1.5) }}>
                  Dina rabattkoder
                </Text>
                <View style={{ backgroundColor: palette.gold, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2 }}>
                  <Text style={{ color: "#000", fontSize: 10, fontWeight: "900" }}>{personalDeals.length}</Text>
                </View>
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: 4, paddingVertical: 4, gap: 10 }}
              >
                {personalDeals.map((deal) => {
                  const isActive = selectedPersonalDeal?.code === deal.code;
                  const campaign = deal.campaign || {};
                  const discountLabel = campaign.discountType === "PERCENTAGE"
                    ? `${campaign.discountValue || 0}%`
                    : `${Math.round((campaign.discountValue || 0) / 100)} kr`;
                  const remaining = typeof deal.maxUsages === "number"
                    ? Math.max(0, deal.maxUsages - (deal.usageCount || 0))
                    : null;
                  const validUntil = deal.validUntil ? new Date(deal.validUntil) : null;
                  const validLabel = validUntil
                    ? validUntil.toLocaleDateString("sv-SE", { day: "numeric", month: "short" })
                    : null;
                  const isUsedUp = remaining !== null && remaining <= 0;
                  const isExpired = validUntil ? validUntil.getTime() < Date.now() : false;
                  const disabled = isUsedUp || isExpired || deal.isUsed === true;

                  return (
                    <ScalePressable
                      key={deal.id || deal.code}
                      onPress={() => {
                        if (disabled) {
                          Alert.alert(
                            isExpired ? "Utgången" : isUsedUp ? "Slut" : "Använd",
                            isExpired ? "Den här koden har gått ut." : isUsedUp ? "Du har använt alla dina försök." : "Du har redan använt den här koden.",
                          );
                          return;
                        }
                        if (isActive) removePersonalDeal();
                        else applyPersonalDeal(deal);
                      }}
                      style={{
                        width: 220,
                        backgroundColor: isActive ? palette.gold : palette.panel,
                        borderRadius: 18,
                        borderWidth: 1.5,
                        borderColor: isActive ? palette.gold : disabled ? palette.border : "rgba(231,178,75,0.35)",
                        padding: 14,
                        opacity: disabled ? 0.5 : 1,
                        shadowColor: isActive ? palette.gold : "transparent",
                        shadowOpacity: isActive ? 0.4 : 0,
                        shadowRadius: 12,
                        shadowOffset: { width: 0, height: 4 },
                      }}
                    >
                      {/* Top row: discount + active check */}
                      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                        <Text style={{ color: isActive ? "#000" : palette.gold, fontSize: 24, fontWeight: "900", letterSpacing: -0.5, fontStyle: "italic" }}>
                          -{discountLabel}
                        </Text>
                        {isActive && (
                          <View style={{ backgroundColor: "#000", borderRadius: 10, padding: 4 }}>
                            <Ionicons name="checkmark" size={12} color={palette.gold} />
                          </View>
                        )}
                      </View>
                      {/* Title */}
                      <Text
                        numberOfLines={1}
                        style={{
                          color: isActive ? "#000" : palette.text,
                          fontSize: 12, fontWeight: "800",
                          marginTop: 6,
                          textTransform: "uppercase", letterSpacing: ls(1),
                        }}
                      >
                        {campaign.title || deal.code}
                      </Text>
                      {/* Code chip */}
                      <View style={{
                        marginTop: 8, alignSelf: "flex-start",
                        backgroundColor: isActive ? "rgba(0,0,0,0.15)" : palette.panelMuted,
                        borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3,
                      }}>
                        <Text style={{ color: isActive ? "#000" : palette.muted, fontSize: 10, fontWeight: "900", letterSpacing: 1 }}>
                          {deal.code}
                        </Text>
                      </View>
                      {/* Bottom: meta row */}
                      <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 12, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: isActive ? "rgba(0,0,0,0.2)" : palette.border }}>
                        {validLabel && (
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                            <Ionicons name="time-outline" size={10} color={isActive ? "#000" : palette.muted} />
                            <Text style={{ color: isActive ? "#000" : palette.muted, fontSize: 10, fontWeight: "700" }}>
                              t.o.m {validLabel}
                            </Text>
                          </View>
                        )}
                        {remaining !== null && (
                          <Text style={{ color: isActive ? "#000" : palette.muted, fontSize: 10, fontWeight: "700" }}>
                            {remaining} kvar
                          </Text>
                        )}
                      </View>
                    </ScalePressable>
                  );
                })}
              </ScrollView>
            </View>
          )}

          {/* 7. Summary */}
          <View style={[styles.formCard, { backgroundColor: "transparent", borderWidth: 0, paddingHorizontal: 4 }]}>
            <View style={{ gap: 8 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={{ color: palette.muted, fontWeight: "800", textTransform: "uppercase", fontSize: 11, letterSpacing: ls(0.5) }}>{t('cart.summary.subtotal')}</Text>
                <Text style={{ color: palette.text, fontWeight: "900", fontSize: 11 }}>{Math.round(subtotal)} KR</Text>
              </View>
              {orderType === "DELIVERY" && (
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={{ color: palette.muted, fontWeight: "800", textTransform: "uppercase", fontSize: 11, letterSpacing: ls(0.5) }}>{t('cart.summary.deliveryFee')}</Text>
                  <Text style={{ color: palette.text, fontWeight: "900", fontSize: 11 }}>{Math.round(deliveryFee)} KR</Text>
                </View>
              )}
              {tipAmount > 0 && orderType === "DELIVERY" && (
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={{ color: palette.gold, fontWeight: "800", textTransform: "uppercase", fontSize: 11, letterSpacing: ls(0.5) }}>{t('cart.summary.tip')}</Text>
                  <Text style={{ color: palette.gold, fontWeight: "900", fontSize: 11 }}>+{tipAmount} KR</Text>
                </View>
              )}
              {personalDiscount > 0 && (
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={{ color: palette.success, fontWeight: "800", textTransform: "uppercase", fontSize: 11, letterSpacing: ls(0.5) }}>{t('cart.summary.discount')}</Text>
                  <Text style={{ color: palette.success, fontWeight: "900", fontSize: 11 }}>-{Math.round(personalDiscount)} KR</Text>
                </View>
              )}
            </View>

            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginTop: 20 }}>
              <Text style={{ color: palette.text, fontSize: 34, fontWeight: "900", fontStyle: "italic", textTransform: "uppercase", letterSpacing: -1.2 }}>{t('cart.summary.total')}</Text>
              <Text style={{ color: palette.gold, fontSize: 48, fontWeight: "900", fontStyle: "italic", letterSpacing: -1 }}>
                {Math.round(total)} <Text style={{ fontSize: 14, fontStyle: "normal", opacity: 0.6 }}>SEK</Text>
              </Text>
            </View>

            <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 6 }}>
              <Text style={{ color: palette.muted, fontWeight: "600", fontSize: 10, letterSpacing: ls(0.3) }}>{t('cart.vatIncluded', { rate: 6 })}</Text>
              <Text style={{ color: palette.muted, fontWeight: "700", fontSize: 10 }}>{Math.round(total * 6 / 106)} kr</Text>
            </View>

            {subtotal < restaurantSettings.minOrderAmount && (
              <View style={{ backgroundColor: "rgba(239,68,68,0.1)", borderRadius: 16, padding: 14, marginTop: 18, borderWidth: 1, borderColor: "rgba(239,68,68,0.2)" }}>
                <Text style={{ color: palette.danger, fontSize: 10, fontWeight: "900", textAlign: "center", textTransform: "uppercase", letterSpacing: ls(0.5) }}>
                  {t('cart.summary.minimum', { amount: restaurantSettings.minOrderAmount })}
                </Text>
              </View>
            )}

            <PrimaryButton
              label={submitting ? t('cart.submittingBtn') : t('cart.checkoutBtn', { amount: Math.round(total) })}
              onPress={handleCheckoutPress}
              disabled={submitting || !restaurantSettings.isOpen || subtotal < restaurantSettings.minOrderAmount}
              icon="checkmark-circle-outline"
              style={{ marginTop: 28, paddingVertical: 19 }}
            />
          </View>
        </>
      )}

      {editing && (
        <ProductModal
          product={editing.product}
          address={storeAddress}
          orderType={orderType}
          editMode
          initialQuantity={editing.item.quantity}
          initialExtras={editing.item.extras}
          initialNote={editing.item.note}
          onClose={() => setEditing(null)}
          onAdd={(payload) => {
            updateItem(editing.item.cartItemId, {
              quantity: payload.quantity,
              note: payload.note,
              extras: payload.extras,
            });
            setEditing(null);
          }}
        />
      )}
    </ScrollView>
  );
}
