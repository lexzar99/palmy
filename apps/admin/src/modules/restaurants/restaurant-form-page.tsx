"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Plus, Store, Trash2, X } from "lucide-react";
import {
  createRestaurant,
  deleteRestaurant,
  deleteRestaurantLogin,
  getRestaurantDetail,
  getRestaurantLogin,
  getRestaurantOrders,
  patchRestaurant,
  restaurantsQueryKey,
  updateRestaurantLogin,
  type RestaurantDetail,
  type RestaurantFormPayload,
} from "@/modules/restaurants/api";
import { Badge, Button, EmptyState, Field, Input, MetricCard, Select, Surface, Tabs, Textarea } from "@/shared/components/ui";
import { ImageUploadField } from "@/shared/components/image-upload";
import GooglePlacesInput from "@/shared/components/google-places-input";
import { formatCurrency, formatDateTime, formatNumber, orderStatusLabel, restaurantTierLabel } from "@/shared/utils/format";

type RestaurantTab = "info" | "menu" | "orders" | "hours" | "settings" | "login";

type DayKey = "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday";
type Shift = { open: string; close: string };
type DayHours = { closed: boolean; shifts: Shift[] };
type HoursForm = Record<DayKey, DayHours>;

const DAYS: { key: DayKey; label: string }[] = [
  { key: "monday", label: "Måndag" },
  { key: "tuesday", label: "Tisdag" },
  { key: "wednesday", label: "Onsdag" },
  { key: "thursday", label: "Torsdag" },
  { key: "friday", label: "Fredag" },
  { key: "saturday", label: "Lördag" },
  { key: "sunday", label: "Söndag" },
];

const buildDefaultHours = (): HoursForm =>
  DAYS.reduce((acc, { key }) => {
    acc[key] = { closed: false, shifts: [{ open: "11:00", close: "22:00" }] };
    return acc;
  }, {} as HoursForm);

const parseHoursFromDetail = (raw: unknown): HoursForm => {
  const hours = buildDefaultHours();
  if (!raw || typeof raw !== "object") return hours;
  const root = raw as Record<string, any>;
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
  address: string; city: string; zip: string; phone: string; adminEmail: string;
  imageUrl: string; heroImageUrl: string;
  etaOverride: string; etaCalculated: number | null; etaEffective: number;
  featuredClass: number; isOpen: boolean; rating: number; ratingCount: number;
  internalInfo: string; latitude: string; longitude: string;
  placeId: string;
  openingHours: HoursForm; logoutCode: string;
  announcementText: string; vatPercent: string;
};

const emptyForm: FormState = {
  name: "", slug: "", description: "", cuisine: "",
  address: "", city: "", zip: "", phone: "", adminEmail: "",
  imageUrl: "", heroImageUrl: "",
  etaOverride: "", etaCalculated: null, etaEffective: 40,
  featuredClass: 3, isOpen: true, rating: 4.6, ratingCount: 0,
  internalInfo: "", latitude: "", longitude: "",
  placeId: "",
  openingHours: buildDefaultHours(), logoutCode: "",
  announcementText: "", vatPercent: "",
};

const mapDetailToForm = (d: RestaurantDetail): FormState => ({
  name: d.name, slug: d.slug, description: d.description || "",
  cuisine: d.cuisine || "", address: d.address || "", city: d.city || "",
  zip: d.zip || "", phone: d.phone || "", adminEmail: (d as any).adminEmail || "",
  imageUrl: d.imageUrl || "", heroImageUrl: d.heroImageUrl || "",
  etaOverride: d.etaOverrideMinutes != null ? String(d.etaOverrideMinutes) : "",
  etaCalculated: d.etaCalculatedMinutes ?? null, etaEffective: d.etaMinutes ?? 40,
  featuredClass: (d as any).featuredClass || 3, isOpen: d.manualIsOpen,
  rating: d.rating || 0, ratingCount: d.ratingCount || 0,
  internalInfo: (d as any).internalInfo || "",
  latitude: d.latitude != null ? String(d.latitude) : "",
  longitude: d.longitude != null ? String(d.longitude) : "",
  placeId: (d as any).placeId || "",
  openingHours: parseHoursFromDetail(d.openingHours),
  logoutCode: (d as any).logoutCode || "",
  announcementText: (d as any).announcementText || "",
  vatPercent: (d as any).vatPercent != null ? String((d as any).vatPercent) : "",
});

