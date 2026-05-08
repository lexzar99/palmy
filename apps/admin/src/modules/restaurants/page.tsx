"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, PencilLine, Plus, RefreshCw, Search, Store, Trash2, X } from "lucide-react";
import { createRestaurant, deleteRestaurant, deleteRestaurantLogin, getRestaurantDetail, getRestaurantLogin, getRestaurantOrders, getRestaurantOverview, patchRestaurant, restaurantsQueryKey, updateRestaurantLogin, type ControlCenterRestaurantSnapshot, type RestaurantDetail, type RestaurantFormPayload } from "@/modules/restaurants/api";
import { Badge, Button, EmptyState, ErrorPanel, Field, Input, MetricCard, Modal, PageHeader, Select, Surface, Tabs, Textarea } from "@/shared/components/ui";
import { ImageUploadField } from "@/shared/components/image-upload";
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
  const regular = (root.regular && typeof root.regular === "object") ? root.regular : root;
  if (!regular || typeof regular !== "object") return hours;

  for (const { key } of DAYS) {
    const dayData = regular[key];
    if (!dayData || typeof dayData !== "object") {
      hours[key] = { closed: true, shifts: [] };
      continue;
    }
    const shifts: Shift[] = [];
    if (Array.isArray(dayData.shifts)) {
      for (const s of dayData.shifts) {
        if (s && typeof s.open === "string" && typeof s.close === "string") {
          shifts.push({ open: s.open, close: s.close });
        }
      }
    } else if (typeof dayData.open === "string" && typeof dayData.close === "string") {
      shifts.push({ open: dayData.open, close: dayData.close });
    }
    hours[key] = {
      closed: dayData.closed === true,
      shifts: shifts.length > 0 ? shifts : (dayData.closed === true ? [] : [{ open: "11:00", close: "22:00" }]),
    };
  }
  return hours;
};

type RestaurantFormState = {
  name: string;
  slug: string;
  description: string;
  cuisine: string;
  address: string;
  city: string;
  zip: string;
  phone: string;
  adminEmail: string;
  imageUrl: string;
  heroImageUrl: string;
  etaOverride: string; // tom sträng = ingen override, annars siffra (clampas 25–55 server-side)
  etaCalculated: number | null; // read-only, från senaste 20 ordrarna
  etaEffective: number; // read-only, det kunden ser
  featuredClass: number;
  isOpen: boolean;
  rating: number;
  ratingCount: number;
  internalInfo: string;
  tags: string;
  latitude: string;
  longitude: string;
  freeDeliveryAbove: number;
  openingHours: HoursForm;
  logoutCode: string;
};

const emptyForm: RestaurantFormState = {
  name: "",
  slug: "",
  description: "",
  cuisine: "",
  address: "",
  city: "",
  zip: "",
  phone: "",
  adminEmail: "",
  imageUrl: "",
  heroImageUrl: "",
  etaOverride: "",
  etaCalculated: null,
  etaEffective: 40,
  featuredClass: 3,
  isOpen: true,
  rating: 4.6,
  ratingCount: 0,
  internalInfo: "",
  tags: "",
  latitude: "",
  longitude: "",
  freeDeliveryAbove: 0,
  openingHours: buildDefaultHours(),
  logoutCode: "",
};

const detailQueryKey = (restaurantId: string | null) => ["restaurants", "detail", restaurantId] as const;
const ordersQueryKey = (restaurantId: string | null) => ["restaurants", "orders", restaurantId] as const;

