import { API_URL } from "@/lib/api";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Clock, Star, Bike, ArrowLeft } from "lucide-react";

async function getRestaurant(slug: string) {
  const res = await fetch(`${API_URL}/api/restaurants/${slug}`, { cache: "no-store" });
  if (!res.ok) return null;
  return res.json();
}

export default async function RestaurantPage({ params }: { params: { slug: string } }) {
  const { slug } = params;

  if (slug === "palmyra") {
    redirect("/menu");
  }

  const restaurant = await getRestaurant(slug);
  if (!restaurant) return notFound();

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#fff3d1] via-[#ffe3a0] to-[#fef7e8] text-[#1c160f] pb-16">
      <div className="mx-auto max-w-4xl px-4 pt-8">
        <Link href="/" className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-[#a16207]">
          <ArrowLeft size={18} /> Tillbaka
        </Link>

        <div className="overflow-hidden rounded-3xl bg-white shadow-xl">
          {restaurant.heroImageUrl && (
            <img src={restaurant.heroImageUrl} alt={restaurant.name} className="h-48 w-full object-cover" />
          )}
          <div className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#a16207]">{restaurant.cuisine}</p>
                <h1 className="text-3xl font-black text-[#1f2937]">{restaurant.name}</h1>
                <p className="text-sm text-[#6b7280]">{restaurant.description}</p>
              </div>
              <div className="flex items-center gap-2 rounded-full bg-[#fef3c7] px-3 py-1 text-sm font-black text-[#92400e]">
                <Star size={16} className="fill-[#fbbf24] text-[#fbbf24]" />
                {(restaurant.rating ?? 4.6).toFixed(1)}
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3 text-sm font-semibold text-[#4b5563]">
              <span className="flex items-center gap-1"><Clock size={16} />{restaurant.etaMinutes ?? 30} min</span>
              <span className="flex items-center gap-1"><Bike size={16} />{restaurant.deliveryFee ?? 0} kr</span>
            </div>
          </div>
        </div>

        <div className="mt-6 space-y-6">
          {restaurant.menu?.map((cat: any) => (
            <div key={cat.id} className="rounded-2xl bg-white p-5 shadow-md">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-lg font-black text-[#1f2937]">{cat.name}</h2>
                <span className="text-xs font-semibold text-[#9ca3af]">{cat.items?.length || 0} rätter</span>
              </div>
              <div className="space-y-3">
                {cat.items?.map((item: any) => (
                  <div key={item.id} className="flex items-center justify-between rounded-xl border border-[#f3f4f6] px-3 py-3">
                    <div>
                      <p className="text-sm font-bold text-[#1f2937]">{item.name}</p>
                      <p className="text-xs text-[#6b7280]">{item.description}</p>
                    </div>
                    <div className="text-sm font-black text-[#a16207]">{item.price} kr</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