const mapFormToPayload = (f: FormState): RestaurantFormPayload => ({
  name: f.name, slug: f.slug || undefined, description: f.description || null,
  cuisine: f.cuisine || undefined, address: f.address || undefined,
  city: f.city || undefined, zip: f.zip || undefined,
  phone: f.phone || undefined, adminEmail: f.adminEmail || undefined,
  imageUrl: f.imageUrl || null, heroImageUrl: f.heroImageUrl || null,
  etaOverrideMinutes: f.etaOverride.trim() === "" ? null : Number(f.etaOverride),
  featuredClass: Number(f.featuredClass || 3), isOpen: f.isOpen,
  rating: Number(f.rating || 0), ratingCount: Number(f.ratingCount || 0),
  internalInfo: f.internalInfo || null,
  latitude: f.latitude.trim() ? Number(f.latitude) : null,
  longitude: f.longitude.trim() ? Number(f.longitude) : null,
  placeId: f.placeId.trim() || null,
  openingHours: f.openingHours,
  logoutCode: f.logoutCode.trim() || null,
  announcementText: f.announcementText.trim() || null,
  vatPercent: f.vatPercent ? Number(f.vatPercent) : null,
});

const detailQueryKey = (id: string | null) => ["restaurants", "detail", id] as const;
const ordersQueryKey = (id: string | null) => ["restaurants", "orders", id] as const;

