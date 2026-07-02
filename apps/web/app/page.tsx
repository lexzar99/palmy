import { Suspense } from "react";
import HomeClient, { type HomeInitialData } from "@/components/HomeClient";
import { API_URL } from "@/lib/api";

// Hemsidan är nu en SERVER component: restauranglistan + publika listor
// hämtas på servern (cachat 120s) och streamas till klienten via Suspense.
// Skalet (skeleton) flushas omedelbart → upplevd laddtid sjunker rejält
// jämfört med gamla klient-vattenfallet (hydrera → 6 parallella GET:ar).
// All interaktivitet (filter, adress, karuseller) bor kvar i HomeClient.
export const revalidate = 120;

async function getJson<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${API_URL}${path}`, { next: { revalidate: 120 } });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    // API nere vid build/revalidate → klienten faller tillbaka till sitt
    // vanliga fetch-flöde (initialData = null).
    return null;
  }
}

async function HomeData() {
  const [restaurants, cities, deals, sponsors, homeCategories, appDealsResponse, pulseResponse] = await Promise.all([
    getJson<any[]>("/api/restaurants"),
    getJson<any[]>("/api/cities"),
    getJson<any[]>("/api/deals"),
    getJson<any[]>("/api/sponsors"),
    getJson<any[]>("/api/home-categories"),
    getJson<{ deals?: any[] }>("/api/deals/app?placement=HOME_TOP&limit=8&loggedIn=0"),
    getJson<{ greeting?: string | null; modules?: any[] }>("/api/home/pulse"),
  ]);

  const initialData: HomeInitialData | null = Array.isArray(restaurants)
    ? {
        restaurants,
        cities: Array.isArray(cities) ? cities : [],
        deals: Array.isArray(deals) ? deals : [],
        sponsors: Array.isArray(sponsors) ? sponsors : [],
        homeCategories: Array.isArray(homeCategories) ? homeCategories : [],
        appDeals: Array.isArray(appDealsResponse?.deals) ? appDealsResponse.deals : [],
        pulse: {
          greeting: pulseResponse?.greeting ?? null,
          modules: Array.isArray(pulseResponse?.modules) ? pulseResponse.modules : [],
        },
      }
    : null;

  return <HomeClient initialData={initialData} />;
}

// Server-renderad skeleton — flushas direkt medan HomeData väntar på API:t.
function HomeSkeleton() {
  return (
    <div className="min-h-screen pb-36 md:pt-28" style={{ backgroundColor: "var(--bg-primary)" }}>
      <div className="md:hidden px-4 pt-3 space-y-2.5" style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 0.75rem)" }}>
        <div className="skeleton h-10 w-48 rounded-lg" />
        <div className="skeleton h-12 w-full rounded-xl" />
      </div>
      <div className="mx-auto max-w-7xl 2xl:max-w-[1600px] px-4 sm:px-6 lg:px-10 xl:px-16 pt-4">
        <div className="hidden md:flex items-center gap-4 mb-8">
          <div className="skeleton h-12 w-64 rounded-xl" />
          <div className="skeleton h-12 flex-1 max-w-xl rounded-xl" />
          <div className="skeleton h-10 w-44 rounded-full" />
        </div>
        <div className="flex gap-2 mb-6">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="skeleton h-9 w-20 rounded-full" />
          ))}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4 sm:gap-5">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="skeleton h-64 rounded-xl" />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function HomePage() {
  return (
    <Suspense fallback={<HomeSkeleton />}>
      <HomeData />
    </Suspense>
  );
}
