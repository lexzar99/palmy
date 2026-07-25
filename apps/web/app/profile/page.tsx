"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import axios from "axios";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  User, Settings, MapPin, Phone, LogOut, ChevronRight,
  History, Lock, ArrowLeft, Loader2, Save, Bell, Check, Ticket, Tag,
  Home, Briefcase, Trash2, Gift, Languages, Info, Heart, CreditCard, Smartphone, Apple, MessageCircle
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toE164Phone } from "@/lib/phone";
import {
  clearPlatformSession,
  getPlatformSessionStatus,
  markLoggedOut,
  LAST_CUSTOMER_ID_KEY,
} from "@/lib/platformSessionClient";
import ConfirmModal from "@/components/ConfirmModal";
import PhoneAuth from "@/components/PhoneAuth";
import PhoneCountrySelect from "@/components/PhoneCountrySelect";
import { getDeviceFingerprint } from "@/lib/deviceFingerprint";
import ReferralProfileCard from "@/components/ReferralProfileCard";
import { useToast } from "@/components/Toast";
import { useTranslation } from "@/lib/i18n/LocaleProvider";
import ViaEatsWordmark from "@/components/ViaEatsWordmark";

type ProfileTab = "overview" | "orders" | "deals" | "addresses" | "settings" | "payments";
type PreferredPaymentMethod = "APPLE_PAY" | "CARD" | "SWISH";
const PROFILE_HIDDEN_ORDER_STATUSES = new Set(["AWAITING_PAYMENT", "CANCELLED", "REJECTED", "DELIVERY_FAILED"]);
const PROFILE_HIDDEN_PAYMENT_STATUSES = new Set(["PENDING", "FAILED", "EXPIRED"]);
type SavedPaymentMethod = {
  id: string;
  type?: string | null;
  brand?: string | null;
  lastFour?: string | null;
  expiryMonth?: string | number | null;
  expiryYear?: string | number | null;
  holderName?: string | null;
  isDefault?: boolean;
};

const PAYMENT_OPTIONS: {
  key: PreferredPaymentMethod;
  icon: typeof Apple;
  title: string;
  subtitle: string;
}[] = [
  { key: "APPLE_PAY", icon: Apple, title: "Apple Pay", subtitle: "Snabb betalning i kassan" },
  { key: "CARD", icon: CreditCard, title: "Kort", subtitle: "Betala med kort i kassan" },
  { key: "SWISH", icon: Smartphone, title: "Swish", subtitle: "Betala med telefonnummer" },
];

// ─── Country codes ─────────────────────────────────────────────────────────
// Landskods-väljare flyttad till delade <PhoneCountrySelect> (begränsad lista,
// Sverige som standard) — används av både nummerverifiering och nummer-grinden.


/**
 * Språkväljare i Inställningar — paritet med RN-appen (sv/en/ar).
 * Persisterar i `viaeats_locale`. Faktisk i18n-byte över UI:t är inte aktiverad
 * i webben ännu, så just nu bara sparar vi valet inför framtida i18n-runtime.
 */
// Endast de språk som faktiskt är implementerade i web-i18n:n (sv/en).
const SUPPORTED_LOCALES = [
  { code: "sv", label: "Svenska", flag: "🇸🇪" },
  { code: "en", label: "English", flag: "🇬🇧" },
] as const;

function splitProfileName(value?: string | null) {
  const clean = String(value || "").trim().replace(/\s+/g, " ");
  const parts = clean.split(" ").filter(Boolean);
  return {
    firstName: parts[0] || "",
    lastName: parts.slice(1).join(" "),
  };
}

function splitProfilePhone(value?: string | null) {
  const raw = String(value || "").trim();
  const digits = raw.replace(/\D/g, "");
  if (!digits) return { country: "+46", number: "" };
  if (raw.startsWith("+46") || digits.startsWith("46")) {
    return { country: "+46", number: digits.replace(/^46/, "") };
  }
  return { country: "+46", number: raw.startsWith("0") ? raw : digits };
}

function LanguagePickerRow() {
  // Riktig i18n: locale + setLocale från LocaleProvider (byter UI direkt och
  // persisterar). Visar bara de språk som faktiskt är implementerade (sv/en).
  const { t, locale, setLocale } = useTranslation();
  const active = SUPPORTED_LOCALES.find((l) => l.code === locale) ?? SUPPORTED_LOCALES[0];

  return (
    <div className="px-4 py-[14px] flex items-center justify-between gap-3">
      <div className="flex items-center gap-3.5 min-w-0">
        <Languages size={20} strokeWidth={1.9} className="shrink-0" style={{ color: "var(--text-primary)" }} />
        <div>
          <p className="font-bold text-[15px]" style={{ color: "var(--text-primary)" }}>{t("profile.settings.language")}</p>
          <p className="text-[12.5px] font-medium" style={{ color: "var(--text-secondary)" }}>{active.flag} {active.label}</p>
        </div>
      </div>
      <div className="relative">
        <select
          value={locale}
          onChange={(e) => setLocale(e.target.value as typeof locale)}
          className="appearance-none text-[13px] font-semibold rounded-xl px-3 py-2 pr-7 cursor-pointer outline-none transition-all"
          style={{ backgroundColor: "var(--bg-deep)", color: "var(--text-primary)", border: "1px solid var(--line-strong)" }}
          aria-label={t("profile.settings.languageAria")}
        >
          {SUPPORTED_LOCALES.map((l) => (
            <option key={l.code} value={l.code}>
              {l.flag} {l.label}
            </option>
          ))}
        </select>
        <ChevronRight size={14} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rotate-90" style={{ color: "var(--text-secondary)" }} />
      </div>
    </div>
  );
}

