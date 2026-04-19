import type { NextConfig } from "next";

const apiTarget =
  process.env.API_PROXY_TARGET ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://127.0.0.1:4000";

const nextConfig: NextConfig = {
  allowedDevOrigins: ['192.168.0.3'],
  typescript: { ignoreBuildErrors: true },
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


export default nextConfig;
