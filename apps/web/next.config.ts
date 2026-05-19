import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const apiTarget =
  process.env.API_PROXY_TARGET ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://127.0.0.1:4000";

const nextConfig: NextConfig = {
  allowedDevOrigins: ['192.168.0.3'],
  // Strip console.* in production builds. console.error stays so real
  // problems still surface. Lots of OAuth-debug / image-error logs were
  // leaking into prod and bloating the bundle.
  compiler: {
    removeConsole: process.env.NODE_ENV === "production" ? { exclude: ["error", "warn"] } : false,
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
