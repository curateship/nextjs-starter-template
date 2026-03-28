# Hub <-> SEO Integration

This document describes the **current** Hub -> SEO and SEO -> Hub system as implemented in this repo today.

It is not the original MVP plan. It is the shipped integration path in code right now.

## Systems

### Hub

- App: `apps/hub`
- Runtime: Next.js App Router
- Owns:
  - primary login
  - Hub session
  - user role
  - SEO entitlement decision
  - one-time SEO launch code issuance
- Database:
  - Hub DB
  - includes the `seo_launch_codes` table used only for SEO handoff

### SEO

- App: `apps/seo`
- API: `services/seo-api`
- Runtime:
  - TanStack SPA frontend
  - FastAPI backend
- Owns:
  - mirrored SEO users
  - SEO cookie session
  - SEO workspaces
  - SEO product data tables
- Database:
  - separate SEO DB

## Source Of Truth

### Hub is the source of truth for

- identity
- Hub login state
- user role
- SEO access entitlement
- one-time launch bootstrap

### SEO is the source of truth for

- mirrored local SEO user row
- SEO cookie session
- workspaces
- keyword runs
- canonical keywords
- keyword metric history
- run results
- usage events

## Current Entry Point

The Hub admin entry point is:

- `/admin/apps-integration`

Current behavior:

- Hub renders the linked apps table there
- the SEO row shows a `Launch` button
- that button opens `/api/seo/launch` in a new tab

There is no longer a Hub UI page at `/admin/seo`.

## Auth Evolution

### Original direction

Earlier in this integration, Hub -> SEO used a browser-visible signed login token handoff.

The rough shape was:

- Hub generated a signed SEO login token
- Hub redirected the browser into SEO with that token
- SEO read the token from the browser side
- SEO created a local SEO session from it

That design kept Hub as the identity owner, but the handoff itself was too exposed.

### Why it changed

The browser-token approach created too many failure and security edges:

- login material was passing through the browser
- the token could appear in URLs
- URL-based auth data could leak into:
  - browser history
  - logs
  - analytics
  - screenshots
  - copied links
- the handoff token was replayable until expiry
- the overall flow was harder to reason about and harder to lock down cleanly

### Current direction

The current system uses a **one-time launch code** instead.

New flow:

- Hub creates a short-lived launch code
- Hub stores it in the Hub DB
- the browser submits only that one-time code to SEO
- SEO redeems it server-to-server with Hub
- Hub consumes it once
- SEO creates its own `HttpOnly` cookie session

### Why the one-time code is better

- the browser no longer carries a reusable signed login token
- the launch code is single-use
- Hub can invalidate the handoff by consuming the code once
- SEO session creation happens after a Hub redeem call, not from blind browser input
- the long-lived browser state is now the SEO cookie, not a JS-managed bearer token

The current model is still Hub-owned auth and Hub-owned entitlement, but the bootstrap is narrower and easier to reason about.

## Databases

### Hub DB

Hub stores launch handoff state in:

- `seo_launch_codes`

Columns:

- `code`
- `hub_user_id`
- `email`
- `role`
- `seo_access`
- `expires_at`
- `used_at`
- `created_at`

Purpose:

- single-use launch bootstrap from Hub into SEO

### SEO DB

The SEO API creates and owns these tables:

- `seo_users`
- `seo_workspaces`
- `seo_keyword_runs`
- `seo_keywords`
- `seo_keyword_metrics`
- `seo_run_results`
- `seo_usage_events`

Current active data path:

- `seo_users`
- `seo_workspaces`

The keyword-related tables exist but the keyword run pipeline is not wired yet.

## Hub -> SEO Flow

### 1. User starts in Hub

The user is already authenticated in Hub through Better Auth.

Hub uses the current Hub session in:

- `apps/hub/src/app/api/seo/launch/route.ts`

### 2. Hub checks entitlement

Hub builds an access snapshot from:

- `apps/hub/src/lib/seo/access.ts`

Current rule:

- `seo_access = role === "super_admin"`

So the current MVP access gate is role-based only.

### 3. Hub creates a one-time launch code

Hub creates:

- a random launch code
- a short expiry
- a DB row in `seo_launch_codes`

Current details:

- code TTL: `60` seconds
- code generation: `randomBytes(24).toString("base64url")`

Implementation:

- `apps/hub/src/lib/seo/sso.ts`
- `apps/hub/src/app/api/seo/launch/route.ts`

