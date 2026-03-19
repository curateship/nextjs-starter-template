## Architecture Overview

This is a **multi-tenant platform** where each site is a separate tenant with its own subdomain, custom domain, content, and theme. Built on Next.js 15.3.4 with App Router.

### Multi-Tenant Architecture

**How it works:**
- Each site has a `subdomain` (e.g., `system-everything`) and optionally a `custom_domain` (e.g., `systemeverything.com`)
- The platform base URL is the Coolify sslip.io URL (e.g., `a5nnhgrzwx83prpn63pagwix.5.78.189.158.sslip.io`)
- Sites without a custom domain are accessed at `{subdomain}.{sslip.io-base-url}`
- Sites with a custom domain are accessed directly at that domain (e.g., `https://systemeverything.com`)
- `systemeverything.com` is NOT the platform — it is just one site's custom domain
- Site resolution happens via `getSiteFromHeaders()` which reads the `Host` header and resolves the site from the database

**Why sslip.io is the base URL:**
The sslip.io URL works because Coolify gives you `*.5.78.189.158.sslip.io` which automatically resolves any subdomain to your VPS IP. So `system-everything.5.78.189.158.sslip.io` and `my-other-site.5.78.189.158.sslip.io` both hit the same server, and the app resolves the site from the subdomain. You cannot use a site's custom domain (e.g., `systemeverything.com`) as the base because it's already assigned to a specific site — subdomains of it would conflict.

**URL Resolution (`src/lib/utils/site-url-generator.ts`):**
- Custom domain set → use custom domain directly
- No custom domain (production) → `http://{subdomain}.{NEXT_PUBLIC_APP_DOMAIN}` (sslip.io base)
- Development → `http://{subdomain}.localhost:3000`

**Environment Variables:**
- `NEXT_PUBLIC_APP_DOMAIN` — the platform base domain (sslip.io URL in production)
- `NEXT_PUBLIC_APP_URL` — the primary site URL (used for auth, meta tags, etc.)
- These are NOT the same thing

### Hosting & Infrastructure

- **Hosting**: Self-hosted on Coolify (Hetzner VPS, 4GB RAM)
- **Database**: Postgres on Hetzner VPS (not Supabase), accessed via Drizzle ORM
- **File Storage**: Cloudflare R2 (object storage only, not CDN)
- **CDN**: Cloudflare (proxied DNS, caches HTML pages at edge)
- **NOT on Vercel** — no Vercel-specific features (ISR, Edge Functions, etc.)

**Caching layers:**
- `unstable_cache` — server-side caching of DB query results (~15+ action files)
- Cloudflare CDN — caches HTML pages at edge (TTFB = 0ms for cached pages)
- Cache purge via `/api/cache/clear` → clears both `unstable_cache` and Cloudflare CDN
- Admin dashboard has "Clear Cache" button in Site Dashboard (`CacheSettingsCard`)
- No static HTML generation — every page is server-rendered, then cached by Cloudflare

### Data Model

**Site data flow:**
1. Request comes in → `getSiteFromHeaders()` resolves site by Host header
2. Site record includes blocks (navigation, hero, footer, etc.) as JSON
3. BlockRenderer components render blocks based on type
4. Each content type (products, posts, pages, categories, directories, events) belongs to a site via `site_id`

**Drizzle ORM notes:**
- Schema files use camelCase for JS variables (e.g., `categories.isPublished`)
- DB columns are snake_case (e.g., `is_published`)
- Action files that return data to the frontend must use snake_case aliases in `.select()` to match TypeScript interfaces, or the cast `as unknown as Type[]` will hide mismatches
- The categories table was previously called `taxonomies` in code — renamed to `categories` everywhere

### Frontend Rendering

**Layout hierarchy:**
- `layout.tsx` (server) — fonts, theme class on `<html>`, preconnect hints
- `SiteLayout` (client) — wraps each page with nav + footer + theme provider
- `SiteThemeProvider` (client) — wraps content in `next-themes` ThemeProvider, OR skips it entirely when dark mode toggle is disabled
- BlockRenderer (server) — renders page-specific blocks

**Content type renderers (all server components):**
- `PageBlockRenderer` — pages (hero, listing-views, FAQ, rich-text, etc.)
- `ProductBlockRenderer` — product pages
- `PostBlockRenderer` — blog posts
- `CategoryBlockRenderer` — category pages
- `DirectoryBlockRenderer` — directory pages
- `EventBlockRenderer` — event pages

All 6 renderers follow the same pattern: extract nav/footer from site blocks, wrap in `SiteLayout`, render content blocks.

### Folder Structure

**Application Routes:**
- `/app/` — frontend routes (homepage, products, posts, pages, categories, etc.)
- `/app/admin/` — admin dashboard
- `/app/api/` — API routes (media upload, cache clear, auth, etc.)

**Component Structure:**
```
/src/components/
├── ui/                    # Reusable UI components (ShadCN)
├── admin/                 # Admin dashboard components
│   ├── layout/            # Admin layout (sidebar, sticky header, dashboard cards)
│   ├── page-builder/      # Page builder blocks
│   ├── product-builder/   # Product builder blocks
│   ├── post-builder/      # Post builder blocks
│   ├── category-builder/  # Category builder blocks
│   ├── directory-builder/  # Directory builder blocks
│   ├── event-builder/     # Event builder blocks
│   └── media-library/     # Media picker and management
├── frontend/              # Frontend-facing components
│   ├── layout/            # SiteLayout, SiteThemeProvider, BlockContainer
│   ├── pages/             # Page blocks (hero, nav, footer, FAQ, etc.)
│   ├── products/          # Product blocks
│   ├── posts/             # Post blocks
│   ├── categories/        # Category blocks
│   ├── directories/       # Directory blocks
│   └── events/            # Event blocks
```

**File Naming:**
- `/components/ui/`: kebab-case (e.g., `product-hero-block.tsx`)
- `/components/admin/` and `/components/frontend/`: PascalCase (e.g., `ProductHeroBlock.tsx`)
