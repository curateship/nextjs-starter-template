# Custom Shell

Custom Shell is a TanStack Start app with React, TypeScript, shadcn/ui, server functions, and server routes in one workspace.

## Development

```bash
npm run db:up --workspace=custom-shell
npm run dev --workspace=custom-shell
```

The local app runs at `http://localhost:3002`.

## Media Library Storage

Media uploads are stored by the TanStack server runtime in Cloudflare R2 and served through public, cacheable media URLs.
`CUSTOM_SHELL_R2_PUBLIC_URL` is required so Custom Shell can render media directly in the browser.

Set these in the app's server environment:

```bash
CUSTOM_SHELL_R2_ACCOUNT_ID=""
CUSTOM_SHELL_R2_ACCESS_KEY_ID=""
CUSTOM_SHELL_R2_SECRET_ACCESS_KEY=""
CUSTOM_SHELL_R2_BUCKET_NAME="custom-shell-media"
CUSTOM_SHELL_R2_PUBLIC_URL=""
```

The credentials are server-only secrets. Do not expose them with a `VITE_` prefix.

## Bot Protection on Sign-Up

The three forms that send mail to a typed-in address — sign-up,
forgotten-password, and the sign-in link — carry a Cloudflare Turnstile check.
Almost nobody sees it: it only draws a puzzle when Cloudflare decides it needs
to ask something. The server confirms the widget's answer with Cloudflare before
it creates an account or sends an email.

```bash
CUSTOM_SHELL_TURNSTILE_SITE_KEY=""
CUSTOM_SHELL_TURNSTILE_SECRET_KEY=""
```

**With either key empty the check is switched off completely and all three forms
behave exactly as they did before it existed.** That is deliberate, so local
development stays frictionless — and it means a production server missing a key
is a production server anyone can script against. Set both in production.

The site key is public and ships inside the page. The secret key is server-only:
never expose it with a `VITE_` prefix.

To try it locally, use Cloudflare's documented test keys and restart the server:
site `1x00000000000000000000AA` with secret `1x0000000000000000000000000000000AA`
always passes; `2x00000000000000000000AB` with `2x0000000000000000000000000000000AA`
always fails; site `3x00000000000000000000FF` always shows the puzzle.

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
