"use client";

import { useEffect, useState } from "react";
import { DeliveryModeBadge } from "@/shared/components/delivery-mode";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Calendar, Loader2, Plus, Store, Trash2, X } from "lucide-react";
import {
  createRestaurant,
  deleteRestaurant,
  getRestaurantDetail,
  getRestaurantOrders,
  patchRestaurant,
  restaurantsQueryKey,
  type RestaurantDetail,
  type RestaurantFormPayload,
} from "@/modules/restaurants/api";
import { Badge, Button, EmptyState, Field, Input, MetricCard, PageHeader, Select, Surface, Tabs, Textarea, Toggle } from "@/shared/components/ui";
import { ImageUploadField } from "@/shared/components/image-upload";
import { NotesPanel } from "@/shared/components/notes-panel";
import GooglePlacesInput from "@/shared/components/google-places-input";
import { useToast } from "@/shared/components/toast";
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
  featuredClass: number; isOpen: boolean; comingSoon: boolean; rating: number; ratingCount: number;
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
  featuredClass: 3, isOpen: true, comingSoon: false, rating: 4.6, ratingCount: 0,
  internalInfo: "", latitude: "", longitude: "",
  placeId: "",
  openingHours: buildDefaultHours(), logoutCode: "",
  announcementText: "", vatPercent: "",
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
  featuredClass: (d as any).featuredClass ?? 3, isOpen: d.manualIsOpen,
  comingSoon: (d as any).comingSoon ?? false,
  rating: d.rating || 0, ratingCount: d.ratingCount || 0,
  internalInfo: (d as any).internalInfo || "",
  latitude: d.latitude != null ? String(d.latitude) : "",
  longitude: d.longitude != null ? String(d.longitude) : "",
  placeId: (d as any).placeId || "",
  openingHours: parseHoursFromDetail(d.openingHours),
  logoutCode: (d as any).logoutCode || "",
  announcementText: (d as any).announcementText || "",
  vatPercent: (d as any).vatPercent != null ? String((d as any).vatPercent) : "",
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
  featuredClass: Number(f.featuredClass || 3), isOpen: f.isOpen,
  comingSoon: f.comingSoon,
  rating: Number(f.rating || 0), ratingCount: Number(f.ratingCount || 0),
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

  const saveMutation = useMutation({ meta: { toast: false },
    mutationFn: async () => {
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
      const msg = e?.response?.data?.error || "Kunde inte spara.";
      setSaveError(msg);
      showToast({ type: "error", message: msg });
    },
  });

  // Draft-toggle (agent-onboarding): draft=true göms för kunder + låses upp för
  // menyagenten (Kocken/Studion). draft=false publicerar och låser för agenten.
  // Båda riktningarna är super admin-only, servern avvisar andra.
  const setDraftMutation = useMutation({ meta: { toast: false },
    mutationFn: async (nextDraft: boolean) => patchRestaurant(restaurantId!, { draft: nextDraft }),
    onSuccess: async (_data, nextDraft) => {
      showToast({ type: "success", message: nextDraft ? "Satt till utkast (agenten kan nu jobba)" : "Restaurangen är publicerad" });
      setInitialized(false);
      await queryClient.invalidateQueries({ queryKey: restaurantsQueryKey });
      await queryClient.invalidateQueries({ queryKey: detailQueryKey(restaurantId!) });
    },
    onError: (e: any) => {
      showToast({ type: "error", message: e?.response?.data?.error || "Kunde inte ändra status." });
    },
  });

  const deleteMutation = useMutation({ meta: { toast: false },
    mutationFn: async () => { if (restaurantId) await deleteRestaurant(restaurantId); },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      await queryClient.invalidateQueries({ queryKey: restaurantsQueryKey });
      router.push("/restaurants");
    },
  });

  if (!isCreate && detail.isLoading) {
    return <div className="px-6 py-12 text-sm text-[var(--text-secondary)]">Laddar restaurang...</div>;
  }

  const detailData = detail.data;

  return (
    <div className="page-stack">
      {/* Header */}
      <PageHeader
        breadcrumb={`Restauranger / ${isCreate ? "Ny" : form.name || "Restaurang"}`}
        title={isCreate ? "Ny restaurang" : "Redigera restaurang"}
        onBack={() => router.push("/restaurants")}
        actions={
          <>
            {!isCreate && (
              <Button
                variant="danger"
                onClick={() => { if (!confirm(`Radera ${form.name}? Kan inte ångras.`)) return; deleteMutation.mutate(); }}
                disabled={deleteMutation.isPending}
              >
                <Trash2 size={14} /> Radera
              </Button>
            )}
            <Button variant="primary" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? <><Loader2 size={14} className="animate-spin" /> Sparar...</> : "Spara"}
            </Button>
          </>
        }
      />

      {!isCreate && (
        (() => {
          const isDraft = Boolean((detailData as any)?.draft);
          return (
            <div className="flex items-center justify-between gap-4 rounded-xl border border-[var(--row-divider)] px-4 py-3">
              <p className="text-sm text-[var(--text-secondary)]">
                {isDraft ? (
                  <><span className="font-bold text-[var(--text-primary)]">Utkast.</span> Göms för kunder. Menyagenten kan bygga/ändra menyn.</>
                ) : (
                  <><span className="font-bold text-[var(--text-primary)]">Publicerad.</span> Synlig för kunder. Menyagenten är låst från att ändra.</>
                )}
              </p>
              <div className="flex items-center gap-2.5 shrink-0">
                <span className="text-[12px] font-semibold" style={{ color: isDraft ? "var(--warning-text)" : "var(--success-text)" }}>
                  {isDraft ? "Utkast" : "Publicerad"}
                </span>
                <Toggle
                  checked={!isDraft}
                  disabled={setDraftMutation.isPending}
                  onChange={(nextPublished) => {
                    if (nextPublished) {
                      if (!confirm(`Publicera ${form.name}? Den blir synlig i appen och webben direkt.`)) return;
                      setDraftMutation.mutate(false);
                    } else {
                      if (!confirm(`Gör ${form.name} till utkast? Den göms för kunder och menyagenten kan börja jobba på den.`)) return;
                      setDraftMutation.mutate(true);
                    }
                  }}
                />
              </div>
            </div>
          );
        })()
      )}

      {saveError && <p className="rounded-xl bg-[rgba(239,68,68,0.1)] px-4 py-3 text-sm text-red-400">{saveError}</p>}

      {/* Tabs */}
      <Surface className="px-6 py-2">
        <Tabs
          value={tab}
          onChange={setTab}
          options={[
            { value: "info", label: "Info" },
            { value: "menu", label: "Meny" },
            { value: "orders", label: "Ordrar" },
            { value: "hours", label: "Öppettider" },
            { value: "settings", label: "Inställningar" },
          ]}
        />
      </Surface>

      {/* Info tab */}
      {tab === "info" && (
        <div className="grid gap-3.5 lg:grid-cols-[1.5fr_1fr]">
          <Surface className="px-6 py-6 grid gap-4">
            <p className="text-[15px] font-extrabold tracking-[-0.3px]">Grunduppgifter</p>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Namn"><Input value={form.name} onChange={(e) => set("name", e.target.value)} autoFocus={isCreate} /></Field>
              <Field label="Slug"><Input value={form.slug} onChange={(e) => set("slug", e.target.value)} /></Field>
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
              <Field label="Postnummer"><Input value={form.zip} onChange={(e) => set("zip", e.target.value)} /></Field>
              <Field label="Telefon"><Input value={form.phone} onChange={(e) => set("phone", e.target.value)} /></Field>
              <Field label="Kontakt-email (publik)">
                <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="kontakt@palmyrapizzeria.se" />
              </Field>
              <Field label="Admin-email"><Input value={form.adminEmail} onChange={(e) => set("adminEmail", e.target.value)} /></Field>
            </div>
            <div className="grid sm:grid-cols-2 gap-4 mt-1">
              <Field label="Legalt namn (juridisk person)">
                <Input value={form.legalName} onChange={(e) => set("legalName", e.target.value)} placeholder="ex: Palmyra Pizzeria AB" />
              </Field>
              <Field label="Organisationsnummer">
                <Input value={form.organizationNumber} onChange={(e) => set("organizationNumber", e.target.value)} placeholder="ex: 559123-4567" />
              </Field>
            </div>
            <Field label="Beskrivning">
              <Textarea value={form.description} onChange={(e) => set("description", e.target.value)} />
            </Field>
          </Surface>
          <div className="grid gap-3.5 content-start">
            <Surface className="px-6 py-6 grid gap-4">
              <p className="text-[15px] font-extrabold tracking-[-0.3px]">Bilder</p>
              <ImageUploadField label="Profilbild" kind="logo" restaurantId={restaurantId} value={form.imageUrl} onChange={(url) => set("imageUrl", url)} />
              <ImageUploadField label="Hero-bild" kind="hero" restaurantId={restaurantId} value={form.heroImageUrl} onChange={(url) => set("heroImageUrl", url)} />
            </Surface>
            <Surface className="px-6 py-6">
              <p className="text-[15px] font-extrabold tracking-[-0.3px]">Status &amp; synlighet</p>
              <div className="mt-3 flex items-center justify-between border-t border-[var(--row-divider)] py-3">
                <span className="text-[13px] font-semibold">Öppen för beställning</span>
                <Toggle checked={form.isOpen} onChange={(v) => set("isOpen", v)} />
              </div>
              <div className="flex items-center justify-between border-t border-[var(--row-divider)] py-3">
                <span className="text-[13px] font-semibold">Synlig i appen</span>
                <Toggle
                  checked={form.featuredClass !== 0}
                  onChange={(v) => set("featuredClass", v ? (form.featuredClass === 0 ? 3 : form.featuredClass) : 0)}
                />
              </div>
              <div className="flex items-center justify-between border-t border-[var(--row-divider)] py-3">
                <span className="text-[13px] font-semibold">Coming soon</span>
                <Toggle checked={form.comingSoon} onChange={(v) => set("comingSoon", v)} />
              </div>
            </Surface>
            {!isCreate && (
              <Surface className="px-6 py-5 grid grid-cols-2 gap-2.5">
                <Button variant="secondary" onClick={() => setTab("hours")}>Öppettider ›</Button>
                <Button variant="secondary" onClick={() => router.push(`/zones?restaurantId=${restaurantId}`)}>Zoner ›</Button>
              </Surface>
            )}
            {!isCreate && (
              <Surface className="px-6 py-5">
                <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-3">Fler snabbval</p>
                <div className="grid gap-2">
                  <Button variant="secondary" onClick={() => router.push(`/menu?restaurantId=${restaurantId}`)}>Hantera meny →</Button>
                  <Button variant="secondary" onClick={() => router.push(`/deals?tab=kampanjer&restaurantId=${restaurantId}`)}>Deals →</Button>
                </div>
              </Surface>
            )}
            {/* Support-anteckningar på restaurangen (super-admin-only). */}
            {!isCreate && restaurantId ? (
              <NotesPanel target={{ restaurantId }} title="Support-anteckningar" />
            ) : null}
          </div>
        </div>
      )}

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
          {/* Topbar-style actions */}
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button variant="secondary" disabled title="Avvikande dagar hanteras snart här">
              <Calendar size={14} /> Avvikelser
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                // Copy the first open day's shifts to every day, preserving each day's closed/open state.
                const source = DAYS.map(({ key }) => form.openingHours[key]).find((d) => !d.closed && d.shifts.length > 0);
                if (!source) return;
                const template = source.shifts.map((s) => ({ ...s }));
                setForm((prev) => ({
                  ...prev,
                  openingHours: DAYS.reduce((acc, { key }) => {
                    const prevDay = prev.openingHours[key];
                    acc[key] = prevDay.closed ? prevDay : { closed: false, shifts: template.map((s) => ({ ...s })) };
                    return acc;
                  }, {} as HoursForm),
                }));
              }}
            >
              Kopiera till alla dagar
            </Button>
          </div>

          <Surface className="p-0 overflow-hidden">
            {DAYS.map(({ key, label, short }, dayIdx) => {
              const day = form.openingHours[key];
              const isOpen = !day.closed;
              const isToday = key === TODAY_KEY;
              const updateDay = (next: DayHours) => setForm((prev) => ({ ...prev, openingHours: { ...prev.openingHours, [key]: next } }));
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
                        background: isToday ? "var(--accent-soft)" : "var(--bg-page)",
                        color: isToday ? "var(--accent)" : "var(--text-secondary)",
                      }}
                      title={label}
                    >
                      {short}
                    </span>
                    <Toggle
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
                        className="flex items-center gap-1 text-xs font-bold text-[var(--accent-ink)]"
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

          <div className="flex items-center gap-2 text-[var(--text-muted)]">
            <Calendar size={15} />
            <span className="text-xs font-medium">
              Tider gäller direkt. Avvikande dagar (helg, tillfälligt stängt) hanteras under Avvikelser.
            </span>
          </div>
        </div>
      )}

      {/* Settings tab */}
      {tab === "settings" && (
        <div className="grid gap-5 lg:grid-cols-2">
          <Surface className="px-6 py-6 grid gap-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Drift</p>
            <Field label="Status">
              <Select value={form.isOpen ? "open" : "closed"} onChange={(e) => set("isOpen", e.target.value === "open")}>
                <option value="open">Öppen</option>
                <option value="closed">Stängd</option>
              </Select>
            </Field>
            <div className="flex items-center justify-between rounded-xl border border-[var(--border-subtle)] px-4 py-3">
              <div>
                <p className="text-[13px] font-bold">Coming soon</p>
                <p className="mt-0.5 text-xs text-[var(--text-secondary)]">Visas dimmad i kundappen och kan inte öppnas.</p>
              </div>
              <Toggle checked={form.comingSoon} onChange={(v) => set("comingSoon", v)} />
            </div>
            <Field label="Tier (abonnemang + ranking)">
              <Select value={String(form.featuredClass)} onChange={(e) => set("featuredClass", Number(e.target.value))}>
                <option value="1">Gold</option>
                <option value="2">Silver</option>
                <option value="3">Standard</option>
                <option value="0">Dold</option>
              </Select>
            </Field>
            <div className="surface-muted px-4 py-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Leveransmodell (styr provision)</p>
                <DeliveryModeBadge selfDelivery={form.selfDelivery} />
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <Field label="Modell">
                  <Select value={form.selfDelivery ? "self" : "platform"} onChange={(e) => set("selfDelivery", e.target.value === "self")}>
                    <option value="platform">Vi levererar (20%)</option>
                    <option value="self">Levererar själv (10%)</option>
                  </Select>
                </Field>
                <Field label="Provisions-override (%)">
                  <Input type="number" min={0} max={100} placeholder="global sats" value={form.commissionPctOverride} onChange={(e) => set("commissionPctOverride", e.target.value)} />
                </Field>
              </div>
            </div>
            <div className="surface-muted px-4 py-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">ETA (leveranstid)</p>
                <Badge tone="info">{form.etaEffective} min effektiv</Badge>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <Field label="Beräknad (auto)"><Input value={form.etaCalculated != null ? `${form.etaCalculated} min` : "Default 40 min"} disabled /></Field>
                <Field label="Override"><Input type="number" min={25} max={60} placeholder="t.ex. 35" value={form.etaOverride} onChange={(e) => set("etaOverride", e.target.value)} /></Field>
              </div>
            </div>
            <Field label="Moms">
              <Select value={form.vatPercent} onChange={(e) => set("vatPercent", e.target.value)}>
                <option value="">Ingen momsrad</option>
                <option value="6">6 %</option>
                <option value="12">12 %</option>
              </Select>
            </Field>
          </Surface>
          <Surface className="px-6 py-6 grid gap-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Övrigt</p>
            <Field label="Betyg"><Input type="number" step="0.1" value={form.rating} onChange={(e) => set("rating", Number(e.target.value))} /></Field>
            <Field label="Antal betyg"><Input type="number" value={form.ratingCount} onChange={(e) => set("ratingCount", Number(e.target.value))} /></Field>
            <Field label="Logout-kod (Flutter)"><Input value={form.logoutCode} onChange={(e) => set("logoutCode", e.target.value)} placeholder="t.ex. 1234" /></Field>
            <Field label="Koordinater">
              <div className="flex gap-2">
                <Input value={form.latitude} disabled placeholder="Lat" />
                <Input value={form.longitude} disabled placeholder="Lng" />
              </div>
            </Field>
            <Field label="Intern anteckning"><Textarea value={form.internalInfo} onChange={(e) => set("internalInfo", e.target.value)} /></Field>
            <Field label="Kundinfobanner">
              <Textarea value={form.announcementText} onChange={(e) => set("announcementText", e.target.value)} placeholder="Meddelande till kund" />
            </Field>
          </Surface>
        </div>
      )}

      {/* Sticky save bar — visas vid osparade ändringar */}
      {(isDirty || isCreate) && (
        <div className="save-bar">
          <span className="save-bar-status">
            {isCreate ? "Ny restaurang" : "Osparade ändringar"}
          </span>
          <div className="flex items-center gap-2">
            {!isCreate && isDirty && (
              <Button variant="secondary" onClick={() => setForm(savedForm)} disabled={saveMutation.isPending}>
                Återställ
              </Button>
            )}
            <Button variant="primary" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? <><Loader2 size={14} className="animate-spin" /> Sparar...</> : "Spara ändringar"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
