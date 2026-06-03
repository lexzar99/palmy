import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Clipboard,
  Easing,
  Image,
  Platform,
  Pressable,
  Share,
  Text,
  TextInput,
  View,
  Modal,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as AppleAuthentication from "expo-apple-authentication";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAppStore } from "../store/useAppStore";
import { useRestartApp } from "../contexts/restart";
import { useGoogleAuth } from "../hooks/useGoogleAuth";
import { useAppleAuth } from "../hooks/useAppleAuth";
import { api } from "../lib/api";
import { APP_AUTH_CALLBACK_URL, isAuthRedirectUrl, parseAuthRedirect } from "../lib/authRedirect";
import { getScreenCache, setScreenCache } from "../lib/screenCache";
import { supabase } from "../lib/supabase";
import { useSharedStyles, useTheme } from "../theme";
import { ScreenWrap, PrimaryButton } from "../components/ui";
import DpointsSection from "../components/DpointsSection";
import DpointsSponsorBanner from "../components/DpointsSponsorBanner";
import { ProfileScreenSkeleton } from "../components/SkeletonLoader";

import type { Order, Profile, SavedAddress } from "../types";
import {
  type QuickAddress,
  formatQuickAddress,
  readQuickAddresses,
  removeQuickAddress,
  setDefaultQuickAddress,
} from "../lib/quickAddresses";
import AddressModal from "../components/AddressModal";
import { useTranslation } from 'react-i18next';
import { useLanguage } from '../hooks/useLanguage';
import { useArabic } from '../hooks/useArabic';
import { useAppSettings } from '../hooks/useAppSettings';



const SUPABASE_REDIRECT_URL = APP_AUTH_CALLBACK_URL;

const COUNTRY_CODES = [
  { code: "+46", flag: "🇸🇪", name: "Sweden" },
  { code: "+45", flag: "🇩🇰", name: "Denmark" },
  { code: "+47", flag: "🇳🇴", name: "Norway" },
  { code: "+358", flag: "🇫🇮", name: "Finland" },
  { code: "+44", flag: "🇬🇧", name: "UK" },
  { code: "+1", flag: "🇺🇸", name: "USA" },
];


type PersonalDeal = {
  id?: string;
  code: string;
  campaign?: {
    title?: string;
    discountType?: string;
    discountValue?: number;
    minOrder?: number;
  } | null;
};

type ProfileScreenCache = {
  profile: Profile | null;
  orders: Order[];
  deals: PersonalDeal[];
  savedAddresses: SavedAddress[];
  editName: string;
  editEmail: string;
};