const mapDetailToForm = (detail: RestaurantDetail): RestaurantFormState => ({
  name: detail.name,
  slug: detail.slug,
  description: detail.description || "",
  cuisine: detail.cuisine || "",
  address: detail.address || "",
  city: detail.city || "",
  zip: detail.zip || "",
  phone: detail.phone || "",
  adminEmail: detail.adminEmail || "",
  imageUrl: detail.imageUrl || "",
  heroImageUrl: detail.heroImageUrl || "",
  etaOverride: detail.etaOverrideMinutes != null ? String(detail.etaOverrideMinutes) : "",
  etaCalculated: detail.etaCalculatedMinutes ?? null,
  etaEffective: detail.etaMinutes ?? 40,
  featuredClass: detail.featuredClass || 3,
  isOpen: detail.manualIsOpen,
  rating: detail.rating || 0,
  ratingCount: detail.ratingCount || 0,
  internalInfo: detail.internalInfo || "",
  tags: (detail.tags || []).join(", "),
  latitude: detail.latitude != null ? String(detail.latitude) : "",
  longitude: detail.longitude != null ? String(detail.longitude) : "",
  freeDeliveryAbove: detail.freeDeliveryAbove || 0,
  openingHours: parseHoursFromDetail(detail.openingHours),
  logoutCode: detail.logoutCode || "",
});

const mapFormToPayload = (form: RestaurantFormState): RestaurantFormPayload => ({
  name: form.name,
  slug: form.slug || undefined,
  description: form.description || null,
  cuisine: form.cuisine || undefined,
  address: form.address || undefined,
  city: form.city || undefined,
  zip: form.zip || undefined,
  phone: form.phone || undefined,
  adminEmail: form.adminEmail || undefined,
  imageUrl: form.imageUrl || null,
  heroImageUrl: form.heroImageUrl || null,
  // etaOverride tom = null (ingen override, dynamisk räknar). Annars siffra som
  // backend clampar till 25–55 min.
  etaOverrideMinutes: form.etaOverride.trim() === "" ? null : Number(form.etaOverride),
  featuredClass: Number(form.featuredClass || 3),
  isOpen: form.isOpen,
  rating: Number(form.rating || 0),
  ratingCount: Number(form.ratingCount || 0),
  internalInfo: form.internalInfo || null,
  tags: form.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
  latitude: form.latitude.trim() ? Number(form.latitude) : null,
  longitude: form.longitude.trim() ? Number(form.longitude) : null,
  freeDeliveryAbove: Number(form.freeDeliveryAbove || 0),
  openingHours: { regular: form.openingHours },
  logoutCode: form.logoutCode.trim() || null,
});

