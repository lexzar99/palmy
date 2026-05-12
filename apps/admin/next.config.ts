import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const apiTarget =
  process.env.API_PROXY_TARGET ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://127.0.0.1:4000";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.0.3"],
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${apiTarget}/api/:path*`,
      },
      {
        source: "/socket.io/:path*",
        destination: `${apiTarget}/socket.io/:path*`,
      },
    ];
  },
};

// withSentryConfig sätter upp source maps automatiskt vid build om
// SENTRY_AUTH_TOKEN finns. Utan token bygger Next.js som vanligt
// och Sentry-events fungerar fortfarande (men stack traces blir
// minifierade).
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: !process.env.SENTRY_AUTH_TOKEN,
  disableLogger: true,
});
