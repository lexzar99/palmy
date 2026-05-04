"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { signIn, signOut, useSession } from "next-auth/react";
import axios from "axios";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  User, Settings, MapPin, Mail, Phone, LogOut, ChevronRight,
  Package, History, ShieldCheck, Lock, ArrowLeft, Loader2, Save, Bell, Check, Edit2, Sparkles, Ticket, Tag,
  Star, RotateCcw, Home, Briefcase, Plus, Trash2, Scale
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { API_URL } from "@/lib/api";
import {
  clearPlatformSession,
  getPlatformSessionStatus,
  persistPlatformSession,
} from "@/lib/platformSessionClient";
import { useCartStore } from "@/store/cartStore";
import ConfirmModal from "@/components/ConfirmModal";

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
                placeholder="Sök land..."
                autoFocus
                className="w-full rounded-xl px-3 py-2 text-sm outline-none"
                style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-muted)", color: "var(--text-primary)" }}
              />
            </div>
            <div className="max-h-72 overflow-auto">
              {filtered.length === 0 ? (
                <div className="px-4 py-6 text-center text-xs text-zinc-400">Inga matchande länder.</div>
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
  provider: "google" | "facebook" | "apple";
  label: string;
  icon: React.ReactNode;
}) {
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
      } else if (provider === "facebook") {
        // Facebook returnerar first_name/last_name som user_metadata om vi ber
        // om public_profile. email scope krävs för att få användarens mail.
        options.scopes = "email,public_profile";
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
            ? "Apple Sign-In är inte färdig­konfigurerad i Supabase ännu. Kontrollera Service ID + Secret Key."
            : `${label} är inte aktiverad i Supabase ännu.`,
        );
      } else {
        setErrorMsg(err?.message || "Kunde inte starta inloggning.");
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
        {loading ? "Laddar..." : label}
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

// ─── Main component ─────────────────────────────────────────────────────────
function ProfileContent() {
  const router = useRouter();
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
    if (tab && ["overview", "orders", "settings", "deals", "addresses"].includes(tab)) {
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

  // Auth (Phone OTP)
  const [showOtp, setShowOtp] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [otpPhone, setOtpPhone] = useState(""); // Stores phone after sending OTP
  const [isLoggingOut, setIsLoggingOut] = useState(false); // To fix logout bug

  const [countryCode, setCountryCode] = useState("+46");
  const [loginPhone, setLoginPhone] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState("");

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

  const fetchData = useCallback(async () => {
    try {
      const [profileRes, ordersRes, dealsRes, claimedRes] = await Promise.all([
        axios.get(`/api/platform/profile`),
        axios.get(`/api/platform/profile/orders`),
        axios.get(`/api/platform/profile/deals`),
        axios.get(`/api/platform/profile/claimed-deals`).catch(() => ({ data: { claimed: [], global: [] } })),
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

      // Fetch saved addresses
      try {
        const addrRes = await axios.get(`/api/platform/profile/addresses`);
        setSavedAddresses(addrRes.data || []);
      } catch (err) {
        console.warn("Failed to load addresses:", err);
      }
      
      // If user has no phone and we are not in the middle of verifying one, prompt them
      if (!profileRes.data.phone) {
        setShowAddPhone(true);
      } else {
        setShowAddPhone(false);
        setShowOtp(false);
      }
    } catch {
      void handleLogout();
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
     * När Supabase säger att vi är inloggade (Google/Apple/Facebook OAuth) har
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

    // Initial mount: vi kan ha en kvar-liggande platform-session från tidigare
    // (cookies) ELLER en färsk Supabase-session från callback-sidan
    void (async () => {
      const authenticated = await getPlatformSessionStatus();
      console.log("[OAuth] Initial mount: hasPlatformSession =", authenticated);
      if (authenticated) {
        setHasPlatformSession(true);
        await fetchData();
        return;
      }
      // Ingen platform-session — kolla om Supabase har en (efter OAuth-redirect)
      const { data: { session: sbSession } } = await supabase.auth.getSession();
      console.log(
        "[OAuth] Initial mount: hasSupabaseSession =",
        !!sbSession?.access_token,
      );
      if (sbSession?.access_token) {
        await exchangeSupabaseForPlatformToken(sbSession);
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

  const handleSendOtp = async (e: React.FormEvent, customPhone?: string) => {
    if (e) e.preventDefault();
    setIsLoggingIn(true);
    setLoginError("");
    const phoneToUse = customPhone || `${countryCode}${loginPhone.replace(/^0/, "")}`;
    setOtpPhone(phoneToUse);

    try {
      await axios.post(`${API_URL}/api/account/send-otp`, { phone: phoneToUse });
      setShowOtp(true);
      if (showAddPhone) setShowAddPhone(false); // If we were in OAuth add-phone
    } catch (err: any) {
      setLoginError(err.response?.data?.error || "Kunde inte skicka kod");
      if (showAddPhone) setAddPhoneError(err.response?.data?.error || "Kunde inte skicka kod");
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsVerifying(true);
    setLoginError("");
    try {
      // KRITISKT: Om användaren REDAN är inloggad (Apple/Google) ska
      // verifieringen LÄNKA telefonen till befintlig user — INTE skapa
      // ny via verify-otp (som var anledningen till att Apple-konton
      // dubblerades med "Gäst 5678"-konton).
      if (hasPlatformSession && user) {
        console.log("[OTP] User already logged in → using /api/profile/link-phone (will NOT create new user)");
        const res = await axios.post(`/api/platform/profile/link-phone`, {
          phone: otpPhone,
          code: otpCode,
        });
        // link-phone returnerar { user } utan ny token — behåll nuvarande session
        setUser((prev: any) => ({ ...(prev || {}), ...res.data.user }));
        await fetchData();
        setShowOtp(false);
        setShowAddPhone(false);
      } else {
        // Telefon-only login: skapa/hitta user via phone
        console.log("[OTP] No active session → using /api/account/verify-otp (may create new user)");
        const res = await axios.post(`/api/platform/account/verify-otp`, {
          phone: otpPhone,
          code: otpCode,
        });
        const { token: newToken, user: newUser } = res.data;
        await persistPlatformSession(newToken);
        setHasPlatformSession(true);
        setUser(newUser);
        await fetchData();
        setShowOtp(false);
      }
    } catch (err: any) {
      setLoginError(err.response?.data?.error || "Felaktig kod");
    } finally {
      setIsVerifying(false);
    }
  };

  const handleAddPhone = async (e: React.FormEvent) => {
    e.preventDefault();
    const fullPhone = `${addPhoneCountry}${addPhoneNum.replace(/^0/, "")}`;
    setAddPhoneLoading(true);
    setAddPhoneError("");
    try {
      // Instead of direct add, send OTP
      await handleSendOtp(e, fullPhone);
    } catch (err: any) {
      setAddPhoneError(err.response?.data?.error || "Kunde inte verifiera nummer");
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
      alert("Kunde inte spara");
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
      // Sign out of both Supabase and NextAuth (legacy)
      const supabase = createSupabaseBrowserClient();
      await Promise.allSettled([
        supabase.auth.signOut(),
        signOut({ redirect: false }),
      ]);
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
      <div className="min-h-screen flex flex-col items-center justify-center px-6 pt-20 pb-32" style={{ backgroundColor: "var(--bg-primary)" }}>
        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-sm space-y-8">

          {/* Header */}
          <div className="text-center space-y-3">
            <div className="w-20 h-20 rounded-[2rem] flex items-center justify-center text-gold-500 mx-auto bg-gold-500/10 border border-gold-500/20">
              <Lock size={36} />
            </div>
            <h1 className="text-4xl font-black uppercase tracking-tight" style={{ color: "var(--text-primary)" }}>
              {hasVisited ? "Välkommen" : "Skapa"}{" "}
              <span className="text-gold-500">{hasVisited ? "Tillbaka" : "Konto"}</span>
            </h1>
            <p className="text-zinc-400 text-[11px] font-bold uppercase tracking-widest">
              {hasVisited ? "Logga in med telefon eller social" : "Gå med — gratis och tar 30 sek"}
            </p>
          </div>

          {/* Phone login / OTP form */}
          {showOtp ? (
            <form onSubmit={handleVerifyOtp} className="space-y-4">
              <div>
                <label className="text-[9px] font-black uppercase tracking-widest text-zinc-600 ml-1 mb-1 block">Verifieringskod</label>
                <input
                  required
                  type="text"
                  maxLength={6}
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/[^0-9]/g, ""))}
                  placeholder="000 000"
                  className="w-full rounded-2xl py-4 px-5 text-center text-2xl font-black tracking-[0.5em] placeholder:text-zinc-200 outline-none focus:ring-2 focus:ring-gold-500/40 transition-all"
                  style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-muted)", color: "var(--text-primary)" }}
                />
              </div>
              {loginError && <p className="text-red-500 text-[11px] text-center font-black uppercase">{loginError}</p>}
              <button
                type="submit"
                disabled={isVerifying}
                className="w-full py-5 bg-gold-500 text-zinc-950 rounded-3xl font-black uppercase tracking-widest text-sm shadow-xl shadow-gold-500/20 active:scale-95 transition-all flex items-center justify-center gap-3"
              >
                {isVerifying ? <Loader2 className="animate-spin" size={20} /> : "Verifiera"}
              </button>
              <button type="button" onClick={() => setShowOtp(false)} className="w-full text-center text-[10px] font-black uppercase tracking-widest text-zinc-400 hover:text-gold-600 transition-colors">
                Ändra telefonnummer
              </button>
            </form>
          ) : (
            <form onSubmit={handleSendOtp} className="space-y-4">
              <div>
                <label className="text-[9px] font-black uppercase tracking-widest text-zinc-600 ml-1 mb-1 block">Telefonnummer</label>
                <div className="flex gap-2">
                  <CountryPicker value={countryCode} onChange={setCountryCode} />
                  <input
                    required
                    type="tel"
                    autoComplete="tel"
                    value={loginPhone}
                    onChange={(e) => setLoginPhone(e.target.value)}
                    placeholder="070 000 00 00"
                    className="flex-1 rounded-2xl py-4 px-5 font-bold placeholder:text-zinc-300 outline-none focus:ring-2 focus:ring-gold-500/40 transition-all"
                    style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-muted)", color: "var(--text-primary)" }}
                  />
                </div>
              </div>
              {loginError && <p className="text-red-500 text-[11px] text-center font-black uppercase">{loginError}</p>}
              <button
                type="submit"
                disabled={isLoggingIn}
                className="w-full py-5 bg-gold-500 text-zinc-950 rounded-3xl font-black uppercase tracking-widest text-sm shadow-xl shadow-gold-500/20 active:scale-95 transition-all flex items-center justify-center gap-3 disabled:opacity-60"
              >
                {isLoggingIn ? <Loader2 className="animate-spin" size={20} /> : "Fortsätt"}
              </button>
            </form>
          )}

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
                Eller med socialt konto
              </span>
            </div>
          </div>

          {/* Social buttons — real OAuth via Supabase */}
          <div className="grid grid-cols-3 gap-3">
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
            <SocialButton
              provider="facebook"
              label="Facebook"
              icon={
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path fill="#1877F2" d="M24 12.073C24 5.404 18.627 0 12 0S0 5.404 0 12.073C0 18.1 4.389 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.235 2.686.235v2.97h-1.513c-1.491 0-1.956.93-1.956 1.886v2.268h3.328l-.532 3.49h-2.796V24C19.61 23.094 24 18.1 24 12.073z"/>
                </svg>
              }
            />
          </div>

          {/* Register link */}
          <p className="text-center text-[11px] font-bold uppercase tracking-widest text-zinc-600">
            Inget konto?{" "}
            <Link href="/register" className="text-gold-500 hover:text-gold-400 transition-colors">
              Skapa konto gratis
            </Link>
          </p>
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
            <h2 className="text-2xl font-black uppercase italic tracking-tight">Lägg till telefon</h2>
            <p className="text-zinc-500 text-sm leading-relaxed">
              Ditt konto är knutet till ditt sociala konto. Lägg till ditt telefonnummer för säkrare inloggning — det kan aldrig ändras.
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
                placeholder="070 000 00 00"
                className="flex-1 bg-white/5 border border-white/10 rounded-2xl py-4 px-5 text-white font-bold placeholder:text-zinc-600 outline-none focus:ring-2 focus:ring-gold-500/40"
              />
            </div>
            {addPhoneError && <p className="text-red-500 text-[11px] text-center font-black uppercase">{addPhoneError}</p>}
            <button
              type="submit"
              disabled={addPhoneLoading}
              className="w-full py-5 bg-gold-500 text-zinc-950 rounded-3xl font-black uppercase tracking-widest text-sm shadow-xl shadow-gold-500/20 active:scale-95 transition-all flex items-center justify-center gap-3"
            >
              {addPhoneLoading ? <Loader2 className="animate-spin" size={20} /> : "Spara nummer"}
            </button>
          </form>
        </motion.div>
      </div>
    );
  }

  // ─── Logged in ────────────────────────────────────────────────────────────
  return (
    <>
    <div className="min-h-screen pt-20 pb-32 px-6" style={{ backgroundColor: "var(--bg-primary)" }}>
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
                  <span className="text-[10px] font-black uppercase tracking-widest">Verifierad</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 mt-1 text-rose-500">
                  <Lock size={14} />
                  <span className="text-[10px] font-black uppercase tracking-widest">Ej verifierad</span>
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
          för MatGo i sina iCloud-inställningar och logga in igen.
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
                    Apple delade inte ditt namn
                  </h3>
                  <p
                    className="text-[12px] mt-1 leading-snug"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    Apple ger ditt namn endast vid första inloggningen. För att
                    få in det:
                  </p>
                  <ol
                    className="text-[12px] mt-2 ml-4 list-decimal space-y-1"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    <li>
                      Öppna{" "}
                      <a
                        href="https://appleid.apple.com/account/manage"
                        target="_blank"
                        rel="noreferrer"
                        className="text-gold-600 underline font-bold"
                      >
                        Apple ID-inställningar
                      </a>
                    </li>
                    <li>
                      Sign-In with Apple → MatGo →{" "}
                      <strong>Stop using Apple ID</strong>
                    </li>
                    <li>Kom tillbaka hit och tryck Apple-knappen igen</li>
                  </ol>
                  <p
                    className="text-[11px] mt-2 italic"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    Eller fyll i namnet manuellt i Inställningar-fliken nedan.
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
              <p className="text-[10px] font-black uppercase text-amber-600 tracking-widest">Rekommenderat</p>
              <p className="font-bold text-sm mt-0.5" style={{ color: "var(--text-primary)" }}>Lägg till telefonnummer</p>
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
                <p className="text-[10px] font-black uppercase text-red-400 tracking-widest">Åtgärd krävs</p>
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
              Fixa nu
            </button>
          </div>
        )}

        <div className="grid grid-cols-5 p-1.5 rounded-[2rem] shadow-sm" style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-muted)" }}>
          {[
            { id: "overview", icon: User, label: "Hem" },
            { id: "deals", icon: Sparkles, label: "Deals" },
            { id: "orders", icon: History, label: "Ordrar" },
            { id: "addresses", icon: MapPin, label: "Adresser" },
            { id: "settings", icon: Settings, label: "Inst." },
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
                   <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500 px-2">Tillgängliga erbjudanden</p>
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
                               Nytt erbjudande
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
                             {deal.discountType === "PERCENTAGE" ? `${deal.discountValue}%` : `${deal.discountValue} kr`} rabatt
                             {deal.minOrder > 0 ? ` • min ${deal.minOrder} kr` : ""}
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
                                 alert(e?.response?.data?.error || "Kunde inte spara erbjudandet");
                               } finally {
                                 setClaimingId(null);
                               }
                             }}
                             className="px-5 py-3 rounded-2xl bg-gold-500 text-zinc-950 font-black uppercase tracking-widest text-[10px] shadow-lg shadow-gold-500/20 active:scale-95 transition-all disabled:opacity-60"
                           >
                             {isClaiming ? "Sparar..." : (deal.popupCtaLabel || "Spara erbjudande")}
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
                   <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500 px-2">Sparade erbjudanden</p>
                   {claimedDeals.map((deal: any) => {
                     const isClaimed = deal._kind === 'CLAIMED';
                     // Tag som visar typ av deal: Personlig (CustomerDeal),
                     // Restaurang (deal.restaurantId satt) eller Global.
                     const dealKind: { label: string; tone: string } = deal.restaurantId
                       ? { label: "Restaurang", tone: "bg-sky-500/10 text-sky-400 border-sky-500/30" }
                       : isClaimed
                         ? { label: "Personlig", tone: "bg-purple-500/10 text-purple-400 border-purple-500/30" }
                         : { label: "Global", tone: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30" };
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
                                 {isClaimed ? "Sparad" : "Tillgänglig för alla"}
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
                               KOD: <span className="text-zinc-950 select-all">{deal.popupCode}</span>
                             </div>
                             <button
                               onClick={() => { navigator.clipboard.writeText(deal.popupCode); }}
                               className="text-[10px] font-black uppercase tracking-widest text-gold-600 hover:text-gold-700 transition-colors"
                             >
                               Kopiera
                             </button>
                           </div>
                         ) : null}
                         <div className="flex items-center justify-between text-[9px] font-black uppercase tracking-widest text-zinc-400">
                           <div>{deal.discountType === "PERCENTAGE" ? `${deal.discountValue}%` : `${deal.discountValue} kr`} rabatt {deal.minOrder > 0 ? `• min ${deal.minOrder} kr` : ""}</div>
                           <div>Giltig till: {deal.validUntil ? new Date(deal.validUntil).toLocaleDateString("sv-SE") : "Oändlig"}</div>
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
                    <p className="font-black uppercase tracking-widest text-zinc-400">Inga erbjudanden tillgängliga</p>
                    <p className="text-[10px] uppercase font-bold text-zinc-300 mt-2">Dina framtida belöningar dyker upp här</p>
                 </div>
               ) : deals.length > 0 ? (
                 <div className="space-y-3">
                   <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500 px-2">Personliga koder</p>
                   {deals.map((deal: any) => (
                   <div key={deal.id} className="p-8 rounded-[2.5rem] bg-gold-500/5 border border-gold-500/10 shadow-sm relative overflow-hidden group">
                      <div className="absolute top-0 right-0 w-24 h-24 bg-gold-500/5 blur-2xl group-hover:bg-gold-500/10 transition-all" />
                      <div className="flex items-start justify-between mb-6">
                         <div className="flex-1 pr-4">
                            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-gold-600 mb-1">{deal.campaign.title}</div>
                            <h3 className="text-2xl font-black italic tracking-tighter uppercase leading-tight" style={{ color: "var(--text-primary)" }}>
                                {deal.campaign.discountType === "PERCENTAGE" ? `${deal.campaign.discountValue}% RABATT` : `${deal.campaign.discountValue} KR RABATT`}
                            </h3>
                         </div>
                         <div className="w-12 h-12 bg-gold-500 text-zinc-950 rounded-2xl flex items-center justify-center shadow-xl shrink-0"><Ticket size={24} /></div>
                      </div>
                      
                      <div className="p-4 rounded-2xl bg-zinc-50 border border-zinc-100 flex items-center justify-between mb-6">
                         <div className="text-[10px] font-black tracking-[0.3em] uppercase text-zinc-400">KOD: <span className="text-zinc-950 select-all">{deal.code}</span></div>
                         <button 
                            onClick={() => { navigator.clipboard.writeText(deal.code); }} 
                            className="text-[10px] font-black uppercase tracking-widest text-gold-600 hover:text-gold-700 transition-colors"
                          >
                            Kopiera
                          </button>
                      </div>

                      <div className="flex items-center justify-between text-[9px] font-black uppercase tracking-widest text-zinc-400">
                         <div>Min. order: {deal.campaign.minOrder} kr</div>
                         <div>Giltig till: {deal.campaign.validUntil ? new Date(deal.campaign.validUntil).toLocaleDateString("sv-SE") : "Oändlig"}</div>
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
              <div className="rounded-[2.5rem] p-8 space-y-5 shadow-sm" style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-muted)" }}>
                <div className="flex items-center gap-4">
                  <Phone size={16} className="text-zinc-400 shrink-0" />
                  <div className="flex-1">
                    <p className="text-[9px] font-black uppercase tracking-widest text-zinc-400">Telefon</p>
                    <p className="font-bold text-sm" style={{ color: "var(--text-primary)" }}>{user.phone || "Ej angivet"}</p>
                  </div>
                  {user.isVerified ? (
                    <span className="text-[8px] bg-emerald-50 text-emerald-600 border border-emerald-100 px-3 py-1.5 rounded-full uppercase font-black flex items-center gap-1">
                      <Lock size={8} /> Låst
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
                      <Edit2 size={8} /> Ändra
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-4">
                  <Mail size={16} className="text-zinc-400 shrink-0" />
                  <div className="flex-1">
                    <p className="text-[9px] font-black uppercase tracking-widest text-zinc-400">E-post</p>
                    <p className="font-bold text-sm" style={{ color: "var(--text-primary)" }}>{user.email || "Ej angivet"}</p>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-[2rem] p-6 shadow-sm" style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-muted)" }}>
                  <p className="text-[9px] font-black uppercase tracking-widest text-zinc-400 mb-1">Beställningar</p>
                  <p className="text-3xl font-black" style={{ color: "var(--text-primary)" }}>{orders.length}</p>
                </div>
                <div className="rounded-[2rem] p-6 shadow-sm" style={{ backgroundColor: user.isVerified ? "var(--bg-secondary)" : "var(--bg-secondary)", border: user.isVerified ? "1px solid rgba(5,150,105,0.1)" : "1px solid var(--border-muted)" }}>
                  <p className="text-[9px] font-black uppercase tracking-widest text-zinc-400 mb-1">Status</p>
                  <p className={`text-sm font-black uppercase ${user.isVerified ? "text-emerald-600" : "text-rose-500"}`}>
                    {user.isVerified ? "✓ Verifierad" : "Ej veri."}
                  </p>
                </div>
              </div>
            </motion.div>
          )}

          {/* Settings */}
          {activeTab === "settings" && !isEditing && (
            <motion.div key="set" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-6">
              <div className="space-y-2">
                <div className="px-4 text-[9px] font-black uppercase tracking-[0.4em] text-zinc-600 mb-2">Profil</div>
                <div className="bg-white/5 border border-white/5 rounded-[2.5rem]">
                  <button
                    onClick={() => setIsEditing(true)}
                    className="w-full flex items-center justify-between p-6 hover:bg-white/5 transition-all text-left rounded-[2.5rem]"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-gold-500/10 text-gold-500 rounded-xl flex items-center justify-center"><Settings size={18} /></div>
                      <div>
                        <p className="text-sm font-bold uppercase italic text-white">Redigera profil</p>
                        <p className="text-[10px] text-zinc-600">Namn och e-post</p>
                      </div>
                    </div>
                    <ChevronRight size={18} className="text-zinc-700" />
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <div className="px-4 text-[9px] font-black uppercase tracking-[0.4em] text-zinc-600 mb-2">Preferenser</div>
                <div className="bg-white/5 border border-white/5 rounded-[2.5rem] divide-y divide-white/5">
                  <div className="p-6 flex items-center justify-between group">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center">
                        <Bell size={18} />
                      </div>
                      <div>
                        <p className="font-bold text-sm text-white">Push-notiser</p>
                        <p className="text-[10px] text-zinc-500 font-medium uppercase tracking-widest">Orderstatus i realtid</p>
                      </div>
                    </div>
                    <div className="w-12 h-6 bg-zinc-800 rounded-full relative cursor-pointer opacity-50">
                       <div className="absolute left-1 top-1 w-4 h-4 bg-zinc-600 rounded-full" />
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="px-4 text-[9px] font-black uppercase tracking-[0.4em] text-zinc-600 mb-2">Juridiskt & GDPR</div>
                <div className="bg-white/5 border border-white/5 rounded-[2.5rem] divide-y divide-white/5">
                  <Link href="/privacy" className="p-6 flex items-center justify-between group hover:bg-white/5 transition-all first:rounded-t-[2.5rem]">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
                        <ShieldCheck size={18} />
                      </div>
                      <p className="font-bold text-sm text-white">Integritetspolicy</p>
                    </div>
                    <ChevronRight size={18} className="text-zinc-600 group-hover:text-white transition-all" />
                  </Link>
                  <Link href="/terms" className="p-6 flex items-center justify-between group hover:bg-white/5 transition-all">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center">
                        <Scale size={18} />
                      </div>
                      <p className="font-bold text-sm text-white">Användarvillkor</p>
                    </div>
                    <ChevronRight size={18} className="text-zinc-600 group-hover:text-white transition-all" />
                  </Link>
                </div>
              </div>

              <div className="space-y-2">
                <div className="px-4 text-[9px] font-black uppercase tracking-[0.4em] text-zinc-400 mb-2">Konto-hantering</div>
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
                        <p className="font-bold text-sm text-rose-500">Radera konto</p>
                        <p className="text-[10px] text-zinc-400 font-medium uppercase tracking-widest">Rensa all personlig data</p>
                      </div>
                    </div>
                  </button>
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
                  <p className="font-black uppercase tracking-widest text-sm">Inga ordrar ännu</p>
                </div>
              ) : orders.map((order) => (
                <div key={order.id} className="bg-white/5 border border-white/5 rounded-[2.5rem] p-6 hover:bg-white/10 transition-all group">
                  <Link href={`/order/${order.id}`} className="flex justify-between items-center">
                    <div>
                      <p className="font-black uppercase italic text-sm">{order.restaurant?.name || "Beställning"}</p>
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
                             alert(`${data.unavailableItems.length} produkt(er) finns inte längre: ${data.unavailableItems.join(', ')}`);
                          }
                          router.push('/cart');
                        } catch (err: any) {
                          alert(err.response?.data?.error || 'Kunde inte förbereda ombeställning');
                        } finally {
                          setReorderingId(null);
                        }
                      }}
                      disabled={reorderingId === order.id}
                      className="flex items-center gap-2 px-5 py-3 bg-gold-500/10 border border-gold-500/20 rounded-xl text-[9px] font-black uppercase tracking-widest text-gold-600 hover:bg-gold-500/20 active:scale-95 transition-all disabled:opacity-50"
                    >
                      {reorderingId === order.id ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />}
                      Beställ igen
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
                  <p className="font-black uppercase tracking-widest text-zinc-600 text-sm">Inga sparade adresser</p>
                  <p className="text-[10px] uppercase font-bold text-zinc-800 mt-2">Lägg till din första adress nedan</p>
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
                            <p className="font-black uppercase italic text-sm" style={{ color: "var(--text-primary)" }}>{addr.label}</p>
                            {addr.isDefault && <span className="text-[7px] font-black uppercase bg-emerald-50 text-emerald-600 border border-emerald-100 px-2 py-0.5 rounded-md">Standard</span>}
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
                            title="Gör till standard"
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
                  <Plus size={16} className="text-gold-600" /> Lägg till adress
                </h3>
                <div className="flex gap-2">
                  {['Hem', 'Jobb', 'Annat'].map(l => (
                    <button key={l} type="button" onClick={() => setNewAddrLabel(l)} className={`flex items-center gap-2 px-4 py-3 rounded-xl text-[9px] font-black uppercase tracking-widest border transition-all ${
                      newAddrLabel === l ? 'bg-gold-500/10 border-gold-500/30 text-gold-600' : 'bg-zinc-50 border-zinc-100 text-zinc-400'
                    }`}>
                      {l === 'Hem' ? <Home size={12} /> : l === 'Jobb' ? <Briefcase size={12} /> : <MapPin size={12} />}
                      {l}
                    </button>
                  ))}
                </div>
                <input value={newAddrStreet} onChange={e => setNewAddrStreet(e.target.value)} placeholder="Gatuadress" className="w-full rounded-2xl py-4 px-5 font-bold placeholder:text-zinc-200 outline-none focus:ring-2 focus:ring-gold-500/40" style={{ backgroundColor: "var(--bg-primary)", border: "1px solid var(--border-muted)", color: "var(--text-primary)" }} />
                <div className="grid grid-cols-2 gap-3">
                  <input value={newAddrCity} onChange={e => setNewAddrCity(e.target.value)} placeholder="Stad" className="rounded-2xl py-4 px-5 font-bold placeholder:text-zinc-200 outline-none focus:ring-2 focus:ring-gold-500/40" style={{ backgroundColor: "var(--bg-primary)", border: "1px solid var(--border-muted)", color: "var(--text-primary)" }} />
                  <input value={newAddrZip} onChange={e => setNewAddrZip(e.target.value)} placeholder="Postnummer" className="rounded-2xl py-4 px-5 font-bold placeholder:text-zinc-200 outline-none focus:ring-2 focus:ring-gold-500/40" style={{ backgroundColor: "var(--bg-primary)", border: "1px solid var(--border-muted)", color: "var(--text-primary)" }} />
                </div>
                <input value={newAddrNote} onChange={e => setNewAddrNote(e.target.value)} placeholder="Portkod, våning (valfritt)" className="w-full rounded-2xl py-4 px-5 font-bold placeholder:text-zinc-200 outline-none focus:ring-2 focus:ring-gold-500/40" style={{ backgroundColor: "var(--bg-primary)", border: "1px solid var(--border-muted)", color: "var(--text-primary)" }} />
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
                      alert(err.response?.data?.error || 'Kunde inte spara');
                    } finally { setAddrSaving(false); }
                  }}
                  disabled={addrSaving || !newAddrStreet || !newAddrCity || !newAddrZip}
                  className="w-full py-5 bg-gold-500 text-zinc-950 rounded-3xl font-black uppercase tracking-widest text-[11px] shadow-xl shadow-gold-500/20 active:scale-95 transition-all disabled:opacity-40 flex items-center justify-center gap-3"
                >
                  {addrSaving ? <Loader2 size={16} className="animate-spin" /> : <><Plus size={16} /> Spara adress</>}
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
                <h3 className="text-lg font-black uppercase italic" style={{ color: "var(--text-primary)" }}>Ändra uppgifter</h3>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="text-[9px] font-black uppercase tracking-widest text-zinc-400 ml-1 mb-1 block">Namn</label>
                  <input value={editName} onChange={e => setEditName(e.target.value)} className="w-full rounded-2xl py-4 px-6 font-bold outline-none focus:ring-2 focus:ring-gold-500/40" style={{ backgroundColor: "var(--bg-primary)", border: "1px solid var(--border-muted)", color: "var(--text-primary)" }} />
                </div>
                <div>
                  <label className="text-[9px] font-black uppercase tracking-widest text-zinc-400 ml-1 mb-1 block">E-post</label>
                  <input type="email" value={editEmail} onChange={e => setEditEmail(e.target.value)} placeholder="din@email.se" className="w-full rounded-2xl py-4 px-6 font-bold outline-none focus:ring-2 focus:ring-gold-500/40" style={{ backgroundColor: "var(--bg-primary)", border: "1px solid var(--border-muted)", color: "var(--text-primary)" }} />
                </div>
                <div>
                  <label className="text-[9px] font-black uppercase tracking-widest text-zinc-400 ml-1 mb-1 block">Telefon (ej ändringsbart)</label>
                  <input disabled value={user.phone || "Ej angivet"} className="w-full rounded-2xl py-4 px-6 font-bold cursor-not-allowed opacity-50" style={{ backgroundColor: "var(--bg-deep)", border: "1px solid var(--border-muted)", color: "var(--text-secondary)" }} />
                </div>
              </div>
              <button
                type="submit"
                disabled={isSaving}
                className={`w-full py-5 rounded-3xl font-black uppercase tracking-widest text-sm flex items-center justify-center gap-3 transition-all ${saveSuccess ? "bg-emerald-500 text-white" : "bg-gold-500 text-zinc-950 shadow-xl shadow-gold-500/20 active:scale-95"}`}
              >
                {isSaving ? <Loader2 className="animate-spin" size={20} /> : saveSuccess ? "Sparat! ✓" : <><Save size={18} /> Spara</>}
              </button>
            </motion.form>
          )}
        </AnimatePresence>
      </div>
    </div>
    
    {/* Global OTP Overlay for Verification */}
    <AnimatePresence>
      {showOtp && (
        <motion.div 
          initial={{ opacity: 0 }} 
          animate={{ opacity: 1 }} 
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center px-6 backdrop-blur-sm" style={{ backgroundColor: "rgba(252,252,249,0.9)" }}
        >
          <motion.div 
            initial={{ scale: 0.9, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.9, y: 20 }}
            className="w-full max-w-sm rounded-[2.5rem] p-8 space-y-8 shadow-2xl"
            style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-muted)" }}
          >
            <div className="text-center space-y-3">
              <div className="w-16 h-16 bg-gold-500/10 rounded-2xl border border-gold-500/20 flex items-center justify-center text-gold-600 mx-auto">
                <ShieldCheck size={32} />
              </div>
              <h2 className="text-2xl font-black uppercase italic" style={{ color: "var(--text-primary)" }}>Verifiera kod</h2>
              <p className="text-zinc-400 text-xs">Vi har skickat en kod till {otpPhone}</p>
            </div>

            <form onSubmit={handleVerifyOtp} className="space-y-4">
              <div>
                <label className="text-[9px] font-black uppercase tracking-widest text-zinc-400 ml-1 mb-1 block">Engångskod</label>
                <input
                  required
                  type="text"
                  maxLength={6}
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/[^0-9]/g, ""))}
                  placeholder="000 000"
                  className="w-full rounded-2xl py-4 px-5 text-center text-2xl font-black tracking-[0.5em] placeholder:text-zinc-100 outline-none focus:ring-2 focus:ring-gold-500/40 transition-all"
                  style={{ backgroundColor: "var(--bg-primary)", border: "1px solid var(--border-muted)", color: "var(--text-primary)" }}
                />
              </div>
              
              {loginError && <p className="text-red-500 text-[11px] text-center font-black uppercase">{loginError}</p>}
              
              <button
                type="submit"
                disabled={isVerifying}
                className="w-full py-5 bg-gold-500 text-zinc-950 rounded-3xl font-black uppercase tracking-widest text-sm shadow-xl shadow-gold-500/20 active:scale-95 transition-all flex items-center justify-center gap-3"
              >
                {isVerifying ? <Loader2 className="animate-spin" size={20} /> : "Bekräfta kod"}
              </button>

              <button 
                type="button" 
                onClick={() => setShowOtp(false)}
                className="w-full text-center text-[10px] font-black uppercase tracking-widest text-zinc-600 hover:text-white transition-colors"
              >
                Avbryt
              </button>
            </form>
          </motion.div>
</motion.div>
        )}
    </AnimatePresence>

    {/* Delete Account Modal */}
    <ConfirmModal
      isOpen={deleteAccountModalOpen}
      onClose={() => setDeleteAccountModalOpen(false)}
      onConfirm={async () => {
        try {
          await axios.delete(`/api/platform/profile`);
          alert("Ditt konto har raderats. Hoppas vi ses igen!");
          handleLogout();
        } catch (err: any) {
          alert(err.response?.data?.error || "Kunde inte radera kontot");
        }
      }}
      title="Radera konto?"
      message="Detta går INTE att ångra. All din orderhistorik kommer anonymiseras och dina sparade adresser raderas permanent."
      confirmText="Ja, radera"
      cancelText="Avbryt"
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
          alert(err.response?.data?.error || "Kunde inte radera adressen");
        } finally {
          setAddressToDelete(null);
        }
      }}
      title="Radera adress?"
      message={`Vill du verkligen radera adressen "${addressToDelete?.label}"?`}
      confirmText="Ja, radera"
      cancelText="Avbryt"
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
