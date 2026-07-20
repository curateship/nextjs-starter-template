# Security

The account, role, and billing behaviour summarised here is documented in full
in `docs/saas-foundation.md`.

## Accounts and sessions

- Passwords are hashed with argon2id. Only the hash is ever stored.
- A session is a random token in an httpOnly cookie; only its SHA-256 hash is
  stored. `Secure` is set over HTTPS and left off in plain-http development so
  the embedded preview can sign in.
- Sign-in refuses accounts that are unverified or suspended. Suspending someone
  deletes their sessions, and a suspended account is treated as signed out even
  on a session that has not expired.
- Verification and password-reset links are single-use, expiring tokens; only
  their hash is stored. Completing a reset signs out every session.
- Changing a password keeps the current session and drops all the others.

## Abuse limits

Sign-in, registration, password reset, and verification resends are limited per
IP in the `rate_limits` table, so limits survive a restart. Password reset and
verification resend always report success, so neither can be used to discover
which email addresses have accounts.

## Authorization

- Every server function starts with `requireUser()` or `requireAdmin()`.
- `/admin/*` is gated once by its layout route, and every admin server function
  checks again on its own. Neither relies on the other.
- Members never see admin navigation: entries can be marked admin-only, and any
  link to an `/admin` page is filtered out for members regardless of what is
  stored in their workspace settings.
- Admin actions cannot remove the last admin, and are recorded in
  `admin_audit_logs`.

## Requests

- Every mutation calls `requireAppOrigin()`, which checks the browser Origin
  header against the configured origins.
- The Stripe webhook is the one exception: Stripe is a server and sends no
  Origin, so the request is authenticated by verifying the signature over the
  raw body. Events are recorded by id, so a replay changes nothing.

## Payments

- Prices come from the plan row and the Stripe price id on it. The browser only
  sends a plan slug and a billing period, never an amount or a price id.
- Card details are never handled by this app: payment happens on Stripe Checkout
  and card changes happen in the Stripe billing portal.
- Stripe secret and webhook keys are server-only environment variables.

## Media

Uploads are type and size checked, SVG is sanitized before it is served, and
private files are streamed only to their owner.
