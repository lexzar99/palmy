"use client";

/**
 * ViaEats Launch Checklist
 *
 * Interaktiv launch-plan med checkboxes + notes per item.
 * Allt sparas i localStorage så state överlever browser-restart.
 *
 * Inte länkad någonstans från huvud-appen — accessas direkt via
 * /launch-checklist.
 */

import { useEffect, useState, useCallback, useMemo } from "react";
import { notFound } from "next/navigation";
import {
  ChevronDown,
  ChevronRight,
  Circle,
  CheckCircle2,
  Download,
  Upload,
  RotateCcw,
  StickyNote,
} from "lucide-react";

// ─── DATA ─────────────────────────────────────────────────────────────────────

type Owner = "Jag" | "Du" | "Båda";

type ChecklistItem = {
  id: string;
  title: string;
  description: string;
  who: Owner;
  effort: string;
};

type ChecklistPhase = {
  id: string;
  emoji: string;
  title: string;
  description: string;
  estimatedDays: string;
  items: ChecklistItem[];
};

const PHASES: ChecklistPhase[] = [
  {
    id: "fas-1",
    emoji: "🎨",
    title: "Fas 1 — Namn & Brand",
    description:
      "Välj slutligt namn, verifiera tillgänglighet, köp domän, skapa logo.",
    estimatedDays: "1-3 dagar",
    items: [
      {
        id: "namn-kandidater",
        title: "Brainstorma 3-5 namn-kandidater",
        description:
          "Skriv ner alternativ. Tänk: lätt att stava, lätt att uttala, .se-domän tillgänglig, inga konflikter med befintliga företag.",
        who: "Du",
        effort: "30 min",
      },
      {
        id: "varumarke-check",
        title: "PRV.se — kolla varumärkesregister",
        description:
          "Sök på varje kandidat i klass 35 (handel) + 43 (restaurang/mat). https://www.prv.se/sv/varumarke/sok-varumarke/",
        who: "Du",
        effort: "15 min",
      },
      {
        id: "doman-check",
        title: "Domän-tillgänglighet (.se, .com, .app)",
        description:
          "Kolla på loopia.se eller one.com. Köp så snart valet är klart (~150 kr/år för .se). .com är bonus om tillgänglig.",
        who: "Du",
        effort: "15 min",
      },
      {
        id: "app-store-check",
        title: "App Store + Google Play — inga konflikter",
        description:
          "Sök på appstore.com och play.google.com. Om någon redan har namnet → byt eller modifiera.",
        who: "Du",
        effort: "10 min",
      },
      {
        id: "social-handles",
        title: "Sociala medier-handles",
        description:
          "Reservera @nynamn på Instagram, TikTok, Facebook. Även om du inte använder dem direkt, locka inte squatters.",
        who: "Du",
        effort: "15 min",
      },
      {
        id: "doman-kop",
        title: "Köp domänen",
        description:
          "Så snart valet är klart. Loopia.se eller one.com. Aktivera auto-renew.",
        who: "Du",
        effort: "5 min",
      },
      {
        id: "logo-design",
        title: "Logo + brand-identity",
        description:
          "Canva (gratis), Figma, eller anlita designer på Fiverr. Behöver: huvudlogo (vektor), favicon, app-icon 1024x1024, social media-banner.",
        who: "Du",
        effort: "1-2 dagar",
      },
    ],
  },
  {
    id: "fas-2",
    emoji: "🏢",
    title: "Fas 2 — Företaget",
    description: "Enskild firma, F-skatt, bank-konto, bokföring.",
    estimatedDays: "1 vecka (mest väntetid)",
    items: [
      {
        id: "verksamt-firma",
        title: "Verksamt.se → Starta enskild näringsverksamhet",
        description:
          "https://www.verksamt.se → 'Starta företag'. Välj 'Enskild näringsverksamhet'. Behöver BankID. Får org-nr direkt eller inom 1-2 dagar.",
        who: "Du",
        effort: "30 min + väntetid",
      },
      {
        id: "f-skatt",
        title: "F-skatt-registrering",
        description:
          "Görs samtidigt på Verksamt. Krävs om du ska fakturera. Skatteverket behandlar inom 2-3 veckor men du kan börja jobba direkt.",
        who: "Du",
        effort: "10 min",
      },
      {
        id: "moms",
        title: "Moms-registrering (om omsättning >120k SEK/år)",
        description:
          "Också via Verksamt. Om förväntad omsättning under 120 000 kr/år är moms FRIVILLIG. Annars måste registrera.",
        who: "Du",
        effort: "10 min",
      },
      {
        id: "bank-konto",
        title: "Företagskonto",
        description:
          "SEB, Nordea, Swedbank (1-3 dagar). Eller digitala: Lunar (snabbare), Northmill, Holvi. Behöver org-nr + ID.",
        who: "Du",
        effort: "30 min + väntetid",
      },
      {
        id: "bokforing",
        title: "Bokföringssystem",
        description:
          "Bokio (gratis tier) eller Fortnox (~150 kr/mån). Behöver för Bokföringslagen (7-årig retention).",
        who: "Du",
        effort: "30 min setup",
      },
      {
        id: "anteckna-orgnr",
        title: "Anteckna org-nr + adress för senare",
        description:
          "Kommer användas i: Stripe- och Swish-onboarding, Terms-sidan, Privacy-sidan, fakturor och alla legal-dokument.",
        who: "Du",
        effort: "1 min",
      },
    ],
  },
  {
    id: "fas-3",
    emoji: "💳",
    title: "Fas 3 — Stripe, Swish + betalningar",
    description: "Stripe och direkt Swish i företagsnamn: KYC, live-nycklar, betalningsdomän, webhooks och refunds.",
    estimatedDays: "2-4 dagar",
    items: [
      {
        id: "stripe-konto",
        title: "Skapa Stripe-konto i företagsnamn",
        description:
          "dashboard.stripe.com → registrera organisationen med org-nr från Fas 2. Slutför företags-, ägar- och identitetskontrollen och aktivera livebetalningar.",
        who: "Du",
        effort: "30 min + KYC-väntan",
      },
      {
        id: "stripe-bank",
        title: "Koppla bank-konto för utbetalningar",
        description:
          "Stripe Dashboard → Settings → Bank accounts. Lägg in och verifiera företagskontot från Fas 2; kontrollera även utbetalningsfrekvens och kontouppgifter.",
        who: "Du",
        effort: "15 min + 1-2 dagar verifiering",
      },
      {
        id: "stripe-payment-methods",
        title: "Aktivera betalmetoder",
        description:
          "Stripe Dashboard → Settings → Payment methods. Aktivera kort och Klarna. Kontrollera att Apple Pay och Google Pay är aktiva för www.viaeats.se.",
        who: "Du",
        effort: "5 min",
      },
      {
        id: "stripe-live-key-railway",
        title: "Sätt Stripe live keys i Railway env (API-tjänsten)",
        description:
          "Sätt STRIPE_SECRET_KEY=sk_live_..., STRIPE_PUBLISHABLE_KEY=pk_live_... och PAYMENT_PROVIDER=stripe med PAYMENT_PROVIDERS=stripe,swish. Exponera aldrig secret key i webbklienten.",
        who: "Du",
        effort: "5 min",
      },
      {
        id: "stripe-live-readiness",
        title: "Verifiera live-readiness i produktion",
        description: "Kontrollera API:ts launch-readiness/health med Stripe live keys, signerad webhook och direkt Swish mTLS innan riktig trafik släpps på.",
        who: "Du",
        effort: "5 min",
      },
      {
        id: "stripe-webhook",
        title: "Verifiera Stripe-webhooken end-to-end",
        description:
          "Stripe Dashboard ska skicka signerade events till https://api.viaeats.se/api/payments/webhooks/stripe. Bekräfta PaymentIntent-, refund- och dispute-events och att backend alltid hämtar canonical status innan ordern muteras.",
        who: "Du",
        effort: "10 min",
      },
      {
        id: "stripe-live-key-fail-fast",
        title: "Force-fail boot om Stripe live-konfiguration saknas (kod)",
        description:
          "I produktion ska API:t vägra starta om Stripe är aktivt men sk_live_, pk_live_ eller webhook-hemligheten saknas. Verifiera detta före deploy.",
        who: "Jag",
        effort: "5 min",
      },
      {
        id: "stripe-test-purchase",
        title: "Gör en test-purchase live",
        description:
          "Gör ett riktigt köp med låg summa. Verifiera i Stripe Dashboard att PaymentIntent blir succeeded, webhooken når API:t och ordern går från AWAITING_PAYMENT till PAID utan manuell åtgärd.",
        who: "Du",
        effort: "15 min",
      },
      {
        id: "refund-test",
        title: "Test refund end-to-end",
        description:
          "Admin → öppna ordern → klicka refund. Verifiera i Stripe/Swish att refunden registreras, att webhook/reconcile synkar utfallet, att kunden får notifiering och att orderns refund-status uppdateras.",
        who: "Båda",
        effort: "30 min",
      },
      {
        id: "audit-logs-payments",
        title: "Verifiera audit-logg på refunds + admin order-mutations",
        description:
          "Gör en manuell refund och statusändring och kontrollera att aktör, order, belopp och tid syns i auditloggen. Massrefund och permanent orderradering ska inte finnas.",
        who: "Båda",
        effort: "20 min",
      },
    ],
  },
  {
    id: "fas-4",
    emoji: "💻",
    title: "Fas 4 — Kod-ändringar inför launch",
    description:
      "Hardcoded 'ViaEats' bort, Bundle ID rebrand, security-fixar, bug-cleanup.",
    estimatedDays: "3-5 dagar",
    items: [
      {
        id: "company-info-terms",
        title: "Fyll i COMPANY-info i Terms + Privacy",
        description:
          "apps/web/app/terms/page.tsx + privacy/page.tsx. Just nu placeholders (TODO-orgnr, TODO-adress). Använd uppgifter från Fas 2.",
        who: "Du",
        effort: "5 min",
      },
      {
        id: "company-info-admin",
        title: "Sätt företagsinfo i Admin → Platform Settings",
        description:
          "Företagsnamn, org-nr, adress, support-email, privacy-email. Mejl-default + legal-sidor läser från admin.",
        who: "Du",
        effort: "5 min",
      },
      {
        id: "migrate-deploy",
        title: "API: byt till prisma migrate deploy",
        description:
          "Just nu prisma db push --accept-data-loss. Ett bad schema-byte raderar data tyst. Migrate deploy = säker production-pattern.",
        who: "Jag",
        effort: "1/2 dag (kräver baseline-migration)",
      },
      {
        id: "cors-tighten",
        title: "CORS tighten",
        description:
          "Just nu tillåter *.vercel.app vilket släpper in ALLA preview-deploys. Begränsa till specifika domäner: produktion + ev. en preview.",
        who: "Jag",
        effort: "5 min",
      },
      {
        id: "disable-dangerous-envs",
        title: "Verifiera att orderradering är permanent avstängd",
        description:
          "Gamla delete/wipe- och massrefund-endpoints ska svara 410. Seed/clear-skript ska vägra om order- eller payoutspår finns.",
        who: "Båda",
        effort: "5 min",
      },
      {
        id: "favicon-fix",
        title: "Web favicon — verifiera mot slutgiltig logotyp",
        description:
          "apps/web/app/icon.tsx ritar nu 'F' (ViaEats). Byt mot riktig logo-SVG/PNG när design är klar.",
        who: "Jag",
        effort: "5 min",
      },
      {
        id: "rensa-viaeats",
        title: "Rensa alla hardcoded 'ViaEats'",
        description:
          "app.json (expo.name), iOS Info.plist (CFBundleDisplayName, etc), Android manifest, brand-konstanter i RN.",
        who: "Jag",
        effort: "15 min",
      },
      {
        id: "bundle-id-rebrand",
        title: "Bundle ID rebrand → com.nyttnamn.app",
        description:
          "Skapa NY app i Apple Developer Portal med nya bundle ID. Kan INTE byta på existerande. Nytt Apple Pay merchant ID också.",
        who: "Du",
        effort: "1 dag",
      },
      {
        id: "rebuild-ios",
        title: "iOS rebuild med nytt bundle ID",
        description:
          "cd ios && pod install + Xcode rebuild. Verifiera Push, telefon-OTP, Live Activities och Apple Pay funkar.",
        who: "Du",
        effort: "1/2 dag",
      },
      {
        id: "phone-otp-supabase",
        title: "Telefon-OTP i Supabase/Twilio",
        description:
          "Verifiera att SMS-provider, rate-limit och redirectfria OTP-flödet är korrekt konfigurerat för webben och appen.",
        who: "Du",
        effort: "30 min",
      },
      {
        id: "twilio-cleanup",
        title: "Verifiera lösenordsfri telefon-OTP",
        description:
          "Kundauth ska bara erbjuda SMS-OTP. Testa ny och befintlig telefon, fel kod, utgången kod och rate-limit. Ingen e-post eller social auth får synas.",
        who: "Båda",
        effort: "30 min",
      },
      {
        id: "bug-fixar",
        title: "Bug-list från test",
        description:
          "Lista alla kända buggar (TestFlight + Vercel-feedback). Kritiska först, polering sist.",
        who: "Båda",
        effort: "Variabel",
      },
    ],
  },
  {
    id: "fas-5",
    emoji: "📧",
    title: "Fas 5 — Driftmail och manuell launchkontakt",
    description: "DNS-records för interna larm och manuella, samtyckta launchutskick. Inte kundauth.",
    estimatedDays: "1 dag arbete + 24-48h väntan",
    items: [
      {
        id: "brevo-domain-add",
        title: "Lägg till domän i Brevo",
        description:
          "Brevo → Senders, Domains → Domains → Add domain. Klistra in den nya domänen.",
        who: "Du",
        effort: "5 min",
      },
      {
        id: "brevo-dns",
        title: "DNS-records hos din DNS-provider",
        description:
          "Brevo ger dig SPF, DKIM, DMARC records. Klistra in i loopia/one.com under DNS-inställningar.",
        who: "Du",
        effort: "20 min",
      },
      {
        id: "brevo-verify",
        title: "Vänta på Brevo-verifiering",
        description:
          "5 min - 24h propageringstid. Brevo visar grön bock när klart. Klicka 'Verify'-knappen.",
        who: "Du",
        effort: "Väntan",
      },
      {
        id: "email-from-prod",
        title: "Uppdatera EMAIL_FROM i Railway",
        description: "EMAIL_FROM=ViaEats <no-reply@dindomän.se> (eller nya namnet).",
        who: "Du",
        effort: "5 min",
      },
      {
        id: "email-test-multiple",
        title: "Testa till flera olika mottagare",
        description:
          "Skicka ett internt driftlarm och ett manuellt launchkupongmejl till Gmail, iCloud, Outlook och Hotmail. Ingen registrerings- eller lösenordsmejlning ska ske.",
        who: "Du",
        effort: "30 min",
      },
    ],
  },
  {
    id: "fas-6",
    emoji: "📱",
    title: "Fas 6 — iOS-fix + App Store-prep",
    description: "Privacy manifest, ATT, build + listing.",
    estimatedDays: "1-2 dagar",
    items: [
      {
        id: "privacy-manifest-fix",
        title: "Synka PrivacyInfo.xcprivacy med ATT-prompten",
        description:
          "Just nu Info.plist säger NSPrivacyTracking=false MEN vi har ATT-prompten wired (för närvarande disablad). Sätt rätt värden + reaktivera.",
        who: "Jag",
        effort: "1/2 dag",
      },
      {
        id: "att-reactivate",
        title: "Reaktivera requestTracking() i App.tsx",
        description:
          "Just nu utkommenterad pga PrivacyInfo-mismatch. Efter privacy-fix → aktivera igen.",
        who: "Jag",
        effort: "5 min",
      },
      {
        id: "app-icon-verify",
        title: "Verifiera app-icon är nya brand",
        description:
          "assets/icon.png ska vara nya namnets icon. Inte Expo-default. Lägg till adaptive-icon för Android.",
        who: "Du",
        effort: "30 min",
      },
      {
        id: "screenshots",
        title: "App Store-screenshots",
        description:
          "5-6 st per device-size (6.7\" iPhone 15 Pro Max, 6.5\" iPhone 11 Pro Max, ev. 5.5\" iPhone 8 Plus). Använd Figma/screenshot från enheten + Mockuup-templates.",
        who: "Du",
        effort: "1 dag",
      },
      {
        id: "appstore-listing",
        title: "App Store Connect listing",
        description:
          "Privacy URL, Support URL, Marketing URL, beskrivning (max 4000 tecken), keywords (100 tecken), kategori (Food & Drink), åldersrating.",
        who: "Du",
        effort: "1/2 dag",
      },
      {
        id: "privacy-details-appstore",
        title: "Privacy details i App Store",
        description:
          "App Store Connect → App Privacy → declare alla datatyper appen samlar (email, namn, telefon, adress, beställningshistorik, etc).",
        who: "Du",
        effort: "30 min",
      },
      {
        id: "testflight-build",
        title: "TestFlight build upload",
        description:
          "Xcode → Archive → Distribute App → App Store Connect. Vänta på processing (~15 min). Lägg till external testers.",
        who: "Du",
        effort: "1 timme",
      },
      {
        id: "testflight-beta",
        title: "TestFlight beta-test",
        description:
          "Bjud in dig själv + 3-5 vänner. Testa: registrera, beställ, refund-flow, push-notiser, tema-toggle.",
        who: "Du",
        effort: "1-2 dagar testning",
      },
    ],
  },
  {
    id: "fas-7",
    emoji: "🔍",
    title: "Fas 7 — App Review",
    description: "Submit + vänta + ev. fix + resubmit.",
    estimatedDays: "1-2 veckor väntetid",
    items: [
      {
        id: "submit-review",
        title: "Submit för App Review",
        description:
          "App Store Connect → ditt build → Submit for Review. Första respons inom 1-2 dagar.",
        who: "Du",
        effort: "5 min",
      },
      {
        id: "vanta-review",
        title: "Vänta på första respons",
        description:
          "Apple svarar 1-3 dagar. Antingen approve, in-review, eller reject med specifika punkter.",
        who: "Du",
        effort: "1-3 dagar väntan",
      },
      {
        id: "fix-rejection",
        title: "Om reject: åtgärda + resubmit",
        description:
          "Vanliga reject-orsaker: privacy-manifest-fel, krasch i specifikt flöde, inkomplett metadata eller bruten nummerverifiering. Resubmit-cykel ~1-2 dagar.",
        who: "Båda",
        effort: "Variabel",
      },
      {
        id: "schemalagg-release",
        title: "Schemalägg launch-datum",
        description:
          "Vid approve → välj 'Manual release' eller 'Automatic'. Manuellt = du kan synka med PR/marketing.",
        who: "Du",
        effort: "5 min",
      },
    ],
  },
  {
    id: "fas-8",
    emoji: "🎉",
    title: "Fas 8 — Launch-dag",
    description: "Go live, marketing, monitoring.",
    estimatedDays: "1 dag",
    items: [
      {
        id: "release-appstore",
        title: "Release i App Store",
        description:
          "App Store Connect → klicka 'Release'. Appen blir synlig i App Store inom ~30 min.",
        who: "Du",
        effort: "5 min",
      },
      {
        id: "koppla-doman",
        title: "Koppla custom domain till Vercel",
        description:
          "Vercel → Project → Settings → Domains → Add. Sätt A/CNAME records hos loopia/one.com.",
        who: "Du",
        effort: "30 min + DNS-propagering",
      },
      {
        id: "redirect-vercel-domain",
        title: "Redirecta viaeats-web-pi.vercel.app → dindomän.se",
        description:
          "Vercel hanterar automatiskt om du sätter custom domain som primary.",
        who: "Du",
        effort: "Auto",
      },
      {
        id: "marketing-posts",
        title: "Marketing — Instagram, TikTok, Facebook",
        description:
          "Lansering-posts. Visa appen i action. Använd story + reel format. Ladda upp screenshots från App Store.",
        who: "Du",
        effort: "Variabel",
      },
      {
        id: "monitoring-sentry",
        title: "Sentry-monitoring första 24h",
        description:
          "Håll Sentry öppet. Kolla alerts om något kraschar. Errors-fliken i web + RN-projekten.",
        who: "Du",
        effort: "Löpande",
      },
      {
        id: "support-redo",
        title: "Support redo att svara",
        description:
          "E-post + telefon. Förvänta dig första 24h: 'SMS-koden kommer inte', 'betalningen fastnar', 'min adress hittas inte'. Ha runbook redo.",
        who: "Du",
        effort: "Löpande",
      },
    ],
  },
];