### 4. Hub returns a launch page, not a JSON token

Hub does **not** send a login token in the URL.

Instead, `/api/seo/launch` returns an HTML page that:

- contains a hidden form
- posts `code` to the SEO API
- auto-submits on load

POST target:

- `${SEO_API_URL}/api/v1/auth/sso/exchange`

This is a browser navigation flow, not a cross-origin XHR flow.

### 5. Browser posts the launch code to SEO

The browser submits:

- `POST /api/v1/auth/sso/exchange`
- content type: `application/x-www-form-urlencoded`
- body: `code=<launch code>`

That request goes to the SEO API, not to Hub.

## SEO Side Of The Launch Flow

### 1. SEO validates origin

The exchange route allows only:

- Hub origin
- SEO origin

Code:

- `services/seo-api/app/dependencies.py`
- `services/seo-api/app/routes/auth.py`

Current allowed origins come from config:

- `HUB_APP_ORIGIN`
- `SEO_APP_ORIGIN`

### 2. SEO redeems the launch code against Hub

The SEO API does not validate launch codes locally.

Instead it calls Hub:

- `POST HUB_SEO_REDEEM_URL`

Current default URL:

- `http://localhost:3000/api/seo/redeem`

Client implementation:

- `services/seo-api/app/hub_client.py`

Auth mechanism:

- header: `x-seo-service-token`

### 3. Hub atomically consumes the code

Hub redeem logic:

- requires internal service token
- marks the code as used
- only succeeds when:
  - code exists
  - `used_at IS NULL`
  - `expires_at > now()`

Route:

- `apps/hub/src/app/api/seo/redeem/route.ts`

Successful response shape:

```json
{
  "access": {
    "hub_user_id": "...",
    "email": "...",
    "role": "super_admin",
    "seo_access": true
  }
}
```

### 4. SEO mirrors or updates the local user

After successful redeem:

- SEO finds `seo_users.hub_user_id`
- inserts a row if missing
- otherwise updates:
  - `email`
  - `role`
  - `seo_access`

Model:

- `services/seo-api/app/models.py`

Route:

- `services/seo-api/app/routes/auth.py`

### 5. SEO creates its own session cookie

SEO signs a local session token with:

- `SEO_SESSION_SECRET`

Token payload currently contains:

- `seo_user_id`
- `exp`

Cookie name:

- `whateverseo_session`

Cookie settings:

- `HttpOnly`
- `SameSite=Lax`
- `Path=/`
- `Secure` only when request scheme is HTTPS

Implementation:

- `services/seo-api/app/security.py`

### 6. SEO redirects into the SPA

When the exchange request is a form POST, the SEO API:

- sets the cookie on the redirect response
- returns `303 See Other`
- redirects to `SEO_APP_ORIGIN`

Current local default:

- `http://127.0.0.1:5173`

## SEO -> Hub Flow

There are currently **two** active SEO -> Hub calls.

### 1. Launch code redeem

Purpose:

- consume one-time Hub launch code

SEO calls:

- `POST /api/seo/redeem`

Hub authenticates this call with:

- `x-seo-service-token`

### 2. Access refresh

Purpose:

- re-check Hub-owned entitlement on authenticated SEO requests

SEO calls:

- `POST /api/seo/access`

Payload:

```json
{
  "hub_user_id": "..."
}
```

Hub response:

```json
{
  "access": {
    "hub_user_id": "...",
    "email": "...",
    "role": "...",
    "seo_access": true
  }
}
```

Implementation:

- Hub route: `apps/hub/src/app/api/seo/access/route.ts`
- SEO client: `services/seo-api/app/hub_client.py`

## SEO Session Validation Flow

Every protected SEO API request currently does this:

### 1. Read cookie

SEO reads:

- `whateverseo_session`

### 2. Verify token signature and expiry

SEO verifies:

- token format
- HMAC signature
- `exp`

### 3. Load SEO user

SEO loads the local `seo_users` row by `seo_user_id`.

### 4. Re-check access with Hub

SEO immediately calls Hub access endpoint and updates the local mirrored fields:

- `email`
- `role`
- `seo_access`

If `seo_access` is false:

- request fails with `403`

Implementation:

- `services/seo-api/app/dependencies.py`

This means Hub remains the live authority for entitlement even after the SEO cookie exists.

## Current SEO API Surface

