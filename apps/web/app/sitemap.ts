import type { MetadataRoute } from "next";

// Dynamisk sitemap — listar alla restauranger så Google/Bing kan indexera
// menysidor. Statiska sidor (om, kontakt, etc.) också med.
// Restauranger hämtas via samma API som hem-sidan.

const STATIC_ROUTES: { path: string; changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"]; priority: number }[] = [
  { path: "/", changeFrequency: "daily", priority: 1.0 },
  { path: "/discover", changeFrequency: "daily", priority: 0.8 },
  { path: "/search", changeFrequency: "weekly", priority: 0.7 },
  { path: "/about", changeFrequency: "monthly", priority: 0.5 },
  { path: "/contact", changeFrequency: "monthly", priority: 0.5 },
  { path: "/terms", changeFrequency: "yearly", priority: 0.3 },
  { path: "/privacy", changeFrequency: "yearly", priority: 0.3 },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // NEXT_PUBLIC_SITE_URL + NEXT_PUBLIC_API_URL sätts i Vercel när vi har
  // riktig domän. Fallback till befintliga prod-hosts så sitemap inte
  // pekar på döda URL:er innan rebrand-DNS är klar.
  const base = (process.env.NEXT_PUBLIC_SITE_URL || "https://matgo-web-pi.vercel.app").replace(/\/$/, "");
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "https://palmy-production-2021.up.railway.app";

  const now = new Date();

  const staticEntries: MetadataRoute.Sitemap = STATIC_ROUTES.map((r) => ({
    url: `${base}${r.path}`,
    lastModified: now,
    changeFrequency: r.changeFrequency,
    priority: r.priority,
  }));

  let restaurantEntries: MetadataRoute.Sitemap = [];
  try {
    const res = await fetch(`${apiUrl}/api/restaurants`, { next: { revalidate: 3600 } });
    if (res.ok) {
      const data = await res.json();
      const list = Array.isArray(data) ? data : data?.restaurants || [];
      restaurantEntries = list
        .filter((r: { slug?: string }) => typeof r.slug === "string")
        .map((r: { slug: string; updatedAt?: string }) => ({
          url: `${base}/restaurants/${r.slug}`,
          lastModified: r.updatedAt ? new Date(r.updatedAt) : now,
          changeFrequency: "daily" as const,
          priority: 0.9,
        }));
    }
  } catch {
    // Om API är nere returnerar vi bara static-routes. Sitemap blir partial
    // men inte 500.
  }

  return [...staticEntries, ...restaurantEntries];
}
