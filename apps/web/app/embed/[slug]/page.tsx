import type { Metadata } from "next";
import { notFound } from "next/navigation";
import MenuContent from "@/components/MenuContent";

type EmbedPageProps = {
  params: Promise<{ slug: string }>;
};

const API_URL = (process.env.NEXT_PUBLIC_API_URL || "https://api.viaeats.se").replace(/\/$/, "");

async function getRestaurant(slug: string) {
  try {
    const response = await fetch(`${API_URL}/api/restaurants/${encodeURIComponent(slug)}`, {
      cache: "no-store",
    });
    if (!response.ok) return null;
    return response.json();
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: EmbedPageProps): Promise<Metadata> {
  const { slug } = await params;
  const restaurant = await getRestaurant(slug);
  return {
    title: restaurant?.name ? `${restaurant.name} – beställning` : "Beställning",
    robots: { index: false, follow: false },
  };
}

/**
 * Fristående partner/kiosk-yta.
 *
 * Detta är medvetet en egen route. Den vanliga `/restaurants/[slug]`-sidan
 * och ViaEats discovery-flöde lämnas orörda. Embed-scriptet på partnersidan
 * laddar denna route i en iframe, medan samma API, orderlogik och tracking
 * används under huven.
 */
export default async function PartnerEmbedPage({ params }: EmbedPageProps) {
  const { slug } = await params;
  const restaurant = await getRestaurant(slug);
  if (!restaurant || restaurant.comingSoon) notFound();

  return (
    <main data-viaeats-embed="1" className="min-h-screen" style={{ backgroundColor: "var(--bg-primary)" }}>
      <MenuContent
        restaurantSlug={slug}
        isStandalone
        embedMode
        initialData={{ restaurant }}
      />
    </main>
  );
}
