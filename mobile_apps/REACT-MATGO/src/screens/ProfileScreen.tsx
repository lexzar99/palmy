import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Image,
  Pressable,
  Text,
  TextInput,
  View,
  Modal,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { useAppStore } from "../store/useAppStore";
import { useGoogleAuth } from "../hooks/useGoogleAuth";
import { api } from "../lib/api";
import { supabase } from "../lib/supabase";
import { palette, styles } from "../constants/theme";
import { ScreenWrap, PrimaryButton } from "../components/ui";
import { ProfileScreenSkeleton } from "../components/SkeletonLoader";

import type { Order, SavedAddress } from "../types";



const APP_AUTH_DEEP_LINK = "matgo://auth/callback";
const SUPABASE_REDIRECT_URL = "matgo://auth/callback";
const WEB_URL = "https://matgo.se";

const COUNTRY_CODES = [
  { code: "+46", flag: "🇸🇪", name: "Sweden" },
  { code: "+45", flag: "🇩🇰", name: "Denmark" },
  { code: "+47", flag: "🇳🇴", name: "Norway" },
  { code: "+358", flag: "🇫🇮", name: "Finland" },
  { code: "+44", flag: "🇬🇧", name: "UK" },
  { code: "+1", flag: "🇺🇸", name: "USA" },
];

