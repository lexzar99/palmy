"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { signIn, signOut, useSession } from "next-auth/react";
import axios from "axios";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  User, Settings, MapPin, Mail, Phone, LogOut, ChevronRight,
  Package, History, ShieldCheck, Lock, ArrowLeft, Loader2, Save, Bell, Check, Edit2, Sparkles, Ticket, Tag,
  Star, RotateCcw, Home, Briefcase, Plus, Trash2, Scale, Eye, EyeOff
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
} from "@/lib/platformSessionClient";
import { useCartStore } from "@/store/cartStore";
import ConfirmModal from "@/components/ConfirmModal";
import MobileFooterLinks from "@/components/MobileFooterLinks";
// ReferralCard import removed — referral UI is disabled platform-wide.
// Backend redeem-code endpoint stays intact for legacy URLs.
import { useToast } from "@/components/Toast";
import { useTranslation } from "@/lib/i18n/LocaleProvider";

// ─── Country codes ─────────────────────────────────────────────────────────
const COUNTRY_CODES = [
  { flag: "🇸🇪", code: "+46", country: "Sverige" },
  { flag: "🇳🇴", code: "+47", country: "Norge" },
  { flag: "🇩🇰", code: "+45", country: "Danmark" },
  { flag: "🇫🇮", code: "+358", country: "Finland" },
  { flag: "🇩🇪", code: "+49", country: "Tyskland" },
  { flag: "🇬🇧", code: "+44", country: "Storbritannien" },
  { flag: "🇵🇱", code: "+48", country: "Polen" },
  { flag: "🇸🇴", code: "+252", country: "Somalia" },
  { flag: "🇸🇾", code: "+963", country: "Syrien" },
  { flag: "🇮🇶", code: "+964", country: "Irak" },
  { flag: "🇱🇧", code: "+961", country: "Libanon" },
  { flag: "🇺🇸", code: "+1", country: "USA" },
];

function CountryPicker({
  value, onChange
}: {
  value: string;
  onChange: (code: string) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const selected = COUNTRY_CODES.find(c => c.code === value) || COUNTRY_CODES[0];
  const filtered = search.trim()
    ? COUNTRY_CODES.filter((c) => `${c.country} ${c.code}`.toLowerCase().includes(search.trim().toLowerCase()))
    : COUNTRY_CODES;

  // Stäng dropdown vid klick utanför.
  useEffect(() => {
    if (!open) return;
    const onDocClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest("[data-country-picker]")) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  return (
    <div className="relative" data-country-picker>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-2xl py-4 px-4 font-bold whitespace-nowrap h-full"
        style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-muted)", color: "var(--text-primary)" }}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="text-lg">{selected.flag}</span>
        <span className="text-sm">{selected.code}</span>
        <ChevronRight size={14} className={`text-zinc-400 transition-transform ${open ? "rotate-90" : ""}`} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.95 }}
            className="absolute top-full left-0 mt-2 z-50 rounded-2xl overflow-hidden shadow-2xl w-72 max-w-[calc(100vw-2rem)]"
            style={{ backgroundColor: "var(--bg-primary)", border: "1px solid var(--border-muted)" }}
            role="listbox"
          >
            <div className="px-3 pt-3 pb-2" style={{ borderBottom: "1px solid var(--border-muted)" }}>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("profile.country.search")}
                autoFocus
                className="w-full rounded-xl px-3 py-2 text-sm outline-none"
                style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-muted)", color: "var(--text-primary)" }}
              />
            </div>
            <div className="max-h-72 overflow-auto">
              {filtered.length === 0 ? (
                <div className="px-4 py-6 text-center text-xs text-zinc-400">{t("profile.country.empty")}</div>
              ) : (
                filtered.map((c) => (
                  <button
                    key={c.code}
                    type="button"
                    onClick={() => { onChange(c.code); setOpen(false); setSearch(""); }}
                    className={`w-full flex items-center gap-3 px-4 py-3 text-sm transition-colors text-left ${value === c.code ? "font-black" : ""}`}
                    style={{ color: "var(--text-primary)", backgroundColor: value === c.code ? "var(--bg-secondary)" : "transparent" }}
                    role="option"
                    aria-selected={value === c.code}
                  >
                    <span className="text-xl">{c.flag}</span>
                    <div className="flex-1">
                      <div className="font-bold text-xs">{c.country}</div>
                      <div className="text-zinc-400 text-[10px]">{c.code}</div>
                    </div>
                    {value === c.code && <Check size={14} className="text-gold-500" />}
                  </button>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Social login button (Supabase Auth) ───────────────────────────────────
function SocialButton({
  provider,
  label,
  icon,
}: {
  provider: "google" | "apple";
  label: string;
  icon: React.ReactNode;
}) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleClick = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const supabase = createSupabaseBrowserClient();
      const options: { redirectTo: string; scopes?: string } = {
        redirectTo: `${window.location.origin}/auth/callback`,
      };
      // Explicita scopes per provider så vi får tillbaka strukturerat
      // namn + email (annars hamnar profilen i "Komplettera namn"-läge).
      if (provider === "apple") {
        options.scopes = "name email";
      } else if (provider === "google") {
        options.scopes = "email profile openid";
      }
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options,
      });
      if (error) throw error;
    } catch (err: any) {
      const raw = (err?.message || "").toLowerCase();
      if (raw.includes("missing oauth secret") || raw.includes("unsupported provider")) {
        setErrorMsg(
          provider === "apple"
            ? t("auth.social.appleNotConfigured")
            : t("auth.social.providerNotConfigured", { provider: label }),
        );
      } else {
        setErrorMsg(err?.message || t("auth.social.startError"));
      }
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <button
        onClick={handleClick}
        disabled={loading}
        className="flex items-center justify-center gap-2.5 py-4 rounded-2xl text-[11px] font-black uppercase transition-all active:scale-95 disabled:opacity-50"
        style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-muted)", color: "var(--text-primary)" }}
      >
        {loading ? <Loader2 size={16} className="animate-spin" /> : icon}
        {loading ? t("auth.social.loading") : label}
      </button>
      {errorMsg && (
        <p
          className="text-[9px] font-bold leading-tight px-1 mt-1 text-center"
          style={{ color: "#dc2626" }}
        >
          {errorMsg}
        </p>
      )}
    </div>
  );
}

/**
 * Språkväljare i Inställningar — paritet med RN-appen (sv/en/ar).
 * Persisterar i `matgo_locale`. Faktisk i18n-byte över UI:t är inte aktiverad
 * i webben ännu, så just nu bara sparar vi valet inför framtida i18n-runtime.
 */
const SUPPORTED_LOCALES = [
  { code: "sv", label: "Svenska", flag: "🇸🇪" },
  { code: "en", label: "English", flag: "🇬🇧" },
  { code: "ar", label: "العربية", flag: "🇸🇦" },
] as const;

