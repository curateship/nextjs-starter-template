import type { NextConfig } from "next";

const securityHeaders = [
  {
    key: 'X-DNS-Prefetch-Control',
    value: 'on'
  },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload'
  },
  {
    key: 'X-Frame-Options',
    value: 'SAMEORIGIN'
  },
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff'
  },
  {
    key: 'Referrer-Policy',
    value: 'origin-when-cross-origin'
  },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=()'
  },
  {
    key: 'Content-Security-Policy',
    value: `
      default-src 'self';
      script-src 'self' 'unsafe-eval' 'unsafe-inline' https://*.supabase.co https://js.stripe.com https://*.posthog.com https://*.google-analytics.com https://*.googletagmanager.com https://*.flodesk.com;
      style-src 'self' 'unsafe-inline';
      img-src 'self' blob: data: https:;
      font-src 'self' data:;
      connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.stripe.com https://*.posthog.com https://*.google-analytics.com https://*.googletagmanager.com https://*.analytics.google.com https://*.flodesk.com;
      frame-src https://js.stripe.com;
      object-src 'none';
      frame-ancestors 'none';
      base-uri 'self';
      form-action 'self';
    `.replace(/\n/g, '').replace(/\s+/g, ' ').trim()
  }
];

const nextConfig: NextConfig = {
  experimental: {
    optimizePackageImports: [
      'lucide-react',
      'framer-motion',
      'motion',
      '@radix-ui/react-icons',
      'date-fns',
      'sonner',
    ],
  },
  eslint: {
    // Warning: This allows production builds to successfully complete even if
    // your project has ESLint errors.
    ignoreDuringBuilds: true,
  },
  images: {
    deviceSizes: [384, 640, 1080, 1920],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
      {
        protocol: "https",
        hostname: "dqlgeutcmshgcwbactmu.supabase.co",
      },
      {
        protocol: "https",
        hostname: "*.supabase.co",
      },
      {
        protocol: "https",
        hostname: "*.r2.dev",
      },
      {
        protocol: "https",
        hostname: "*.cloudfront.net",
      },
    ],
  },
  async headers() {
    // Disable CSP in development for testing
    if (process.env.NODE_ENV === 'development') {
      return [];
    }

    const cacheTtl = process.env.CACHE_TTL_SECONDS || '31536000'
    const cacheHeader = {
      key: 'Cache-Control',
      value: `public, s-maxage=${cacheTtl}, stale-while-revalidate=${cacheTtl}`,
    }

    const publicCacheRoutes = [
      '/',
      '/posts/:slug*',
      '/products/:slug',
      '/categories/:slug*',
      '/directories/:slug*',
      '/events/:slug*',
      '/pages/:slug*',
    ]

    return [
      {
        // Apply security headers to all routes
        source: '/:path*',
        headers: securityHeaders,
      },
      ...publicCacheRoutes.map(source => ({
        source,
        headers: [cacheHeader],
      })),
    ];
  },
};

export default nextConfig;
