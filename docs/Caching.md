# Caching

This document explains how request/data caching works in the app and how to clear it.

## Overview
- Uses Next.js `unstable_cache` for server-side data caching.
- Each cache entry is parameter-keyed and tagged for invalidation.
- We standardize on a global tag `all` so one operation can clear everything.

## How Caching Works
- Wrap server-side fetchers with `unstable_cache(fn, [key, params], { revalidate, tags })`.
- Use parameterized keys to scope results per input.
- Always include:
  - A specific tag (e.g., `site-lookup`, `page-lookup`, `listing-views`).
  - The global tag `all`.

Example:
```ts
unstable_cache(
  async () => {/* ... */},
  ['site-by-subdomain', subdomain],
  { revalidate: false, tags: ['site-lookup', 'all'] }
)
```

## Standard Tags
- `site-lookup`: Site-level lookups
- `page-lookup`: Page-level lookups
- `listing-views`: Paginated/product listing data
- `all`: Global tag included on every cache for universal invalidation

Implemented in:
- `src/lib/actions/pages/page-frontend-actions.ts` (site/page lookups)
- `src/lib/actions/pages/page-listing-views-actions.ts` (listing data)

## Site Resolver

Host-to-site resolution is cached and shared by middleware and page loaders.

- Resolver: `resolveSiteByHost(hostname)` in `src/lib/actions/pages/page-frontend-actions.ts`
  - Uses `unstable_cache` with tags `['site-lookup', 'all']`.
  - Normalizes host (strips `www.`), tries custom domain, then subdomain (skips `www`, `api`, `admin`, `app`).

- Middleware: `src/middleware.ts`
  - Calls `resolveSiteByHost(hostname)` (cached).
  - For custom domains: rewrites and sets `x-site-*` headers.
  - For subdomains: forwards request and sets `x-site-*` headers (no rewrite).

- Page loader helper: `getSiteFromHeaders()` in `src/lib/utils/site-resolver.ts`
  - Calls `resolveSiteByHost(host)` first (cached), then fetches site data by subdomain (fallback to domain when needed).
  - Does not rely on middleware headers to avoid 404s on rewrites.

## Clear Cache

Global clear-all:
- Endpoint: `POST /api/cache/clear`
  - File: `src/app/api/cache/clear/route.ts`
  - Behavior: `revalidateTag('all')` – invalidates any cache entry tagged with `all`.

Admin UI:
- Component: `src/components/admin/layout/dashboard/CacheSettingsCard.tsx`
- Rendered via `SiteDashboard` on the Site Settings page.
- The “Clear Cache” button calls `/api/cache/clear` and shows the result.

Programmatic usage:
```bash
curl -X POST https://<host>/api/cache/clear
```

## Adding New Cached Fetchers
When adding a new `unstable_cache`:
- Use a stable, parameterized key (array form).
- Choose a specific tag for the data domain (e.g., `directories`, `events`).
- Always include `'all'` in `tags`.

Template:
```ts
unstable_cache(
  async () => {/* fetch/compose data */},
  ['my-key', paramA, paramB],
  { revalidate: 3600, tags: ['my-domain-tag', 'all'] }
)
```

## Notes
- `revalidate: false` means entries persist until invalidated by tag; use tags for freshness.
- If unsure which tag to revalidate, use the global Clear Cache endpoint via admin.
