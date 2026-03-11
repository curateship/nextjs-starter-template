# Security Checklist

Audit server actions, API routes, and database policies for missing auth, ownership, and security checks. Run this after building new features or periodically to catch gaps.

## When to Use

- After creating new server actions or API routes
- After modifying auth, middleware, or RLS policies
- When the user asks for a security review or audit
- Periodically as a codebase health check

## Checklist

### 1. Server Actions (`'use server'`)

Every exported server action that **reads or mutates data** must independently verify:

- [ ] **Authentication**: `getUser()` returns a valid user
- [ ] **Role check** (if admin-only): `user.app_metadata?.role === 'super_admin'`
- [ ] **Ownership**: The resource belongs to the authenticated user (e.g., `.eq('user_id', user.id)` or site ownership lookup)
- [ ] **Uses `supabaseAdmin` responsibly**: If bypassing RLS, the action MUST enforce its own auth/ownership checks — RLS is not a safety net when using the service role client

**Why**: Server actions are callable from any client-side code via POST. Middleware only protects page rendering, not action invocations. A regular user can call any exported `'use server'` function directly.

**How to audit**:
```bash
# Find all 'use server' files
grep -rl "'use server'" src/lib/actions/ src/app/

# For each file, check exported functions for:
# 1. getUser() call
# 2. Ownership verification (user_id, site_id check)
# 3. supabaseAdmin usage without auth
```

### 2. API Routes (`src/app/api/`)

- [ ] **Auth check**: Routes that serve private data or accept mutations verify the user session
- [ ] **Webhook routes**: Verify signatures cryptographically (HMAC-SHA256), not just header presence
- [ ] **Public routes**: Intentionally public endpoints are documented and have rate limiting considerations
- [ ] **No `Access-Control-Allow-Origin: *`** on routes that accept mutations
- [ ] **SSRF protection**: Any route that fetches user-supplied URLs validates against private IPs and whitelisted domains

### 3. Database RLS Policies

- [ ] **Every table has RLS enabled**
- [ ] **Policies scope to `auth.uid()`** or site ownership
- [ ] **Role checks use `app_metadata`** (not `user_metadata`) — `(auth.jwt() -> 'app_metadata' ->> 'role')`
- [ ] **`SECURITY DEFINER` functions** are reviewed for proper input validation
- [ ] **No `USING (true)`** on UPDATE/DELETE/INSERT policies (SELECT may be OK for truly public data)

### 4. Middleware Coverage

- [ ] **All `/admin` routes** require `super_admin` role
- [ ] **All `/user-pages` routes** require authentication
- [ ] **New route groups** are added to the middleware matcher if they need protection
- [ ] **API routes are excluded** from middleware (they handle their own auth)

### 5. Integration & Secrets

- [ ] **Sensitive config** (API keys, secrets) is encrypted before DB storage
- [ ] **Encryption key** is in `.env` only, never hardcoded
- [ ] **Service role key** (`SUPABASE_SERVICE_ROLE_KEY`) is never exposed to client
- [ ] **Webhook secrets** are verified cryptographically, not just checked for presence

## Report Format

After running the checklist, produce:

```
## Security Checklist Report

### Server Actions
- Total actions audited: X
- Missing auth: [list files]
- Missing ownership: [list files]
- Using supabaseAdmin without auth: [list files]

### API Routes
- Total routes audited: X
- Missing auth: [list files]
- Webhook verification issues: [list files]

### RLS Policies
- Tables with issues: [list tables]

### Summary
- Items passing: X/Y
- Items failing: X/Y
- Recommended fixes: [prioritized list]
```

## How to Run

1. Search for all `'use server'` files and all `src/app/api/` route files
2. Read each exported function
3. Check against the checklist items above
4. Report findings with file paths and line numbers
5. Offer to fix any issues found
