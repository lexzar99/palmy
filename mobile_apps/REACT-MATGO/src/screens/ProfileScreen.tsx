import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Easing,
  Image,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
  Modal,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as AppleAuthentication from "expo-apple-authentication";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { useAppStore } from "../store/useAppStore";
import { useGoogleAuth } from "../hooks/useGoogleAuth";
import { useAppleAuth } from "../hooks/useAppleAuth";
import { api } from "../lib/api";
import { APP_AUTH_CALLBACK_URL, isAuthRedirectUrl, parseAuthRedirect } from "../lib/authRedirect";
import { getScreenCache, setScreenCache } from "../lib/screenCache";
import { supabase } from "../lib/supabase";
import { palette, styles } from "../constants/theme";
import { ScreenWrap, PrimaryButton } from "../components/ui";
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
  showAddPhone: boolean;
};

export default function ProfileScreen({
  openRegister,
  openEmailLogin,
  openOrder,
  openCart,
  openDeal,
}: {
  openRegister: (initialPhone?: string) => void;
  openEmailLogin?: () => void;
  openOrder: (id: string) => void;
  openCart: () => void;
  openDeal?: (id: string) => void;
}) {
  const token = useAppStore((s) => s.token);
  const setToken = useAppStore((s) => s.setToken);
  const profile = useAppStore((s) => s.profile);
  const setProfile = useAppStore((s) => s.setProfile);
  const clearSession = useAppStore((s) => s.clearSession);
  const { t } = useTranslation();
  const { currentLanguage, changeLanguage } = useLanguage();
  const { ls } = useArabic();
  const [langPickerOpen, setLangPickerOpen] = useState(false);
  const [sentryTestCrash, setSentryTestCrash] = useState(false);
  if (sentryTestCrash) {
    throw new Error("Sentry test crash @ " + new Date().toISOString());
  }
  const addItem = useAppStore((s) => s.addItem);
  const clearCart = useAppStore((s) => s.clearCart);
  const deliveryAddress = useAppStore((s) => s.deliveryAddress);
  const setDeliveryAddress = useAppStore((s) => s.setDeliveryAddress);
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
  const [phone, setPhone] = useState("");
  const [countryCode, setCountryCode] = useState("+46");
  const [otpCode, setOtpCode] = useState("");
  const [otpPhone, setOtpPhone] = useState("");
  const [showOtp, setShowOtp] = useState(false);
  const [pageLoading, setPageLoading] = useState(() => (token ? !cachedData : false));
  const [authLoading, setAuthLoading] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [socialLoading, setSocialLoading] = useState<"google" | "facebook" | "apple" | null>(null);
  const [showAddPhone, setShowAddPhone] = useState(() => cachedData?.showAddPhone || false);
  const [addPhoneCountry, setAddPhoneCountry] = useState("+46");
  const [addPhoneNum, setAddPhoneNum] = useState("");
  const [addPhoneLoading, setAddPhoneLoading] = useState(false);
  const [addPhoneError, setAddPhoneError] = useState("");
  // Apple-name gate (only fires when /api/profile.needsName === true).
  const [showAddName, setShowAddName] = useState(false);
  const [addFirstName, setAddFirstName] = useState("");
  const [addLastName, setAddLastName] = useState("");
  const [addNameSaving, setAddNameSaving] = useState(false);
  const [addNameError, setAddNameError] = useState("");
  const [activeTab, setActiveTab] = useState<"overview" | "orders" | "settings" | "deals" | "addresses">("overview");
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

  // Google/Apple sign-in completed: if the OAuth user has no verified phone
  // yet, gate them — DO NOT setToken/setProfile until they finish phone+OTP
  // via the dedicated AddPhone flow on this screen. This is a backstop; the
  // backend also rejects OAuth-only users on protected endpoints.
  const handleSocialAuthResult = useCallback((result: { token: string; user: any }) => {
    setSocialLoading(null);
    setToken(result.token);
    setProfile(result.user);
    if (result.user?.needsName) {
      setShowAddName(true);
      // Phone collection (if also needed) happens after name in this flow,
      // so don't open AddPhone yet — handleAddName will route to it.
      return;
    }
    if (result.user?.needsPhone) {
      setShowAddPhone(true);
      return;
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
        setShowAddPhone(true);
      } else {
        fetchProfileData(token);
      }
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
        const [ordersResR, dealsResR, addressResR, claimedResR] = await Promise.allSettled([
          api.get("/api/profile/orders", { headers }),
          api.get("/api/profile/deals", { headers }),
          api.get("/api/profile/addresses", { headers }),
          api.get("/api/profile/claimed-deals", { headers }),
        ]);
        const ordersRes = ordersResR.status === "fulfilled" ? ordersResR.value : { data: [] };
        const dealsRes = dealsResR.status === "fulfilled" ? dealsResR.value : { data: [] };
        const addressRes = addressResR.status === "fulfilled" ? addressResR.value : { data: [] };
        const claimedRes = claimedResR.status === "fulfilled" ? claimedResR.value : { data: { claimed: [], global: [] } };

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
        setShowAddPhone(!nextProfile?.phone);
        setScreenCache<ProfileScreenCache>("profile", authToken, {
          profile: nextProfile,
          orders: (ordersRes.data || []) as Order[],
          deals: (dealsRes.data || []) as PersonalDeal[],
          savedAddresses: (addressRes.data || []) as SavedAddress[],
          editName: nextProfile?.name || "",
          editEmail: nextProfile?.email || "",
          showAddPhone: !nextProfile?.phone,
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
      setShowAddPhone(false);
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

  const sendOtpToPhone = useCallback(async (phoneNumber: string) => {
    setAuthLoading(true);
    setLoginError("");
    setAddPhoneError("");
    try {
      // Always go through our Twilio-backed /send-otp endpoint. When the
      // current session is an OAuth user missing a phone we forward the
      // Supabase JWT so /verify-otp later attaches the new number to that
      // existing account rather than minting a phone-only one.
      const isLinking = !!token && !!(profile as any)?.needsPhone;
      const headers = isLinking && token
        ? { Authorization: `Bearer ${token}` }
        : undefined;
      const { data } = await api.post("/api/auth/send-otp", { phone: phoneNumber }, { headers });
      if (data?.devCode) setOtpCode(data.devCode);
      setOtpPhone(phoneNumber);
      setShowOtp(true);
      setShowAddPhone(false);
    } catch (error: any) {
      const msg = error?.response?.data?.error || error?.message || "Kunde inte skicka kod";
      setLoginError(msg);
      setAddPhoneError(msg);
    } finally {
      setAuthLoading(false);
      setAddPhoneLoading(false);
    }
  }, [token, profile]);

  const handleSendOtp = useCallback(async () => {
    if (!phone.trim()) {
      Alert.alert("Nummer krävs", "Ange telefonnumret du använder på webben.");
      return;
    }
    const internationalPhone = buildInternationalPhone(countryCode, phone);
    if (!normalizePhone(internationalPhone)) {
      Alert.alert("Nummer krävs", "Ange ett giltigt telefonnummer.");
      return;
    }

    setAuthLoading(true);
    try {
      // Check if phone exists in DB before sending OTP
      const { data: lookup } = await api.post("/api/auth/lookup-phone", { phone: internationalPhone });

      if (!lookup.exists) {
        setAuthLoading(false);
        // It's a new number, force them to the registration flow
        openRegister(internationalPhone);
        return;
      }

      await sendOtpToPhone(internationalPhone);
    } catch (e: any) {
       setAuthLoading(false);
       setLoginError("Kunde inte verifiera numret. Försök igen.");
    }
  }, [buildInternationalPhone, countryCode, normalizePhone, phone, sendOtpToPhone, openRegister]);

  const handleAddPhone = useCallback(async () => {
    if (!addPhoneNum.trim()) {
      setAddPhoneError("Ange telefonnummer");
      return;
    }
    setAddPhoneLoading(true);
    const internationalPhone = buildInternationalPhone(addPhoneCountry, addPhoneNum);
    await sendOtpToPhone(internationalPhone);
  }, [addPhoneCountry, addPhoneNum, buildInternationalPhone, sendOtpToPhone]);

  const verifyOtp = useCallback(async () => {
    if (!otpCode.trim()) return;
    setAuthLoading(true);
    setLoginError("");
    try {
      const isLinking = !!token && !!(profile as any)?.needsPhone;
      if (isLinking) {
        // Twilio verify with the Supabase JWT attached: /verify-otp links the
        // phone (uniquely) to the OAuth user record. We keep the same JWT and
        // just re-fetch the profile to clear `needsPhone`.
        await api.post(
          "/api/auth/verify-otp",
          { phone: otpPhone, code: otpCode },
          { headers: { Authorization: `Bearer ${token}` } },
        );
        try {
          const profileRes = await api.get('/api/profile', { headers: { Authorization: `Bearer ${token}` } });
          setProfile(profileRes.data);
        } catch {}
        setShowOtp(false);
        setOtpCode("");
        setAddPhoneNum("");
        setPageLoading(true);
        return;
      }

      // Phone-only login / registration. Backend creates or fetches the user
      // by phone and returns our own JWT — no Supabase session is involved.
      const { data } = await api.post("/api/auth/verify-otp", {
        phone: otpPhone,
        code: otpCode,
      });
      const tok = data?.token;
      if (!tok) throw new Error("Ingen session mottogs");
      setToken(tok);
      const nextProfile = data?.user || {
        id: "",
        name: "",
        phone: otpPhone,
        isVerified: true,
      };
      setProfile(nextProfile);
      setShowOtp(false);
      setOtpCode("");
      setPhone("");
      setAddPhoneNum("");
      setPageLoading(true);
    } catch (error: any) {
      setLoginError(error?.response?.data?.error || error?.message || "Felaktig kod");
    } finally {
      setAuthLoading(false);
    }
  }, [otpCode, otpPhone, profile, setProfile, setToken, token]);

  const handleSocialLogin = useCallback(
    async (provider: "google" | "facebook" | "apple") => {
      setSocialLoading(provider);
      if (provider === "google") {
        await googlePrompt();
      } else if (provider === "apple") {
        await applePrompt();
      } else {
        try {
          const { data, error: oauthErr } = await supabase.auth.signInWithOAuth({
            provider: "facebook",
            options: {
              redirectTo: SUPABASE_REDIRECT_URL,
              skipBrowserRedirect: true,
              // Scopes så Facebook ger first_name/last_name + email i
              // user_metadata. Backend mappar dessa exakt som Google/Apple,
              // sen tar PhoneGateScreen vid om telefon saknas.
              scopes: "email,public_profile",
            },
          });
          if (oauthErr || !data.url) throw oauthErr ?? new Error("No OAuth URL");
          const result = await WebBrowser.openAuthSessionAsync(data.url, SUPABASE_REDIRECT_URL);
          if (result.type === "success" && result.url) {
            const {
              code,
              accessToken,
              refreshToken,
              error: authError,
            } = parseAuthRedirect(result.url);
            if (authError) throw new Error(authError);

            let sessionAccessToken: string | undefined;

            if (accessToken && refreshToken) {
              const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
                access_token: accessToken,
                refresh_token: refreshToken,
              });
              if (sessionError) throw sessionError;
              sessionAccessToken = sessionData.session?.access_token;
            } else if (code) {
              const { data: sessionData, error: sessionError } = await supabase.auth.exchangeCodeForSession(code);
              if (sessionError) throw sessionError;
              sessionAccessToken = sessionData.session?.access_token;
            }

            if (sessionAccessToken) {
              const profileRes = await api.get("/api/profile", {
                headers: { Authorization: `Bearer ${sessionAccessToken}` },
              });
              setToken(sessionAccessToken);
              setProfile(profileRes.data);
              fetchProfileData(sessionAccessToken);
            }
          }
        } catch {
          Alert.alert("Inloggning misslyckades", "Kontrollera anslutningen och försök igen.");
        } finally {
          setSocialLoading(null);
        }
      }
    },
    [googlePrompt, applePrompt, fetchProfileData, setToken, setProfile]
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
    setShowOtp(false);
    setShowAddPhone(false);
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

          {/* Form card + buttons — slide up together */}
          <Animated.View style={{ opacity: guestCardOpacity, transform: [{ translateY: guestCardY }] }}>
            <View style={[styles.formCard, { borderRadius: 30, marginTop: 24, padding: 20 }]}>
              <Text style={{ color: palette.muted, fontSize: 10, fontWeight: "900", letterSpacing: ls(2), marginBottom: 12 }}>{t('profile.overview.phone').toUpperCase()}</Text>
              <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
                <Pressable
                  onPress={() => {
                    const currentIndex = COUNTRY_CODES.findIndex((item) => item.code === countryCode);
                    const next = COUNTRY_CODES[(currentIndex + 1) % COUNTRY_CODES.length];
                    setCountryCode(next.code);
                  }}
                  style={{
                    width: 100, borderRadius: 18,
                    backgroundColor: palette.card, borderWidth: 1, borderColor: palette.border,
                    paddingHorizontal: 12, paddingVertical: 18,
                    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
                  }}
                >
                  <Text style={{ fontSize: 20 }}>{COUNTRY_CODES.find((item) => item.code === countryCode)?.flag || "🇸🇪"}</Text>
                  <Text style={{ color: palette.text, fontSize: 14, fontWeight: "900" }}>{countryCode}</Text>
                </Pressable>

                <View style={{ flex: 1 }}>
                  <TextInput
                    style={[styles.input, { marginBottom: 0, fontSize: 18, fontWeight: "800", paddingVertical: 18 }]}
                    placeholder="070 000 00 00"
                    placeholderTextColor={palette.muted}
                    keyboardType="phone-pad"
                    value={phone}
                    onChangeText={setPhone}
                  />
                </View>
              </View>

              {!!loginError && <Text style={{ color: palette.danger, fontSize: 11, fontWeight: "800", marginTop: 14, textAlign: "center" }}>{loginError}</Text>}

              <PrimaryButton label={authLoading ? t('common.loading') : t('common.continue').toUpperCase()} onPress={handleSendOtp} disabled={authLoading} style={{ marginTop: 18 }} />

              <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginTop: 28, marginBottom: 18 }}>
                <View style={{ flex: 1, height: 1, backgroundColor: palette.border }} />
                <Text style={{ color: palette.muted, fontSize: 10, fontWeight: "900", letterSpacing: ls(2) }}>{t('common.or')}</Text>
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

              <View style={{ flexDirection: "row", gap: 12 }}>
                {(["google", "facebook"] as const).map((provider) => (
                  <Animated.View key={provider} style={provider === "google" ? { flex: 1, transform: [{ scale: googleGuestScale }] } : { flex: 1 }}>
                    <Pressable
                      onPress={() => handleSocialLogin(provider)}
                      onPressIn={provider === "google" ? () => Animated.spring(googleGuestScale, { toValue: 0.96, useNativeDriver: true, speed: 60, bounciness: 0 }).start() : undefined}
                      onPressOut={provider === "google" ? () => Animated.spring(googleGuestScale, { toValue: 1, useNativeDriver: true, speed: 60, bounciness: 0 }).start() : undefined}
                      style={{
                        backgroundColor: palette.card, borderRadius: 24, borderWidth: 1, borderColor: palette.border,
                        paddingVertical: 18, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
                        opacity: socialLoading !== null && socialLoading !== provider ? 0.6 : 1,
                      }}
                    >
                      <Ionicons
                        name={socialLoading === provider ? "hourglass-outline" : provider === "google" ? "logo-google" : "logo-facebook"}
                        size={20}
                        color={provider === "facebook" ? "#1877f2" : "#DB4437"}
                      />
                      <Text style={{ color: palette.text, fontSize: 13, fontWeight: "900" }}>{provider.toUpperCase()}</Text>
                    </Pressable>
                  </Animated.View>
                ))}
              </View>
            </View>

            {openEmailLogin && (
              <Pressable style={{ marginTop: 18, paddingVertical: 6 }} onPress={openEmailLogin}>
                <Text style={{ color: palette.muted, fontSize: 12, fontWeight: "900", textAlign: "center", letterSpacing: 1.2 }}>
                  ELLER <Text style={{ color: palette.gold }}>LOGGA IN MED EMAIL</Text>
                </Text>
              </Pressable>
            )}

            <Pressable style={{ marginTop: 18 }} onPress={() => openRegister()}>
              <Text style={{ color: palette.muted, fontSize: 12, fontWeight: "900", textAlign: "center" }}>
                INGET KONTO? <Text style={{ color: palette.gold }}>SKAPA KONTO GRATIS</Text>
              </Text>
            </Pressable>
          </Animated.View>
        </View>

        <Modal visible={showOtp} transparent animationType="slide" onRequestClose={() => setShowOtp(false)}>
          <View style={styles.modalBackdrop}>
            <View style={[styles.modalCard, { borderRadius: 30 }]}>
              <Text style={{ color: palette.text, fontSize: 16, fontWeight: "900", marginBottom: 8 }}>{t('profile.otp.title')}</Text>
              <Text style={{ color: palette.muted, fontSize: 12, fontWeight: "700" }}>{t('profile.otp.sent', { phone: otpPhone })}</Text>
              <TextInput
                style={styles.input}
                placeholder="123 456"
                placeholderTextColor={palette.muted}
                value={otpCode}
                onChangeText={(value) => setOtpCode(value.replace(/[^0-9]/g, ""))}
                keyboardType="number-pad"
              />
              {!!loginError && <Text style={{ color: palette.danger, fontSize: 11, fontWeight: "800", marginBottom: 10, textAlign: "center" }}>{loginError}</Text>}
              <PrimaryButton label={authLoading ? t('common.loading') : t('profile.otp.confirmBtn')} onPress={verifyOtp} disabled={authLoading} icon="shield-checkmark-outline" />
              <Pressable style={{ marginTop: 10 }} onPress={() => setShowOtp(false)}>
                <Text style={{ color: palette.gold, fontWeight: "700", textAlign: "center" }}>{t('profile.otp.cancelBtn')}</Text>
              </Pressable>
            </View>
          </View>
        </Modal>

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
          <View style={[styles.formCard, { borderRadius: 30, padding: 22, gap: 18 }]}>
            {[
              { icon: "call-outline", label: t('profile.overview.phone').toUpperCase(), value: profile.phone || "Ej angivet", onPress: undefined },
              { icon: "mail-outline", label: "E-POST", value: profile.email || "Ej angivet", onPress: undefined },
              { icon: "home-outline", label: t('profile.overview.address').toUpperCase(), value: deliveryAddress || savedAddresses.find((a) => a.isDefault)?.street || "Ej angivet", onPress: () => setActiveTab("addresses") },
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
          <View style={[styles.formCard, { borderRadius: 30, padding: 0, overflow: "hidden" }]}>
            <Pressable
              onPress={() => {
                const id = profile?.id ? ` #${profile.id}` : "";
                const emailLine = profile?.email ? `\n\nE-post: ${profile.email}` : "";
                const phoneLine = profile?.phone ? `\nTelefon: ${profile.phone}` : "";
                const subject = `Hjälp${id}`;
                const body = `Hej MatGo-support,${emailLine}${phoneLine}\n\nBeskriv ditt ärende här:\n`;
                const url = `mailto:support@matgo.se?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
                Linking.openURL(url).catch(() => {
                  Alert.alert("Kunde inte öppna e-post", "Skicka istället direkt till support@matgo.se");
                });
              }}
              style={{ padding: 20, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
            >
              <Text style={{ color: palette.text, fontSize: 14, fontWeight: "800" }}>Kontakt & hjälp</Text>
              <Ionicons name="chatbubble-ellipses-outline" size={18} color={palette.muted} />
            </Pressable>
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
              <Text style={{ color: palette.text, fontSize: 14, fontWeight: "800" }}>Användarvillkor</Text>
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
              <Text style={{ color: palette.text, fontSize: 14, fontWeight: "800" }}>Integritetspolicy</Text>
              <Ionicons name="shield-checkmark-outline" size={18} color={palette.muted} />
            </Pressable>
          </View>
          <View style={[styles.formCard, { borderRadius: 30, padding: 0, overflow: "hidden" }]}>
            <Pressable onPress={handleDeleteAccount} style={{ padding: 20, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={{ color: palette.danger, fontSize: 14, fontWeight: "800" }}>{t('profile.settings.deleteAccount')}</Text>
              <Ionicons name="trash-outline" size={18} color={palette.danger} />
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
              Nuvarande nummer: {profile.phone || "Ej angivet"}
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
            label={isSavingPhone ? "Sparar…" : "Spara telefon"}
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

      {/* OTP modal */}
      <Modal visible={showOtp} transparent animationType="slide" onRequestClose={() => setShowOtp(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { borderRadius: 30 }]}>
            <Text style={{ color: palette.text, fontSize: 16, fontWeight: "900", marginBottom: 8 }}>{t('profile.otp.title')}</Text>
            <Text style={{ color: palette.muted, fontSize: 12, fontWeight: "700" }}>{t('profile.otp.sent', { phone: otpPhone })}</Text>
            <TextInput
              style={styles.input}
              placeholder="000 000"
              placeholderTextColor={palette.muted}
              value={otpCode}
              onChangeText={(value) => setOtpCode(value.replace(/[^0-9]/g, ""))}
              keyboardType="number-pad"
            />
            {!!loginError && <Text style={{ color: palette.danger, fontSize: 11, fontWeight: "800", marginBottom: 10, textAlign: "center" }}>{loginError}</Text>}
            <PrimaryButton label={authLoading ? t('common.loading') : t('profile.otp.confirmBtn')} onPress={verifyOtp} disabled={authLoading} icon="shield-checkmark-outline" />
            <Pressable style={{ marginTop: 10 }} onPress={() => setShowOtp(false)}>
              <Text style={{ color: palette.gold, fontWeight: "700", textAlign: "center" }}>{t('profile.otp.cancelBtn')}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </ScreenWrap>
  );
}
