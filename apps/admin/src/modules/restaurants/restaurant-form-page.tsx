"use client";

import { useEffect, useState } from "react";
import { DeliveryModeBadge } from "@/shared/components/delivery-mode";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  ArrowLeft,
  ArrowRight,
  Calendar,
  Check,
  CircleCheck,
  CircleDashed,
  Contact,
  Image as ImageIcon,
  Plus,
  Save,
  Settings2,
  Star,
  Store,
  Trash2,
  X,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/shared/utils/cn";
import creamSmiley from "../../../../../Logotyp/exports/smiley-cream-transparent.png";
import brandPattern from "../../../../../Logotyp/exports/background-pattern-navy-wide.png";
import {
  createRestaurant,
  archiveRestaurant,
  getRestaurantDetail,
  getRestaurantOrders,
  patchRestaurant,
  permanentlyDeleteRestaurant,
  restaurantsQueryKey,
  type AcceptingOrdersMode,
  type RestaurantDetail,
  type RestaurantFormPayload,
} from "@/modules/restaurants/api";
import {
  Badge,
  Button,
  ConfirmDialog,
  DurationInput,
  EmptyState,
  ErrorPanel,
  Field,
  FieldGroup,
  Input,
  IntegerInput,
  LoadingPanel,
  MetricCard,
  Modal,
  NumberInput,
  PageHeader,
  PercentInput,
  Select,
  Surface,
  SwitchField,
  Tabs,
  Textarea,
  Toggle,
} from "@/shared/components/ui";
import { ImageUploadField } from "@/shared/components/image-upload";
import { NotesPanel } from "@/shared/components/notes-panel";
import { CompanyLookup } from "@/modules/restaurants/company-lookup";
import type { CompanyLookupResult } from "@/modules/restaurants/api";
import { getRestaurantDevices } from "@/modules/restaurant-devices/api";
import GooglePlacesInput from "@/shared/components/google-places-input";
import { AcceptingOrdersModeToggle, RestaurantAvailabilitySummary } from "@/shared/components/restaurant-availability";
import { useToast } from "@/shared/components/toast";
import { acceptingOrdersModeLabel } from "@/shared/contracts/restaurants";
import { formatCurrency, formatDateTime, formatNumber, orderStatusLabel, restaurantTierLabel } from "@/shared/utils/format";

type RestaurantTab = "info" | "menu" | "orders" | "hours" | "settings";

type DayKey = "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday";
type Shift = { open: string; close: string };
type DayHours = { closed: boolean; shifts: Shift[] };
type HoursForm = Record<DayKey, DayHours>;

const DAYS: { key: DayKey; label: string; short: string }[] = [
  { key: "monday", label: "Måndag", short: "Mån" },
  { key: "tuesday", label: "Tisdag", short: "Tis" },
  { key: "wednesday", label: "Onsdag", short: "Ons" },
  { key: "thursday", label: "Torsdag", short: "Tor" },
  { key: "friday", label: "Fredag", short: "Fre" },
  { key: "saturday", label: "Lördag", short: "Lör" },
  { key: "sunday", label: "Söndag", short: "Sön" },
];

