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

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const restaurant = await getRestaurant(slug);

  if (!restaurant) {
    return {
      title: "Restaurant | Palmy",
      description: "View our menu and place your order.",
    };
  }

  const title = restaurant.name
    ? `${restaurant.name} | Palmy`
    : "Restaurant | Palmy";
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

  return (
    <FadeInWrapper>
      <MenuContent restaurantSlug={slug} isStandalone={true} />
    </FadeInWrapper>
  );
}
