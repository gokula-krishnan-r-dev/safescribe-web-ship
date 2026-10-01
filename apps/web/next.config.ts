import type { NextConfig } from 'next';
import path from 'node:path';

const monorepoRoot = path.resolve(__dirname, '../..');

const nextConfig: NextConfig = {
  transpilePackages: ['@safescript/shared'],
  // Ensure Turbopack resolves dependencies correctly in this pnpm monorepo.
  // Without this, Vercel may infer `apps/web/src/app` as the filesystem root.
  turbopack: { root: monorepoRoot },
  outputFileTracingRoot: monorepoRoot,
  images: {
    qualities: [75, 88, 90, 100],
  },
  async headers() {
    return [
      {
        source: '/mic/:path*',
        headers: [
          { key: 'Cache-Control', value: 'no-store, max-age=0' },
          { key: 'Pragma', value: 'no-cache' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          {
            key: 'Permissions-Policy',
            value: 'microphone=(self), camera=(), geolocation=(), payment=()',
          },
        ],
      },
      {
        source: '/favicon.ico',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=86400, stale-while-revalidate=604800' },
        ],
      },
      {
        source: '/safescribe-mark.png',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=86400, stale-while-revalidate=604800' },
        ],
      },
      {
        source: '/landing/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=86400, stale-while-revalidate=604800' },
        ],
      },
    ];
  },
  async redirects() {
    return [
      { source: '/ab', destination: '/activate', permanent: false },
      { source: '/alberta', destination: '/activate', permanent: false },
    ];
  },
};

export default nextConfig;
