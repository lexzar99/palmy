import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ChevronRight, Clock3, MapPin, Sparkles, Star, Store } from "lucide-react";

export const revalidate = 60;

const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://api.viaeats.se";

type DealDetail = {
  id: string;
  title: string;
  description?: string | null;
  imageUrl?: string | null;
  badgeText?: string | null;
  popupHeadline?: string | null;
  popupBody?: string | null;
  popupCode?: string | null;
  discountType?: string | null;
  discountValue?: number | null;
  minOrder?: number | null;
  validUntil?: string | null;
};

type DealRestaurant = {
  id: string;
  slug: string;
  name: string;
  cuisine?: string | null;
  address?: string | null;
  city?: string | null;
  imageUrl?: string | null;
  heroImageUrl?: string | null;
  rating?: number | null;
  ratingCount?: number | null;
  deliveryFee?: number | null;
  etaMinutes?: number | null;
  isOpen?: boolean;
  comingSoon?: boolean;
};

type DealResponse = { deal: DealDetail; restaurants: DealRestaurant[] };

async function getDeal(id: string): Promise<DealResponse | null> {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) return null;
  try {
    const response = await fetch(`${API_URL}/api/deals/${encodeURIComponent(id)}/restaurants`, {
      next: { revalidate: 60, tags: [`deal:${id}`] },
    });
    if (!response.ok) return null;
    const data = await response.json();
    if (!data?.deal?.id || !Array.isArray(data?.restaurants)) return null;
    return data as DealResponse;
  } catch {
    return null;
  }
}

function dealValueLabel(deal: DealDetail) {
  if (deal.badgeText) return deal.badgeText;
  if (deal.discountType === "PERCENTAGE") return `${deal.discountValue || 0}% rabatt`;
  if (deal.discountType === "FIXED" || deal.discountType === "FIXED_PRICE") {
    return `${deal.discountValue || 0} kr rabatt`;
  }
  return "Erbjudande";
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const data = await getDeal(id);
  if (!data) return { title: "Erbjudande | ViaEats" };
  const title = data.deal.popupHeadline || data.deal.title;
  const description = data.deal.popupBody || data.deal.description || "Se restaurangerna som erbjuder dealen.";
  return {
    title: `${title} | ViaEats`,
    description,
    robots: { index: false, follow: true },
  };
}

