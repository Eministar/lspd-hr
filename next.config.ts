import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname),
  },
  serverExternalPackages: ['better-sqlite3'],
  images: {
    unoptimized: true,
    maximumDiskCacheSize: 0,
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'ALLOWALL' },
          { key: 'Content-Security-Policy', value: "frame-ancestors *" },
        ],
      },
      {
        source: '/((?!_next/static|favicon.ico|shield.webp|logo.webp|logo-og.png|opengraph-image|twitter-image|uploads).*)',
        headers: [
          { key: 'Cache-Control', value: 'no-store, max-age=0' },
        ],
      },
    ]
  },
  env: {
    NEXT_PUBLIC_BUILD_ID:
      process.env.VERCEL_GIT_COMMIT_SHA ??
      process.env.GITHUB_SHA ??
      process.env.NEXT_PUBLIC_BUILD_ID ??
      'local',
  },
};

export default nextConfig;
