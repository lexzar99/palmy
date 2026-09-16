import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "viaeats admin",
    short_name: "viaeats",
    description: "Ordrar, restauranger och ekonomi.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    background_color: "#141518",
    theme_color: "#141518",
    lang: "sv",
    icons: [{ src: "/icon.png", sizes: "512x512", type: "image/png" }],
  };
}