export default async function DealPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getDeal(id);
  if (!data) notFound();

  const { deal, restaurants } = data;
  const title = deal.popupHeadline || deal.title;
  const body = deal.popupBody || deal.description;
  const validUntil = deal.validUntil
    ? new Date(deal.validUntil).toLocaleDateString("sv-SE", { day: "numeric", month: "long", year: "numeric" })
    : null;

  return (
    <main className="min-h-screen pb-28 pt-[calc(env(safe-area-inset-top,0px)+1rem)] md:pb-16 md:pt-24" style={{ backgroundColor: "var(--bg-primary)", color: "var(--text-primary)" }}>
      <div className="mx-auto w-full max-w-3xl px-4 sm:px-6">
        <Link href="/" className="mb-5 inline-flex items-center gap-2 rounded-full border px-4 py-2.5 text-sm font-bold" style={{ borderColor: "var(--border-muted)", backgroundColor: "var(--bg-secondary)" }}>
          <ArrowLeft size={16} /> Till startsidan
        </Link>

        <section className="relative overflow-hidden rounded-[2rem] border p-6 sm:p-8" style={{ borderColor: "rgba(240,83,28,.28)", background: "linear-gradient(135deg,rgba(240,83,28,.18),rgba(240,83,28,.05))" }}>
          <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-[#F0531C]/10 blur-2xl" />
          <div className="relative">
            <div className="inline-flex items-center gap-2 rounded-full bg-[#F0531C] px-3 py-1.5 text-xs font-black text-white">
              <Sparkles size={14} /> {dealValueLabel(deal)}
            </div>
            <h1 className="mt-5 max-w-2xl text-3xl font-black leading-tight tracking-tight sm:text-4xl">{title}</h1>
            {body ? <p className="mt-3 max-w-2xl text-[15px] font-medium leading-6" style={{ color: "var(--text-secondary)" }}>{body}</p> : null}
            <div className="mt-5 flex flex-wrap gap-2 text-xs font-bold" style={{ color: "var(--text-secondary)" }}>
              {deal.minOrder && deal.minOrder > 0 ? <span className="rounded-full border px-3 py-1.5" style={{ borderColor: "var(--border-muted)", backgroundColor: "var(--bg-secondary)" }}>Minst {deal.minOrder} kr</span> : null}
              {validUntil ? <span className="rounded-full border px-3 py-1.5" style={{ borderColor: "var(--border-muted)", backgroundColor: "var(--bg-secondary)" }}>Gäller t.o.m. {validUntil}</span> : null}
            </div>
            {deal.popupCode ? (
              <div className="mt-5 inline-flex items-center gap-3 rounded-2xl border px-4 py-3" style={{ borderColor: "var(--border-muted)", backgroundColor: "var(--bg-secondary)" }}>
                <span className="text-xs font-bold" style={{ color: "var(--text-secondary)" }}>Kod</span>
                <code className="select-all text-base font-black tracking-wider">{deal.popupCode}</code>
              </div>
            ) : null}
          </div>
        </section>

        <section className="mt-8">
          <div className="mb-4 flex items-end justify-between gap-4 px-1">
            <div>
              <p className="text-xs font-black uppercase tracking-[.16em] text-[#F0531C]">Använd erbjudandet</p>
              <h2 className="mt-1 text-2xl font-black tracking-tight">Välj restaurang</h2>
            </div>
            <span className="text-sm font-bold" style={{ color: "var(--text-secondary)" }}>{restaurants.length} st</span>
          </div>

          {restaurants.length ? (
            <div className="space-y-3">
              {restaurants.map((restaurant) => {
                const image = restaurant.heroImageUrl || restaurant.imageUrl;
                const available = restaurant.isOpen && !restaurant.comingSoon;
                return (
                  <Link key={restaurant.id} href={`/restaurants/${restaurant.slug}`} className="flex items-center gap-4 rounded-2xl border p-3 transition-transform active:scale-[.99]" style={{ borderColor: "var(--border-muted)", backgroundColor: "var(--bg-secondary)" }}>
                    {image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={image} alt="" className="h-20 w-20 shrink-0 rounded-2xl object-cover" />
                    ) : (
                      <span className="grid h-20 w-20 shrink-0 place-items-center rounded-2xl" style={{ backgroundColor: "var(--bg-deep)" }}><Store size={25} /></span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[17px] font-black">{restaurant.name}</span>
                      <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>
                        {restaurant.cuisine ? <span>{restaurant.cuisine}</span> : null}
                        {restaurant.rating ? <span className="inline-flex items-center gap-1"><Star size={12} fill="currentColor" /> {restaurant.rating.toFixed(1)}</span> : null}
                        {restaurant.etaMinutes ? <span className="inline-flex items-center gap-1"><Clock3 size={12} /> {restaurant.etaMinutes} min</span> : null}
                      </span>
                      <span className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold" style={{ color: available ? "var(--success-ink)" : "var(--text-secondary)" }}>
                        <span className={`h-2 w-2 rounded-full ${available ? "bg-emerald-500" : "bg-zinc-400"}`} />
                        {restaurant.comingSoon ? "Öppnar snart" : available ? "Tar emot beställningar" : "Stängd just nu"}
                      </span>
                      {(restaurant.address || restaurant.city) ? <span className="mt-1 flex items-center gap-1 truncate text-[11px] font-medium" style={{ color: "var(--text-secondary)" }}><MapPin size={11} /> {[restaurant.address, restaurant.city].filter(Boolean).join(", ")}</span> : null}
                    </span>
                    <ChevronRight size={20} className="shrink-0" style={{ color: "var(--text-secondary)" }} />
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="rounded-2xl border px-6 py-10 text-center" style={{ borderColor: "var(--border-muted)", backgroundColor: "var(--bg-secondary)" }}>
              <Store size={30} className="mx-auto" style={{ color: "var(--text-secondary)" }} />
              <h3 className="mt-3 text-lg font-black">Inga restauranger tillgängliga just nu</h3>
              <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>Erbjudandet finns kvar. Kom tillbaka lite senare.</p>
              <Link href="/" className="mt-5 inline-flex rounded-full bg-[#F0531C] px-5 py-3 text-sm font-black text-white">Se alla restauranger</Link>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
