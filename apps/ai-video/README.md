# AI Video

AI Video is a TanStack Start app with React, TypeScript, shadcn/ui, server functions, and server routes in one workspace.

## Development

```bash
npm run db:up --workspace=ai-video
npm run dev --workspace=ai-video
```

The local app runs at `http://localhost:3004`.

## Media Library Storage

Media uploads are stored by the TanStack server runtime in Cloudflare R2 and served through authenticated app routes.
Keep the bucket private; the browser should not receive raw R2 object URLs.

Set these in the app's server environment:

```bash
AI_VIDEO_R2_ACCOUNT_ID=""
AI_VIDEO_R2_ACCESS_KEY_ID=""
AI_VIDEO_R2_SECRET_ACCESS_KEY=""
AI_VIDEO_R2_BUCKET_NAME="ai-video-media"
```

The credentials are server-only secrets. Do not expose them with a `VITE_` prefix.

## Security Settings

Set `AI_VIDEO_SECRET_ENCRYPTION_KEY` anywhere provider API keys can be saved from
Settings. Saved provider keys must be encrypted; delete and resave any old
plaintext key rows after setting this value. Sessions default to 168 hours and
can be adjusted with `AI_VIDEO_SESSION_TTL_HOURS`. Set
`AI_VIDEO_TRUST_PROXY_HEADERS=1` only when the app is behind a trusted proxy
that owns `X-Forwarded-For`.

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