function LanguagePickerRow() {
  const { t } = useTranslation();
  const [locale, setLocale] = useState<string>("sv");

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = localStorage.getItem("matgo_locale");
      if (stored && SUPPORTED_LOCALES.some((l) => l.code === stored)) {
        setLocale(stored);
      }
    } catch {
      /* noop */
    }
  }, []);

  const handleChange = (next: string) => {
    setLocale(next);
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("matgo_locale", next);
      } catch {
        /* noop */
      }
    }
  };

  const active = SUPPORTED_LOCALES.find((l) => l.code === locale) ?? SUPPORTED_LOCALES[0];

  return (
    <div className="p-6 flex items-center justify-between group">
      <div className="flex items-center gap-4">
        <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center text-lg">
          {active.flag}
        </div>
        <div>
          <p className="font-bold text-sm text-white">{t("profile.settings.language")}</p>
          <p className="text-[10px] text-zinc-500 font-medium uppercase tracking-widest">{t("profile.settings.languageSub")}</p>
        </div>
      </div>
      <div className="relative">
        <select
          value={locale}
          onChange={(e) => handleChange(e.target.value)}
          className="appearance-none bg-zinc-800 text-white text-[10px] font-black uppercase tracking-widest rounded-xl px-4 py-3 pr-8 border border-white/10 cursor-pointer outline-none focus:border-gold-500/40 transition-all"
          aria-label={t("profile.settings.languageAria")}
        >
          {SUPPORTED_LOCALES.map((l) => (
            <option key={l.code} value={l.code} className="bg-zinc-900">
              {l.flag} {l.label}
            </option>
          ))}
        </select>
        <ChevronRight size={14} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rotate-90 text-zinc-400" />
      </div>
    </div>
  );
}

