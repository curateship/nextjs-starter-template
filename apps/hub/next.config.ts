import type { NextConfig } from "next";
import path from "path";

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
      script-src 'self' 'unsafe-inline' https://js.stripe.com https://static.cloudflareinsights.com;
      style-src 'self' 'unsafe-inline';
      img-src 'self' blob: data: https:;
      font-src 'self' data:;
      connect-src 'self' https://api.stripe.com https://*.cloudflareinsights.com;
      frame-src https://js.stripe.com;
      object-src 'none';
      frame-ancestors 'none';
      base-uri 'self';
      form-action 'self';
    `.replace(/\n/g, '').replace(/\s+/g, ' ').trim()
  }
];

const nextConfig: NextConfig = {
  output: 'standalone',
  // jsdom (via isomorphic-dompurify) loads data files such as
  // browser/default-stylesheet.css relative to its own __dirname. Bundling it
  // rewrites that path and the read fails at build time under pnpm's layout.
  // Keeping it external makes it a plain runtime require from node_modules.
  serverExternalPackages: ['isomorphic-dompurify', 'jsdom'],
  outputFileTracingRoot: path.join(__dirname, '../../'),
  outputFileTracingIncludes: {
    // @napi-rs/canvas is a native transitive dependency of pdf-parse. Next's
    // tracer misses the .node binary, so it is included explicitly.
    // A glob that matches nothing is NOT an error, so both layouts are listed:
    // the flat pair is npm's hoisted layout (still used by the root Dockerfile),
    // the .pnpm pair is pnpm's. Drop the flat pair once Docker moves to pnpm.
    '/*': [
      '../../node_modules/@napi-rs/canvas/**/*',
      '../../node_modules/@napi-rs/canvas-*/**/*',
      '../../node_modules/.pnpm/@napi-rs+canvas@*/node_modules/@napi-rs/canvas/**/*',
      '../../node_modules/.pnpm/@napi-rs+canvas-*/node_modules/@napi-rs/canvas-*/**/*',
    ],
  },
  experimental: {
    cpus: 1,
    serverActions: {
      bodySizeLimit: '10mb',
    },
    optimizePackageImports: [
      'lucide-react',
      'motion',
      '@radix-ui/react-icons',
      'date-fns',
      'sonner',
    ],
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
        hostname: "*.r2.dev",
      },
      {
        protocol: "https",
        hostname: "*.cloudfront.net",
      },
    ],
  },
  async rewrites() {
    const r2Url = process.env.R2_PUBLIC_URL
    if (!r2Url) return []
    return [
      { source: '/cdn/:path*', destination: `${r2Url}/:path*` },
    ]
  },
  async headers() {
    // Disable CSP in development for testing
    if (process.env.NODE_ENV === 'development') {
      return [];
    }

    return [
      {
        // Apply security headers to all routes
        source: '/:path*',
        headers: securityHeaders,
      },
      {
        source: '/cdn/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
      {
        source: '/fonts/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
    ];
  },
};

export default nextConfig;
