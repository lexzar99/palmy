import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const apiTarget =
  process.env.API_PROXY_TARGET ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://127.0.0.1:4000";

function hostnameFromUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).hostname;
  } catch {
    return null;
  }
}

const configuredR2Hostname = hostnameFromUrl(process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL);
const optimizedImageHosts = Array.from(new Set([
  // Keep the old host during URL migration; switch the env to the custom
  // domain as soon as Cloudflare has activated it.
  "pub-3aa62f4934014835956fe3777d5b3abd.r2.dev",
  configuredR2Hostname,
].filter((host): host is string => Boolean(host))));

const nextConfig: NextConfig = {
  allowedDevOrigins: ['192.168.0.3'],
  // Strip console.* in production builds. console.error stays so real
  // problems still surface. Lots of OAuth-debug / image-error logs were
  // leaking into prod and bloating the bundle.
  compiler: {
    removeConsole: process.env.NODE_ENV === "production" ? { exclude: ["error", "warn"] } : false,
  },
  images: {
    // Serve modern formats + right-sized variants instead of full-res originals.
    // All product/restaurant imagery lives in this single R2 bucket.
    formats: ["image/avif", "image/webp"],
    qualities: [45, 50, 55, 58, 60, 68, 75, 82, 85, 90],
    remotePatterns: [
      ...optimizedImageHosts.map((hostname) => ({ protocol: "https" as const, hostname })),
      { protocol: "https", hostname: "cdn-bk-se-ordering.azureedge.net" },
    ],
  },
  async headers() {
    // Apple Pay-domänassociationsfilen serverades som application/octet-stream
    // efter migrationen → vissa Apple/Stripe-verifieringar vill ha text/plain.
    return [
      {
        source: "/.well-known/apple-developer-merchantid-domain-association",
        headers: [{ key: "Content-Type", value: "text/plain" }],
      },
    ];
  },
  async rewrites() {
    return {
      fallback: [
        {
          source: "/api/:path*",
          destination: `${apiTarget}/api/:path*`,
        },
        {
          source: "/socket.io/:path*",
          destination: `${apiTarget}/socket.io/:path*`,
        },
      ],
    };
  },
};


export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: !process.env.SENTRY_AUTH_TOKEN,
  disableLogger: true,
});
