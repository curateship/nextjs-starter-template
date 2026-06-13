# Custom Shell

Custom Shell is a TanStack Start app with React, TypeScript, shadcn/ui, server functions, and server routes in one workspace.

## Development

```bash
npm run db:up --workspace=ai-agents
npm run dev --workspace=ai-agents
```

The local app runs at `http://localhost:3002`.

## Media Library Storage

Media uploads are stored by the TanStack server runtime in Cloudflare R2 and served through public, cacheable media URLs.
`AI_AGENTS_R2_PUBLIC_URL` is required so Custom Shell can render media directly in the browser.

Set these in the app's server environment:

```bash
AI_AGENTS_R2_ACCOUNT_ID=""
AI_AGENTS_R2_ACCESS_KEY_ID=""
AI_AGENTS_R2_SECRET_ACCESS_KEY=""
AI_AGENTS_R2_BUCKET_NAME="ai-agents-media"
AI_AGENTS_R2_PUBLIC_URL=""
```

The credentials are server-only secrets. Do not expose them with a `VITE_` prefix.

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
