# Core

Core is a TanStack Start app with React, TypeScript, shadcn/ui, server functions, and server routes in one workspace.

## Development

```bash
npm run db:up --workspace=core
npm run dev --workspace=core
```

The local app runs at `http://localhost:3003`.

## Media Library Storage

Media uploads are stored by the TanStack server runtime in Cloudflare R2 and served through public, cacheable media URLs.
`CORE_R2_PUBLIC_URL` is required so Core can render media directly in the browser.

Set these in the app's server environment:

```bash
CORE_R2_ACCOUNT_ID=""
CORE_R2_ACCESS_KEY_ID=""
CORE_R2_SECRET_ACCESS_KEY=""
CORE_R2_BUCKET_NAME="core-media"
CORE_R2_PUBLIC_URL=""
```

The credentials are server-only secrets. Do not expose them with a `VITE_` prefix.

## Proxy Password Encryption

Proxy passwords are encrypted before storage.

```bash
CORE_PROXY_ENCRYPTION_KEY=""
```

Use a random server-only value with at least 32 characters. Do not expose it with a `VITE_` prefix.

## Provider Secret Encryption

Provider tokens, including Apify, are encrypted before storage.

```bash
CORE_PROVIDER_ENCRYPTION_KEY=""
```

Use a random server-only value with at least 32 characters. Do not expose it with a `VITE_` prefix.

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
