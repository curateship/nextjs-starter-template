## Architecture Overview

This is a **Turborepo monorepo** containing the System Everything platform. The main app (`apps/hub/`) is a **multi-tenant website builder** where each site is a separate tenant with its own subdomain, custom domain, content, and theme. Built on Next.js 15 with App Router.

### Source Of Truth

When HUB docs and code disagree, trust current runtime code and Drizzle schema:

- Tenant resolution: `src/lib/utils/site-resolver.ts`
- Tenant-aware page loading: `src/lib/actions/pages/page-frontend-actions.ts`
- Auth runtime: `src/lib/auth/server.ts`, `src/lib/auth/client.ts`, `src/app/api/auth/[...all]/route.ts`
- Database schema: `src/lib/db/schema/index.ts` and leaf schema files in `src/lib/db/schema/`
- Business logic and data access: `src/lib/actions/**`
- Frontend routes: `src/app/**`
- Admin routes: `src/app/admin/**`
- Frontend rendering: `src/components/frontend/**`
- Admin builders: `src/components/admin/**`

Do not treat `apps/hub/migrations/**` as the runtime source of truth. Those files include historical and legacy SQL patterns.

### Monorepo Structure

```
├── apps/hub/          # Main Next.js app (website builder SaaS)
├── packages/          # Shared packages (future — extract when building 2nd app)
├── services/          # Python/other services (future)
├── package.json       # Root workspace config (npm workspaces)
├── turbo.json         # Turborepo task config
├── Dockerfile         # Builds apps/hub for production
└── .claude/           # Claude Code config and docs
```

All app source code, configs, and `.env` files live in `apps/hub/`.

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

**Runtime files to inspect for tenant changes:**
- `src/lib/utils/site-resolver.ts`
- `src/lib/actions/pages/page-frontend-actions.ts`
- `src/lib/utils/site-url-generator.ts`
- Frontend routes in `src/app/**` that call `getSiteFromHeaders()`

### Hosting & Infrastructure

- **Hosting**: Self-hosted on Coolify (Hetzner VPS, 4GB RAM)
- **Database**: Postgres on Hetzner VPS (not Supabase), accessed via Drizzle ORM
- **File Storage**: Cloudflare R2 (object storage only, not CDN)
- **CDN**: Cloudflare (proxied DNS, caches HTML pages at edge)
- **Deployment**: Dockerfile at repo root builds `apps/hub` as standalone Next.js server
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
2. Shared site chrome lives in top-level `site.settings.navigation`, `site.settings.footer`, and `site.settings.breadcrumbs`
3. Page/content rows store only their own content blocks as JSON
4. Each content type (products, posts, pages, categories, directories, events, sponsors) belongs to a site via `site_id`
5. Site-facing users are global Better Auth users linked to sites through `site_memberships`; site role/status/activity live on that join table, not on the global user row

**Frontend slug resolution:**
- Public page-builder pages own the normal frontend slug space first.
- If no published page-builder page matches a slug, the frontend catch-all can resolve a published account-page-builder page at that same slug.
- Account pages that contain an `auth` block are public auth entry points.
- Account pages without an `auth` block require an authenticated Better Auth session.
- Site-facing auth and member pages resolve through normal frontend slugs from the account-pages builder; platform admin auth lives at `/admin-login`.

**Drizzle ORM notes:**
- Schema files use camelCase for JS variables (e.g., `categories.isPublished`)
- DB columns are snake_case (e.g., `is_published`)
- Action files that return data to the frontend must use snake_case aliases in `.select()` to match TypeScript interfaces, or the cast `as unknown as Type[]` will hide mismatches
- The categories table was previously called `taxonomies` in code — renamed to `categories` everywhere
- Large directory datasets keep `content_blocks` on the canonical row, but list/search/admin paths should use summary queries that only read indexed top-level columns like `status`
- Site-user dashboards should query `site_memberships` joined to `users`, and should treat `site_memberships.last_engaged_at` as the site-specific engagement source of truth

**Data layer files to inspect first:**
- `src/lib/db/schema/index.ts`
- The relevant schema leaf file in `src/lib/db/schema/`
- The matching action file in `src/lib/actions/**`

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

All 6 renderers follow the same pattern: resolve nav/footer from top-level site settings, wrap in `SiteLayout`, render content blocks.

**Renderer source of truth:**
- Pages: `src/components/frontend/pages/PageBlockRenderer.tsx`
- Products: `src/components/frontend/products/ProductBlockRenderer.tsx`
- Posts: `src/components/frontend/posts/PostBlockRenderer.tsx`
- Categories: `src/components/frontend/categories/CategoryBlockRenderer.tsx`
- Directories: `src/components/frontend/directories/DirectoryBlockRenderer.tsx`
- Events: `src/components/frontend/events/EventBlockRenderer.tsx`

### Folder Structure

All paths below are relative to `apps/hub/`.

**Application Routes:**
- `src/app/` — frontend routes (homepage, products, posts, pages, categories, etc.)
- `src/app/admin/` — admin dashboard
- `src/app/api/` — API routes (media upload, cache clear, auth, etc.)

**Component Structure:**
```
apps/hub/src/components/
├── ui/                    # Reusable UI components (ShadCN)
├── admin/                 # Admin dashboard components
│   ├── layout/            # Admin layout (sidebar, sticky header, dashboard cards)
│   ├── page-builder/      # Page builder blocks
│   ├── structure/         # Shared site navigation/footer editors
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

**Admin modal convention:**
- Standard admin create, settings, and block-editor forms should use the shared form modal primitives in `src/components/admin/layout/builder/AdminModalLayout.tsx`.
- Keep feature-specific modal files for their own form fields, save logic, and route wiring. Share the dialog shell, not the business logic.
- Leave truly custom dialogs such as media pickers and other utility flows on custom shells until repetition proves they belong in the shared form modal system.
- Builder and editor pages should keep a single `StickyHeader`: section navigation on the left, current-item actions in `rightActions`, and no extra toolbar row beneath it.
- Admin dashboard list pages should also render filters and primary actions in the sticky header top-right controls; `DashboardSubheader` is breadcrumb-only.

### Working On HUB

Use this map before changing code:

- Route bug or feature: inspect the matching route in `src/app/**`, then its renderer in `src/components/frontend/**`, then the action and schema it depends on.
- Admin builder bug or feature: inspect the admin route in `src/app/admin/**`, then the builder under `src/components/admin/**`, then the action and schema it saves through.
- Admin modal or builder form change: check whether the work belongs on the shared admin form modal primitives before hand-rolling new dialog spacing or footer layout.
- Account/auth page routing task: inspect `src/app/[...slug]/page.tsx`, `src/lib/actions/account-pages/account-pages-frontend-actions.ts`, and the account-page builder/runtime files before changing redirects or slug behavior.
- Structure/navigation/footer/breadcrumbs task: inspect the Structure routes plus `src/lib/utils/site-structure.ts` before changing page-builder behavior.
- Auth task: inspect `src/lib/auth/server.ts`, `src/lib/auth/client.ts`, and `src/app/api/auth/[...all]/route.ts` first.
- Data or query task: inspect the relevant Drizzle schema file before changing actions or UI.
- Tenant/domain task: inspect site resolution and URL generation before changing host or domain logic.

For any HUB task, read `apps/hub/AGENTS.md`, inspect the relevant runtime files, and summarize the relevant architecture before making code changes.