const PREFERENCE_OPTIONS = [
  "Gluten",
  "Laktos",
  "Nötter",
  "Ägg",
  "Fisk",
  "Skaldjur",
  "Soja",
  "Selleri",
  "Senap",
  "Sesam",
  "Vetemjöl",
  "Mjölk",
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

export default function ProfileScreen({
  openRegister,
  openOrder,
  openCart,
}: {
  openRegister: (initialPhone?: string) => void;
  openOrder: (id: string) => void;
  openCart: () => void;
}) {
  const token = useAppStore((s) => s.token);
  const setToken = useAppStore((s) => s.setToken);
  const profile = useAppStore((s) => s.profile);
  const setProfile = useAppStore((s) => s.setProfile);
  const clearSession = useAppStore((s) => s.clearSession);
  const addItem = useAppStore((s) => s.addItem);
  const clearCart = useAppStore((s) => s.clearCart);
  const dislikedIngredients = useAppStore((s) => s.dislikedIngredients);
  const setDislikedIngredients = useAppStore((s) => s.setDislikedIngredients);

  const [orders, setOrders] = useState<Order[]>([]);
  const [deals, setDeals] = useState<PersonalDeal[]>([]);
  const [savedAddresses, setSavedAddresses] = useState<SavedAddress[]>([]);
  const [phone, setPhone] = useState("");
  const [countryCode, setCountryCode] = useState("+46");
  const [otpCode, setOtpCode] = useState("");
  const [otpPhone, setOtpPhone] = useState("");
  const [showOtp, setShowOtp] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const [authLoading, setAuthLoading] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [socialLoading, setSocialLoading] = useState<"google" | "facebook" | null>(null);
  const [showAddPhone, setShowAddPhone] = useState(false);
  const [addPhoneCountry, setAddPhoneCountry] = useState("+46");
  const [addPhoneNum, setAddPhoneNum] = useState("");
  const [addPhoneLoading, setAddPhoneLoading] = useState(false);
  const [addPhoneError, setAddPhoneError] = useState("");
  const [activeTab, setActiveTab] = useState<"overview" | "orders" | "settings" | "deals" | "addresses">("overview");
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [newAddrLabel, setNewAddrLabel] = useState("Hem");
  const [newAddrStreet, setNewAddrStreet] = useState("");
  const [newAddrCity, setNewAddrCity] = useState("");
  const [newAddrZip, setNewAddrZip] = useState("");
  const [newAddrNote, setNewAddrNote] = useState("");
  const [addrSaving, setAddrSaving] = useState(false);
  const [reorderingId, setReorderingId] = useState<string | null>(null);

  // Native Google OAuth
  const { prompt: googlePrompt, tokenResult: googleResult, error: googleError } = useGoogleAuth();

  useEffect(() => {
    if (googleResult) {
      setToken(googleResult.token);
      setProfile(googleResult.user);
      setSocialLoading(null);
      fetchProfileData(googleResult.token);
    }
  }, [googleResult]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (googleError) {
      setSocialLoading(null);
      if (googleError !== "__cancelled__") setLoginError(googleError);
    }
  }, [googleError]);

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

  const parseQueryParams = useCallback((url: string) => {
    const query = url.split("?")[1] || "";
    return query.split("&").reduce<Record<string, string>>((acc, part) => {
      if (!part) return acc;
      const [key, value = ""] = part.split("=");
      acc[decodeURIComponent(key)] = decodeURIComponent(value);
      return acc;
    }, {});
  }, []);

  const fetchProfileData = useCallback(
    async (authToken: string) => {
      setPageLoading(true);
      try {
        const headers = getAuthHeaders(authToken);
        const [profileRes, ordersRes, dealsRes, addressRes] = await Promise.all([
          api.get("/api/profile", { headers }),
          api.get("/api/profile/orders", { headers }),
          api.get("/api/profile/deals", { headers }),
          api.get("/api/profile/addresses", { headers }),
        ]);

        const nextProfile = (profileRes.data || null) as any;
        setProfile(nextProfile);
        setOrders((ordersRes.data || []) as Order[]);
        setDeals((dealsRes.data || []) as PersonalDeal[]);
        setSavedAddresses((addressRes.data || []) as SavedAddress[]);
        setEditName(nextProfile?.name || "");
        setEditEmail(nextProfile?.email || "");
        setShowAddPhone(!nextProfile?.phone);
      } catch {
        clearSession();
        setOrders([]);
        setDeals([]);
        setSavedAddresses([]);
      } finally {
        setPageLoading(false);
      }
    },
    [clearSession, getAuthHeaders, setProfile]
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
    fetchProfileData(token).catch(() => clearSession());
  }, [clearSession, fetchProfileData, setProfile, token]);

  const handleIncomingAuthUrl = useCallback(
    async (url: string | null) => {
      if (!url || !url.startsWith(APP_AUTH_DEEP_LINK)) return;
      const params = parseQueryParams(url);
      if (params.error) {
        Alert.alert("Inloggning misslyckades", params.error);
        return;
      }
      if (!params.token) return;
      setPageLoading(true);
      setLoginError("");
      setToken(params.token);
    },
    [parseQueryParams, setToken]
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

  const sendOtpToPhone = useCallback(async (phoneNumber: string) => {
    setAuthLoading(true);
    setLoginError("");
    setAddPhoneError("");
    try {
      const { error } = await supabase.auth.signInWithOtp({
        phone: phoneNumber,
      });
      if (error) throw error;
      setOtpPhone(phoneNumber);
      setShowOtp(true);
      setShowAddPhone(false);
    } catch (error: any) {
      setLoginError(error.message || "Kunde inte skicka kod");
      setAddPhoneError(error.message || "Kunde inte skicka kod");
    } finally {
      setAuthLoading(false);
      setAddPhoneLoading(false);
    }
  }, []);

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
      const { data, error } = await supabase.auth.verifyOtp({
        phone: otpPhone,
        token: otpCode,
        type: 'sms',
      });
      
      if (error) throw error;
      
      if (data.session) {
        setToken(data.session.access_token);
        const nextProfile = {
          id: data.user?.id || "",
          name: data.user?.user_metadata?.name || data.user?.user_metadata?.full_name || `Gäst ${otpPhone.slice(-4)}`,
          phone: data.user?.phone || otpPhone,
          email: data.user?.email,
          image: data.user?.user_metadata?.avatar_url,
          isVerified: true
        };
        setProfile(nextProfile);
        setShowOtp(false);
        setOtpCode("");
        setPhone("");
        setAddPhoneNum("");
        setPageLoading(true);
      }
    } catch (error: any) {
      setLoginError(error.message || "Felaktig kod");
    } finally {
      setAuthLoading(false);
    }
  }, [otpCode, otpPhone, setProfile, setToken]);

  const handleSocialLogin = useCallback(
    async (provider: "google" | "facebook") => {
      setSocialLoading(provider);
      if (provider === "google") {
        await googlePrompt();
      } else {
        try {
          const { data, error: oauthErr } = await supabase.auth.signInWithOAuth({
            provider: "facebook",
            options: { redirectTo: SUPABASE_REDIRECT_URL, skipBrowserRedirect: true },
          });
          if (oauthErr || !data.url) throw oauthErr ?? new Error("No OAuth URL");
          const result = await WebBrowser.openAuthSessionAsync(data.url, SUPABASE_REDIRECT_URL);
          if (result.type === "success" && result.url) {
            const code = new URL(result.url).searchParams.get("code");
            if (code) {
              const { data: sd } = await supabase.auth.exchangeCodeForSession(code);
              const accessToken = sd.session?.access_token;
              if (accessToken) {
                const profileRes = await api.get("/api/profile", { headers: { Authorization: `Bearer ${accessToken}` } });
                setToken(accessToken);
                setProfile(profileRes.data);
                fetchProfileData(accessToken);
              }
            }
          }
        } catch {
          Alert.alert("Inloggning misslyckades", "Kontrollera anslutningen och försök igen.");
        } finally {
          setSocialLoading(null);
        }
      }
    },
    [googlePrompt, fetchProfileData, setToken, setProfile]
  );

  const handleLogout = useCallback(async () => {
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.warn("Supabase signout issue:", e);
    }
    clearSession();
    setOrders([]);
    setDeals([]);
    setSavedAddresses([]);
    setShowOtp(false);
    setShowAddPhone(false);
    setActiveTab("overview");
    setIsEditing(false);
    setLoginError("");
  }, [clearSession]);

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

  const refreshAddresses = useCallback(async () => {
    if (!token) return;
    await fetchProfileData(token);
  }, [fetchProfileData, token]);

  const handleSaveAddress = useCallback(async () => {
    if (!token) return;
    if (!newAddrStreet.trim() || !newAddrCity.trim() || !newAddrZip.trim()) {
      Alert.alert("Adress saknas", "Fyll i gata, stad och postnummer.");
      return;
    }
    setAddrSaving(true);
    try {
      await api.post(
        "/api/profile/addresses",
        {
          label: newAddrLabel,
          street: newAddrStreet.trim(),
          city: newAddrCity.trim(),
          zip: newAddrZip.trim(),
          note: newAddrNote.trim() || undefined,
          isDefault: savedAddresses.length === 0,
        },
        { headers: getAuthHeaders(token) }
      );
      setNewAddrStreet("");
      setNewAddrCity("");
      setNewAddrZip("");
      setNewAddrNote("");
      await refreshAddresses();
    } catch (error: any) {
      Alert.alert("Kunde inte spara", error?.response?.data?.error || "Försök igen om en stund.");
    } finally {
      setAddrSaving(false);
    }
  }, [addrSaving, getAuthHeaders, newAddrCity, newAddrLabel, newAddrNote, newAddrStreet, newAddrZip, refreshAddresses, savedAddresses.length, token]);

  const setAddressAsDefault = useCallback(
    async (addressId: string) => {
      if (!token) return;
      try {
        await api.patch(`/api/profile/addresses/${addressId}`, { isDefault: true }, { headers: getAuthHeaders(token) });
        await refreshAddresses();
      } catch {
        Alert.alert("Kunde inte uppdatera", "Adressen kunde inte göras till standard.");
      }
    },
    [getAuthHeaders, refreshAddresses, token]
  );

  const deleteSavedAddress = useCallback(
    async (addressId: string) => {
      if (!token) return;
      try {
        await api.delete(`/api/profile/addresses/${addressId}`, { headers: getAuthHeaders(token) });
        setSavedAddresses((current) => current.filter((item) => item.id !== addressId));
      } catch {
        Alert.alert("Kunde inte radera", "Adressen kunde inte tas bort.");
      }
    },
    [getAuthHeaders, token]
  );

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
          <View
            style={{
              width: 108,
              height: 108,
              borderRadius: 34,
              backgroundColor: "rgba(234,181,69,0.1)",
              borderWidth: 1,
              borderColor: "rgba(234,181,69,0.2)",
              alignItems: "center",
              justifyContent: "center",
              alignSelf: "center",
              marginBottom: 22,
            }}
          >
            <Ionicons name="lock-closed-outline" size={44} color={palette.gold} />
          </View>

          <Text style={{ color: palette.text, fontSize: 34, fontWeight: "900", textAlign: "center" }}>VÄLKOMMEN</Text>
          <Text style={{ color: palette.gold, fontSize: 34, fontWeight: "900", textAlign: "center", marginTop: -2 }}>TILLBAKA</Text>
          <Text style={{ color: palette.muted, fontSize: 11, fontWeight: "900", letterSpacing: 2, textAlign: "center", marginTop: 18 }}>
            LOGGA IN MED TELEFON ELLER SOCIALT KONTO
          </Text>

          <View style={[styles.formCard, { borderRadius: 30, marginTop: 24, padding: 20 }]}>
            <Text style={{ color: palette.muted, fontSize: 10, fontWeight: "900", letterSpacing: 2, marginBottom: 12 }}>TELEFONNUMMER</Text>
            <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
              <Pressable
                onPress={() => {
                  const currentIndex = COUNTRY_CODES.findIndex((item) => item.code === countryCode);
                  const next = COUNTRY_CODES[(currentIndex + 1) % COUNTRY_CODES.length];
                  setCountryCode(next.code);
                }}
                style={{
                  width: 100,
                  borderRadius: 18,
                  backgroundColor: palette.card,
                  borderWidth: 1,
                  borderColor: palette.border,
                  paddingHorizontal: 12,
                  paddingVertical: 18,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
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

            <PrimaryButton label={authLoading ? "FORTSATT..." : "FORTSATT"} onPress={handleSendOtp} disabled={authLoading} style={{ marginTop: 18 }} />

            <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginTop: 28, marginBottom: 18 }}>
              <View style={{ flex: 1, height: 1, backgroundColor: palette.border }} />
              <Text style={{ color: palette.muted, fontSize: 10, fontWeight: "900", letterSpacing: 2 }}>ELLER MED SOCIALT</Text>
              <View style={{ flex: 1, height: 1, backgroundColor: palette.border }} />
            </View>

            <View style={{ flexDirection: "row", gap: 12 }}>
              {(["google", "facebook"] as const).map((provider) => (
                <Pressable
                  key={provider}
                  onPress={() => handleSocialLogin(provider)}
                  style={{
                    flex: 1,
                    backgroundColor: palette.card,
                    borderRadius: 24,
                    borderWidth: 1,
                    borderColor: palette.border,
                    paddingVertical: 18,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 10,
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
              ))}
            </View>
          </View>

          <Pressable style={{ marginTop: 24 }} onPress={() => openRegister()}>
            <Text style={{ color: palette.muted, fontSize: 12, fontWeight: "900", textAlign: "center" }}>
              INGET KONTO? <Text style={{ color: palette.gold }}>SKAPA KONTO GRATIS</Text>
            </Text>
          </Pressable>
        </View>

        <Modal visible={showOtp} transparent animationType="slide" onRequestClose={() => setShowOtp(false)}>
          <View style={styles.modalBackdrop}>
            <View style={[styles.modalCard, { borderRadius: 30 }]}>
              <Text style={{ color: palette.text, fontSize: 16, fontWeight: "900", marginBottom: 8 }}>Verifiera kod</Text>
              <Text style={{ color: palette.muted, fontSize: 12, fontWeight: "700" }}>Kod skickad till {otpPhone}</Text>
              <TextInput
                style={styles.input}
                placeholder="123 456"
                placeholderTextColor={palette.muted}
                value={otpCode}
                onChangeText={(value) => setOtpCode(value.replace(/[^0-9]/g, ""))}
                keyboardType="number-pad"
              />
              {!!loginError && <Text style={{ color: palette.danger, fontSize: 11, fontWeight: "800", marginBottom: 10, textAlign: "center" }}>{loginError}</Text>}
              <PrimaryButton label={authLoading ? "VERIFIERAR..." : "BEKRÄFTA KOD"} onPress={verifyOtp} disabled={authLoading} icon="shield-checkmark-outline" />
              <Pressable style={{ marginTop: 10 }} onPress={() => setShowOtp(false)}>
                <Text style={{ color: palette.gold, fontWeight: "700", textAlign: "center" }}>Avbryt</Text>
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
                {profile?.isVerified ? "Verifierad" : "Ej verifierad"}
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
            { id: "overview", icon: "person-outline", label: "HEM" },
            { id: "deals", icon: "sparkles-outline", label: "DEALS" },
            { id: "orders", icon: "time-outline", label: "ORDER" },
            { id: "addresses", icon: "location-outline", label: "ADRESS" },
            { id: "settings", icon: "settings-outline", label: "INST" },
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
            <Text style={{ color: activeTab === tab.id ? palette.text : palette.muted, fontSize: 8, fontWeight: "900" }}>{tab.label}</Text>
          </Pressable>
        ))}
      </View>

      {/* Overview tab */}
      {activeTab === "overview" && (
        <>
          <View style={[styles.formCard, { borderRadius: 30, padding: 22, gap: 18 }]}>
            {[
              { icon: "call-outline", label: "TELEFON", value: profile.phone || "Ej angivet" },
              { icon: "mail-outline", label: "E-POST", value: profile.email || "Ej angivet" },
              { icon: "home-outline", label: "STANDARDADRESS", value: savedAddresses.find((a) => a.isDefault)?.street || (profile as any).address || "Ingen sparad adress" },
            ].map(({ icon, label, value }) => (
              <View key={label} style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
                <Ionicons name={icon as any} size={16} color={palette.muted} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: palette.muted, fontSize: 9, fontWeight: "900", letterSpacing: 1.6 }}>{label}</Text>
                  <Text style={{ color: palette.text, fontSize: 14, fontWeight: "800", marginTop: 2 }}>{value}</Text>
                </View>
              </View>
            ))}
          </View>

          {/* Preference options */}
          <View style={[styles.formCard, { borderRadius: 34, padding: 22, marginBottom: 20 }]}>
            <Text style={{ color: palette.text, fontSize: 16, fontWeight: "900", fontStyle: "italic", marginBottom: 12 }}>MINA PREFERENSER</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {PREFERENCE_OPTIONS.map((pref) => {
                const active = dislikedIngredients.includes(pref);
                return (
                  <Pressable
                    key={pref}
                    onPress={() => {
                      const next = active ? dislikedIngredients.filter((i) => i !== pref) : [...dislikedIngredients, pref];
                      setDislikedIngredients(next);
                    }}
                    style={{
                      paddingHorizontal: 14,
                      paddingVertical: 10,
                      borderRadius: 14,
                      backgroundColor: active ? "rgba(234,181,69,0.15)" : palette.panelMuted,
                      borderWidth: 1,
                      borderColor: active ? palette.gold : palette.border,
                    }}
                  >
                    <Text style={{ color: active ? palette.gold : palette.muted, fontSize: 11, fontWeight: "900" }}>{pref.toUpperCase()}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </>
      )}

      {/* Deals tab */}
      {activeTab === "deals" && (
        <View style={{ gap: 12 }}>
          {!deals.length ? (
            <View style={[styles.formCard, { borderRadius: 30, padding: 26, alignItems: "center" }]}>
              <Ionicons name="pricetags-outline" size={34} color={palette.muted} />
              <Text style={{ color: palette.muted, fontSize: 12, fontWeight: "900", marginTop: 14 }}>Inga erbjudanden tillgängliga</Text>
            </View>
          ) : (
            deals.map((deal) => (
              <View key={deal.id || deal.code} style={{ backgroundColor: "rgba(234,181,69,0.06)", borderRadius: 30, borderWidth: 1, borderColor: "rgba(234,181,69,0.18)", padding: 22, gap: 16 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 14 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: palette.gold, fontSize: 10, fontWeight: "900", textTransform: "uppercase" }}>{deal.campaign?.title || "Personligt erbjudande"}</Text>
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
          )}
        </View>
      )}

      {/* Orders tab */}
      {activeTab === "orders" && (
        <View style={{ gap: 12 }}>
          {!orders.length ? (
            <View style={[styles.formCard, { borderRadius: 30, padding: 26, alignItems: "center" }]}>
              <Ionicons name="time-outline" size={34} color={palette.muted} />
              <Text style={{ color: palette.muted, fontSize: 12, fontWeight: "900", marginTop: 14 }}>Inga ordrar ännu</Text>
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
                      {reorderingId === order.id ? "Laddar" : "Beställ igen"}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => openOrder(order.id)}
                    style={{ backgroundColor: palette.panelMuted, borderRadius: 14, borderWidth: 1, borderColor: palette.border, paddingHorizontal: 14, paddingVertical: 12, flexDirection: "row", alignItems: "center", gap: 8 }}
                  >
                    <Ionicons name="chevron-forward-outline" size={14} color={palette.text} />
                    <Text style={{ color: palette.text, fontSize: 10, fontWeight: "900", textTransform: "uppercase" }}>Detaljer</Text>
                  </Pressable>
                </View>
              </View>
            ))
          )}
        </View>
      )}

      {/* Addresses tab */}
      {activeTab === "addresses" && (
        <View style={{ gap: 14 }}>
          {savedAddresses.map((addr) => (
            <View key={addr.id} style={[styles.formCard, { borderRadius: 26, padding: 18, flexDirection: "row", gap: 12, alignItems: "center" }]}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: palette.text, fontSize: 14, fontWeight: "900", fontStyle: "italic", textTransform: "uppercase" }}>{addr.label}</Text>
                <Text style={{ color: palette.muted, fontSize: 10, fontWeight: "800", marginTop: 4 }}>{addr.street}, {addr.zip} {addr.city}</Text>
              </View>
              <View style={{ gap: 8 }}>
                {!addr.isDefault && (
                  <Pressable onPress={() => setAddressAsDefault(addr.id)} style={{ padding: 8 }}>
                    <Ionicons name="checkmark-outline" size={16} color={palette.gold} />
                  </Pressable>
                )}
                <Pressable
                  onPress={() => {
                    Alert.alert("Radera adress?", "Den här adressen tas bort från ditt konto.", [
                      { text: "Avbryt", style: "cancel" },
                      { text: "Radera", style: "destructive", onPress: () => { void deleteSavedAddress(addr.id); } },
                    ]);
                  }}
                  style={{ padding: 8 }}
                >
                  <Ionicons name="trash-outline" size={16} color={palette.danger} />
                </Pressable>
              </View>
            </View>
          ))}
          <View style={[styles.formCard, { borderRadius: 30, padding: 20, gap: 12 }]}>
            <Text style={{ color: palette.text, fontSize: 15, fontWeight: "900", fontStyle: "italic" }}>LÄGG TILL ADRESS</Text>
            <TextInput style={styles.input} placeholder="Gatuadress" placeholderTextColor={palette.muted} value={newAddrStreet} onChangeText={setNewAddrStreet} />
            <View style={{ flexDirection: "row", gap: 10 }}>
              <TextInput style={[styles.input, { flex: 1, marginBottom: 0 }]} placeholder="Stad" placeholderTextColor={palette.muted} value={newAddrCity} onChangeText={setNewAddrCity} />
              <TextInput style={[styles.input, { flex: 1, marginBottom: 0 }]} placeholder="Postnummer" placeholderTextColor={palette.muted} value={newAddrZip} onChangeText={setNewAddrZip} />
            </View>
            <TextInput style={[styles.input, { marginBottom: 0 }]} placeholder="Portkod, våning (valfritt)" placeholderTextColor={palette.muted} value={newAddrNote} onChangeText={setNewAddrNote} />
            <PrimaryButton label={addrSaving ? "SPARAR..." : "SPARA ADRESS"} onPress={handleSaveAddress} disabled={addrSaving} icon="add-outline" style={{ marginTop: 4 }} />
          </View>
        </View>
      )}

      {/* Settings tab */}
      {activeTab === "settings" && !isEditing && (
        <View style={{ gap: 14 }}>
          <View style={[styles.formCard, { borderRadius: 30, padding: 0, overflow: "hidden" }]}>
            <Pressable onPress={() => setIsEditing(true)} style={{ padding: 20, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={{ color: palette.text, fontSize: 14, fontWeight: "800" }}>Redigera profil</Text>
              <Ionicons name="chevron-forward-outline" size={18} color={palette.muted} />
            </Pressable>
          </View>
          <View style={[styles.formCard, { borderRadius: 30, padding: 0, overflow: "hidden" }]}>
            <Pressable onPress={handleDeleteAccount} style={{ padding: 20, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={{ color: palette.danger, fontSize: 14, fontWeight: "800" }}>Radera konto</Text>
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
            <Text style={{ color: palette.text, fontSize: 18, fontWeight: "900", fontStyle: "italic" }}>ÄNDRA UPPGIFTER</Text>
          </View>
          <TextInput style={styles.input} placeholder="Namn" placeholderTextColor={palette.muted} value={editName} onChangeText={setEditName} />
          <TextInput style={styles.input} placeholder="E-post" placeholderTextColor={palette.muted} value={editEmail} onChangeText={setEditEmail} keyboardType="email-address" autoCapitalize="none" />
          <TextInput style={[styles.input, { color: palette.muted }]} editable={false} value={profile.phone || "Ej angivet"} />
          <PrimaryButton
            label={isSaving ? "SPARAR..." : saveSuccess ? "SPARAT" : "SPARA"}
            onPress={handleUpdateProfile}
            disabled={isSaving}
            icon={saveSuccess ? "checkmark-outline" : "save-outline"}
            style={saveSuccess ? { backgroundColor: palette.success } : undefined}
          />
        </View>
      )}

      {/* OTP modal */}
      <Modal visible={showOtp} transparent animationType="slide" onRequestClose={() => setShowOtp(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { borderRadius: 30 }]}>
            <Text style={{ color: palette.text, fontSize: 16, fontWeight: "900", marginBottom: 8 }}>Verifiera kod</Text>
            <Text style={{ color: palette.muted, fontSize: 12, fontWeight: "700" }}>Kod skickad till {otpPhone}</Text>
            <TextInput
              style={styles.input}
              placeholder="000 000"
              placeholderTextColor={palette.muted}
              value={otpCode}
              onChangeText={(value) => setOtpCode(value.replace(/[^0-9]/g, ""))}
              keyboardType="number-pad"
            />
            {!!loginError && <Text style={{ color: palette.danger, fontSize: 11, fontWeight: "800", marginBottom: 10, textAlign: "center" }}>{loginError}</Text>}
            <PrimaryButton label={authLoading ? "VERIFIERAR..." : "BEKRÄFTA KOD"} onPress={verifyOtp} disabled={authLoading} icon="shield-checkmark-outline" />
            <Pressable style={{ marginTop: 10 }} onPress={() => setShowOtp(false)}>
              <Text style={{ color: palette.gold, fontWeight: "700", textAlign: "center" }}>Avbryt</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </ScreenWrap>
  );
}
