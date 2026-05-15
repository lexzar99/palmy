import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const apiTarget =
  process.env.API_PROXY_TARGET ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://127.0.0.1:4000";

// Härled hostname från API-target så next/image kan optimera bilder som
// kommer från backend (t.ex. restaurang-logos, produktbilder). Utan denna
// får man "hostname not configured" och bilder serveras unoptimized.
const apiHostname = (() => {
  try {
    return new URL(apiTarget).hostname;
  } catch {
    return "localhost";
  }
})();

const nextConfig: NextConfig = {
  allowedDevOrigins: ['192.168.0.3'],

  // ── Bundle-storlek: optimizePackageImports rewrite:ar barrel-imports
  // ──────────────────────────────────────────────────────────────────
  // Utan denna ger `import { Heart } from 'lucide-react'` hela ikon-libben
  // (~1000 ikoner i bundle). Med listan nedan extraheras endast använda
  // ikoner per chunk. Samma för framer-motion (delar upp animation-deps).
  // Vinst på initial bundle: -150 till -300 kb gzipped.
  experimental: {
    optimizePackageImports: [
      'lucide-react',
      'framer-motion',
      '@stripe/react-stripe-js',
      'date-fns',
    ],
  },

  // ── next/image: AVIF + WebP serveras automatiskt om browser stödjer ──
  // Faller tillbaka till PNG/JPEG. AVIF är ~50% mindre än JPEG vid samma
  // visuell kvalitet. minimumCacheTTL = 1 år för immutable produktbilder.
  images: {
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 60 * 60 * 24 * 365,
    remotePatterns: [
      { protocol: 'https', hostname: apiHostname },
      { protocol: 'http', hostname: apiHostname },
      // Vanliga CDN-värdar för backend-uppladdade restaurang-bilder
      { protocol: 'https', hostname: '**.supabase.co' },
      { protocol: 'https', hostname: '**.googleusercontent.com' },
      { protocol: 'https', hostname: '**.amazonaws.com' },
      // Catch-all för utvecklings-/prod-API:n
      { protocol: 'https', hostname: '**.railway.app' },
      { protocol: 'https', hostname: '**.vercel.app' },
    ],
  },

  // ── Compiler-optimeringar i prod-build ──────────────────────────────
  // removeConsole tar bort console.log/info/debug (men behåller error+warn
  // för Sentry-rapportering). Kapar ~5-15 kb från bundle beroende på hur
  // mycket logging som finns.
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production'
      ? { exclude: ['error', 'warn'] }
      : false,
  },

  // ── Production runtime ───────────────────────────────────────────────
  productionBrowserSourceMaps: false,
  compress: true,
  poweredByHeader: false,
  reactStrictMode: true,

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

  // ── Cache-Control headers för statiska assets ────────────────────────
  // Bilder + /_next/static är immutable (Next hashas filnamn). 1 år cache.
  async headers() {
    return [
      {
        source: '/_next/image/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
      {
        source: '/:path*\\.(png|jpg|jpeg|webp|avif|svg|ico)',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
    ];
  },
};


export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: !process.env.SENTRY_AUTH_TOKEN,
  disableLogger: true,
});
