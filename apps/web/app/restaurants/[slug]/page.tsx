import { Metadata } from "next";
import MenuContent from "@/components/MenuContent";

// ISR: cache the rendered page per slug for 5 min so 1000 same-restaurant loads
// hit a cached shell instead of 1000 live SSR renders (each re-parsing ~1.5MB).
// On-demand purge still works via /api/revalidate (tag-based) on menu changes.
export const revalidate = 300;

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  "https://palmy-production-2021.up.railway.app";

// Pre-render known restaurant slugs at build and ISR-cache the rest on demand,
// so 1000 same-restaurant loads hit a cached shell instead of 1000 live SSR
// renders. dynamicParams=true (default) lets unknown slugs render on-demand then
// cache. Build never breaks if the API is unreachable (catch → []).
export const dynamicParams = true;
export async function generateStaticParams(): Promise<Array<{ slug: string }>> {
  try {
    const res = await fetch(`${API_URL}/api/restaurants`, { next: { revalidate: 3600 } });
    if (!res.ok) return [];
    const list = await res.json();
    return Array.isArray(list)
      ? list.filter((r: any) => r?.slug).map((r: any) => ({ slug: String(r.slug) }))
      : [];
  } catch {
    return [];
  }
}

interface Restaurant {
  name?: string;
  description?: string;
  cuisine?: string;
  imageUrl?: string;
}

async function getRestaurant(slug: string): Promise<Restaurant | null> {
  try {
    const res = await fetch(`${API_URL}/api/restaurants/${slug}`, {
      // Kort tids-revalidate som skyddsnät: även om on-demand-purgen (admin →
      // /api/revalidate) inte är konfigurerad syns ny hero/profilbild inom 5 min.
      next: { revalidate: 300, tags: [`restaurant:${slug}`] },
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

// SSR data fetching — cached in the Next Data Cache via `revalidate` + tagged so
// a single menu change can purge exactly this restaurant (see app/api/revalidate).
// We read the body as text first so we get the EXACT byte size for the size guard
// without a second serialization pass.
async function getMenu(
  slug: string,
): Promise<{ data: any; bytes: number } | null> {
  try {
    const res = await fetch(
      `${API_URL}/api/menu/categories?slug=${encodeURIComponent(slug)}&v=20260428`,
      { next: { revalidate: 300, tags: [`menu:${slug}`] } },
    );
    if (!res.ok) return null;
    const text = await res.text();
    return { data: JSON.parse(text), bytes: Buffer.byteLength(text, "utf8") };
  } catch {
    return null;
  }
}

async function getDeals(slug: string): Promise<any[]> {
  try {
    const res = await fetch(`${API_URL}/api/deals?slug=${encodeURIComponent(slug)}`, {
      next: { revalidate: 120, tags: [`deals:${slug}`] },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const restaurant = await getRestaurant(slug);

  if (!restaurant) {
    return {
      title: "Restaurang | Delívera",
      description: "Se menyn och lägg din beställning.",
    };
  }

  const title = restaurant.name
    ? `${restaurant.name} | Delívera`
    : "Restaurang | Delívera";
  const description =
    restaurant.description ||
    (restaurant.cuisine
      ? `${restaurant.cuisine} restaurant — view menu and order online.`
      : "View our menu and place your order.");

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      ...(restaurant.imageUrl && {
        images: [{ url: restaurant.imageUrl }],
      }),
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      ...(restaurant.imageUrl && { images: [restaurant.imageUrl] }),
    },
  };
}

export default async function RestaurantPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const [menuResult, restaurant, deals] = await Promise.all([
    getMenu(slug),
    getRestaurant(slug),
    getDeals(slug),
  ]);

  // ── Size guard ────────────────────────────────────────────────────────────
  // Only SSR-inline menus that are safely under Next's ~2MB Data Cache ceiling.
  // A bigger menu would (a) not get cached → every request becomes a fresh
  // origin hit (no protection at 10k users), and (b) bloat the HTML. For those
  // we pass initialData=null and fall back to the existing CLIENT fetch path
  // (the old, safe behavior). Today only one restaurant has a real menu
  // (~1.5MB) so this is a forward-looking safety net.
  const MENU_SSR_MAX_BYTES = 1_800_000;
  const menuData = menuResult?.data ?? null;
  const menuBytes = menuResult?.bytes ?? 0;
  const menuFitsSSR = menuData != null && menuBytes > 0 && menuBytes <= MENU_SSR_MAX_BYTES;

  // Seed initial data only when the menu is small enough AND the restaurant
  // resolved. Otherwise MenuContent falls back to its client fetch.
  const initialData =
    menuFitsSSR && restaurant
      ? {
          categories: Array.isArray(menuData)
            ? menuData
            : menuData?.categories || [],
          deals,
          restaurant,
        }
      : null;

  // OBS: ingen FadeInWrapper här — den (framer-motion) väntade på hydrering
  // innan innehållet blev synligt OCH dubblerade MenuContents egna CSS-fade
  // (page-fade-in) → sidan låg halvtransparent i ~0.8s. CSS-faden räcker och
  // startar direkt med SSR-paint, utan JS.
  return (
    <MenuContent
      restaurantSlug={slug}
      isStandalone={true}
      initialData={initialData}
    />
  );
}