### Auth routes

- `POST /api/v1/auth/sso/exchange`
- `GET /api/v1/auth/me`
- `POST /api/v1/auth/logout`

### Workspace routes

- `GET /api/v1/workspaces`
- `POST /api/v1/workspaces`

Current auth rules:

- `GET /api/v1/workspaces`
  - requires SEO cookie session
- `POST /api/v1/workspaces`
  - requires SEO origin
  - requires SEO cookie session
  - requires `super_admin`

## Current SEO SPA Behavior

### API transport

The SPA uses:

- `fetch(..., { credentials: "include" })`

This means:

- the SEO cookie is sent automatically
- the SPA does not store a bearer token in `localStorage`

Code:

- `apps/seo/src/lib/api.ts`

### Main route

- `/`

Behavior:

- calls `GET /api/v1/auth/me`
- calls `GET /api/v1/workspaces`
- if `401`, shows the "launch from Hub" state
- if authenticated, shows workspace creation and list UI

### SSO route

- `/auth/sso`

Current behavior:

- it is only an informational page
- it no longer accepts browser-visible login codes

Code:

- `apps/seo/src/router.tsx`
- `apps/seo/src/pages/sso-exchange-page.tsx`

## Current Security Controls

### Hub side

- launch codes are random
- launch codes expire quickly
- launch codes are single-use
- Hub private endpoints require `x-seo-service-token`
- service token comparison uses timing-safe comparison

### SEO side

- no browser-visible login token exchange
- session stored in `HttpOnly` cookie
- cookie-based API requests use `credentials: include`
- auth exchange route restricts allowed origins
- logout route restricts allowed origins
- workspace create route restricts allowed origins
- every authenticated request refreshes Hub access

## Local Development Defaults

### Hub defaults

If env vars are missing in non-production local work:

- `SEO_APP_URL = http://127.0.0.1:5173`
- `SEO_API_URL = http://127.0.0.1:8000`

### SEO API defaults

- `SEO_DATABASE_URL = postgresql+psycopg://postgres:localdev@localhost:54320/whateverseo_seo`
- `SEO_APP_ORIGIN = http://127.0.0.1:5173`
- `HUB_APP_ORIGIN = http://localhost:3000`
- `HUB_SEO_REDEEM_URL = http://localhost:3000/api/seo/redeem`
- `HUB_SEO_ACCESS_URL = http://localhost:3000/api/seo/access`

Important local detail:

- SEO local dev uses `127.0.0.1`
- Hub local dev uses `localhost`
- this avoids large Hub cookies being sent to the Vite SEO app on `localhost:5173`

## What Exists Versus What Does Not

### Implemented now

- Hub-owned login
- Hub-owned SEO entitlement
- one-time launch bootstrap
- SEO local mirrored user
- SEO cookie session
- Hub access refresh from SEO
- workspace list/create
- separate Hub DB and SEO DB
- linked app dashboard in Hub

### Not implemented yet

- Hub <- SEO usage summary endpoint
- Hub pulling recent SEO activity
- keyword run pipeline
- DataForSEO integration
- exports
- usage event ingestion into Hub
- team/multi-user permissions

## Current Known Gaps

### 1. Hub -> SEO summary path does not exist yet

The original MVP plan called for Hub-visible SEO usage summary data.

That endpoint is not implemented yet.

### 2. `/auth/sso` still exists as a public informational route

This route is intentionally inert and does not log users in.

It exists only to tell users to start from Hub.

## Current End-To-End Sequence

### Hub -> SEO

1. User opens Hub admin `Apps Integration`
2. User clicks `Launch`
3. Hub checks Hub session
4. Hub checks SEO access from Hub role
5. Hub inserts one-time row into `seo_launch_codes`
6. Hub returns auto-submitting HTML form
7. Browser POSTs `code` to SEO API
8. SEO validates allowed origin
9. SEO calls Hub `/api/seo/redeem`
10. Hub atomically consumes the code
11. SEO upserts local `seo_users`
12. SEO sets `whateverseo_session`
13. SEO redirects to the SEO SPA root

### SEO -> Hub on later requests

1. Browser calls SEO API with cookie
2. SEO verifies local session token
3. SEO loads local mirrored user
4. SEO calls Hub `/api/seo/access`
5. Hub returns current access snapshot
6. SEO updates mirrored local user fields
7. SEO request continues or fails if access is revoked
