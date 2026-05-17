import type { MetadataRoute } from "next";

// Next.js auto-genererar /robots.txt från denna fil. Sidan serveras med rätt
// content-type så Google/Bing kan parse den direkt.
export default function robots(): MetadataRoute.Robots {
  // NEXT_PUBLIC_SITE_URL ska sättas i Vercel när vi pekar in en riktig
  // domän (t.ex. https://foodgo.se). Tills vidare faller vi tillbaka på
  // Vercel-domänen så robots/sitemap inte hänvisar till en icke-existerande
  // host.
  const base = process.env.NEXT_PUBLIC_SITE_URL || "https://matgo-web-pi.vercel.app";

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/auth/",
          "/profile",
          "/cart",
          "/order/",
          "/mobile-auth/",
        ],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