// ─── Main component ─────────────────────────────────────────────────────────
function ProfileContent() {
  const router = useRouter();
  const { t } = useTranslation();
  const [hasPlatformSession, setHasPlatformSession] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [deals, setDeals] = useState<any[]>([]);
  const [claimedDeals, setClaimedDeals] = useState<any[]>([]);
  const [availableDeals, setAvailableDeals] = useState<any[]>([]);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"overview" | "orders" | "settings" | "deals" | "addresses">("overview");
  const [hasVisited, setHasVisited] = useState(false);
  const [reorderingId, setReorderingId] = useState<string | null>(null);
  const searchParams = useSearchParams();

  useEffect(() => {
    const tab = searchParams.get("tab");
    // "orders" tas bort som tab — om gammal länk pekar dit, fall till overview
    if (tab === "orders") {
      setActiveTab("overview");
    } else if (tab && ["overview", "settings", "deals", "addresses"].includes(tab)) {
      setActiveTab(tab as any);
    }
  }, [searchParams]);

  // Saved addresses state
  const [savedAddresses, setSavedAddresses] = useState<any[]>([]);
  const [newAddrLabel, setNewAddrLabel] = useState("Hem");
  const [newAddrStreet, setNewAddrStreet] = useState("");
  const [newAddrCity, setNewAddrCity] = useState("");
  const [newAddrZip, setNewAddrZip] = useState("");
  const [newAddrNote, setNewAddrNote] = useState("");
  const [addrSaving, setAddrSaving] = useState(false);

  // Auth (Email + Password)
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState("");
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
    if (status === "authenticated" && platformToken && !isLoggingOut) {
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

        if (!email) {
          console.warn("[OAuth] No email from Supabase user — cannot exchange");
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
          // Tvinga nytt token-byte vid SIGNED_IN för att inte använda en
          // stale platform-cookie från en tidigare misslyckad inloggning.
          void exchangeSupabaseForPlatformToken(sbSession, true);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, [fetchData]);

  useEffect(() => {
    const visited = localStorage.getItem("platform_has_visited");
    if (visited) setHasVisited(true);
    else localStorage.setItem("platform_has_visited", "true");
  }, []);

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoggingIn(true);
    setLoginError("");
    try {
      const res = await axios.post(`${API_URL}/api/account/login-user`, { identifier: loginEmail, password: loginPassword });
      await persistPlatformSession(res.data.token);
      setHasPlatformSession(true);
      await fetchData();
    } catch (err: any) {
      setLoginError(err.response?.data?.error || t("auth.loginError"));
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleAddPhone = async (e: React.FormEvent) => {
    e.preventDefault();
    const fullPhone = `${addPhoneCountry}${addPhoneNum.replace(/^0/, "")}`;
    setAddPhoneLoading(true);
    setAddPhoneError("");
    try {
      const res = await axios.post(`/api/platform/profile/link-phone`, { phone: fullPhone });
      setUser((prev: any) => ({ ...(prev || {}), ...res.data.user }));
      await fetchData();
      setShowAddPhone(false);
    } catch (err: any) {
      setAddPhoneError(err.response?.data?.error || t("profile.addPhone.errorGeneric"));
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

  // ─── Loading ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6" style={{ backgroundColor: "var(--bg-primary)" }}>
        <Loader2 className="animate-spin text-gold-500" size={40} />
      </div>
    );
  }

  // ─── Not logged in ────────────────────────────────────────────────────────
  if (!hasPlatformSession || !user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-start px-6 pt-[calc(env(safe-area-inset-top,0px)+1.5rem)] md:pt-20 pb-28" style={{ backgroundColor: "var(--bg-primary)" }}>
        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-sm space-y-3.5">

          {/* Header — kompakt */}
          <div className="text-center space-y-2">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-gold-500 mx-auto bg-gold-500/10 border border-gold-500/20">
              <Lock size={22} />
            </div>
            <h1 className="text-2xl font-black uppercase tracking-tight" style={{ color: "var(--text-primary)" }}>
              {hasVisited ? t("auth.welcomeBack.title.welcome") : t("auth.welcomeBack.title.create")}{" "}
              <span className="text-gold-500">{hasVisited ? t("auth.welcomeBack.title.welcomeAccent") : t("auth.welcomeBack.title.createAccent")}</span>
            </h1>
          </div>

          {/* Dpoints sponsor-banner — driver registrering (göms om inget aktivt kort) */}
          <DpointsSponsorBanner onRegister={() => router.push("/register")} />

          {/* Email + Password login form */}
          <form onSubmit={handleEmailLogin} className="space-y-3">
            <div>
              <label className="text-[9px] font-black uppercase tracking-widest text-zinc-600 ml-1 mb-1 block">{t("auth.email")}</label>
              <input
                required
                type="email"
                autoComplete="email"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                placeholder={t("auth.emailPlaceholder")}
                className="w-full rounded-2xl py-3.5 px-5 font-bold placeholder:text-zinc-300 outline-none focus:ring-2 focus:ring-gold-500/40 transition-all"
                style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-muted)", color: "var(--text-primary)", fontSize: "16px" }}
              />
            </div>
            <div>
              <label className="text-[9px] font-black uppercase tracking-widest text-zinc-600 ml-1 mb-1 block">{t("auth.password")}</label>
              <div className="relative">
                <input
                  required
                  type={showLoginPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder={t("auth.passwordPlaceholder")}
                  className="w-full rounded-2xl py-3.5 px-5 pr-12 font-bold placeholder:text-zinc-300 outline-none focus:ring-2 focus:ring-gold-500/40 transition-all"
                  style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-muted)", color: "var(--text-primary)", fontSize: "16px" }}
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowLoginPassword((v) => !v)}
                  aria-label={showLoginPassword ? "Dölj lösenord" : "Visa lösenord"}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-full hover:bg-zinc-100/40 text-zinc-500 hover:text-zinc-800 transition-colors"
                >
                  {showLoginPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
            {loginError && <p className="text-red-500 text-[11px] text-center font-black uppercase">{loginError}</p>}
            <button
              type="submit"
              disabled={isLoggingIn}
              className="w-full py-4 bg-gold-500 text-zinc-950 rounded-3xl font-black uppercase tracking-widest text-sm shadow-xl shadow-gold-500/20 active:scale-95 transition-all flex items-center justify-center gap-3 disabled:opacity-60"
            >
              {isLoggingIn ? <Loader2 className="animate-spin" size={20} /> : t("auth.submitLogin")}
            </button>
            <div className="text-center pt-1">
              <Link
                href="/forgot-password"
                className="text-[10px] font-black uppercase tracking-widest text-zinc-500 hover:text-gold-500 transition-colors"
              >
                {t("auth.forgotPassword")}
              </Link>
            </div>
          </form>

          {/* Divider */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div
                className="w-full border-t"
                style={{ borderColor: "var(--border-muted)" }}
              />
            </div>
            <div className="relative flex justify-center">
              <span
                className="px-4 text-[10px] font-black uppercase tracking-widest"
                style={{
                  backgroundColor: "var(--bg-primary)",
                  color: "var(--text-secondary)",
                }}
              >
                {t("auth.orWithSocial")}
              </span>
            </div>
          </div>

          {/* Social buttons — Supabase OAuth. Apple + Google only. */}
          <div className="grid grid-cols-2 gap-3">
            <SocialButton
              provider="apple"
              label="Apple"
              icon={
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
                </svg>
              }
            />
            <SocialButton
              provider="google"
              label="Google"
              icon={
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path fill="#EA4335" d="M5.27 9.76A7.08 7.08 0 0 1 12 5c1.69 0 3.21.6 4.4 1.59L19.9 3.1A11.94 11.94 0 0 0 12 0C8.16 0 4.82 2 2.86 5.01l2.41 2.75z"/>
                  <path fill="#34A853" d="M16.04 18.01A7.07 7.07 0 0 1 12 19.1c-2.93 0-5.44-1.78-6.6-4.34l-2.84 2.19A11.96 11.96 0 0 0 12 24c3.24 0 6.17-1.17 8.4-3.09l-4.36-2.9z"/>
                  <path fill="#4A90D9" d="M19.1 12.2c0-.73-.07-1.36-.18-2H12v4.01h4.04a3.7 3.7 0 0 1-1.53 2.36l4.36 2.9c2.61-2.41 3.23-5.96.23-7.27z"/>
                  <path fill="#FBBC05" d="M5.4 14.76A7.16 7.16 0 0 1 5 12c0-.95.19-1.86.41-2.24L2.86 7.01A11.9 11.9 0 0 0 0 12c0 1.7.37 3.31.97 4.77l4.43-2z"/>
                </svg>
              }
            />
          </div>

          {/* Register link */}
          <p className="text-center text-[11px] font-bold uppercase tracking-widest text-zinc-600">
            {t("auth.noAccount")}{" "}
            <Link href="/register" className="text-gold-500 hover:text-gold-400 transition-colors">
              {t("auth.createFree")}
            </Link>
          </p>

          {/* Beställningar & support — flyttad NER hit (i tomma utrymmet) så
              login-formuläret syns direkt. Order-historik ligger lokalt; man
              ser sina ordrar utan att logga in. Support sker via lagd order. */}
          <Link
            href="/orders"
            className="mt-2 w-full flex items-center justify-between gap-3 px-4 py-3 rounded-2xl transition-all active:scale-[0.99]"
            style={{ backgroundColor: "rgba(231,178,75,0.08)", border: "1px solid rgba(231,178,75,0.28)" }}
          >
            <span className="flex items-center gap-3">
              <span className="w-9 h-9 rounded-xl bg-gold-500/15 text-gold-600 flex items-center justify-center shrink-0">
                <History size={18} />
              </span>
              <span className="text-sm font-black uppercase tracking-tight" style={{ color: "var(--text-primary)" }}>
                {t("profile.ordersSupport")}
              </span>
            </span>
            <ChevronRight size={18} className="text-gold-500" />
          </Link>

          {/* Viktiga sidor — Om oss + policys, alltid nåbara (även utan konto).
              Hämtar juridiskt namn/orgnr/e-post från admin via /api/settings. */}
          <div className="grid grid-cols-2 gap-2 pt-1">
            {[
              { href: "/about", label: t("nav.about") },
              { href: "/contact", label: t("nav.contact") },
              { href: "/privacy", label: t("profile.settings.privacy") },
              { href: "/terms", label: t("profile.settings.termsLong") },
            ].map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="flex items-center justify-between gap-2 px-4 py-3 rounded-2xl transition-all active:scale-[0.99]"
                style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-muted)" }}
              >
                <span className="text-[11px] font-black uppercase tracking-wider truncate" style={{ color: "var(--text-secondary)" }}>
                  {l.label}
                </span>
                <ChevronRight size={14} className="text-zinc-500 shrink-0" />
              </Link>
            ))}
          </div>
        </motion.div>
      </div>
    );
  }

  // ─── Add phone prompt (for OAuth users without phone) ─────────────────────
  if (showAddPhone) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6" style={{ backgroundColor: "var(--bg-primary)" }}>
        <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-sm space-y-8">
          <div className="text-center space-y-3">
            <div className="w-16 h-16 bg-gold-500/10 rounded-2xl flex items-center justify-center text-gold-500 mx-auto"><Phone size={28} /></div>
            <h2 className="text-2xl font-black uppercase italic tracking-tight">{t("profile.addPhone.title")}</h2>
            <p className="text-zinc-500 text-sm leading-relaxed">
              {t("profile.addPhone.sub")}
            </p>
          </div>
          <form onSubmit={handleAddPhone} className="space-y-4">
            <div className="flex gap-2">
              <CountryPicker value={addPhoneCountry} onChange={setAddPhoneCountry} />
              <input
                required
                type="tel"
                autoComplete="tel"
                value={addPhoneNum}
                onChange={e => setAddPhoneNum(e.target.value)}
                placeholder={t("profile.addPhone.placeholder")}
                className="flex-1 rounded-2xl py-4 px-5 font-bold placeholder:text-zinc-400 outline-none focus:ring-2 focus:ring-gold-500/40"
                style={{ backgroundColor: "var(--bg-deep)", border: "1px solid var(--border-muted)", color: "var(--text-primary)" }}
              />
            </div>
            {addPhoneError && <p className="text-red-500 text-[11px] text-center font-black uppercase">{addPhoneError}</p>}
            <button
              type="submit"
              disabled={addPhoneLoading}
              className="w-full py-5 bg-gold-500 text-zinc-950 rounded-3xl font-black uppercase tracking-widest text-sm shadow-xl shadow-gold-500/20 active:scale-95 transition-all flex items-center justify-center gap-3"
            >
              {addPhoneLoading ? <Loader2 className="animate-spin" size={20} /> : t("profile.addPhone.save")}
            </button>
          </form>
        </motion.div>
      </div>
    );
  }

  // ─── Logged in ────────────────────────────────────────────────────────────
  return (
    <>
    <div className="min-h-screen pt-[calc(env(safe-area-inset-top,0px)+1.5rem)] md:pt-20 pb-32 px-6" style={{ backgroundColor: "var(--bg-primary)" }}>
      <div className="max-w-xl mx-auto space-y-8">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-gold-gradient rounded-[1.5rem] flex items-center justify-center text-zinc-950 font-black text-xl shadow-lg">
              {user.image ? (
                <img src={user.image} alt="" className="w-full h-full rounded-[1.5rem] object-cover" />
              ) : (
                user.name?.charAt(0)?.toUpperCase() || "U"
              )}
            </div>
            <div>
              <h1 className="text-xl font-black uppercase italic tracking-tight" style={{ color: "var(--text-primary)" }}>{user.name}</h1>
              {user.isVerified ? (
                <div className="flex items-center gap-1.5 mt-1 text-emerald-600">
                  <ShieldCheck size={14} />
                  <span className="text-[10px] font-black uppercase tracking-widest">{t("profile.verified")}</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 mt-1 text-rose-500">
                  <Lock size={14} />
                  <span className="text-[10px] font-black uppercase tracking-widest">{t("profile.notVerified")}</span>
                </div>
              )}
            </div>
          </div>
          <button onClick={handleLogout} className="p-3 bg-zinc-100 hover:bg-rose-50 text-zinc-400 hover:text-rose-500 rounded-2xl transition-all">
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
              className="mt-4 p-4 rounded-2xl border"
              style={{
                backgroundColor: "rgba(234,181,69,0.08)",
                borderColor: "rgba(234,181,69,0.30)",
              }}
            >
              <div className="flex items-start gap-3">
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                  style={{ backgroundColor: "rgba(234,181,69,0.20)" }}
                >
                  <span className="text-base">👤</span>
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-black uppercase tracking-tight text-gold-700">
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
                        className="text-gold-600 underline font-bold"
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
            className="w-full bg-amber-500/5 border border-amber-500/20 p-5 rounded-[2rem] flex items-center justify-between text-left hover:bg-amber-500/10 transition-all"
          >
            <div>
              <p className="text-[10px] font-black uppercase text-amber-600 tracking-widest">{t("profile.recommended")}</p>
              <p className="font-bold text-sm mt-0.5" style={{ color: "var(--text-primary)" }}>{t("profile.addPhone")}</p>
            </div>
            <ChevronRight size={18} className="text-amber-500" />
          </button>
        )}

        {/* Verify phone banner - ONLY if they have a phone but not verified (legacy or fail) */}
        {user.phone && !user.isVerified && (
          <div className="bg-red-500/10 border border-red-500/20 p-6 rounded-[2.5rem] flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-red-500/20 rounded-xl flex items-center justify-center text-red-500">
                <Bell size={20} />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase text-red-400 tracking-widest">{t("profile.actionRequired")}</p>
                <div className="flex items-center gap-2">
                  <p className="text-white font-bold text-sm">{user.phone}</p>
                </div>
              </div>
            </div>
            <button
              onClick={() => {
                setAddPhoneNum(user.phone.replace("+46", ""));
                setAddPhoneCountry(user.phone.startsWith("+") ? user.phone.slice(0, 3) : "+46");
                setShowAddPhone(true);
              }}
              className="px-6 py-3 bg-red-500 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest active:scale-95 transition-all shadow-lg shadow-red-500/20"
            >
              {t("profile.fixNow")}
            </button>
          </div>
        )}

        <div className="grid grid-cols-5 p-1.5 rounded-[2rem] shadow-sm" style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-muted)" }}>
          {[
            { id: "overview", icon: User, label: t("profile.tabs.home") },
            { id: "deals", icon: Sparkles, label: t("profile.tabs.deals") },
            // "Ordrar"-fliken är borttagen från profilen — finns nu som egen
            // tab i bottom-nav (/orders) och i top-navbaren, för att undvika
            // dubbel-navigation och för att fungera utan login.
            { id: "addresses", icon: MapPin, label: t("profile.tabs.addresses") },
            { id: "settings", icon: Settings, label: t("profile.tabs.settings") },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => { setActiveTab(tab.id as any); setIsEditing(false); }}
              className={`flex flex-col items-center gap-1.5 py-4 rounded-3xl transition-all ${activeTab === tab.id ? "bg-gold-500/10 text-gold-600" : "text-zinc-400 hover:text-zinc-600"}`}
            >
              <tab.icon size={18} />
              <span className="text-[8px] font-black uppercase tracking-widest">{tab.label}</span>
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          {/* Deals Tab */}
          {activeTab === "deals" && (
            <motion.div key="deals" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">
               {/* Tillgängliga (oclaimade) popup-deals — visas som banners
                   så kunden kan claima senare om man missade popup-flödet
                   vid app-öppning. */}
               {availableDeals.length > 0 ? (
                 <div className="space-y-3">
                   <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500 px-2">{t("profile.deals.availableTitle")}</p>
                   {availableDeals.map((deal: any) => {
                     const isClaiming = claimingId === deal.id;
                     return (
                       <div
                         key={`avail-${deal.id}`}
                         className="p-6 rounded-[2.5rem] relative overflow-hidden"
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
                             <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gold-500/15 text-2xl shrink-0">🎁</div>
                           )}
                           <div className="flex-1 min-w-0">
                             <div className="text-[10px] font-black uppercase tracking-[0.2em] text-gold-600 mb-1">
                               {t("profile.deals.newOffer")}
                             </div>
                             <h3 className="text-lg font-black italic tracking-tighter uppercase leading-tight" style={{ color: "var(--text-primary)" }}>
                               {deal.popupHeadline || deal.title}
                             </h3>
                             {deal.popupBody || deal.description ? (
                               <p className="mt-1.5 text-xs font-bold leading-5 text-zinc-500">{deal.popupBody || deal.description}</p>
                             ) : null}
                           </div>
                         </div>
                         <div className="mt-4 flex items-center justify-between gap-3">
                           <div className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
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
                             className="px-5 py-3 rounded-2xl bg-gold-500 text-zinc-950 font-black uppercase tracking-widest text-[10px] shadow-lg shadow-gold-500/20 active:scale-95 transition-all disabled:opacity-60"
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
                   <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500 px-2">{t("profile.deals.savedTitle")}</p>
                   {claimedDeals.map((deal: any) => {
                     const isClaimed = deal._kind === 'CLAIMED';
                     // Tag som visar typ av deal: Personlig (CustomerDeal),
                     // Restaurang (deal.restaurantId satt) eller Global.
                     const dealKind: { label: string; tone: string } = deal.restaurantId
                       ? { label: t("profile.deals.kind.restaurant"), tone: "bg-sky-500/10 text-sky-400 border-sky-500/30" }
                       : isClaimed
                         ? { label: t("profile.deals.kind.personal"), tone: "bg-purple-500/10 text-purple-400 border-purple-500/30" }
                         : { label: t("profile.deals.kind.global"), tone: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30" };
                     return (
                       <Link
                         href={`/deals/${deal.id}`}
                         key={`claimed-${deal.id}`}
                         className="block p-6 rounded-[2.5rem] bg-gold-500/5 border border-gold-500/15 relative overflow-hidden hover:bg-gold-500/8 transition-colors"
                       >
                         <div className="flex items-start justify-between mb-4 gap-3">
                           <div className="flex-1">
                             <div className="flex flex-wrap items-center gap-2 mb-1">
                               <div className="text-[10px] font-black uppercase tracking-[0.2em] text-gold-600">
                                 {isClaimed ? t("profile.deals.saved") : t("profile.deals.availableAll")}
                               </div>
                               <span className={`px-2 py-0.5 rounded-full border text-[9px] font-black uppercase tracking-wider ${dealKind.tone}`}>
                                 {dealKind.label}
                               </span>
                             </div>
                             <h3 className="text-xl font-black italic tracking-tighter uppercase leading-tight" style={{ color: "var(--text-primary)" }}>
                               {deal.popupHeadline || deal.title}
                             </h3>
                             {deal.popupBody || deal.description ? (
                               <p className="mt-2 text-xs font-bold leading-5 text-zinc-500">{deal.popupBody || deal.description}</p>
                             ) : null}
                           </div>
                           <div className="w-10 h-10 bg-gold-500 text-zinc-950 rounded-xl flex items-center justify-center shrink-0">
                             <Ticket size={18} />
                           </div>
                         </div>
                         {deal.popupCode ? (
                           <div className="p-3 rounded-2xl bg-zinc-50 border border-zinc-100 flex items-center justify-between mb-3">
                             <div className="text-[10px] font-black tracking-[0.3em] uppercase text-zinc-400">
                               {t("profile.deals.codeLabel")}: <span className="text-zinc-950 select-all">{deal.popupCode}</span>
                             </div>
                             <button
                               onClick={() => { navigator.clipboard.writeText(deal.popupCode); }}
                               className="text-[10px] font-black uppercase tracking-widest text-gold-600 hover:text-gold-700 transition-colors"
                             >
                               {t("profile.deals.copy")}
                             </button>
                           </div>
                         ) : null}
                         <div className="flex items-center justify-between text-[9px] font-black uppercase tracking-widest text-zinc-400">
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
                 <div className="py-20 text-center rounded-[2.5rem] border border-dashed" style={{ backgroundColor: "var(--bg-deep)", borderColor: "var(--border-muted)" }}>
                    <div className="w-16 h-16 bg-zinc-100 rounded-full flex items-center justify-center mx-auto mb-4 text-zinc-300"><Tag size={32} /></div>
                    <p className="font-black uppercase tracking-widest text-zinc-400">{t("profile.deals.empty.title")}</p>
                    <p className="text-[10px] uppercase font-bold text-zinc-300 mt-2">{t("profile.deals.empty.sub")}</p>
                 </div>
               ) : deals.length > 0 ? (
                 <div className="space-y-3">
                   <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500 px-2">{t("profile.deals.personalCodes")}</p>
                   {deals.map((deal: any) => (
                   <div key={deal.id} className="p-8 rounded-[2.5rem] bg-gold-500/5 border border-gold-500/10 shadow-sm relative overflow-hidden group">
                      <div className="absolute top-0 right-0 w-24 h-24 bg-gold-500/5 blur-2xl group-hover:bg-gold-500/10 transition-all" />
                      <div className="flex items-start justify-between mb-6">
                         <div className="flex-1 pr-4">
                            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-gold-600 mb-1">{deal.campaign.title}</div>
                            <h3 className="text-2xl font-black italic tracking-tighter uppercase leading-tight" style={{ color: "var(--text-primary)" }}>
                                {deal.campaign.discountType === "PERCENTAGE" ? t("profile.deals.discountPctTitle", { value: deal.campaign.discountValue }) : t("profile.deals.discountKrTitle", { value: deal.campaign.discountValue })}
                            </h3>
                         </div>
                         <div className="w-12 h-12 bg-gold-500 text-zinc-950 rounded-2xl flex items-center justify-center shadow-xl shrink-0"><Ticket size={24} /></div>
                      </div>

                      <div className="p-4 rounded-2xl bg-zinc-50 border border-zinc-100 flex items-center justify-between mb-6">
                         <div className="text-[10px] font-black tracking-[0.3em] uppercase text-zinc-400">{t("profile.deals.codeLabel")}: <span className="text-zinc-950 select-all">{deal.code}</span></div>
                         <button
                            onClick={() => { navigator.clipboard.writeText(deal.code); }}
                            className="text-[10px] font-black uppercase tracking-widest text-gold-600 hover:text-gold-700 transition-colors"
                          >
                            {t("profile.deals.copy")}
                          </button>
                      </div>

                      <div className="flex items-center justify-between text-[9px] font-black uppercase tracking-widest text-zinc-400">
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
              <DpointsPanel />
              <div className="rounded-[2.5rem] p-8 space-y-5 shadow-sm" style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-muted)" }}>
                <div className="flex items-center gap-4">
                  <Phone size={16} className="text-zinc-400 shrink-0" />
                  <div className="flex-1">
                    <p className="text-[9px] font-black uppercase tracking-widest text-zinc-400">{t("profile.overview.phone")}</p>
                    <p className="font-bold text-sm" style={{ color: "var(--text-primary)" }}>{user.phone || t("profile.overview.notSet")}</p>
                  </div>
                  {user.isVerified ? (
                    <span className="text-[8px] bg-emerald-50 text-emerald-600 border border-emerald-100 px-3 py-1.5 rounded-full uppercase font-black flex items-center gap-1">
                      <Lock size={8} /> {t("profile.overview.locked")}
                    </span>
                  ) : (
                    <button
                      onClick={() => {
                        setAddPhoneNum(user.phone?.replace("+46", "") || "");
                        setAddPhoneCountry(user.phone?.startsWith("+") ? user.phone.slice(0, 3) : "+46");
                        setShowAddPhone(true);
                      }}
                      className="text-[8px] bg-amber-50 text-amber-600 border border-amber-100 px-3 py-1.5 rounded-full uppercase font-black hover:bg-amber-100 transition-all flex items-center gap-1"
                    >
                      <Edit2 size={8} /> {t("profile.overview.edit")}
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-4">
                  <Mail size={16} className="text-zinc-400 shrink-0" />
                  <div className="flex-1">
                    <p className="text-[9px] font-black uppercase tracking-widest text-zinc-400">{t("profile.overview.email")}</p>
                    <p className="font-bold text-sm" style={{ color: "var(--text-primary)" }}>{user.email || t("profile.overview.notSet")}</p>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-[2rem] p-6 shadow-sm" style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-muted)" }}>
                  <p className="text-[9px] font-black uppercase tracking-widest text-zinc-400 mb-1">{t("profile.overview.ordersCount")}</p>
                  <p className="text-3xl font-black" style={{ color: "var(--text-primary)" }}>{orders.length}</p>
                </div>
                <div className="rounded-[2rem] p-6 shadow-sm" style={{ backgroundColor: user.isVerified ? "var(--bg-secondary)" : "var(--bg-secondary)", border: user.isVerified ? "1px solid rgba(5,150,105,0.1)" : "1px solid var(--border-muted)" }}>
                  <p className="text-[9px] font-black uppercase tracking-widest text-zinc-400 mb-1">{t("profile.overview.status")}</p>
                  <p className={`text-sm font-black uppercase ${user.isVerified ? "text-emerald-600" : "text-rose-500"}`}>
                    {user.isVerified ? t("profile.overview.statusVerified") : t("profile.overview.statusUnverified")}
                  </p>
                </div>
              </div>

              {/* Mina beställningar — flyttad hit från bottom-nav. Länkar till
                  /orders-sidan (fungerar utan login via localStorage-historik). */}
              <Link
                href="/orders"
                className="rounded-[2rem] p-6 flex items-center justify-between group shadow-sm transition-all hover:border-gold-500/40"
                style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-muted)" }}
              >
                <div className="flex items-center gap-4">
                  <div className="w-11 h-11 rounded-2xl bg-gold-500/10 text-gold-600 flex items-center justify-center">
                    <History size={20} />
                  </div>
                  <div>
                    <p className="font-black uppercase italic text-sm" style={{ color: "var(--text-primary)" }}>{t("profile.ordersSupport")}</p>
                    <p className="text-[10px] font-bold uppercase tracking-widest mt-0.5" style={{ color: "var(--text-secondary)" }}>{t("orders.subtitle")}</p>
                  </div>
                </div>
                <ChevronRight size={18} className="text-zinc-400 group-hover:text-gold-500 transition-colors" />
              </Link>

              {/* Referral-kort borttaget — referral-systemet avstängt för
                  launch. Komponenten finns kvar i repo men renderas inte. */}
            </motion.div>
          )}

          {/* Settings */}
          {activeTab === "settings" && !isEditing && (
            <motion.div key="set" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-6">
              <div className="space-y-2">
                <div className="px-4 text-[9px] font-black uppercase tracking-[0.4em] text-zinc-600 mb-2">{t("profile.settings.section.profile")}</div>
                <div className="bg-white/5 border border-white/5 rounded-[2.5rem]">
                  <button
                    onClick={() => setIsEditing(true)}
                    className="w-full flex items-center justify-between p-6 hover:bg-white/5 transition-all text-left rounded-[2.5rem]"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-gold-500/10 text-gold-500 rounded-xl flex items-center justify-center"><Settings size={18} /></div>
                      <div>
                        <p className="text-sm font-bold uppercase italic text-white">{t("profile.settings.editProfile")}</p>
                        <p className="text-[10px] text-zinc-600">{t("profile.settings.editProfileSub")}</p>
                      </div>
                    </div>
                    <ChevronRight size={18} className="text-zinc-700" />
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <div className="px-4 text-[9px] font-black uppercase tracking-[0.4em] text-zinc-600 mb-2">{t("profile.settings.section.prefs")}</div>
                <div className="bg-white/5 border border-white/5 rounded-[2.5rem] divide-y divide-white/5">
                  <div className="p-6 flex items-center justify-between group">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center">
                        <Bell size={18} />
                      </div>
                      <div>
                        <p className="font-bold text-sm text-white">{t("profile.settings.push")}</p>
                        <p className="text-[10px] text-zinc-500 font-medium uppercase tracking-widest">{t("profile.settings.pushSub")}</p>
                      </div>
                    </div>
                    <div className="w-12 h-6 bg-zinc-800 rounded-full relative cursor-pointer opacity-50">
                       <div className="absolute left-1 top-1 w-4 h-4 bg-zinc-600 rounded-full" />
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

              <div className="space-y-2">
                <div className="px-4 text-[9px] font-black uppercase tracking-[0.4em] text-zinc-600 mb-2">{t("profile.settings.section.legal")}</div>
                <div className="bg-white/5 border border-white/5 rounded-[2.5rem] divide-y divide-white/5">
                  <Link href="/privacy" className="p-6 flex items-center justify-between group hover:bg-white/5 transition-all first:rounded-t-[2.5rem]">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
                        <ShieldCheck size={18} />
                      </div>
                      <p className="font-bold text-sm text-white">{t("profile.settings.privacy")}</p>
                    </div>
                    <ChevronRight size={18} className="text-zinc-600 group-hover:text-white transition-all" />
                  </Link>
                  <Link href="/terms" className="p-6 flex items-center justify-between group hover:bg-white/5 transition-all">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center">
                        <Scale size={18} />
                      </div>
                      <p className="font-bold text-sm text-white">{t("profile.settings.terms")}</p>
                    </div>
                    <ChevronRight size={18} className="text-zinc-600 group-hover:text-white transition-all" />
                  </Link>
                </div>
              </div>

              <div className="space-y-2">
                <div className="px-4 text-[9px] font-black uppercase tracking-[0.4em] text-zinc-400 mb-2">{t("profile.settings.section.account")}</div>
                <div className="rounded-[2.5rem] shadow-sm" style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-muted)" }}>
                  <button
                    onClick={() => setDeleteAccountModalOpen(true)}
                    className="w-full text-left p-6 flex items-center justify-between group hover:bg-rose-50 transition-all rounded-[2.5rem]"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-500 flex items-center justify-center">
                        <Trash2 size={18} />
                      </div>
                      <div>
                        <p className="font-bold text-sm text-rose-500">{t("profile.settings.deleteAccount")}</p>
                        <p className="text-[10px] text-zinc-400 font-medium uppercase tracking-widest">{t("profile.settings.deleteAccountSub")}</p>
                      </div>
                    </div>
                  </button>
                </div>
              </div>

              {/* Juridiskt */}
              <div className="space-y-2">
                <div className="px-4 text-[9px] font-black uppercase tracking-[0.4em] mb-2" style={{ color: "var(--text-secondary)" }}>{t("profile.settings.section.legal2")}</div>
                <div className="rounded-[2.5rem] shadow-sm divide-y" style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-muted)", borderColor: "var(--border-muted)" }}>
                  <Link
                    href="/terms"
                    className="w-full text-left p-6 flex items-center justify-between hover:bg-gold-500/5 transition-all rounded-t-[2.5rem]"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-gold-500/10 text-gold-500 flex items-center justify-center">
                        <ShieldCheck size={18} />
                      </div>
                      <div>
                        <p className="font-bold text-sm" style={{ color: "var(--text-primary)" }}>{t("profile.settings.termsLong")}</p>
                        <p className="text-[10px] font-medium uppercase tracking-widest" style={{ color: "var(--text-secondary)" }}>{t("profile.settings.termsSub")}</p>
                      </div>
                    </div>
                    <ChevronRight size={18} style={{ color: "var(--text-secondary)" }} />
                  </Link>
                  <Link
                    href="/privacy"
                    className="w-full text-left p-6 flex items-center justify-between hover:bg-gold-500/5 transition-all rounded-b-[2.5rem]"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-gold-500/10 text-gold-500 flex items-center justify-center">
                        <Lock size={18} />
                      </div>
                      <div>
                        <p className="font-bold text-sm" style={{ color: "var(--text-primary)" }}>{t("profile.settings.privacy")}</p>
                        <p className="text-[10px] font-medium uppercase tracking-widest" style={{ color: "var(--text-secondary)" }}>{t("profile.settings.privacySub")}</p>
                      </div>
                    </div>
                    <ChevronRight size={18} style={{ color: "var(--text-secondary)" }} />
                  </Link>
                </div>
              </div>
            </motion.div>
          )}

          {/* Orders */}
          {activeTab === "orders" && (
            <motion.div key="ord" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">
              {orders.length === 0 ? (
                <div className="py-20 text-center opacity-30">
                  <History size={48} className="mx-auto mb-4" />
                  <p className="font-black uppercase tracking-widest text-sm">{t("profile.orders.empty")}</p>
                </div>
              ) : orders.map((order) => (
                <div key={order.id} className="bg-white/5 border border-white/5 rounded-[2.5rem] p-6 hover:bg-white/10 transition-all group">
                  <Link href={`/order/${order.id}`} className="flex justify-between items-center">
                    <div>
                      <p className="font-black uppercase italic text-sm">{order.restaurant?.name || t("profile.orders.fallbackName")}</p>
                      <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mt-1">
                        {new Date(order.createdAt).toLocaleDateString("sv-SE")}
                        {order.rating && (
                          <span className="ml-3 inline-flex items-center gap-1 text-gold-500">
                            <Star size={10} className="fill-gold-500" /> {order.rating}/5
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <p className="text-xl font-black text-gold-500">{(order.total || 0).toFixed(0)} kr</p>
                      <ChevronRight size={16} className="text-zinc-600 group-hover:text-gold-500 transition-colors" />
                    </div>
                  </Link>
                  <div className="mt-4 flex gap-3">
                    <button
                      onClick={async () => {
                        setReorderingId(order.id);
                        try {
                          const res = await axios.get(`/api/platform/profile/orders/${order.id}/reorder`);
                           const data = res.data;
                           const cartStore = useCartStore.getState();
                           cartStore.clearCart();
                          for (const item of data.items) {
                             cartStore.addItem(item);
                          }
                          if (data.unavailableItems?.length) {
                             alert(t("profile.orders.unavailableItems", { count: data.unavailableItems.length, items: data.unavailableItems.join(', ') }));
                          }
                          router.push('/cart');
                        } catch (err: any) {
                          alert(err.response?.data?.error || t("profile.orders.reorderError"));
                        } finally {
                          setReorderingId(null);
                        }
                      }}
                      disabled={reorderingId === order.id}
                      className="flex items-center gap-2 px-5 py-3 bg-gold-500/10 border border-gold-500/20 rounded-xl text-[9px] font-black uppercase tracking-widest text-gold-600 hover:bg-gold-500/20 active:scale-95 transition-all disabled:opacity-50"
                    >
                      {reorderingId === order.id ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />}
                      {t("profile.orders.reorder")}
                    </button>
                  </div>
                </div>
              ))}
            </motion.div>
          )}

          {/* Addresses Tab */}
          {activeTab === "addresses" && (
            <motion.div key="addr" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-6">
              {/* Existing Addresses */}
              {savedAddresses.length === 0 ? (
                <div className="py-16 text-center bg-white/2 rounded-[2.5rem] border border-dashed border-white/5">
                  <MapPin size={36} className="mx-auto mb-4 text-zinc-800" />
                  <p className="font-black uppercase tracking-widest text-zinc-600 text-sm">{t("profile.addresses.empty.title")}</p>
                  <p className="text-[10px] uppercase font-bold text-zinc-800 mt-2">{t("profile.addresses.empty.sub")}</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {savedAddresses.map(addr => (
                    <div key={addr.id} className="rounded-[2rem] p-6 flex items-center justify-between group shadow-sm" style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-muted)" }}>
                      <div className="flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm ${addr.isDefault ? 'bg-gold-500/10 text-gold-600 border border-gold-500/20' : 'bg-zinc-50 text-zinc-400'}`}>
                          {addr.label === 'Hem' ? <Home size={18} /> : addr.label === 'Jobb' ? <Briefcase size={18} /> : <MapPin size={18} />}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-black uppercase italic text-sm" style={{ color: "var(--text-primary)" }}>{addr.label === 'Hem' ? t("profile.addresses.label.home") : addr.label === 'Jobb' ? t("profile.addresses.label.work") : addr.label}</p>
                            {addr.isDefault && <span className="text-[7px] font-black uppercase bg-emerald-50 text-emerald-600 border border-emerald-100 px-2 py-0.5 rounded-md">{t("profile.addresses.default")}</span>}
                          </div>
                          <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest mt-0.5">{addr.street}, {addr.zip} {addr.city}</p>
                          {addr.note && <p className="text-[9px] text-zinc-400 mt-1 opacity-70">{addr.note}</p>}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        {!addr.isDefault && (
                          <button
                            onClick={async () => {
                              try {
                                await axios.patch(`/api/platform/profile/addresses/${addr.id}`, { isDefault: true });
                                fetchData();
                              } catch (err) {
                                console.warn("Failed to set default address:", err);
                              }
                            }}
                            className="p-2 bg-white/5 rounded-lg text-zinc-600 hover:text-gold-500 transition-colors"
                            title={t("profile.addresses.makeDefault")}
                          >
                            <Check size={14} />
                          </button>
                        )}
                        <button
                          onClick={() => {
                            setAddressToDelete(addr);
                            setDeleteAddressModalOpen(true);
                          }}
                          className="p-2 bg-white/5 rounded-lg text-zinc-600 hover:text-rose-500 transition-colors"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Add New Address */}
              <div className="rounded-[2.5rem] p-8 space-y-5 shadow-sm" style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-muted)" }}>
                <h3 className="text-sm font-black uppercase italic flex items-center gap-3" style={{ color: "var(--text-primary)" }}>
                  <Plus size={16} className="text-gold-600" /> {t("profile.addresses.add")}
                </h3>
                <div className="flex gap-2">
                  {['Hem', 'Jobb', 'Annat'].map(l => (
                    <button key={l} type="button" onClick={() => setNewAddrLabel(l)} className={`flex items-center gap-2 px-4 py-3 rounded-xl text-[9px] font-black uppercase tracking-widest border transition-all ${
                      newAddrLabel === l ? 'bg-gold-500/10 border-gold-500/30 text-gold-600' : 'bg-zinc-50 border-zinc-100 text-zinc-400'
                    }`}>
                      {l === 'Hem' ? <Home size={12} /> : l === 'Jobb' ? <Briefcase size={12} /> : <MapPin size={12} />}
                      {l === 'Hem' ? t("profile.addresses.label.home") : l === 'Jobb' ? t("profile.addresses.label.work") : t("profile.addresses.label.other")}
                    </button>
                  ))}
                </div>
                <input value={newAddrStreet} onChange={e => setNewAddrStreet(e.target.value)} placeholder={t("profile.addresses.streetPlaceholder")} className="w-full rounded-2xl py-4 px-5 font-bold placeholder:text-zinc-200 outline-none focus:ring-2 focus:ring-gold-500/40" style={{ backgroundColor: "var(--bg-primary)", border: "1px solid var(--border-muted)", color: "var(--text-primary)" }} />
                <div className="grid grid-cols-2 gap-3">
                  <input value={newAddrCity} onChange={e => setNewAddrCity(e.target.value)} placeholder={t("profile.addresses.cityPlaceholder")} className="rounded-2xl py-4 px-5 font-bold placeholder:text-zinc-200 outline-none focus:ring-2 focus:ring-gold-500/40" style={{ backgroundColor: "var(--bg-primary)", border: "1px solid var(--border-muted)", color: "var(--text-primary)" }} />
                  <input value={newAddrZip} onChange={e => setNewAddrZip(e.target.value)} placeholder={t("profile.addresses.zipPlaceholder")} className="rounded-2xl py-4 px-5 font-bold placeholder:text-zinc-200 outline-none focus:ring-2 focus:ring-gold-500/40" style={{ backgroundColor: "var(--bg-primary)", border: "1px solid var(--border-muted)", color: "var(--text-primary)" }} />
                </div>
                <input value={newAddrNote} onChange={e => setNewAddrNote(e.target.value)} placeholder={t("profile.addresses.notePlaceholder")} className="w-full rounded-2xl py-4 px-5 font-bold placeholder:text-zinc-200 outline-none focus:ring-2 focus:ring-gold-500/40" style={{ backgroundColor: "var(--bg-primary)", border: "1px solid var(--border-muted)", color: "var(--text-primary)" }} />
                <button
                  onClick={async () => {
                    if (!newAddrStreet || !newAddrCity || !newAddrZip) return;
                    setAddrSaving(true);
                    try {
                      await axios.post(`/api/platform/profile/addresses`, {
                        label: newAddrLabel, street: newAddrStreet, city: newAddrCity, zip: newAddrZip, note: newAddrNote || undefined, isDefault: savedAddresses.length === 0,
                      });
                      setNewAddrStreet(''); setNewAddrCity(''); setNewAddrZip(''); setNewAddrNote('');
                      fetchData();
                    } catch (err: any) {
                      alert(err.response?.data?.error || t("profile.addresses.saveError"));
                    } finally { setAddrSaving(false); }
                  }}
                  disabled={addrSaving || !newAddrStreet || !newAddrCity || !newAddrZip}
                  className="w-full py-5 bg-gold-500 text-zinc-950 rounded-3xl font-black uppercase tracking-widest text-[11px] shadow-xl shadow-gold-500/20 active:scale-95 transition-all disabled:opacity-40 flex items-center justify-center gap-3"
                >
                  {addrSaving ? <Loader2 size={16} className="animate-spin" /> : <><Plus size={16} /> {t("profile.addresses.save")}</>}
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
              className="p-8 rounded-[2.5rem] space-y-6 shadow-sm"
              style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-muted)" }}
            >
              <div className="flex items-center gap-3 mb-2">
                <button type="button" onClick={() => setIsEditing(false)} className="p-2 text-zinc-400 hover:text-zinc-600 rounded-xl">
                  <ArrowLeft size={18} />
                </button>
                <h3 className="text-lg font-black uppercase italic" style={{ color: "var(--text-primary)" }}>{t("profile.editForm.title")}</h3>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="text-[9px] font-black uppercase tracking-widest text-zinc-400 ml-1 mb-1 block">{t("profile.editForm.name")}</label>
                  <input value={editName} onChange={e => setEditName(e.target.value)} className="w-full rounded-2xl py-4 px-6 font-bold outline-none focus:ring-2 focus:ring-gold-500/40" style={{ backgroundColor: "var(--bg-primary)", border: "1px solid var(--border-muted)", color: "var(--text-primary)" }} />
                </div>
                <div>
                  <label className="text-[9px] font-black uppercase tracking-widest text-zinc-400 ml-1 mb-1 block">{t("profile.editForm.email")}</label>
                  <input type="email" value={editEmail} onChange={e => setEditEmail(e.target.value)} placeholder={t("auth.emailPlaceholder")} className="w-full rounded-2xl py-4 px-6 font-bold outline-none focus:ring-2 focus:ring-gold-500/40" style={{ backgroundColor: "var(--bg-primary)", border: "1px solid var(--border-muted)", color: "var(--text-primary)" }} />
                </div>
                <div>
                  <label className="text-[9px] font-black uppercase tracking-widest text-zinc-400 ml-1 mb-1 block">{t("profile.editForm.phoneLocked")}</label>
                  <input disabled value={user.phone || t("profile.overview.notSet")} className="w-full rounded-2xl py-4 px-6 font-bold cursor-not-allowed opacity-50" style={{ backgroundColor: "var(--bg-deep)", border: "1px solid var(--border-muted)", color: "var(--text-secondary)" }} />
                </div>
              </div>
              <button
                type="submit"
                disabled={isSaving}
                className={`w-full py-5 rounded-3xl font-black uppercase tracking-widest text-sm flex items-center justify-center gap-3 transition-all ${saveSuccess ? "bg-emerald-500 text-white" : "bg-gold-500 text-zinc-950 shadow-xl shadow-gold-500/20 active:scale-95"}`}
              >
                {isSaving ? <Loader2 className="animate-spin" size={20} /> : saveSuccess ? t("profile.editForm.saved") : <><Save size={18} /> {t("common.save")}</>}
              </button>
            </motion.form>
          )}
        </AnimatePresence>

        {/* Om oss + Kontakt — mobil-knappar längst ner */}
        <div className="mt-10">
          <MobileFooterLinks />
        </div>
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
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center px-6" style={{ backgroundColor: "var(--bg-primary)" }}>
        <Loader2 className="animate-spin text-gold-500" size={40} />
      </div>
    }>
      <ProfileContent />
    </Suspense>
  );
}
