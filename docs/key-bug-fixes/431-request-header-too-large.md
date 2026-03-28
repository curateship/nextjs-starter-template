# 431 Request Header Fields Too Large

## Symptom
Visiting deeply nested admin pages (e.g. `/admin/newsletters/automations/[uuid]/email/[uuid]`) returns a 431 error. The browser console shows:
```
Failed to load resource: the server responded with a status of 431 (Request Header Fields Too Large)
Error: An unexpected response was received from the server.
    at fetchServerAction
```
Server actions fail and the page doesn't load properly.

## Root Cause
Node.js has a default max HTTP header size of 16KB. Supabase auth stores JWTs in chunked cookies (`sb-<ref>-auth-token.0`, `.1`, etc.) which can total 3-4KB+. Combined with standard browser headers, the Referer header (long URLs with multiple UUIDs), and Next.js dev mode headers, the total exceeds 16KB.

Pages that fire multiple server actions on load (like the automation email builder which calls `getStepById` and `getAutomationById` via `Promise.all`) are most likely to trigger this.

## Fix
Increase the Node.js max header size in the dev script in `package.json`:
```json
"dev": "NODE_OPTIONS='--max-http-header-size=32768' next dev --turbopack"
```

This only affects the local dev server. Production deployments (Vercel, etc.) use their own server config.

## Notes
- Clearing cookies does not fix this — logging back in creates new JWTs of the same size
- 32KB is a safe limit with no security or performance concerns
- This setting does not affect production builds or deployments
