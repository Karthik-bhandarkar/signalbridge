import type { NextConfig } from "next";

const DJANGO_URL = process.env.DJANGO_URL || "http://127.0.0.1:8000";

const nextConfig: NextConfig = {
  skipTrailingSlashRedirect: true,
  output: "standalone",
  async rewrites() {
    return [
      {
        source: "/api/:path*/",
        destination: `${DJANGO_URL}/api/:path*/`,
      },
      {
        source: "/api/:path*",
        destination: `${DJANGO_URL}/api/:path*/`,
      },
    ];
  },
};

export default nextConfig;
