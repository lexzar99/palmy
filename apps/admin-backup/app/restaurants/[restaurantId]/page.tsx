"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import axios from "axios";
import {
  ArrowLeft,
  ImageIcon,
  Loader2,
  MapPin,
  RefreshCw,
  Save,
  ShieldCheck,
  Store,
  ToggleLeft,
  ToggleRight,
  Upload,
} from "lucide-react";
import { Modal } from "@/components/Modal";
import { useToast } from "@/components/Toast";
import { API_URL } from "@/lib/api";
import { getStoredToken } from "@/lib/auth-storage";

type EditorModal = "profile" | "business" | "hours" | "ops" | null;
type SavingKey = "profile" | "business" | "hours" | "ops" | "status" | null;

type DayHours = {
  open: string;
  close: string;
  closed: boolean;
  open2?: string;
  close2?: string;
  shift2?: boolean;
};

type RestaurantData = {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  cuisine?: string | null;
  address?: string | null;
  city?: string | null;
  zip?: string | null;
  phone?: string | null;
  imageUrl?: string | null;
  heroImageUrl?: string | null;
  internalInfo?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  deliveryFee: number;
  minOrderAmount: number;
  etaMinutes: number;
  baseEtaMinutes?: number;
  isOpen: boolean;
  manualIsOpen?: boolean;
  featuredClass?: number;
  openingHours?: Record<string, DayHours>;
  rating?: number;
  updatedAt?: string;
};

type OrderSummary = {
  id: string;
  orderNumber: string;
  status: string;
  customerName: string;
  total: number;
  createdAt: string;
};

const DAYS = [
  { key: "monday", label: "Måndag" },
  { key: "tuesday", label: "Tisdag" },
  { key: "wednesday", label: "Onsdag" },
  { key: "thursday", label: "Torsdag" },
  { key: "friday", label: "Fredag" },
  { key: "saturday", label: "Lördag" },
  { key: "sunday", label: "Söndag" },
] as const;

const DEFAULT_HOURS: DayHours = {
  open: "11:00",
  close: "21:00",
  closed: false,
  shift2: false,
  open2: "17:00",
  close2: "21:00",
};

const FEATURED_OPTIONS = [
  { value: 1, label: "Guld", description: "Högst exponering" },
  { value: 2, label: "Silver", description: "Mellan" },
  { value: 3, label: "Standard", description: "Normal listning" },
  { value: 0, label: "Dold", description: "Visas inte publikt" },
] as const;

const ORDER_STATUS_LABELS: Record<string, string> = {
  PENDING: "Ny",
  ACCEPTED: "Bekräftad",
  PREPARING: "Tillagas",
  READY: "Klar",
  DELIVERING: "På väg",
  DELIVERED: "Levererad",
  CANCELLED: "Avbokad",
  REJECTED: "Nekad",
};

const currency = (value: number) => `${Math.round(value).toLocaleString("sv-SE")} kr`;

const relativeDate = (value: string) =>
  new Intl.DateTimeFormat("sv-SE", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));

const fieldClass = "control-input";

const formatDayHours = (hours?: DayHours) => {
  if (!hours || hours.closed) return "Stängt";
  const base = `${hours.open} - ${hours.close}`;
  if (hours.shift2 && hours.open2 && hours.close2) {
    return `${base}, ${hours.open2} - ${hours.close2}`;
  }
  return base;
};

function ModalActions({
  onClose,
  onSave,
  loading,
  saveLabel,
}: {
  onClose: () => void;
  onSave: () => void;
  loading: boolean;
  saveLabel: string;
}) {
  return (
    <div className="mt-6 flex flex-col-reverse gap-3 border-t border-[var(--border-subtle)] pt-6 sm:flex-row sm:justify-end">
      <button type="button" onClick={onClose} className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--panel-muted)] px-5 py-3 text-[11px] font-black uppercase tracking-[0.22em] text-[var(--text-secondary)]">
        Avbryt
      </button>
      <button type="button" onClick={onSave} disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gold-gradient px-5 py-3 text-[11px] font-black uppercase tracking-[0.22em] text-[#091018] disabled:opacity-60">
        <Save size={14} /> {loading ? "Sparar..." : saveLabel}
      </button>
    </div>
  );
}