// JS getDay(): 0 = Sunday .. 6 = Saturday → map to our Monday-first DayKey order.
const TODAY_KEY: DayKey = (["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as DayKey[])[new Date().getDay()];

const buildDefaultHours = (): HoursForm =>
  DAYS.reduce((acc, { key }) => {
    acc[key] = { closed: false, shifts: [{ open: "11:00", close: "22:00" }] };
    return acc;
  }, {} as HoursForm);

const toLocalDateTimeValue = (value: string | null | undefined) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
};

const parseHoursFromDetail = (raw: unknown): HoursForm => {
  const hours = buildDefaultHours();
  if (!raw) return hours;
  let parsed = raw;
  if (typeof parsed === "string") {
    try { parsed = JSON.parse(parsed); } catch { return hours; }
  }
  if (typeof parsed !== "object" || parsed === null) return hours;
  const root = parsed as Record<string, any>;
  const regular = root.regular && typeof root.regular === "object" ? root.regular : root;
  if (!regular || typeof regular !== "object") return hours;
  for (const { key } of DAYS) {
    const dayData = regular[key];
    if (!dayData || typeof dayData !== "object") { hours[key] = { closed: true, shifts: [] }; continue; }
    const shifts: Shift[] = [];
    if (Array.isArray(dayData.shifts)) {
      for (const s of dayData.shifts) {
        if (s && typeof s.open === "string" && typeof s.close === "string") shifts.push({ open: s.open, close: s.close });
      }
    } else if (typeof dayData.open === "string" && typeof dayData.close === "string") {
      shifts.push({ open: dayData.open, close: dayData.close });
    }
    hours[key] = { closed: dayData.closed === true, shifts: shifts.length > 0 ? shifts : (dayData.closed === true ? [] : [{ open: "11:00", close: "22:00" }]) };
  }
  return hours;
};

type FormState = {
  name: string; slug: string; description: string; cuisine: string;
  address: string; city: string; zip: string; phone: string; email: string; adminEmail: string;
  legalName: string; organizationNumber: string;
  imageUrl: string; heroImageUrl: string;
  etaOverride: string; etaCalculated: number | null; etaEffective: number;
  featuredClass: number; acceptingOrdersMode: AcceptingOrdersMode; comingSoon: boolean; rating: string; ratingCount: string;
  acceptingOrdersOverrideUntil: string; acceptingOrdersOverrideReason: string;
  internalInfo: string; latitude: string; longitude: string;
  placeId: string;
  openingHours: HoursForm; logoutCode: string;
  announcementText: string; vatPercent: string;
  selfDelivery: boolean; commissionPctOverride: string;
};

const emptyForm: FormState = {
  name: "", slug: "", description: "", cuisine: "",
  address: "", city: "", zip: "", phone: "", email: "", adminEmail: "",
  legalName: "", organizationNumber: "",
  imageUrl: "", heroImageUrl: "",
  etaOverride: "", etaCalculated: null, etaEffective: 40,
  featuredClass: 3, acceptingOrdersMode: "SCHEDULED", comingSoon: false, rating: "4.6", ratingCount: "0",
  acceptingOrdersOverrideUntil: "", acceptingOrdersOverrideReason: "",
  internalInfo: "", latitude: "", longitude: "",
  placeId: "",
  openingHours: buildDefaultHours(), logoutCode: "",
  announcementText: "", vatPercent: "6",
  selfDelivery: false, commissionPctOverride: "",
};

const mapDetailToForm = (d: RestaurantDetail): FormState => ({
  name: d.name, slug: d.slug, description: d.description || "",
  cuisine: d.cuisine || "", address: d.address || "", city: d.city || "",
  zip: d.zip || "", phone: d.phone || "",
  email: (d as any).email || "",
  adminEmail: (d as any).adminEmail || "",
  legalName: (d as any).legalName || "",
  organizationNumber: (d as any).organizationNumber || "",
  imageUrl: d.imageUrl || "", heroImageUrl: d.heroImageUrl || "",
  etaOverride: d.etaOverrideMinutes != null ? String(d.etaOverrideMinutes) : "",
  etaCalculated: d.etaCalculatedMinutes ?? null, etaEffective: d.etaMinutes ?? 40,
  featuredClass: (d as any).featuredClass ?? 3,
  acceptingOrdersMode: d.acceptingOrdersMode ?? "SCHEDULED",
  acceptingOrdersOverrideUntil: toLocalDateTimeValue(d.acceptingOrdersOverrideUntil),
  acceptingOrdersOverrideReason: d.acceptingOrdersOverrideReason ?? "",
  comingSoon: (d as any).comingSoon ?? false,
  rating: String(d.rating ?? 0), ratingCount: String(d.ratingCount ?? 0),
  internalInfo: (d as any).internalInfo || "",
  latitude: d.latitude != null ? String(d.latitude) : "",
  longitude: d.longitude != null ? String(d.longitude) : "",
  placeId: (d as any).placeId || "",
  openingHours: parseHoursFromDetail(d.openingHours),
  logoutCode: (d as any).logoutCode || "",
  announcementText: (d as any).announcementText || "",
  vatPercent: (d as any).vatPercent != null ? String((d as any).vatPercent) : "6",
  selfDelivery: (d as any).selfDelivery ?? false,
  commissionPctOverride: (d as any).commissionPctOverride != null ? String((d as any).commissionPctOverride) : "",
});

const mapFormToPayload = (f: FormState): RestaurantFormPayload => ({
  name: f.name, slug: f.slug || undefined, description: f.description || null,
  cuisine: f.cuisine || undefined, address: f.address || undefined,
  city: f.city || undefined, zip: f.zip || undefined,
  phone: f.phone || undefined,
  email: f.email || null,
  legalName: f.legalName || null,
  organizationNumber: f.organizationNumber || null,
  adminEmail: f.adminEmail || undefined,
  imageUrl: f.imageUrl || null, heroImageUrl: f.heroImageUrl || null,
  etaOverrideMinutes: f.etaOverride.trim() === "" ? null : Number(f.etaOverride),
  featuredClass: Number(f.featuredClass || 3),
  acceptingOrdersMode: f.acceptingOrdersMode,
  acceptingOrdersOverrideUntil:
    f.acceptingOrdersMode !== "SCHEDULED" && f.acceptingOrdersOverrideUntil
      ? new Date(f.acceptingOrdersOverrideUntil).toISOString()
      : null,
  acceptingOrdersOverrideReason:
    f.acceptingOrdersMode !== "SCHEDULED" && f.acceptingOrdersOverrideReason.trim()
      ? f.acceptingOrdersOverrideReason.trim()
      : null,
  comingSoon: f.comingSoon,
  rating: Number(f.rating.trim().replace(",", ".") || 0),
  ratingCount: Number(f.ratingCount.trim() || 0),
  internalInfo: f.internalInfo || null,
  latitude: f.latitude.trim() ? Number(f.latitude) : null,
  longitude: f.longitude.trim() ? Number(f.longitude) : null,
  placeId: f.placeId.trim() || null,
  openingHours: f.openingHours,
  logoutCode: f.logoutCode.trim() || null,
  announcementText: f.announcementText.trim() || null,
  vatPercent: f.vatPercent ? Number(f.vatPercent) : null,
  selfDelivery: f.selfDelivery,
  commissionPctOverride: f.commissionPctOverride.trim() === "" ? null : Number(f.commissionPctOverride),
});

const detailQueryKey = (id: string | null) => ["restaurants", "detail", id] as const;
const ordersQueryKey = (id: string | null) => ["restaurants", "orders", id] as const;

/** Ikonplatta i navy-tint — samma mönster som dashboard/personal. */
function SectionIcon({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-[10px] bg-[var(--brand-navy-soft)] text-[var(--brand-navy-ink)]">
      {children}
    </span>
  );
}

/** Veckoschema-redigeraren — delas av onboarding-steget och Öppettider-fliken. */
function HoursEditor({ value, onChange }: { value: HoursForm; onChange: (next: HoursForm) => void }) {
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button
          variant="secondary"
          onClick={() => {
            // Copy the first open day's shifts to every day, preserving each day's closed/open state.
            const source = DAYS.map(({ key }) => value[key]).find((d) => !d.closed && d.shifts.length > 0);
            if (!source) return;
            const template = source.shifts.map((s) => ({ ...s }));
            onChange(
              DAYS.reduce((acc, { key }) => {
                const prevDay = value[key];
                acc[key] = prevDay.closed ? prevDay : { closed: false, shifts: template.map((s) => ({ ...s })) };
                return acc;
              }, {} as HoursForm),
            );
          }}
        >
          Kopiera till alla dagar
        </Button>
      </div>

      <Surface className="overflow-hidden p-0">
        {DAYS.map(({ key, label, short }, dayIdx) => {
          const day = value[key];
          const isOpen = !day.closed;
          const isToday = key === TODAY_KEY;
          const updateDay = (next: DayHours) => onChange({ ...value, [key]: next });
          return (
            <div
              key={key}
              className="flex flex-wrap items-center justify-between gap-4 px-5 py-4"
              style={{
                borderBottom: dayIdx < DAYS.length - 1 ? "1px solid var(--row-divider)" : "none",
                opacity: isOpen ? 1 : 0.6,
              }}
            >
              <div className="flex items-center gap-3">
                <span
                  className="flex h-[42px] w-[42px] items-center justify-center rounded-[10px] text-sm font-extrabold"
                  style={{
                    fontWeight: 800,
                    background: isToday ? "var(--brand-navy-soft)" : "var(--bg-page)",
                    color: isToday ? "var(--brand-navy-ink)" : "var(--text-secondary)",
                  }}
                  title={label}
                >
                  {short}
                </span>
                <Toggle
                  ariaLabel={`${label}: ${isOpen ? "öppen" : "stängd"}`}
                  checked={isOpen}
                  onChange={(v) => updateDay({ closed: !v, shifts: v ? (day.shifts.length ? day.shifts : [{ open: "11:00", close: "22:00" }]) : [] })}
                />
              </div>

              {isOpen ? (
                <div className="flex flex-wrap items-center gap-3">
                  {day.shifts.map((shift, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <Input
                        type="time"
                        value={shift.open}
                        onChange={(e) => updateDay({ ...day, shifts: day.shifts.map((s, i) => (i === idx ? { ...s, open: e.target.value } : s)) })}
                        className="w-[120px] font-bold"
                      />
                      <span className="text-[var(--text-muted)]">–</span>
                      <Input
                        type="time"
                        value={shift.close}
                        onChange={(e) => updateDay({ ...day, shifts: day.shifts.map((s, i) => (i === idx ? { ...s, close: e.target.value } : s)) })}
                        className="w-[120px] font-bold"
                      />
                      {day.shifts.length > 1 && (
                        <button
                          type="button"
                          onClick={() => updateDay({ ...day, shifts: day.shifts.filter((_, i) => i !== idx) })}
                          aria-label="Ta bort tid"
                          className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
                        >
                          <X size={15} />
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => updateDay({ ...day, shifts: [...day.shifts, { open: "17:00", close: "22:00" }] })}
                    className="flex items-center gap-1 text-xs font-bold text-[var(--brand-navy-ink)]"
                  >
                    <Plus size={13} /> Lägg till tid
                  </button>
                </div>
              ) : (
                <span className="text-sm font-bold text-[var(--text-muted)]">Stängt</span>
              )}
            </div>
          );
        })}
      </Surface>
    </div>
  );
}

const CREATE_STEPS: Array<{ label: string; hint: string; icon: LucideIcon }> = [
  { label: "Grundinfo", hint: "Namn, adress och mattyp", icon: Store },
  { label: "Kontakt", hint: "E-post och juridik", icon: Contact },
  { label: "Bilder", hint: "Logga och omslag", icon: ImageIcon },
  { label: "Öppettider", hint: "När det går att beställa", icon: Calendar },
  { label: "Drift", hint: "Tier, leverans och moms", icon: Settings2 },
  { label: "Granska", hint: "Kontrollera och skapa", icon: CircleCheck },
];

export function RestaurantFormPage({ restaurantId }: { restaurantId?: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const isCreate = !restaurantId;
  const [tab, setTab] = useState<RestaurantTab>("info");
  const [form, setForm] = useState<FormState>(emptyForm);
  const [savedForm, setSavedForm] = useState<FormState>(emptyForm);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [permanentDeleteOpen, setPermanentDeleteOpen] = useState(false);
  const [permanentDeleteName, setPermanentDeleteName] = useState("");
  const [pendingDraftState, setPendingDraftState] = useState<boolean | null>(null);
  // Onboarding-steget för nyskapande (helsides-wizard, inte modal).
  const [createStep, setCreateStep] = useState(0);

  const detail = useQuery({
    queryKey: detailQueryKey(restaurantId || null),
    queryFn: () => getRestaurantDetail(restaurantId!),
    enabled: Boolean(restaurantId),
  });

  const recentOrders = useQuery({
    queryKey: ordersQueryKey(restaurantId || null),
    queryFn: () => getRestaurantOrders(restaurantId!),
    enabled: Boolean(restaurantId) && tab === "orders",
  });

  // Enhetsparning ingår i lanserings-checklistan.
  const devices = useQuery({
    queryKey: ["restaurants", "devices", restaurantId || null],
    queryFn: () => getRestaurantDevices(restaurantId!),
    enabled: Boolean(restaurantId),
  });

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (detail.data && !initialized) {
      const mapped = mapDetailToForm(detail.data);
      setForm(mapped);
      setSavedForm(mapped);
      setInitialized(true);
    }
  }, [detail.data, initialized]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const isDirty = JSON.stringify(form) !== JSON.stringify(savedForm);

  const set = <K extends keyof FormState>(key: K, val: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: val }));

  // Bolagsuppslaget fyller juridik + adress. Restaurangens visningsnamn och
  // redan ifyllda fält lämnas orörda — det legala namnet är sällan det namn
  // kunden känner igen.
  const applyCompany = (company: CompanyLookupResult) =>
    setForm((prev) => ({
      ...prev,
      legalName: company.legalName || prev.legalName,
      organizationNumber: company.orgNumber || prev.organizationNumber,
      name: prev.name.trim() || company.legalName || prev.name,
      address: company.street || prev.address,
      zip: company.zip || prev.zip,
      city: company.city || prev.city,
    }));

  const saveMutation = useMutation({ meta: { toast: false },
    mutationFn: async () => {
      if (!form.name.trim()) throw new Error("Restaurangen måste ha ett namn.");
      if (form.acceptingOrdersMode !== "SCHEDULED" && !form.acceptingOrdersOverrideReason.trim()) {
        throw new Error("Ange en orsak när beställningsläget åsidosätts manuellt.");
      }
      if (
        form.acceptingOrdersMode !== "SCHEDULED" &&
        form.acceptingOrdersOverrideUntil &&
        new Date(form.acceptingOrdersOverrideUntil).getTime() <= Date.now()
      ) {
        throw new Error("Sluttiden för det manuella läget måste ligga i framtiden.");
      }
      const payload = mapFormToPayload(form);
      if (restaurantId) return patchRestaurant(restaurantId, payload);
      return createRestaurant(payload);
    },
    onSuccess: async (saved) => {
      setSaveError(null);
      if (isCreate) {
        await queryClient.invalidateQueries({ queryKey: restaurantsQueryKey });
        router.push(`/restaurants/${(saved as any).id}`);
        return;
      }
      const mapped = mapDetailToForm(saved as RestaurantDetail);
      setForm(mapped);
      setSavedForm(mapped);
      showToast({ type: "success", message: "Restaurang sparad" });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: restaurantsQueryKey });
      queryClient.invalidateQueries({ queryKey: ["tiers"] });
      queryClient.invalidateQueries({ queryKey: detailQueryKey(restaurantId!) });
    },
    onError: (e: any) => {
      const msg = e?.response?.data?.error || e?.message || "Kunde inte spara.";
      setSaveError(msg);
      showToast({ type: "error", message: msg });
    },
  });

  // Draft-toggle (agent-onboarding): draft=true göms för kunder + låses upp för
  // menyagenten (Kocken/Studion). draft=false publicerar och låser för agenten.
  // Båda riktningarna är super admin-only, servern avvisar andra.
  const setDraftMutation = useMutation({ meta: { toast: false },
    mutationFn: async (nextDraft: boolean) => {
      const saved = await patchRestaurant(restaurantId!, { draft: nextDraft });
      if (Boolean(saved.draft) !== nextDraft) {
        throw new Error("Servern bekräftade inte den valda publiceringsstatusen.");
      }
      return saved;
    },
    onSuccess: async (saved, nextDraft) => {
      showToast({ type: "success", message: nextDraft ? "Satt till utkast (agenten kan nu jobba)" : "Restaurangen är publicerad" });
      // Use the mutation response immediately. Waiting for the invalidated
      // detail query made the switch look stuck and could leave the form in
      // the old draft state when the follow-up request hit a stale cache.
      const mapped = mapDetailToForm(saved as RestaurantDetail);
      setForm(mapped);
      setSavedForm(mapped);
      setInitialized(true);
      queryClient.setQueryData(detailQueryKey(restaurantId!), saved);
      await queryClient.invalidateQueries({ queryKey: restaurantsQueryKey });
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (e: any) => {
      showToast({ type: "error", message: e?.response?.data?.error || "Kunde inte ändra status." });
    },
  });

  const deleteMutation = useMutation({ meta: { toast: false },
    mutationFn: async () => { if (restaurantId) await archiveRestaurant(restaurantId); },
    onSuccess: async () => {
      showToast({ type: "success", message: "Restaurangen arkiverades. Meny- och orderhistorik är bevarad." });
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      await queryClient.invalidateQueries({ queryKey: restaurantsQueryKey });
      router.push("/restaurants");
    },
    onError: (error: any) => {
      showToast({
        type: "error",
        message: error?.response?.data?.error || "Kunde inte arkivera restaurangen.",
      });
    },
  });

  const permanentDeleteMutation = useMutation({ meta: { toast: false },
    mutationFn: async () => {
      if (!restaurantId) throw new Error("Restaurang saknas.");
      return permanentlyDeleteRestaurant(restaurantId, permanentDeleteName);
    },
    onSuccess: async (result) => {
      const r2Text = result.r2.configured
        ? ` R2: ${result.r2.deleted} objekt raderade${result.r2.failed.length ? `, ${result.r2.failed.length} misslyckades` : ""}.`
        : " R2 var inte konfigurerat.";
      showToast({ type: "success", message: `Restaurangen raderades permanent.${r2Text}` });
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      await queryClient.invalidateQueries({ queryKey: restaurantsQueryKey });
      router.push("/restaurants");
    },
    onError: (error: any) => {
      showToast({
        type: "error",
        message: error?.response?.data?.error || "Kunde inte radera restaurangen permanent.",
      });
    },
  });

  if (!isCreate && detail.isLoading) {
    return (
      <div className="page-stack">
        <PageHeader breadcrumb="Partners / Restauranger" title="Laddar restaurang" onBack={() => router.push("/restaurants")} />
        <LoadingPanel label="Laddar restaurang…" />
      </div>
    );
  }

  if (!isCreate && (detail.isError || !detail.data)) {
    return (
      <div className="page-stack">
        <PageHeader breadcrumb="Partners / Restauranger" title="Kunde inte läsa restaurangen" onBack={() => router.push("/restaurants")} />
        <ErrorPanel
          title="Restaurangdetaljen kunde inte hämtas"
          description="Statusen för utkast/publicerad visas inte förrän servern har svarat korrekt."
          action={<Button onClick={() => void detail.refetch()}>Försök igen</Button>}
        />
      </div>
    );
  }

  const detailData = detail.data;

  // ── Nyskapande: helsides-onboarding i sex steg ──
  if (isCreate) {
    const stepValid = createStep === 0 ? form.name.trim().length >= 2 : true;
    const openDays = DAYS.filter(({ key }) => !form.openingHours[key].closed && form.openingHours[key].shifts.length > 0);

    const active = CREATE_STEPS[createStep];
    return (
      <div className="onb-split">
        {/* Brandpanel med stegspår */}
        <aside className="onb-aside" style={{ backgroundImage: `url(${brandPattern.src})` }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={creamSmiley.src} alt="" className="onb-smiley" />
          <p className="onb-title">Ny restaurang</p>
          <p className="onb-sub">{form.name.trim() || "Sex snabba steg"}</p>

          <div className="onb-track">
            {CREATE_STEPS.map((step, i) => {
              const Icon = step.icon;
              const done = i < createStep;
              return (
                <button
                  key={step.label}
                  type="button"
                  disabled={i > createStep}
                  onClick={() => setCreateStep(i)}
                  className={cn("onb-track-item", i === createStep && "is-active", done && "is-done")}
                >
                  <span className="onb-track-dot">{done ? <Check size={12} /> : <Icon size={12} />}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{step.label}</span>
                  </span>
                </button>
              );
            })}
          </div>

          <div className="onb-progress">
            <div className="onb-progress-track">
              <div className="onb-progress-fill" style={{ width: `${((createStep + 1) / CREATE_STEPS.length) * 100}%` }} />
            </div>
            <p className="mt-2 text-[11.5px] font-bold text-[rgba(254,247,240,0.55)]">
              Steg {createStep + 1} av {CREATE_STEPS.length}
            </p>
          </div>
        </aside>

        {/* Formulärsidan */}
        <div className="grid content-start gap-4">
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <h1 className="page-title">{active.label}</h1>
            <p className="section-subtitle">{active.hint}</p>
          </div>
          <button type="button" className="auth-back" onClick={() => router.push("/restaurants")}>
            <X size={13} /> Avbryt
          </button>
        </div>

        <Surface className="onb-panel p-5 sm:p-7">
          {createStep === 0 && (
            <div className="grid gap-5">
              <CompanyLookup onApply={applyCompany} />
              <div className="grid gap-x-4 gap-y-4 sm:grid-cols-2">
                <Field label="Namn" required hint="Namnet kunden ser — behöver inte vara det legala."><Input value={form.name} onChange={(e) => set("name", e.target.value)} autoFocus /></Field>
                <Field label="Organisationsnummer"><Input value={form.organizationNumber} onChange={(e) => set("organizationNumber", e.target.value)} placeholder="559123-4567" /></Field>
                <Field label="Legalt namn" className="sm:col-span-2"><Input value={form.legalName} onChange={(e) => set("legalName", e.target.value)} placeholder="ex: Palmyra Pizzeria AB" /></Field>
                <Field label="Mattyp"><Input value={form.cuisine} onChange={(e) => set("cuisine", e.target.value)} placeholder="Pizza, Sushi…" /></Field>
                <Field label="Adress" className="sm:col-span-2">
                  <GooglePlacesInput
                    value={form.address}
                    currentPlaceId={form.placeId}
                    onChange={(text) => {
                      set("address", text);
                      if (form.placeId) {
                        set("placeId", "");
                        set("latitude", "");
                        set("longitude", "");
                      }
                    }}
                    onSelect={(p) => {
                      setForm((current) => ({
                        ...current,
                        address: p.address,
                        placeId: p.placeId,
                        latitude: String(p.lat),
                        longitude: String(p.lng),
                        city: p.city || current.city,
                        zip: p.postalCode || current.zip,
                      }));
                    }}
                    placeholder="Börja skriva adress…"
                  />
                </Field>
                <Field label="Stad"><Input value={form.city} onChange={(e) => set("city", e.target.value)} /></Field>
                <Field label="Postnummer"><Input inputMode="numeric" value={form.zip} onChange={(e) => set("zip", e.target.value)} /></Field>
                <Field label="Telefon"><Input type="tel" inputMode="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} /></Field>
              </div>
              <Field label="Beskrivning" optional>
                <Textarea value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="Kort och gott — visas i appen." />
              </Field>
            </div>
          )}

          {createStep === 1 && (
            <div className="grid gap-5">
              <div className="grid gap-x-4 gap-y-4 sm:grid-cols-2">
                <Field label="Kontakt-email (publik)"><Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="kontakt@restaurangen.se" /></Field>
                <Field label="Admin-email" hint="Blir restaurangens inloggning."><Input type="email" value={form.adminEmail} onChange={(e) => set("adminEmail", e.target.value)} /></Field>
                <Field label="Legalt namn" hint="Hämtat i steg 1 — ändra vid behov."><Input value={form.legalName} onChange={(e) => set("legalName", e.target.value)} placeholder="ex: Palmyra Pizzeria AB" /></Field>
                <Field label="Organisationsnummer"><Input value={form.organizationNumber} onChange={(e) => set("organizationNumber", e.target.value)} placeholder="559123-4567" /></Field>
              </div>
            </div>
          )}

          {createStep === 2 && (
            <div className="grid gap-5">
              <div className="grid gap-5 sm:grid-cols-2">
                <ImageUploadField label="Logotyp" kind="logo" restaurantId={restaurantId} value={form.imageUrl} onChange={(url) => set("imageUrl", url)} />
                <ImageUploadField label="Omslagsbild" kind="hero" restaurantId={restaurantId} value={form.heroImageUrl} onChange={(url) => set("heroImageUrl", url)} />
              </div>
            </div>
          )}

          {createStep === 3 && (
            <div className="grid gap-5">
              <HoursEditor value={form.openingHours} onChange={(h) => setForm((prev) => ({ ...prev, openingHours: h }))} />
            </div>
          )}

          {createStep === 4 && (
            <div className="grid gap-5">
              <div className="grid gap-x-4 gap-y-4 sm:grid-cols-2">
                <Field label="Tier">
                  <Select value={String(form.featuredClass)} onChange={(e) => set("featuredClass", Number(e.target.value))}>
                    <option value="1">Gold</option>
                    <option value="2">Silver</option>
                    <option value="3">Standard</option>
                  </Select>
                </Field>
                <Field label="Leveransmodell">
                  <Select value={form.selfDelivery ? "self" : "platform"} onChange={(e) => set("selfDelivery", e.target.value === "self")}>
                    <option value="platform">Vi levererar</option>
                    <option value="self">Levererar själv</option>
                  </Select>
                </Field>
                <Field label="Provisions-override" optional>
                  <PercentInput placeholder="Global sats" value={form.commissionPctOverride} onValueChange={(value) => set("commissionPctOverride", value)} />
                </Field>
                <Field label="Moms">
                  <Select value={form.vatPercent} onChange={(e) => set("vatPercent", e.target.value)}>
                    <option value="6">6 % — avhämtning/leverans</option>
                    <option value="12">12 % — restaurangtjänst</option>
                    <option value="25">25 % — standard</option>
                  </Select>
                </Field>
                <Field label="ETA-override" optional>
                  <DurationInput min={25} max={60} placeholder="35" value={form.etaOverride} onValueChange={(value) => set("etaOverride", value)} />
                </Field>
              </div>
            </div>
          )}

          {createStep === 5 && (
            <div className="grid gap-5">
              <div className="grid gap-2.5 sm:grid-cols-2">
                {[
                  ["Namn", form.name || "—"],
                  ["Mattyp", form.cuisine || "—"],
                  ["Adress", form.address || "—"],
                  ["Stad", form.city || "—"],
                  ["Kontakt", form.email || "—"],
                  ["Admin-email", form.adminEmail || "—"],
                  ["Tier", restaurantTierLabel(form.featuredClass)],
                  ["Moms", `${form.vatPercent} %`],
                  ["Leverans", form.selfDelivery ? "Levererar själv" : "Vi levererar"],
                  ["Öppettider", openDays.length > 0 ? `${openDays.length} dagar öppet` : "Inga dagar öppna"],
                  ["Logotyp", form.imageUrl ? "Uppladdad" : "Saknas"],
                  ["Omslag", form.heroImageUrl ? "Uppladdad" : "Saknas"],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-baseline justify-between gap-3 rounded-[10px] bg-[var(--bg-panel-soft)] px-4 py-3">
                    <span className="card-label">{label}</span>
                    <span className="min-w-0 truncate text-[13px] font-bold text-[var(--text-primary)]">{value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Surface>

        {saveError && <p className="field-message" role="alert">{saveError}</p>}

        <div className="flex items-center justify-between gap-2">
          <Button disabled={createStep === 0} onClick={() => setCreateStep(createStep - 1)}>
            <ArrowLeft size={14} /> Tillbaka
          </Button>
          {createStep < CREATE_STEPS.length - 1 ? (
            <Button variant="primary" disabled={!stepValid} onClick={() => setCreateStep(createStep + 1)}>
              Nästa <ArrowRight size={14} />
            </Button>
          ) : (
            <Button variant="primary" loading={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
              <Save size={14} /> Skapa restaurang
            </Button>
          )}
        </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page-stack">
      {/* Header */}
      <PageHeader
        breadcrumb={`Restauranger / ${isCreate ? "Ny" : form.name || "Restaurang"}`}
        title={isCreate ? "Ny restaurang" : "Redigera restaurang"}
        onBack={() => router.push("/restaurants")}
        actions={(
          <div className="flex flex-wrap items-center justify-end gap-2">
            {!isCreate && (
              <div className="flex items-center gap-2 rounded-[9px] border border-[var(--border-subtle)] bg-[var(--bg-panel)] px-3 py-1.5">
                <span className="text-xs font-bold text-[var(--text-secondary)]">{detailData?.draft ? "Utkast" : "Publicerad"}</span>
                <Toggle
                  ariaLabel="Ändra publiceringsstatus"
                  checked={!detailData?.draft}
                  disabled={setDraftMutation.isPending}
                  onChange={(nextPublished) => setPendingDraftState(!nextPublished)}
                />
              </div>
            )}
            {(isDirty || isCreate) ? (
              <Button variant="primary" onClick={() => saveMutation.mutate()} loading={saveMutation.isPending}>
                {!saveMutation.isPending ? <Save size={14} /> : null} Spara
              </Button>
            ) : null}
            {!isCreate ? (
              <Button variant="danger" onClick={() => setDeleteConfirmOpen(true)} disabled={deleteMutation.isPending}>
                <Archive size={14} /> Arkivera
              </Button>
            ) : null}
            {!isCreate ? (
              <Button
                variant="danger"
                onClick={() => {
                  setPermanentDeleteName("");
                  setPermanentDeleteOpen(true);
                }}
                disabled={permanentDeleteMutation.isPending}
              >
                <Trash2 size={14} /> Radera permanent
              </Button>
            ) : null}
          </div>
        )}
      />

      {/* Restaurang-hero: identitet + status + genvägar i navy */}
      {detailData ? (
        <section className="hero-card flex flex-wrap items-center gap-5" style={{ padding: "20px 24px" }}>
          {form.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={form.imageUrl} alt="" className="h-[64px] w-[64px] flex-none rounded-[16px] object-cover" style={{ boxShadow: "0 0 0 3px rgba(254,247,240,0.18)" }} />
          ) : (
            <span className="flex h-[64px] w-[64px] flex-none items-center justify-center rounded-[16px] bg-[rgba(254,247,240,0.12)] text-[22px] font-extrabold text-[var(--brand-cream)]">
              {(form.name || "?").slice(0, 1).toUpperCase()}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <h2 className="text-[19px] font-extrabold tracking-[-0.02em] text-white">{form.name || "Restaurang"}</h2>
              <span
                className="rounded-full px-2.5 py-1 text-[10.5px] font-extrabold uppercase tracking-[0.05em]"
                style={
                  detailData.draft
                    ? { background: "var(--brand-orange-soft)", color: "var(--brand-orange-ink)" }
                    : detailData.isOpen
                      ? { background: "rgba(74, 222, 128, 0.18)", color: "#86efac" }
                      : { background: "rgba(254,247,240,0.14)", color: "rgba(254,247,240,0.75)" }
                }
              >
                {detailData.draft ? "Utkast" : detailData.isOpen ? "Öppen nu" : "Stängd"}
              </span>
            </div>
            <p className="mt-1 text-[12.5px] font-medium text-[rgba(254,247,240,0.62)]">
              {[form.city, form.cuisine].filter(Boolean).join(" · ") || "—"}
            </p>
            <div className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1 text-[12px] font-semibold text-[rgba(254,247,240,0.75)]">
              <span><Star size={11} className="-mt-0.5 mr-1 inline" aria-hidden />{form.rating}</span>
              <span>{form.etaEffective} min</span>
              <span>{restaurantTierLabel(form.featuredClass)}</span>
            </div>
          </div>
          <div className="flex flex-none flex-wrap gap-2">
            <Button variant="secondary" onClick={() => router.push(`/menu?restaurantId=${restaurantId}`)}>Meny</Button>
            <Button variant="secondary" onClick={() => router.push(`/zones?restaurantId=${restaurantId}`)}>Zoner</Button>
            <Button variant="secondary" onClick={() => router.push(`/deals?tab=kampanjer&restaurantId=${restaurantId}`)}>Deals</Button>
          </div>
        </section>
      ) : null}

      {saveError && <p className="rounded-xl bg-[rgba(239,68,68,0.1)] px-4 py-3 text-sm text-red-400">{saveError}</p>}

      {/* Tabs */}
      <div className="border-b border-[var(--border-subtle)] pb-2">
        <Tabs
          value={tab}
          onChange={setTab}
          scroll
          options={[
            { value: "info", label: "Info" },
            { value: "menu", label: "Meny" },
            { value: "orders", label: "Ordrar" },
            { value: "hours", label: "Öppettider" },
            { value: "settings", label: "Inställningar" },
          ]}
        />
      </div>

      {/* Info tab — staplade sektioner: inga tomma sidokolumner */}
      {tab === "info" && (
        <div className="grid gap-4">
          {/* Lanserings-checklista som brett band */}
          {!isCreate && (() => {
            const checklist: Array<{ label: string; done: boolean; onClick?: () => void }> = [
              { label: "Namn & adress", done: Boolean(form.name.trim() && form.address.trim()) },
              { label: "Logotyp", done: Boolean(form.imageUrl) },
              { label: "Omslagsbild", done: Boolean(form.heroImageUrl) },
              { label: "Öppettider", done: DAYS.some(({ key }) => !form.openingHours[key].closed && form.openingHours[key].shifts.length > 0), onClick: () => setTab("hours") },
              { label: "Meny", done: Boolean(detailData?.menu?.length), onClick: () => router.push(`/menu?restaurantId=${restaurantId}`) },
              {
                label: "Kopplad enhet",
                done: Boolean(devices.data?.devices.some((d) => d.status === "linked")),
                onClick: () => router.push(`/restaurant-devices?restaurantId=${restaurantId}`),
              },
            ];
            const doneCount = checklist.filter((c) => c.done).length;
            const allDone = doneCount === checklist.length;
            return (
              <Surface className="px-5 py-4">
                <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
                  <div className="flex flex-none items-center gap-3">
                    <SectionIcon><CircleCheck size={16} /></SectionIcon>
                    <div>
                      <p className="text-[14px] font-extrabold tracking-[-0.3px]">Klar för lansering</p>
                      <p className="text-xs text-[var(--text-muted)]">{doneCount} av {checklist.length} klart</p>
                    </div>
                  </div>
                  <div className="min-w-[120px] flex-1">
                    <div className="progress-track">
                      <div className={cn("progress-fill", allDone && "is-leader")} style={{ width: `${(doneCount / checklist.length) * 100}%` }} />
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {checklist.map((item) => (
                      <button
                        key={item.label}
                        type="button"
                        disabled={!item.onClick}
                        onClick={item.onClick}
                        className={cn(
                          "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-bold transition-colors",
                          item.onClick && "hover:border-[var(--border-strong)]",
                        )}
                        style={{
                          cursor: item.onClick ? "pointer" : "default",
                          borderColor: item.done ? "transparent" : "var(--border-strong)",
                          background: item.done ? "var(--success-soft)" : "transparent",
                          color: item.done ? "var(--success-text)" : "var(--text-secondary)",
                        }}
                      >
                        {item.done ? <CircleCheck size={13} /> : <CircleDashed size={13} />}
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>
              </Surface>
            );
          })()}

          <Surface className="grid content-start gap-5 p-5">
            <div className="flex items-center gap-3">
              <SectionIcon><Store size={16} /></SectionIcon>
              <div>
                <p className="text-[15px] font-extrabold tracking-[-0.3px]">Grunduppgifter</p>
                <p className="mt-0.5 text-xs text-[var(--text-muted)]">Visas för kunden och används i driften.</p>
              </div>
            </div>
            <div className="grid gap-x-4 gap-y-3.5 sm:grid-cols-2 xl:grid-cols-3">
              <Field label="Namn" required><Input value={form.name} onChange={(e) => set("name", e.target.value)} autoFocus={isCreate} /></Field>
              <Field label="Slug" hint="Tomt genereras automatiskt"><Input value={form.slug} onChange={(e) => set("slug", e.target.value)} /></Field>
              <Field label="Mattyp"><Input value={form.cuisine} onChange={(e) => set("cuisine", e.target.value)} placeholder="Pizza, Sushi..." /></Field>
              <Field label="Stad"><Input value={form.city} onChange={(e) => set("city", e.target.value)} /></Field>
              <Field label="Adress (Google Places)">
                <GooglePlacesInput
                  value={form.address}
                  currentPlaceId={form.placeId}
                  onChange={(text) => {
                    set("address", text);
                    if (form.placeId) {
                      set("placeId", "");
                      set("latitude", "");
                      set("longitude", "");
                    }
                  }}
                  onSelect={(p) => {
                    setForm((current) => ({
                      ...current,
                      address: p.address,
                      placeId: p.placeId,
                      latitude: String(p.lat),
                      longitude: String(p.lng),
                      city: p.city || current.city,
                      zip: p.postalCode || current.zip,
                    }));
                  }}
                  placeholder="Börja skriva adress…"
                />
              </Field>
              <Field label="Postnummer"><Input inputMode="numeric" autoComplete="postal-code" value={form.zip} onChange={(e) => set("zip", e.target.value)} /></Field>
              <Field label="Telefon"><Input type="tel" inputMode="tel" autoComplete="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} /></Field>
            </div>
            <Field label="Beskrivning">
              <Textarea value={form.description} onChange={(e) => set("description", e.target.value)} rows={3} />
            </Field>
          </Surface>

          {/* Kontakt & juridik i egen sektion */}
          <Surface className="grid content-start gap-5 p-5">
            <div className="flex items-center gap-3">
              <SectionIcon><Contact size={16} /></SectionIcon>
              <div>
                <p className="text-[15px] font-extrabold tracking-[-0.3px]">Kontakt & juridik</p>
                <p className="mt-0.5 text-xs text-[var(--text-muted)]">Används för utbetalningar och support.</p>
              </div>
            </div>
            <CompanyLookup onApply={applyCompany} compact />
            <div className="grid gap-x-4 gap-y-3.5 sm:grid-cols-2 xl:grid-cols-4">
              <Field label="Kontakt-email (publik)">
                <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="kontakt@restaurangen.se" />
              </Field>
              <Field label="Admin-email"><Input type="email" autoComplete="email" value={form.adminEmail} onChange={(e) => set("adminEmail", e.target.value)} /></Field>
              <Field label="Legalt namn">
                <Input value={form.legalName} onChange={(e) => set("legalName", e.target.value)} placeholder="ex: Palmyra Pizzeria AB" />
              </Field>
              <Field label="Organisationsnummer">
                <Input value={form.organizationNumber} onChange={(e) => set("organizationNumber", e.target.value)} placeholder="ex: 559123-4567" />
              </Field>
            </div>
          </Surface>

          <div className="grid items-start gap-4 xl:grid-cols-2">
            <Surface className="grid content-start gap-4 p-5">
              <div className="flex items-center gap-3">
                <SectionIcon><ImageIcon size={16} /></SectionIcon>
                <p className="text-[15px] font-extrabold tracking-[-0.3px]">Media</p>
              </div>
              <ImageUploadField label="Logotyp" kind="logo" restaurantId={restaurantId} value={form.imageUrl} onChange={(url) => set("imageUrl", url)} />
              <ImageUploadField label="Omslagsbild" kind="hero" restaurantId={restaurantId} value={form.heroImageUrl} onChange={(url) => set("heroImageUrl", url)} />
            </Surface>
            <Surface className="p-5">
              <p className="text-[15px] font-extrabold tracking-[-0.3px]">Status &amp; synlighet</p>
              <div className="mt-4 grid gap-3.5">
                <Field label="Beställningsläge">
                  <AcceptingOrdersModeToggle
                    value={form.acceptingOrdersMode}
                    onValueChange={(nextMode) => {
                      set("acceptingOrdersMode", nextMode);
                      if (nextMode === "SCHEDULED") {
                        set("acceptingOrdersOverrideUntil", "");
                        set("acceptingOrdersOverrideReason", "");
                      }
                    }}
                  />
                </Field>

                {form.acceptingOrdersMode !== savedForm.acceptingOrdersMode ? (
                  <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--warning)] bg-[var(--warning-soft)] px-4 py-3 text-xs">
                    <Badge tone="warning">Osparat val</Badge>
                    <span className="font-semibold text-[var(--warning-text)]">
                      Efter sparning: {acceptingOrdersModeLabel[form.acceptingOrdersMode].toLowerCase()}
                    </span>
                  </div>
                ) : null}

                {!isCreate && detailData ? (
                  <RestaurantAvailabilitySummary
                    className="border-t border-[var(--row-divider)] pt-3"
                    isOpen={detailData.isOpen}
                    reason={detailData.availabilityReason}
                  />
                ) : null}

                {form.acceptingOrdersMode !== "SCHEDULED" ? (
                  <div className="grid gap-4 rounded-xl border border-[var(--warning)] bg-[var(--warning-soft)] p-4">
                    <Field label="Manuellt läge gäller till" hint="Tomt betyder tills du återställer till schema" optional>
                      <Input
                        type="datetime-local"
                        value={form.acceptingOrdersOverrideUntil}
                        onChange={(event) => set("acceptingOrdersOverrideUntil", event.target.value)}
                      />
                    </Field>
                    <Field label="Orsak" hint="Syns i admin och används för spårbarhet" required>
                      <Textarea
                        rows={2}
                        value={form.acceptingOrdersOverrideReason}
                        onChange={(event) => set("acceptingOrdersOverrideReason", event.target.value)}
                        placeholder="Till exempel: Restaurangen ringde och bad oss pausa beställningar"
                      />
                    </Field>
                  </div>
                ) : null}

                <div className="divide-y divide-[var(--row-divider)] border-t border-[var(--row-divider)]">
                <SwitchField
                  label="Synlig i appen"
                  checked={form.featuredClass !== 0}
                  onChange={(v) => set("featuredClass", v ? (form.featuredClass === 0 ? 3 : form.featuredClass) : 0)}
                />
                <SwitchField
                  label="Coming soon"
                  checked={form.comingSoon}
                  onChange={(v) => set("comingSoon", v)}
                />
                </div>
              </div>
            </Surface>
          </div>
        </div>
      )}

      {/* Support-anteckningar ligger under huvudlayouten så de inte skapar en
          lång, tom vänsterspalt i den primära restauranginformationen. */}
      {tab === "info" && !isCreate && restaurantId ? (
        <NotesPanel target={{ restaurantId }} title="Support-anteckningar" />
      ) : null}

      {/* Menu tab */}
      {tab === "menu" && (
        <Surface className="px-6 py-6">
          {detail.isLoading ? (
            <p className="text-sm text-[var(--text-secondary)]">Laddar meny...</p>
          ) : detailData?.menu?.length ? (
            <div className="grid gap-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <MetricCard label="Kategorier" value={formatNumber(detailData.menu.length)} />
                <MetricCard label="Produkter" value={formatNumber(detailData.menu.reduce((s, c) => s + c.items.length, 0))} />
                <Button variant="primary" onClick={() => router.push(`/menu?restaurantId=${restaurantId}`)}>
                  <Store size={14} /> Öppna menyeditor
                </Button>
              </div>
              {detailData.menu.map((cat) => (
                <div key={cat.id} className="surface-muted px-5 py-4">
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <p className="font-black text-base">{cat.name}</p>
                    <Badge tone="info">{cat.items.length} produkter</Badge>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                    {cat.items.slice(0, 6).map((item) => (
                      <div key={item.id} className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-panel-muted)] px-4 py-3">
                        <p className="font-semibold text-sm">{item.name}</p>
                        <p className="mt-1 text-xs text-[var(--text-secondary)]">{formatCurrency(item.price)}</p>
                      </div>
                    ))}
                    {cat.items.length > 6 && <div className="rounded-xl border border-[var(--border-subtle)] px-4 py-3 text-xs text-[var(--text-muted)] flex items-center">+{cat.items.length - 6} till</div>}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="Ingen meny" action={<Button variant="primary" onClick={() => router.push(`/menu?restaurantId=${restaurantId}`)}>Öppna menyeditor</Button>} />
          )}
        </Surface>
      )}

      {/* Orders tab */}
      {tab === "orders" && (
        <Surface className="px-6 py-6">
          {recentOrders.isLoading ? (
            <p className="text-sm text-[var(--text-secondary)]">Laddar ordrar...</p>
          ) : recentOrders.data?.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border-subtle)] text-left text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">
                    <th className="pb-3 pr-4">Order</th>
                    <th className="pb-3 pr-4">Kund</th>
                    <th className="pb-3 pr-4">Status</th>
                    <th className="pb-3 pr-4">Summa</th>
                    <th className="pb-3">Tid</th>
                  </tr>
                </thead>
                <tbody>
                  {recentOrders.data.map((order) => (
                    <tr key={order.id} className="border-b border-[var(--border-subtle)] last:border-0">
                      <td className="py-3 pr-4 font-black">#{order.orderNumber}</td>
                      <td className="py-3 pr-4">{order.customerName}</td>
                      <td className="py-3 pr-4">
                        <Badge tone={order.status === "PENDING" ? "warning" : order.status === "DELIVERED" ? "success" : "info"}>{orderStatusLabel(order.status)}</Badge>
                      </td>
                      <td className="py-3 pr-4">{formatCurrency(order.total)}</td>
                      <td className="py-3 text-[var(--text-muted)] text-xs">{formatDateTime(order.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState title="Inga ordrar" description="Inga senaste ordrar hittades." />
          )}
        </Surface>
      )}

      {/* Hours tab */}
      {tab === "hours" && (
        <div className="grid gap-4">
          <HoursEditor value={form.openingHours} onChange={(h) => setForm((prev) => ({ ...prev, openingHours: h }))} />
          <div className="flex items-center gap-2 text-[var(--text-muted)]">
            <Calendar size={15} />
            <span className="text-xs font-medium">
              Ändringar sparas tillsammans med restaurangen. Tillfälliga avvikelser visas först när det flödet är färdigt.
            </span>
          </div>
        </div>
      )}

      {/* Settings tab */}
      {tab === "settings" && (
        <div className="grid items-start gap-4 lg:grid-cols-2">
          <Surface className="grid content-start gap-4 p-5">
            <div className="flex items-center gap-3">
              <SectionIcon><Settings2 size={16} /></SectionIcon>
              <p className="text-[15px] font-extrabold tracking-[-0.3px]">Drift</p>
            </div>
            <Field label="Tier (abonnemang + ranking)">
              <Select value={String(form.featuredClass)} onChange={(e) => set("featuredClass", Number(e.target.value))}>
                <option value="1">Gold</option>
                <option value="2">Silver</option>
                <option value="3">Standard</option>
                <option value="0">Dold</option>
              </Select>
            </Field>
            <div className="grid gap-3.5 border-t border-[var(--row-divider)] pt-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Leveransmodell</p>
                <DeliveryModeBadge selfDelivery={form.selfDelivery} />
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Field label="Modell">
                  <Select value={form.selfDelivery ? "self" : "platform"} onChange={(e) => set("selfDelivery", e.target.value === "self")}>
                    <option value="platform">Vi levererar</option>
                    <option value="self">Levererar själv</option>
                  </Select>
                </Field>
                <Field label="Provisions-override">
                  <PercentInput placeholder="Global sats" value={form.commissionPctOverride} onValueChange={(value) => set("commissionPctOverride", value)} />
                </Field>
              </div>
            </div>
            <div className="grid gap-3.5 border-t border-[var(--row-divider)] pt-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">ETA</p>
                <Badge tone="neutral">{form.etaEffective} min effektiv</Badge>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Beräknad (auto)"><Input value={form.etaCalculated != null ? `${form.etaCalculated} min` : "Default 40 min"} disabled /></Field>
                <Field label="Override">
                  <DurationInput min={25} max={60} placeholder="35" value={form.etaOverride} onValueChange={(value) => set("etaOverride", value)} />
                </Field>
              </div>
            </div>
            <Field label="Moms">
              <Select value={form.vatPercent} onChange={(e) => set("vatPercent", e.target.value)}>
                <option value="6">6 % — mat för avhämtning/leverans</option>
                <option value="12">12 % — restaurang-/cateringtjänst</option>
                <option value="25">25 % — standardmoms</option>
              </Select>
            </Field>
          </Surface>
          <Surface className="grid content-start gap-4 p-5">
            <div className="flex items-center gap-3">
              <SectionIcon><Star size={16} /></SectionIcon>
              <p className="text-[15px] font-extrabold tracking-[-0.3px]">Övrigt</p>
            </div>
            <Field label="Betyg">
              <NumberInput min={0} max={5} step={0.1} suffix="★" value={form.rating} onValueChange={(value) => set("rating", value)} />
            </Field>
            <Field label="Antal betyg">
              <IntegerInput min={0} value={form.ratingCount} onValueChange={(value) => set("ratingCount", value)} />
            </Field>
            <Field label="Logout-kod (Flutter)"><Input type="password" inputMode="numeric" value={form.logoutCode} onChange={(e) => set("logoutCode", e.target.value)} placeholder="t.ex. 1234" /></Field>
            <FieldGroup label="Koordinater">
              <div className="flex gap-2">
                <Input value={form.latitude} disabled placeholder="Lat" />
                <Input value={form.longitude} disabled placeholder="Lng" />
              </div>
            </FieldGroup>
            <Field label="Intern anteckning"><Textarea value={form.internalInfo} onChange={(e) => set("internalInfo", e.target.value)} /></Field>
            <Field label="Kundinfobanner">
              <Textarea value={form.announcementText} onChange={(e) => set("announcementText", e.target.value)} placeholder="Meddelande till kund" />
            </Field>
          </Surface>
        </div>
      )}

      {isDirty && !isCreate ? (
        <div className="flex items-center justify-between border-t border-[var(--row-divider)] pt-3 text-xs text-[var(--text-muted)]">
          <span>Osparade ändringar</span>
          <Button className="h-8 min-h-8 text-xs" variant="secondary" onClick={() => setForm(savedForm)} disabled={saveMutation.isPending}>Återställ</Button>
        </div>
      ) : null}

      <ConfirmDialog
        open={deleteConfirmOpen}
        title={`Arkivera ${form.name || "restaurangen"}?`}
        description="Restaurangen göms och kan inte ta emot beställningar. Meny, ordrar och ekonomihistorik bevaras. Pågående ordrar måste avslutas först."
        confirmLabel="Arkivera restaurang"
        danger
        loading={deleteMutation.isPending}
        onClose={() => setDeleteConfirmOpen(false)}
        onConfirm={() => deleteMutation.mutate()}
      />

      <Modal
        open={permanentDeleteOpen}
        title={`Radera ${form.name || "restaurangen"} permanent?`}
        description="Detta tar bort restaurangen, menyn, kopplingar och R2-bilder. Restauranger med order- eller utbetalningshistorik blockeras och ska arkiveras istället."
        size="sm"
        onClose={() => {
          if (permanentDeleteMutation.isPending) return;
          setPermanentDeleteOpen(false);
        }}
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              onClick={() => setPermanentDeleteOpen(false)}
              disabled={permanentDeleteMutation.isPending}
            >
              Avbryt
            </Button>
            <Button
              type="button"
              variant="danger"
              loading={permanentDeleteMutation.isPending}
              disabled={permanentDeleteName !== form.name || !form.name}
              onClick={() => permanentDeleteMutation.mutate()}
            >
              Radera permanent
            </Button>
          </div>
        }
      >
        <div className="grid gap-4">
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            Den här åtgärden går inte att ångra. Skriv restaurangens namn exakt för att bekräfta.
          </div>
          <Field label="Bekräfta med exakt namn">
            <Input
              autoFocus
              value={permanentDeleteName}
              onChange={(event) => setPermanentDeleteName(event.target.value)}
              placeholder={form.name}
              autoComplete="off"
            />
          </Field>
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-panel-muted)] px-4 py-3 text-xs text-[var(--text-secondary)]">
            Exakt namn: <span className="font-black text-[var(--text-primary)]">{form.name}</span>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={pendingDraftState !== null}
        title={pendingDraftState ? "Gör restaurangen till utkast?" : "Publicera restaurangen?"}
        description={pendingDraftState ? "Restaurangen göms för kunder tills den publiceras igen." : "Restaurangen blir synlig i appen och webben direkt."}
        confirmLabel={pendingDraftState ? "Gör till utkast" : "Publicera"}
        loading={setDraftMutation.isPending}
        onClose={() => setPendingDraftState(null)}
        onConfirm={() => {
          if (pendingDraftState === null) return;
          setDraftMutation.mutate(pendingDraftState, { onSettled: () => setPendingDraftState(null) });
        }}
      />
    </div>
  );
}
