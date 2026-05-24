# AI Video

AI Video is a TanStack Start app for internal AI video generation workflows.

## Development

```bash
npm run db:up --workspace=ai-video
npm run dev --workspace=ai-video
```

The local app runs at `http://localhost:3003`.

## Media Library Storage

Media uploads are stored by the TanStack server runtime in Cloudflare R2 and served through public, cacheable media URLs.
`AI_VIDEO_R2_PUBLIC_URL` is required so AI Video can render media directly in the browser.

Set these in the app's server environment:

```bash
AI_VIDEO_R2_ACCOUNT_ID=""
AI_VIDEO_R2_ACCESS_KEY_ID=""
AI_VIDEO_R2_SECRET_ACCESS_KEY=""
AI_VIDEO_R2_BUCKET_NAME="ai-video-media"
AI_VIDEO_R2_PUBLIC_URL=""
```

The credentials are server-only secrets. Do not expose them with a `VITE_` prefix.

## AI Providers

Prompt writing is server-side and configured with:

```bash
AI_VIDEO_TEXT_API_KEY=""
AI_VIDEO_TEXT_MODEL=""
AI_VIDEO_TEXT_BASE_URL="https://api.openai.com/v1/responses"
```

Seedance generation is configured with:

```bash
AI_VIDEO_SEEDANCE_API_KEY=""
AI_VIDEO_SEEDANCE_MODEL=""
AI_VIDEO_SEEDANCE_BASE_URL="https://ark.ap-southeast.bytepluses.com/api/v3"
```

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