function SectionCard({
  title,
  eyebrow,
  action,
  children,
}: {
  title: string;
  eyebrow: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <article className="panel rounded-[28px] px-5 py-5 sm:px-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.28em] text-[var(--text-muted)]">{eyebrow}</p>
          <h2 className="mt-2 text-2xl font-black tracking-[-0.04em] text-[var(--text-primary)]">{title}</h2>
        </div>
        {action}
      </div>
      <div className="mt-5">{children}</div>
    </article>
  );
}

export default function RestaurantDetailPage({ params }: { params: Promise<{ restaurantId: string }> }) {
  const { restaurantId } = use(params);
  const router = useRouter();
  const { success, error: toastError } = useToast();

  const [restaurant, setRestaurant] = useState<RestaurantData | null>(null);
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeModal, setActiveModal] = useState<EditorModal>(null);
  const [savingKey, setSavingKey] = useState<SavingKey>(null);
  const [uploadingImage, setUploadingImage] = useState<"imageUrl" | "heroImageUrl" | null>(null);

  const [profile, setProfile] = useState({
    name: "",
    description: "",
    cuisine: "",
    address: "",
    city: "",
    zip: "",
    phone: "",
    imageUrl: "",
    heroImageUrl: "",
    internalInfo: "",
    latitude: "",
    longitude: "",
  });
  const [businessForm, setBusinessForm] = useState({ slug: "", adminPassword: "" });
  const [opsForm, setOpsForm] = useState({ etaMinutes: 30, featuredClass: 3 });
  const [openingHours, setOpeningHours] = useState<Record<string, DayHours>>(
    DAYS.reduce((acc, day) => ({ ...acc, [day.key]: { ...DEFAULT_HOURS } }), {} as Record<string, DayHours>)
  );
  const [isOpen, setIsOpen] = useState(true);

  const populateState = useCallback((data: RestaurantData) => {
    setRestaurant(data);
    setIsOpen(data.manualIsOpen ?? data.isOpen ?? true);
    setProfile({
      name: data.name || "",
      description: data.description || "",
      cuisine: data.cuisine || "",
      address: data.address || "",
      city: data.city || "",
      zip: data.zip || "",
      phone: data.phone || "",
      imageUrl: data.imageUrl || "",
      heroImageUrl: data.heroImageUrl || "",
      internalInfo: data.internalInfo || "",
      latitude: data.latitude != null ? String(data.latitude) : "",
      longitude: data.longitude != null ? String(data.longitude) : "",
    });
    setBusinessForm({ slug: data.slug || "", adminPassword: "" });
    setOpsForm({
      etaMinutes: data.baseEtaMinutes ?? data.etaMinutes ?? 30,
      featuredClass: data.featuredClass ?? 3,
    });
    setOpeningHours(
      DAYS.reduce(
        (acc, day) => ({
          ...acc,
          [day.key]: data.openingHours?.[day.key] ? { ...DEFAULT_HOURS, ...data.openingHours[day.key] } : { ...DEFAULT_HOURS },
        }),
        {} as Record<string, DayHours>
      )
    );
  }, []);

  const fetchAll = useCallback(async () => {
    const token = getStoredToken();
    if (!token) {
      router.replace("/login");
      return;
    }

    setLoading(true);

    try {
      const [restaurantResult, ordersResult] = await Promise.allSettled([
        axios.get(`${API_URL}/api/restaurants/${restaurantId}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        axios.get(`${API_URL}/api/admin/orders?limit=20&restaurantId=${restaurantId}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      if (restaurantResult.status === "fulfilled") {
        populateState(restaurantResult.value.data as RestaurantData);
      } else {
        setRestaurant(null);
      }

      if (ordersResult.status === "fulfilled") {
        const nextOrders = ((ordersResult.value.data.orders || []) as OrderSummary[]).sort(
          (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
        );
        setOrders(nextOrders);
      } else {
        setOrders([]);
      }
    } catch {
      toastError("Kunde inte ladda restaurangdata.");
    } finally {
      setLoading(false);
    }
  }, [populateState, restaurantId, router, toastError]);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  const patchRestaurant = useCallback(
    async (key: Exclude<SavingKey, "status" | null>, payload: Record<string, unknown>) => {
      const token = getStoredToken();
      if (!token) {
        router.replace("/login");
        return false;
      }

      setSavingKey(key);
      try {
        await axios.patch(`${API_URL}/api/restaurants/${restaurantId}`, payload, {
          headers: { Authorization: `Bearer ${token}` },
        });
        await fetchAll();
        return true;
      } catch (err: any) {
        toastError(err.response?.data?.error || "Kunde inte spara ändringen.");
        return false;
      } finally {
        setSavingKey(null);
      }
    },
    [fetchAll, restaurantId, router, toastError]
  );

  const toggleOpen = async () => {
    const token = getStoredToken();
    if (!token) {
      router.replace("/login");
      return;
    }

    setSavingKey("status");
    try {
      const nextValue = !isOpen;
      await axios.patch(
        `${API_URL}/api/restaurants/${restaurantId}`,
        { isOpen: nextValue },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setIsOpen(nextValue);
      await fetchAll();
      success(nextValue ? "Restaurangen markerades som öppen." : "Restaurangen markerades som stängd.");
    } catch (err: any) {
      toastError(err.response?.data?.error || "Kunde inte ändra öppetstatus.");
    } finally {
      setSavingKey(null);
    }
  };

  const saveProfile = async () => {
    const ok = await patchRestaurant("profile", {
      ...profile,
      latitude: profile.latitude ? Number(profile.latitude) : null,
      longitude: profile.longitude ? Number(profile.longitude) : null,
    });
    if (ok) {
      success("Profilen sparades.");
      setActiveModal(null);
    }
  };

  const saveBusiness = async () => {
    if (businessForm.adminPassword && businessForm.adminPassword.length < 6) {
      toastError("Lösenordet måste vara minst 6 tecken.");
      return;
    }

    const ok = await patchRestaurant("business", {
      slug: businessForm.slug,
      adminPassword: businessForm.adminPassword || undefined,
    });
    if (ok) {
      success("Business-inloggningen uppdaterades.");
      setActiveModal(null);
    }
  };

  const saveHours = async () => {
    const ok = await patchRestaurant("hours", { openingHours });
    if (ok) {
      success("Öppettiderna sparades.");
      setActiveModal(null);
    }
  };

  const saveOps = async () => {
    const ok = await patchRestaurant("ops", {
      etaMinutes: opsForm.etaMinutes,
      featuredClass: opsForm.featuredClass,
    });
    if (ok) {
      success("Driftinställningarna sparades.");
      setActiveModal(null);
    }
  };

  const uploadImage = async (file: File, field: "imageUrl" | "heroImageUrl") => {
    const token = getStoredToken();
    if (!token) {
      router.replace("/login");
      return;
    }

    setUploadingImage(field);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await axios.post(`${API_URL}/api/admin/upload`, formData, {
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "multipart/form-data" },
      });
      setProfile((previous) => ({ ...previous, [field]: response.data.url }));
      success("Bild uppladdad.");
    } catch {
      toastError("Kunde inte ladda upp bilden.");
    } finally {
      setUploadingImage(null);
    }
  };

  const todayOrders = useMemo(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    return orders.filter((order) => new Date(order.createdAt).getTime() >= start);
  }, [orders]);

  const pendingOrders = useMemo(() => orders.filter((order) => order.status === "PENDING"), [orders]);
  const configuredDays = useMemo(
    () => DAYS.filter((day) => !(openingHours[day.key] || DEFAULT_HOURS).closed).length,
    [openingHours]
  );
  const featuredLabel = FEATURED_OPTIONS.find((option) => option.value === opsForm.featuredClass)?.label || "Standard";

  if (loading) {
    return (
      <div className="panel flex min-h-[320px] items-center justify-center rounded-[28px] px-6 py-12">
        <div className="flex items-center gap-3 text-[var(--text-secondary)]">
          <Loader2 className="animate-spin text-amber-200" size={18} />
          <span className="text-sm font-semibold">Laddar restaurang...</span>
        </div>
      </div>
    );
  }

  if (!restaurant) {
    return (
      <div className="panel flex min-h-[320px] flex-col items-center justify-center gap-4 rounded-[28px] px-6 py-12 text-center">
        <Store size={34} className="text-amber-200" />
        <h2 className="text-2xl font-black tracking-[-0.04em] text-[var(--text-primary)]">Restaurangen hittades inte</h2>
        <button type="button" onClick={() => router.push("/restaurants")} className="inline-flex items-center gap-2 rounded-2xl bg-gold-gradient px-5 py-3 text-[11px] font-black uppercase tracking-[0.24em] text-[#091018]">
          Tillbaka
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-6 pb-24">
        <section className="panel rounded-[28px] px-6 py-6 sm:px-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 flex-1">
              <button type="button" onClick={() => router.push("/restaurants")} className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
                <ArrowLeft size={14} /> Till restauranglistan
              </button>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <h1 className="truncate text-3xl font-black tracking-[-0.06em] text-[var(--text-primary)] sm:text-4xl">{restaurant.name}</h1>
                <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.22em] ${isOpen ? "bg-emerald-300/12 text-emerald-100" : "bg-[rgba(255,255,255,0.06)] text-[var(--text-secondary)]"}`}>
                  {isOpen ? "Öppet" : "Stängt"}
                </span>
              </div>
              <p className="mt-2 text-[11px] font-black uppercase tracking-[0.22em] text-[var(--text-muted)]">{restaurant.cuisine || "Ingen kategori"} • {restaurant.city || "Ingen stad"} • {restaurant.slug}</p>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-[var(--text-secondary)]">
                Egen sida för restaurangen. All redigering öppnas nu i modaler så att du slipper jobba i en lång sida med dold editor längst ned.
              </p>
            </div>

            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <button type="button" onClick={() => void fetchAll()} className="control-chip">
                <RefreshCw size={13} /> Uppdatera
              </button>
              <button
                type="button"
                onClick={toggleOpen}
                disabled={savingKey === "status"}
                className={`inline-flex items-center gap-2 rounded-2xl px-4 py-3 text-[11px] font-black uppercase tracking-[0.22em] ${isOpen ? "bg-emerald-300/12 text-emerald-100" : "bg-[var(--panel-muted)] text-[var(--text-primary)]"}`}
              >
                {isOpen ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
                {savingKey === "status" ? "Sparar..." : isOpen ? "Markera stängd" : "Markera öppen"}
              </button>
              <Link href="/cities" className="control-chip">
                <MapPin size={13} /> Städer & zoner
              </Link>
              <Link href={`/menu/${restaurant.id}`} className="control-chip">
                <Store size={13} /> Meny
              </Link>
            </div>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "Orders idag", value: String(todayOrders.length), sub: `${pendingOrders.length} väntande just nu` },
            { label: "Drift", value: `ETA ${opsForm.etaMinutes} min`, sub: `${featuredLabel} i listningen` },
            { label: "Schema", value: `${configuredDays}/7 dagar`, sub: "Öppna dagar i veckan" },
            { label: "Kvalitet", value: `${(restaurant.rating ?? 4.6).toFixed(1)}`, sub: restaurant.updatedAt ? `Uppdaterad ${relativeDate(restaurant.updatedAt)}` : "Senaste snapshot" },
          ].map((card) => (
            <article key={card.label} className="metric-card panel-muted">
              <p className="text-[10px] font-black uppercase tracking-[0.28em] text-[var(--text-muted)]">{card.label}</p>
              <p className="mt-3 text-3xl font-black tracking-[-0.05em] text-[var(--text-primary)]">{card.value}</p>
              <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">{card.sub}</p>
            </article>
          ))}
        </section>

        <section className="rounded-[28px] border border-sky-300/18 bg-sky-300/10 px-5 py-5">
          <div className="flex items-start gap-3 text-sky-100">
            <ShieldCheck size={18} className="mt-0.5 shrink-0" />
            <div className="space-y-2 text-sm leading-6">
              <p className="font-black uppercase tracking-[0.2em]">Leveransavgift och minimum visas inte här som redigerbara fält längre</p>
              <p>Stad och zon är källan för avgift och minsta order. Om du ska justera leveransregler, gå till <Link href="/cities" className="font-black underline underline-offset-4">Städer & zoner</Link> i stället för att skapa dubbla värden på restaurangen.</p>
            </div>
          </div>
        </section>

        <section className="grid gap-4 xl:grid-cols-2">
          <SectionCard
            eyebrow="Profil"
            title="Grundinfo"
            action={<button type="button" onClick={() => setActiveModal("profile")} className="control-chip">Redigera</button>}
          >
            <div className="grid gap-3 text-sm text-[var(--text-secondary)] sm:grid-cols-2">
              <div className="rounded-[18px] border border-[var(--border-subtle)] bg-[var(--panel-muted)] px-4 py-3">
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[var(--text-muted)]">Telefon</p>
                <p className="mt-2 font-semibold text-[var(--text-primary)]">{restaurant.phone || "Saknas"}</p>
              </div>
              <div className="rounded-[18px] border border-[var(--border-subtle)] bg-[var(--panel-muted)] px-4 py-3">
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[var(--text-muted)]">Adress</p>
                <p className="mt-2 font-semibold text-[var(--text-primary)]">{restaurant.address || "Saknas"}</p>
              </div>
              <div className="rounded-[18px] border border-[var(--border-subtle)] bg-[var(--panel-muted)] px-4 py-3 sm:col-span-2">
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[var(--text-muted)]">Beskrivning</p>
                <p className="mt-2 leading-6 text-[var(--text-secondary)]">{restaurant.description || "Ingen beskrivning sparad."}</p>
              </div>
              <div className="rounded-[18px] border border-[var(--border-subtle)] bg-[var(--panel-muted)] px-4 py-3 sm:col-span-2">
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[var(--text-muted)]">Media</p>
                <p className="mt-2 leading-6 text-[var(--text-secondary)]">
                  {restaurant.imageUrl || restaurant.heroImageUrl ? "Bildlänkar finns sparade." : "Inga bildlänkar sparade."}
                </p>
              </div>
            </div>
          </SectionCard>

          <SectionCard
            eyebrow="Business"
            title="Inloggning"
            action={<button type="button" onClick={() => setActiveModal("business")} className="control-chip">Redigera</button>}
          >
            <div className="grid gap-3 text-sm text-[var(--text-secondary)]">
              <div className="rounded-[18px] border border-[var(--border-subtle)] bg-[var(--panel-muted)] px-4 py-3">
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[var(--text-muted)]">Inloggning / slug</p>
                <p className="mt-2 font-semibold text-[var(--text-primary)]">{restaurant.slug}</p>
              </div>
              <div className="rounded-[18px] border border-[var(--border-subtle)] bg-[var(--panel-muted)] px-4 py-3">
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[var(--text-muted)]">Lösenord</p>
                <p className="mt-2 leading-6 text-[var(--text-secondary)]">Visas aldrig i klartext. Öppna modal om du vill sätta ett nytt för Business-appen.</p>
              </div>
            </div>
          </SectionCard>

          <SectionCard
            eyebrow="Schema"
            title="Öppettider"
            action={<button type="button" onClick={() => setActiveModal("hours")} className="control-chip">Redigera</button>}
          >
            <div className="grid gap-2">
              {DAYS.map((day) => (
                <div key={day.key} className="flex items-center justify-between gap-3 rounded-[18px] border border-[var(--border-subtle)] bg-[var(--panel-muted)] px-4 py-3 text-sm">
                  <span className="font-semibold text-[var(--text-primary)]">{day.label}</span>
                  <span className="text-[var(--text-secondary)]">{formatDayHours(openingHours[day.key])}</span>
                </div>
              ))}
            </div>
          </SectionCard>

          <SectionCard
            eyebrow="Drift"
            title="Status och exponering"
            action={<button type="button" onClick={() => setActiveModal("ops")} className="control-chip">Redigera</button>}
          >
            <div className="grid gap-3 text-sm text-[var(--text-secondary)] sm:grid-cols-2">
              <div className="rounded-[18px] border border-[var(--border-subtle)] bg-[var(--panel-muted)] px-4 py-3">
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[var(--text-muted)]">Standard-ETA</p>
                <p className="mt-2 font-semibold text-[var(--text-primary)]">{opsForm.etaMinutes} min</p>
              </div>
              <div className="rounded-[18px] border border-[var(--border-subtle)] bg-[var(--panel-muted)] px-4 py-3">
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[var(--text-muted)]">Synlighet</p>
                <p className="mt-2 font-semibold text-[var(--text-primary)]">{featuredLabel}</p>
              </div>
              <div className="rounded-[18px] border border-[var(--border-subtle)] bg-[var(--panel-muted)] px-4 py-3 sm:col-span-2">
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[var(--text-muted)]">Leveransregler</p>
                <p className="mt-2 leading-6 text-[var(--text-secondary)]">Avgift och minimum styrs i stad och zon. Restaurangens sparade fallback är dold här för att undvika dubbel styrning.</p>
              </div>
            </div>
          </SectionCard>
        </section>

        <SectionCard eyebrow="Orders" title="Senaste beställningar">
          <div className="grid gap-3">
            {orders.length === 0 ? (
              <div className="rounded-[18px] border border-[var(--border-subtle)] bg-[var(--panel-muted)] px-4 py-4 text-sm leading-6 text-[var(--text-secondary)]">Inga ordrar att visa för den här restaurangen.</div>
            ) : (
              orders.slice(0, 8).map((order) => (
                <div key={order.id} className="flex flex-col gap-3 rounded-[18px] border border-[var(--border-subtle)] bg-[var(--panel-muted)] px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-base font-black tracking-[-0.03em] text-[var(--text-primary)]">{order.orderNumber}</p>
                    <p className="mt-1 text-[11px] font-black uppercase tracking-[0.22em] text-[var(--text-muted)]">{ORDER_STATUS_LABELS[order.status] || order.status} • {order.customerName}</p>
                  </div>
                  <div className="text-sm text-[var(--text-secondary)] sm:text-right">
                    <p className="font-semibold text-[var(--text-primary)]">{currency(order.total)}</p>
                    <p className="mt-1">{relativeDate(order.createdAt)}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </SectionCard>
      </div>

      <Modal open={activeModal === "profile"} onClose={() => setActiveModal(null)} title="Redigera profil" maxWidth="max-w-4xl">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-2 text-sm font-semibold text-[var(--text-secondary)]">
            <span>Namn</span>
            <input value={profile.name} onChange={(event) => setProfile((previous) => ({ ...previous, name: event.target.value }))} className={fieldClass} />
          </label>
          <label className="grid gap-2 text-sm font-semibold text-[var(--text-secondary)]">
            <span>Kategori</span>
            <input value={profile.cuisine} onChange={(event) => setProfile((previous) => ({ ...previous, cuisine: event.target.value }))} className={fieldClass} />
          </label>
          <label className="grid gap-2 text-sm font-semibold text-[var(--text-secondary)] sm:col-span-2">
            <span>Beskrivning</span>
            <textarea value={profile.description} onChange={(event) => setProfile((previous) => ({ ...previous, description: event.target.value }))} className={`${fieldClass} min-h-[120px] resize-y`} />
          </label>
          <label className="grid gap-2 text-sm font-semibold text-[var(--text-secondary)] sm:col-span-2">
            <span>Adress</span>
            <input value={profile.address} onChange={(event) => setProfile((previous) => ({ ...previous, address: event.target.value }))} className={fieldClass} />
          </label>
          <label className="grid gap-2 text-sm font-semibold text-[var(--text-secondary)]">
            <span>Stad</span>
            <input value={profile.city} onChange={(event) => setProfile((previous) => ({ ...previous, city: event.target.value }))} className={fieldClass} />
          </label>
          <label className="grid gap-2 text-sm font-semibold text-[var(--text-secondary)]">
            <span>Postnummer</span>
            <input value={profile.zip} onChange={(event) => setProfile((previous) => ({ ...previous, zip: event.target.value }))} className={fieldClass} />
          </label>
          <label className="grid gap-2 text-sm font-semibold text-[var(--text-secondary)]">
            <span>Telefon</span>
            <input value={profile.phone} onChange={(event) => setProfile((previous) => ({ ...previous, phone: event.target.value }))} className={fieldClass} />
          </label>
          <label className="grid gap-2 text-sm font-semibold text-[var(--text-secondary)]">
            <span>Intern notering</span>
            <input value={profile.internalInfo} onChange={(event) => setProfile((previous) => ({ ...previous, internalInfo: event.target.value }))} className={fieldClass} />
          </label>
          <label className="grid gap-2 text-sm font-semibold text-[var(--text-secondary)] sm:col-span-2">
            <span>Bild-URL</span>
            <input value={profile.imageUrl} onChange={(event) => setProfile((previous) => ({ ...previous, imageUrl: event.target.value }))} className={fieldClass} />
          </label>
          <label className="grid gap-2 text-sm font-semibold text-[var(--text-secondary)] sm:col-span-2">
            <span>Hero-bild URL</span>
            <input value={profile.heroImageUrl} onChange={(event) => setProfile((previous) => ({ ...previous, heroImageUrl: event.target.value }))} className={fieldClass} />
          </label>
          <div className="sm:col-span-2 grid gap-3 sm:grid-cols-2">
            <label className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[var(--border-subtle)] bg-[var(--panel-muted)] px-4 py-3 text-[11px] font-black uppercase tracking-[0.22em] text-[var(--text-secondary)]">
              <Upload size={14} /> {uploadingImage === "imageUrl" ? "Laddar upp..." : "Ladda upp bild"}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) {
                    void uploadImage(file, "imageUrl");
                  }
                  event.target.value = "";
                }}
              />
            </label>
            <label className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[var(--border-subtle)] bg-[var(--panel-muted)] px-4 py-3 text-[11px] font-black uppercase tracking-[0.22em] text-[var(--text-secondary)]">
              <ImageIcon size={14} /> {uploadingImage === "heroImageUrl" ? "Laddar upp..." : "Ladda upp hero"}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) {
                    void uploadImage(file, "heroImageUrl");
                  }
                  event.target.value = "";
                }}
              />
            </label>
          </div>
          <label className="grid gap-2 text-sm font-semibold text-[var(--text-secondary)]">
            <span>Latitude</span>
            <input value={profile.latitude} onChange={(event) => setProfile((previous) => ({ ...previous, latitude: event.target.value }))} className={fieldClass} />
          </label>
          <label className="grid gap-2 text-sm font-semibold text-[var(--text-secondary)]">
            <span>Longitude</span>
            <input value={profile.longitude} onChange={(event) => setProfile((previous) => ({ ...previous, longitude: event.target.value }))} className={fieldClass} />
          </label>
        </div>
        <ModalActions onClose={() => setActiveModal(null)} onSave={() => void saveProfile()} loading={savingKey === "profile"} saveLabel="Spara profil" />
      </Modal>

      <Modal open={activeModal === "business"} onClose={() => setActiveModal(null)} title="Business-inloggning" maxWidth="max-w-2xl">
        <div className="grid gap-4">
          <div className="rounded-[18px] border border-amber-300/18 bg-amber-300/10 px-4 py-4 text-sm leading-6 text-amber-100">
            Ändra slug eller sätt nytt lösenord för Business-appen. Lösenordet visas aldrig tillbaka efter sparning.
          </div>
          <label className="grid gap-2 text-sm font-semibold text-[var(--text-secondary)]">
            <span>Slug / login</span>
            <input value={businessForm.slug} onChange={(event) => setBusinessForm((previous) => ({ ...previous, slug: event.target.value }))} className={fieldClass} />
          </label>
          <label className="grid gap-2 text-sm font-semibold text-[var(--text-secondary)]">
            <span>Nytt lösenord</span>
            <input type="password" value={businessForm.adminPassword} onChange={(event) => setBusinessForm((previous) => ({ ...previous, adminPassword: event.target.value }))} className={fieldClass} placeholder="Lämna tomt om du inte ska byta" />
          </label>
        </div>
        <ModalActions onClose={() => setActiveModal(null)} onSave={() => void saveBusiness()} loading={savingKey === "business"} saveLabel="Spara inloggning" />
      </Modal>

      <Modal open={activeModal === "hours"} onClose={() => setActiveModal(null)} title="Öppettider" maxWidth="max-w-4xl">
        <div className="grid gap-3">
          {DAYS.map((day) => {
            const current = openingHours[day.key] || DEFAULT_HOURS;

            return (
              <div key={day.key} className="rounded-[22px] border border-[var(--border-subtle)] bg-[var(--panel-muted)] px-4 py-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <p className="text-base font-black tracking-[-0.03em] text-[var(--text-primary)]">{day.label}</p>
                    <p className="mt-1 text-[11px] font-black uppercase tracking-[0.22em] text-[var(--text-muted)]">{formatDayHours(current)}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setOpeningHours((previous) => ({ ...previous, [day.key]: { ...current, closed: !current.closed } }))}
                    className={`rounded-full px-3 py-2 text-[10px] font-black uppercase tracking-[0.2em] ${current.closed ? "bg-[rgba(255,255,255,0.08)] text-[var(--text-secondary)]" : "bg-emerald-300/12 text-emerald-100"}`}
                  >
                    {current.closed ? "Stängd" : "Öppen"}
                  </button>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <input type="time" value={current.open} disabled={current.closed} onChange={(event) => setOpeningHours((previous) => ({ ...previous, [day.key]: { ...current, open: event.target.value } }))} className={fieldClass} />
                  <input type="time" value={current.close} disabled={current.closed} onChange={(event) => setOpeningHours((previous) => ({ ...previous, [day.key]: { ...current, close: event.target.value } }))} className={fieldClass} />
                  <input type="time" value={current.open2 || "17:00"} disabled={current.closed || !current.shift2} onChange={(event) => setOpeningHours((previous) => ({ ...previous, [day.key]: { ...current, open2: event.target.value } }))} className={fieldClass} />
                  <input type="time" value={current.close2 || "21:00"} disabled={current.closed || !current.shift2} onChange={(event) => setOpeningHours((previous) => ({ ...previous, [day.key]: { ...current, close2: event.target.value } }))} className={fieldClass} />
                </div>

                <label className="mt-4 inline-flex items-center gap-3 text-sm font-semibold text-[var(--text-secondary)]">
                  <input type="checkbox" checked={Boolean(current.shift2)} disabled={current.closed} onChange={(event) => setOpeningHours((previous) => ({ ...previous, [day.key]: { ...current, shift2: event.target.checked } }))} />
                  Extra pass
                </label>
              </div>
            );
          })}
        </div>
        <ModalActions onClose={() => setActiveModal(null)} onSave={() => void saveHours()} loading={savingKey === "hours"} saveLabel="Spara schema" />
      </Modal>

      <Modal open={activeModal === "ops"} onClose={() => setActiveModal(null)} title="Driftinställningar" maxWidth="max-w-3xl">
        <div className="grid gap-4">
          <div className="rounded-[18px] border border-sky-300/18 bg-sky-300/10 px-4 py-4 text-sm leading-6 text-sky-100">
            Här styr du ETA och hur restaurangen rankas i listningen. Leveransavgift och minimum justeras på stads- och zonsidan.
          </div>
          <label className="grid gap-2 text-sm font-semibold text-[var(--text-secondary)]">
            <span>Standard-ETA</span>
            <input type="number" min={0} value={opsForm.etaMinutes} onChange={(event) => setOpsForm((previous) => ({ ...previous, etaMinutes: Number(event.target.value) || 0 }))} className={fieldClass} />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            {FEATURED_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setOpsForm((previous) => ({ ...previous, featuredClass: option.value }))}
                className={`rounded-[20px] border px-4 py-4 text-left transition ${opsForm.featuredClass === option.value ? "border-amber-300/28 bg-amber-300/10" : "border-[var(--border-subtle)] bg-[var(--panel-muted)]"}`}
              >
                <p className="text-sm font-black text-[var(--text-primary)]">{option.label}</p>
                <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">{option.description}</p>
              </button>
            ))}
          </div>
          <Link href="/cities" className="control-chip w-fit">
            <MapPin size={13} /> Öppna Städer & zoner
          </Link>
        </div>
        <ModalActions onClose={() => setActiveModal(null)} onSave={() => void saveOps()} loading={savingKey === "ops"} saveLabel="Spara drift" />
      </Modal>
    </>
  );
}
