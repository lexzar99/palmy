import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/siteUrl";

// Next.js auto-genererar /robots.txt från denna fil. Sidan serveras med rätt
// content-type så Google/Bing kan parse den direkt.
export default function robots(): MetadataRoute.Robots {
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
          "/terminal",
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