export function RestaurantFormPage({ restaurantId }: { restaurantId?: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const isCreate = !restaurantId;
  const [tab, setTab] = useState<RestaurantTab>("info");
  const [form, setForm] = useState<FormState>(emptyForm);
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

  useEffect(() => {
    if (detail.data && !initialized) {
      setForm(mapDetailToForm(detail.data));
      setInitialized(true);
    }
  }, [detail.data, initialized]);

  const set = <K extends keyof FormState>(key: K, val: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: val }));

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = mapFormToPayload(form);
      if (restaurantId) return patchRestaurant(restaurantId, payload);
      return createRestaurant(payload);
    },
    onSuccess: async (saved) => {
      setSaveError(null);
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      await queryClient.invalidateQueries({ queryKey: restaurantsQueryKey });
      await queryClient.invalidateQueries({ queryKey: ["tiers"] });
      if (isCreate) router.push(`/restaurants/${(saved as any).id}`);
      else { setInitialized(false); void detail.refetch(); }
    },
    onError: (e: any) => setSaveError(e?.response?.data?.error || "Kunde inte spara."),
  });

  const deleteMutation = useMutation({
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
      <div className="flex items-center justify-between gap-4 px-1 flex-wrap">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.push("/restaurants")}
            className="flex items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] px-3 py-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
          >
            <ArrowLeft size={14} /> Tillbaka
          </button>
          <div className="flex items-center gap-2">
            {form.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={form.imageUrl} alt="" className="h-8 w-8 rounded-full object-cover" />
            )}
            <h1 className="text-xl font-black tracking-[-0.02em]">
              {isCreate ? "Ny restaurang" : (form.name || "Restaurang")}
            </h1>
            {!isCreate && (
              <Badge tone={form.isOpen ? "success" : "neutral"}>{form.isOpen ? "Öppen" : "Stängd"}</Badge>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
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
        </div>
      </div>

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
            { value: "login", label: "Inloggning" },
          ]}
        />
      </Surface>

      {/* Info tab */}
      {tab === "info" && (
        <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
          <Surface className="px-6 py-6 grid gap-4">
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
                    // Användaren håller på att skriva manuellt → invalidera tidigare place_id
                    // så vi inte behåller fel koordinater för en helt ny adress.
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
              <Field label="Admin-email"><Input value={form.adminEmail} onChange={(e) => set("adminEmail", e.target.value)} /></Field>
            </div>
            <Field label="Beskrivning">
              <Textarea value={form.description} onChange={(e) => set("description", e.target.value)} />
            </Field>
          </Surface>
          <div className="grid gap-4 content-start">
            <Surface className="px-6 py-6 grid gap-4">
              <ImageUploadField label="Profilbild" value={form.imageUrl} onChange={(url) => set("imageUrl", url)} />
              <ImageUploadField label="Hero-bild" value={form.heroImageUrl} onChange={(url) => set("heroImageUrl", url)} />
            </Surface>
            {!isCreate && (
              <Surface className="px-6 py-5">
                <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-3">Snabbval</p>
                <div className="grid gap-2">
                  <Button variant="secondary" onClick={() => setTab("hours")}>Öppettider →</Button>
                  <Button variant="secondary" onClick={() => setTab("login")}>Flutter-inloggning →</Button>
                  <Button variant="secondary" onClick={() => router.push(`/menu?restaurantId=${restaurantId}`)}>Hantera meny →</Button>
                  <Button variant="secondary" onClick={() => router.push(`/deals?tab=bogo`)}>BOGO-deals →</Button>
                </div>
              </Surface>
            )}
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
                      <div key={item.id} className="rounded-xl border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] px-4 py-3">
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
            <EmptyState title="Ingen meny" description="Restaurangen har inga kategorier eller produkter än." action={<Button variant="primary" onClick={() => router.push(`/menu?restaurantId=${restaurantId}`)}>Öppna menyeditor</Button>} />
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
        <Surface className="px-6 py-6 grid gap-3">
          <p className="text-sm text-[var(--text-secondary)]">Öppettider per dag. Lägg till flera skift vid lunchpaus.</p>
          {DAYS.map(({ key, label }) => {
            const day = form.openingHours[key];
            const updateDay = (next: DayHours) => setForm((prev) => ({ ...prev, openingHours: { ...prev.openingHours, [key]: next } }));
            return (
              <div key={key} className="surface-muted px-5 py-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-black">{label}</p>
                  <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)] cursor-pointer">
                    <input type="checkbox" checked={day.closed} onChange={(e) => updateDay({ closed: e.target.checked, shifts: e.target.checked ? [] : (day.shifts.length ? day.shifts : [{ open: "11:00", close: "22:00" }]) })} />
                    Stängd
                  </label>
                </div>
                {!day.closed && (
                  <div className="mt-3 grid gap-2">
                    {day.shifts.map((shift, idx) => (
                      <div key={idx} className="flex flex-wrap items-center gap-2">
                        <Input type="time" value={shift.open} onChange={(e) => updateDay({ ...day, shifts: day.shifts.map((s, i) => i === idx ? { ...s, open: e.target.value } : s) })} className="w-32" />
                        <span className="text-[var(--text-secondary)]">–</span>
                        <Input type="time" value={shift.close} onChange={(e) => updateDay({ ...day, shifts: day.shifts.map((s, i) => i === idx ? { ...s, close: e.target.value } : s) })} className="w-32" />
                        {day.shifts.length > 1 && <Button variant="secondary" onClick={() => updateDay({ ...day, shifts: day.shifts.filter((_, i) => i !== idx) })}><X size={14} /> Ta bort</Button>}
                      </div>
                    ))}
                    <Button variant="secondary" onClick={() => updateDay({ ...day, shifts: [...day.shifts, { open: "17:00", close: "22:00" }] })}><Plus size={14} /> Lägg till skift</Button>
                  </div>
                )}
              </div>
            );
          })}
        </Surface>
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
            <Field label="Tier">
              <Select value={String(form.featuredClass)} onChange={(e) => set("featuredClass", Number(e.target.value))}>
                <option value="1">Gold</option>
                <option value="2">Silver</option>
                <option value="3">Standard</option>
                <option value="0">Dold</option>
              </Select>
            </Field>
            <div className="surface-muted px-4 py-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">ETA (leveranstid)</p>
                <Badge tone="info">{form.etaEffective} min effektiv</Badge>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <Field label="Beräknad (auto)"><Input value={form.etaCalculated != null ? `${form.etaCalculated} min` : "Default 40 min"} disabled /></Field>
                <Field label="Override (lämna tom = auto)"><Input type="number" min={25} max={60} placeholder="t.ex. 35" value={form.etaOverride} onChange={(e) => set("etaOverride", e.target.value)} /></Field>
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
            {/* Latitud + Longitud sätts automatiskt av Google Places-autocomplete
                ovan i adressfältet. Visas som read-only för transparens. Tom = ingen
                adress vald än → zone-editorn faller tillbaka till stadens centrum. */}
            <Field label="Koordinater (auto från adress)">
              <div className="flex gap-2">
                <Input value={form.latitude} disabled placeholder="Lat" />
                <Input value={form.longitude} disabled placeholder="Lng" />
              </div>
            </Field>
            <Field label="Intern anteckning"><Textarea value={form.internalInfo} onChange={(e) => set("internalInfo", e.target.value)} /></Field>
            <Field label="Kundinfobanner">
              <Textarea value={form.announcementText} onChange={(e) => set("announcementText", e.target.value)} placeholder="Vi har tillfälligt stängt — öppnar igen onsdag 12 juni." />
            </Field>
          </Surface>
        </div>
      )}

      {/* Login tab */}
      {tab === "login" && (
        isCreate ? (
          <Surface className="px-6 py-6">
            <p className="text-sm text-[var(--text-secondary)]">Spara restaurangen först innan du sätter inloggning.</p>
          </Surface>
        ) : (
          <Surface className="px-6 py-6">
            <RestaurantLoginPanel restaurantId={restaurantId!} restaurantSlug={form.slug} />
          </Surface>
        )
      )}
    </div>
  );
}