export default function ProfileScreen({
  openRegister,
  openForgotPassword,
  openOrder,
  openCart,
  openDeal,
}: {
  openRegister: (initialPhone?: string) => void;
  // openEmailLogin is no longer used — email/password is now inline in the
  // guest view (mirrors web /profile). Kept off the type so callers stop
  // passing it; the route still exists in App.tsx for legacy deep links.
  openForgotPassword?: () => void;
  openOrder: (id: string) => void;
  openCart: () => void;
  openDeal?: (id: string) => void;
}) {
  const { palette } = useTheme();
  const styles = useSharedStyles();
  const token = useAppStore((s) => s.token);
  const setToken = useAppStore((s) => s.setToken);
  const profile = useAppStore((s) => s.profile);
  const setProfile = useAppStore((s) => s.setProfile);
  const clearSession = useAppStore((s) => s.clearSession);
  const { t } = useTranslation();
  const { currentLanguage, changeLanguage } = useLanguage();
  const { ls } = useArabic();
  const { settings: appSettings } = useAppSettings();
  const [langPickerOpen, setLangPickerOpen] = useState(false);
  const [sentryTestCrash, setSentryTestCrash] = useState(false);
  if (sentryTestCrash) {
    throw new Error("Sentry test crash @ " + new Date().toISOString());
  }
  const addItem = useAppStore((s) => s.addItem);
  const clearCart = useAppStore((s) => s.clearCart);
  const deliveryAddress = useAppStore((s) => s.deliveryAddress);
  const setDeliveryAddress = useAppStore((s) => s.setDeliveryAddress);
  const themePreference = useAppStore((s) => s.themePreference);
  const setThemePreference = useAppStore((s) => s.setThemePreference);
  const setOnboardingComplete = useAppStore((s) => s.setOnboardingComplete);
  const setBogoChoice = useAppStore((s) => s.setBogoChoice);
  const restartApp = useRestartApp();
  const cacheKey = token || "__guest__";
  const cachedData = token ? getScreenCache<ProfileScreenCache>("profile", cacheKey) : null;
  const initialProfileFetchShouldShowLoader = useRef(!cachedData).current;

  const [orders, setOrders] = useState<Order[]>(() => cachedData?.orders || []);
  const [deals, setDeals] = useState<PersonalDeal[]>(() => cachedData?.deals || []);
  // Claimade deals (från popup-builder) + globala broadcast-deals.
  const [claimedDeals, setClaimedDeals] = useState<any[]>([]);
  const [availableDeals, setAvailableDeals] = useState<any[]>([]);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [savedAddresses, setSavedAddresses] = useState<SavedAddress[]>(() => cachedData?.savedAddresses || []);
  const [pageLoading, setPageLoading] = useState(() => (token ? !cachedData : false));
  const [authLoading, setAuthLoading] = useState(false);
  const [loginError, setLoginError] = useState("");
  // Email + password inline login (mirrors web's profile login form).
  const [loginIdentifier, setLoginIdentifier] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [socialLoading, setSocialLoading] = useState<"google" | "apple" | null>(null);
  // Apple-name gate (only fires when /api/profile.needsName === true).
  const [showAddName, setShowAddName] = useState(false);
  const [addFirstName, setAddFirstName] = useState("");
  const [addLastName, setAddLastName] = useState("");
  const [addNameSaving, setAddNameSaving] = useState(false);
  const [addNameError, setAddNameError] = useState("");
  const [activeTab, setActiveTab] = useState<"overview" | "orders" | "settings" | "deals" | "addresses">("overview");
  // Referral system state — fetched alongside profile data, NOT cached on
  // disk because the stats change as friends sign up / order.
  // locked = true tills user gjort sin första betalda order. deal = den
  // valda mallen (kan vara null om admin inte konfigurerat).
  const [referral, setReferral] = useState<{
    locked: boolean;
    code: string | null;
    shareUrl: string | null;
    enabled: boolean;
    rewardKr?: number | null;
    rewardLabel: string;
    couponsPerSide?: number;
    deal: {
      title: string;
      discountType: string;
      discountPercent: number | null;
      amountKr: number | null;
      freeDelivery: boolean;
      minOrderKr: number;
      validUntil: string | null;
    } | null;
    stats: { invited: number; registered: number; ordered: number; totalEarnedKr: number };
  } | null>(null);
  const [referralCopied, setReferralCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(() => cachedData?.editName || profile?.name || "");
  const [editEmail, setEditEmail] = useState(() => cachedData?.editEmail || profile?.email || "");
  const [editPhoneCountry, setEditPhoneCountry] = useState("+46");
  const [editPhone, setEditPhone] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingPhone, setIsSavingPhone] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [quickAddresses, setQuickAddresses] = useState<QuickAddress[]>([]);
  const [addrModalOpen, setAddrModalOpen] = useState(false);
  const setStoreAddress = useAppStore((s) => s.setAddress);
  const [reorderingId, setReorderingId] = useState<string | null>(null);

  // Native Google + Apple OAuth
  const { prompt: googlePrompt, tokenResult: googleResult, error: googleError } = useGoogleAuth();
  const { prompt: applePrompt, tokenResult: appleResult, error: appleError } = useAppleAuth();

  // Guest view entrance animations
  const guestIconOpacity = useRef(new Animated.Value(0)).current;
  const guestIconScale = useRef(new Animated.Value(0.78)).current;
  const guestIconBreath = useRef(new Animated.Value(1)).current;
  const guestRingScale = useRef(new Animated.Value(0.55)).current;
  const guestRingOpacity = useRef(new Animated.Value(0.85)).current;
  const guestTitle1Opacity = useRef(new Animated.Value(0)).current;
  const guestTitle1Y = useRef(new Animated.Value(24)).current;
  const guestTitle2Opacity = useRef(new Animated.Value(0)).current;
  const guestTitle2Y = useRef(new Animated.Value(24)).current;
  const guestSubOpacity = useRef(new Animated.Value(0)).current;
  const guestCardOpacity = useRef(new Animated.Value(0)).current;
  const guestCardY = useRef(new Animated.Value(48)).current;
  const googleGuestScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (token && profile) return;

    guestIconOpacity.setValue(0);
    guestIconScale.setValue(0.78);
    guestIconBreath.setValue(1);
    guestRingScale.setValue(0.55);
    guestRingOpacity.setValue(0.85);
    guestTitle1Opacity.setValue(0);
    guestTitle1Y.setValue(24);
    guestTitle2Opacity.setValue(0);
    guestTitle2Y.setValue(24);
    guestSubOpacity.setValue(0);
    guestCardOpacity.setValue(0);
    guestCardY.setValue(48);

    Animated.parallel([
      Animated.timing(guestIconOpacity, { toValue: 1, duration: 430, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(guestIconScale, { toValue: 1, duration: 580, easing: Easing.out(Easing.back(1.3)), useNativeDriver: true }),
    ]).start(() => {
      Animated.loop(
        Animated.sequence([
          Animated.timing(guestIconBreath, { toValue: 1.06, duration: 1800, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
          Animated.timing(guestIconBreath, { toValue: 1, duration: 1800, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        ])
      ).start();
    });

    Animated.parallel([
      Animated.timing(guestRingScale, { toValue: 2.0, duration: 950, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(guestRingOpacity, { toValue: 0, duration: 950, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    ]).start();

    Animated.sequence([
      Animated.delay(160),
      Animated.parallel([
        Animated.timing(guestTitle1Opacity, { toValue: 1, duration: 400, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(guestTitle1Y, { toValue: 0, duration: 400, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]),
    ]).start();

    Animated.sequence([
      Animated.delay(270),
      Animated.parallel([
        Animated.timing(guestTitle2Opacity, { toValue: 1, duration: 400, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(guestTitle2Y, { toValue: 0, duration: 400, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]),
    ]).start();

    Animated.sequence([
      Animated.delay(380),
      Animated.timing(guestSubOpacity, { toValue: 1, duration: 350, useNativeDriver: true }),
    ]).start();

    Animated.sequence([
      Animated.delay(420),
      Animated.parallel([
        Animated.timing(guestCardOpacity, { toValue: 1, duration: 460, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(guestCardY, { toValue: 0, duration: 460, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]),
    ]).start();

    return () => { guestIconBreath.stopAnimation(); };
  }, [token, profile]);

  // Google/Apple sign-in completed. OAuth users without a phone land on the
  // profile and can add it via the settings → edit profile form (which calls
  // /api/profile/link-phone directly — no OTP).
  const handleSocialAuthResult = useCallback((result: { token: string; user: any }) => {
    setSocialLoading(null);
    setToken(result.token);
    setProfile(result.user);
    if (result.user?.needsName) {
      setShowAddName(true);
      return;
    }
    if (result.user?.needsPhone) {
      setActiveTab("settings");
      setIsEditing(true);
    }
    fetchProfileData(result.token);
  }, [setToken, setProfile]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAddName = useCallback(async () => {
    const first = addFirstName.trim();
    const last = addLastName.trim();
    if (!first) { setAddNameError("Ange ditt förnamn"); return; }
    if (!last) { setAddNameError("Ange ditt efternamn"); return; }
    if (!token) { setAddNameError("Sessionen tappades"); return; }
    setAddNameError("");
    setAddNameSaving(true);
    try {
      await api.patch(
        "/api/profile",
        { firstName: first, lastName: last, name: `${first} ${last}` },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const profileRes = await api.get("/api/profile", { headers: { Authorization: `Bearer ${token}` } });
      setProfile(profileRes.data);
      setShowAddName(false);
      setAddFirstName("");
      setAddLastName("");
      if (profileRes.data?.needsPhone) {
        setActiveTab("settings");
        setIsEditing(true);
      }
      fetchProfileData(token);
    } catch (e: any) {
      setAddNameError(e.response?.data?.error || e.message || "Kunde inte spara namn");
    } finally {
      setAddNameSaving(false);
    }
  }, [addFirstName, addLastName, token, setProfile]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (googleResult) handleSocialAuthResult(googleResult);
  }, [googleResult]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (googleError) {
      setSocialLoading(null);
      if (googleError !== "__cancelled__") setLoginError(googleError);
    }
  }, [googleError]);

  useEffect(() => {
    if (appleResult) handleSocialAuthResult(appleResult);
  }, [appleResult]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (appleError) {
      setSocialLoading(null);
      if (appleError !== "__cancelled__") setLoginError(appleError);
    }
  }, [appleError]);

  const getAuthHeaders = useCallback(
    (authToken: string) => ({ Authorization: `Bearer ${authToken}` }),
    []
  );

  const normalizePhone = useCallback((value: string) => value.replace(/\D/g, ""), []);

  const buildInternationalPhone = useCallback(
    (selectedCountryCode: string, rawPhone: string) =>
      `${selectedCountryCode}${normalizePhone(rawPhone).replace(/^0/, "")}`,
    [normalizePhone]
  );

  const fetchProfileData = useCallback(
    async (authToken: string, { showLoader = true }: { showLoader?: boolean } = {}) => {
      if (showLoader) setPageLoading(true);
      try {
        const headers = getAuthHeaders(authToken);
        // Profile is the authoritative call — only an unauthorised response
        // here means the session is dead. The other three are best-effort
        // and must not nuke activeOrderId / log the user out if they fail
        // (that was clobbering the LiveOrderBanner mid-login).
        const profileRes = await api.get("/api/profile", { headers });
        const [ordersResR, dealsResR, addressResR, claimedResR, referralResR] = await Promise.allSettled([
          api.get("/api/profile/orders", { headers }),
          api.get("/api/profile/deals", { headers }),
          api.get("/api/profile/addresses", { headers }),
          api.get("/api/profile/claimed-deals", { headers }),
          api.get("/api/account/referral", { headers }),
        ]);
        const ordersRes = ordersResR.status === "fulfilled" ? ordersResR.value : { data: [] };
        const dealsRes = dealsResR.status === "fulfilled" ? dealsResR.value : { data: [] };
        const addressRes = addressResR.status === "fulfilled" ? addressResR.value : { data: [] };
        const claimedRes = claimedResR.status === "fulfilled" ? claimedResR.value : { data: { claimed: [], global: [] } };
        // Referral data is best-effort — if /api/account/referral fails the
        // section just doesn't render. We don't surface the error because the
        // rest of the profile is fully functional without it.
        // Referral payload har två shapes nu:
        //  - locked: true  → ingen kod än, men deal-info kan visas som teaser
        //  - locked: false → full payload med code + stats
        // Vi sätter alltid setReferral så lock-state kan rendera.
        const referralData = referralResR.status === "fulfilled" ? referralResR.value.data : null;
        if (referralData && typeof referralData === "object") {
          setReferral({
            locked: !!referralData.locked,
            code: referralData.code ?? null,
            shareUrl: referralData.shareUrl ?? null,
            enabled: !!referralData.enabled,
            rewardKr: referralData.rewardKr ?? null,
            rewardLabel: referralData.rewardLabel || "rabatt",
            couponsPerSide: referralData.couponsPerSide ?? 1,
            deal: referralData.deal ?? null,
            stats: referralData.stats || { invited: 0, registered: 0, ordered: 0, totalEarnedKr: 0 },
          });
        }

        const nextProfile = (profileRes.data || null) as any;
        setProfile(nextProfile);
        setOrders((ordersRes.data || []) as Order[]);
        setDeals((dealsRes.data || []) as PersonalDeal[]);
        setClaimedDeals([
          ...((claimedRes.data?.claimed || []) as any[]).map((d: any) => ({ ...d, _kind: "CLAIMED" })),
          ...((claimedRes.data?.global || []) as any[]).map((d: any) => ({ ...d, _kind: "GLOBAL" })),
        ]);
        setAvailableDeals((claimedRes.data?.available || []) as any[]);
        const addresses = (addressRes.data || []) as SavedAddress[];
        setSavedAddresses(addresses);

        // Sync default saved address into the delivery address slot so HomeScreen shows it
        const defaultAddr = addresses.find((a) => a.isDefault);
        if (defaultAddr && !deliveryAddress) {
          const fullStreet = [defaultAddr.street, defaultAddr.zip, defaultAddr.city].filter(Boolean).join(", ");
          const coords = defaultAddr.latitude && defaultAddr.longitude
            ? { lat: defaultAddr.latitude, lng: defaultAddr.longitude }
            : null;
          setDeliveryAddress(fullStreet, coords);
        }
        setEditName(nextProfile?.name || "");
        setEditEmail(nextProfile?.email || "");
        setScreenCache<ProfileScreenCache>("profile", authToken, {
          profile: nextProfile,
          orders: (ordersRes.data || []) as Order[],
          deals: (dealsRes.data || []) as PersonalDeal[],
          savedAddresses: (addressRes.data || []) as SavedAddress[],
          editName: nextProfile?.name || "",
          editEmail: nextProfile?.email || "",
        });
      } catch (err: any) {
        // Only clear the session if the profile call returned 401/403 — a
        // network blip or 5xx must not log the user out (and must not blank
        // out the active-order banner via clearSession).
        const status = err?.response?.status;
        if (status === 401 || status === 403) {
          clearSession();
          setOrders([]);
          setDeals([]);
          setSavedAddresses([]);
        }
      } finally {
        setPageLoading(false);
      }
    },
    [clearSession, getAuthHeaders, setProfile, setDeliveryAddress, deliveryAddress]
  );

  useEffect(() => {
    if (!token) {
      setPageLoading(false);
      setProfile(null);
      setOrders([]);
      setDeals([]);
      setSavedAddresses([]);
      setReferral(null);
      return;
    }
    fetchProfileData(token, { showLoader: initialProfileFetchShouldShowLoader }).catch(() => clearSession());
  }, [clearSession, fetchProfileData, setProfile, token]);

  const handleIncomingAuthUrl = useCallback(
    async (url: string | null) => {
      if (!url || !isAuthRedirectUrl(url)) return;
      const { error, token, accessToken, refreshToken } = parseAuthRedirect(url);
      if (error) {
        Alert.alert("Inloggning misslyckades", error);
        return;
      }

      if (accessToken && refreshToken) {
        const { data, error: sessionError } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (sessionError) {
          setLoginError(sessionError.message || "Kunde inte slutföra inloggningen.");
          return;
        }

        const nextToken = data.session?.access_token;
        if (!nextToken) return;
        setPageLoading(true);
        setLoginError("");
        setToken(nextToken);
        return;
      }

      const nextToken = token ?? accessToken;
      if (!nextToken) return;
      setPageLoading(true);
      setLoginError("");
      setToken(nextToken);
    },
    [setToken]
  );

  useEffect(() => {
    const subscription = Linking.addEventListener("url", ({ url }) => {
      handleIncomingAuthUrl(url).catch(() => {});
    });
    Linking.getInitialURL()
      .then((url) => handleIncomingAuthUrl(url))
      .catch(() => {});
    return () => subscription.remove();
  }, [handleIncomingAuthUrl]);

  useEffect(() => {
    if (activeTab === "addresses") {
      readQuickAddresses().then(setQuickAddresses);
    }
  }, [activeTab]);

  // Email + password login — mirrors web's POST /api/account/login-user flow
  // (apps/web/app/profile/page.tsx → handleEmailLogin). The backend route
  // accepts either email or phone in `identifier`. OAuth users without a
  // phone add it via settings → edit profile, which calls
  // /api/profile/link-phone directly (no OTP/SMS verification — see project
  // memory "OTP/SMS-verifiering är borttagen").
  const handleEmailLogin = useCallback(async () => {
    setLoginError("");
    const identifier = loginIdentifier.trim();
    if (!identifier) {
      setLoginError("Ange din e-post");
      return;
    }
    if (!loginPassword) {
      setLoginError("Ange ditt lösenord");
      return;
    }
    setAuthLoading(true);
    try {
      const { data } = await api.post("/api/account/login-user", {
        identifier,
        password: loginPassword,
      });
      const tok = data?.token;
      if (!tok) throw new Error("Ingen session mottogs");
      setToken(tok);
      try {
        const profileRes = await api.get("/api/profile", {
          headers: { Authorization: `Bearer ${tok}` },
        });
        setProfile(profileRes.data);
      } catch {
        if (data?.user) setProfile(data.user);
      }
      fetchProfileData(tok);
    } catch (e: any) {
      if (e?.response?.status === 401) {
        setLoginError("Felaktig email eller lösenord");
      } else {
        setLoginError(e?.response?.data?.error || e?.message || "Inloggning misslyckades");
      }
    } finally {
      setAuthLoading(false);
    }
  }, [loginIdentifier, loginPassword, setProfile, setToken]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSocialLogin = useCallback(
    async (provider: "google" | "apple") => {
      setSocialLoading(provider);
      if (provider === "google") {
        await googlePrompt();
      } else {
        await applePrompt();
      }
    },
    [googlePrompt, applePrompt]
  );

  const handleLogout = useCallback(async () => {
    // Rensa device-tokens från det utloggade kontot så push-notiser inte
    // fortsätter komma till denna enhet. Backend nollar pushToken +
    // apnsDeviceToken på user-raden. Fire-and-forget — om det misslyckas
    // (offline/timeout) hanteras dubletter ändå nästa gång någon loggar
    // in på samma enhet (token-deduplicering i /register).
    if (token) {
      api
        .post("/api/notifications/unregister", {}, { headers: getAuthHeaders(token) })
        .catch(() => null);
    }
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.warn("Supabase signout issue:", e);
    }
    clearSession();
    // Töm också varukorgen — annars ärver nästa inloggade användare
    // föregående användares cart-state (parity med web).
    clearCart();
    setOrders([]);
    setDeals([]);
    setSavedAddresses([]);
    setActiveTab("overview");
    setIsEditing(false);
    setLoginError("");
  }, [clearCart, clearSession, token]);

  const handleUpdateProfile = useCallback(async () => {
    if (!token || !profile) return;
    setIsSaving(true);
    try {
      await api.patch(
        "/api/profile",
        { name: editName.trim() || undefined, email: editEmail.trim() || null },
        { headers: getAuthHeaders(token) }
      );
      setProfile({ ...profile, name: editName.trim() || profile.name, email: editEmail.trim() || undefined });
      setSaveSuccess(true);
      setTimeout(() => { setSaveSuccess(false); setIsEditing(false); }, 1200);
    } catch (error: any) {
      Alert.alert("Kunde inte spara", error?.response?.data?.error || "Försök igen om en stund.");
    } finally {
      setIsSaving(false);
    }
  }, [editEmail, editName, getAuthHeaders, profile, setProfile, token]);

  const handleSavePhone = useCallback(async () => {
    if (!token || !profile) return;
    const raw = editPhone.trim();
    if (!raw) {
      Alert.alert("Telefonnummer krävs", "Ange ditt telefonnummer.");
      return;
    }
    const international = buildInternationalPhone(editPhoneCountry, raw);
    if (!normalizePhone(international)) {
      Alert.alert("Ogiltigt nummer", "Ange ett giltigt telefonnummer.");
      return;
    }
    setIsSavingPhone(true);
    try {
      const { data } = await api.post(
        "/api/profile/link-phone",
        { phone: international },
        { headers: getAuthHeaders(token) }
      );
      const nextUser = data?.user;
      if (nextUser) {
        setProfile({ ...profile, ...nextUser });
      } else {
        setProfile({ ...profile, phone: international });
      }
      setEditPhone("");
      Alert.alert("Sparat", "Telefonnumret har uppdaterats.");
    } catch (error: any) {
      Alert.alert(
        "Kunde inte spara telefon",
        error?.response?.data?.error || "Försök igen om en stund."
      );
    } finally {
      setIsSavingPhone(false);
    }
  }, [buildInternationalPhone, editPhone, editPhoneCountry, getAuthHeaders, normalizePhone, profile, setProfile, token]);

  const handleReorder = useCallback(
    async (orderId: string) => {
      if (!token) return;
      setReorderingId(orderId);
      try {
        const response = await api.get(`/api/profile/orders/${orderId}/reorder`, { headers: getAuthHeaders(token) });
        const reorderData = response.data;
        clearCart();
        for (const item of reorderData.items || []) {
          addItem({
            productId: item.productId,
            restaurantId: reorderData.restaurantId,
            restaurantSlug: reorderData.restaurantSlug || null,
            name: item.name,
            price: item.price,
            quantity: item.quantity,
            extras: item.extras || [],
            note: item.note || undefined,
          });
        }
        if (reorderData.unavailableItems?.length) {
          Alert.alert("Vissa produkter saknas", reorderData.unavailableItems.join(", "));
        }
        openCart();
      } catch (error: any) {
        Alert.alert("Kunde inte beställa igen", error?.response?.data?.error || "Försök igen om en stund.");
      } finally {
        setReorderingId(null);
      }
    },
    [addItem, clearCart, getAuthHeaders, openCart, token]
  );

  // ── Referral handlers ───────────────────────────────────────────────────
  // Copy: use the legacy react-native `Clipboard` (deprecated but still
  // works in RN 0.81 — `expo-clipboard` isn't installed and adding a new
  // native dependency is out of scope). On web Clipboard.setString is a
  // no-op shim; the copied toast still fires so behaviour is consistent.
  const handleCopyReferralCode = useCallback(() => {
    if (!referral || !referral.code) return;
    try {
      Clipboard.setString(referral.code);
    } catch {}
    setReferralCopied(true);
    setTimeout(() => setReferralCopied(false), 1800);
  }, [referral]);

  const handleShareReferral = useCallback(async () => {
    if (!referral || !referral.code || !referral.shareUrl) return;
    // Grammatiskt komplett message med rewardLabel ("25% rabatt + Fri leverans")
    const message = `Kom till FoodGo med min kod ${referral.code} — vi får båda ${referral.rewardLabel} på nästa beställning! ${referral.shareUrl}`;
    try {
      await Share.share({
        title: t('profile.referral.shareTitle'),
        message,
        // iOS-only — when both message and url are supplied iOS shows them
        // as a single rich-link card in most receivers. Android collapses
        // url into message which is also fine.
        url: referral.shareUrl,
      } as any);
    } catch {
      // User cancelled or sheet failed — no-op.
    }
  }, [referral, t]);

  const handleDeleteAccount = useCallback(() => {
    if (!token) return;
    Alert.alert(
      "Radera konto",
      "Det här raderar ditt konto och anonymiserar din orderhistorik. Vill du fortsätta?",
      [
        { text: "Avbryt", style: "cancel" },
        {
          text: "Radera",
          style: "destructive",
          onPress: () => {
            void (async () => {
              try {
                await api.delete("/api/profile", { headers: getAuthHeaders(token) });
                handleLogout();
              } catch (error: any) {
                Alert.alert("Kunde inte radera", error?.response?.data?.error || "Försök igen om en stund.");
              }
            })();
          },
        },
      ]
    );
  }, [getAuthHeaders, handleLogout, token]);

  // ── Reset app — clear cache & return to first-launch state ────────────────
  // Wipes AsyncStorage + SecureStore (JWT) + resets the Zustand store, then
  // re-mounts the entire app tree via RestartContext so OnboardingScreen is
  // shown again. Used for testing onboarding changes without reinstalling.
  const handleResetApp = useCallback(() => {
    Alert.alert(
      "Återställ appen?",
      "All lokal data raderas — varukorg, sparade adresser, favoriter, inloggning, onboarding-status. Du måste logga in igen. Forsätt?",
      [
        { text: "Avbryt", style: "cancel" },
        {
          text: "Återställ",
          style: "destructive",
          onPress: () => {
            void (async () => {
              try {
                // 1. Clear AsyncStorage entirely (cart, profile blob, prefs etc).
                await AsyncStorage.clear();
              } catch {}

              // 2. Clear SecureStore — best-effort via dynamic require since
              // expo-secure-store may not be linked in every build. Same
              // pattern as useAppStore.ts.
              try {
                // eslint-disable-next-line @typescript-eslint/no-require-imports
                const SecureStore = require("expo-secure-store");
                await SecureStore.deleteItemAsync("react-matgo-auth-token");
              } catch {}

              // 3. Reset Zustand store — clear cart, session, flags, choices.
              try {
                clearCart();
                clearSession();
                setOnboardingComplete(false);
                setBogoChoice(null);
                setProfile(null);
                setThemePreference("light");
              } catch {}

              // 4. Re-mount the app tree — OnboardingScreen will show fresh
              // since onboardingComplete is now false and token is null.
              restartApp();
            })();
          },
        },
      ]
    );
  }, [clearCart, clearSession, restartApp, setBogoChoice, setOnboardingComplete, setProfile, setThemePreference]);

  if (pageLoading) {
    return (
      <ScreenWrap>
        <ProfileScreenSkeleton />
      </ScreenWrap>
    );
  }

  if (!token || !profile) {
    return (
      <ScreenWrap>
        <View style={{ paddingTop: 18, paddingBottom: 18 }}>
          {/* Language button */}
          <Pressable
            onPress={() => setLangPickerOpen(true)}
            style={{ alignSelf: "flex-end", flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 7, paddingHorizontal: 12, borderRadius: 20, backgroundColor: palette.panelMuted, borderWidth: 1, borderColor: palette.border, marginBottom: 16 }}
          >
            <Ionicons name="globe-outline" size={14} color={palette.muted} />
            <Text style={{ color: palette.muted, fontSize: 11, fontWeight: "700" }}>{t(`language.languages.${currentLanguage}`)}</Text>
          </Pressable>

          {/* Dpoints sponsor-banner (göms om inget aktivt kort) */}
          <DpointsSponsorBanner />

          {/* Hero icon with animated ring + breath */}
          <View style={{ alignItems: "center", marginBottom: 20 }}>
            <Animated.View
              pointerEvents="none"
              style={{
                position: "absolute",
                width: 120, height: 120, borderRadius: 60,
                borderWidth: 1.5, borderColor: "rgba(234,181,69,0.85)",
                opacity: guestRingOpacity,
                transform: [{ scale: guestRingScale }],
              }}
            />
            <Animated.View style={{ transform: [{ scale: guestIconBreath }] }}>
              <Animated.View style={{ opacity: guestIconOpacity, transform: [{ scale: guestIconScale }] }}>
                <View style={{
                  width: 108, height: 108, borderRadius: 34,
                  backgroundColor: "rgba(234,181,69,0.1)",
                  borderWidth: 1.5, borderColor: "rgba(234,181,69,0.2)",
                  alignItems: "center", justifyContent: "center",
                  shadowColor: palette.gold, shadowOpacity: 0.5, shadowRadius: 44, shadowOffset: { width: 0, height: 14 },
                }}>
                  <Ionicons name="lock-closed-outline" size={44} color={palette.gold} />
                </View>
              </Animated.View>
            </Animated.View>
          </View>

          {/* Title — staggered lines */}
          <View style={{ alignItems: "center", marginBottom: 14 }}>
            <Animated.Text style={{
              color: palette.text, fontSize: 34, fontWeight: "900", textAlign: "center",
              opacity: guestTitle1Opacity, transform: [{ translateY: guestTitle1Y }],
            }}>
              VÄLKOMMEN
            </Animated.Text>
            <Animated.Text style={{
              color: palette.gold, fontSize: 34, fontWeight: "900", textAlign: "center",
              marginTop: -2,
              opacity: guestTitle2Opacity, transform: [{ translateY: guestTitle2Y }],
            }}>
              TILLBAKA
            </Animated.Text>
          </View>

          <Animated.Text style={{
            color: palette.muted, fontSize: 11, fontWeight: "900", letterSpacing: ls(2),
            textAlign: "center", marginBottom: 4,
            opacity: guestSubOpacity,
          }}>
            {t('profile.guest.description').toUpperCase()}
          </Animated.Text>

          {/* Form card + buttons — slide up together. Email + password layout
              mirrors web's /profile guest view (Email → Lösenord → Logga in →
              Glömt lösenord? → Eller med socialt konto → Apple/Google). */}
          <Animated.View style={{ opacity: guestCardOpacity, transform: [{ translateY: guestCardY }] }}>
            <View style={[styles.formCard, { borderRadius: 30, marginTop: 24, padding: 20 }]}>
              {/* Email */}
              <Text style={{ color: palette.muted, fontSize: 10, fontWeight: "900", letterSpacing: ls(2), marginBottom: 8, marginLeft: 4 }}>EMAIL</Text>
              <TextInput
                style={[styles.input, { marginBottom: 12, fontSize: 16, fontWeight: "700", paddingVertical: 18 }]}
                placeholder="din@email.se"
                placeholderTextColor={palette.muted}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                textContentType="emailAddress"
                value={loginIdentifier}
                onChangeText={(v) => { setLoginIdentifier(v); if (loginError) setLoginError(""); }}
              />

              {/* Lösenord */}
              <Text style={{ color: palette.muted, fontSize: 10, fontWeight: "900", letterSpacing: ls(2), marginBottom: 8, marginLeft: 4 }}>LÖSENORD</Text>
              <TextInput
                style={[styles.input, { marginBottom: 0, fontSize: 16, fontWeight: "700", paddingVertical: 18 }]}
                placeholder="••••••••"
                placeholderTextColor={palette.muted}
                secureTextEntry
                autoCapitalize="none"
                autoComplete="password"
                textContentType="password"
                value={loginPassword}
                onChangeText={(v) => { setLoginPassword(v); if (loginError) setLoginError(""); }}
                onSubmitEditing={handleEmailLogin}
              />

              {!!loginError && <Text style={{ color: palette.danger, fontSize: 11, fontWeight: "800", marginTop: 14, textAlign: "center" }}>{loginError}</Text>}

              <PrimaryButton
                label={authLoading ? t('common.loading') : "Logga in"}
                onPress={handleEmailLogin}
                disabled={authLoading}
                style={{ marginTop: 18 }}
              />

              {openForgotPassword && (
                <Pressable onPress={openForgotPassword} style={{ alignItems: "center", marginTop: 12, paddingVertical: 6 }}>
                  <Text style={{ color: palette.muted, fontSize: 11, fontWeight: "900", letterSpacing: ls(1.6) }}>
                    GLÖMT LÖSENORD?
                  </Text>
                </Pressable>
              )}

              <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginTop: 22, marginBottom: 18 }}>
                <View style={{ flex: 1, height: 1, backgroundColor: palette.border }} />
                <Text style={{ color: palette.muted, fontSize: 10, fontWeight: "900", letterSpacing: ls(2) }}>ELLER MED SOCIALT KONTO</Text>
                <View style={{ flex: 1, height: 1, backgroundColor: palette.border }} />
              </View>

              {Platform.OS === "ios" && (
                <AppleAuthentication.AppleAuthenticationButton
                  buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
                  buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
                  cornerRadius={24}
                  style={{ width: "100%", height: 54, marginBottom: 12, opacity: socialLoading && socialLoading !== "apple" ? 0.6 : 1 }}
                  onPress={() => handleSocialLogin("apple")}
                />
              )}

              {/* Google (Facebook removed — only Google + Apple supported) */}
              <Animated.View style={{ transform: [{ scale: googleGuestScale }] }}>
                <Pressable
                  onPress={() => handleSocialLogin("google")}
                  onPressIn={() => Animated.spring(googleGuestScale, { toValue: 0.96, useNativeDriver: true, speed: 60, bounciness: 0 }).start()}
                  onPressOut={() => Animated.spring(googleGuestScale, { toValue: 1, useNativeDriver: true, speed: 60, bounciness: 0 }).start()}
                  style={{
                    backgroundColor: palette.card, borderRadius: 24, borderWidth: 1, borderColor: palette.border,
                    paddingVertical: 18, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
                    opacity: socialLoading !== null && socialLoading !== "google" ? 0.6 : 1,
                  }}
                >
                  <Ionicons
                    name={socialLoading === "google" ? "hourglass-outline" : "logo-google"}
                    size={20}
                    color="#DB4437"
                  />
                  <Text style={{ color: palette.text, fontSize: 13, fontWeight: "900" }}>GOOGLE</Text>
                </Pressable>
              </Animated.View>
            </View>

            {/* Kontakt support — paritet med inloggad vy (Kontakt & hjälp).
                Gäster ska ha samma genväg till support. */}
            <Pressable
              onPress={() => {
                const subject = t('profile.support.mailSubject');
                const body = t('profile.support.mailBody');
                const supportEmail = appSettings.supportEmail;
                const url = `mailto:${supportEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
                Linking.openURL(url).catch(() => {
                  Alert.alert(t('profile.support.mailFailedTitle'), t('profile.support.mailFailedBody', { email: supportEmail }));
                });
              }}
              style={{
                marginTop: 14,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                paddingVertical: 14,
                paddingHorizontal: 18,
                borderRadius: 22,
                borderWidth: 1,
                borderColor: "rgba(234,181,69,0.4)",
                backgroundColor: "rgba(234,181,69,0.06)",
              }}
            >
              <Ionicons name="chatbubble-ellipses-outline" size={16} color={palette.gold} />
              <Text style={{ color: palette.gold, fontSize: 12, fontWeight: "900", letterSpacing: ls(1.8) }}>
                {t('profile.support.cta')}
              </Text>
            </Pressable>

            <Pressable style={{ marginTop: 18 }} onPress={() => openRegister()}>
              <Text style={{ color: palette.muted, fontSize: 12, fontWeight: "900", textAlign: "center" }}>
                INGET KONTO? <Text style={{ color: palette.gold }}>SKAPA KONTO GRATIS</Text>
              </Text>
            </Pressable>

            {/* Inställningar — minimal gäst-version av settings-fliken så
                man kan byta tema utan att logga in. Settings-fliken är
                annars bara synlig för inloggade. */}
            <View style={{ marginTop: 28 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10, paddingHorizontal: 4 }}>
                <View style={{ flex: 1, height: 1, backgroundColor: palette.border }} />
                <Text style={{ color: palette.muted, fontSize: 10, fontWeight: "900", letterSpacing: ls(2) }}>
                  {t('profile.settings.sectionHeader')}
                </Text>
                <View style={{ flex: 1, height: 1, backgroundColor: palette.border }} />
              </View>

              <View style={[styles.formCard, { borderRadius: 30, padding: 20, gap: 12 }]}>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                  <Text style={{ color: palette.text, fontSize: 14, fontWeight: "800" }}>{t('profile.settings.theme')}</Text>
                  <Ionicons
                    name={themePreference === "dark" ? "moon-outline" : themePreference === "system" ? "phone-portrait-outline" : "sunny-outline"}
                    size={18}
                    color={palette.muted}
                  />
                </View>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  {([
                    { id: "light", label: t('profile.settings.themeLight'), icon: "sunny-outline" as const },
                    { id: "dark", label: t('profile.settings.themeDark'), icon: "moon-outline" as const },
                    { id: "system", label: t('profile.settings.themeSystem'), icon: "phone-portrait-outline" as const },
                  ] as const).map((opt) => {
                    const active = themePreference === opt.id;
                    return (
                      <Pressable
                        key={opt.id}
                        onPress={() => setThemePreference(opt.id)}
                        style={{
                          flex: 1,
                          flexDirection: "row",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: 6,
                          paddingVertical: 12,
                          borderRadius: 16,
                          backgroundColor: active ? "rgba(234,181,69,0.12)" : palette.panelMuted,
                          borderWidth: 1,
                          borderColor: active ? palette.gold : palette.border,
                        }}
                      >
                        <Ionicons name={opt.icon} size={14} color={active ? palette.gold : palette.muted} />
                        <Text style={{ color: active ? palette.gold : palette.text, fontSize: 11, fontWeight: "900", letterSpacing: ls(1) }}>
                          {opt.label.toUpperCase()}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            </View>
          </Animated.View>
        </View>

        <Modal visible={langPickerOpen} transparent animationType="slide" onRequestClose={() => setLangPickerOpen(false)}>
          <View style={styles.modalBackdrop}>
            <View style={[styles.modalCard, { borderRadius: 30, gap: 14 }]}>
              <Text style={{ color: palette.text, fontSize: 18, fontWeight: "900", textAlign: "center" }}>{t('language.title')}</Text>
              <Text style={{ color: palette.muted, fontSize: 12, fontWeight: "600", textAlign: "center" }}>{t('language.subtitle')}</Text>
              {(['en', 'sv', 'ar'] as const).map((lang) => (
                <Pressable
                  key={lang}
                  onPress={async () => { await changeLanguage(lang); setLangPickerOpen(false); }}
                  style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16, borderRadius: 16, backgroundColor: currentLanguage === lang ? "rgba(234,181,69,0.1)" : palette.panelMuted, borderWidth: 1, borderColor: currentLanguage === lang ? palette.gold : palette.border }}
                >
                  <Text style={{ color: currentLanguage === lang ? palette.gold : palette.text, fontSize: 15, fontWeight: "900" }}>{t(`language.languages.${lang}`)}</Text>
                  {currentLanguage === lang && <Ionicons name="checkmark-circle" size={20} color={palette.gold} />}
                </Pressable>
              ))}
              <Pressable style={{ marginTop: 4 }} onPress={() => setLangPickerOpen(false)}>
                <Text style={{ color: palette.gold, fontWeight: "700", textAlign: "center" }}>{t('common.cancel')}</Text>
              </Pressable>
            </View>
          </View>
        </Modal>
      </ScreenWrap>
    );
  }

  // ── Logged-in profile view (abbreviated for clarity — full JSX from App.tsx) ──
  // The full <ScreenWrap> with tabs, settings, deals, orders, addresses etc.
  // is preserved below exactly as in App.tsx.
  return (
    <ScreenWrap>
      {__DEV__ && (
        <Pressable
          onPress={() => setSentryTestCrash(true)}
          style={{
            backgroundColor: "rgba(220,38,38,0.12)",
            borderColor: "rgba(220,38,38,0.4)",
            borderWidth: 1,
            borderRadius: 12,
            padding: 12,
            marginBottom: 12,
            alignItems: "center",
          }}
        >
          <Text style={{ color: "#fb7185", fontSize: 12, fontWeight: "900" }}>
            🧪 SENTRY TEST — KRASCHA APPEN (DEV)
          </Text>
        </Pressable>
      )}

      {/* Profile header */}
      <View style={[styles.formCard, { borderRadius: 34, padding: 22 }]}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
          <View style={{ width: 58, height: 58, borderRadius: 20, backgroundColor: palette.gold, alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
            {profile?.image ? <Image source={{ uri: profile.image }} style={{ width: "100%", height: "100%" }} /> : <Ionicons name="person-outline" size={28} color="#000" />}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: palette.text, fontSize: 22, fontWeight: "900" }}>{(profile?.name || "KUNDPROFIL").toUpperCase()}</Text>
            <Text style={{ color: palette.muted, fontSize: 13, fontWeight: "800", marginTop: 2 }}>{profile?.phone || profile?.email || "GÄST"}</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 }}>
              <Ionicons name={profile?.isVerified ? "shield-checkmark" : "alert-circle-outline"} size={14} color={profile?.isVerified ? palette.success : palette.danger} />
              <Text style={{ color: profile?.isVerified ? palette.success : palette.danger, fontSize: 10, fontWeight: "900", textTransform: "uppercase" }}>
                {profile?.isVerified ? t('profile.verified') : t('profile.notVerified')}
              </Text>
            </View>
          </View>
          <Pressable onPress={handleLogout} style={{ padding: 10 }}>
            <Ionicons name="log-out-outline" size={26} color={palette.danger} />
          </Pressable>
        </View>
      </View>

      {/* Tab navigation */}
      <View style={{ flexDirection: "row", backgroundColor: palette.panelMuted, borderRadius: 24, padding: 6, marginBottom: 6, flexWrap: "wrap", borderWidth: 1, borderColor: palette.border }}>
        {(
          [
            { id: "overview", icon: "person-outline", label: t('profile.tabs.overview').toUpperCase() },
            { id: "deals", icon: "sparkles-outline", label: t('profile.tabs.deals').toUpperCase() },
            { id: "orders", icon: "time-outline", label: t('profile.tabs.orders').toUpperCase() },
            { id: "addresses", icon: "location-outline", label: t('profile.tabs.addresses').toUpperCase() },
            { id: "settings", icon: "settings-outline", label: t('profile.tabs.settings').toUpperCase() },
          ] as const
        ).map((tab) => (
          <Pressable
            key={tab.id}
            onPress={() => {
              setActiveTab(tab.id);
              if (tab.id !== "settings") setIsEditing(false);
            }}
            style={{
              width: "20%",
              minWidth: 62,
              alignItems: "center",
              justifyContent: "center",
              gap: 4,
              paddingVertical: 12,
              borderRadius: 18,
              backgroundColor: activeTab === tab.id ? "rgba(28,28,30,0.06)" : "transparent",
            }}
          >
            <Ionicons name={tab.icon as any} size={16} color={activeTab === tab.id ? palette.gold : palette.muted} />
            <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} style={{ color: activeTab === tab.id ? palette.text : palette.muted, fontSize: 8, fontWeight: "900" }}>{tab.label}</Text>
          </Pressable>
        ))}
      </View>

      {/* Overview tab */}
      {activeTab === "overview" && (
        <>
          <DpointsSection />
          <View style={[styles.formCard, { borderRadius: 30, padding: 22, gap: 18 }]}>
            {[
              { icon: "call-outline", label: t('profile.overview.phone').toUpperCase(), value: profile.phone || t('profile.overviewLabels.notProvided'), onPress: undefined },
              { icon: "mail-outline", label: t('profile.overviewLabels.email'), value: profile.email || t('profile.overviewLabels.notProvided'), onPress: undefined },
              { icon: "home-outline", label: t('profile.overview.address').toUpperCase(), value: deliveryAddress || savedAddresses.find((a) => a.isDefault)?.street || t('profile.overviewLabels.notProvided'), onPress: () => setActiveTab("addresses") },
            ].map(({ icon, label, value, onPress }) => (
              <Pressable key={label} onPress={onPress} style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
                <Ionicons name={icon as any} size={16} color={palette.muted} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: palette.muted, fontSize: 9, fontWeight: "900", letterSpacing: ls(1.6) }}>{label}</Text>
                  <Text style={{ color: palette.text, fontSize: 14, fontWeight: "800", marginTop: 2 }}>{value}</Text>
                </View>
                {onPress && <Ionicons name="chevron-forward-outline" size={14} color={palette.muted} />}
              </Pressable>
            ))}
          </View>

          {/* ── Referral / Bjud in vänner ─────────────────────────────────
              Två varianter:
              - locked: user har inte gjort sin första betalda order än →
                visar lock-state med teaser deal-hero + CTA "Beställ nu".
              - unlocked: full kod + share + stats + deal-hero. */}
          {referral && referral.enabled && referral.locked && referral.deal && (
            <View
              style={{
                marginTop: 14,
                borderRadius: 30,
                backgroundColor: palette.panel,
                borderWidth: 1,
                borderColor: palette.border,
                padding: 22,
                gap: 14,
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <Ionicons name="lock-closed" size={18} color={palette.muted} />
                <Text style={{
                  flex: 1, color: palette.muted, fontSize: 11, fontWeight: "900",
                  letterSpacing: ls(2.5),
                }}>
                  LÅST — LÄGG FÖRSTA ORDERN
                </Text>
              </View>

              <Text style={{
                color: palette.text, fontSize: 17, fontWeight: "900",
                fontStyle: "italic", letterSpacing: -0.3, lineHeight: 22,
              }}>
                Vänta — lås upp{" "}
                <Text style={{ color: palette.gold }}>{referral.rewardLabel}</Text>
                {" "}åt båda
              </Text>
              <Text style={{ color: palette.muted, fontSize: 12, fontWeight: "600", lineHeight: 17 }}>
                Lägg din första beställning så låser du upp möjligheten att bjuda in
                vänner och få {referral.rewardLabel} på er nästa order.
              </Text>

              {/* Teaser deal-hero */}
              <DealHeroCard deal={referral.deal} palette={palette} ls={ls} />

              <View
                style={{
                  backgroundColor: palette.gold,
                  borderRadius: 16,
                  paddingVertical: 14,
                  alignItems: "center",
                  flexDirection: "row",
                  justifyContent: "center",
                  gap: 8,
                  marginTop: 6,
                }}
              >
                <Text style={{ color: "#000", fontSize: 12, fontWeight: "900", letterSpacing: ls(1.5) }}>
                  BESTÄLL FÖR ATT LÅSA UPP
                </Text>
                <Ionicons name="arrow-forward" size={14} color="#000" />
              </View>
            </View>
          )}

          {referral && referral.enabled && !referral.locked && referral.code && (
            <View
              style={{
                marginTop: 14,
                borderRadius: 30,
                backgroundColor: "rgba(234,181,69,0.06)",
                borderWidth: 1,
                borderColor: "rgba(234,181,69,0.32)",
                padding: 22,
                gap: 16,
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <Text style={{ fontSize: 20 }}>🎁</Text>
                <Text style={{
                  flex: 1, color: palette.text, fontSize: 15, fontWeight: "900",
                  fontStyle: "italic", letterSpacing: -0.3,
                }}>
                  Få <Text style={{ color: palette.gold }}>{referral.rewardLabel}</Text> åt båda
                </Text>
              </View>
              <Text style={{ color: palette.muted, fontSize: 12, fontWeight: "600", lineHeight: 17 }}>
                När din vän gör sin första beställning får ni båda {referral.rewardLabel} på nästa order.
              </Text>

              {/* Deal-hero — dynamisk visuell display av rabatten */}
              {referral.deal && <DealHeroCard deal={referral.deal} palette={palette} ls={ls} />}

              {/* Code display */}
              <View style={{
                backgroundColor: palette.panelMuted,
                borderRadius: 18,
                borderWidth: 1,
                borderColor: palette.border,
                paddingVertical: 16,
                paddingHorizontal: 18,
                alignItems: "center",
                gap: 4,
              }}>
                <Text style={{ color: palette.muted, fontSize: 9, fontWeight: "900", letterSpacing: ls(2) }}>
                  {t('profile.referral.codeLabel')}
                </Text>
                <Text style={{
                  color: palette.gold,
                  fontSize: 26,
                  fontWeight: "900",
                  letterSpacing: 4,
                  fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
                }}>
                  {referral.code}
                </Text>
              </View>

              {/* Copy + Share buttons */}
              <View style={{ flexDirection: "row", gap: 10 }}>
                <Pressable
                  onPress={handleCopyReferralCode}
                  style={{
                    flex: 1,
                    backgroundColor: palette.panel,
                    borderWidth: 1,
                    borderColor: palette.border,
                    borderRadius: 16,
                    paddingVertical: 14,
                    alignItems: "center",
                    flexDirection: "row",
                    justifyContent: "center",
                    gap: 8,
                  }}
                >
                  <Ionicons
                    name={referralCopied ? "checkmark-circle" : "copy-outline"}
                    size={16}
                    color={referralCopied ? "#10b981" : palette.text}
                  />
                  <Text style={{
                    color: referralCopied ? "#10b981" : palette.text,
                    fontSize: 12,
                    fontWeight: "900",
                    letterSpacing: ls(1),
                  }}>
                    {referralCopied
                      ? t('profile.referral.copied').toUpperCase()
                      : t('profile.referral.copyBtn').toUpperCase()}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={handleShareReferral}
                  style={{
                    flex: 1,
                    backgroundColor: palette.gold,
                    borderRadius: 16,
                    paddingVertical: 14,
                    alignItems: "center",
                    flexDirection: "row",
                    justifyContent: "center",
                    gap: 8,
                  }}
                >
                  <Ionicons name="share-outline" size={16} color="#000" />
                  <Text style={{ color: "#000", fontSize: 12, fontWeight: "900", letterSpacing: ls(1) }}>
                    {t('profile.referral.shareBtn').toUpperCase()}
                  </Text>
                </Pressable>
              </View>

              {/* Stats row */}
              <View style={{
                flexDirection: "row",
                justifyContent: "space-between",
                borderTopWidth: 1,
                borderTopColor: palette.border,
                paddingTop: 14,
              }}>
                <View style={{ flex: 1, alignItems: "center" }}>
                  <Text style={{ color: palette.gold, fontSize: 22, fontWeight: "900", fontStyle: "italic" }}>
                    {referral.stats.invited}
                  </Text>
                  <Text style={{ color: palette.muted, fontSize: 9, fontWeight: "900", letterSpacing: ls(1), marginTop: 2 }}>
                    {t('profile.referral.stats.invited').toUpperCase()}
                  </Text>
                </View>
                <View style={{ flex: 1, alignItems: "center" }}>
                  <Text style={{ color: palette.gold, fontSize: 22, fontWeight: "900", fontStyle: "italic" }}>
                    {referral.stats.ordered}
                  </Text>
                  <Text style={{ color: palette.muted, fontSize: 9, fontWeight: "900", letterSpacing: ls(1), marginTop: 2 }}>
                    {t('profile.referral.stats.completed').toUpperCase()}
                  </Text>
                </View>
                <View style={{ flex: 1, alignItems: "center" }}>
                  <Text style={{ color: palette.gold, fontSize: 22, fontWeight: "900", fontStyle: "italic" }}>
                    {referral.stats.totalEarnedKr}
                  </Text>
                  <Text style={{ color: palette.muted, fontSize: 9, fontWeight: "900", letterSpacing: ls(1), marginTop: 2 }}>
                    {t('profile.referral.stats.earned').toUpperCase()} kr
                  </Text>
                </View>
              </View>
            </View>
          )}
        </>
      )}

      {/* Deals tab */}
      {activeTab === "deals" && (
        <View style={{ gap: 12 }}>
          {/* Tillgängliga (oclaimade) popup-deals — claim-banners så
              kunden kan spara senare om man missat popupen vid app-start. */}
          {availableDeals.map((deal: any) => {
            const isClaiming = claimingId === deal.id;
            return (
              <View
                key={`avail-${deal.id}`}
                style={{
                  backgroundColor: "rgba(243,191,87,0.12)",
                  borderRadius: 30,
                  borderWidth: 1,
                  borderColor: "rgba(243,191,87,0.36)",
                  padding: 22,
                  gap: 14,
                }}
              >
                <View style={{ flexDirection: "row", gap: 14 }}>
                  {deal.imageUrl ? (
                    <Image source={{ uri: deal.imageUrl }} style={{ width: 64, height: 64, borderRadius: 18 }} />
                  ) : (
                    <View style={{ width: 64, height: 64, borderRadius: 18, backgroundColor: "rgba(243,191,87,0.2)", alignItems: "center", justifyContent: "center" }}>
                      <Text style={{ fontSize: 28 }}>🎁</Text>
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: palette.gold, fontSize: 10, fontWeight: "900", textTransform: "uppercase", letterSpacing: 1 }}>
                      Nytt erbjudande
                    </Text>
                    <Text style={{ color: palette.text, fontSize: 16, fontWeight: "900", fontStyle: "italic", marginTop: 4 }}>
                      {deal.popupHeadline || deal.title}
                    </Text>
                    {deal.popupBody || deal.description ? (
                      <Text style={{ color: palette.muted, fontSize: 12, fontWeight: "700", lineHeight: 18, marginTop: 4 }}>
                        {deal.popupBody || deal.description}
                      </Text>
                    ) : null}
                  </View>
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                  <Text style={{ color: palette.muted, fontSize: 10, fontWeight: "800", flex: 1 }}>
                    {deal.discountType === "PERCENTAGE" ? `${deal.discountValue}%` : `${deal.discountValue} kr`} rabatt
                    {deal.minOrder > 0 ? ` • min ${deal.minOrder} kr` : ""}
                  </Text>
                  <Pressable
                    disabled={isClaiming}
                    onPress={async () => {
                      if (!token) return;
                      setClaimingId(deal.id);
                      try {
                        await api.post(
                          `/api/profile/deals/${deal.id}/claim`,
                          {},
                          { headers: { Authorization: `Bearer ${token}` } },
                        );
                        // Flytta deal från available → claimed lokalt
                        setAvailableDeals((current) => current.filter((d) => d.id !== deal.id));
                        setClaimedDeals((current) => [{ ...deal, _kind: "CLAIMED" }, ...current]);
                      } catch (e: any) {
                        Alert.alert("Kunde inte spara", e?.response?.data?.error || "Försök igen senare.");
                      } finally {
                        setClaimingId(null);
                      }
                    }}
                    style={{
                      paddingHorizontal: 18,
                      paddingVertical: 12,
                      borderRadius: 16,
                      backgroundColor: palette.gold,
                      opacity: isClaiming ? 0.6 : 1,
                    }}
                  >
                    <Text style={{ color: "#11151b", fontSize: 11, fontWeight: "900", letterSpacing: 1 }}>
                      {isClaiming ? "SPARAR..." : (deal.popupCtaLabel || "SPARA").toUpperCase()}
                    </Text>
                  </Pressable>
                </View>
              </View>
            );
          })}

          {/* Claimade + globala deals (från popup-builder broadcasts) */}
          {claimedDeals.map((deal: any) => {
            const isClaimed = deal._kind === "CLAIMED";
            // Tag som visar typ av deal: Personlig (claimad), Restaurang
            // (specifik restaurant), Global (alla restauranger).
            const dealKind = deal.restaurantId
              ? { label: "RESTAURANG", color: "#5ea6ff", bg: "rgba(94,166,255,0.12)" }
              : isClaimed
                ? { label: "PERSONLIG", color: "#c084fc", bg: "rgba(192,132,252,0.14)" }
                : { label: "GLOBAL", color: "#34d399", bg: "rgba(52,211,153,0.12)" };
            return (
              <Pressable
                key={`claimed-${deal.id}`}
                onPress={() => openDeal && openDeal(deal.id)}
                style={{ backgroundColor: "rgba(234,181,69,0.06)", borderRadius: 30, borderWidth: 1, borderColor: "rgba(234,181,69,0.18)", padding: 22, gap: 14 }}
              >
                <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 14 }}>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <Text style={{ color: palette.gold, fontSize: 10, fontWeight: "900", textTransform: "uppercase", letterSpacing: 1 }}>
                        {isClaimed ? "Sparad" : "Tillgänglig för alla"}
                      </Text>
                      <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: dealKind.bg }}>
                        <Text style={{ color: dealKind.color, fontSize: 9, fontWeight: "900", letterSpacing: 1 }}>
                          {dealKind.label}
                        </Text>
                      </View>
                    </View>
                    <Text style={{ color: palette.text, fontSize: 18, fontWeight: "900", fontStyle: "italic", marginTop: 6 }}>
                      {deal.popupHeadline || deal.title}
                    </Text>
                    {deal.popupBody || deal.description ? (
                      <Text style={{ color: palette.muted, fontSize: 12, fontWeight: "700", lineHeight: 18, marginTop: 6 }}>
                        {deal.popupBody || deal.description}
                      </Text>
                    ) : null}
                  </View>
                  <View style={{ width: 42, height: 42, borderRadius: 14, backgroundColor: palette.gold, alignItems: "center", justifyContent: "center" }}>
                    <Ionicons name="ticket-outline" size={20} color="#000" />
                  </View>
                </View>
                {deal.popupCode ? (
                  <View style={{ backgroundColor: palette.panelMuted, borderRadius: 16, borderWidth: 1, borderColor: palette.border, paddingHorizontal: 14, paddingVertical: 10, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                    <Text style={{ color: palette.text, fontSize: 12, fontWeight: "900", letterSpacing: 1 }}>
                      KOD: {deal.popupCode}
                    </Text>
                  </View>
                ) : null}
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={{ color: palette.muted, fontSize: 10, fontWeight: "800" }}>
                    {deal.discountType === "PERCENTAGE" ? `${deal.discountValue}%` : `${deal.discountValue} kr`} rabatt{deal.minOrder > 0 ? ` • min ${deal.minOrder} kr` : ""}
                  </Text>
                  {deal.validUntil ? (
                    <Text style={{ color: palette.muted, fontSize: 10, fontWeight: "800" }}>
                      Gäller till: {String(deal.validUntil).slice(0, 10)}
                    </Text>
                  ) : null}
                </View>
              </Pressable>
            );
          })}

          {!deals.length && claimedDeals.length === 0 ? (
            <View style={[styles.formCard, { borderRadius: 30, padding: 26, alignItems: "center" }]}>
              <Ionicons name="pricetags-outline" size={34} color={palette.muted} />
              <Text style={{ color: palette.muted, fontSize: 12, fontWeight: "900", marginTop: 14 }}>{t('profile.deals.empty')}</Text>
            </View>
          ) : null}

          {deals.length > 0 ? (
            deals.map((deal) => (
              <View key={deal.id || deal.code} style={{ backgroundColor: "rgba(234,181,69,0.06)", borderRadius: 30, borderWidth: 1, borderColor: "rgba(234,181,69,0.18)", padding: 22, gap: 16 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 14 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: palette.gold, fontSize: 10, fontWeight: "900", textTransform: "uppercase" }}>{deal.campaign?.title || t('profile.deals.personalDefault')}</Text>
                    <Text style={{ color: palette.text, fontSize: 22, fontWeight: "900", fontStyle: "italic", marginTop: 6 }}>
                      {deal.campaign?.discountType === "PERCENTAGE" ? `${deal.campaign?.discountValue || 0}% RABATT` : `${deal.campaign?.discountValue || 0} KR RABATT`}
                    </Text>
                  </View>
                  <View style={{ width: 46, height: 46, borderRadius: 16, backgroundColor: palette.gold, alignItems: "center", justifyContent: "center" }}>
                    <Ionicons name="ticket-outline" size={24} color="#000" />
                  </View>
                </View>
                <View style={{ backgroundColor: palette.panelMuted, borderRadius: 18, borderWidth: 1, borderColor: palette.border, paddingHorizontal: 14, paddingVertical: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                  <Text style={{ color: palette.text, fontSize: 11, fontWeight: "900" }}>KOD: {deal.code}</Text>
                  <Pressable onPress={() => Linking.openURL(`sms:&body=${deal.code}`).catch(() => {})}>
                    <Text style={{ color: palette.gold, fontSize: 10, fontWeight: "900", textTransform: "uppercase" }}>Dela</Text>
                  </Pressable>
                </View>
                <Text style={{ color: palette.muted, fontSize: 10, fontWeight: "800" }}>Min. order: {deal.campaign?.minOrder || 0} kr</Text>
              </View>
            ))
          ) : null}
        </View>
      )}

      {/* Orders tab */}
      {activeTab === "orders" && (
        <View style={{ gap: 12 }}>
          {!orders.length ? (
            <View style={[styles.formCard, { borderRadius: 30, padding: 26, alignItems: "center" }]}>
              <Ionicons name="time-outline" size={34} color={palette.muted} />
              <Text style={{ color: palette.muted, fontSize: 12, fontWeight: "900", marginTop: 14 }}>{t('profile.orders.empty')}</Text>
            </View>
          ) : (
            orders.map((order) => (
              <View key={order.id} style={[styles.formCard, { borderRadius: 30, padding: 18, gap: 14 }]}>
                <Pressable onPress={() => openOrder(order.id)}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                    <View style={{ flex: 1, paddingRight: 16 }}>
                      <Text style={{ color: palette.text, fontSize: 15, fontWeight: "900", fontStyle: "italic", textTransform: "uppercase" }}>
                        {(order as any).restaurant?.name || (order as any).restaurantName || "Beställning"}
                      </Text>
                      <Text style={{ color: palette.muted, fontSize: 10, fontWeight: "800", marginTop: 4 }}>
                        {order.createdAt ? new Date(order.createdAt).toLocaleDateString("sv-SE") : ""}
                      </Text>
                    </View>
                    <View style={{ alignItems: "flex-end" }}>
                      <Text style={{ color: palette.gold, fontSize: 20, fontWeight: "900" }}>{((order as any).total || (order as any).totalAmount || 0).toFixed(0)} kr</Text>
                      <Text style={{ color: palette.muted, fontSize: 10, fontWeight: "900", marginTop: 4 }}>{order.status.toUpperCase()}</Text>
                    </View>
                  </View>
                </Pressable>
                <View style={{ flexDirection: "row", gap: 10 }}>
                  <Pressable
                    onPress={() => handleReorder(order.id)}
                    style={{ backgroundColor: "rgba(234,181,69,0.1)", borderRadius: 14, borderWidth: 1, borderColor: "rgba(234,181,69,0.18)", paddingHorizontal: 14, paddingVertical: 12, flexDirection: "row", alignItems: "center", gap: 8 }}
                  >
                    <Ionicons name={reorderingId === order.id ? "hourglass-outline" : "refresh-outline"} size={14} color={palette.gold} />
                    <Text style={{ color: palette.gold, fontSize: 10, fontWeight: "900", textTransform: "uppercase" }}>
                      {reorderingId === order.id ? t('common.loading') : t('profile.orders.reorder')}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => openOrder(order.id)}
                    style={{ backgroundColor: palette.panelMuted, borderRadius: 14, borderWidth: 1, borderColor: palette.border, paddingHorizontal: 14, paddingVertical: 12, flexDirection: "row", alignItems: "center", gap: 8 }}
                  >
                    <Ionicons name="chevron-forward-outline" size={14} color={palette.text} />
                    <Text style={{ color: palette.text, fontSize: 10, fontWeight: "900", textTransform: "uppercase" }}>{t('profile.orders.details')}</Text>
                  </Pressable>
                </View>
              </View>
            ))
          )}
        </View>
      )}

      {/* Addresses tab */}
      {activeTab === "addresses" && (
        <View style={{ gap: 12 }}>
          <Text style={{ color: palette.muted, fontSize: 9, fontWeight: "900", letterSpacing: ls(2.5), paddingHorizontal: 4 }}>
            {t('profile.addresses.label', { count: quickAddresses.length })}
          </Text>
          {quickAddresses.length === 0 && (
            <View style={[styles.formCard, { borderRadius: 26, padding: 24, alignItems: "center", gap: 10 }]}>
              <Ionicons name="location-outline" size={28} color={palette.muted} />
              <Text style={{ color: palette.muted, fontSize: 12, fontWeight: "700" }}>{t('profile.addresses.empty')}</Text>
            </View>
          )}
          {quickAddresses.map((addr, i) => (
            <View key={addr.id || String(i)} style={[styles.formCard, { borderRadius: 26, padding: 16, flexDirection: "row", gap: 12, alignItems: "center" }]}>
              <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: addr.isDefault ? "rgba(234,181,69,0.15)" : palette.panelMuted, alignItems: "center", justifyContent: "center" }}>
                <Ionicons name="location" size={16} color={addr.isDefault ? palette.gold : palette.muted} />
              </View>
              <View style={{ flex: 1 }}>
                {addr.isDefault && (
                  <Text style={{ color: palette.gold, fontSize: 8, fontWeight: "900", letterSpacing: ls(1.5), marginBottom: 2 }}>{t('profile.addresses.default')}</Text>
                )}
                <Text numberOfLines={1} style={{ color: palette.text, fontSize: 13, fontWeight: "900" }}>{formatQuickAddress(addr)}</Text>
              </View>
              <View style={{ flexDirection: "row", gap: 4 }}>
                {!addr.isDefault && (
                  <Pressable
                    hitSlop={8}
                    onPress={async () => {
                      const next = await setDefaultQuickAddress(addr);
                      setQuickAddresses(next);
                    }}
                    style={{ padding: 8, borderRadius: 10, backgroundColor: "rgba(234,181,69,0.1)" }}
                  >
                    <Ionicons name="star-outline" size={15} color={palette.gold} />
                  </Pressable>
                )}
                <Pressable
                  hitSlop={8}
                  onPress={() => {
                    Alert.alert("Radera adress?", formatQuickAddress(addr), [
                      { text: "Avbryt", style: "cancel" },
                      { text: "Radera", style: "destructive", onPress: async () => {
                        const next = await removeQuickAddress(addr);
                        setQuickAddresses(next);
                      }},
                    ]);
                  }}
                  style={{ padding: 8, borderRadius: 10, backgroundColor: "rgba(220,38,38,0.08)" }}
                >
                  <Ionicons name="trash-outline" size={15} color={palette.danger} />
                </Pressable>
              </View>
            </View>
          ))}
          {quickAddresses.length < 3 && (
            <Pressable
              onPress={() => setAddrModalOpen(true)}
              style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: 16, borderRadius: 24, borderWidth: 1, borderStyle: "dashed", borderColor: "rgba(234,181,69,0.4)" }}
            >
              <Ionicons name="add-circle-outline" size={20} color={palette.gold} />
              <Text style={{ color: palette.gold, fontSize: 11, fontWeight: "900", letterSpacing: ls(2) }}>{t('profile.addresses.add')}</Text>
            </Pressable>
          )}
          <AddressModal
            visible={addrModalOpen}
            initialOrderType="DELIVERY"
            onClose={() => setAddrModalOpen(false)}
            onSelect={async (addressText, _, coords) => {
              const { rememberQuickAddress } = await import("../lib/quickAddresses");
              await rememberQuickAddress({ street: addressText, latitude: coords?.lat, longitude: coords?.lng });
              const next = await readQuickAddresses();
              setQuickAddresses(next);
              setStoreAddress(addressText, coords ?? null);
            }}
          />
        </View>
      )}

      {/* Settings tab */}
      {activeTab === "settings" && !isEditing && (
        <View style={{ gap: 14 }}>
          {/* Kontakt & support — flyttad upp till toppen av settings så
              man inte behöver scrolla igenom hela listan för att nå
              support. Också mer visuellt framträdande som gold-outlined
              card med icon-badge (mer iögonfallande än text-rad). */}
          <Pressable
            onPress={() => {
              const id = profile?.id ? ` #${profile.id}` : "";
              const emailLine = profile?.email ? `\n\nE-post: ${profile.email}` : "";
              const phoneLine = profile?.phone ? `\nTelefon: ${profile.phone}` : "";
              const subject = `${t('profile.support.mailSubject')}${id}`;
              const body = `${t('profile.support.mailBody').split('\n\n')[0]}${emailLine}${phoneLine}\n\n${t('profile.support.mailBody').split('\n\n').slice(1).join('\n\n')}`;
              const supportEmail = appSettings.supportEmail;
              const url = `mailto:${supportEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
              Linking.openURL(url).catch(() => {
                Alert.alert(t('profile.support.mailFailedTitle'), t('profile.support.mailFailedBody', { email: supportEmail }));
              });
            }}
            style={{
              borderRadius: 30,
              padding: 20,
              flexDirection: "row",
              alignItems: "center",
              gap: 14,
              backgroundColor: "rgba(234,181,69,0.08)",
              borderWidth: 1,
              borderColor: "rgba(234,181,69,0.35)",
            }}
          >
            <View
              style={{
                width: 42,
                height: 42,
                borderRadius: 14,
                backgroundColor: "rgba(234,181,69,0.18)",
                alignItems: "center",
                justifyContent: "center",
                borderWidth: 1,
                borderColor: "rgba(234,181,69,0.3)",
              }}
            >
              <Ionicons name="chatbubble-ellipses-outline" size={20} color={palette.gold} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: palette.gold, fontSize: 9, fontWeight: "900", letterSpacing: ls(2), marginBottom: 2 }}>
                {t('profile.support.kicker')}
              </Text>
              <Text style={{ color: palette.text, fontSize: 14, fontWeight: "900" }}>
                {t('profile.support.label')}
              </Text>
            </View>
            <Ionicons name="chevron-forward-outline" size={18} color={palette.gold} />
          </Pressable>

          <View style={[styles.formCard, { borderRadius: 30, padding: 0, overflow: "hidden" }]}>
            <Pressable onPress={() => setIsEditing(true)} style={{ padding: 20, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={{ color: palette.text, fontSize: 14, fontWeight: "800" }}>{t('profile.settings.editProfile')}</Text>
              <Ionicons name="chevron-forward-outline" size={18} color={palette.muted} />
            </Pressable>
          </View>
          <View style={[styles.formCard, { borderRadius: 30, padding: 0, overflow: "hidden" }]}>
            <Pressable onPress={() => setLangPickerOpen(true)} style={{ padding: 20, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={{ color: palette.text, fontSize: 14, fontWeight: "800" }}>{t('profile.settings.language')}</Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Text style={{ color: palette.muted, fontSize: 12, fontWeight: "700" }}>{t(`language.languages.${currentLanguage}`)}</Text>
                <Ionicons name="chevron-forward-outline" size={18} color={palette.muted} />
              </View>
            </Pressable>
          </View>

          {/* Tema-väljare — paritet med web (sun/moon-knapp i navbaren).
              OBS: Den delade `styles`-StyleSheet:en i constants/theme.ts är
              fortfarande hårdkodat ljus och används av ~18 komponenter, så
              dark mode visar cream-bg-fläckar tills de migrerats. Användaren
              varnas via not-texten under knapparna. */}
          <View style={[styles.formCard, { borderRadius: 30, padding: 20, gap: 12 }]}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={{ color: palette.text, fontSize: 14, fontWeight: "800" }}>{t('profile.settings.theme')}</Text>
              <Ionicons
                name={themePreference === "dark" ? "moon-outline" : themePreference === "system" ? "phone-portrait-outline" : "sunny-outline"}
                size={18}
                color={palette.muted}
              />
            </View>
            <View style={{ flexDirection: "row", gap: 8 }}>
              {([
                { id: "light", label: t('profile.settings.themeLight'), icon: "sunny-outline" as const },
                { id: "dark", label: t('profile.settings.themeDark'), icon: "moon-outline" as const },
                { id: "system", label: t('profile.settings.themeSystem'), icon: "phone-portrait-outline" as const },
              ] as const).map((opt) => {
                const active = themePreference === opt.id;
                return (
                  <Pressable
                    key={opt.id}
                    onPress={() => setThemePreference(opt.id)}
                    style={{
                      flex: 1,
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 6,
                      paddingVertical: 12,
                      borderRadius: 16,
                      backgroundColor: active ? "rgba(234,181,69,0.12)" : palette.panelMuted,
                      borderWidth: 1,
                      borderColor: active ? palette.gold : palette.border,
                    }}
                  >
                    <Ionicons name={opt.icon} size={14} color={active ? palette.gold : palette.muted} />
                    <Text style={{ color: active ? palette.gold : palette.text, fontSize: 11, fontWeight: "900", letterSpacing: ls(1) }}>
                      {opt.label.toUpperCase()}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={{ color: palette.muted, fontSize: 10, fontWeight: "700", lineHeight: 14 }}>
              {t('profile.settings.themeExperimentalNote')}
            </Text>
          </View>

          <View style={[styles.formCard, { borderRadius: 30, padding: 0, overflow: "hidden" }]}>
            <Pressable
              onPress={() => {
                WebBrowser.openBrowserAsync("https://matgo.se/terms").catch(() => {
                  Linking.openURL("https://matgo.se/terms").catch(() => {});
                });
              }}
              style={{ padding: 20, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
            >
              <Text style={{ color: palette.text, fontSize: 14, fontWeight: "800" }}>{t('profile.legal.terms')}</Text>
              <Ionicons name="document-text-outline" size={18} color={palette.muted} />
            </Pressable>
          </View>
          <View style={[styles.formCard, { borderRadius: 30, padding: 0, overflow: "hidden" }]}>
            <Pressable
              onPress={() => {
                WebBrowser.openBrowserAsync("https://matgo.se/privacy").catch(() => {
                  Linking.openURL("https://matgo.se/privacy").catch(() => {});
                });
              }}
              style={{ padding: 20, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
            >
              <Text style={{ color: palette.text, fontSize: 14, fontWeight: "800" }}>{t('profile.legal.privacy')}</Text>
              <Ionicons name="shield-checkmark-outline" size={18} color={palette.muted} />
            </Pressable>
          </View>
          <View style={[styles.formCard, { borderRadius: 30, padding: 0, overflow: "hidden" }]}>
            <Pressable onPress={handleDeleteAccount} style={{ padding: 20, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={{ color: palette.danger, fontSize: 14, fontWeight: "800" }}>{t('profile.settings.deleteAccount')}</Text>
              <Ionicons name="trash-outline" size={18} color={palette.danger} />
            </Pressable>
          </View>

          {/* Avancerat / utvecklare-sektion — placerat sist så det inte
              tappas av misstag. Återställning rensar all lokal data och
              visar onboarding igen, för att enkelt testa nya
              onboarding-justeringar. */}
          <View style={{ marginTop: 12, marginBottom: 6, paddingHorizontal: 4 }}>
            <Text style={{
              color: palette.muted, fontSize: 10, fontWeight: "900",
              letterSpacing: ls(2),
            }}>
              {t('profile.advanced.sectionHeader')}
            </Text>
          </View>
          <View style={[styles.formCard, { borderRadius: 30, padding: 0, overflow: "hidden" }]}>
            <Pressable
              onPress={handleResetApp}
              style={{ padding: 20, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ color: palette.danger, fontSize: 14, fontWeight: "800" }}>
                  {t('profile.advanced.resetApp')}
                </Text>
                <Text style={{ color: palette.muted, fontSize: 11, fontWeight: "600", marginTop: 4, lineHeight: 15 }}>
                  {t('profile.advanced.resetAppHint')}
                </Text>
              </View>
              <Ionicons name="refresh-outline" size={18} color={palette.danger} />
            </Pressable>
          </View>
        </View>
      )}

      {activeTab === "settings" && isEditing && (
        <View style={[styles.formCard, { borderRadius: 30, padding: 20, gap: 14 }]}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Pressable onPress={() => setIsEditing(false)}>
              <Ionicons name="arrow-back-outline" size={18} color={palette.text} />
            </Pressable>
            <Text style={{ color: palette.text, fontSize: 18, fontWeight: "900", fontStyle: "italic" }}>{t('profile.edit.title')}</Text>
          </View>
          <TextInput style={styles.input} placeholder={t('profile.edit.namePlaceholder')} placeholderTextColor={palette.muted} value={editName} onChangeText={setEditName} />
          <TextInput style={styles.input} placeholder={t('profile.edit.emailPlaceholder')} placeholderTextColor={palette.muted} value={editEmail} onChangeText={setEditEmail} keyboardType="email-address" autoCapitalize="none" />

          {/* Current phone (read-only summary) */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 4 }}>
            <Ionicons name="call-outline" size={14} color={palette.muted} />
            <Text style={{ color: palette.muted, fontSize: 12, fontWeight: "700" }}>
              {t('profile.edit.currentPhonePrefix')}: {profile.phone || t('profile.edit.notProvided')}
            </Text>
          </View>

          {/* Editable phone row — country picker + number input + save */}
          <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
            <Pressable
              onPress={() => {
                const currentIndex = COUNTRY_CODES.findIndex((item) => item.code === editPhoneCountry);
                const next = COUNTRY_CODES[(currentIndex + 1) % COUNTRY_CODES.length];
                setEditPhoneCountry(next.code);
              }}
              style={{
                width: 96, borderRadius: 18,
                backgroundColor: palette.card, borderWidth: 1, borderColor: palette.border,
                paddingHorizontal: 10, paddingVertical: 14,
                flexDirection: "row", alignItems: "center", justifyContent: "space-between",
              }}
            >
              <Text style={{ fontSize: 18 }}>{COUNTRY_CODES.find((item) => item.code === editPhoneCountry)?.flag || "🇸🇪"}</Text>
              <Text style={{ color: palette.text, fontSize: 13, fontWeight: "900" }}>{editPhoneCountry}</Text>
            </Pressable>
            <View style={{ flex: 1 }}>
              <TextInput
                style={[styles.input, { marginBottom: 0 }]}
                placeholder="070 000 00 00"
                placeholderTextColor={palette.muted}
                keyboardType="phone-pad"
                value={editPhone}
                onChangeText={setEditPhone}
              />
            </View>
          </View>
          <PrimaryButton
            label={isSavingPhone ? t('profile.edit.savingPhone') : t('profile.edit.savePhone')}
            onPress={handleSavePhone}
            disabled={isSavingPhone || !editPhone.trim()}
            icon="call-outline"
          />

          <PrimaryButton
            label={isSaving ? t('common.saving') : saveSuccess ? t('common.saved') : t('common.save')}
            onPress={handleUpdateProfile}
            disabled={isSaving}
            icon={saveSuccess ? "checkmark-outline" : "save-outline"}
            style={saveSuccess ? { backgroundColor: palette.success } : undefined}
          />
        </View>
      )}

      {/* Language Picker Modal */}
      <Modal visible={langPickerOpen} transparent animationType="slide" onRequestClose={() => setLangPickerOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { borderRadius: 30, gap: 14 }]}>
            <Text style={{ color: palette.text, fontSize: 18, fontWeight: "900", textAlign: "center" }}>{t('language.title')}</Text>
            <Text style={{ color: palette.muted, fontSize: 12, fontWeight: "600", textAlign: "center" }}>{t('language.subtitle')}</Text>
            {(['en', 'sv', 'ar'] as const).map((lang) => (
              <Pressable
                key={lang}
                onPress={async () => { await changeLanguage(lang); setLangPickerOpen(false); }}
                style={{
                  flexDirection: "row", alignItems: "center", justifyContent: "space-between",
                  padding: 16, borderRadius: 16,
                  backgroundColor: currentLanguage === lang ? "rgba(234,181,69,0.1)" : palette.panelMuted,
                  borderWidth: 1,
                  borderColor: currentLanguage === lang ? palette.gold : palette.border,
                }}
              >
                <Text style={{ color: currentLanguage === lang ? palette.gold : palette.text, fontSize: 15, fontWeight: "900" }}>
                  {t(`language.languages.${lang}`)}
                </Text>
                {currentLanguage === lang && <Ionicons name="checkmark-circle" size={20} color={palette.gold} />}
              </Pressable>
            ))}
            <Pressable style={{ marginTop: 4 }} onPress={() => setLangPickerOpen(false)}>
              <Text style={{ color: palette.gold, fontWeight: "700", textAlign: "center" }}>{t('common.cancel')}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

    </ScreenWrap>
  );
}

/**
 * DealHeroCard — visuell representation av referral-rabatten. Stora siffror
 * för procent/kr, lastbil-ikon för fri leverans, kombinerad layout för
 * stack (t.ex. "25% + Fri leverans"). Footer-rad med min-order + expiry.
 */
function DealHeroCard({
  deal,
  palette,
  ls,
}: {
  deal: {
    title: string;
    discountType: string;
    discountPercent: number | null;
    amountKr: number | null;
    freeDelivery: boolean;
    minOrderKr: number;
    validUntil: string | null;
  };
  palette: any;
  ls: (n: number) => number;
}) {
  const hasDiscount =
    (deal.discountType === "PERCENTAGE" && (deal.discountPercent ?? 0) > 0) ||
    (deal.discountType === "FIXED" && (deal.amountKr ?? 0) > 0);
  const isPercent = deal.discountType === "PERCENTAGE";

  const expiryDate = deal.validUntil
    ? (() => {
        try {
          const d = new Date(deal.validUntil);
          if (!Number.isFinite(d.getTime())) return null;
          return d.toLocaleDateString("sv-SE", { day: "numeric", month: "short" });
        } catch {
          return null;
        }
      })()
    : null;
  const expiryLabel = deal.validUntil
    ? expiryDate
      ? `Gäller till ${expiryDate}`
      : null
    : "Gäller tills vidare";

  return (
    <View
      style={{
        backgroundColor: palette.panelMuted,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: "rgba(234,181,69,0.3)",
        padding: 18,
        gap: 12,
      }}
    >
      <Text style={{ color: palette.muted, fontSize: 9, fontWeight: "900", letterSpacing: ls(2.5) }}>
        {deal.title}
      </Text>

      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 18 }}>
        {hasDiscount && (
          <View style={{ alignItems: "center" }}>
            <Text style={{ color: palette.gold, fontSize: 44, fontWeight: "900", fontStyle: "italic", letterSpacing: -2, lineHeight: 48 }}>
              {isPercent ? deal.discountPercent : deal.amountKr}
              <Text style={{ fontSize: 18, fontStyle: "italic" }}>{isPercent ? "%" : " kr"}</Text>
            </Text>
            <Text style={{ color: palette.muted, fontSize: 9, fontWeight: "900", letterSpacing: ls(2), marginTop: 2 }}>
              RABATT
            </Text>
          </View>
        )}

        {hasDiscount && deal.freeDelivery && (
          <Text style={{ color: palette.muted, fontSize: 26, fontWeight: "900", opacity: 0.4 }}>+</Text>
        )}

        {deal.freeDelivery && (
          <View style={{ alignItems: "center" }}>
            <View style={{
              width: 56, height: 56, borderRadius: 16,
              backgroundColor: "rgba(234,181,69,0.15)",
              borderWidth: 1, borderColor: "rgba(234,181,69,0.3)",
              alignItems: "center", justifyContent: "center",
            }}>
              <Ionicons name="car-outline" size={26} color={palette.gold} />
            </View>
            <Text style={{ color: palette.muted, fontSize: 9, fontWeight: "900", letterSpacing: ls(2), marginTop: 4 }}>
              FRI LEVERANS
            </Text>
          </View>
        )}
      </View>

      {(deal.minOrderKr > 0 || expiryLabel) && (
        <View style={{
          borderTopWidth: 1, borderTopColor: palette.border,
          paddingTop: 10, flexDirection: "row", flexWrap: "wrap", gap: 12,
          justifyContent: "center",
        }}>
          {deal.minOrderKr > 0 && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Ionicons name="wallet-outline" size={11} color={palette.muted} />
              <Text style={{ color: palette.muted, fontSize: 10, fontWeight: "700" }}>
                Min {deal.minOrderKr} kr
              </Text>
            </View>
          )}
          {expiryLabel && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Ionicons name="calendar-outline" size={11} color={palette.muted} />
              <Text style={{ color: palette.muted, fontSize: 10, fontWeight: "700" }}>
                {expiryLabel}
              </Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}
