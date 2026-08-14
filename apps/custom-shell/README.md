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

## Sign in with Google

The sign-in and sign-up pages offer "Continue with Google" beside the password
form. A first sign-in creates a confirmed account with no password; an address
that already has an account here is attached to it instead, so the same person
never ends up with two.

```bash
CUSTOM_SHELL_GOOGLE_CLIENT_ID=""
CUSTOM_SHELL_GOOGLE_CLIENT_SECRET=""
```

**With either key empty the button never appears** and the two endpoints refuse,
so nothing is offered that this server cannot finish. The client secret is
server-only: never expose it with a `VITE_` prefix.

To set it up, create an OAuth client of type **Web application** in the Google
Cloud console and add one authorised redirect URI: `CUSTOM_SHELL_APP_URL` plus
`/api/auth/google/callback`. It has to match exactly, host and all — locally
that means signing in on the same hostname the app URL uses, or Google sends the
browser back to an address that is not carrying the handshake cookie.

An account created this way has no password. Account → Security offers to set
one, and asks for the account's own email address rather than a password when
it is time to delete the account.

## Resend delivery, open, and click tracking

Automation run history can show whether each email was delivered, opened, or
clicked. Resend supplies these updates through its signed webhook.

1. In Resend, enable open and click tracking for the sending domain and verify
   its tracking subdomain. Resend leaves both kinds of tracking off by default.
2. Add a Resend webhook pointing to
   `https://your-app.example/api/webhooks/resend` and select `email.delivered`,
   `email.opened`, `email.clicked`, `email.bounced`, and `email.complained`.
3. Copy that endpoint's signing secret into Settings → Email → Webhook secret
   for the matching workspace.

For local testing, expose port 3002 through a secure tunnel or use Resend's
webhook listener, then forward the same `/api/webhooks/resend` path. A test send
must use a real Resend key and a verified sending domain; the local logging
provider cannot produce delivery events.

Open counts are estimates. Some inboxes hide the tracking image while privacy
services load it automatically, so run history never treats an open as proof
that somebody read the message.

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