function RestaurantLoginPanel({ restaurantId, restaurantSlug }: { restaurantId: string; restaurantSlug?: string }) {
  const queryClient = useQueryClient();
  const loginQuery = useQuery({ queryKey: ["restaurants", "login", restaurantId], queryFn: () => getRestaurantLogin(restaurantId) });
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const account = loginQuery.data?.account ?? null;

  useEffect(() => {
    if (loginQuery.data) { setUsername(account?.username ?? ""); setPassword(account?.password ?? ""); setSuccess(false); setError(null); }
  }, [loginQuery.data, account?.id, account?.username, account?.password]);

  const saveMutation = useMutation({
    mutationFn: () => updateRestaurantLogin(restaurantId, { username: username.trim() || null, password: password.trim() || null }),
    onSuccess: async (data) => {
      setSuccess(true); setError(null);
      setUsername(data.account?.username ?? ""); setPassword(data.account?.password ?? "");
      await queryClient.invalidateQueries({ queryKey: ["restaurants", "login", restaurantId] });
    },
    onError: (e: any) => { setSuccess(false); setError(e?.response?.data?.error || "Kunde inte spara."); },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteRestaurantLogin(restaurantId),
    onSuccess: async () => { setUsername(""); setPassword(""); setError(null); await queryClient.invalidateQueries({ queryKey: ["restaurants", "login", restaurantId] }); },
    onError: (e: any) => { setError(e?.response?.data?.error || "Kunde inte radera."); },
  });

  if (loginQuery.isLoading) return <p className="text-sm text-[var(--text-secondary)]">Hämtar inloggningsuppgifter...</p>;

  return (
    <div className="grid gap-5 max-w-lg">
      <div className="surface-muted px-5 py-4 text-sm text-[var(--text-secondary)] leading-6">
        <strong>Flutter-restaurang-appen</strong> loggar in med dessa uppgifter. Uppdatera fälten och tryck Spara.
        {account && !account.hasPassword && <p className="mt-1 text-amber-300">⚠ Lösenordet är sparat i krypterat format och kan inte visas. Skriv in nytt lösenord.</p>}
        {!account && <p className="mt-1">Inget konto är kopplat än. Fyll i och skapa.</p>}
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Användarnamn">
          <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder={restaurantSlug ? `${restaurantSlug}` : "användarnamn"} autoCapitalize="none" autoCorrect="off" spellCheck={false} />
        </Field>
        <Field label="Status">
          <Input value={account ? `${account.isActive ? "Aktivt" : "Inaktivt"} (${account.role})` : "Inget konto"} disabled />
        </Field>
      </div>
      <Field label="Lösenord">
        <div className="relative">
          <Input type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder={account?.hasPassword ? "••••••••" : "Sätt lösenord"} />
          <button type="button" onClick={() => setShowPassword((p) => !p)} className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-black uppercase tracking-wider text-[var(--text-muted)]">{showPassword ? "Dölj" : "Visa"}</button>
        </div>
      </Field>
      {error && <p className="text-sm text-rose-400">{error}</p>}
      {success && <p className="text-sm text-emerald-400">Sparat.</p>}
      <div className="flex items-center justify-between gap-2">
        {account && (
          <Button variant="danger" onClick={() => { if (confirm(`Radera kontot ${account.username}?`)) deleteMutation.mutate(); }} disabled={deleteMutation.isPending}>
            <Trash2 size={14} /> Radera konto
          </Button>
        )}
        <Button variant="primary" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !username.trim() || (!account && !password.trim())} className="ml-auto">
          {saveMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : null} {!account ? "Skapa konto" : "Spara"}
        </Button>
      </div>
    </div>
  );
}
