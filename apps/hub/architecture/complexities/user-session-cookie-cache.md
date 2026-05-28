# User Session Cookie Cache

This note records the decisions around the shared frontend nav, Better Auth session cookies, and why the final implementation uses cookie-backed rendering with live invalidation.

## Why This Change Happened

We had two conflicting goals:

- the nav should render signed-in state immediately without waiting for a client-side session fetch
- bans, revocations, and admin user changes must still take effect quickly

The old nav behavior waited for a client-side Better Auth session fetch after hydration, which made the user toggle appear late.

## Final Decisions

### 1. `/admin-login` is the admin entry point

We use `/admin-login` as the platform/admin login surface.

- it uses Better Auth email sign-in
- it redirects successful sign-in to `/admin`

Relevant file:

- `src/app/admin-login/page.tsx`

### 2. Public auth-block pages are the frontend/user entry point

We use the shared `AuthBlock` inside public Pages builder pages as the frontend auth surface.

- it uses the same Better Auth backend as `/admin-login`
- it supports `?tab=login` and `?tab=register`
- it redirects based on block config and optional `redirect` query params

Relevant file:

- `src/components/frontend/pages/auth/AuthBlock.tsx`

Important consequence:

- `/admin-login` and public auth-block pages are not separate auth systems
- they are separate entry points with different redirect behavior

### 3. Local subdomain auth needs trusted local origins

Local auth on `system-everything.localhost:3000` is not the same origin as `localhost:3000`.

That local subdomain must be trusted by Better Auth or sign-in will be rejected.

Practical rule:

- local auth must trust both `localhost` and `*.localhost`

### 4. Nav starts from the server cookie state

The shared nav does not wait on client-side Better Auth session fetching for its first render.

Current flow:

1. `layout.tsx` reads Better Auth cookie cache on the server.
2. If that cache is missing or rejected but a session token exists, `layout.tsx` falls back to `auth.api.getSession()`.
3. It maps either source into the same small user object.
4. It passes that user object into `SiteAuthProvider`.
5. `SiteAuthProvider` uses the server user immediately, then syncs the context from Better Auth client session changes after hydration.
6. `NavBlock` reads that user from context.

Relevant files:

- `src/app/layout.tsx`
- `src/components/frontend/layout/site-auth-provider.tsx`
- `src/components/frontend/pages/navigation/PageNavigationBlock.tsx`

Why this was done:

- faster first paint for signed-in nav state
- no blank guest-to-user flash before the server-seeded nav paints
- login, logout, and user updates can update the mobile and desktop account menus without a manual page refresh
- cleaner UI than rendering guest controls and replacing them later
- same signed-in state as `/admin` when the cache cookie is stale or absent but the session token is valid

### 5. Desktop nav hover delay was removed

The desktop dropdown hover delay was removed because it made the menu feel sluggish.

Relevant file:

- `src/components/frontend/pages/navigation/PageNavigationBlock.tsx`

## Cookie Cache Tradeoff

### First idea: trust the cookie for the full session lifetime

We considered using a long-lived cookie cache as the nav source and trusting it for the full 7-day session lifetime.

That would reduce DB usage, but it creates a stale-auth problem:

- banned users could keep looking signed in
- revoked sessions could keep looking valid
- role changes would not apply quickly

That approach was rejected as too risky.

### Final approach: keep fast nav rendering, but version the cache against live state

The final implementation keeps the 7-day Better Auth cookie cache, but adds a live version check.

Current behavior:

- Better Auth cookie cache `maxAge` is 7 days
- the cache is versioned against the live `user_sessions` row and live `users` row
- if the live version does not match the cached version, the cached auth payload is not trusted
- if the cache is missing or rejected but `better-auth.session_token` exists, the root layout reads the live Better Auth session once
- if the live session succeeds, the frontend nav receives the signed-in user instead of rendering guest controls

Relevant file:

- `src/lib/auth/server.ts`
- `src/app/layout.tsx`

Why this was done:

- keep the nav fast
- keep bans, revocations, and admin user edits effective on the next request
- avoid a blind stale-auth window
- avoid a split-brain state where `/admin` is accessible but the frontend nav says the user is logged out

## The `/admin` Versus Frontend Nav Mismatch

Bug fixed:

- `/admin` could be accessible because it checks `auth.api.getSession()`
- the frontend nav could still render logged-out controls because it only trusted the cookie-cache payload

The fix is intentionally small:

- use the cookie cache first
- only call `auth.api.getSession()` when there is no usable cache but there is a session token
- map both sources through the same user-shaping helper before passing data to `SiteAuthProvider`

This preserves the fast path for normal page loads while making the fallback path match the admin auth source of truth.

## What Invalidates Cached Auth

Right now the cache version includes live user-row and session-row values.

That means these changes can invalidate cached auth for that user:

- session revocation
- role change
- ban or unban
- ban expiry change
- name change
- email change
- display name change
- session row update

Important scope rule:

- changing User A does not invalidate User B
- it affects the changed user only
- it affects all active sessions for that changed user, because the version is derived from shared live user/session state

## Does This Log The User Out Instantly

Not literally at the exact millisecond an admin saves.

What happens is:

- the user’s cached auth becomes invalid
- on their next request, the cached value is rejected

Then:

- normal profile edits should refresh auth state, not force logout
- bans and revoked sessions should stop the user from continuing as authenticated

Important limit:

- true instant kick-out without waiting for another request would require realtime push or websocket-style coordination, which HUB does not currently have

## Why Zero DB Checks Was Not Kept

A pure cookie-only approach and immediate admin-driven revocation are incompatible goals.

If bans, revocations, and role changes need to take effect quickly, the server must compare the cached auth payload against live state somewhere.

So the final rule is:

- use the server cookie/session path for the initial nav render
- let the client session update the auth context after login, logout, or user changes
- but yes, a lightweight server-side live-state check is allowed for security-sensitive invalidation
- and yes, a live session fallback is allowed when the cache is absent or invalid but the session token is present

## Current Source Of Truth Files

If this area needs work again, inspect these first:

- `src/app/admin-login/page.tsx`
- `src/components/frontend/pages/auth/AuthBlock.tsx`
- `src/app/[...slug]/page.tsx`
- `src/app/layout.tsx`
- `src/components/frontend/layout/site-auth-provider.tsx`
- `src/components/frontend/pages/navigation/PageNavigationBlock.tsx`
- `src/lib/auth/server.ts`
- `src/lib/auth/client.ts`
- `src/app/admin/layout.tsx`

## Practical Rules Going Forward

- Treat `/admin-login` as admin/platform auth unless intentionally redesigning that flow.
- Treat public Pages builder pages with an `auth` block as the frontend/site-user auth surface.
- If auth UI needs immediate signed-in nav state, prefer the server-read cookie path for first paint and keep client session sync for post-hydration auth changes.
- Do not rely on a long cookie cache without a live invalidation/version strategy if bans and admin edits must stay effective quickly.
- Do not treat a missing cookie-cache payload as logged out until checking whether a valid session token can resolve through Better Auth.
