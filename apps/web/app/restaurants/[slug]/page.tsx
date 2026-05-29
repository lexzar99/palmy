import { Metadata } from "next";
import MenuContent from "@/components/MenuContent";
import FadeInWrapper from "@/components/FadeInWrapper";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  "https://palmy-production-2021.up.railway.app";

interface Restaurant {
  name?: string;
  description?: string;
  cuisine?: string;
  imageUrl?: string;
}

async function getRestaurant(slug: string): Promise<Restaurant | null> {
  try {
    const res = await fetch(`${API_URL}/api/restaurants/${slug}`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

// SSR data fetching — these are cached in the Next Data Cache via `revalidate`,
// so visitors get the menu straight from the cache instead of waiting on the
// Railway API on every page load (this is what kills the cold-start delay).
// Each guards its own failure → page still renders if one source is down.
async function getMenu(slug: string): Promise<any | null> {
  try {
    const res = await fetch(
      `${API_URL}/api/menu/categories?slug=${encodeURIComponent(slug)}&v=20260428`,
      { next: { revalidate: 300 } },
    );
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

async function getDeals(slug: string): Promise<any[]> {
  try {
    const res = await fetch(
      `${API_URL}/api/deals?slug=${encodeURIComponent(slug)}`,
      { next: { revalidate: 120 } },
    );
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
      title: "Restaurang | FoodGo",
      description: "Se menyn och lägg din beställning.",
    };
  }

  const title = restaurant.name
    ? `${restaurant.name} | FoodGo`
    : "Restaurang | FoodGo";
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

  // Fetch menu + restaurant + deals on the server, in parallel. `getRestaurant`
  // is memoized within the request so generateMetadata above shares the result
  // (one Railway hit, not two).
  const [menuData, restaurant, deals] = await Promise.all([
    getMenu(slug),
    getRestaurant(slug),
    getDeals(slug),
  ]);

  // Only seed initial data when BOTH the menu and the restaurant resolved.
  // Otherwise pass null and let MenuContent fall back to its existing client
  // fetch — so a transient SSR failure degrades gracefully instead of breaking.
  const initialData =
    menuData && restaurant
      ? {
          categories: Array.isArray(menuData)
            ? menuData
            : menuData?.categories || [],
          mainCategories: Array.isArray(menuData)
            ? []
            : menuData?.mainCategories || [],
          deals,
          restaurant,
        }
      : null;

  return (
    <FadeInWrapper>
      <MenuContent
        restaurantSlug={slug}
        isStandalone={true}
        initialData={initialData}
      />
    </FadeInWrapper>
  );
}
