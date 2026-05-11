import type { MetadataRoute } from "next";

// Next.js auto-genererar /robots.txt från denna fil. Sidan serveras med rätt
// content-type så Google/Bing kan parse den direkt.
export default function robots(): MetadataRoute.Robots {
  const base = process.env.NEXT_PUBLIC_SITE_URL || "https://www.matgo.se";

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
