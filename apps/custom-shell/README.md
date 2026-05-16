# React + TypeScript + Vite + shadcn/ui

This is a template for a new Vite project with React, TypeScript, and shadcn/ui.

## Media Library Storage

Media uploads are stored by `custom-shell-api` in a private Cloudflare R2 bucket.

Set these in `services/custom-shell-api/.env`:

```bash
CUSTOM_SHELL_R2_ACCOUNT_ID=""
CUSTOM_SHELL_R2_ACCESS_KEY_ID=""
CUSTOM_SHELL_R2_SECRET_ACCESS_KEY=""
CUSTOM_SHELL_R2_BUCKET_NAME="custom-shell-media"
```

Do not put R2 secrets in `apps/custom-shell/.env`; that file is for browser-visible Vite settings.

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
