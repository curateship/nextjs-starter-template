# HUB

HUB is the main `apps/hub` Next.js app. It is a multi-tenant website builder where each site is resolved from the request host, loaded from Postgres through Drizzle, and rendered through block-based frontend components.

## Start Here

Read these files in this order before changing HUB code:

1. `apps/hub/AGENTS.md`
2. `apps/hub/architecture/architecture-overview.md`
3. The runtime files directly related to your task

## Source Of Truth

- Multi-tenant site resolution: `src/lib/utils/site-resolver.ts`
- Tenancy and frontend site loading actions: `src/lib/actions/pages/page-frontend-actions.ts`
- Auth runtime: `src/lib/auth/server.ts`, `src/lib/auth/client.ts`, `src/app/api/auth/[...all]/route.ts`
- Database schema: `src/lib/db/schema/index.ts` and leaf files in `src/lib/db/schema/`
- Server actions and business logic: `src/lib/actions/**`
- Frontend routes: `src/app/**`
- Admin routes: `src/app/admin/**`
- Frontend renderers: `src/components/frontend/**`
- Admin builders: `src/components/admin/**`

## Working On HUB

- Route or page bug: inspect the matching `src/app/**` route, then its renderer in `src/components/frontend/**`, then the action/schema it depends on.
- Admin builder change: inspect the matching `src/app/admin/**` page, then the relevant builder under `src/components/admin/**`, then the action/schema it saves through.
- Admin modal/form change: use the shared admin form modal primitives in `src/components/admin/layout/builder/AdminModalLayout.tsx` for standard create, settings, and block-editor forms. Keep feature-specific files for business logic.
- Data or query change: inspect `src/lib/db/schema/**` first, then the action file, then the consuming route/component.
- Auth change: inspect Better Auth runtime files and auth API routes first. Do not infer auth behavior from legacy SQL.
- Tenant/domain change: inspect `src/lib/utils/site-resolver.ts` and the page frontend actions before touching URLs, host handling, or site lookup.

## Important Invariants

- HUB uses Better Auth, not Supabase auth.
- Drizzle schema and runtime code are the current database source of truth.
- `apps/hub/migrations/**` contains historical SQL and is not the runtime architecture authority.
- Site rendering is block-driven with separate admin builder and frontend renderer layers.
- Site navigation, footer, and breadcrumbs are shared site structure stored in top-level `site.settings`.
- Page and account-page builders edit page content blocks only. Navigation, footer, and breadcrumbs are edited from the admin Structure screens, not as page blocks.
- Frontend page-builder pages own the normal public root slug space.
- Account-page-builder pages require an existing active site membership and resolve only under `/account/*`.
- Site-facing auth is provided by the public Pages builder `auth` block. Platform admin auth is handled separately at `/admin-login`.
- `NEXT_PUBLIC_APP_DOMAIN` is the platform base domain. It is not a site's custom domain.
- Directory detail pages can load `content_blocks`, but large directory list/search/admin paths should only read lean top-level columns.

## Task Preflight

Before you change HUB code:

1. Read the docs above.
2. Inspect the relevant route, action, schema, and renderer or builder.
3. Summarize the relevant architecture in 3-5 bullets.
4. Only then implement the change.

If the change updates HUB architecture, update these docs in the same change.