// ─── Skeleton (visas under laddning — paritet med övriga sidor) ──────────────
function ProfileSkeleton() {
  return (
    <div
      className="min-h-screen pt-[calc(env(safe-area-inset-top,0px)+1.5rem)] md:pt-16 pb-32 px-5 sm:px-6 lg:px-8"
      style={{ backgroundColor: "var(--bg-primary)" }}
    >
      <div className="max-w-2xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="skeleton w-14 h-14 rounded-xl" />
            <div className="space-y-2">
              <div className="skeleton h-5 w-40 rounded-lg" />
              <div className="skeleton h-3 w-24 rounded" />
            </div>
          </div>
          <div className="skeleton w-12 h-12 rounded-2xl" />
        </div>
        {/* Tabs */}
        <div className="skeleton h-16 rounded-2xl" />
        {/* Innehållskort */}
        <div className="space-y-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton h-24 rounded-2xl" />
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Main component ─────────────────────────────────────────────────────────
function ProfileContent() {
  const router = useRouter();
  const { t, locale, setLocale } = useTranslation();
  const [hasPlatformSession, setHasPlatformSession] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [deals, setDeals] = useState<any[]>([]);
  const [claimedDeals, setClaimedDeals] = useState<any[]>([]);
  const [availableDeals, setAvailableDeals] = useState<any[]>([]);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<ProfileTab>("overview");
  const [preferredPayment, setPreferredPayment] = useState<PreferredPaymentMethod>("APPLE_PAY");
  const [paymentMethods, setPaymentMethods] = useState<SavedPaymentMethod[]>([]);
  const [paymentMethodsLoading, setPaymentMethodsLoading] = useState(false);
  const searchParams = useSearchParams();

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab && ["overview", "orders", "deals", "addresses", "settings", "payments"].includes(tab)) {
      setActiveTab(tab as ProfileTab);
    }
  }, [router, searchParams]);

  // Saved addresses state
  const [savedAddresses, setSavedAddresses] = useState<any[]>([]);

  // Edit profile
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editShowNameInput, setEditShowNameInput] = useState(false); // For new phone users
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const [missingName, setMissingName] = useState("");
  const [missingNameSaving, setMissingNameSaving] = useState(false);

  // Namn-komplettering. Visas när en verifierad telefonprofil saknar namn helt.
  // PhoneAuth fyller normalt detta direkt, men äldre profiler eller importerade
  // orderkopplingar kan fortfarande behöva kompletteras.
  const [completeFirst, setCompleteFirst] = useState("");
  const [completeLast, setCompleteLast] = useState("");
  const [completeNameSaving, setCompleteNameSaving] = useState(false);
  const [completeNameError, setCompleteNameError] = useState("");
 
  const [showAddPhone, setShowAddPhone] = useState(false);
  const [addPhoneCountry, setAddPhoneCountry] = useState("+46");
  const [addPhoneNum, setAddPhoneNum] = useState("");
  const [addPhoneLoading, setAddPhoneLoading] = useState(false);
  const [addPhoneError, setAddPhoneError] = useState("");
  const [addPhoneStep, setAddPhoneStep] = useState<"phone" | "code">("phone");
  const [addPhoneCode, setAddPhoneCode] = useState("");
  const [isChangingPhone, setIsChangingPhone] = useState(false);
  const [changePhoneStep, setChangePhoneStep] = useState<"oldPhone" | "oldCode" | "newPhone" | "newCode">("oldPhone");
  const [changeOldCountry, setChangeOldCountry] = useState("+46");
  const [changeOldNum, setChangeOldNum] = useState("");
  const [changeOldCode, setChangeOldCode] = useState("");
  const [changeOldToken, setChangeOldToken] = useState("");
  const [changeNewCountry, setChangeNewCountry] = useState("+46");
  const [changeNewNum, setChangeNewNum] = useState("");
  const [changeNewCode, setChangeNewCode] = useState("");
  const [changePhoneLoading, setChangePhoneLoading] = useState(false);
  const [changePhoneError, setChangePhoneError] = useState("");

  // Modal states
  const [deleteAccountModalOpen, setDeleteAccountModalOpen] = useState(false);
  const [deleteAddressModalOpen, setDeleteAddressModalOpen] = useState(false);
  const [addressToDelete, setAddressToDelete] = useState<any>(null);
  const { toast } = useToast();

  const fetchData = useCallback(async () => {
    try {
      // Parallelise ALL 5 fetches — used to do addresses serially after the
      // first 4 which made the profile page wait an extra ~300-500ms for
      // the second round trip. Each call is independent.
      // Profilen gate:ar hela sidan. Direkt efter SMS-verifiering kan
      // platform-cookien behöva en tick att propagera, så profilhämtningen får
      // några försök innan vi ger upp. Sekundärdata failar tyst så användaren
      // inte fastnar i verifieringsvyn av ett sidofel.
      let profileRes: any = null;
      let lastErr: any = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          profileRes = await axios.get(`/api/platform/profile`);
          break;
        } catch (e: any) {
          lastErr = e;
          const st = e?.response?.status;
          // 401/403/nätverk → trolig cookie-propagering, vänta + försök igen.
          // Andra status (4xx/5xx) → ge upp direkt (inte ett timing-problem).
          if (st && st !== 401 && st !== 403) throw e;
          await new Promise((r) => setTimeout(r, 350));
        }
      }
      if (!profileRes) throw lastErr || new Error("profile fetch failed");
      const [ordersRes, dealsRes, claimedRes, addrRes] = await Promise.all([
        axios.get(`/api/platform/profile/orders`).catch(() => ({ data: [] })),
        axios.get(`/api/platform/profile/deals`).catch(() => ({ data: [] })),
        axios.get(`/api/platform/profile/claimed-deals`).catch(() => ({ data: { claimed: [], global: [] } })),
        axios.get(`/api/platform/profile/addresses`).catch(() => ({ data: [] })),
      ]);
      setHasPlatformSession(true);
      setUser(profileRes.data);
      setEditName(profileRes.data.name || "");
      setOrders(
        (Array.isArray(ordersRes.data) ? ordersRes.data : []).filter((order: any) => {
          const status = String(order?.status || "").toUpperCase();
          const paymentStatus = String(order?.paymentStatus || "").toUpperCase();
          return !PROFILE_HIDDEN_ORDER_STATUSES.has(status) && !PROFILE_HIDDEN_PAYMENT_STATUSES.has(paymentStatus);
        }),
      );
      const isRetiredFavoriteDeal = (deal: any) => {
        const metadata = deal?.metadata || {};
        const campaign = deal?.campaign || {};
        const title = String(deal?.title || campaign?.title || campaign?.name || "").toLowerCase();
        return deal?.type === "FAVORITE_PRODUCT" || Boolean(metadata.favoriteProductId) || title.includes("din favorit");
      };
      setDeals((Array.isArray(dealsRes.data) ? dealsRes.data : []).filter((deal: any) => deal?.source !== "APP_MISSION" && !isRetiredFavoriteDeal(deal)));
      // Sammanställ alla deals — claimade först (av kunden), sen globala (auto-tillgängliga).
      const isProfileDeal = (deal: any) => {
        const template = String(deal?.appTemplate || deal?.template || "").toUpperCase();
        return !deal?.appMissionType && template !== "MISSION" && deal?.source !== "APP_MISSION" && !isRetiredFavoriteDeal(deal);
      };
      const merged = [
        ...((claimedRes.data?.claimed || []) as any[]).map((d: any) => ({ ...d, _kind: 'CLAIMED' })),
        ...((claimedRes.data?.global || []) as any[]).map((d: any) => ({ ...d, _kind: 'GLOBAL' })),
      ].filter(isProfileDeal);
      setClaimedDeals(merged);
      // Available = popup-deals admin har skickat men användaren inte
      // klämt än. Visas som banners med "Spara erbjudande"-knapp så man
      // kan claima dem från Profile om man missade popupen vid app-start.
      setAvailableDeals(((claimedRes.data?.available || []) as any[]).filter(isProfileDeal));
      setSavedAddresses(addrRes.data || []);

      // Äldre/importerade profiler utan nummer får slutföra verifieringen här.
      if (!profileRes.data.phone) {
        setShowAddPhone(true);
      } else {
        setShowAddPhone(false);
      }
    } catch (err: any) {
      // ALDRIG auto-glöm verifieringen härifrån. Även 401 från /api/platform/profile
      // kan vara timing-relaterat, så låt användaren själv glömma verifieringen
      // via knappen om sessionen verkligen är borta.
      const status = err?.response?.status;
      console.error(
        `[fetchData] error status=${status} message=${err?.message || err}. NOT auto-logging out. User can refresh or click logout if needed.`,
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const onCustomerStorage = (event: StorageEvent) => {
      if (event.key !== LAST_CUSTOMER_ID_KEY && event.key !== "dlv_logged_out") return;
      // Cookies/localStorage are shared by every tab. Drop the prior profile PII
      // immediately, then hydrate only from the newly resolved shared session.
      setLoading(true);
      setHasPlatformSession(false);
      setUser(null);
      setOrders([]);
      setDeals([]);
      setClaimedDeals([]);
      setAvailableDeals([]);
      setSavedAddresses([]);
      setPaymentMethods([]);
      void getPlatformSessionStatus().then(async (authenticated) => {
        setHasPlatformSession(authenticated);
        if (authenticated) await fetchData();
        else setLoading(false);
      });
    };
    window.addEventListener("storage", onCustomerStorage);
    return () => window.removeEventListener("storage", onCustomerStorage);
  }, [fetchData]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const authenticated = await getPlatformSessionStatus();
      if (cancelled) return;
      setHasPlatformSession(authenticated);
      if (authenticated) await fetchData();
      else setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [fetchData]);

  // Invite-attribution för verifierade telefonprofiler. Här kopplas
  // dlv_ref-cookien när en session finns. Idempotent (inviteeUserId @unique);
  // cookien rensas efter.
  useEffect(() => {
    if (!hasPlatformSession || !user) return;
    const ref = document.cookie.match(/(?:^|; )dlv_ref=([^;]+)/)?.[1];
    if (!ref) return;
    void axios
      .post("/api/platform/account/invite/attribute", {
        token: decodeURIComponent(ref),
        deviceFingerprint: getDeviceFingerprint(),
        channel: "web",
      })
      .then(() => { document.cookie = "dlv_ref=; path=/; max-age=0; samesite=lax"; })
      .catch(() => { /* tyst — blockerar aldrig */ });
  }, [hasPlatformSession, user]);

  useEffect(() => {
    const syncPreferredPayment = (event?: StorageEvent) => {
      if (event?.key && event.key !== "viaeats_preferred_payment_method_v1") return;
      try {
        const saved = localStorage.getItem("viaeats_preferred_payment_method_v1");
        setPreferredPayment(saved === "CARD" || saved === "SWISH" ? saved : "APPLE_PAY");
      } catch {
        // localStorage kan vara låst i vissa browserlägen; profilen ska ändå rendera.
        setPreferredPayment("APPLE_PAY");
      }
    };
    syncPreferredPayment();
    window.addEventListener("storage", syncPreferredPayment);
    return () => window.removeEventListener("storage", syncPreferredPayment);
  }, []);

  useEffect(() => {
    if (!hasPlatformSession || activeTab !== "payments") return;
    let cancelled = false;
    setPaymentMethodsLoading(true);
    axios
      .get("/api/platform/account/payment-methods")
      .then((res) => {
        if (cancelled) return;
        const methods = Array.isArray(res.data?.methods)
          ? res.data.methods
          : Array.isArray(res.data?.paymentMethods)
            ? res.data.paymentMethods
            : [];
        setPaymentMethods(methods);
      })
      .catch(() => {
        if (!cancelled) setPaymentMethods([]);
      })
      .finally(() => {
        if (!cancelled) setPaymentMethodsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeTab, hasPlatformSession]);


  const addPhoneFull = () => toE164Phone(addPhoneCountry, addPhoneNum);
  const changeOldFull = () => toE164Phone(changeOldCountry, changeOldNum);
  const changeNewFull = () => toE164Phone(changeNewCountry, changeNewNum);

  const openChangePhone = () => {
    const parts = splitProfilePhone(user?.phone);
    setChangeOldCountry(parts.country);
    setChangeOldNum(parts.number);
    setChangeOldCode("");
    setChangeOldToken("");
    setChangeNewCountry("+46");
    setChangeNewNum("");
    setChangeNewCode("");
    setChangePhoneError("");
    setChangePhoneStep("oldPhone");
    setIsChangingPhone(true);
  };

  const sendPhoneCode = async (phone: string) => {
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithOtp({ phone });
    if (error) throw error;
  };

  const handleSendOldPhoneCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setChangePhoneLoading(true);
    setChangePhoneError("");
    try {
      await sendPhoneCode(changeOldFull());
      setChangePhoneStep("oldCode");
    } catch (err: any) {
      setChangePhoneError(err?.message || "Kunde inte skicka kod till gamla numret.");
    } finally {
      setChangePhoneLoading(false);
    }
  };

  const handleVerifyOldPhoneCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setChangePhoneLoading(true);
    setChangePhoneError("");
    try {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase.auth.verifyOtp({ phone: changeOldFull(), token: changeOldCode.trim(), type: "sms" });
      if (error) throw error;
      const token = data.session?.access_token || (await supabase.auth.getSession()).data.session?.access_token;
      if (!token) throw new Error("SMS-sessionen kunde inte verifieras.");
      setChangeOldToken(token);
      setChangePhoneStep("newPhone");
    } catch (err: any) {
      setChangePhoneError(err?.message?.toLowerCase().includes("expired") ? "Koden har gått ut. Skicka en ny." : "Fel kod, försök igen.");
    } finally {
      setChangePhoneLoading(false);
    }
  };

  const handleSendNewPhoneCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setChangePhoneLoading(true);
    setChangePhoneError("");
    try {
      await sendPhoneCode(changeNewFull());
      setChangePhoneStep("newCode");
    } catch (err: any) {
      setChangePhoneError(err?.message || "Kunde inte skicka kod till nya numret.");
    } finally {
      setChangePhoneLoading(false);
    }
  };

  const handleVerifyNewPhoneCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setChangePhoneLoading(true);
    setChangePhoneError("");
    try {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase.auth.verifyOtp({ phone: changeNewFull(), token: changeNewCode.trim(), type: "sms" });
      if (error) throw error;
      const newToken = data.session?.access_token || (await supabase.auth.getSession()).data.session?.access_token;
      if (!newToken || !changeOldToken) throw new Error("Verifiera båda numren med SMS först.");
      const res = await axios.post(`/api/platform/profile/change-phone`, {
        oldPhone: changeOldFull(),
        oldVerificationToken: changeOldToken,
        newPhone: changeNewFull(),
        newVerificationToken: newToken,
      });
      await supabase.auth.signOut().catch(() => {});
      setUser((prev: any) => ({ ...(prev || {}), ...(res.data?.user || {}), phone: res.data?.user?.phone || changeNewFull(), isVerified: true }));
      await fetchData();
      setIsChangingPhone(false);
      toast("Numret är bytt", "success");
    } catch (err: any) {
      setChangePhoneError(err?.response?.data?.error || err?.message || "Kunde inte byta nummer.");
    } finally {
      setChangePhoneLoading(false);
    }
  };

  const lockPhone = async (fullPhone: string, phoneVerificationToken: string) => {
    const res = await axios.post(`/api/platform/profile/link-phone`, {
      phone: fullPhone,
      token: phoneVerificationToken,
    });
    // The SMS session was only a proof for linking. Do not leave it active so
    // profile bootstrap can mistake the linking session for a fresh login and
    // render the phone gate a second time.
    await createSupabaseBrowserClient().auth.signOut().catch(() => {});
    setUser((prev: any) => ({ ...(prev || {}), ...res.data.user }));
    await fetchData();
    setShowAddPhone(false);
    setAddPhoneStep("phone");
    setAddPhoneCode("");
  };

  // Äldre/importerade profiler utan nummer: verifiera numret via SMS och lås det.
  // Smarta fall:
  //  - nytt nummer → SMS-kod (steg "code").
  //  - numret tillhör redan ett telefon-konto → slå ihop det (var redan
  //    verifierat) utan ny kod.
  //  - SMS-rate-limit / ej aktiverat → tydligt meddelande resp. länka direkt.
  const handleAddPhone = async (e: React.FormEvent) => {
    e.preventDefault();
    const fullPhone = addPhoneFull();
    setAddPhoneLoading(true);
    setAddPhoneError("");
    try {
      const supabase = createSupabaseBrowserClient();
      // Standalone SMS OTP also works when the number already belongs to the
      // canonical phone account. updateUser({ phone }) rejected that case
      // before sending any code.
      const { error } = await supabase.auth.signInWithOtp({ phone: fullPhone });
      if (error) {
        const m = (error.message || "").toLowerCase();
        // INGA tysta genvägar — verifiering med kod krävs alltid. Visa felet.
        if (m.includes("rate") || m.includes("limit") || m.includes("too many")) {
          setAddPhoneError("För många SMS-försök just nu. Vänta en stund och försök igen.");
        } else if (m.includes("phone provider") || m.includes("sms provider") || m.includes("not enabled") || m.includes("not configured")) {
          setAddPhoneError("SMS-verifiering är inte aktiverad än. Försök igen senare.");
        } else {
          setAddPhoneError(error.message || "Kunde inte skicka koden. Kontrollera numret.");
        }
        return;
      }
      // SMS skickat → ALLTID kod-steg, ingen tyst länkning.
      setAddPhoneStep("code");
    } catch (err: any) {
      const m = (err?.message || "").toLowerCase();
      if (m.includes("sub claim") || m.includes("does not exist") || m.includes("user_not_found")) {
        const supabase = createSupabaseBrowserClient();
        await supabase.auth.signOut().catch(() => {});
        await clearPlatformSession().catch(() => {});
        markLoggedOut();
        setShowAddPhone(false); setAddPhoneStep("phone");
        setHasPlatformSession(false); setUser(null);
        return;
      }
      setAddPhoneError(err?.response?.data?.error || err?.message || t("profile.addPhone.errorGeneric"));
    } finally {
      setAddPhoneLoading(false);
    }
  };

  const handleVerifyAddPhone = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddPhoneLoading(true);
    setAddPhoneError("");
    try {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase.auth.verifyOtp({ phone: addPhoneFull(), token: addPhoneCode.trim(), type: "sms" });
      if (error) throw error;
      const phoneVerificationToken =
        data.session?.access_token ||
        (await supabase.auth.getSession()).data.session?.access_token;
      if (!phoneVerificationToken) {
        throw new Error("SMS-sessionen kunde inte verifieras. Försök igen.");
      }
      await lockPhone(addPhoneFull(), phoneVerificationToken);
      // Verifieringen är klar. Skicka vidare till startsidan i stället för att
      // stanna kvar i kompletteringsvyn.
      router.push("/");
    } catch (err: any) {
      // Skilj på fel kod, utgången kod och backend-konflikt (numret på annat konto).
      const backendMsg = err?.response?.data?.error;
      const m = (err?.message || "").toLowerCase();
      if (backendMsg) setAddPhoneError(backendMsg);
      else if (m.includes("expired")) setAddPhoneError("Koden har gått ut, försök igen.");
      else setAddPhoneError("Fel kod, försök igen.");
    } finally {
      setAddPhoneLoading(false);
    }
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const parts = splitProfileName(editName);
      await axios.patch(`/api/platform/profile`, { firstName: parts.firstName, lastName: parts.lastName, name: editName.trim() });
      setUser((prev: any) => ({ ...prev, name: editName.trim(), firstName: parts.firstName, lastName: parts.lastName }));
      setSaveSuccess(true);
      setTimeout(() => { setSaveSuccess(false); setIsEditing(false); }, 1500);
    } catch {
      alert(t("profile.editForm.saveError"));
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveMissingName = async () => {
    const full = missingName.trim().replace(/\s+/g, " ");
    if (!full) return;
    setMissingNameSaving(true);
    try {
      const parts = full.split(" ");
      const firstName = parts[0];
      const lastName = parts.length > 1 ? parts.slice(1).join(" ") : "";
      await axios.patch(`/api/platform/profile`, { firstName, lastName, name: full });
      setUser((prev: any) => ({ ...prev, name: full, firstName, lastName }));
      setEditName(full);
      setMissingName("");
    } catch {
      alert(t("profile.editForm.saveError"));
    } finally {
      setMissingNameSaving(false);
    }
  };

  const handleCompleteName = async (e: React.FormEvent) => {
    e.preventDefault();
    const first = completeFirst.trim().replace(/\s+/g, " ");
    const last = completeLast.trim().replace(/\s+/g, " ");
    if (!first || !last) {
      setCompleteNameError(t("profile.completeName.error"));
      return;
    }
    setCompleteNameSaving(true);
    setCompleteNameError("");
    try {
      const full = `${first} ${last}`;
      // Permanent koppling till kontot (backend User.firstName/lastName/name).
      await axios.patch(`/api/platform/profile`, { firstName: first, lastName: last, name: full });
      // Uppdatera lokalt → needsName blir false → nästa grind (telefon) eller
      // själva profilen renderas.
      setUser((prev: any) => ({ ...prev, firstName: first, lastName: last, name: full }));
      setEditName(full);
      setCompleteFirst("");
      setCompleteLast("");
    } catch {
      setCompleteNameError(t("profile.editForm.saveError"));
    } finally {
      setCompleteNameSaving(false);
    }
  };

  const handleLogout = async () => {
    markLoggedOut(); // spärra auto-återinlogg från kvarvarande Supabase-session
    try {
      await clearPlatformSession();
      setHasPlatformSession(false);
      setUser(null);
      setOrders([]);
      setDeals([]);
      // Töm in-memory PII så listan inte visas under fade-out till logged-out-vy.
      // localStorage rensas redan av clearPlatformSession (platform_quick_addresses
      // m.fl.) men React-state måste nollas separat.
      setSavedAddresses([]);
      await createSupabaseBrowserClient().auth.signOut().catch(() => {});
      toast("Verifieringen är glömd på den här enheten", "info");
    } catch {
      toast("Kunde inte glömma verifieringen just nu", "error");
    }
  };

  const orderStatusLabel = (status?: string | null) => {
    switch ((status || "").toUpperCase()) {
      case "DELIVERED":
        return "Levererad";
      case "READY":
        return "Redo";
      case "OUT_FOR_DELIVERY":
        return "På väg";
      case "CANCELLED":
        return "Avbruten";
      case "CONFIRMED":
        return "Bekräftad";
      default:
        return "Pågående";
    }
  };

  const handleMakeDefaultAddress = async (address: any) => {
    if (!address?.id || address.isDefault) return;
    try {
      const { data } = await axios.patch(`/api/platform/profile/addresses/${address.id}`, { ...address, isDefault: true });
      setSavedAddresses((current) => [data, ...current.filter((a) => a.id !== address.id).map((a) => ({ ...a, isDefault: false }))]);
    } catch (err: any) {
      alert(err?.response?.data?.error || t("profile.addresses.saveError"));
    }
  };

  const selectProfileTab = (tab: ProfileTab) => {
    setActiveTab(tab);
    setIsEditing(false);
    router.replace(tab === "overview" ? "/profile" : `/profile?tab=${tab}`, { scroll: false });
  };

  const handlePreferredPaymentChange = (method: PreferredPaymentMethod) => {
    setPreferredPayment(method);
    try {
      localStorage.setItem("viaeats_preferred_payment_method_v1", method);
    } catch {
      // Valet fungerar i sessionen även om localStorage inte är tillgängligt.
    }
  };

  // ─── Loading (skeleton — paritet med övriga sidor) ──────────────────────────
  if (loading) {
    return <ProfileSkeleton />;
  }

  // ─── Not logged in ────────────────────────────────────────────────────────
  if (!hasPlatformSession || !user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 py-20 pb-28" style={{ backgroundColor: "var(--bg-primary)" }}>
        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-sm space-y-3.5">

          <div className="text-center space-y-2">
            <div className="flex justify-center">
              <ViaEatsWordmark size="sm" />
            </div>
            <h1 className="text-[22px] font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>
              Verifiera ditt nummer
            </h1>
            <p className="mx-auto max-w-xs text-[14px] font-medium leading-5" style={{ color: "var(--text-secondary)" }}>
              Spara ordrar och få snabbare support med bara ditt telefonnummer.
            </p>
          </div>

          <div className="flex flex-col gap-2.5 pt-1">
            <PhoneAuth
              buttonLabel="Fortsätt med nummer"
              redirectTo={null}
              onCompleted={(profile) => {
                setHasPlatformSession(true);
                setUser(profile);
                setLoading(true);
                void fetchData();
              }}
            />
          </div>

          <ReferralProfileCard />

          {/* Information — Om oss, Kontakt och policy bakom EN knapp som leder
              till en samlad sida. */}
          <Link
            href="/more"
            className="mt-2 w-full flex items-center justify-between gap-3 px-4 py-3.5 rounded-2xl transition-all active:scale-[0.99]"
            style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-muted)" }}
          >
            <span className="flex items-center gap-3">
              <span className="w-9 h-9 rounded-xl bg-[var(--bg-deep)] text-[var(--text-secondary)] flex items-center justify-center shrink-0">
                <Info size={18} />
              </span>
              <span className="text-[14px] font-semibold tracking-tight" style={{ color: "var(--text-primary)" }}>
                {t("profile.menu.info")}
              </span>
            </span>
            <ChevronRight size={18} style={{ color: "var(--text-secondary)" }} />
          </Link>

          {/* Språkval — nåbart även utloggad (standard svenska). */}
          <div className="flex items-center justify-center gap-2 pt-2">
            {SUPPORTED_LOCALES.map((l) => {
              const active = locale === l.code;
              return (
                <button
                  key={l.code}
                  type="button"
                  onClick={() => setLocale(l.code as typeof locale)}
                  className="h-9 px-3.5 rounded-xl text-[13px] font-semibold flex items-center gap-1.5 transition-all active:scale-95"
                  style={active
                    ? { backgroundColor: "var(--gold-soft)", color: "var(--gold-ink)", border: "1px solid color-mix(in srgb, var(--gold-ink) 30%, transparent)" }
                    : { backgroundColor: "var(--bg-secondary)", color: "var(--text-secondary)", border: "1px solid var(--border-muted)" }}
                >
                  <span aria-hidden>{l.flag}</span> {l.label}
                </button>
              );
            })}
          </div>
        </motion.div>
      </div>
    );
  }

  // ─── Namn-grind ─────────────────────────────────────────────────────────
  // Visas när profilen saknar namn helt. Ligger före nummer-grinden så
  // sekvensen blir: förnamn+efternamn → nummer.
  const needsName =
    !user.name?.trim() && !user.firstName?.trim() && !user.lastName?.trim();
  if (needsName) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6" style={{ backgroundColor: "var(--bg-primary)" }}>
        <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-sm space-y-6">
          {/* Tillbaka = logga ut (samma som telefon-grinden). Onboarding kan
              inte skippas — man kommer inte in i profilen utan namn + nummer. */}
          <button
            type="button"
            onClick={async () => {
              setCompleteNameError(""); setCompleteFirst(""); setCompleteLast("");
              markLoggedOut();
              await clearPlatformSession().catch(() => {});
              try { await createSupabaseBrowserClient().auth.signOut(); } catch { /* noop */ }
              setHasPlatformSession(false); setUser(null);
            }}
            aria-label={t("common.back")}
            className="w-9 h-9 rounded-full flex items-center justify-center transition-colors hover:bg-[var(--bg-deep)]"
            style={{ border: "1px solid var(--line-strong)", color: "var(--text-primary)" }}
          >
            <ArrowLeft size={16} strokeWidth={2} />
          </button>
          <div className="text-center space-y-3">
            <div className="w-16 h-16 bg-[var(--bg-deep)] rounded-2xl flex items-center justify-center text-[var(--text-secondary)] mx-auto"><User size={28} /></div>
            <h2 className="text-[22px] font-bold tracking-tight">{t("profile.completeName.title")}</h2>
            <p className="text-[color:var(--text-secondary)] text-sm leading-relaxed">
              {t("profile.completeName.sub")}
            </p>
          </div>
          <form onSubmit={handleCompleteName} className="space-y-4">
            <input
              required
              autoFocus
              type="text"
              autoComplete="given-name"
              value={completeFirst}
              onChange={e => setCompleteFirst(e.target.value)}
              placeholder={t("profile.completeName.firstPlaceholder")}
              className="w-full rounded-2xl py-4 px-5 font-bold placeholder:text-[color:var(--text-secondary)] outline-none focus:ring-2 focus:ring-[color:var(--line-strong)]"
              style={{ backgroundColor: "var(--bg-deep)", border: "1px solid var(--border-muted)", color: "var(--text-primary)" }}
            />
            <input
              required
              type="text"
              autoComplete="family-name"
              value={completeLast}
              onChange={e => setCompleteLast(e.target.value)}
              placeholder={t("profile.completeName.lastPlaceholder")}
              className="w-full rounded-2xl py-4 px-5 font-bold placeholder:text-[color:var(--text-secondary)] outline-none focus:ring-2 focus:ring-[color:var(--line-strong)]"
              style={{ backgroundColor: "var(--bg-deep)", border: "1px solid var(--border-muted)", color: "var(--text-primary)" }}
            />
            {completeNameError && <p className="text-[12.5px] text-center font-medium" style={{ color: "#dc2626" }}>{completeNameError}</p>}
            <button
              type="submit"
              disabled={completeNameSaving || !completeFirst.trim() || !completeLast.trim()}
              className="w-full py-5 bg-gold-500 text-zinc-950 rounded-2xl font-bold text-sm active:scale-95 transition-all flex items-center justify-center gap-3 disabled:opacity-60"
            >
              {completeNameSaving ? <Loader2 className="animate-spin" size={20} /> : t("profile.completeName.save")}
            </button>
          </form>
        </motion.div>
      </div>
    );
  }

  // ─── Add phone prompt (legacy/imported profiles without phone) ────────────
  if (showAddPhone) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6" style={{ backgroundColor: "var(--bg-primary)" }}>
        <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-sm space-y-6">
          {/* Tillbaka = börja om. Nummer-verifieringen är obligatorisk för att
              kunna spara orderhistorik och supportdata på profilen. */}
          <button
            type="button"
            onClick={async () => {
              setAddPhoneStep("phone"); setAddPhoneError(""); setAddPhoneCode("");
              markLoggedOut();
              await clearPlatformSession().catch(() => {});
              try { await createSupabaseBrowserClient().auth.signOut(); } catch { /* noop */ }
              setHasPlatformSession(false); setUser(null); setShowAddPhone(false);
            }}
            aria-label={t("common.back")}
            className="w-9 h-9 rounded-full flex items-center justify-center transition-colors hover:bg-[var(--bg-deep)]"
            style={{ border: "1px solid var(--line-strong)", color: "var(--text-primary)" }}
          >
            <ArrowLeft size={16} strokeWidth={2} />
          </button>
          <div className="text-center space-y-3">
            <div className="w-16 h-16 bg-[var(--bg-deep)] rounded-2xl flex items-center justify-center text-[var(--text-secondary)] mx-auto"><Phone size={28} /></div>
            <h2 className="text-[22px] font-bold tracking-tight">{t("profile.addPhone.title")}</h2>
            <p className="text-[color:var(--text-secondary)] text-sm leading-relaxed">
              {t("profile.addPhone.sub")}
            </p>
          </div>
          {addPhoneStep === "phone" ? (
            <form onSubmit={handleAddPhone} className="space-y-4">
              <div className="flex gap-2">
                <PhoneCountrySelect value={addPhoneCountry} onChange={setAddPhoneCountry} />
                <input
                  required
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  value={addPhoneNum}
                  onChange={e => setAddPhoneNum(e.target.value)}
                  placeholder={t("profile.addPhone.placeholder")}
                  className="rounded-2xl py-4 px-5 font-bold placeholder:text-[color:var(--text-secondary)] outline-none focus:ring-2 focus:ring-[color:var(--line-strong)]"
                  style={{ flex: 1, minWidth: 0, backgroundColor: "var(--bg-deep)", border: "1px solid var(--border-muted)", color: "var(--text-primary)" }}
                />
              </div>
              {addPhoneError && <p className="text-[12.5px] text-center font-medium" style={{ color: "#dc2626" }}>{addPhoneError}</p>}
              <button
                type="submit"
                disabled={addPhoneLoading}
                className="w-full py-5 bg-gold-500 text-zinc-950 rounded-2xl font-bold text-sm active:scale-95 transition-all flex items-center justify-center gap-3"
              >
                {addPhoneLoading ? <Loader2 className="animate-spin" size={20} /> : t("profile.addPhone.save")}
              </button>
            </form>
          ) : (
            <form onSubmit={handleVerifyAddPhone} className="space-y-4">
              <p className="text-center text-[13px]" style={{ color: "var(--text-secondary)" }}>Vi skickade en kod till {addPhoneFull()}.</p>
              <input
                required
                inputMode="numeric"
                autoComplete="one-time-code"
                value={addPhoneCode}
                onChange={e => setAddPhoneCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="123456"
                className="w-full rounded-2xl py-4 px-5 font-bold text-center outline-none focus:ring-2 focus:ring-[color:var(--line-strong)]"
                style={{ backgroundColor: "var(--bg-deep)", border: "1px solid var(--border-muted)", color: "var(--text-primary)", letterSpacing: "0.3em", fontSize: 18 }}
              />
              {addPhoneError && <p className="text-[12.5px] text-center font-medium" style={{ color: "#dc2626" }}>{addPhoneError}</p>}
              <button
                type="submit"
                disabled={addPhoneLoading || addPhoneCode.length < 4}
                className="w-full py-5 bg-gold-500 text-zinc-950 rounded-2xl font-bold text-sm active:scale-95 transition-all flex items-center justify-center gap-3"
              >
                {addPhoneLoading ? <Loader2 className="animate-spin" size={20} /> : "Verifiera"}
              </button>
              <button type="button" onClick={() => { setAddPhoneStep("phone"); setAddPhoneError(""); }} className="w-full text-center text-[13px]" style={{ color: "var(--text-secondary)" }}>Ändra nummer</button>
            </form>
          )}
        </motion.div>
      </div>
    );
  }

  if (isChangingPhone) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6" style={{ backgroundColor: "var(--bg-primary)" }}>
        <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-sm space-y-6">
          <button
            type="button"
            onClick={() => setIsChangingPhone(false)}
            aria-label={t("common.back")}
            className="w-9 h-9 rounded-full flex items-center justify-center transition-colors hover:bg-[var(--bg-deep)]"
            style={{ border: "1px solid var(--line-strong)", color: "var(--text-primary)" }}
          >
            <ArrowLeft size={16} strokeWidth={2} />
          </button>
          <div className="text-center space-y-3">
            <div className="w-16 h-16 bg-[var(--bg-deep)] rounded-2xl flex items-center justify-center text-[var(--text-secondary)] mx-auto"><Phone size={28} /></div>
            <h2 className="text-[22px] font-bold tracking-tight">Byt nummer</h2>
            <p className="text-[color:var(--text-secondary)] text-sm leading-relaxed">
              Verifiera ditt gamla nummer och ditt nya nummer med SMS.
            </p>
          </div>

          {changePhoneStep === "oldPhone" && (
            <form onSubmit={handleSendOldPhoneCode} className="space-y-4">
              <div className="flex gap-2">
                <PhoneCountrySelect value={changeOldCountry} onChange={setChangeOldCountry} disabled />
                <input
                  required
                  disabled
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  value={changeOldNum}
                  className="rounded-2xl py-4 px-5 font-bold outline-none opacity-60"
                  style={{ flex: 1, minWidth: 0, backgroundColor: "var(--bg-deep)", border: "1px solid var(--border-muted)", color: "var(--text-primary)" }}
                />
              </div>
              {changePhoneError && <p className="text-[12.5px] text-center font-medium" style={{ color: "#dc2626" }}>{changePhoneError}</p>}
              <button type="submit" disabled={changePhoneLoading || !changeOldNum.trim()} className="w-full py-5 bg-gold-500 text-zinc-950 rounded-2xl font-bold text-sm active:scale-95 transition-all flex items-center justify-center gap-3 disabled:opacity-60">
                {changePhoneLoading ? <Loader2 className="animate-spin" size={20} /> : "Skicka kod till gamla numret"}
              </button>
            </form>
          )}

          {changePhoneStep === "oldCode" && (
            <form onSubmit={handleVerifyOldPhoneCode} className="space-y-4">
              <p className="text-center text-[13px]" style={{ color: "var(--text-secondary)" }}>Vi skickade en kod till {changeOldFull()}.</p>
              <input required inputMode="numeric" autoComplete="one-time-code" value={changeOldCode} onChange={e => setChangeOldCode(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="123456" className="w-full rounded-2xl py-4 px-5 font-bold text-center outline-none focus:ring-2 focus:ring-[color:var(--line-strong)]" style={{ backgroundColor: "var(--bg-deep)", border: "1px solid var(--border-muted)", color: "var(--text-primary)", letterSpacing: "0.3em", fontSize: 18 }} />
              {changePhoneError && <p className="text-[12.5px] text-center font-medium" style={{ color: "#dc2626" }}>{changePhoneError}</p>}
              <button type="submit" disabled={changePhoneLoading || changeOldCode.length < 4} className="w-full py-5 bg-gold-500 text-zinc-950 rounded-2xl font-bold text-sm active:scale-95 transition-all flex items-center justify-center gap-3 disabled:opacity-60">
                {changePhoneLoading ? <Loader2 className="animate-spin" size={20} /> : "Verifiera gamla numret"}
              </button>
            </form>
          )}

          {changePhoneStep === "newPhone" && (
            <form onSubmit={handleSendNewPhoneCode} className="space-y-4">
              <div className="flex gap-2">
                <PhoneCountrySelect value={changeNewCountry} onChange={setChangeNewCountry} />
                <input required type="tel" inputMode="tel" autoComplete="tel" value={changeNewNum} onChange={e => setChangeNewNum(e.target.value)} placeholder="070 000 00 00" className="rounded-2xl py-4 px-5 font-bold placeholder:text-[color:var(--text-secondary)] outline-none focus:ring-2 focus:ring-[color:var(--line-strong)]" style={{ flex: 1, minWidth: 0, backgroundColor: "var(--bg-deep)", border: "1px solid var(--border-muted)", color: "var(--text-primary)" }} />
              </div>
              {changePhoneError && <p className="text-[12.5px] text-center font-medium" style={{ color: "#dc2626" }}>{changePhoneError}</p>}
              <button type="submit" disabled={changePhoneLoading || !changeNewNum.trim()} className="w-full py-5 bg-gold-500 text-zinc-950 rounded-2xl font-bold text-sm active:scale-95 transition-all flex items-center justify-center gap-3 disabled:opacity-60">
                {changePhoneLoading ? <Loader2 className="animate-spin" size={20} /> : "Skicka kod till nya numret"}
              </button>
            </form>
          )}

          {changePhoneStep === "newCode" && (
            <form onSubmit={handleVerifyNewPhoneCode} className="space-y-4">
              <p className="text-center text-[13px]" style={{ color: "var(--text-secondary)" }}>Vi skickade en kod till {changeNewFull()}.</p>
              <input required inputMode="numeric" autoComplete="one-time-code" value={changeNewCode} onChange={e => setChangeNewCode(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="123456" className="w-full rounded-2xl py-4 px-5 font-bold text-center outline-none focus:ring-2 focus:ring-[color:var(--line-strong)]" style={{ backgroundColor: "var(--bg-deep)", border: "1px solid var(--border-muted)", color: "var(--text-primary)", letterSpacing: "0.3em", fontSize: 18 }} />
              {changePhoneError && <p className="text-[12.5px] text-center font-medium" style={{ color: "#dc2626" }}>{changePhoneError}</p>}
              <button type="submit" disabled={changePhoneLoading || changeNewCode.length < 4} className="w-full py-5 bg-gold-500 text-zinc-950 rounded-2xl font-bold text-sm active:scale-95 transition-all flex items-center justify-center gap-3 disabled:opacity-60">
                {changePhoneLoading ? <Loader2 className="animate-spin" size={20} /> : "Byt nummer"}
              </button>
              <button type="button" onClick={() => { setChangePhoneStep("newPhone"); setChangePhoneError(""); }} className="w-full text-center text-[13px]" style={{ color: "var(--text-secondary)" }}>Ändra nya numret</button>
            </form>
          )}
        </motion.div>
      </div>
    );
  }

  // ─── Logged in ────────────────────────────────────────────────────────────
  return (
    <>
    <div className="min-h-screen pt-[calc(env(safe-area-inset-top,0px)+1.5rem)] md:pt-16 pb-32 px-5 sm:px-6 lg:px-8" style={{ backgroundColor: "var(--bg-primary)" }}>
      <div className="max-w-2xl mx-auto space-y-8">

        {activeTab === "overview" ? (
          <div className="mb-2">
            <h1 className="text-[26px] font-black tracking-normal" style={{ color: "var(--text-primary)" }}>Profil</h1>
          </div>
        ) : (
          <div className="mb-2 flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                selectProfileTab("overview");
                setIsEditing(false);
              }}
              aria-label={t("common.back")}
              className="h-10 w-10 rounded-full flex items-center justify-center active:scale-95 transition-all"
              style={{ backgroundColor: "var(--bg-deep)", color: "var(--text-primary)" }}
            >
              <ChevronRight size={20} className="rotate-180" />
            </button>
            <div className="min-w-0">
              <p className="text-[10.5px] font-black tracking-[0.08em]" style={{ color: "var(--text-secondary)" }}>PROFIL</p>
              <h1 className="text-[22px] font-extrabold tracking-normal truncate" style={{ color: "var(--text-primary)" }}>
                {activeTab === "deals"
                  ? "Mina deals"
                  : activeTab === "orders"
                    ? "Orderhistorik"
                    : activeTab === "payments"
                      ? "Betalsätt"
                      : activeTab === "settings"
                        ? "Inställningar"
                        : "Profil"}
              </h1>
            </div>
          </div>
        )}

        {(!user.firstName || !user.lastName) && (
            <div
              className="mt-4 p-4 rounded-2xl"
              style={{
                backgroundColor: "var(--bg-secondary)",
                border: "1px solid var(--border-muted)",
                boxShadow: "var(--card-shadow)",
              }}
            >
              <div className="flex items-start gap-3">
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                  style={{ backgroundColor: "var(--bg-deep)", color: "var(--text-secondary)" }}
                >
                  <User size={17} strokeWidth={2} />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-[14px] font-semibold tracking-tight" style={{ color: "var(--text-primary)" }}>
                    Komplettera namn
                  </h3>
                  <p
                    className="text-[12px] mt-1 leading-snug"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    Förnamn och efternamn gör orderhistorik och support tydligare.
                  </p>
                  <div className="flex items-center gap-2 mt-3">
                    <input
                      value={missingName}
                      onChange={(e) => setMissingName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") handleSaveMissingName(); }}
                      placeholder="För- och efternamn"
                      autoComplete="name"
                      className="flex-1 min-w-0 rounded-xl py-2.5 px-3.5 text-[13px] font-semibold outline-none focus:ring-2 focus:ring-[color:var(--line-strong)]"
                      style={{ backgroundColor: "var(--bg-primary)", border: "1px solid var(--border-muted)", color: "var(--text-primary)" }}
                    />
                    <button
                      onClick={handleSaveMissingName}
                      disabled={!missingName.trim() || missingNameSaving}
                      className="shrink-0 rounded-xl px-4 py-2.5 text-[13px] font-bold active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center"
                      style={{ backgroundColor: "var(--text-primary)", color: "var(--bg-secondary)" }}
                    >
                      {missingNameSaving ? <Loader2 size={15} className="animate-spin" /> : "Spara"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

        {!user.phone && (
          <button
            onClick={() => setShowAddPhone(true)}
            className="w-full bg-amber-500/5 border border-amber-500/20 p-5 rounded-2xl flex items-center justify-between text-left hover:bg-amber-500/10 transition-all"
          >
            <div>
              <p className="text-[12px] font-medium text-amber-600 tracking-widest">{t("profile.recommended")}</p>
              <p className="font-bold text-sm mt-0.5" style={{ color: "var(--text-primary)" }}>{t("profile.addPhone")}</p>
            </div>
            <ChevronRight size={18} className="text-amber-500" />
          </button>
        )}

        {/* Verify phone banner - ONLY if they have a phone but not verified (legacy or fail) */}
        {user.phone && !user.isVerified && (
          <div className="bg-red-500/10 border border-red-500/20 p-6 rounded-2xl flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-red-500/20 rounded-xl flex items-center justify-center text-red-500">
                <Bell size={20} />
              </div>
              <div>
                <p className="text-[12px] font-medium text-red-400 tracking-widest">{t("profile.actionRequired")}</p>
                <div className="flex items-center gap-2">
                  <p className="font-bold text-sm" style={{ color: "var(--text-primary)" }}>{user.phone}</p>
                </div>
              </div>
            </div>
            <button
              onClick={() => {
                setAddPhoneNum(user.phone.replace("+46", ""));
                setAddPhoneCountry(user.phone.startsWith("+") ? user.phone.slice(0, 3) : "+46");
                setShowAddPhone(true);
              }}
              className="px-6 py-3 bg-red-500 text-white rounded-2xl text-[12px] font-medium active:scale-95 transition-all shadow-lg shadow-red-500/20"
            >
              {t("profile.fixNow")}
            </button>
          </div>
        )}

        <AnimatePresence mode="wait">
          {/* Orders Tab */}
          {activeTab === "orders" && (
            <motion.div
              key="orders"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="rounded-2xl overflow-hidden shadow-sm"
              style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-muted)" }}
            >
              {orders.length === 0 ? (
                <div className="px-[18px] py-7 text-center">
                  <History size={30} strokeWidth={1.8} className="mx-auto" style={{ color: "var(--text-secondary)" }} />
                  <p className="mt-2.5 text-[15px] font-bold" style={{ color: "var(--text-primary)" }}>Inga ordrar ännu</p>
                  <p className="mt-1 text-[12.5px] font-medium" style={{ color: "var(--text-secondary)" }}>Dina tidigare beställningar visas här.</p>
                </div>
              ) : (
                orders.slice(0, 12).map((order, index) => {
                  const restaurantName = order.restaurantName || order.restaurant?.name || t("profile.orders.fallbackName");
                  const total = Number(order.total ?? order.totalAmount ?? 0);
                  const orderHref = `/order/${order.id}`;
                  return (
                    <Link
                      key={order.id}
                      href={orderHref}
                      className="flex items-center gap-[13px] px-4 py-[15px] active:opacity-70 transition-opacity"
                      style={{ borderTop: index === 0 ? "0" : "1px solid var(--border-muted)" }}
                    >
                      <History size={20} strokeWidth={1.9} className="shrink-0" style={{ color: "var(--text-primary)" }} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[15px] font-bold truncate" style={{ color: "var(--text-primary)" }}>
                          {restaurantName}
                        </span>
                        <span className="block mt-0.5 text-[12.5px] font-medium truncate" style={{ color: "var(--text-secondary)" }}>
                          {orderStatusLabel(order.status)} · {total.toLocaleString("sv-SE")} kr
                        </span>
                      </span>
                      <ChevronRight size={18} className="shrink-0" style={{ color: "var(--text-secondary)" }} />
                    </Link>
                  );
                })
              )}
            </motion.div>
          )}

          {/* Addresses Tab */}
          {activeTab === "addresses" && (
            <motion.div key="addresses" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-3">
              {savedAddresses.length === 0 ? (
                <div className="py-16 text-center rounded-2xl" style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-muted)" }}>
                  <div className="mx-auto mb-5 w-16 h-16 rounded-2xl flex items-center justify-center" style={{ backgroundColor: "var(--bg-deep)", color: "var(--text-secondary)" }}>
                    <MapPin size={28} strokeWidth={1.8} />
                  </div>
                  <p className="text-lg font-bold tracking-tight mb-1.5" style={{ color: "var(--text-primary)" }}>{t("profile.addresses.empty.title")}</p>
                  <p className="text-sm max-w-xs mx-auto" style={{ color: "var(--text-secondary)" }}>{t("profile.addresses.empty.sub")}</p>
                  <Link href="/" className="mt-5 inline-flex h-11 items-center justify-center rounded-xl px-5 bg-gold-500 text-white text-[13px] font-bold">
                    {t("profile.addresses.add")}
                  </Link>
                </div>
              ) : (
                savedAddresses.map((address) => (
                  <div
                    key={address.id}
                    className="rounded-2xl p-5 shadow-sm"
                    style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-muted)" }}
                  >
                    <div className="flex items-start gap-4">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: "var(--bg-deep)", color: "var(--text-secondary)" }}>
                        {address.label === "Jobb" ? <Briefcase size={18} strokeWidth={1.8} /> : <Home size={18} strokeWidth={1.8} />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-[15px] font-bold" style={{ color: "var(--text-primary)" }}>{address.label || t("profile.addresses.label.home")}</p>
                          {address.isDefault ? (
                            <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ backgroundColor: "var(--gold-soft)", color: "var(--color-gold-500)" }}>
                              {t("profile.addresses.default")}
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-1 text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>{address.street}</p>
                        <p className="mt-0.5 text-[12px] font-medium" style={{ color: "var(--text-secondary)" }}>
                          {[address.zip, address.city].filter(Boolean).join(" ")}
                        </p>
                        {address.note ? (
                          <p className="mt-2 text-[12px] font-medium" style={{ color: "var(--text-secondary)" }}>{address.note}</p>
                        ) : null}
                      </div>
                    </div>
                    <div className="mt-4 flex items-center justify-between gap-3">
                      <button
                        type="button"
                        onClick={() => handleMakeDefaultAddress(address)}
                        disabled={address.isDefault}
                        className="h-10 px-4 rounded-xl text-[12px] font-bold transition-all disabled:opacity-45"
                        style={{ backgroundColor: "var(--bg-deep)", color: "var(--text-primary)" }}
                      >
                        {address.isDefault ? t("profile.addresses.default") : t("profile.addresses.makeDefault")}
                      </button>
                      <button
                        type="button"
                        onClick={() => { setAddressToDelete(address); setDeleteAddressModalOpen(true); }}
                        className="h-10 w-10 rounded-xl flex items-center justify-center text-rose-500 bg-rose-50"
                        aria-label={t("common.delete")}
                      >
                        <Trash2 size={16} strokeWidth={1.9} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </motion.div>
          )}

          {/* Deals Tab */}
          {activeTab === "deals" && (
            <motion.div key="deals" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">
               {/* Tillgängliga (oclaimade) popup-deals — visas som banners
                   så kunden kan claima senare om man missade popup-flödet
                   vid app-öppning. */}
               {availableDeals.length > 0 ? (
                 <div className="space-y-3">
                   <p className="text-[12px] font-medium text-[color:var(--text-secondary)] px-2">{t("profile.deals.availableTitle")}</p>
                   {availableDeals.map((deal: any) => {
                     const isClaiming = claimingId === deal.id;
                     return (
                       <div
                         key={`avail-${deal.id}`}
                         className="p-6 rounded-2xl relative overflow-hidden"
                         style={{
                           background: "linear-gradient(135deg, rgba(240,83,28,0.16), rgba(240,83,28,0.06))",
                           border: "1px solid rgba(240,83,28,0.35)",
                         }}
                       >
                         <div className="flex items-start gap-4">
                           {deal.imageUrl ? (
                             // eslint-disable-next-line @next/next/no-img-element
                             <img src={deal.imageUrl} alt="" className="h-16 w-16 rounded-2xl object-cover shrink-0" />
                           ) : (
                             <div className="flex h-16 w-16 items-center justify-center rounded-2xl shrink-0" style={{ backgroundColor: "var(--gold-soft)", color: "var(--gold-ink)" }}><Gift size={26} strokeWidth={1.8} /></div>
                           )}
                           <div className="flex-1 min-w-0">
                             <div className="text-[12px] font-medium text-gold-600 mb-1">
                               {t("profile.deals.newOffer")}
                             </div>
                             <h3 className="text-[17px] font-bold tracking-tight leading-tight" style={{ color: "var(--text-primary)" }}>
                               {deal.popupHeadline || deal.title}
                             </h3>
                             {deal.popupBody || deal.description ? (
                               <p className="mt-1.5 text-xs font-bold leading-5 text-[color:var(--text-secondary)]">{deal.popupBody || deal.description}</p>
                             ) : null}
                           </div>
                         </div>
                         <div className="mt-4 flex items-center justify-between gap-3">
                           <div className="text-[12px] font-medium text-[color:var(--text-secondary)]">
                             {deal.discountType === "PERCENTAGE" ? t("profile.deals.discountPct", { value: deal.discountValue }) : t("profile.deals.discountKr", { value: deal.discountValue })}
                             {deal.minOrder > 0 ? ` • ${t("profile.deals.minOrder", { amount: deal.minOrder })}` : ""}
                           </div>
                           <button
                             type="button"
                             disabled={isClaiming}
                             onClick={async () => {
                               setClaimingId(deal.id);
                               try {
                                 await axios.post(`/api/platform/profile/deals/${deal.id}/claim`);
                                 // Flytta dealen från available → claimed
                                 setAvailableDeals((current) => current.filter((d) => d.id !== deal.id));
                                 setClaimedDeals((current) => [{ ...deal, _kind: "CLAIMED" }, ...current]);
                               } catch (e: any) {
                                 alert(e?.response?.data?.error || t("profile.deals.claimError"));
                               } finally {
                                 setClaimingId(null);
                               }
                             }}
                             className="px-5 py-3 rounded-2xl bg-gold-500 text-zinc-950 font-bold text-[10px] active:scale-95 transition-all disabled:opacity-60"
                           >
                             {isClaiming ? t("profile.deals.saving") : (deal.popupCtaLabel || t("profile.deals.claim"))}
                           </button>
                         </div>
                       </div>
                     );
                   })}
                 </div>
               ) : null}

               {/* Claimade + globala deals (från popup-builder och broadcast) */}
               {claimedDeals.length > 0 ? (
                 <div className="space-y-3">
                   <p className="text-[12px] font-medium text-[color:var(--text-secondary)] px-2">{t("profile.deals.savedTitle")}</p>
                   {claimedDeals.map((deal: any) => {
                     const isClaimed = deal._kind === 'CLAIMED';
                     // Tag som visar typ av deal: Personlig (CustomerDeal),
                     // Restaurang (deal.restaurantId satt) eller Global.
                     const neutralTone = "bg-[color:var(--bg-deep)] text-[color:var(--text-secondary)] border-[color:var(--border-muted)]";
                     const dealKind: { label: string; tone: string } = deal.restaurantId
                       ? { label: t("profile.deals.kind.restaurant"), tone: neutralTone }
                       : isClaimed
                         ? { label: t("profile.deals.kind.personal"), tone: neutralTone }
                         : { label: t("profile.deals.kind.global"), tone: neutralTone };
                     return (
                       <Link
                         href={`/deals/${deal.id}`}
                         key={`claimed-${deal.id}`}
                         className="block p-6 rounded-2xl bg-gold-500/5 border border-gold-500/15 relative overflow-hidden hover:bg-gold-500/8 transition-colors"
                       >
                         <div className="flex items-start justify-between mb-4 gap-3">
                           <div className="flex-1">
                             <div className="flex flex-wrap items-center gap-2 mb-1">
                               <div className="text-[12px] font-medium text-gold-600">
                                 {isClaimed ? t("profile.deals.saved") : t("profile.deals.availableAll")}
                               </div>
                               <span className={`px-2 py-0.5 rounded-full border text-[11px] font-semibold ${dealKind.tone}`}>
                                 {dealKind.label}
                               </span>
                             </div>
                             <h3 className="text-[19px] font-bold tracking-tight leading-tight" style={{ color: "var(--text-primary)" }}>
                               {deal.popupHeadline || deal.title}
                             </h3>
                             {deal.popupBody || deal.description ? (
                               <p className="mt-2 text-xs font-bold leading-5 text-[color:var(--text-secondary)]">{deal.popupBody || deal.description}</p>
                             ) : null}
                           </div>
                           <div className="w-10 h-10 bg-gold-500 text-zinc-950 rounded-xl flex items-center justify-center shrink-0">
                             <Ticket size={18} />
                           </div>
                         </div>
                         {deal.popupCode ? (
                           <div className="p-3 rounded-2xl flex items-center justify-between mb-3" style={{ backgroundColor: "var(--bg-deep)", border: "1px solid var(--border-muted)" }}>
                             <div className="text-[12px] font-medium text-[color:var(--text-secondary)]">
                               {t("profile.deals.codeLabel")}: <span className="select-all" style={{ color: "var(--text-primary)" }}>{deal.popupCode}</span>
                             </div>
                             <button
                               onClick={() => { navigator.clipboard.writeText(deal.popupCode); }}
                               className="text-[12px] font-medium text-gold-600 hover:text-gold-700 transition-colors"
                             >
                               {t("profile.deals.copy")}
                             </button>
                           </div>
                         ) : null}
                         <div className="flex items-center justify-between text-[12px] font-medium text-[color:var(--text-secondary)]">
                           <div>{deal.discountType === "PERCENTAGE" ? t("profile.deals.discountPct", { value: deal.discountValue }) : t("profile.deals.discountKr", { value: deal.discountValue })} {deal.minOrder > 0 ? `• ${t("profile.deals.minOrder", { amount: deal.minOrder })}` : ""}</div>
                           <div>{t("profile.deals.validUntil", { date: deal.validUntil ? new Date(deal.validUntil).toLocaleDateString("sv-SE") : t("profile.deals.validUntilNever") })}</div>
                         </div>
                       </Link>
                     );
                   })}
                 </div>
               ) : null}

               {/* Personliga (CustomerDeal-baserade) deals */}
               {deals.length === 0 && claimedDeals.length === 0 ? (
                 <div className="py-16 text-center">
                    <div className="mx-auto mb-5 w-16 h-16 rounded-2xl flex items-center justify-center" style={{ backgroundColor: "var(--bg-deep)" }}>
                      <Tag size={28} className="text-[color:var(--text-secondary)]" />
                    </div>
                    <p className="text-lg font-bold tracking-tight mb-1.5" style={{ color: "var(--text-primary)" }}>{t("profile.deals.empty.title")}</p>
                    <p className="text-sm max-w-xs mx-auto" style={{ color: "var(--text-secondary)" }}>{t("profile.deals.empty.sub")}</p>
                 </div>
               ) : deals.length > 0 ? (
                 <div className="space-y-3">
                   <p className="text-[12px] font-medium text-[color:var(--text-secondary)] px-2">{t("profile.deals.personalCodes")}</p>
                   {deals.map((deal: any) => (
                   <div key={deal.id} className="p-8 rounded-2xl bg-gold-500/5 border border-gold-500/10 shadow-sm relative overflow-hidden group">
                      <div className="absolute top-0 right-0 w-24 h-24 bg-transparent" />
                      <div className="flex items-start justify-between mb-6">
                         <div className="flex-1 pr-4">
                            <div className="text-[12px] font-medium text-gold-600 mb-1">{deal.campaign.title}</div>
                            <h3 className="text-[22px] font-bold tracking-tight leading-tight" style={{ color: "var(--text-primary)" }}>
                                {deal.campaign.discountType === "PERCENTAGE"
                                  ? t("profile.deals.discountPctTitle", { value: deal.campaign.discountValue })
                                  : deal.campaign.discountType === "FREE_DELIVERY"
                                    ? "Fri leverans"
                                    : t("profile.deals.discountKrTitle", { value: deal.campaign.discountValue })}
                            </h3>
                            {deal.campaign.freeDelivery && deal.campaign.discountType !== "FREE_DELIVERY" ? (
                              <p className="mt-1 text-[12px] font-semibold text-gold-600">+ Fri leverans</p>
                            ) : null}
                         </div>
                         <div className="w-12 h-12 bg-gold-500 text-zinc-950 rounded-2xl flex items-center justify-center shadow-xl shrink-0"><Ticket size={24} /></div>
                      </div>

                      {deal.code ? <div className="p-4 rounded-2xl flex items-center justify-between mb-6" style={{ backgroundColor: "var(--bg-deep)", border: "1px solid var(--border-muted)" }}>
                         <div className="text-[12px] font-medium text-[color:var(--text-secondary)]">{t("profile.deals.codeLabel")}: <span className="select-all" style={{ color: "var(--text-primary)" }}>{deal.code}</span></div>
                         <button
                            onClick={() => { navigator.clipboard.writeText(deal.code); }}
                            className="text-[12px] font-medium text-gold-600 hover:text-gold-700 transition-colors"
                          >
                            {t("profile.deals.copy")}
                          </button>
                      </div> : null}

                      <div className="flex items-center justify-between text-[12px] font-medium text-[color:var(--text-secondary)]">
                         <div>{t("profile.deals.minOrderRow", { amount: deal.campaign.minOrder })}</div>
                         <div>{t("profile.deals.validUntil", { date: deal.campaign.validUntil ? new Date(deal.campaign.validUntil).toLocaleDateString("sv-SE") : t("profile.deals.validUntilNever") })}</div>
                      </div>
                   </div>
                 ))}
                 </div>
               ) : null}
            </motion.div>
          )}

          {/* Overview */}
          {activeTab === "overview" && (
            <motion.div key="ov" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-3.5">
              <div className="rounded-2xl p-[22px] shadow-sm" style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-muted)" }}>
                <div className="flex items-center gap-[16px]">
                  <div className="h-[72px] w-[72px] rounded-full bg-[#111113] text-white flex items-center justify-center shrink-0">
                    <span className="text-[28px] font-extrabold">
                    {(user.name || "ViaEats").trim().charAt(0).toUpperCase() || "D"}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[26px] font-black tracking-tight truncate" style={{ color: "var(--text-primary)" }}>
                      {user.name || "Din profil"}
                    </p>
                    <p className="mt-1 text-[13px] font-bold truncate" style={{ color: "var(--text-secondary)" }}>
                      {user.phone || "Nummer verifierat"}
                    </p>
                    <span className="mt-3 inline-flex rounded-full px-3 py-1 text-[11px] font-black" style={{ backgroundColor: "var(--gold-soft)", color: "var(--gold-ink)" }}>
                      Nummer verifierat
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    selectProfileTab("settings");
                    setIsEditing(true);
                  }}
                  className="mt-5 h-11 w-full rounded-xl text-[13px] font-extrabold active:scale-95 transition-all"
                  style={{ color: "var(--color-gold-500)" }}
                >
                  Ändra
                </button>
              </div>

              <ReferralProfileCard authenticated />

              <div className="rounded-2xl overflow-hidden shadow-sm" style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-muted)" }}>
                {[
                  { key: "deals", icon: Tag, title: "Mina deals", subtitle: deals.length ? `${deals.length} aktiva` : "Rabatter & koder", action: () => selectProfileTab("deals") },
                  { key: "orders", icon: History, title: "Orderhistorik", subtitle: `${orders.length} ordrar`, action: () => selectProfileTab("orders") },
                  { key: "phone", icon: Phone, title: "Byt nummer", subtitle: user.phone || "Verifiera gammalt och nytt nummer", action: openChangePhone },
                  { key: "support", icon: MessageCircle, title: "Support", subtitle: "Hjälp & kontakt", action: () => router.push("/contact") },
                  { key: "favorites", icon: Heart, title: "Favoriter", subtitle: "Sparade ställen", action: () => router.push("/discover") },
                  { key: "settings", icon: Settings, title: "Notiser & inställningar", subtitle: locale === "sv" ? "Svenska" : "English", action: () => selectProfileTab("settings") },
                ].map((row, index) => {
                  const Icon = row.icon;
                  return (
                    <button
                      key={row.key}
                      type="button"
                      onClick={row.action}
                      className="w-full flex items-center gap-3.5 px-4 py-[15px] text-left active:opacity-70 transition-opacity"
                      style={{ borderTop: index === 0 ? "0" : "1px solid var(--border-muted)" }}
                    >
                      <Icon size={20} strokeWidth={1.9} style={{ color: "var(--text-primary)" }} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[15px] font-bold truncate" style={{ color: "var(--text-primary)" }}>{row.title}</span>
                        <span className="block mt-0.5 text-[12.5px] font-medium truncate" style={{ color: "var(--text-secondary)" }}>{row.subtitle}</span>
                      </span>
                      <ChevronRight size={18} style={{ color: "var(--text-secondary)" }} />
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={handleLogout}
                className="w-full h-12 rounded-[14px] flex items-center justify-center gap-2 text-[14.5px] font-bold active:opacity-70 transition-opacity"
                style={{ border: "1px solid var(--border-muted)", color: "var(--danger, #dc2626)" }}
              >
                <LogOut size={18} />
                Glöm på den här enheten
              </button>
            </motion.div>
          )}

          {activeTab === "payments" && (
            <motion.div key="payments" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-3.5">
              <div className="rounded-2xl p-[18px] space-y-3 shadow-sm" style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-muted)" }}>
                <div className="flex items-center gap-3">
                  <div className="h-[42px] w-[42px] rounded-full flex items-center justify-center" style={{ backgroundColor: "var(--bg-deep)", color: "var(--text-primary)" }}>
                    <CreditCard size={21} strokeWidth={1.9} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[18px] font-extrabold tracking-normal" style={{ color: "var(--text-primary)" }}>Betalsätt</p>
                    <p className="mt-0.5 text-[12.5px] font-medium truncate" style={{ color: "var(--text-secondary)" }}>
                      {preferredPayment === "APPLE_PAY" ? "Apple Pay är valt" : preferredPayment === "CARD" ? "Kort är valt" : "Swish är valt"}
                    </p>
                  </div>
                </div>

                <div className="space-y-[9px]">
                  {PAYMENT_OPTIONS.map((option) => {
                    const selected = preferredPayment === option.key;
                    const Icon = option.icon;
                    return (
                      <button
                        key={option.key}
                        type="button"
                        onClick={() => handlePreferredPaymentChange(option.key)}
                        className="w-full rounded-[14px] px-[13px] py-3 flex items-center gap-3 text-left active:opacity-75 transition-all"
                        style={{
                          backgroundColor: selected ? "#FFF3ED" : "var(--bg-deep)",
                          border: `1.2px solid ${selected ? "var(--color-gold-500)" : "var(--border-muted)"}`,
                        }}
                      >
                        <Icon size={20} strokeWidth={1.9} style={{ color: selected ? "var(--color-gold-500)" : "var(--text-primary)" }} />
                        <span className="min-w-0 flex-1">
                          <span className="block text-[14.5px] font-extrabold truncate" style={{ color: "var(--text-primary)" }}>{option.title}</span>
                          <span className="block mt-0.5 text-[12px] font-medium truncate" style={{ color: "var(--text-secondary)" }}>{option.subtitle}</span>
                        </span>
                        <Check size={20} strokeWidth={2} style={{ color: selected ? "var(--color-gold-500)" : "var(--text-secondary)", opacity: selected ? 1 : 0.35 }} />
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-2xl overflow-hidden shadow-sm" style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-muted)" }}>
                <div className="px-4 py-[15px]" style={{ borderBottom: "1px solid var(--border-muted)" }}>
                  <p className="text-[16px] font-extrabold tracking-normal" style={{ color: "var(--text-primary)" }}>Sparade kort</p>
                  <p className="mt-0.5 text-[12.5px] font-medium" style={{ color: "var(--text-secondary)" }}>
                    {paymentMethodsLoading ? "Hämtar kort..." : paymentMethods.length ? `${paymentMethods.length} sparade` : "Inga sparade kort ännu"}
                  </p>
                </div>

                {paymentMethods.map((method, index) => {
                  const title = method.brand
                    ? `${method.brand}${method.lastFour ? ` •••• ${method.lastFour}` : ""}`
                    : method.lastFour
                      ? `Kort •••• ${method.lastFour}`
                      : "Sparat kort";
                  const expiry = [method.expiryMonth, method.expiryYear].filter(Boolean).join("/");
                  return (
                    <div key={method.id} className="flex items-center gap-3 px-4 py-3.5" style={{ borderTop: index === 0 ? "0" : "1px solid var(--border-muted)" }}>
                      <CreditCard size={20} style={{ color: "var(--text-primary)" }} />
                      <div className="min-w-0 flex-1">
                        <p className="text-[14.5px] font-extrabold truncate" style={{ color: "var(--text-primary)" }}>{title}</p>
                        <p className="mt-0.5 text-[12px] font-medium truncate" style={{ color: "var(--text-secondary)" }}>
                          {method.holderName || (expiry ? `Giltigt till ${expiry}` : "Redo för snabb betalning")}
                        </p>
                      </div>
                      {method.isDefault ? (
                        <span className="rounded-full px-2.5 py-1 text-[11.5px] font-extrabold" style={{ backgroundColor: "#FFF3ED", color: "var(--color-gold-500)" }}>Standard</span>
                      ) : null}
                    </div>
                  );
                })}

                {!paymentMethods.length && !paymentMethodsLoading ? (
                  <div className="px-4 py-5 text-center">
                    <Lock size={24} className="mx-auto" style={{ color: "var(--text-secondary)" }} />
                    <p className="mt-2 text-[14.5px] font-extrabold" style={{ color: "var(--text-primary)" }}>Kort sparas efter betalning</p>
                    <p className="mt-1 text-[12.5px] font-medium leading-5" style={{ color: "var(--text-secondary)" }}>Dina kortuppgifter lagras säkert hos betalpartnern.</p>
                  </div>
                ) : null}
              </div>
            </motion.div>
          )}

          {/* Settings */}
          {activeTab === "settings" && !isEditing && (
            <motion.div key="set" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-3.5">
              <div className="rounded-2xl overflow-hidden shadow-sm" style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-muted)" }}>
                <LanguagePickerRow />
                <Link href="/more" className="flex items-center justify-between gap-3 px-4 py-[14px] active:opacity-70 transition-opacity" style={{ borderTop: "1px solid var(--border-muted)" }}>
                  <span className="flex items-center gap-3.5 min-w-0">
                    <Info size={20} strokeWidth={1.9} style={{ color: "var(--text-primary)" }} />
                    <span className="text-[15px] font-bold truncate" style={{ color: "var(--text-primary)" }}>{t("profile.menu.info")}</span>
                  </span>
                  <ChevronRight size={18} style={{ color: "var(--text-secondary)" }} />
                </Link>
              </div>

              <div className="rounded-2xl overflow-hidden shadow-sm" style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-muted)" }}>
                <button
                  type="button"
                  onClick={() => setDeleteAccountModalOpen(true)}
                  className="w-full flex items-center justify-between gap-3 px-4 py-[14px] text-left active:opacity-70 transition-opacity"
                >
                  <span className="flex items-center gap-3.5">
                    <Trash2 size={20} strokeWidth={1.9} className="text-rose-500" />
                    <span className="text-[15px] font-bold text-rose-500">Radera profil</span>
                  </span>
                  <ChevronRight size={18} className="text-rose-500" />
                </button>
              </div>
            </motion.div>
          )}




          {/* Edit form */}
          {isEditing && (
            <motion.form
              key="edit"
              onSubmit={handleUpdateProfile}
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              className="p-8 rounded-2xl space-y-6 shadow-sm"
              style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-muted)" }}
            >
              <div className="flex items-center gap-3 mb-2">
                <button type="button" onClick={() => setIsEditing(false)} className="p-2 text-[color:var(--text-secondary)] hover:text-[color:var(--text-secondary)] rounded-xl">
                  <ArrowLeft size={18} />
                </button>
                <h3 className="text-[17px] font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>{t("profile.editForm.title")}</h3>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="text-[12px] font-medium text-[color:var(--text-secondary)] ml-1 mb-1 block">{t("profile.editForm.name")}</label>
                  <input value={editName} onChange={e => setEditName(e.target.value)} className="w-full rounded-2xl py-4 px-6 font-bold outline-none focus:ring-2 focus:ring-[color:var(--line-strong)]" style={{ backgroundColor: "var(--bg-primary)", border: "1px solid var(--border-muted)", color: "var(--text-primary)" }} />
                </div>
                <div>
                  <label className="text-[12px] font-medium text-[color:var(--text-secondary)] ml-1 mb-1 block">Telefon</label>
                  <button
                    type="button"
                    onClick={openChangePhone}
                    className="w-full rounded-2xl py-4 px-6 font-bold text-left flex items-center justify-between"
                    style={{ backgroundColor: "var(--bg-deep)", border: "1px solid var(--border-muted)", color: "var(--text-primary)" }}
                  >
                    <span>{user.phone || t("profile.overview.notSet")}</span>
                    <span className="text-[12px]" style={{ color: "var(--color-gold-500)" }}>Byt</span>
                  </button>
                </div>
              </div>
              <button
                type="submit"
                disabled={isSaving}
                className={`w-full py-5 rounded-2xl font-bold text-sm flex items-center justify-center gap-3 transition-all ${saveSuccess ? "bg-emerald-500 text-white" : "bg-gold-500 text-zinc-950 active:scale-95"}`}
              >
                {isSaving ? <Loader2 className="animate-spin" size={20} /> : saveSuccess ? t("profile.editForm.saved") : <><Save size={18} /> {t("common.save")}</>}
              </button>
            </motion.form>
          )}
        </AnimatePresence>

      </div>
    </div>

    {/* Delete Account Modal */}
    <ConfirmModal
      isOpen={deleteAccountModalOpen}
      onClose={() => setDeleteAccountModalOpen(false)}
      onConfirm={async () => {
        try {
          await axios.delete(`/api/platform/profile`);
          alert(t("profile.deleteAccount.done"));
          handleLogout();
        } catch (err: any) {
          alert(err.response?.data?.error || t("profile.deleteAccount.errorGeneric"));
        }
      }}
      title="Radera profil?"
      message="Detta går inte att ångra. Dina personuppgifter tas bort och orderhistorik kan anonymiseras av bokföringsskäl."
      confirmText="Ja, radera profil"
      cancelText={t("common.cancel")}
    />

    {/* Delete Address Modal */}
    <ConfirmModal
      isOpen={deleteAddressModalOpen}
      onClose={() => {
        setDeleteAddressModalOpen(false);
        setAddressToDelete(null);
      }}
      onConfirm={async () => {
        if (!addressToDelete) return;
        try {
          await axios.delete(`/api/platform/profile/addresses/${addressToDelete.id}`);
          setSavedAddresses(prev => prev.filter(a => a.id !== addressToDelete.id));
        } catch (err: any) {
          alert(err.response?.data?.error || t("profile.deleteAddress.errorGeneric"));
        } finally {
          setAddressToDelete(null);
        }
      }}
      title={t("profile.deleteAddress.title")}
      message={t("profile.deleteAddress.message", { label: addressToDelete?.label || "" })}
      confirmText={t("profile.deleteAccount.confirm")}
      cancelText={t("common.cancel")}
    />
    </>
  );
}

export default function ProfilePage() {
  return (
    <Suspense fallback={<ProfileSkeleton />}>
      <ProfileContent />
    </Suspense>
  );
}
