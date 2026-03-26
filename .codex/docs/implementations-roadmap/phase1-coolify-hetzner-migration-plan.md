# Migration Plan: Supabase + Vercel → Hetzner (Coolify)

**Date:** 2026-03-15
**Status:** Planning Phase
**Estimated Duration:** 13-18 days

## Context

Moving the entire stack from Supabase (auth + database) and Vercel (hosting) to a self-hosted Hetzner VPS managed by Coolify. Motivated by cost, control, performance, and data sovereignty. Cloudflare R2, Stripe, Resend, and Flodesk remain unchanged.

**Key finding:** The codebase already bypasses Supabase RLS — every server action uses `supabaseAdmin` (service role) for all DB queries and manually checks `auth.getUser()` for authentication. This means we don't need to replicate RLS at all, just keep the same auth-check-then-query pattern.

**Scale:** 59 files import Supabase, 47 files call `auth.getUser()`, 30+ tables, 117 migrations, 10+ PostgreSQL functions.

**MCP-assisted:** Claude can manage Hetzner, Coolify, and PostgreSQL directly via MCP servers throughout the migration.

---

## Phase 0: MCP Server Setup

Set up 3 MCP servers so Claude can directly manage infrastructure, deployments, and database.

### 0.1 Hetzner Cloud MCP — `dkruyt/mcp-hetzner`
- Most mature option (~80+ stars, listed on Hetzner's official awesome-hcloud)
- Manages: servers, volumes, firewalls, SSH keys, images, locations
- **Install:** `pip install mcp-hetzner` (or run via `uvx mcp-hetzner`)
- **Requires:** Hetzner Cloud API token (generate at https://console.hetzner.cloud → project → Security → API Tokens)
- **Config** (add to `.claude/settings.json` or `claude_desktop_config.json`):
  ```json
  {
    "mcpServers": {
      "hetzner": {
        "command": "uvx",
        "args": ["mcp-hetzner"],
        "env": { "HCLOUD_API_TOKEN": "<your-hetzner-api-token>" }
      }
    }
  }
  ```

### 0.2 Coolify MCP — `@masonator/coolify-mcp`
- 38 tools: servers, projects, apps, databases, deployments, SSH keys, env vars, built-in docs search
- **Install:** `npm install -g @masonator/coolify-mcp`
- **Requires:** Coolify API token + Coolify instance URL (available after Coolify is installed in Phase 2)
- **Config:**
  ```json
  {
    "mcpServers": {
      "coolify": {
        "command": "npx",
        "args": ["-y", "@masonator/coolify-mcp"],
        "env": {
          "COOLIFY_API_TOKEN": "<your-coolify-api-token>",
          "COOLIFY_BASE_URL": "https://coolify.yourdomain.com"
        }
      }
    }
  }
  ```

### 0.3 PostgreSQL MCP — `crystaldba/postgres-mcp`
- Read/write queries, index tuning, EXPLAIN plans, health checks (buffer cache, vacuum, replication)
- **Install:** `pip install postgres-mcp` (or run via `uvx postgres-mcp`)
- **Requires:** PostgreSQL connection string (available after DB is created in Phase 2)
- **Config:**
  ```json
  {
    "mcpServers": {
      "postgres": {
        "command": "uvx",
        "args": ["postgres-mcp", "postgresql://user:pass@host:5432/dbname"]
      }
    }
  }
  ```

### 0.4 Setup order
1. Create Hetzner API token → configure Hetzner MCP → Claude provisions VPS
2. Install Coolify on VPS → get Coolify API token → configure Coolify MCP → Claude manages deployments
3. Create PostgreSQL via Coolify → get connection string → configure PostgreSQL MCP → Claude manages schema/data

---

## Phase 1: Preparation (Dependencies + Drizzle Schema)

### 1.1 Install dependencies
```
Add: drizzle-orm, drizzle-kit, pg, @types/pg, next-auth@beta, @auth/drizzle-adapter, bcryptjs, @types/bcryptjs, sharp
Remove: @supabase/ssr, @supabase/supabase-js, @vercel/analytics, @vercel/speed-insights
```

### 1.2 Create Drizzle schema + client
- **New:** `src/lib/db/schema.ts` — Drizzle table definitions for all 30+ tables (derived from `supabase/migrations/`)
- **New:** `src/lib/db/index.ts` — Drizzle client (`drizzle(pool)` with `DATABASE_URL`)
- **New:** `src/lib/db/schema/users.ts` — Local `users` table replacing `auth.users`:
  ```
  id (UUID PK), email (unique), password_hash, display_name, role ('super_admin'|'end_user'),
  email_verified_at, user_metadata (JSONB), created_at, updated_at
  ```
- All `user_id REFERENCES auth.users(id)` foreign keys → reference local `users` table instead

### 1.3 Update next.config.ts
- Add `output: 'standalone'` (required for Docker/Coolify)
- Remove `*.supabase.co` from CSP headers

---

## Phase 2: Infrastructure (Hetzner + Coolify)

### 2.1 Hetzner VPS
- Provision **CPX31** (4 vCPU, 8GB RAM, 160GB disk) or larger
- Ubuntu 22.04 LTS, location based on user base

### 2.2 Coolify
- Install Coolify on VPS
- Add PostgreSQL 16 as a Coolify-managed service
- Connect GitHub repo, set build pack to Dockerfile

### 2.3 Dockerfile
- **New:** `/Dockerfile` — Multi-stage build (deps → build → standalone runner)
- Uses `node:20-alpine`, copies `.next/standalone` + `.next/static`

### 2.4 DNS
- Wildcard `*.yourdomain.com` → Hetzner IP (for multi-tenant subdomains)
- Root domain → Hetzner IP
- Coolify handles SSL via Let's Encrypt (wildcard via DNS challenge)

### 2.5 Cron jobs (Coolify scheduled tasks or system cron)
```
*/5 * * * * curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/newsletters
*/5 * * * * curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/email-automations
0 * * * *   curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/engagement
```

---

## Phase 3: Auth Migration (Supabase Auth → Auth.js)

### 3.1 Auth.js config
- **New:** `src/lib/auth.ts` — NextAuth v5 config with Credentials provider + DrizzleAdapter
  - JWT session strategy (matches current cookie-based auth)
  - `authorize()` queries local `users` table, uses `bcrypt.compare()`
  - JWT callback adds `role` and `id` to token
  - Session callback exposes `role` and `id`
- **New:** `src/app/api/auth/[...nextauth]/route.ts` — Auth.js route handler

### 3.2 Auth helper
- **New:** `src/lib/auth/session.ts` — `requireAuth()` and `requireAdmin()` helpers
  - Replaces the pattern: `createServerSupabaseClient()` → `auth.getUser()`
  - Used by all 47 files that currently check authentication

### 3.3 Middleware rewrite
- **Modify:** `src/middleware.ts` — Replace Supabase SSR client with Auth.js `auth()` wrapper
  - Same route protection logic: `/admin` → super_admin, `/user-pages` + `/user-dashboard` → authenticated

### 3.4 Server action auth replacement (47 files)
Replace in every server action file:
```typescript
// OLD
const supabase = await createServerSupabaseClient()
const { data: { user } } = await supabase.auth.getUser()

// NEW
const user = await requireAuth()
```

### 3.5 Client-side auth (2 files)
- **Modify:** `src/app/login/page.tsx` — Replace `supabase.auth.signInWithPassword()` with `signIn('credentials', ...)`
- **Modify:** `src/components/frontend/pages/auth/AuthBlock.tsx` — Replace client-side Supabase auth with:
  - Login: `signIn('credentials', ...)`
  - Registration: new server action → `bcrypt.hash()` + insert into `users`
  - Password reset: new server action → generate token, send email via Resend

### 3.6 Auth action rewrites
- **Modify:** `src/lib/actions/auth/auth-actions.ts` — Replace all Supabase auth calls:
  - `signUpAction` → bcrypt hash + Drizzle insert into `users`
  - `updatePasswordAction` → bcrypt hash + Drizzle update
  - `resetPasswordAction` → generate token, store in DB, send via Resend
- **Modify:** `src/lib/actions/auth/account-auto-creation.ts` — Replace `supabaseAdmin.auth.admin.createUser()` with Drizzle insert

---

## Phase 4: Database Query Migration (Supabase SDK → Drizzle)

### 4.1 Pattern mapping
| Supabase | Drizzle |
|---|---|
| `.from('t').select('*').eq('id', v).single()` | `db.query.t.findFirst({ where: eq(t.id, v) })` |
| `.select('*', {count:'exact'}).range(a,b)` | `db.select().from(t).limit(n).offset(a)` + count query |
| `.insert([{...}]).select().single()` | `db.insert(t).values({...}).returning()` |
| `.update({...}).eq('id', v)` | `db.update(t).set({...}).where(eq(t.id, v))` |
| `.delete().eq('id', v)` | `db.delete(t).where(eq(t.id, v))` |
| `.rpc('fn', params)` | `db.execute(sql\`SELECT fn(...)\`)` |

### 4.2 File migration (59 files) — priority order
1. `src/lib/actions/sites/site-actions.ts` (most central)
2. `src/lib/actions/pages/page-frontend-actions.ts` (public-facing)
3. `src/lib/actions/posts/post-actions.ts`
4. `src/lib/actions/products/product-actions.ts`
5. All remaining action files in `src/lib/actions/`
6. API routes: `src/app/api/cron/`, `src/app/api/webhooks/`
7. Page components that query directly

Each file: replace `supabaseAdmin` import with `db` import, convert query chains to Drizzle syntax.

### 4.3 PostgreSQL functions
Keep as database functions, recreate in new DB via Drizzle migration:
- `get_analytics_overview()`, `get_top_pages()`, `get_top_referrers()`, `get_traffic_over_time()`, `get_user_journeys()`, `increment_click_count()`
- `generate_subdomain_suggestion()`, `get_system_statistics()`
- Triggers: `update_updated_at_column()`, `create_default_pages_for_site()`, etc.

---

## Phase 5: Cleanup

### 5.1 Remove Supabase files
- **Delete:** `src/lib/supabase/client.ts`, `src/lib/supabase/server.ts`
- **Delete:** `supabase/` directory (config, migrations — keep a backup)

### 5.2 Remove Vercel components
- **Modify:** `src/components/frontend/layout/deferred-scripts.tsx` — Remove `Analytics` + `SpeedInsights` imports

### 5.3 Environment variables
Replace:
```
NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
```
With:
```
DATABASE_URL=postgresql://user:pass@host:5432/dbname
AUTH_SECRET=<random-32-chars>
AUTH_URL=https://yourdomain.com
```

---

## Phase 6: Data Migration + Cutover

### 6.1 Data migration script
- **New:** `scripts/migrate-data.ts` — Connects to both Supabase (direct PG connection) and new PG
- Exports `auth.users` → transforms → imports into local `users` table (preserving UUIDs + bcrypt hashes)
- Exports all content tables in FK-dependency order (themes → sites → content → analytics)

### 6.2 Cutover steps
1. Lower DNS TTL to 60s (1 day before)
2. Put current app in maintenance mode
3. Run final data migration script
4. Verify row counts match
5. Deploy to Coolify
6. Update DNS to Hetzner IP
7. Update Stripe + Resend webhook URLs (if domain changes)
8. Verify: login, cron jobs, newsletter sends, payments
9. Keep Supabase running 1 week as rollback
10. Decommission Supabase after 1 week

### 6.3 Backups
- Daily `pg_dump` via cron → upload to R2 for offsite storage
- Or use Coolify's built-in backup scheduling to S3-compatible storage

---

## Verification

- [ ] Docker build succeeds locally (`docker build .`)
- [ ] Auth.js login works with migrated bcrypt password hashes
- [ ] All CRUD operations work (create/edit/delete site, page, post, product)
- [ ] Multi-tenant subdomain routing resolves correctly
- [ ] Cron endpoints execute successfully
- [ ] Stripe webhook processes payments
- [ ] Resend webhook tracks email events
- [ ] Newsletter sending works end-to-end
- [ ] Image upload to R2 still works
- [ ] Admin dashboard loads with analytics data (RPC functions)
- [ ] `curl -s -o /dev/null -w "%{http_code}" https://yourdomain.com` returns 200

---

## Effort Estimate

| Phase | Days |
|-------|------|
| Phase 0: MCP server setup | 0.5 |
| Phase 1: Prep (deps + schema) | 2-3 |
| Phase 2: Infrastructure (Hetzner + Coolify) | 1 |
| Phase 3: Auth migration | 3-4 |
| Phase 4: DB query migration (59 files) | 5-7 |
| Phase 5: Cleanup | 0.5 |
| Phase 6: Data migration + cutover | 1-2 |
| **Total** | **~13-18 days** |
