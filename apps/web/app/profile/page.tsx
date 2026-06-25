"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { signOut, useSession } from "next-auth/react";
import axios from "axios";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  User, Settings, MapPin, Mail, Phone, LogOut, ChevronRight,
  Package, History, ShieldCheck, Lock, ArrowLeft, Loader2, Save, Bell, Check, Edit2, Sparkles, Ticket, Tag,
  Home, Briefcase, Plus, Trash2, Gift, Languages, Info, Coins
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import DpointsPanel from "@/components/DpointsPanel";
import DpointsSponsorBanner from "@/components/DpointsSponsorBanner";
import { API_URL } from "@/lib/api";
import {
  clearPlatformSession,
  getPlatformSessionStatus,
  persistPlatformSession,
  markLoggedOut,
  isLoggedOutMark,
} from "@/lib/platformSessionClient";
import { useCartStore } from "@/store/cartStore";
import ConfirmModal from "@/components/ConfirmModal";
import SocialAuthButton from "@/components/SocialAuthButton";
import PhoneAuth from "@/components/PhoneAuth";
import PhoneCountrySelect from "@/components/PhoneCountrySelect";
import { getDeviceFingerprint } from "@/lib/deviceFingerprint";
// ReferralCard import removed — referral UI is disabled platform-wide.
// Backend redeem-code endpoint stays intact for legacy URLs.
import { useToast } from "@/components/Toast";
import { useTranslation } from "@/lib/i18n/LocaleProvider";

// ─── Country codes ─────────────────────────────────────────────────────────
// Landskods-väljare flyttad till delade <PhoneCountrySelect> (begränsad lista,
// Sverige som standard) — används av både telefon-inloggning och nummer-grinden.


/**
 * Språkväljare i Inställningar — paritet med RN-appen (sv/en/ar).
 * Persisterar i `matgo_locale`. Faktisk i18n-byte över UI:t är inte aktiverad
 * i webben ännu, så just nu bara sparar vi valet inför framtida i18n-runtime.
 */
// Endast de språk som faktiskt är implementerade i web-i18n:n (sv/en).
const SUPPORTED_LOCALES = [
  { code: "sv", label: "Svenska", flag: "🇸🇪" },
  { code: "en", label: "English", flag: "🇬🇧" },
] as const;