function RestaurantEditorModal({
  open,
  restaurant,
  onClose,
}: {
  open: boolean;
  restaurant: ControlCenterRestaurantSnapshot | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const isCreate = !restaurant;
  const [tab, setTab] = useState<RestaurantTab>("info");
  const [form, setForm] = useState<RestaurantFormState>(emptyForm);

  const detail = useQuery({
    queryKey: detailQueryKey(restaurant?.id || null),
    queryFn: () => getRestaurantDetail(restaurant!.id),
    enabled: open && Boolean(restaurant?.id),
  });

  const recentOrders = useQuery({
    queryKey: ordersQueryKey(restaurant?.id || null),
    queryFn: () => getRestaurantOrders(restaurant!.id),
    enabled: open && Boolean(restaurant?.id),
  });

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!open) return;
    if (isCreate) {
      setForm(emptyForm);
      setTab("info");
      return;
    }

    if (detail.data) {
      setForm(mapDetailToForm(detail.data));
    }
  }, [detail.data, isCreate, open]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = mapFormToPayload(form);
      if (restaurant?.id) {
        return patchRestaurant(restaurant.id, payload);
      }

      return createRestaurant(payload);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      await queryClient.invalidateQueries({ queryKey: ["restaurants"] });
      await queryClient.invalidateQueries({ queryKey: ["tiers"] });
      onClose();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!restaurant?.id) return;
      await deleteRestaurant(restaurant.id);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      await queryClient.invalidateQueries({ queryKey: ["restaurants"] });
      await queryClient.invalidateQueries({ queryKey: ["tiers"] });
      onClose();
    },
  });

  const detailData = detail.data;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={restaurant ? restaurant.name : "Create restaurant"}
      description={restaurant ? "Info, menu, recent orders and operational settings in one focused modal." : "Create a new partner restaurant."}
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            {restaurant ? (
              <Button variant="danger" onClick={() => deleteMutation.mutate()} disabled={deleteMutation.isPending}>
                <Trash2 size={16} /> Delete
              </Button>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={onClose}>Close</Button>
            <Button variant="primary" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <PencilLine size={16} />} Save
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-5">
        <Tabs
          value={tab}
          onChange={setTab}
          options={[
            { value: "info", label: "Info" },
            { value: "menu", label: "Menu" },
            { value: "orders", label: "Orders" },
            { value: "hours", label: "Hours" },
            { value: "settings", label: "Settings" },
            { value: "login", label: "Login" },
          ]}
        />

        {tab === "info" ? (
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Name"><Input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} /></Field>
            <Field label="Slug"><Input value={form.slug} onChange={(event) => setForm((current) => ({ ...current, slug: event.target.value }))} /></Field>
            <Field label="Cuisine"><Input value={form.cuisine} onChange={(event) => setForm((current) => ({ ...current, cuisine: event.target.value }))} /></Field>
            <Field label="City"><Input value={form.city} onChange={(event) => setForm((current) => ({ ...current, city: event.target.value }))} /></Field>
            <Field label="Address"><Input value={form.address} onChange={(event) => setForm((current) => ({ ...current, address: event.target.value }))} /></Field>
            <Field label="Zip"><Input value={form.zip} onChange={(event) => setForm((current) => ({ ...current, zip: event.target.value }))} /></Field>
            <Field label="Phone"><Input value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} /></Field>
            <Field label="Admin email"><Input value={form.adminEmail} onChange={(event) => setForm((current) => ({ ...current, adminEmail: event.target.value }))} /></Field>
            <ImageUploadField label="Profilbild" value={form.imageUrl} onChange={(url) => setForm((current) => ({ ...current, imageUrl: url }))} />
            <ImageUploadField label="Hero-bild" value={form.heroImageUrl} onChange={(url) => setForm((current) => ({ ...current, heroImageUrl: url }))} />
            <div className="md:col-span-2">
              <Field label="Description"><Textarea value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} /></Field>
            </div>
          </div>
        ) : null}

        {tab === "menu" ? (
          detail.isLoading ? (
            <div className="surface-muted px-5 py-5 text-sm text-[var(--text-secondary)]">Loading menu snapshot...</div>
          ) : detailData?.menu?.length ? (
            <div className="grid gap-3">
              <div className="grid gap-4 md:grid-cols-3">
                <MetricCard label="Categories" value={formatNumber(detailData.menu.length)} />
                <MetricCard label="Products" value={formatNumber(detailData.menu.reduce((sum, category) => sum + category.items.length, 0))} />
                <MetricCard label="Live orders" value={formatNumber(restaurant?.liveOrders || 0)} />
              </div>
              {detailData.menu.map((category) => (
                <div key={category.id} className="surface-muted px-5 py-5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-lg font-black tracking-[-0.02em]">{category.name}</p>
                      <p className="mt-1 text-sm text-[var(--text-secondary)]">{category.description || "No description"}</p>
                    </div>
                    <Badge tone="info">{category.items.length} items</Badge>
                  </div>
                  <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                    {category.items.slice(0, 6).map((item) => (
                      <div key={item.id} className="rounded-2xl border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] px-4 py-4">
                        <p className="font-black">{item.name}</p>
                        <p className="mt-1 text-sm text-[var(--text-secondary)]">{formatCurrency(item.price)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="No menu data" description="This restaurant has no categories or products yet." />
          )
        ) : null}

        {tab === "orders" ? (
          recentOrders.isLoading ? (
            <div className="surface-muted px-5 py-5 text-sm text-[var(--text-secondary)]">Loading recent orders...</div>
          ) : recentOrders.data?.length ? (
            <div className="table-shell">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Order</th>
                    <th>Customer</th>
                    <th>Status</th>
                    <th>Total</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {recentOrders.data.map((order) => (
                    <tr key={order.id}>
                      <td className="font-black">{order.orderNumber}</td>
                      <td>{order.customerName}</td>
                      <td><Badge tone={order.status === "PENDING" ? "warning" : order.status === "DELIVERED" ? "success" : "info"}>{orderStatusLabel(order.status)}</Badge></td>
                      <td>{formatCurrency(order.total)}</td>
                      <td>{formatDateTime(order.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState title="No recent orders" description="Recent restaurant order activity will appear here." />
          )
        ) : null}

        {tab === "hours" ? (
          <div className="grid gap-3">
            <p className="text-sm text-[var(--text-secondary)]">
              Sätt öppettider per dag. Lägg till flera skift om restaurangen stänger för lunchpaus.
              Ändringar sparas tillsammans med övriga fält när du trycker Save.
            </p>
            {DAYS.map(({ key, label }) => {
              const day = form.openingHours[key];
              const updateDay = (next: DayHours) =>
                setForm((current) => ({
                  ...current,
                  openingHours: { ...current.openingHours, [key]: next },
                }));
              return (
                <div key={key} className="surface-muted px-5 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-base font-black tracking-[-0.02em]">{label}</p>
                    <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                      <input
                        type="checkbox"
                        checked={day.closed}
                        onChange={(event) =>
                          updateDay({
                            closed: event.target.checked,
                            shifts: event.target.checked ? [] : (day.shifts.length ? day.shifts : [{ open: "11:00", close: "22:00" }]),
                          })
                        }
                      />
                      Stängd
                    </label>
                  </div>
                  {!day.closed ? (
                    <div className="mt-3 grid gap-2">
                      {day.shifts.map((shift, index) => (
                        <div key={index} className="flex flex-wrap items-center gap-2">
                          <Input
                            type="time"
                            value={shift.open}
                            onChange={(event) => {
                              const nextShifts = day.shifts.map((s, i) =>
                                i === index ? { ...s, open: event.target.value } : s
                              );
                              updateDay({ ...day, shifts: nextShifts });
                            }}
                            className="w-32"
                          />
                          <span className="text-[var(--text-secondary)]">–</span>
                          <Input
                            type="time"
                            value={shift.close}
                            onChange={(event) => {
                              const nextShifts = day.shifts.map((s, i) =>
                                i === index ? { ...s, close: event.target.value } : s
                              );
                              updateDay({ ...day, shifts: nextShifts });
                            }}
                            className="w-32"
                          />
                          {day.shifts.length > 1 ? (
                            <Button
                              variant="secondary"
                              onClick={() => {
                                const nextShifts = day.shifts.filter((_, i) => i !== index);
                                updateDay({ ...day, shifts: nextShifts });
                              }}
                            >
                              <X size={14} /> Ta bort skift
                            </Button>
                          ) : null}
                        </div>
                      ))}
                      <div>
                        <Button
                          variant="secondary"
                          onClick={() =>
                            updateDay({
                              ...day,
                              shifts: [...day.shifts, { open: "17:00", close: "22:00" }],
                            })
                          }
                        >
                          <Plus size={14} /> Lägg till skift
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : null}

        {tab === "settings" ? (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2 surface-muted px-5 py-4">
              <p className="text-sm leading-6 text-[var(--text-secondary)]">
                <strong>Leveransavgift och minsta ordervärde</strong> har flyttat till{" "}
                <a href="/zones" className="text-[var(--accent-strong)] underline">Zones-sidan</a>.
                Restaurang-specifika zoner åsidosätter stadens globala zoner.
              </p>
            </div>
            <div className="md:col-span-2">
              <div className="surface-muted px-5 py-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">ETA (leveranstid)</p>
                  <Badge tone="info">{form.etaEffective} min effektiv</Badge>
                </div>
                <p className="mt-2 text-sm text-[var(--text-secondary)]">
                  Räknas automatiskt ut från snittet av de senaste 20 ordrarnas tid mellan beställning och &quot;på väg&quot;.
                  Clampad till 25–55 min. Default 40 min om för få ordrar än finns.
                </p>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <Field label="Beräknad ETA (auto)">
                    <Input
                      type="text"
                      value={form.etaCalculated != null ? `${form.etaCalculated} min` : "Inte tillräckligt med ordrar (default 40 min)"}
                      disabled
                    />
                  </Field>
                  <Field label="Manuell override (lämna tom = automatisk)">
                    <Input
                      type="number"
                      min={25}
                      max={55}
                      placeholder="t.ex. 35"
                      value={form.etaOverride}
                      onChange={(event) => setForm((current) => ({ ...current, etaOverride: event.target.value }))}
                    />
                  </Field>
                </div>
              </div>
            </div>
            <Field label="Tier class"><Select value={String(form.featuredClass)} onChange={(event) => setForm((current) => ({ ...current, featuredClass: Number(event.target.value) }))}><option value="1">Gold</option><option value="2">Silver</option><option value="3">Standard</option><option value="0">Hidden</option></Select></Field>
            <Field label="Rating"><Input type="number" step="0.1" value={form.rating} onChange={(event) => setForm((current) => ({ ...current, rating: Number(event.target.value) }))} /></Field>
            <Field label="Rating count"><Input type="number" value={form.ratingCount} onChange={(event) => setForm((current) => ({ ...current, ratingCount: Number(event.target.value) }))} /></Field>
            <Field label="Free delivery above"><Input type="number" value={form.freeDeliveryAbove} onChange={(event) => setForm((current) => ({ ...current, freeDeliveryAbove: Number(event.target.value) }))} /></Field>
            <Field label="Logout code (Flutter)"><Input value={form.logoutCode} onChange={(event) => setForm((current) => ({ ...current, logoutCode: event.target.value }))} placeholder="t.ex. 1234" /></Field>
            <Field label="Latitude"><Input value={form.latitude} onChange={(event) => setForm((current) => ({ ...current, latitude: event.target.value }))} /></Field>
            <Field label="Longitude"><Input value={form.longitude} onChange={(event) => setForm((current) => ({ ...current, longitude: event.target.value }))} /></Field>
            <Field label="Tags"><Input value={form.tags} onChange={(event) => setForm((current) => ({ ...current, tags: event.target.value }))} placeholder="pizza, halal, lunch" /></Field>
            <Field label="Operational status">
              <Select value={form.isOpen ? "open" : "closed"} onChange={(event) => setForm((current) => ({ ...current, isOpen: event.target.value === "open" }))}>
                <option value="open">Open</option>
                <option value="closed">Closed</option>
              </Select>
            </Field>
            <div className="md:col-span-2">
              <Field label="Internal info"><Textarea value={form.internalInfo} onChange={(event) => setForm((current) => ({ ...current, internalInfo: event.target.value }))} /></Field>
            </div>
          </div>
        ) : null}

        {tab === "login" ? (
          restaurant?.id ? (
            <RestaurantLoginPanel restaurantId={restaurant.id} restaurantSlug={restaurant.slug} />
          ) : (
            <div className="surface-muted px-5 py-5 text-sm text-[var(--text-secondary)]">
              Spara restaurangen först innan du sätter inloggning. Användarnamnet sätts automatiskt
              till restaurangens slug om du lämnar email-fältet tomt.
            </div>
          )
        ) : null}
      </div>
    </Modal>
  );
}

function RestaurantLoginPanel({ restaurantId, restaurantSlug }: { restaurantId: string; restaurantSlug?: string }) {
  const queryClient = useQueryClient();
  const loginQuery = useQuery({
    queryKey: ["restaurants", "login", restaurantId],
    queryFn: () => getRestaurantLogin(restaurantId),
  });

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const account = loginQuery.data?.account ?? null;

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (loginQuery.data) {
      setUsername(account?.username ?? "");
      setPassword(account?.password ?? "");
      setSuccess(false);
      setError(null);
    }
  }, [loginQuery.data, account?.id, account?.username, account?.password]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const saveMutation = useMutation({
    mutationFn: () =>
      updateRestaurantLogin(restaurantId, {
        username: username.trim() || null,
        password: password.trim() || null,
      }),
    onSuccess: async (data) => {
      setSuccess(true);
      setError(null);
      // Synca state med servern.
      setUsername(data.account?.username ?? "");
      setPassword(data.account?.password ?? "");
      await queryClient.invalidateQueries({ queryKey: ["restaurants", "login", restaurantId] });
    },
    onError: (e: any) => {
      setSuccess(false);
      setError(e?.response?.data?.error || "Kunde inte spara.");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteRestaurantLogin(restaurantId),
    onSuccess: async () => {
      setUsername("");
      setPassword("");
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ["restaurants", "login", restaurantId] });
    },
    onError: (e: any) => {
      setError(e?.response?.data?.error || "Kunde inte radera kontot.");
    },
  });

  if (loginQuery.isLoading) {
    return <div className="surface-muted px-5 py-5 text-sm text-[var(--text-secondary)]">Hämtar inloggningsuppgifter...</div>;
  }

  const isCreating = !account;
  const buttonLabel = isCreating ? "Skapa konto" : "Spara ändringar";
  const placeholderUsername = restaurantSlug ? `${restaurantSlug}-pizzeria` : "användarnamn";

  return (
    <div className="grid gap-4">
      <div className="surface-muted px-5 py-4">
        <p className="text-sm leading-6 text-[var(--text-secondary)]">
          <strong>Flutter-restaurang-appen</strong> loggar in med användarnamnet och lösenordet nedan.
          Det här är restaurangens enda konto — uppdatera bara fälten och tryck Spara, så ändras både
          användarnamn och lösenord direkt i databasen.
        </p>
        {account && !account.hasPassword ? (
          <p className="mt-2 text-sm leading-6 text-amber-300">
            ⚠ Lösenordet är sparat sedan tidigare i krypterat (bcrypt) format och kan inte visas. Skriv
            in nuvarande eller nytt lösenord nedan och spara, så syns det varje gång du öppnar fliken framöver.
          </p>
        ) : null}
        {!account ? (
          <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
            Inget inloggningskonto är kopplat till restaurangen än. Fyll i användarnamn + lösenord och tryck Skapa konto.
          </p>
        ) : null}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Användarnamn (det Flutter loggar in med)">
          <Input
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder={placeholderUsername}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
        </Field>
        <Field label="Status">
          <Input
            value={account ? `${account.isActive ? "Aktivt" : "Inaktivt"} konto (${account.role})` : "Inget konto"}
            disabled
          />
        </Field>
        <div className="md:col-span-2">
          <Field label="Lösenord (klartext — visas bara för superadmin)">
            <div className="relative">
              <Input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={account?.hasPassword ? "" : "Sätt lösenord"}
              />
              <button
                type="button"
                onClick={() => setShowPassword((current) => !current)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-black uppercase tracking-[0.18em] text-[var(--text-secondary)]"
              >
                {showPassword ? "Dölj" : "Visa"}
              </button>
            </div>
          </Field>
        </div>
      </div>

      {error ? <p className="text-sm text-rose-400">{error}</p> : null}
      {success ? <p className="text-sm text-emerald-400">Sparat.</p> : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          {account ? (
            <Button
              variant="danger"
              onClick={() => {
                if (confirm(`Radera kontot ${account.username}? Flutter-appen kommer inte längre kunna logga in.`)) {
                  deleteMutation.mutate();
                }
              }}
              disabled={deleteMutation.isPending}
            >
              <Trash2 size={14} /> Radera konto
            </Button>
          ) : null}
        </div>
        <Button
          variant="primary"
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending || !username.trim() || (isCreating && !password.trim())}
        >
          {saveMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : null} {buttonLabel}
        </Button>
      </div>
    </div>
  );
}

export function RestaurantsPage() {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "open" | "attention">("all");
  const [activeRestaurant, setActiveRestaurant] = useState<ControlCenterRestaurantSnapshot | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const overview = useQuery({ queryKey: restaurantsQueryKey, queryFn: getRestaurantOverview });

  const filteredRestaurants = useMemo(() => {
    const items = overview.data || [];
    return items.filter((restaurant) => {
      const query = search.trim().toLowerCase();
      const matchesQuery =
        !query ||
        restaurant.name.toLowerCase().includes(query) ||
        restaurant.slug.toLowerCase().includes(query) ||
        (restaurant.city || "").toLowerCase().includes(query);

      const matchesFilter =
        filter === "all"
          ? true
          : filter === "open"
            ? restaurant.isOpen
            : restaurant.pendingOrders > 0 || !restaurant.hasHours || restaurant.reviewScore < 4.2;

      return matchesQuery && matchesFilter;
    });
  }, [filter, overview.data, search]);

  if (overview.isLoading) {
    return <Surface className="px-6 py-12 text-sm text-[var(--text-secondary)]">Loading restaurant operations...</Surface>;
  }

  if (overview.isError || !overview.data) {
    return (
      <ErrorPanel
        title="Restaurants could not be loaded"
        description="The overview endpoint failed to return restaurant snapshots."
        action={<Button onClick={() => void overview.refetch()}>Retry</Button>}
      />
    );
  }

  return (
    <div className="page-stack">
      <PageHeader
        title="Restaurants"
        actions={
          <>
            <Button variant="secondary" onClick={() => void overview.refetch()}>
              <RefreshCw size={13} /> Refresh
            </Button>
            <Button variant="primary" onClick={() => setCreateOpen(true)}>
              <Plus size={14} /> Add
            </Button>
          </>
        }
      />

      <Surface className="px-5 py-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full max-w-xl">
            <Search size={14} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
            <Input className="pl-10" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by name, city or slug" />
          </div>
          <Tabs
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: "All" },
              { value: "open", label: "Open" },
              { value: "attention", label: "Attention" },
            ]}
          />
        </div>

        {filteredRestaurants.length === 0 ? (
          <div className="mt-4">
            <EmptyState title="No restaurants match the current filters" />
          </div>
        ) : (
          <div className="mt-4 table-shell">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Restaurant</th>
                  <th>Status</th>
                  <th>Orders</th>
                  <th>Revenue today</th>
                  <th>Tier</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filteredRestaurants.map((restaurant) => (
                  <tr key={restaurant.id}>
                    <td>
                      <div>
                        <p className="font-black text-[var(--text-primary)]">{restaurant.name}</p>
                        <p className="mt-1 text-sm text-[var(--text-secondary)]">{restaurant.city || "No city"} • {restaurant.slug}</p>
                      </div>
                    </td>
                    <td>
                      <div className="flex flex-wrap gap-2">
                        <Badge tone={restaurant.isOpen ? "success" : "neutral"}>{restaurant.isOpen ? "Open" : "Closed"}</Badge>
                        {restaurant.pendingOrders > 0 ? <Badge tone="warning">{restaurant.pendingOrders} pending</Badge> : null}
                      </div>
                    </td>
                    <td>
                      <div className="text-sm text-[var(--text-secondary)]">
                        <div>{formatNumber(restaurant.todayOrders)} today</div>
                        <div>{formatNumber(restaurant.liveOrders)} live</div>
                      </div>
                    </td>
                    <td>{formatCurrency(restaurant.todayRevenue)}</td>
                    <td>{restaurantTierLabel(restaurant.featuredClass)}</td>
                    <td>
                      <div className="flex justify-end">
                        <Button variant="secondary" onClick={() => setActiveRestaurant(restaurant)}>
                          <Store size={16} /> Open
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Surface>

      <RestaurantEditorModal open={Boolean(activeRestaurant)} restaurant={activeRestaurant} onClose={() => setActiveRestaurant(null)} />
      <RestaurantEditorModal open={createOpen} restaurant={null} onClose={() => setCreateOpen(false)} />
    </div>
  );
}