// ─── COMPONENT ────────────────────────────────────────────────────────────────

type ItemState = {
  checked: boolean;
  note: string;
};

type StorageState = {
  items: Record<string, ItemState>;
  collapsedPhases: Record<string, boolean>;
  updatedAt: string;
};

const STORAGE_KEY = "viaeats_launch_checklist_v1";

function emptyState(): StorageState {
  return { items: {}, collapsedPhases: {}, updatedAt: new Date().toISOString() };
}

function loadState(): StorageState {
  if (typeof window === "undefined") return emptyState();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw) as StorageState;
    return {
      items: parsed.items || {},
      collapsedPhases: parsed.collapsedPhases || {},
      updatedAt: parsed.updatedAt || new Date().toISOString(),
    };
  } catch {
    return emptyState();
  }
}

function saveState(state: StorageState) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {}
}

export default function LaunchChecklistPage() {
  // Intern sida, ska inte gå att nå i produktion. Behålls i dev.
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  const [state, setState] = useState<StorageState>(emptyState);
  const [hydrated, setHydrated] = useState(false);
  const [expandedItem, setExpandedItem] = useState<string | null>(null);

  // Hydrate från localStorage efter mount (undvik SSR-mismatch)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- engångshydrering från localStorage efter mount, medvetet för att undvika SSR-mismatch
    setState(loadState());
    setHydrated(true);
  }, []);

  // Persistera vid varje state-ändring
  useEffect(() => {
    if (!hydrated) return;
    saveState(state);
  }, [state, hydrated]);

  const toggleItem = useCallback((itemId: string) => {
    setState((prev) => {
      const current = prev.items[itemId] || { checked: false, note: "" };
      return {
        ...prev,
        items: {
          ...prev.items,
          [itemId]: { ...current, checked: !current.checked },
        },
        updatedAt: new Date().toISOString(),
      };
    });
  }, []);

  const updateNote = useCallback((itemId: string, note: string) => {
    setState((prev) => {
      const current = prev.items[itemId] || { checked: false, note: "" };
      return {
        ...prev,
        items: {
          ...prev.items,
          [itemId]: { ...current, note },
        },
        updatedAt: new Date().toISOString(),
      };
    });
  }, []);

  const togglePhase = useCallback((phaseId: string) => {
    setState((prev) => ({
      ...prev,
      collapsedPhases: {
        ...prev.collapsedPhases,
        [phaseId]: !prev.collapsedPhases[phaseId],
      },
      updatedAt: new Date().toISOString(),
    }));
  }, []);

  const reset = useCallback(() => {
    if (!confirm("Återställ ALLT? All progress + alla notes raderas.")) return;
    setState(emptyState());
  }, []);

  const exportJson = useCallback(() => {
    const blob = new Blob([JSON.stringify(state, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `viaeats-checklist-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [state]);

  const importJson = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const parsed = JSON.parse(text) as StorageState;
        if (parsed.items) setState(parsed);
      } catch {
        alert("Kunde inte läsa filen, kontrollera att det är en giltig ViaEats-checklist JSON.");
      }
    };
    input.click();
  }, []);

  // ── Progress calculations ──
  const totalCount = useMemo(
    () => PHASES.reduce((sum, p) => sum + p.items.length, 0),
    [],
  );
  const checkedCount = useMemo(
    () =>
      Object.values(state.items).filter((v) => v?.checked).length,
    [state.items],
  );
  const progressPct = totalCount === 0 ? 0 : (checkedCount / totalCount) * 100;

  function phaseProgress(phase: ChecklistPhase) {
    const done = phase.items.filter((i) => state.items[i.id]?.checked).length;
    return { done, total: phase.items.length };
  }

  return (
    <div className="min-h-screen pb-24" style={{ backgroundColor: "#0b0a0f" }}>
      {/* ── Header ── */}
      <header
        className="sticky top-0 z-10 backdrop-blur-md border-b"
        style={{
          backgroundColor: "rgba(11,10,15,0.85)",
          borderColor: "rgba(240,83,28,0.18)",
        }}
      >
        <div className="max-w-3xl mx-auto px-6 py-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p
                className="text-[10px] font-black uppercase tracking-[0.3em] mb-1"
                style={{ color: "#F0531C" }}
              >
                ViaEats
              </p>
              <h1 className="text-2xl font-black tracking-tight text-white">
                Launch Checklist
              </h1>
            </div>
            <div className="flex gap-2">
              <button
                onClick={importJson}
                className="p-2.5 rounded-xl border transition-colors hover:bg-white/5"
                style={{ borderColor: "rgba(255,255,255,0.1)" }}
                title="Importera JSON"
              >
                <Upload size={14} className="text-zinc-400" />
              </button>
              <button
                onClick={exportJson}
                className="p-2.5 rounded-xl border transition-colors hover:bg-white/5"
                style={{ borderColor: "rgba(255,255,255,0.1)" }}
                title="Exportera JSON"
              >
                <Download size={14} className="text-zinc-400" />
              </button>
              <button
                onClick={reset}
                className="p-2.5 rounded-xl border transition-colors hover:bg-red-500/10"
                style={{ borderColor: "rgba(255,255,255,0.1)" }}
                title="Återställ"
              >
                <RotateCcw size={14} className="text-zinc-400" />
              </button>
            </div>
          </div>
          {/* Progress bar */}
          <div className="flex items-center gap-3">
            <div
              className="flex-1 h-2 rounded-full overflow-hidden"
              style={{ backgroundColor: "rgba(255,255,255,0.06)" }}
            >
              <div
                className="h-full transition-all duration-300"
                style={{
                  width: `${progressPct}%`,
                  background: "linear-gradient(90deg,#F0531C 0%,#FFB39B 100%)",
                }}
              />
            </div>
            <div className="text-xs font-black tabular-nums" style={{ color: "#F0531C" }}>
              {checkedCount}/{totalCount}
            </div>
          </div>
          <p className="mt-2 text-[10px] font-bold tracking-widest uppercase text-zinc-500">
            {Math.round(progressPct)}% klart
          </p>
        </div>
      </header>

      {/* ── Phases ── */}
      <main className="max-w-3xl mx-auto px-6 py-6 space-y-4">
        {PHASES.map((phase) => {
          const { done, total } = phaseProgress(phase);
          const isCollapsed = !!state.collapsedPhases[phase.id];
          const phaseDone = done === total;

          return (
            <section
              key={phase.id}
              className="rounded-2xl border overflow-hidden"
              style={{
                backgroundColor: "rgba(255,255,255,0.03)",
                borderColor: phaseDone
                  ? "rgba(240,83,28,0.4)"
                  : "rgba(255,255,255,0.08)",
              }}
            >
              {/* Phase header */}
              <button
                onClick={() => togglePhase(phase.id)}
                className="w-full px-5 py-4 flex items-center gap-3 hover:bg-white/[0.02] transition-colors"
              >
                <div className="text-2xl">{phase.emoji}</div>
                <div className="flex-1 text-left">
                  <h2 className="text-base font-black text-white">{phase.title}</h2>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    {phase.description}
                  </p>
                </div>
                <div className="text-right">
                  <div
                    className="text-xs font-black tabular-nums"
                    style={{ color: phaseDone ? "#F0531C" : "#a1a1aa" }}
                  >
                    {done}/{total}
                  </div>
                  <p className="text-[9px] uppercase tracking-wider text-zinc-600 mt-0.5">
                    {phase.estimatedDays}
                  </p>
                </div>
                {isCollapsed ? (
                  <ChevronRight size={16} className="text-zinc-500" />
                ) : (
                  <ChevronDown size={16} className="text-zinc-500" />
                )}
              </button>

              {/* Items */}
              {!isCollapsed && (
                <div className="border-t" style={{ borderColor: "rgba(255,255,255,0.05)" }}>
                  {phase.items.map((item) => {
                    const itemState = state.items[item.id] || {
                      checked: false,
                      note: "",
                    };
                    const isExpanded = expandedItem === item.id;
                    const hasNote = itemState.note.trim().length > 0;

                    return (
                      <div
                        key={item.id}
                        className="px-5 py-3 border-t first:border-t-0 transition-colors"
                        style={{
                          borderColor: "rgba(255,255,255,0.03)",
                          backgroundColor: itemState.checked
                            ? "rgba(240,83,28,0.04)"
                            : "transparent",
                        }}
                      >
                        <div className="flex items-start gap-3">
                          <button
                            onClick={() => toggleItem(item.id)}
                            className="mt-0.5 flex-shrink-0"
                            aria-label={
                              itemState.checked ? "Markera som ogjort" : "Markera som klart"
                            }
                          >
                            {itemState.checked ? (
                              <CheckCircle2 size={20} style={{ color: "#F0531C" }} />
                            ) : (
                              <Circle size={20} className="text-zinc-600" />
                            )}
                          </button>
                          <div className="flex-1 min-w-0">
                            <button
                              onClick={() =>
                                setExpandedItem(isExpanded ? null : item.id)
                              }
                              className="w-full text-left"
                            >
                              <div className="flex items-center gap-2 flex-wrap">
                                <span
                                  className={`text-sm font-bold ${itemState.checked ? "text-zinc-500 line-through" : "text-white"}`}
                                >
                                  {item.title}
                                </span>
                                <span
                                  className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded"
                                  style={{
                                    backgroundColor:
                                      item.who === "Jag"
                                        ? "rgba(96,165,250,0.15)"
                                        : item.who === "Du"
                                          ? "rgba(240,83,28,0.18)"
                                          : "rgba(74,222,128,0.15)",
                                    color:
                                      item.who === "Jag"
                                        ? "#60A5FA"
                                        : item.who === "Du"
                                          ? "#F0531C"
                                          : "#4ADE80",
                                  }}
                                >
                                  {item.who}
                                </span>
                                <span className="text-[10px] text-zinc-600 tabular-nums">
                                  {item.effort}
                                </span>
                                {hasNote && (
                                  <span title="Har anteckning">
                                    <StickyNote size={11} style={{ color: "#F0531C" }} />
                                  </span>
                                )}
                              </div>
                            </button>
                            {isExpanded && (
                              <div className="mt-3 space-y-3">
                                <p className="text-xs leading-relaxed text-zinc-400">
                                  {item.description}
                                </p>
                                <div>
                                  <p className="text-[9px] font-black uppercase tracking-widest text-zinc-500 mb-1.5">
                                    Anteckning
                                  </p>
                                  <textarea
                                    value={itemState.note}
                                    onChange={(e) =>
                                      updateNote(item.id, e.target.value)
                                    }
                                    placeholder="Skriv detaljer, datum, länkar..."
                                    rows={3}
                                    className="w-full px-3 py-2 text-xs rounded-lg outline-none focus:ring-2 transition-all resize-none"
                                    style={{
                                      backgroundColor: "rgba(0,0,0,0.4)",
                                      border: "1px solid rgba(255,255,255,0.08)",
                                      color: "#e4e4e7",
                                    }}
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                          {!isExpanded && hasNote && (
                            <p className="text-[10px] text-zinc-500 italic max-w-[40%] truncate flex-shrink-0">
                              {itemState.note.split("\n")[0]}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          );
        })}

        {/* Footer */}
        <footer className="mt-12 text-center space-y-2">
          <p className="text-[10px] text-zinc-600 tabular-nums">
            Senast uppdaterad: {hydrated ? new Date(state.updatedAt).toLocaleString("sv-SE") : "—"}
          </p>
          <p className="text-[10px] text-zinc-700">
            All data sparas i din browser (localStorage). Ingen data lämnar din enhet.
            Använd Export för backup.
          </p>
        </footer>
      </main>
    </div>
  );
}