function LanguagePickerRow() {
  // Riktig i18n: locale + setLocale från LocaleProvider (byter UI direkt och
  // persisterar). Visar bara de språk som faktiskt är implementerade (sv/en).
  const { t, locale, setLocale } = useTranslation();
  const active = SUPPORTED_LOCALES.find((l) => l.code === locale) ?? SUPPORTED_LOCALES[0];

  return (
    <div className="p-6 flex items-center justify-between group">
      <div className="flex items-center gap-4">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: "var(--bg-deep)", color: "var(--text-secondary)" }}>
          <Languages size={18} strokeWidth={1.8} />
        </div>
        <div>
          <p className="font-semibold text-[14px]" style={{ color: "var(--text-primary)" }}>{t("profile.settings.language")}</p>
          <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>{active.flag} {active.label}</p>
        </div>
      </div>
      <div className="relative">
        <select
          value={locale}
          onChange={(e) => setLocale(e.target.value as typeof locale)}
          className="appearance-none text-[13px] font-semibold rounded-xl px-4 py-2.5 pr-8 cursor-pointer outline-none transition-all"
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
  const [activeTab, setActiveTab] = useState<"dpoints" | "overview" | "orders" | "settings" | "deals" | "addresses">("dpoints");
  const [hasVisited, setHasVisited] = useState(false);
  const searchParams = useSearchParams();

  useEffect(() => {
    const tab = searchParams.get("tab");
    // "orders" + "addresses" är borttagna flikar — gamla länkar faller till overview.
    if (tab === "orders" || tab === "addresses") {
      setActiveTab("overview");
    } else if (tab && ["dpoints", "overview", "settings", "deals"].includes(tab)) {
      setActiveTab(tab as any);
    }
  }, [searchParams]);

  // Saved addresses state
  const [savedAddresses, setSavedAddresses] = useState<any[]>([]);

  // Auth: inloggning sker på dedikerade /login-sidan (inte inline här).
  const [isLoggingOut, setIsLoggingOut] = useState(false); // To fix logout bug

  // Edit profile
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editShowNameInput, setEditShowNameInput] = useState(false); // For new phone users
  const [editEmail, setEditEmail] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
 
  // Add phone for OAuth users (Transition to OTP)
  const [showAddPhone, setShowAddPhone] = useState(false);
  const [addPhoneCountry, setAddPhoneCountry] = useState("+46");
  const [addPhoneNum, setAddPhoneNum] = useState("");
  const [addPhoneLoading, setAddPhoneLoading] = useState(false);
  const [addPhoneError, setAddPhoneError] = useState("");
  const [addPhoneStep, setAddPhoneStep] = useState<"phone" | "code">("phone");
  const [addPhoneCode, setAddPhoneCode] = useState("");
  const [isChangingPhone, setIsChangingPhone] = useState(false); // Link to edit phone number

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
      const [profileRes, ordersRes, dealsRes, claimedRes, addrRes] = await Promise.all([
        axios.get(`/api/platform/profile`),
        axios.get(`/api/platform/profile/orders`),
        axios.get(`/api/platform/profile/deals`),
        axios.get(`/api/platform/profile/claimed-deals`).catch(() => ({ data: { claimed: [], global: [] } })),
        axios.get(`/api/platform/profile/addresses`).catch(() => ({ data: [] })),
      ]);
      setHasPlatformSession(true);
      setUser(profileRes.data);
      setEditName(profileRes.data.name || "");
      setEditEmail(profileRes.data.email || "");
      setOrders(ordersRes.data || []);
      setDeals(dealsRes.data || []);
      // Sammanställ alla deals — claimade först (av kunden), sen globala (auto-tillgängliga).
      const merged = [
        ...((claimedRes.data?.claimed || []) as any[]).map((d: any) => ({ ...d, _kind: 'CLAIMED' })),
        ...((claimedRes.data?.global || []) as any[]).map((d: any) => ({ ...d, _kind: 'GLOBAL' })),
      ];
      setClaimedDeals(merged);
      // Available = popup-deals admin har skickat men användaren inte
      // klämt än. Visas som banners med "Spara erbjudande"-knapp så man
      // kan claima dem från Profile om man missade popupen vid app-start.
      setAvailableDeals((claimedRes.data?.available || []) as any[]);
      setSavedAddresses(addrRes.data || []);

      // If user has no phone, prompt them to add one
      if (!profileRes.data.phone) {
        setShowAddPhone(true);
      } else {
        setShowAddPhone(false);
      }
    } catch (err: any) {
      // ALDRIG auto-logga-ut härifrån. Tidigare buggade detta så att
      // Apple-OAuth-redirect triggade en falsk logout direkt efter inloggning.
      // Även 401 från /api/platform/profile kan vara timing-relaterat (cookie
      // hunnit inte propagera) snarare än verklig session-utgång — låt user
      // manuellt logga ut via knappen om sessionen är borta.
      const status = err?.response?.status;
      console.error(
        `[fetchData] error status=${status} message=${err?.message || err}. NOT auto-logging out. User can refresh or click logout if needed.`,
      );
    } finally {
      setLoading(false);
    }
  }, []);

  // ─── OAuth Session Exchange ──────────────────────────────────────────────
  const { data: session, status } = useSession();
  const platformToken = session?.platformToken;
  
  useEffect(() => {
    if (status === "authenticated" && platformToken && !isLoggingOut && !isLoggedOutMark()) {
      // Avoid overwriting a freshly verified local session with stale OAuth data.
      const isVerifiedLocally = user?.isVerified === true;
      if (!hasPlatformSession && !isVerifiedLocally) {
        void (async () => {
          try {
            await persistPlatformSession(platformToken);
            setHasPlatformSession(true);
            await fetchData();
          } catch {
            setLoading(false);
          }
        })();
      }
    }
  }, [status, platformToken, user, fetchData, isLoggingOut, hasPlatformSession]);

  // ─── Supabase Auth session ───────────────────────────────────────────────
  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    let exchanging = false;

    /**
     * När Supabase säger att vi är inloggade (Google/Apple OAuth) har
     * vi BARA en Supabase-session — inte vårt platform-JWT som backend kräver
     * för /api/platform/profile. Vi måste BYTA Supabase-token mot platform-
     * token via POST /api/auth/oauth-token.
     */
    const exchangeSupabaseForPlatformToken = async (
      sbSession: any,
      forceExchange = false,
    ) => {
      if (exchanging) return;
      exchanging = true;
      console.log("[OAuth] Starting Supabase → platform token exchange (force=", forceExchange, ")");
      try {
        // Om vi inte tvingar nytt byte: kolla om vi redan har en giltig
        // platform-session. (Tvingar gör vi vid SIGNED_IN-event eftersom
        // den gamla cookien kan vara stale från en annan användare.)
        if (!forceExchange) {
          const alreadyAuthed = await getPlatformSessionStatus();
          if (alreadyAuthed) {
            console.log("[OAuth] Already has platform session, fetching data");
            setHasPlatformSession(true);
            try {
              await fetchData();
              return;
            } catch {
              // fetchData failed (token kanske stale) → fall through till byte
              console.warn("[OAuth] Stale platform session, forcing exchange");
              await clearPlatformSession();
            }
          }
        }

        const sbUser = sbSession.user;
        const meta = sbUser?.user_metadata || {};
        const email =
          sbUser?.email ||
          meta.email ||
          meta.preferred_username ||
          null;
        // Apple ger namn ENDAST vid första auktorisering. Plocka allt vi
        // möjligen får från Supabase user_metadata.
        const oauthFirst = (
          meta.first_name ||
          meta.given_name ||
          meta.firstName ||
          ""
        ).trim();
        const oauthLast = (
          meta.last_name ||
          meta.family_name ||
          meta.lastName ||
          ""
        ).trim();
        const oauthFullName = (
          meta.full_name ||
          meta.name ||
          [oauthFirst, oauthLast].filter(Boolean).join(" ")
        ).trim();
        const oauthHasName = !!(oauthFirst || oauthLast || oauthFullName);

        console.log("[OAuth] Supabase user:", {
          email,
          provider: sbUser?.app_metadata?.provider,
          hasUser: !!sbUser,
          oauthFirst,
          oauthLast,
          oauthFullName,
          oauthHasName,
          rawMetaKeys: Object.keys(meta),
        });

        // Telefon-session (lösenordsfri SMS-OTP) saknar e-post — byt Supabase-
        // token mot platform-JWT via phone-token istället för att ge upp (annars
        // rensades cookien här och användaren loggades ut direkt efter koden).
        if (!email && sbUser?.phone) {
          try {
            const exRes = await axios.post(
              `${API_URL}/api/auth/phone-token`,
              {},
              { headers: { Authorization: `Bearer ${sbSession.access_token}` } },
            );
            if (exRes.data?.token) {
              await persistPlatformSession(exRes.data.token);
              setHasPlatformSession(true);
              await fetchData();
              return;
            }
          } catch (e) {
            console.warn("[OAuth] phone-token exchange failed", e);
          }
        }
        if (!email) {
          console.warn("[OAuth] No email/phone from Supabase user — cannot exchange");
          setLoading(false);
          return;
        }
        const provider =
          (sbUser?.app_metadata?.provider as string | undefined) ||
          "supabase";
        const providerId = sbUser?.id || "";
        const image = meta.avatar_url || meta.picture || null;

        console.log("[OAuth] POST /api/auth/oauth-token", { email, provider });
        const res = await axios.post(`${API_URL}/api/auth/oauth-token`, {
          email,
          // Skicka tomt namn om OAuth inte gav något — backend lägger
          // INTE in placeholder då, och gates till "complete profile" istället.
          name: oauthFullName || "",
          provider,
          providerId,
          image,
        });

        const platformToken = res.data?.token;
        if (!platformToken) {
          console.error("[OAuth] Backend returned no token", res.data);
          throw new Error("no platform token");
        }
        console.log("[OAuth] Got platform token, persisting…");

        await persistPlatformSession(platformToken);

        // STRICT APPLE SIGN-IN PERSISTENCE (samma logik som RN useAppleAuth):
        // ───────────────────────────────────────────────────────────────────
        // Apple skickar fullName ENDAST vid första auktoriseringen. Om OAuth
        // gav oss namn OCH backend's DB är fortfarande tom (firstName +
        // lastName båda null) → PATCH:a in det NU. Om DB redan har namn,
        // rör vi inget (single-source-of-truth).
        if (oauthHasName) {
          try {
            const profileNow = await axios.get("/api/platform/profile");
            const storedFirst = (profileNow.data?.firstName || "").trim();
            const storedLast = (profileNow.data?.lastName || "").trim();
            if (!storedFirst && !storedLast) {
              console.log(
                "[OAuth] DB tom + OAuth gav namn → PATCH:ar förnamn/efternamn",
                { oauthFirst, oauthLast }
              );
              await axios.patch("/api/platform/profile", {
                firstName: oauthFirst || undefined,
                lastName: oauthLast || undefined,
                name:
                  oauthFullName ||
                  [oauthFirst, oauthLast].filter(Boolean).join(" ") ||
                  undefined,
              });
            } else {
              console.log(
                "[OAuth] DB hade redan namn — IGNORERAR OAuth-namnet (single-source-of-truth)"
              );
            }
          } catch (err) {
            console.warn("[OAuth] Name-persist PATCH failed:", err);
          }
        }

        console.log("[OAuth] Platform session persisted, fetching profile");
        setHasPlatformSession(true);
        await fetchData();
        console.log("[OAuth] ✓ Login complete");
      } catch (err: any) {
        console.error(
          "[OAuth] Supabase → platform token exchange FAILED:",
          err?.response?.data || err?.message || err
        );
        setLoading(false);
      } finally {
        exchanging = false;
      }
    };

    // Initial mount-strategi:
    // Om Supabase har en session = användaren kommer just från Apple/Google-
    // callback. Den platform_session-cookie som finns kvar är förmodligen
    // STALE (från tidigare test-session, gammal user-id, gammal JWT_SECRET).
    // Force-clear cookien + kör exchange direkt så vi får en fresh JWT.
    //
    // Om Supabase INTE har session: kolla om platform-cookien funkar via
    // fetchData. Om den failar med 401 stannar vi kvar utan auto-logout
    // (kontrollerat utlogg via knappen istället).
    void (async () => {
      const { data: { session: sbSession } } = await supabase.auth.getSession();
      console.log(
        "[OAuth] Initial mount: hasSupabaseSession =",
        !!sbSession?.access_token,
      );

      if (sbSession?.access_token) {
        // Medvetet utloggad? En kvarvarande Supabase-session (cookies rensas inte
        // alltid rent) får INTE auto-logga in igen. Riv sessionen, stanna utloggad
        // tills explicit login (då rensas spärren).
        if (isLoggedOutMark()) {
          await supabase.auth.signOut().catch(() => {});
          setLoading(false);
          return;
        }
        // Fresh OAuth-flöde — alltid byt till fresh platform JWT, oavsett
        // om gammal cookie finns. Stale cookies orsakade 401-loop tidigare.
        console.log("[OAuth] Supabase session detected — forcing fresh exchange");
        await clearPlatformSession().catch(() => {});
        await exchangeSupabaseForPlatformToken(sbSession, true);
        return;
      }

      // Ingen Supabase-session — testa platform-cookien
      const authenticated = await getPlatformSessionStatus();
      console.log("[OAuth] Initial mount: hasPlatformSession =", authenticated);
      if (authenticated) {
        setHasPlatformSession(true);
        await fetchData();
      } else {
        setLoading(false);
      }
    })();

    // Lyssna på framtida auth-state-changes (t.ex. när användaren klickar
    // Google-knappen på samma session och kommer tillbaka)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, sbSession) => {
        console.log("[OAuth] auth state change:", event, "hasSession=", !!sbSession?.access_token);
        if (event === "SIGNED_IN" && sbSession?.access_token) {
          // Medvetet utloggad → ignorera (annars auto-återinlogg = flappning).
          if (isLoggedOutMark()) return;
          // Tvinga nytt token-byte vid SIGNED_IN för att inte använda en
          // stale platform-cookie från en tidigare misslyckad inloggning.
          void exchangeSupabaseForPlatformToken(sbSession, true);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, [fetchData]);

  // Invite-attribution för ALLA inloggningssätt (Google/Apple/telefon). Endast
  // PhoneAuth gjorde det förut → OAuth-invitees fick ingen Referral → ingen
  // 200-belöning. Här kopplas dlv_ref-cookien när en session finns. Idempotent
  // (inviteeUserId @unique); cookien rensas efter.
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
    const visited = localStorage.getItem("platform_has_visited");
    if (visited) setHasVisited(true);
    else localStorage.setItem("platform_has_visited", "true");
  }, []);


  const addPhoneFull = () => `${addPhoneCountry}${addPhoneNum.replace(/\D/g, "").replace(/^0/, "")}`;

  const lockPhone = async (fullPhone: string) => {
    const res = await axios.post(`/api/platform/profile/link-phone`, { phone: fullPhone });
    setUser((prev: any) => ({ ...(prev || {}), ...res.data.user }));
    await fetchData();
    setShowAddPhone(false);
    setAddPhoneStep("phone");
    setAddPhoneCode("");
  };

  // OAuth-konton (Google/Apple) utan nummer: verifiera numret via SMS (Supabase
  // phone_change) och lås det. Smarta fall:
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
      const { error } = await supabase.auth.updateUser({ phone: fullPhone });
      if (error) {
        const m = (error.message || "").toLowerCase();
        // INGA tysta genvägar — verifiering med kod krävs alltid. Visa felet.
        if (m.includes("already") || m.includes("exist") || m.includes("registered")) {
          setAddPhoneError("Numret är redan kopplat till ett konto. Logga ut och logga in med telefonnumret i stället.");
        } else if (m.includes("rate") || m.includes("limit") || m.includes("too many")) {
          setAddPhoneError("För många SMS-försök just nu. Vänta en stund och försök igen.");
        } else if (m.includes("sms") || m.includes("provider") || m.includes("disabled") || m.includes("unsupported")) {
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
      const { error } = await supabase.auth.verifyOtp({ phone: addPhoneFull(), token: addPhoneCode.trim(), type: "phone_change" });
      if (error) throw error;
      await lockPhone(addPhoneFull());
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
      await axios.patch(`/api/platform/profile`, { name: editName, email: editEmail });
      setUser((prev: any) => ({ ...prev, name: editName, email: editEmail }));
      setSaveSuccess(true);
      setTimeout(() => { setSaveSuccess(false); setIsEditing(false); }, 1500);
    } catch {
      alert(t("profile.editForm.saveError"));
    } finally {
      setIsSaving(false);
    }
  };

  const handleLogout = async () => {
    setIsLoggingOut(true);
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
      // Sign out of both Supabase and NextAuth (legacy)
      const supabase = createSupabaseBrowserClient();
      await Promise.allSettled([
        supabase.auth.signOut(),
        signOut({ redirect: false }),
      ]);
      toast(t("profile.logoutToast"), "info");
    } finally {
      setIsLoggingOut(false);
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

          {/* Header — kompakt. Delivera-lockupen (samma som startskärmen) i
              stället för en generisk lås-ikon. */}
          <div className="text-center space-y-2">
            <div className="flex justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/delivera-lockup.png" alt="Delívera" style={{ height: 30, width: "auto" }} />
            </div>
            <h1 className="text-[22px] font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>
              {hasVisited ? t("auth.welcomeBack.title.welcome") : t("auth.welcomeBack.title.create")}{" "}
              <span style={{ color: "var(--text-primary)" }}>{hasVisited ? t("auth.welcomeBack.title.welcomeAccent") : t("auth.welcomeBack.title.createAccent")}</span>
            </h1>
          </div>

          {/* Dpoints sponsor-banner — driver registrering (göms om inget aktivt kort) */}
          <DpointsSponsorBanner onRegister={() => router.push("/register")} />

          {/* Lösenordsfritt: Apple, Google eller telefon. Allt kopplas till
              numret — samma konto oavsett hur du loggar in nästa gång. */}
          <div className="flex flex-col gap-2.5 pt-1">
            <SocialAuthButton provider="apple" />
            <SocialAuthButton provider="google" />
            <PhoneAuth />
          </div>

          {/* Information — Om oss, Kontakt och policy bakom EN knapp som leder
              till en sida där du väljer. (Beställningar & support ligger nu i
              bottom-naven, så det kortet är borttaget här.) */}
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

  // ─── Add phone prompt (for OAuth users without phone) ─────────────────────
  if (showAddPhone) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6" style={{ backgroundColor: "var(--bg-primary)" }}>
        <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-sm space-y-6">
          {/* Tillbaka = börja om. Nummer-verifieringen är OBLIGATORISK och kan
              INTE skippas — man kommer aldrig in i profilen utan verifierat
              nummer. Loggar ut → auth-startvyn (välj annat SSO / logga in med
              nummer). markLoggedOut hindrar auto-återinlogg från Supabase-sessionen. */}
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

  // ─── Logged in ────────────────────────────────────────────────────────────
  return (
    <>
    <div className="min-h-screen pt-[calc(env(safe-area-inset-top,0px)+1.5rem)] md:pt-16 pb-32 px-5 sm:px-6 lg:px-8" style={{ backgroundColor: "var(--bg-primary)" }}>
      <div className="max-w-2xl mx-auto space-y-8">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4 min-w-0">
            <div className="min-w-0">
              <h1 className="text-[20px] font-bold tracking-tight truncate" style={{ color: "var(--text-primary)" }}>{user.name}</h1>
              {user.isVerified ? (
                <div className="flex items-center gap-1.5 mt-1 text-emerald-600">
                  <ShieldCheck size={14} />
                  <span className="text-[12px] font-medium">{t("profile.verified")}</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 mt-1 text-rose-500">
                  <Lock size={14} />
                  <span className="text-[12px] font-medium">{t("profile.notVerified")}</span>
                </div>
              )}
            </div>
          </div>
          <button onClick={handleLogout} aria-label={t("profile.logout")} className="p-3 rounded-2xl transition-all active:scale-95 hover:text-rose-500 shrink-0" style={{ backgroundColor: "var(--bg-deep)", color: "var(--text-secondary)" }}>
            <LogOut size={20} />
          </button>
        </div>

        {/*
          Apple-användare som saknar namn — Apple skickar fullName ENDAST
          vid första auktorisering. Om vi missade det (eller appen
          registrerades med tomt namn) måste användaren avregistrera Apple
          för FoodGo i sina iCloud-inställningar och logga in igen.
        */}
        {(user.oauthProvider === "apple" || user.oauthProvider === "supabase") &&
          (!user.firstName || !user.lastName) && (
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
                    {t("profile.appleNoName.title")}
                  </h3>
                  <p
                    className="text-[12px] mt-1 leading-snug"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {t("profile.appleNoName.intro")}
                  </p>
                  <ol
                    className="text-[12px] mt-2 ml-4 list-decimal space-y-1"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    <li>
                      {t("profile.appleNoName.step1Open")}{" "}
                      <a
                        href="https://appleid.apple.com/account/manage"
                        target="_blank"
                        rel="noreferrer"
                        className="underline font-bold"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {t("profile.appleNoName.step1Link")}
                      </a>
                    </li>
                    <li>
                      {t("profile.appleNoName.step2")}
                    </li>
                    <li>{t("profile.appleNoName.step3")}</li>
                  </ol>
                  <p
                    className="text-[11px] mt-2 italic"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {t("profile.appleNoName.alt")}
                  </p>
                </div>
              </div>
            </div>
          )}

        {/* Phone missing warning for OAuth users */}
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

        <div className="grid grid-cols-4 p-1.5 rounded-2xl shadow-sm" style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-muted)" }}>
          {[
            { id: "dpoints", icon: Coins, label: t("profile.tabs.dpoints") },
            { id: "overview", icon: User, label: t("profile.tabs.home") },
            { id: "deals", icon: Sparkles, label: t("profile.tabs.deals") },
            // "Ordrar"- och "Adresser"-flikarna är borttagna från profilen —
            // ordrar finns i bottom-nav (/orders); adress hanteras på startsidan.
            { id: "settings", icon: Settings, label: t("profile.tabs.settings") },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => { setActiveTab(tab.id as any); setIsEditing(false); }}
              className={`relative flex flex-col items-center gap-1.5 py-4 rounded-2xl transition-all ${activeTab === tab.id ? "" : "hover:opacity-80"}`}
              style={{ color: activeTab === tab.id ? "var(--text-primary)" : "var(--text-secondary)" }}
            >
              <tab.icon size={18} />
              <span className="text-[8px] font-bold">{tab.label}</span>
              {activeTab === tab.id && (
                <span className="absolute left-1/2 -translate-x-1/2 bottom-1.5 h-[2px] w-6 rounded-full" style={{ backgroundColor: "var(--color-gold-500, #E7B24B)" }} />
              )}
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          {/* Dpoints Tab — default-landning i profilen */}
          {activeTab === "dpoints" && (
            <motion.div key="dpoints" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">
              <DpointsPanel />
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
                           background: "linear-gradient(135deg, rgba(243,191,87,0.16), rgba(243,191,87,0.06))",
                           border: "1px solid rgba(243,191,87,0.35)",
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
                                {deal.campaign.discountType === "PERCENTAGE" ? t("profile.deals.discountPctTitle", { value: deal.campaign.discountValue }) : t("profile.deals.discountKrTitle", { value: deal.campaign.discountValue })}
                            </h3>
                         </div>
                         <div className="w-12 h-12 bg-gold-500 text-zinc-950 rounded-2xl flex items-center justify-center shadow-xl shrink-0"><Ticket size={24} /></div>
                      </div>

                      <div className="p-4 rounded-2xl flex items-center justify-between mb-6" style={{ backgroundColor: "var(--bg-deep)", border: "1px solid var(--border-muted)" }}>
                         <div className="text-[12px] font-medium text-[color:var(--text-secondary)]">{t("profile.deals.codeLabel")}: <span className="select-all" style={{ color: "var(--text-primary)" }}>{deal.code}</span></div>
                         <button
                            onClick={() => { navigator.clipboard.writeText(deal.code); }}
                            className="text-[12px] font-medium text-gold-600 hover:text-gold-700 transition-colors"
                          >
                            {t("profile.deals.copy")}
                          </button>
                      </div>

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
            <motion.div key="ov" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">
              <div className="rounded-2xl p-8 space-y-5 shadow-sm" style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-muted)" }}>
                <div className="flex items-center gap-4">
                  <Phone size={16} className="text-[color:var(--text-secondary)] shrink-0" />
                  <div className="flex-1">
                    <p className="text-[12px] font-medium text-[color:var(--text-secondary)]">{t("profile.overview.phone")}</p>
                    <p className="font-bold text-sm" style={{ color: "var(--text-primary)" }}>{user.phone || t("profile.overview.notSet")}</p>
                  </div>
                  {user.isVerified ? (
                    <span className="text-[8px] bg-emerald-50 text-emerald-600 border border-emerald-100 px-3 py-1.5 rounded-full font-semibold flex items-center gap-1">
                      <Lock size={8} /> {t("profile.overview.locked")}
                    </span>
                  ) : (
                    <button
                      onClick={() => {
                        setAddPhoneNum(user.phone?.replace("+46", "") || "");
                        setAddPhoneCountry(user.phone?.startsWith("+") ? user.phone.slice(0, 3) : "+46");
                        setShowAddPhone(true);
                      }}
                      className="text-[8px] bg-amber-50 text-amber-600 border border-amber-100 px-3 py-1.5 rounded-full font-semibold hover:bg-amber-100 transition-all flex items-center gap-1"
                    >
                      <Edit2 size={8} /> {t("profile.overview.edit")}
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-4">
                  <Mail size={16} className="text-[color:var(--text-secondary)] shrink-0" />
                  <div className="flex-1">
                    <p className="text-[12px] font-medium text-[color:var(--text-secondary)]">{t("profile.overview.email")}</p>
                    <p className="font-bold text-sm" style={{ color: "var(--text-primary)" }}>{user.email || t("profile.overview.notSet")}</p>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-2xl p-6 shadow-sm" style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-muted)" }}>
                  <p className="text-[12px] font-medium text-[color:var(--text-secondary)] mb-1">{t("profile.overview.ordersCount")}</p>
                  <p className="text-3xl font-bold" style={{ color: "var(--text-primary)" }}>{orders.length}</p>
                </div>
                <div className="rounded-2xl p-6 shadow-sm" style={{ backgroundColor: user.isVerified ? "var(--bg-secondary)" : "var(--bg-secondary)", border: user.isVerified ? "1px solid rgba(5,150,105,0.1)" : "1px solid var(--border-muted)" }}>
                  <p className="text-[12px] font-medium text-[color:var(--text-secondary)] mb-1">{t("profile.overview.status")}</p>
                  <p className={`text-[14px] font-semibold ${user.isVerified ? "text-emerald-600" : "text-rose-500"}`}>
                    {user.isVerified ? t("profile.overview.statusVerified") : t("profile.overview.statusUnverified")}
                  </p>
                </div>
              </div>

              {/* Mina beställningar — flyttad hit från bottom-nav. Länkar till
                  /orders-sidan (fungerar utan login via localStorage-historik). */}
              <Link
                href="/orders"
                className="rounded-2xl p-6 flex items-center justify-between group shadow-sm transition-all"
                style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-muted)" }}
              >
                <div className="flex items-center gap-4">
                  <div className="w-11 h-11 rounded-2xl bg-[var(--bg-deep)] text-[var(--text-secondary)] flex items-center justify-center">
                    <History size={20} />
                  </div>
                  <div>
                    <p className="font-bold text-sm" style={{ color: "var(--text-primary)" }}>{t("profile.ordersSupport")}</p>
                    <p className="text-[10px] font-bold mt-0.5" style={{ color: "var(--text-secondary)" }}>{t("orders.subtitle")}</p>
                  </div>
                </div>
                <ChevronRight size={18} className="text-[color:var(--text-secondary)] transition-colors" />
              </Link>

              {/* Referral-kort borttaget — referral-systemet avstängt för
                  launch. Komponenten finns kvar i repo men renderas inte. */}
            </motion.div>
          )}

          {/* Settings */}
          {activeTab === "settings" && !isEditing && (
            <motion.div key="set" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-6">
              <div className="space-y-2">
                <div className="px-4 text-[12px] font-medium mb-2" style={{ color: "var(--text-secondary)" }}>{t("profile.settings.section.profile")}</div>
                <div className="rounded-2xl" style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-muted)" }}>
                  <button
                    onClick={() => setIsEditing(true)}
                    className="w-full flex items-center justify-between p-6 hover:bg-black/[0.025] transition-all text-left rounded-2xl"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-[var(--bg-deep)] text-[var(--text-secondary)] rounded-xl flex items-center justify-center"><Settings size={18} /></div>
                      <div>
                        <p className="text-[14px] font-semibold" style={{ color: "var(--text-primary)" }}>{t("profile.settings.editProfile")}</p>
                        <p className="text-[10px]" style={{ color: "var(--text-secondary)" }}>{t("profile.settings.editProfileSub")}</p>
                      </div>
                    </div>
                    <ChevronRight size={18} style={{ color: "var(--text-secondary)" }} />
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <div className="px-4 text-[12px] font-medium mb-2" style={{ color: "var(--text-secondary)" }}>{t("profile.settings.section.prefs")}</div>
                <div className="rounded-2xl divide-y divide-[color:var(--border-muted)]" style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-muted)" }}>
                  <div className="p-6 flex items-center justify-between group">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-[color:var(--bg-deep)] text-[color:var(--text-secondary)] flex items-center justify-center">
                        <Bell size={18} />
                      </div>
                      <div>
                        <p className="font-bold text-sm" style={{ color: "var(--text-primary)" }}>{t("profile.settings.push")}</p>
                        <p className="text-[10px] text-[color:var(--text-secondary)] font-medium">{t("profile.settings.pushSub")}</p>
                      </div>
                    </div>
                    <div className="w-12 h-6 bg-[color:var(--line-strong)] rounded-full relative cursor-pointer opacity-50">
                       <div className="absolute left-1 top-1 w-4 h-4 bg-[color:var(--text-secondary)] rounded-full" />
                    </div>
                  </div>
                  {/*
                    Språkväljare (paritet med RN — sv/en/ar).
                    TODO: i18n-byte i UI är inte trådat in i webben ännu (next-intl saknas).
                    För nu persisterar vi bara valet i `matgo_locale` så att flaggan följer
                    med när en framtida i18n-lösning aktiveras.
                  */}
                  <LanguagePickerRow />
                </div>
              </div>

              {/* Information — Om oss, Kontakt och policy bakom EN knapp som tar
                  dig till en sida där du väljer (monokromt, ingen guld). Egen
                  sektion ovanför kontot så den är tydlig och inte begravd. */}
              <div className="space-y-2">
                <div className="px-4 text-[12px] font-medium text-[color:var(--text-secondary)] mb-2">{t("profile.menu.info")}</div>
                <Link href="/more" className="flex items-center justify-between rounded-2xl px-5 min-h-[56px] active:scale-[0.99] transition-all" style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-muted)", boxShadow: "var(--card-shadow)" }}>
                  <span className="flex items-center gap-3 min-w-0">
                    <Info size={17} style={{ color: "var(--text-secondary)" }} />
                    <span className="text-[15px] font-semibold truncate" style={{ color: "var(--text-primary)" }}>{t("profile.menu.info")}</span>
                  </span>
                  <ChevronRight size={16} style={{ color: "var(--text-secondary)" }} />
                </Link>
              </div>

              <div className="space-y-2">
                <div className="px-4 text-[12px] font-medium text-[color:var(--text-secondary)] mb-2">{t("profile.settings.section.account")}</div>
                <div className="rounded-2xl shadow-sm" style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-muted)" }}>
                  <button
                    onClick={() => setDeleteAccountModalOpen(true)}
                    className="w-full text-left p-6 flex items-center justify-between group hover:bg-rose-50 transition-all rounded-2xl"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-500 flex items-center justify-center">
                        <Trash2 size={18} />
                      </div>
                      <div>
                        <p className="font-bold text-sm text-rose-500">{t("profile.settings.deleteAccount")}</p>
                        <p className="text-[10px] text-[color:var(--text-secondary)] font-medium">{t("profile.settings.deleteAccountSub")}</p>
                      </div>
                    </div>
                  </button>
                </div>
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
                  <label className="text-[12px] font-medium text-[color:var(--text-secondary)] ml-1 mb-1 block">{t("profile.editForm.email")}</label>
                  <input type="email" value={editEmail} onChange={e => setEditEmail(e.target.value)} placeholder={t("auth.emailPlaceholder")} className="w-full rounded-2xl py-4 px-6 font-bold outline-none focus:ring-2 focus:ring-[color:var(--line-strong)]" style={{ backgroundColor: "var(--bg-primary)", border: "1px solid var(--border-muted)", color: "var(--text-primary)" }} />
                </div>
                <div>
                  <label className="text-[12px] font-medium text-[color:var(--text-secondary)] ml-1 mb-1 block">{t("profile.editForm.phoneLocked")}</label>
                  <input disabled value={user.phone || t("profile.overview.notSet")} className="w-full rounded-2xl py-4 px-6 font-bold cursor-not-allowed opacity-50" style={{ backgroundColor: "var(--bg-deep)", border: "1px solid var(--border-muted)", color: "var(--text-secondary)" }} />
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
      title={t("profile.deleteAccount.title")}
      message={t("profile.deleteAccount.message")}
      confirmText={t("profile.deleteAccount.confirm")}
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
