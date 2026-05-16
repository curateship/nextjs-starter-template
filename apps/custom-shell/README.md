# Custom Shell

Custom Shell is a TanStack Start app with React, TypeScript, shadcn/ui, server functions, and server routes in one workspace.

## Development

```bash
npm run dev --workspace=custom-shell
```

The local app runs at `http://localhost:3002`.

## Media Library Storage

Media uploads are stored by the TanStack server runtime in a private Cloudflare R2 bucket.

Set these in the app's server environment:

```bash
CUSTOM_SHELL_R2_ACCOUNT_ID=""
CUSTOM_SHELL_R2_ACCESS_KEY_ID=""
CUSTOM_SHELL_R2_SECRET_ACCESS_KEY=""
CUSTOM_SHELL_R2_BUCKET_NAME="custom-shell-media"
```

These are server-only secrets. Do not expose them with a `VITE_` prefix.

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
