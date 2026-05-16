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

import { CartItem, DeliveryCheck, City, MenuProduct } from "../types";


import AddressAutocomplete from "../components/AddressAutocomplete";
import ProductModal from "../components/ProductModal";
import BogoPickerModal from "../components/BogoPickerModal";
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

/**
 * Konverterar en CSS-color-sträng till hex som Stripe PaymentSheet
 * accepterar (#RRGGBB eller #RRGGBBAA). Stripe rejectar rgba()/hsl()
 * med error "Expected hex string of length 6 or 8". Vår palette har
 * dark-mode-färger som rgba(255,255,255,0.6) → vi måste konvertera.
 */
function toStripeHex(color: string): string {
  if (!color) return "#000000";
  // Redan hex → returnera som-är (uppercase för konsistens)
  if (color.startsWith("#")) return color.toUpperCase();
  // rgba(r, g, b, a) → #RRGGBBAA
  const rgbaMatch = color.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\s*\)$/i);
  if (rgbaMatch) {
    const r = Math.min(255, Math.max(0, parseInt(rgbaMatch[1], 10)));
    const g = Math.min(255, Math.max(0, parseInt(rgbaMatch[2], 10)));
    const b = Math.min(255, Math.max(0, parseInt(rgbaMatch[3], 10)));
    const a = rgbaMatch[4] !== undefined ? parseFloat(rgbaMatch[4]) : 1;
    const aHex = Math.round(a * 255).toString(16).padStart(2, "0").toUpperCase();
    const hex = `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`.toUpperCase();
    return a >= 1 ? hex : `${hex}${aHex}`;
  }
  // Okänt format — fallback till svart för att inte krascha Stripe
  console.warn(`[stripe] Okänt color-format för Stripe: "${color}" — använder #000000`);
  return "#000000";
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
  const addItem = useAppStore((s) => s.addItem);
  const removeItem = useAppStore((s) => s.removeItem);
  const updateQuantity = useAppStore((s) => s.updateQuantity);
  const updateItem = useAppStore((s) => s.updateItem);
  const clearCart = useAppStore((s) => s.clearCart);
  const bogoChoice = useAppStore((s) => s.bogoChoice);
  const setBogoChoice = useAppStore((s) => s.setBogoChoice);
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
  // Referral / WELCOME deals attached to the user via /api/account/deals.
  // Backend returns ACTIVE deals (and PENDING/REDEEMED for history). We
  // show the first ACTIVE WELCOME/REFERRAL_* as an opt-in toggle in the
  // cart summary. Once toggled on, the deal id is sent on the order
  // payload as `userDealId` and the backend recomputes / freezes it.
  type UserDeal = {
    id: string;
    type: string;
    status: string;
    amountKr?: number | null;
    discountPercent?: number | null;
    discountType?: string | null;
    freeDelivery?: boolean;
    expiresAt?: string | null;
    metadata?: { minOrderKr?: number; validUntil?: string | null } | null;
  };
  const [userDeals, setUserDeals] = useState<UserDeal[]>([]);
  const [useUserDeal, setUseUserDeal] = useState<boolean>(false);
  const [deliveryCheck, setDeliveryCheck] = useState<DeliveryCheck | null>(null);
  const [zoneCheckStatus, setZoneCheckStatus] = useState<"ok" | "error" | "checking" | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [pickupCities, setPickupCities] = useState<City[]>([]);
  const [formData, setFormData] = useState({
    customerName: "",
    customerPhone: "",
    customerEmail: "",
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
  const [showCustomTipInput, setShowCustomTipInput] = useState<boolean>(false);
  const [customTipText, setCustomTipText] = useState<string>("");
  // Komplettering till minimum — när subtotal < minOrder kan kunden kryssa i
  // detta för att betala mellanskillnaden (paritet med web cart).
  const [topUpToMinimum, setTopUpToMinimum] = useState<boolean>(true);

  // ── BOGO state ──────────────────────────────────────────────────────────
  // Server-side preview returnerar bästa deal + reward-produkter när varukorgen
  // ändras. Speglar useEffect:en i apps/web/app/cart/page.tsx — samma endpoint,
  // samma datastruktur. `bogoChoice` (i Zustand) håller koll på vilken
  // gratisvara användaren faktiskt valt.
  const [bogoPreview, setBogoPreview] = useState<{
    dealId: string | null;
    dealTitle: string;
    rewardCategoryName: string | null;
    rewardProducts: { id: string; name: string; price: number; imageUrl?: string | null }[];
    discountKr: number;
    bogoExcludedExtraIds: string[];
  } | null>(null);
  const [showBogoPicker, setShowBogoPicker] = useState(false);
  // Vald gratisprodukt på väg in i ProductModal — vi hämtar fullständig
  // produktdata (med extras) från servern först så användaren kan välja
  // tillval på sin gratisvara. Matchar web's `bogoProduct`-flöde.
  const [bogoSelectedProduct, setBogoSelectedProduct] = useState<{
    product: MenuProduct;
    dealId: string;
    dealTitle: string;
    rewardCategoryName: string | null;
    excludedExtraIds: string[];
  } | null>(null);
  const [bogoFetching, setBogoFetching] = useState(false);

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

  // Welcome / referral user-deal — picks the FIRST active one to keep UI
  // simple. Backend prevents stacking these with other personal/popup
  // deals, so we only honour `useUserDeal` if no `selectedPersonalDeal` is
  // also picked (the toggle disables itself in the JSX in that case).
  const activeUserDeal = userDeals[0] || null;
  const userDealMinOrderKr = activeUserDeal?.metadata?.minOrderKr || 0;

  // Dynamisk reward-label från deal-typ:
  //   "25% rabatt" / "50 kr rabatt" / "Fri leverans" /
  //   "25% rabatt + Fri leverans". Tom string om dealen saknar värde.
  const userDealLabel = (() => {
    if (!activeUserDeal) return "";
    const parts: string[] = [];
    if (activeUserDeal.discountPercent && activeUserDeal.discountPercent > 0) {
      parts.push(`${activeUserDeal.discountPercent}% rabatt`);
    } else if (activeUserDeal.amountKr && activeUserDeal.amountKr > 0) {
      parts.push(`${activeUserDeal.amountKr} kr rabatt`);
    }
    if (activeUserDeal.freeDelivery) parts.push("Fri leverans");
    return parts.join(" + ");
  })();
  // Räkna ut subtotal-rabatt-del (procent eller fast belopp)
  const computedDealKr = (() => {
    if (!activeUserDeal) return 0;
    let amount = 0;
    if (activeUserDeal.discountPercent && activeUserDeal.discountPercent > 0) {
      amount = Math.round((subtotal * activeUserDeal.discountPercent) / 100);
    } else if (activeUserDeal.amountKr && activeUserDeal.amountKr > 0) {
      amount = activeUserDeal.amountKr;
    }
    return Math.min(amount, subtotal);
  })();
  // Eligible = vi har en deal som faktiskt ger rabatt OCH min-order uppfylld.
  // Om dealen saknar värde (admin-mall är trasig) → räkna den inte som
  // användbar — bättre att gömma toggeln än visa "Använd kr rabatt".
  const userDealHasValue =
    computedDealKr > 0 ||
    (activeUserDeal?.freeDelivery === true);
  const userDealEligible =
    !!activeUserDeal && userDealHasValue && subtotal >= userDealMinOrderKr;
  // userDealDiscount = subtotal-rabatten. Free delivery hanteras genom att
  // nolla deliveryFee separat nedan, så den dubbel-räknas inte.
  const userDealDiscount = useUserDeal && userDealEligible ? computedDealKr : 0;
  const userDealFreeDelivery = !!(useUserDeal && userDealEligible && activeUserDeal?.freeDelivery);

  const ovr = currentRestaurantId ? deliveryOverrides[currentRestaurantId] : undefined;
  const rawDeliveryFee =
    orderType === "DELIVERY"
      ? (deliveryCheck?.deliveryFee ?? ovr?.deliveryFee ?? restaurantSettings.deliveryFee)
      : 0;
  // Free delivery via userDeal → nolla fee:n så total räknas utan leverans
  const deliveryFee = userDealFreeDelivery ? 0 : rawDeliveryFee;
  const minOrder = deliveryCheck?.minOrder ?? restaurantSettings.minOrderAmount;
  // Komplettering till minimum — bara aktiv när kunden kryssat i checkboxen och
  // subtotal verkligen ligger under minimum (paritet med web).
  const minOrderTopUp = topUpToMinimum && subtotal > 0 && subtotal < minOrder
    ? Math.max(0, minOrder - subtotal)
    : 0;
  const effectiveTip = orderType === "DELIVERY" ? Math.max(0, tipAmount) : 0;
  // BOGO-rabatt kommer från server-evaluering — vi visar den som rabatt-rad
  // när den är bäst (paritet med web: `finalDiscount = max(personal, bogo)`).
  const bogoDiscount = bogoPreview?.discountKr ?? 0;
  // userDealDiscount stackas inte med personal/BOGO — backend kommer ändå
  // att avvisa dubbel-applicering. Vi tar den största så användaren ser den
  // mest fördelaktiga rabatten markerad.
  const finalDiscount = Math.max(personalDiscount, bogoDiscount, userDealDiscount);
  const isTestCode = __DEV__ && (selectedPersonalDeal?.code === "test" || selectedPersonalDeal?.code === "testa");
  const total = isTestCode ? 0 : Math.max(0, subtotal + deliveryFee + minOrderTopUp - finalDiscount + effectiveTip);

  // Initial data fetch
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [settingsRes, profileRes, dealsRes, restaurantRes, citiesRes, userDealsRes] = await Promise.all([
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
          // /api/account/deals returnerar referral/WELCOME-deals. Endast
          // användbart för inloggade — guests har inga user-deals.
          token
            ? api.get("/api/account/deals", { headers: { Authorization: `Bearer ${token}` } }).catch(() => ({ data: { deals: [] } }))
            : Promise.resolve({ data: { deals: [] } }),
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
        // ACTIVE user-deals only — PENDING/REDEEMED are for /profile history.
        // Backend returnerar { deals: [...] } eller direkt en array beroende
        // på version — vi defensive-läser båda.
        const rawUserDeals: UserDeal[] = Array.isArray(userDealsRes.data)
          ? userDealsRes.data
          : (userDealsRes.data?.deals || []);
        setUserDeals(rawUserDeals.filter((d: UserDeal) => d.status === "ACTIVE"));

        // Detect guest profile (auto-generated "Gäst XXXX" name or empty id) and
        // skip auto-fill of name/phone so they explicitly enter their details.
        const profName = profileRes.data?.name || "";
        const isGuestProfile =
          !profileRes.data?.id || /^Gäst\s+\d{2,}$/i.test(profName.trim());
        setFormData((current) => ({
          ...current,
          customerName: current.customerName || (isGuestProfile ? "" : profName),
          customerPhone: current.customerPhone || (isGuestProfile ? "" : (profileRes.data?.phone || "")),
          customerEmail: current.customerEmail || (isGuestProfile ? "" : (profileRes.data?.email || "")),
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

  // ── BOGO-förhandsgranskning ─────────────────────────────────────────────
  // Anropar /api/deals/evaluate-cart server-side när varukorgen ändras —
  // samma endpoint som web cart-page. Debouncar ~300 ms så snabba
  // quantity-klick inte spammar API:et. Endast BOGO-deals visas i pickern
  // (övriga rabatter ger fortfarande total-rabatt via finalDiscount).
  useEffect(() => {
    if (!currentRestaurantId || items.length === 0) {
      setBogoPreview(null);
      // Inga items → ingen aktiv BOGO; rensa eventuell vald gratisvara.
      if (useAppStore.getState().bogoChoice) {
        setBogoChoice(null);
      }
      return;
    }
    const handle = setTimeout(async () => {
      try {
        const res = await api.post("/api/deals/evaluate-cart", {
          restaurantId: currentRestaurantId,
          // Skicka inte BOGO-gratisvaran tillbaka in i evalueringen — den ska
          // inte räknas mot trigger-mängden (annars dubbelräknas).
          items: items
            .filter((i) => !i.bogoFreeFromDealId)
            .map((i) => ({ productId: i.productId, quantity: i.quantity })),
        });
        const data = res.data || {};
        if (data.isBogo && data.discountAmountKr > 0 && data.dealTitle) {
          setBogoPreview({
            dealId: data.dealId ?? null,
            dealTitle: data.dealTitle,
            rewardCategoryName: data.rewardCategoryName ?? null,
            rewardProducts: Array.isArray(data.rewardProducts) ? data.rewardProducts : [],
            discountKr: data.discountAmountKr,
            bogoExcludedExtraIds: Array.isArray(data.bogoExcludedExtraIds) ? data.bogoExcludedExtraIds : [],
          });
          // Rensa bogoChoice om det gäller en annan deal nu
          const existing = useAppStore.getState().bogoChoice;
          if (existing && existing.dealId !== data.dealId) {
            setBogoChoice(null);
          }
        } else {
          setBogoPreview(null);
          if (useAppStore.getState().bogoChoice) setBogoChoice(null);
        }
      } catch {
        setBogoPreview(null);
      }
    }, 300);
    return () => clearTimeout(handle);
  }, [items, currentRestaurantId, setBogoChoice]);

  // Om användaren manuellt tar bort BOGO-gratisvaran från korgen ska
  // valet återspeglas i bogoChoice — annars sitter det kvar som "vald".
  useEffect(() => {
    if (!bogoChoice) return;
    const stillPresent = items.some(
      (i) => i.bogoFreeFromDealId === bogoChoice.dealId && i.productId === bogoChoice.product.id,
    );
    if (!stillPresent) setBogoChoice(null);
  }, [items, bogoChoice, setBogoChoice]);

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

      // Tillåt checkout om subtotal < minOrder ENDAST när användaren kryssat
      // i komplettering-checkboxen (paritet med web). Annars blockera.
      // OBS: `minOrder` är zone-aware (deliveryCheck.minOrder fallback till
      // restaurantSettings.minOrderAmount). Vi använder den, inte restaurang-
      // settings direkt, så min stämmer med zonen kunden levereras till.
      if (subtotal < minOrder && !topUpToMinimum) {
        Alert.alert(t('cart.errors.minimumOrder'), t('cart.summary.minimum', { amount: minOrder }));
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
              primary: toStripeHex(palette.gold),
              background: toStripeHex(palette.bg),
              componentBackground: toStripeHex(palette.panel),
              componentBorder: "#E8DFD1",
              primaryText: toStripeHex(palette.text),
              secondaryText: toStripeHex(palette.muted),
              componentText: toStripeHex(palette.text),
              placeholderText: "#A3998D",
              icon: toStripeHex(palette.text),
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
        customerEmail: formData.customerEmail || undefined,
        deliveryStreet: orderType === "DELIVERY" ? formData.deliveryStreet : undefined,
        deliveryZip: orderType === "DELIVERY" ? formData.deliveryZip : undefined,
        deliveryCity: orderType === "DELIVERY" ? formData.deliveryCity : undefined,
        deliveryInstructions: orderType === "DELIVERY" ? formData.deliveryInstructions || undefined : undefined,
        deliveryNote: effectiveTip > 0 ? `(Dricks gett: ${effectiveTip} kr i appen) ${formData.note || ""}`.trim() : formData.note || undefined,
        note: effectiveTip > 0 ? `(Dricks gett: ${effectiveTip} kr i appen) ${formData.note || ""}`.trim() : formData.note || undefined,
        tip: effectiveTip > 0 ? effectiveTip : undefined,
        minOrderTopUp: minOrderTopUp > 0 ? minOrderTopUp : undefined,
        stripePaymentIntentId: finalPaymentIntentId,
        discountCode: selectedPersonalDeal?.code || undefined,
        appliedDealId: undefined,
        // Referral / WELCOME deal — backend re-validates eligibility + min
        // order, freezes the discount on the order row, and flips the
        // UserDeal row to REDEEMED. Skicka inte med id om kunden inte
        // markerat toggle:n eller om en personal/BOGO-deal vunnit.
        userDealId: useUserDeal && userDealDiscount > 0 ? activeUserDeal?.id : undefined,
        restaurantId: currentRestaurantId || undefined,
        restaurantSlug: currentRestaurantSlug || undefined,
        lat: coords?.lat,
        lng: coords?.lng,
        scheduledFor: scheduledFor?.toISOString() || undefined,
        items: items.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
          note: item.note,
          // Backend förväntar sig fältet för att rabattera raden till 0 kr —
          // utan det räknas BOGO-gratisvaran som vanlig betald position.
          bogoFreeFromDealId: item.bogoFreeFromDealId,
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

          {/* Login prompt — soft, not blocking (paritet med web: visas högst upp
              i form-flödet så användaren ser fördelarna med konto innan checkout). */}
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

          {/* 3. Customer Info — namn, telefon, e-post (paritet med web) */}
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
              <TextInput
                style={styles.input}
                placeholder="E-post (valfritt)"
                placeholderTextColor={palette.muted}
                keyboardType="email-address"
                autoCapitalize="none"
                value={formData.customerEmail}
                onChangeText={(value) => setFormData((v) => ({ ...v, customerEmail: value }))}
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

          {/* 5. Notes (extranotering) — fristående för paritet med web cart */}
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
          </View>

          {/* 6. Tipping Section — wider, full-bleed within scroll padding.
              Web-paritet: presets [0, 10, 20, 30] + "Annat…" som öppnar fri input. */}
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
              <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
                {[0, 10, 20, 30].map((amt) => {
                  const isActive = !showCustomTipInput && tipAmount === amt;
                  return (
                    <ScalePressable
                      key={amt}
                      onPress={() => {
                        setShowCustomTipInput(false);
                        setCustomTipText("");
                        setTipAmount(amt);
                      }}
                      style={{
                        flexGrow: 1,
                        flexBasis: 0,
                        minWidth: 60,
                        backgroundColor: isActive ? palette.gold : palette.panelMuted,
                        borderWidth: 1,
                        borderColor: isActive ? palette.gold : palette.border,
                        borderRadius: 14,
                        paddingVertical: 14,
                        alignItems: "center",
                      }}
                    >
                      <Text style={{ color: isActive ? "#000" : palette.text, fontWeight: "900", fontSize: 12 }}>
                        {amt === 0 ? t('cart.tip.none') : `+${amt} kr`}
                      </Text>
                    </ScalePressable>
                  );
                })}
                <ScalePressable
                  onPress={() => {
                    const next = !showCustomTipInput;
                    setShowCustomTipInput(next);
                    if (next) {
                      setCustomTipText(tipAmount > 0 ? String(tipAmount) : "");
                    } else {
                      setCustomTipText("");
                      setTipAmount(0);
                    }
                  }}
                  style={{
                    flexGrow: 1,
                    flexBasis: 0,
                    minWidth: 60,
                    backgroundColor: showCustomTipInput ? palette.gold : palette.panelMuted,
                    borderWidth: 1,
                    borderColor: showCustomTipInput ? palette.gold : palette.border,
                    borderRadius: 14,
                    paddingVertical: 14,
                    alignItems: "center",
                  }}
                >
                  <Text style={{ color: showCustomTipInput ? "#000" : palette.text, fontWeight: "900", fontSize: 12 }}>
                    Annat…
                  </Text>
                </ScalePressable>
              </View>
              {showCustomTipInput && (
                <View style={{ marginTop: 12, position: "relative" }}>
                  <TextInput
                    style={[styles.input, { paddingRight: 44 }]}
                    placeholder="Eget belopp i kr"
                    placeholderTextColor={palette.muted}
                    keyboardType="numeric"
                    value={customTipText}
                    onChangeText={(raw) => {
                      const digits = raw.replace(/[^0-9]/g, "");
                      setCustomTipText(digits);
                      const parsed = digits === "" ? 0 : parseInt(digits, 10);
                      setTipAmount(Number.isFinite(parsed) ? Math.max(0, parsed) : 0);
                    }}
                  />
                  <Text style={{ position: "absolute", right: 16, top: "50%", marginTop: -7, color: palette.muted, fontSize: 10, fontWeight: "900", textTransform: "uppercase", letterSpacing: ls(1.5) }}>kr</Text>
                </View>
              )}
            </View>
          )}

          {/* 7. Promo Code — integrerad rad med Tag-ikon, paritet med web. */}
          <View style={[styles.formCard, { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 14 }]}>
            <Ionicons name="pricetag-outline" size={16} color={palette.gold} style={{ opacity: selectedPersonalDeal ? 1 : 0.5 }} />
            <TextInput
              style={[styles.input, { flex: 1, marginBottom: 0, paddingVertical: 12 }]}
              placeholder={selectedPersonalDeal ? "Tillämpad" : t('cart.inputs.promo')}
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
                paddingHorizontal: 20,
                paddingVertical: 12,
                justifyContent: "center",
                borderRadius: 14,
              }}
            >
              <Text style={{ color: selectedPersonalDeal ? "#fff" : "#000", fontWeight: "900", textTransform: "uppercase", fontSize: 10 }}>
                {selectedPersonalDeal ? t('cart.promo.remove') : t('cart.promo.check')}
              </Text>
            </Pressable>
          </View>

          {/* 7b. Personal deals — horizontal scroller (RN-specifik, ingen
              motsvarighet i web cart men kvar enligt user request "behåll funktioner"). */}
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

          {/* 8. Min-order top-up banner — paritet med web. När subtotal < minimum
              kan kunden kryssa i för att betala mellanskillnaden så ordern kan slutföras.
              Default på (samma som web) men kunden kan koppla av för att avbryta.
              OBS: minOrder är zone-aware (deliveryCheck.minOrder fallback till
              restaurantSettings.minOrderAmount) — kunden ser zonens minimum
              för den adress de levereras till, inte restaurangens default. */}
          {subtotal > 0 && subtotal < minOrder && (
            <View
              style={{
                marginTop: 4,
                borderRadius: 16,
                paddingHorizontal: 14,
                paddingVertical: 12,
                borderWidth: 1,
                backgroundColor: topUpToMinimum ? "rgba(231,178,75,0.08)" : "rgba(239,68,68,0.08)",
                borderColor: topUpToMinimum ? "rgba(231,178,75,0.30)" : "rgba(239,68,68,0.30)",
              }}
            >
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <Text style={{ color: topUpToMinimum ? palette.gold : palette.danger, fontSize: 10, fontWeight: "900", textTransform: "uppercase", letterSpacing: ls(1.5), flex: 1 }}>
                  {topUpToMinimum
                    ? `Komplettering +${Math.round(minOrder - subtotal)} kr till minimum`
                    : `Saknar ${Math.round(minOrder - subtotal)} kr till minimum`}
                </Text>
                <Text style={{ color: topUpToMinimum ? palette.gold : palette.danger, fontSize: 10, fontWeight: "900" }}>
                  {Math.round(subtotal)} / {Math.round(minOrder)} kr
                </Text>
              </View>
              {/* Progress bar */}
              <View style={{ height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.07)", overflow: "hidden", marginBottom: 10 }}>
                <View
                  style={{
                    height: "100%",
                    width: `${Math.min((subtotal / minOrder) * 100, 100)}%`,
                    backgroundColor: topUpToMinimum ? palette.gold : palette.danger,
                    borderRadius: 3,
                  }}
                />
              </View>
              <Pressable
                onPress={() => setTopUpToMinimum((v) => !v)}
                style={{ flexDirection: "row", alignItems: "center", gap: 10 }}
              >
                <View
                  style={{
                    width: 18, height: 18, borderRadius: 5,
                    backgroundColor: topUpToMinimum ? palette.gold : "transparent",
                    borderWidth: 1.5,
                    borderColor: topUpToMinimum ? palette.gold : palette.muted,
                    alignItems: "center", justifyContent: "center",
                  }}
                >
                  {topUpToMinimum && <Ionicons name="checkmark" size={12} color="#000" />}
                </View>
                <Text style={{ color: palette.muted, fontSize: 10, fontWeight: "700", flex: 1, lineHeight: 14 }}>
                  Betala mellanskillnaden ({Math.round(minOrder - subtotal)} kr) så ordern kan slutföras
                </Text>
              </Pressable>
            </View>
          )}

          {/* 8b. BOGO — banner om gratisvara ej vald, annars chosen-display.
              Speglar apps/web/app/cart/page.tsx ~1540-1582. Visas bara när
              servern returnerar en BOGO-deal (isBogo: true). */}
          {bogoPreview && !bogoChoice && bogoPreview.rewardProducts.length > 0 && (
            <Pressable
              onPress={() => setShowBogoPicker(true)}
              style={{
                marginTop: 14,
                borderRadius: 18,
                borderWidth: 1,
                borderColor: "rgba(16,185,129,0.30)",
                backgroundColor: "rgba(16,185,129,0.08)",
                paddingHorizontal: 16,
                paddingVertical: 14,
                flexDirection: "row",
                alignItems: "center",
                gap: 10,
              }}
            >
              <Text style={{ fontSize: 18 }}>🎁</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ color: "#10B981", fontSize: 10, fontWeight: "900", letterSpacing: ls(2), textTransform: "uppercase" }}>
                  BOGO — välj gratisprodukt
                </Text>
                <Text style={{ color: palette.textSecondary, fontSize: 12, fontWeight: "700", marginTop: 2 }}>
                  Du har inte valt din gratis
                  {bogoPreview.rewardCategoryName ? ` ${bogoPreview.rewardCategoryName.toLowerCase()}` : " produkt"} →
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color="#10B981" />
            </Pressable>
          )}
          {bogoChoice && (
            <View
              style={{
                marginTop: 14,
                borderRadius: 18,
                borderWidth: 1,
                borderColor: "rgba(16,185,129,0.30)",
                backgroundColor: "rgba(16,185,129,0.08)",
                paddingHorizontal: 16,
                paddingVertical: 12,
                flexDirection: "row",
                alignItems: "center",
                gap: 10,
              }}
            >
              <Text style={{ fontSize: 18 }}>🎁</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ color: "#10B981", fontSize: 10, fontWeight: "900", letterSpacing: ls(2), textTransform: "uppercase" }}>
                  Gratisprodukt vald
                </Text>
                <Text style={{ color: palette.textSecondary, fontSize: 12, fontWeight: "700", marginTop: 2 }}>
                  {bogoChoice.product.name}
                </Text>
              </View>
              <Pressable onPress={() => setShowBogoPicker(true)} hitSlop={6}>
                <Text style={{ color: "#10B981", fontSize: 10, fontWeight: "900", letterSpacing: ls(1) }}>Ändra</Text>
              </Pressable>
            </View>
          )}

          {/* 8c. Referral / WELCOME user-deal — toggle som applicerar dealen
              (procent/kr/fri leverans) på ordern. Backend kontrollerar
              fortfarande min-order vid /api/orders. När markerad skickas
              userDealId med i payloaden. Visas BARA om dealen har ett
              giltigt värde (annars är admin-mallen trasig och vi skulle
              visa "Använd kr rabatt" med tom siffra). */}
          {activeUserDeal && userDealHasValue && !selectedPersonalDeal && (
            <Pressable
              onPress={() => userDealEligible && setUseUserDeal((v) => !v)}
              disabled={!userDealEligible}
              style={{
                marginTop: 14,
                borderRadius: 18,
                borderWidth: 1,
                borderColor: useUserDeal && userDealEligible
                  ? "rgba(231,178,75,0.45)"
                  : "rgba(231,178,75,0.20)",
                backgroundColor: useUserDeal && userDealEligible
                  ? "rgba(231,178,75,0.12)"
                  : "rgba(231,178,75,0.04)",
                paddingHorizontal: 16,
                paddingVertical: 14,
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
                opacity: userDealEligible ? 1 : 0.65,
              }}
            >
              <Text style={{ fontSize: 18 }}>🎁</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ color: palette.gold, fontSize: 10, fontWeight: "900", letterSpacing: ls(2), textTransform: "uppercase" }}>
                  {activeUserDeal.type === "WELCOME"
                    ? t('cart.deal.welcomeKicker').toUpperCase()
                    : t('cart.deal.referralKicker').toUpperCase()}
                </Text>
                <Text style={{ color: palette.text, fontSize: 13, fontWeight: "800", marginTop: 2 }}>
                  Använd {userDealLabel}
                </Text>
                {!userDealEligible && userDealMinOrderKr > 0 && (
                  <Text style={{ color: palette.muted, fontSize: 10, fontWeight: "700", marginTop: 3 }}>
                    {t('cart.deal.minOrderHint', { amount: userDealMinOrderKr })}
                  </Text>
                )}
              </View>
              <View
                style={{
                  width: 22, height: 22, borderRadius: 6,
                  backgroundColor: useUserDeal && userDealEligible ? palette.gold : "transparent",
                  borderWidth: 1.5,
                  borderColor: useUserDeal && userDealEligible ? palette.gold : palette.muted,
                  alignItems: "center", justifyContent: "center",
                }}
              >
                {useUserDeal && userDealEligible && <Ionicons name="checkmark" size={14} color="#000" />}
              </View>
            </Pressable>
          )}

          {/* 9. Summary — paritet med web: Delsumma → Leveransavgift → Dricks →
              Komplettering → Rabatt → Moms (alla rader ovanför) → TOTALT. */}
          <View style={[styles.formCard, { backgroundColor: "transparent", borderWidth: 0, paddingHorizontal: 4, borderTopWidth: 1, borderTopColor: palette.border, borderRadius: 0, marginTop: 4, paddingTop: 20 }]}>
            <View style={{ gap: 8 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={{ color: palette.muted, fontWeight: "800", textTransform: "uppercase", fontSize: 11, letterSpacing: ls(0.5) }}>{t('cart.summary.subtotal')}</Text>
                <Text style={{ color: palette.text, fontWeight: "900", fontSize: 11 }}>{Math.round(subtotal)} KR</Text>
              </View>
              {orderType === "DELIVERY" && (
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={{ color: palette.muted, fontWeight: "800", textTransform: "uppercase", fontSize: 11, letterSpacing: ls(0.5) }}>{t('cart.summary.deliveryFee')}</Text>
                  <Text style={{ color: palette.gold, fontWeight: "900", fontSize: 11 }}>{Math.round(deliveryFee)} KR</Text>
                </View>
              )}
              {effectiveTip > 0 && (
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={{ color: palette.gold, fontWeight: "800", textTransform: "uppercase", fontSize: 11, letterSpacing: ls(0.5) }}>{t('cart.summary.tip')}</Text>
                  <Text style={{ color: palette.gold, fontWeight: "900", fontSize: 11 }}>+{Math.round(effectiveTip)} KR</Text>
                </View>
              )}
              {minOrderTopUp > 0 && (
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={{ color: palette.muted, fontWeight: "800", textTransform: "uppercase", fontSize: 11, letterSpacing: ls(0.5) }}>Komplettering till minimum</Text>
                  <Text style={{ color: palette.gold, fontWeight: "900", fontSize: 11 }}>+{Math.round(minOrderTopUp)} KR</Text>
                </View>
              )}
              {bogoPreview && bogoDiscount > 0 && bogoDiscount >= finalDiscount && (
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={{ color: "#10B981", fontWeight: "800", textTransform: "uppercase", fontSize: 11, letterSpacing: ls(0.5), fontStyle: "italic" }} numberOfLines={1}>
                    🎁 {bogoChoice ? bogoChoice.product.name : bogoPreview.dealTitle}
                  </Text>
                  <Text style={{ color: "#10B981", fontWeight: "900", fontSize: 11, fontStyle: "italic" }}>-{Math.round(bogoDiscount)} KR</Text>
                </View>
              )}
              {personalDiscount > 0 && (!bogoPreview || bogoDiscount < finalDiscount) && (
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={{ color: palette.success, fontWeight: "800", textTransform: "uppercase", fontSize: 11, letterSpacing: ls(0.5), fontStyle: "italic" }}>{t('cart.summary.discount')}</Text>
                  <Text style={{ color: palette.success, fontWeight: "900", fontSize: 11, fontStyle: "italic" }}>-{Math.round(personalDiscount)} KR</Text>
                </View>
              )}
              {userDealDiscount > 0 && userDealDiscount >= finalDiscount && (
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={{ color: palette.gold, fontWeight: "800", textTransform: "uppercase", fontSize: 11, letterSpacing: ls(0.5), fontStyle: "italic" }} numberOfLines={1}>
                    🎁 {activeUserDeal?.type === "WELCOME"
                      ? t('cart.deal.welcomeKicker')
                      : t('cart.deal.referralKicker')}
                  </Text>
                  <Text style={{ color: palette.gold, fontWeight: "900", fontSize: 11, fontStyle: "italic" }}>-{Math.round(userDealDiscount)} KR</Text>
                </View>
              )}
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={{ color: palette.muted, fontWeight: "800", textTransform: "uppercase", fontSize: 11, letterSpacing: ls(0.5) }}>{t('cart.vatIncluded', { rate: 6 })}</Text>
                <Text style={{ color: palette.muted, fontWeight: "700", fontSize: 11 }}>{Math.round(total * 6 / 106)} kr</Text>
              </View>
            </View>

            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginTop: 20 }}>
              <Text style={{ color: palette.text, fontSize: 34, fontWeight: "900", fontStyle: "italic", textTransform: "uppercase", letterSpacing: -1.2 }}>{t('cart.summary.total')}</Text>
              <Text style={{ color: palette.gold, fontSize: 48, fontWeight: "900", fontStyle: "italic", letterSpacing: -1 }}>
                {Math.round(total)} <Text style={{ fontSize: 14, fontStyle: "normal", opacity: 0.6 }}>SEK</Text>
              </Text>
            </View>

            {/* Guest info banner — låg-intensitet, visas precis ovanför CTA
                (paritet med web cart: "Du handlar som gäst…"). Login-prompten
                högre upp är den primära; den här är en mjuk påminnelse. */}
            {!token && (
              <View style={{ marginTop: 18, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 16, backgroundColor: palette.panelMuted, borderWidth: 1, borderColor: palette.border, flexDirection: "row", alignItems: "center", gap: 10 }}>
                <Ionicons name="person-outline" size={14} color={palette.muted} />
                <Text style={{ flex: 1, color: palette.muted, fontSize: 10, fontWeight: "700", lineHeight: 14 }}>
                  Du handlar som gäst. <Text style={{ color: palette.gold, fontWeight: "900" }} onPress={openProfile}>Logga in</Text> för sparade adresser och personliga erbjudanden.
                </Text>
              </View>
            )}

            <PrimaryButton
              label={
                submitting
                  ? t('cart.submittingBtn')
                  : (subtotal > 0 && subtotal < minOrder && !topUpToMinimum)
                    ? `Köp för ${Math.round(minOrder - subtotal)} kr till`
                    : t('cart.checkoutBtn', { amount: Math.round(total) })
              }
              onPress={handleCheckoutPress}
              disabled={
                submitting
                || !restaurantSettings.isOpen
                || (subtotal > 0 && subtotal < minOrder && !topUpToMinimum)
              }
              icon="checkmark-circle-outline"
              style={{ marginTop: 22, paddingVertical: 19 }}
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

      {/* BOGO picker — visas över kassan när användaren trycker på banner /
          "Ändra"-knappen i chosen-display. Renderas alltid men styrs av
          `visible` så vi får mount-stable fade/slide-animation.
          Vid val: hämta full produkt (med extras) och öppna ProductModal så
          användaren kan välja tillval. Matchar web's MenuContent.tsx flöde. */}
      <BogoPickerModal
        visible={showBogoPicker && !!bogoPreview && bogoPreview.rewardProducts.length > 0}
        dealId={bogoPreview?.dealId ?? ""}
        dealTitle={bogoPreview?.dealTitle ?? ""}
        restaurantId={currentRestaurantId || ""}
        restaurantSlug={currentRestaurantSlug}
        rewardCategoryName={bogoPreview?.rewardCategoryName ?? null}
        products={bogoPreview?.rewardProducts ?? []}
        onClose={() => setShowBogoPicker(false)}
        onSelectProduct={async (p) => {
          if (!bogoPreview?.dealId) return;
          // Snapshotta context innan vi stänger pickern — bogoPreview kan
          // hinna uppdateras under fetch (t.ex. om en quantity-knapp klickas).
          const dealId = bogoPreview.dealId;
          const dealTitle = bogoPreview.dealTitle;
          const rewardCategoryName = bogoPreview.rewardCategoryName;
          const excludedExtraIds = bogoPreview.bogoExcludedExtraIds;
          setBogoFetching(true);
          setShowBogoPicker(false);
          try {
            const res = await api.get(`/api/menu/products/${p.id}`);
            const fullProduct: MenuProduct = res.data;
            setBogoSelectedProduct({
              product: fullProduct,
              dealId,
              dealTitle,
              rewardCategoryName,
              excludedExtraIds,
            });
          } catch (err) {
            // Fallback: direkt-tillägg utan extras (gammal beteende) så
            // kunden inte fastnar pga nätverksfel. Matchar produktens
            // pris/restaurant ur BogoPickerProduct + currentRestaurantId.
            Alert.alert("Kunde inte ladda produktinformation", "Lägger till gratisvaran utan tillval.");
            const slug = currentRestaurantSlug ?? null;
            addItem({
              productId: p.id,
              restaurantId: currentRestaurantId || "",
              restaurantSlug: slug,
              name: p.name,
              price: 0,
              quantity: 1,
              extras: [],
              bogoFreeFromDealId: dealId,
            });
            setBogoChoice({
              dealId,
              dealTitle,
              rewardCategoryName,
              product: { id: p.id, name: p.name, price: p.price, imageUrl: p.imageUrl ?? null },
            });
          } finally {
            setBogoFetching(false);
          }
        }}
      />

      {/* BOGO-produktmodal — öppnas efter att kunden valt en gratisprodukt i
          pickern. Baspris nollas, extras betalas normalt, blockerade extras
          filtreras bort enligt deal-config. */}
      {bogoSelectedProduct && (
        <ProductModal
          product={bogoSelectedProduct.product}
          address={storeAddress}
          orderType={orderType}
          bogoFreeFromDealId={bogoSelectedProduct.dealId}
          bogoDealTitle={bogoSelectedProduct.dealTitle}
          bogoRewardCategoryName={bogoSelectedProduct.rewardCategoryName}
          bogoExcludedExtraIds={bogoSelectedProduct.excludedExtraIds}
          onClose={() => setBogoSelectedProduct(null)}
          onAdd={(payload) => {
            const ctx = bogoSelectedProduct;
            if (!ctx) return;
            const slug = currentRestaurantSlug ?? null;
            addItem({
              productId: ctx.product.id,
              restaurantId: currentRestaurantId || "",
              restaurantSlug: slug,
              name: ctx.product.name,
              // Baspris = 0; extras bär sina egna priser i payload.extras.
              price: 0,
              quantity: payload.quantity,
              extras: payload.extras,
              note: payload.note,
              bogoFreeFromDealId: ctx.dealId,
            });
            setBogoChoice({
              dealId: ctx.dealId,
              dealTitle: ctx.dealTitle,
              rewardCategoryName: ctx.rewardCategoryName,
              product: {
                id: ctx.product.id,
                name: ctx.product.name,
                price: ctx.product.price,
                imageUrl: ctx.product.imageUrl ?? null,
              },
            });
            setBogoSelectedProduct(null);
          }}
        />
      )}

      {/* Loading-indikator medan vi hämtar produktdata mellan picker och modal. */}
      {bogoFetching && (
        <Modal visible transparent statusBarTranslucent animationType="fade">
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.35)" }}>
            <View
              style={{
                paddingHorizontal: 22,
                paddingVertical: 18,
                borderRadius: 18,
                backgroundColor: palette.bgSecondary,
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: palette.borderMuted,
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
              }}
            >
              <ActivityIndicator color={palette.gold} />
              <Text style={{ color: palette.text, fontWeight: "800", fontSize: 12 }}>
                Hämtar produkt...
              </Text>
            </View>
          </View>
        </Modal>
      )}
    </ScrollView>
  );
}
