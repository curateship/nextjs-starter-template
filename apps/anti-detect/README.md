# Antidetect

Antidetect is a TanStack Start app with React, TypeScript, shadcn/ui, server functions, and server routes in one workspace.

## Development

```bash
npm run db:up --workspace=anti-detect
npm run dev --workspace=anti-detect
```

The local app runs at `http://localhost:3005`.

## Media Library Storage

Media uploads are stored by the TanStack server runtime in Cloudflare R2 and served through public, cacheable media URLs.
`ANTIDETECT_R2_PUBLIC_URL` is required so Antidetect can render media directly in the browser.

Set these in the app's server environment:

```bash
ANTIDETECT_R2_ACCOUNT_ID=""
ANTIDETECT_R2_ACCESS_KEY_ID=""
ANTIDETECT_R2_SECRET_ACCESS_KEY=""
ANTIDETECT_R2_BUCKET_NAME="antidetect-media"
ANTIDETECT_R2_PUBLIC_URL=""
```

The credentials are server-only secrets. Do not expose them with a `VITE_` prefix.

## Browser Sessions

The Phase 2 orchestrator publishes Neko stream/WebRTC ports on
`ANTIDETECT_STREAM_BIND_HOST`, which defaults to `127.0.0.1`. Remote Docker hosts
must use HTTPS; plain HTTP is accepted only for local Docker hosts.

Neko login passwords must be set with `ANTIDETECT_NEKO_USER_PASSWORD` and
`ANTIDETECT_NEKO_ADMIN_PASSWORD`; the app fails fast if either is missing. Keep
the stream bind host on loopback unless those credentials are safe for the
network that can reach the published ports.

## Adding components

To add components to your app, run the following command:

```bash
npx shadcn@latest add button
```

This will place the ui components in the `src/components` directory.

## Using components

To use the components in your app, import them as follows:

```tsx
import { Button } from "@/components/ui/button"
```
