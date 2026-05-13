import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, Pressable, Platform, ScrollView,
  Animated, Easing, ActivityIndicator, StatusBar, StyleSheet, Modal, KeyboardAvoidingView, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useTranslation } from 'react-i18next';
import { useLanguage } from '../hooks/useLanguage';
import { useAppStore } from '../store/useAppStore';
import { api } from '../lib/api';
import { useSharedStyles, useTheme } from '../theme';
import { useGoogleAuth } from '../hooks/useGoogleAuth';
import { useAppleAuth } from '../hooks/useAppleAuth';

const COUNTRY_CODES = [
  { code: "+46", flag: "🇸🇪", name: "Sweden" },
  { code: "+45", flag: "🇩🇰", name: "Denmark" },
  { code: "+47", flag: "🇳🇴", name: "Norway" },
  { code: "+358", flag: "🇫🇮", name: "Finland" },
  { code: "+44", flag: "🇬🇧", name: "UK" },
  { code: "+1", flag: "🇺🇸", name: "USA" },
];

type MainStep = "notifications" | "auth" | "location";
type AuthStep = "landing" | "phone" | "profile" | "otp";

// ─── Full-page permission screen ───────────────────────────────────────────────
// Modernare visuell stil — paritet med web's OG-image:
//   - Stor, glow-omgärdad gold-ikon istället för rounded-square
//   - Big bold Outfit_900Black titel med fontStyle: italic + tight letter-spacing
//   - Tagline under titeln (i muted)
//   - Feature-kort med tunnare borders och mer luft
//   - CTA-knapp pinned till botten med gold-glow shadow
//   - Skippa-länk visas som liten muted text under CTA
function PermissionPage({
  icon,
  title,
  highlight,
  subtitle,
  features,
  ctaLabel,
  ctaLoading,
  onCta,
  onSkip,
  skipLabel,
  skipSubLabel,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  highlight: string;
  subtitle: string;
  features: { icon: keyof typeof Ionicons.glyphMap; title: string; sub: string }[];
  ctaLabel: string;
  ctaLoading: boolean;
  onCta: () => void;
  onSkip?: () => void;
  skipLabel?: string;
  skipSubLabel?: string;
}) {
  const { t } = useTranslation();
  const { palette } = useTheme();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(32)).current;
  const iconScale = useRef(new Animated.Value(0.78)).current;
  const iconBreath = useRef(new Animated.Value(1)).current;
  const ringScale = useRef(new Animated.Value(0.5)).current;
  const ringOpacity = useRef(new Animated.Value(0.9)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 420, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 420, useNativeDriver: true }),
      Animated.timing(iconScale, { toValue: 1, duration: 560, easing: Easing.out(Easing.back(1.3)), useNativeDriver: true }),
    ]).start(() => {
      Animated.loop(
        Animated.sequence([
          Animated.timing(iconBreath, { toValue: 1.05, duration: 1800, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
          Animated.timing(iconBreath, { toValue: 1, duration: 1800, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        ]),
      ).start();
    });

    // Ring pulse — fires once on mount
    Animated.parallel([
      Animated.timing(ringScale, { toValue: 2.0, duration: 1000, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(ringOpacity, { toValue: 0, duration: 1000, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    ]).start();

    return () => { iconBreath.stopAnimation(); };
  }, []);

  return (
    <Animated.View style={{ flex: 1, opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 28, paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero icon — stor gold-glow + animerad ring som en vågpuls */}
        <View style={{ alignItems: 'center', marginTop: 40, marginBottom: 36 }}>
          <Animated.View
            pointerEvents="none"
            style={{
              position: 'absolute',
              width: 150, height: 150, borderRadius: 75,
              borderWidth: 1.5, borderColor: 'rgba(231,178,75,0.85)',
              opacity: ringOpacity,
              transform: [{ scale: ringScale }],
            }}
          />
          <Animated.View style={{ transform: [{ scale: iconBreath }] }}>
            <Animated.View style={{ transform: [{ scale: iconScale }] }}>
              <View style={{
                width: 124, height: 124, borderRadius: 38,
                backgroundColor: 'rgba(231,178,75,0.10)',
                borderWidth: 1.5, borderColor: 'rgba(231,178,75,0.28)',
                alignItems: 'center', justifyContent: 'center',
                shadowColor: palette.gold, shadowOpacity: 0.55, shadowRadius: 50, shadowOffset: { width: 0, height: 16 },
              }}>
                <Ionicons name={icon} size={54} color={palette.gold} />
              </View>
            </Animated.View>
          </Animated.View>
        </View>

        {/* Title — italic Outfit Black, paritet med MATGO-loggan i OG-image */}
        <Text style={{
          fontFamily: 'Outfit_900Black',
          color: palette.text,
          fontSize: 38, fontWeight: '900',
          lineHeight: 42, letterSpacing: -1.5,
          fontStyle: 'italic',
          marginBottom: 14, textAlign: 'center',
        }}>
          {title.toUpperCase()}{'\n'}
          <Text style={{ color: palette.gold }}>{highlight.toUpperCase()}</Text>
        </Text>

        {/* Tagline */}
        <Text style={{
          fontFamily: 'Outfit_500Medium',
          color: palette.muted, fontSize: 14, fontWeight: '500',
          lineHeight: 22, marginBottom: 32, textAlign: 'center',
          paddingHorizontal: 8,
        }}>
          {subtitle}
        </Text>

        {/* Features — paritet med web's feature-rader, tunnare borders och mer luft */}
        <View style={{ gap: 10, marginBottom: 32 }}>
          {features.map((f) => (
            <View
              key={f.icon}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 14,
                backgroundColor: palette.card, borderRadius: 20, padding: 16,
                borderWidth: 1, borderColor: palette.border,
              }}
            >
              <View style={{
                width: 44, height: 44, borderRadius: 14,
                backgroundColor: 'rgba(231,178,75,0.10)',
                borderWidth: 1, borderColor: 'rgba(231,178,75,0.20)',
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Ionicons name={f.icon} size={20} color={palette.gold} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: 'Outfit_800ExtraBold', color: palette.text, fontSize: 14, fontWeight: '800' }}>
                  {f.title}
                </Text>
                <Text style={{ fontFamily: 'Outfit_500Medium', color: palette.muted, fontSize: 12, fontWeight: '500', marginTop: 2, lineHeight: 16 }}>
                  {f.sub}
                </Text>
              </View>
            </View>
          ))}
        </View>

        {/* CTA — primary gold knapp med gold-glow */}
        <Pressable
          onPress={onCta}
          disabled={ctaLoading}
          style={{
            backgroundColor: palette.gold, borderRadius: 24, paddingVertical: 18,
            alignItems: 'center', opacity: ctaLoading ? 0.7 : 1,
            shadowColor: palette.gold, shadowOpacity: 0.4, shadowRadius: 24, shadowOffset: { width: 0, height: 10 },
            marginBottom: 12,
          }}
        >
          {ctaLoading
            ? <ActivityIndicator color="#000" />
            : (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name={icon} size={18} color="#000" />
                <Text style={{ fontFamily: 'Outfit_900Black', color: '#000', fontWeight: '900', fontSize: 15 }}>{ctaLabel}</Text>
              </View>
            )
          }
        </Pressable>

        {!!onSkip && (
          <Pressable onPress={onSkip} style={{ alignItems: 'center', paddingVertical: 10 }}>
            <Text style={{ fontFamily: 'Outfit_700Bold', color: palette.muted, fontSize: 12, fontWeight: '700', letterSpacing: 1.5 }}>
              {(skipLabel || t('onboarding.hoppaOver')).toUpperCase()}
            </Text>
            {!!skipSubLabel && (
              <Text style={{ fontFamily: 'Outfit_500Medium', color: palette.muted, fontSize: 11, fontWeight: '500', marginTop: 4, textAlign: 'center', paddingHorizontal: 20, lineHeight: 15 }}>{skipSubLabel}</Text>
            )}
          </Pressable>
        )}
      </ScrollView>
    </Animated.View>
  );
}

// ─── OnboardingScreen ──────────────────────────────────────────────────────────
export default function OnboardingScreen({
  onComplete,
  requestPushPermission,
  skipPermissions = false,
}: {
  onComplete: () => void;
  requestPushPermission?: () => Promise<boolean>;
  skipPermissions?: boolean;
}) {
  const { palette } = useTheme();
  const styles = useSharedStyles();
  const setOnboardingComplete = useAppStore((s) => s.setOnboardingComplete);
  const setToken = useAppStore((s) => s.setToken);
  const setProfile = useAppStore((s) => s.setProfile);
  const setDeliveryAddress = useAppStore((s) => s.setDeliveryAddress);
  const { t } = useTranslation();
  const { currentLanguage, changeLanguage } = useLanguage();
  const [langPickerOpen, setLangPickerOpen] = useState(false);

  // Deferred auth — we commit token/profile to the store only AFTER location permission,
  // so that App.tsx's `!token` guard doesn't unmount this screen before we show location.
  const [pendingToken, setPendingToken] = useState<string | null>(null);
  const [pendingProfile, setPendingProfile] = useState<any>(null);

  const [mainStep, setMainStep] = useState<MainStep>(skipPermissions ? "auth" : "notifications");
  const [step, setStep] = useState<AuthStep>("landing");
  const [countryCode, setCountryCode] = useState("+46");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpPhone, setOtpPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [countryPickerOpen, setCountryPickerOpen] = useState(false);
  const [isNewUser, setIsNewUser] = useState(false);
  const [isGoogleLinking, setIsGoogleLinking] = useState(false);
  const [notifLoading, setNotifLoading] = useState(false);
  const [locationLoading, setLocationLoading] = useState(false);

  const mainStepAnim = useRef(new Animated.Value(1)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(28)).current;
  const stepAnim = useRef(new Animated.Value(1)).current;

  // Landing step — hero & staggered entrance
  const heroOpacity = useRef(new Animated.Value(0)).current;
  const heroScale = useRef(new Animated.Value(0.82)).current;
  const heroBreath = useRef(new Animated.Value(1)).current;
  const heroRingScale = useRef(new Animated.Value(0.55)).current;
  const heroRingOpacity = useRef(new Animated.Value(0.8)).current;
  const lTitle1Opacity = useRef(new Animated.Value(0)).current;
  const lTitle1Y = useRef(new Animated.Value(28)).current;
  const lTitle2Opacity = useRef(new Animated.Value(0)).current;
  const lTitle2Y = useRef(new Animated.Value(28)).current;
  const lSubOpacity = useRef(new Animated.Value(0)).current;
  const lBtnsOpacity = useRef(new Animated.Value(0)).current;
  const lBtnsY = useRef(new Animated.Value(44)).current;
  const googleScaleAnim = useRef(new Animated.Value(1)).current;
  const phoneScaleAnim = useRef(new Animated.Value(1)).current;

  const { prompt: googlePrompt, loading: googleLoading, tokenResult: googleResult, error: googleError } = useGoogleAuth();
  const { prompt: applePrompt, tokenResult: appleResult, error: appleError } = useAppleAuth();

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 450, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 450, useNativeDriver: true }),
    ]).start();
  }, []);

  useEffect(() => {
    stepAnim.setValue(0);
    Animated.timing(stepAnim, { toValue: 1, duration: 280, useNativeDriver: true }).start();
  }, [step]);

  // Landing entrance — runs every time we arrive at the landing step
  useEffect(() => {
    if (step !== "landing") return;

    heroOpacity.setValue(0);
    heroScale.setValue(0.82);
    heroBreath.setValue(1);
    heroRingScale.setValue(0.55);
    heroRingOpacity.setValue(0.8);
    lTitle1Opacity.setValue(0);
    lTitle1Y.setValue(28);
    lTitle2Opacity.setValue(0);
    lTitle2Y.setValue(28);
    lSubOpacity.setValue(0);
    lBtnsOpacity.setValue(0);
    lBtnsY.setValue(44);

    // Hero icon entrance
    Animated.parallel([
      Animated.timing(heroOpacity, { toValue: 1, duration: 450, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(heroScale, { toValue: 1, duration: 600, easing: Easing.out(Easing.back(1.3)), useNativeDriver: true }),
    ]).start(() => {
      Animated.loop(
        Animated.sequence([
          Animated.timing(heroBreath, { toValue: 1.06, duration: 1900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
          Animated.timing(heroBreath, { toValue: 1, duration: 1900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        ])
      ).start();
    });

    // Ring expands once
    Animated.parallel([
      Animated.timing(heroRingScale, { toValue: 2.1, duration: 1000, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(heroRingOpacity, { toValue: 0, duration: 1000, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    ]).start();

    // Title line 1
    Animated.sequence([
      Animated.delay(160),
      Animated.parallel([
        Animated.timing(lTitle1Opacity, { toValue: 1, duration: 420, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(lTitle1Y, { toValue: 0, duration: 420, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]),
    ]).start();

    // Title line 2 (gold) — slightly later
    Animated.sequence([
      Animated.delay(280),
      Animated.parallel([
        Animated.timing(lTitle2Opacity, { toValue: 1, duration: 420, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(lTitle2Y, { toValue: 0, duration: 420, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]),
    ]).start();

    // Subtitle
    Animated.sequence([
      Animated.delay(400),
      Animated.timing(lSubOpacity, { toValue: 1, duration: 380, useNativeDriver: true }),
    ]).start();

    // Buttons slide up together
    Animated.sequence([
      Animated.delay(440),
      Animated.parallel([
        Animated.timing(lBtnsOpacity, { toValue: 1, duration: 480, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(lBtnsY, { toValue: 0, duration: 480, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]),
    ]).start();

    return () => {
      heroBreath.stopAnimation();
    };
  }, [step]);

  const transitionToMain = (next: MainStep) => {
    Animated.timing(mainStepAnim, { toValue: 0, duration: 160, useNativeDriver: true }).start(() => {
      setMainStep(next);
      mainStepAnim.setValue(0);
      Animated.timing(mainStepAnim, { toValue: 1, duration: 320, useNativeDriver: true }).start();
    });
  };

  const goToAuth = () => transitionToMain("auth");

  // Commit the pending auth to the global store and finish onboarding.
  const finishWithAuth = (tok: string, prof: any) => {
    setToken(tok);
    setProfile(prof);
    setOnboardingComplete(true);
    onComplete();
  };

  // After auth succeeds: store pending creds locally, then show location gate (or finish if skipping).
  const afterAuth = (tok: string, prof: any) => {
    if (skipPermissions) {
      finishWithAuth(tok, prof);
    } else {
      setPendingToken(tok);
      setPendingProfile(prof);
      transitionToMain("location");
    }
  };

  // ── Notification step ──────────────────────────────────────────────────────
  const handleAllowNotifications = async () => {
    setNotifLoading(true);
    try { await requestPushPermission?.(); } catch {}
    setNotifLoading(false);
    goToAuth();
  };

  // ── Location step ──────────────────────────────────────────────────────────
  const handleAllowLocation = async () => {
    setLocationLoading(true);
    try {
      const Location = await import('expo-location');
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        const [place] = await Location.reverseGeocodeAsync({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
        const street = [place?.street, place?.streetNumber].filter(Boolean).join(' ');
        const city = place?.city || place?.subregion || '';
        const fullAddress = [street, city].filter(Boolean).join(', ');
        setDeliveryAddress(fullAddress || city, coords);
      }
    } catch {}
    setLocationLoading(false);
    if (pendingToken && pendingProfile) {
      finishWithAuth(pendingToken, pendingProfile);
    } else {
      setOnboardingComplete(true);
      onComplete();
    }
  };

  // ── Google / Apple auth handlers ───────────────────────────────────────────
  useEffect(() => {
    if (googleResult) {
      if (googleResult.user.needsPhone) {
        // Store creds as pending; go collect the phone (linking flow)
        setPendingToken(googleResult.token);
        setPendingProfile(googleResult.user);
        setIsGoogleLinking(true);
        setStep("phone");
      } else {
        afterAuth(googleResult.token, googleResult.user);
      }
    }
  }, [googleResult]);

  useEffect(() => {
    if (googleError && googleError !== "__cancelled__") setError(googleError);
  }, [googleError]);

  useEffect(() => {
    if (!appleResult) return;
    // If Apple didn't share the name we let the user through anyway —
    // they can fill it in later from their profile.
    if (appleResult.user.needsPhone) {
      setPendingToken(appleResult.token);
      setPendingProfile(appleResult.user);
      setIsGoogleLinking(true);
      setStep("phone");
    } else {
      afterAuth(appleResult.token, appleResult.user);
    }
  }, [appleResult]);

  useEffect(() => {
    if (appleError && appleError !== "__cancelled__") setError(appleError);
  }, [appleError]);

  // ── Phone / OTP auth handlers ──────────────────────────────────────────────
  const buildPhone = (cc: string, raw: string) => `${cc}${raw.replace(/\D/g, "").replace(/^0/, "")}`;

  const handleCheckPhone = async () => {
    if (!phone.trim()) { setError("Ange ditt telefonnummer"); return; }
    const full = buildPhone(countryCode, phone);
    setLoading(true); setError("");
    try {
      const { data: lookup } = await api.post("/api/auth/lookup-phone", { phone: full });
      const phoneExists = !!lookup.exists;
      setOtpPhone(full);
      if (!isGoogleLinking && !phoneExists) {
        setIsNewUser(true);
        setStep("profile");
      } else {
        setIsNewUser(false);
        await triggerOtp(full);
      }
    } catch (e: any) {
      setError(e.response?.data?.error || "Kunde inte kontrollera nummer");
    } finally { setLoading(false); }
  };

  const triggerOtp = async (full: string) => {
    try {
      // Send via our own Twilio-backed endpoint regardless of whether we're
      // linking an OAuth account or doing phone-only sign-in. The backend
      // verify-otp route then either links the phone to the active OAuth
      // user (when the request carries the Supabase JWT) or creates / logs
      // in a phone-only account.
      const headers = isGoogleLinking && pendingToken
        ? { Authorization: `Bearer ${pendingToken}` }
        : undefined;
      const { data } = await api.post("/api/auth/send-otp", { phone: full }, { headers });
      if (data?.devCode) setOtpCode(data.devCode);
      setOtpPhone(full);
      setStep("otp");
    } catch (e: any) {
      setError(e.response?.data?.error || e.message || "Kunde inte skicka SMS");
    }
  };

  const handleProfileSubmit = async () => {
    if (!name.trim()) { setError("Ange ditt namn"); return; }
    if (!email.trim() || !email.includes("@")) { setError("Ange en giltig e-post"); return; }
    setLoading(true);
    await triggerOtp(otpPhone);
    setLoading(false);
  };

  const handleVerifyOtp = async () => {
    if (!otpCode.trim()) { setError("Ange koden från SMS:et"); return; }
    setLoading(true); setError("");
    try {
      if (isGoogleLinking) {
        // Twilio verify with the OAuth Supabase JWT attached: backend reads
        // the current user from the JWT and links this phone (uniquely) to
        // that user record. We keep using the Supabase JWT afterwards so the
        // OAuth session machinery (refresh, sign-out) keeps working.
        await api.post(
          "/api/auth/verify-otp",
          { phone: otpPhone, code: otpCode },
          { headers: { Authorization: `Bearer ${pendingToken}` } },
        );
        const profileRes = await api.get("/api/profile", {
          headers: { Authorization: `Bearer ${pendingToken}` },
        });
        afterAuth(pendingToken!, profileRes.data);
      } else {
        // Phone-only sign-in / registration: backend creates or fetches the
        // user keyed by phone and returns our own JWT. No Supabase session.
        const { data } = await api.post("/api/auth/verify-otp", {
          phone: otpPhone,
          code: otpCode,
          name: isNewUser ? name.trim() : undefined,
          email: isNewUser ? email.trim() : undefined,
        });
        const tok = data.token;
        if (!tok) throw new Error("Ingen session mottogs");
        const profileRes = await api.get("/api/auth/me", { headers: { Authorization: `Bearer ${tok}` } });
        afterAuth(tok, profileRes.data);
      }
    } catch (e: any) {
      setError(e.response?.data?.error || e.message || "Felaktig kod");
    } finally { setLoading(false); }
  };

  const topContentInset = Platform.OS === "ios" ? 16 : (StatusBar.currentHeight || 0) + 16;

  // ── Notifications gate page ────────────────────────────────────────────────
  if (mainStep === "notifications") {
    return (
      <View style={{ flex: 1, backgroundColor: "#07060c" }}>
        <LinearGradient
          colors={[palette.panel, palette.bg, palette.panelMuted]}
          locations={[0, 0.6, 1]}
          style={StyleSheet.absoluteFill}
        />
        <SafeAreaView style={{ flex: 1, backgroundColor: 'transparent' }}>
          {/* Brand bar — paritet med web's MATGO-wordmark (italic, GO i gold) */}
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 28, paddingTop: topContentInset, marginBottom: 8 }}>
            <Text style={{
              fontFamily: 'Outfit_900Black',
              color: palette.text, fontSize: 22, fontWeight: '900',
              letterSpacing: -1, fontStyle: 'italic',
            }}>
              MAT<Text style={{ color: palette.gold }}>GO</Text>
            </Text>

            <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 10 }}>
              {/* Step dots — 3 dots, current filled gold */}
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {(['notifications', 'auth', 'location'] as MainStep[]).map((s) => (
                  <View key={s} style={{
                    width: mainStep === s ? 22 : 6, height: 6, borderRadius: 3,
                    backgroundColor: mainStep === s ? palette.gold : 'rgba(231,178,75,0.25)',
                  }} />
                ))}
              </View>
              {/* Skippa — top-right, liten muted */}
              <Pressable onPress={goToAuth} hitSlop={8} style={{ paddingHorizontal: 6, paddingVertical: 4 }}>
                <Text style={{ fontFamily: 'Outfit_700Bold', color: palette.muted, fontSize: 12, fontWeight: '700', letterSpacing: 0.5 }}>
                  Skippa
                </Text>
              </Pressable>
            </View>
          </View>

          <PermissionPage
            icon="notifications-outline"
            title={t('onboarding.notifications.title')}
            highlight={t('onboarding.notifications.highlight')}
            subtitle={t('onboarding.notifications.subtitle')}
            features={[
              { icon: "checkmark-circle-outline", title: t('onboarding.notifications.features.confirmation.title'), sub: t('onboarding.notifications.features.confirmation.sub') },
              { icon: "bicycle-outline", title: t('onboarding.notifications.features.delivery.title'), sub: t('onboarding.notifications.features.delivery.sub') },
              { icon: "gift-outline", title: t('onboarding.notifications.features.offers.title'), sub: t('onboarding.notifications.features.offers.sub') },
            ]}
            ctaLabel={t('onboarding.notifications.cta')}
            ctaLoading={notifLoading}
            onCta={handleAllowNotifications}
          />
        </SafeAreaView>
      </View>
    );
  }

  // ── Location gate page ─────────────────────────────────────────────────────
  if (mainStep === "location") {
    return (
      <View style={{ flex: 1, backgroundColor: "#07060c" }}>
        <LinearGradient
          colors={[palette.panel, palette.bg, palette.panelMuted]}
          locations={[0, 0.6, 1]}
          style={StyleSheet.absoluteFill}
        />
        <SafeAreaView style={{ flex: 1, backgroundColor: 'transparent' }}>
          {/* Brand bar — paritet med web's MATGO-wordmark (italic, GO i gold) */}
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 28, paddingTop: topContentInset, marginBottom: 8 }}>
            <Text style={{
              fontFamily: 'Outfit_900Black',
              color: palette.text, fontSize: 22, fontWeight: '900',
              letterSpacing: -1, fontStyle: 'italic',
            }}>
              MAT<Text style={{ color: palette.gold }}>GO</Text>
            </Text>

            <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 10 }}>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {(['notifications', 'auth', 'location'] as MainStep[]).map((s) => (
                  <View key={s} style={{
                    width: mainStep === s ? 22 : 6, height: 6, borderRadius: 3,
                    backgroundColor: mainStep === s ? palette.gold : 'rgba(231,178,75,0.25)',
                  }} />
                ))}
              </View>
              {/* Skippa — top-right, hoppa över plats men slutför inloggning */}
              <Pressable
                onPress={() => {
                  if (pendingToken && pendingProfile) {
                    finishWithAuth(pendingToken, pendingProfile);
                  } else {
                    setOnboardingComplete(true);
                    onComplete();
                  }
                }}
                hitSlop={8}
                style={{ paddingHorizontal: 6, paddingVertical: 4 }}
              >
                <Text style={{ fontFamily: 'Outfit_700Bold', color: palette.muted, fontSize: 12, fontWeight: '700', letterSpacing: 0.5 }}>
                  Skippa
                </Text>
              </Pressable>
            </View>
          </View>

          <PermissionPage
            icon="location-outline"
            title={t('onboarding.location.title')}
            highlight={t('onboarding.location.highlight')}
            subtitle={t('onboarding.location.subtitle')}
            features={[
              { icon: "restaurant-outline", title: t('onboarding.location.features.local.title'), sub: t('onboarding.location.features.local.sub') },
              { icon: "time-outline", title: t('onboarding.location.features.eta.title'), sub: t('onboarding.location.features.eta.sub') },
              { icon: "home-outline", title: t('onboarding.location.features.address.title'), sub: t('onboarding.location.features.address.sub') },
            ]}
            ctaLabel={t('onboarding.location.cta')}
            ctaLoading={locationLoading}
            onCta={handleAllowLocation}
          />
        </SafeAreaView>
      </View>
    );
  }

  // ── Auth flow ──────────────────────────────────────────────────────────────
  return (
    <View style={{ flex: 1, backgroundColor: "#07060c" }}>
      <LinearGradient
        colors={[palette.panel, palette.bg, palette.panelMuted]}
        locations={[0, 0.6, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View style={{
        position: "absolute", top: -80, left: "15%", right: "15%", height: 260, borderRadius: 130,
        backgroundColor: "rgba(231,178,75,0.055)",
        shadowColor: palette.gold, shadowOpacity: 0.3, shadowRadius: 60, shadowOffset: { width: 0, height: 20 },
      }} />

      <SafeAreaView style={{ flex: 1, backgroundColor: "transparent" }}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
          <ScrollView
            contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 26, paddingTop: topContentInset, paddingBottom: 48 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Header row — MATGO-wordmark istället för rounded-icon + "FoodGo" */}
            <Animated.View style={{
              opacity: fadeAnim, transform: [{ translateY: slideAnim }],
              flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 36,
            }}>
              <Text style={{
                fontFamily: 'Outfit_900Black',
                color: palette.text, fontSize: 24, fontWeight: '900',
                letterSpacing: -1, fontStyle: 'italic',
              }}>
                MAT<Text style={{ color: palette.gold }}>GO</Text>
              </Text>

              {/* Step dots — only when past landing */}
              {step !== "landing" && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginRight: 8 }}>
                  {(['notifications', 'auth', 'location'] as MainStep[]).map((s) => (
                    <View key={s} style={{
                      width: mainStep === s ? 22 : 6, height: 6, borderRadius: 3,
                      backgroundColor: mainStep === s ? palette.gold : 'rgba(231,178,75,0.25)',
                    }} />
                  ))}
                </View>
              )}

              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Pressable
                  onPress={() => setLangPickerOpen(true)}
                  style={{ flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 11, paddingVertical: 8, borderRadius: 20, backgroundColor: palette.card, borderWidth: 1, borderColor: palette.border }}
                >
                  <Ionicons name="globe-outline" size={13} color={palette.muted} />
                  <Text style={{ fontFamily: 'Outfit_700Bold', color: palette.muted, fontSize: 11, fontWeight: "700" }}>{currentLanguage.toUpperCase()}</Text>
                </Pressable>
              </View>
            </Animated.View>

            {/* Hero section — only shown for non-landing steps */}
            <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }], marginBottom: step !== "landing" ? 36 : 0 }}>
              {step === "phone" && (
                <>
                  <Text style={{ color: palette.text, fontSize: 30, fontWeight: "900", letterSpacing: -0.5 }}>
                    {t('onboarding.auth.phone.title')}
                  </Text>
                  <Text style={{ color: palette.muted, fontSize: 13, fontWeight: "500", marginTop: 10, lineHeight: 20 }}>
                    {t('onboarding.auth.phone.subtitle')}
                  </Text>
                </>
              )}
              {step === "profile" && (
                <>
                  <Text style={{ color: palette.text, fontSize: 30, fontWeight: "900", letterSpacing: -0.5 }}>
                    {t('onboarding.auth.profile.title')}
                  </Text>
                  <Text style={{ color: palette.muted, fontSize: 13, fontWeight: "500", marginTop: 10, lineHeight: 20 }}>
                    {t('onboarding.auth.profile.subtitle')}
                  </Text>
                </>
              )}
              {step === "otp" && (
                <>
                  <Text style={{ color: palette.text, fontSize: 30, fontWeight: "900", letterSpacing: -0.5 }}>
                    {t('onboarding.auth.otp.title')}
                  </Text>
                  <Text style={{ color: palette.muted, fontSize: 13, fontWeight: "500", marginTop: 10, lineHeight: 20 }}>
                    {t('onboarding.auth.otp.sentTo')}{" "}
                    <Text style={{ color: palette.text, fontWeight: "700" }}>{otpPhone}</Text>
                    {isGoogleLinking && (
                      <Text style={{ color: palette.muted }}>{"\n"}Koden kopplar numret till ditt konto.</Text>
                    )}
                  </Text>
                </>
              )}
            </Animated.View>

            {/* Step content */}
            <Animated.View style={{
              opacity: stepAnim,
              transform: [{ translateY: stepAnim.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }],
              gap: 14,
            }}>

              {/* ── LANDING ── */}
              {step === "landing" && (
                <>
                  {/* Hero icon with animated ring + breath */}
                  <View style={{ alignItems: "center", marginBottom: 24, marginTop: 4 }}>
                    <Animated.View
                      pointerEvents="none"
                      style={{
                        position: "absolute",
                        width: 150, height: 150, borderRadius: 75,
                        borderWidth: 1.5, borderColor: "rgba(231,178,75,0.85)",
                        opacity: heroRingOpacity,
                        transform: [{ scale: heroRingScale }],
                      }}
                    />
                    <Animated.View style={{ transform: [{ scale: heroBreath }] }}>
                      <Animated.View style={{ opacity: heroOpacity, transform: [{ scale: heroScale }] }}>
                        <View style={{
                          width: 130, height: 130, borderRadius: 38,
                          backgroundColor: "rgba(231,178,75,0.07)",
                          borderWidth: 1.5, borderColor: "rgba(231,178,75,0.2)",
                          alignItems: "center", justifyContent: "center",
                          overflow: "hidden",
                          shadowColor: palette.gold, shadowOpacity: 0.55, shadowRadius: 50, shadowOffset: { width: 0, height: 16 },
                        }}>
                          <Image
                            source={require("../../assets/icon.png")}
                            style={{ width: 130, height: 130 }}
                            resizeMode="cover"
                          />
                        </View>
                      </Animated.View>
                    </Animated.View>
                  </View>

                  {/* Title — two lines, staggered */}
                  <View style={{ alignItems: "center", marginBottom: 14 }}>
                    <Animated.Text style={{
                      color: palette.text, fontSize: 46, fontWeight: "900",
                      lineHeight: 50, letterSpacing: -1.8, textAlign: "center",
                      opacity: lTitle1Opacity,
                      transform: [{ translateY: lTitle1Y }],
                    }}>
                      Beställ mat.
                    </Animated.Text>
                    <Animated.Text style={{
                      color: palette.gold, fontSize: 46, fontWeight: "900",
                      lineHeight: 50, letterSpacing: -1.8, textAlign: "center",
                      opacity: lTitle2Opacity,
                      transform: [{ translateY: lTitle2Y }],
                    }}>
                      Direkt.
                    </Animated.Text>
                  </View>

                  {/* Subtitle */}
                  <Animated.Text style={{
                    color: palette.muted, fontSize: 14, fontWeight: "500",
                    lineHeight: 22, marginBottom: 32, textAlign: "center",
                    opacity: lSubOpacity,
                  }}>
                    Restauranger nära dig — levererat snabbt.
                  </Animated.Text>

                  {/* All buttons slide up together */}
                  <Animated.View style={{
                    opacity: lBtnsOpacity,
                    transform: [{ translateY: lBtnsY }],
                    gap: 12,
                  }}>
                    {/* Apple (iOS compliance: at least as prominent as other social logins) */}
                    {Platform.OS === "ios" && (
                      <AppleAuthentication.AppleAuthenticationButton
                        buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
                        buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
                        cornerRadius={22}
                        style={{ width: "100%", height: 56 }}
                        onPress={applePrompt}
                      />
                    )}

                    {/* Google with press-scale */}
                    <Animated.View style={{ transform: [{ scale: googleScaleAnim }] }}>
                      <Pressable
                        onPress={googlePrompt}
                        onPressIn={() => Animated.spring(googleScaleAnim, { toValue: 0.96, useNativeDriver: true, speed: 60, bounciness: 0 }).start()}
                        onPressOut={() => Animated.spring(googleScaleAnim, { toValue: 1, useNativeDriver: true, speed: 60, bounciness: 0 }).start()}
                        disabled={googleLoading}
                        style={{
                          backgroundColor: "#fff", borderRadius: 22, paddingVertical: 17,
                          alignItems: "center", opacity: googleLoading ? 0.6 : 1,
                        }}
                      >
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                          {googleLoading
                            ? <ActivityIndicator size="small" color="#000" />
                            : <Text style={{ fontSize: 17, fontWeight: "900", color: "#4285F4" }}>G</Text>}
                          <Text style={{ color: "#000", fontWeight: "700", fontSize: 14 }}>Fortsätt med Google</Text>
                        </View>
                      </Pressable>
                    </Animated.View>

                    {/* Divider */}
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
                      <View style={{ flex: 1, height: 1, backgroundColor: palette.border }} />
                      <Text style={{ color: palette.muted, fontSize: 11, fontWeight: "700", letterSpacing: 1.5 }}>ELLER</Text>
                      <View style={{ flex: 1, height: 1, backgroundColor: palette.border }} />
                    </View>

                    {/* Phone — primary gold CTA with press-scale */}
                    <Animated.View style={{ transform: [{ scale: phoneScaleAnim }] }}>
                      <Pressable
                        onPress={() => { setError(""); setIsGoogleLinking(false); setIsNewUser(false); setStep("phone"); }}
                        onPressIn={() => Animated.spring(phoneScaleAnim, { toValue: 0.96, useNativeDriver: true, speed: 60, bounciness: 0 }).start()}
                        onPressOut={() => Animated.spring(phoneScaleAnim, { toValue: 1, useNativeDriver: true, speed: 60, bounciness: 0 }).start()}
                        style={{
                          backgroundColor: palette.gold, borderRadius: 22, paddingVertical: 17,
                          alignItems: "center",
                          shadowColor: palette.gold, shadowOpacity: 0.45, shadowRadius: 22, shadowOffset: { width: 0, height: 10 },
                        }}
                      >
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                          <Ionicons name="phone-portrait-outline" size={18} color="#000" />
                          <Text style={{ color: "#000", fontWeight: "900", fontSize: 15 }}>Logga in med telefonnummer</Text>
                        </View>
                      </Pressable>
                    </Animated.View>

                    {!!error && (
                      <View style={{ backgroundColor: "rgba(239,68,68,0.1)", borderRadius: 14, padding: 12, borderWidth: 1, borderColor: "rgba(239,68,68,0.2)" }}>
                        <Text style={{ color: "#fca5a5", fontSize: 12, fontWeight: "700", textAlign: "center" }}>{error}</Text>
                      </View>
                    )}

                    {/* Guest link with tradeoff warning */}
                    <Pressable
                      onPress={() => {
                        if (skipPermissions) { setOnboardingComplete(true); onComplete(); }
                        else { setPendingToken(null); setPendingProfile(null); transitionToMain("location"); }
                      }}
                      style={{ alignItems: "center", paddingVertical: 14 }}
                    >
                      <Text style={{ color: palette.muted, fontSize: 13, fontWeight: "700" }}>Fortsätt som gäst</Text>
                      <Text style={{ color: palette.muted, fontSize: 11, fontWeight: "500", marginTop: 4, textAlign: "center", paddingHorizontal: 24, lineHeight: 15 }}>
                        Som gäst kan du beställa snabbt, men du missar erbjudanden och kampanjer
                      </Text>
                    </Pressable>
                  </Animated.View>
                </>
              )}

              {/* ── PHONE ── */}
              {step === "phone" && (
                <>
                  <View style={{
                    flexDirection: "row", gap: 10, backgroundColor: palette.card,
                    borderRadius: 20, borderWidth: 1, borderColor: palette.border, padding: 6,
                  }}>
                    <Pressable
                      onPress={() => setCountryPickerOpen(true)}
                      style={{
                        backgroundColor: palette.panelMuted, borderRadius: 14,
                        paddingHorizontal: 14, paddingVertical: 14,
                        flexDirection: "row", alignItems: "center", gap: 6,
                      }}
                    >
                      <Text style={{ color: palette.text, fontSize: 15, fontWeight: "800" }}>
                        {COUNTRY_CODES.find(c => c.code === countryCode)?.flag || "🇸🇪"} {countryCode}
                      </Text>
                      <Ionicons name="chevron-down" size={13} color={palette.muted} />
                    </Pressable>
                    <TextInput
                      style={{ flex: 1, color: palette.text, fontSize: 17, fontWeight: "700", paddingHorizontal: 10, paddingVertical: 14 }}
                      placeholder={t('onboarding.phone.placeholder')}
                      placeholderTextColor={palette.muted}
                      keyboardType="phone-pad"
                      value={phone}
                      onChangeText={(t) => { setPhone(t); setError(""); }}
                      returnKeyType="done"
                      autoFocus
                    />
                  </View>

                  <Modal visible={countryPickerOpen} transparent animationType="slide" onRequestClose={() => setCountryPickerOpen(false)}>
                    <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.7)" }} onPress={() => setCountryPickerOpen(false)}>
                      <View style={{
                        position: "absolute", bottom: 0, left: 0, right: 0,
                        backgroundColor: "#1a1624", borderTopLeftRadius: 32, borderTopRightRadius: 32,
                        padding: 28, paddingBottom: 48, gap: 6,
                      }}>
                        <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.15)", alignSelf: "center", marginBottom: 16 }} />
                        <Text style={{ color: palette.text, fontWeight: "900", fontSize: 15, marginBottom: 12, textAlign: "center" }}>{t('onboarding.phone.countryTitle')}</Text>
                        {COUNTRY_CODES.map(cc => (
                          <Pressable
                            key={cc.code}
                            onPress={() => { setCountryCode(cc.code); setCountryPickerOpen(false); }}
                            style={{
                              flexDirection: "row", alignItems: "center", gap: 14,
                              paddingVertical: 14, paddingHorizontal: 16, borderRadius: 18,
                              backgroundColor: countryCode === cc.code ? "rgba(231,178,75,0.1)" : "transparent",
                              borderWidth: countryCode === cc.code ? 1 : 0,
                              borderColor: "rgba(231,178,75,0.2)",
                            }}
                          >
                            <Text style={{ fontSize: 26 }}>{cc.flag}</Text>
                            <Text style={{ color: palette.text, fontWeight: "700", flex: 1, fontSize: 15 }}>{cc.name}</Text>
                            <Text style={{ color: palette.gold, fontWeight: "900", fontSize: 14 }}>{cc.code}</Text>
                          </Pressable>
                        ))}
                      </View>
                    </Pressable>
                  </Modal>

                  {!!error && (
                    <View style={{ backgroundColor: "rgba(239,68,68,0.1)", borderRadius: 14, padding: 12, borderWidth: 1, borderColor: "rgba(239,68,68,0.2)" }}>
                      <Text style={{ color: "#fca5a5", fontSize: 12, fontWeight: "700", textAlign: "center" }}>{error}</Text>
                    </View>
                  )}

                  <Pressable
                    onPress={handleCheckPhone}
                    disabled={loading || !phone.trim()}
                    style={{
                      backgroundColor: palette.gold, borderRadius: 22, paddingVertical: 18, alignItems: "center",
                      opacity: loading || !phone.trim() ? 0.55 : 1, marginTop: 4,
                      shadowColor: palette.gold, shadowOpacity: 0.35, shadowRadius: 16, shadowOffset: { width: 0, height: 6 },
                    }}
                  >
                    {loading
                      ? <ActivityIndicator color="#000" />
                      : <Text style={{ color: "#000", fontWeight: "900", fontSize: 15 }}>{isGoogleLinking ? t('onboarding.phone.verifyBtn') : t('onboarding.phone.continueBtn')}</Text>
                    }
                  </Pressable>
                </>
              )}

              {/* ── PROFILE ── */}
              {step === "profile" && (
                <>
                  <TextInput
                    style={[styles.input, { paddingVertical: 18 }]}
                    placeholder={t('onboarding.profile.namePlaceholder')}
                    placeholderTextColor={palette.muted}
                    value={name}
                    onChangeText={(t) => { setName(t); setError(""); }}
                  />
                  <TextInput
                    style={[styles.input, { paddingVertical: 18 }]}
                    placeholder={t('onboarding.profile.emailPlaceholder')}
                    placeholderTextColor={palette.muted}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    value={email}
                    onChangeText={(t) => { setEmail(t); setError(""); }}
                  />
                  {!!error && (
                    <View style={{ backgroundColor: "rgba(239,68,68,0.1)", borderRadius: 14, padding: 12, borderWidth: 1, borderColor: "rgba(239,68,68,0.2)" }}>
                      <Text style={{ color: "#fca5a5", fontSize: 12, fontWeight: "700", textAlign: "center" }}>{error}</Text>
                    </View>
                  )}
                  <Pressable
                    onPress={handleProfileSubmit}
                    disabled={!name.trim() || !email.trim()}
                    style={{
                      backgroundColor: palette.gold, borderRadius: 22, paddingVertical: 18, alignItems: "center",
                      opacity: !name.trim() || !email.trim() ? 0.55 : 1, marginTop: 4,
                    }}
                  >
                    <Text style={{ color: "#000", fontWeight: "900", fontSize: 15 }}>{t('onboarding.profile.nextBtn')}</Text>
                  </Pressable>
                  <Pressable onPress={() => { setStep("phone"); setError(""); }} style={{ alignItems: "center", paddingVertical: 10 }}>
                    <Text style={{ color: palette.muted, fontSize: 13, fontWeight: "600" }}>{t('onboarding.profile.backPhone')}</Text>
                  </Pressable>
                </>
              )}

              {/* ── OTP ── */}
              {step === "otp" && (
                <>
                  <View style={{
                    backgroundColor: palette.panelMuted, borderRadius: 20, borderWidth: 1,
                    borderColor: "rgba(234,181,69,0.2)", padding: 6,
                  }}>
                    <TextInput
                      style={{
                        color: palette.gold, fontSize: 32, fontWeight: "900",
                        textAlign: "center", letterSpacing: 14,
                        paddingVertical: 20, paddingHorizontal: 14,
                      }}
                      placeholder="——————"
                      placeholderTextColor="rgba(234,181,69,0.2)"
                      keyboardType="number-pad"
                      maxLength={6}
                      value={otpCode}
                      onChangeText={(t) => { setOtpCode(t); setError(""); }}
                      returnKeyType="done"
                      onSubmitEditing={handleVerifyOtp}
                      autoFocus
                    />
                  </View>
                  {!!error && (
                    <View style={{ backgroundColor: "rgba(239,68,68,0.1)", borderRadius: 14, padding: 12, borderWidth: 1, borderColor: "rgba(239,68,68,0.2)" }}>
                      <Text style={{ color: "#fca5a5", fontSize: 12, fontWeight: "700", textAlign: "center" }}>{error}</Text>
                    </View>
                  )}
                  <Pressable
                    onPress={handleVerifyOtp}
                    disabled={loading || otpCode.length < 4}
                    style={{
                      backgroundColor: palette.gold, borderRadius: 22, paddingVertical: 18, alignItems: "center",
                      opacity: loading || otpCode.length < 4 ? 0.55 : 1,
                      shadowColor: palette.gold, shadowOpacity: 0.35, shadowRadius: 16, shadowOffset: { width: 0, height: 6 },
                    }}
                  >
                    {loading ? <ActivityIndicator color="#000" /> : <Text style={{ color: "#000", fontWeight: "900", fontSize: 15 }}>{t('onboarding.otp.verifyBtn')}</Text>}
                  </Pressable>
                  <Pressable
                    onPress={() => { setStep("phone"); setOtpCode(""); setError(""); }}
                    style={{ alignItems: "center", paddingVertical: 10 }}
                  >
                    <Text style={{ color: palette.muted, fontSize: 13, fontWeight: "600" }}>{t('onboarding.otp.resend')}</Text>
                  </Pressable>
                </>
              )}
            </Animated.View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>

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
    </View>
  );
}
