# SaaS Foundation

Custom Shell ships with the parts every paid product needs: accounts people
create themselves, two roles, admin-managed plans, Stripe subscriptions, and a
member area. A new app inherits all of it by copying these files and editing
plan rows — no new auth or billing code per product.

This document explains how the pieces fit together, how to run and test them,
and what to do when something goes wrong.

---

## 1. The two axes

Role and plan are deliberately separate.

| | What it answers | Values | Where it lives |
| --- | --- | --- | --- |
| **Role** | Who runs the app | `admin`, `member` | `users.role` |
| **Plan** | What someone paid for | any plan row | `subscriptions` → `plans` |

An admin can sit on the free plan; a member can be on Pro. Paying for something
never grants back-office access, and being an admin never implies a paid plan.
Keeping them apart is what stops the "our support staff need Pro to see the
admin page" tangle later.

## 2. Data model

All of it arrives in one migration, `drizzle/0004_custom_shell_saas.sql`, with
Drizzle definitions in `src/server/schema.ts`.

**`users` (extended)** — gains `email_verified_at` and `status`
(`active` / `suspended` / `pending_deletion`), and `role` is now constrained to
`admin` or `member`. Accounts that predate the migration are marked verified so
nobody is locked out. `deleted_at` and `deleted_by` arrive in
`drizzle/0015_custom_shell_soft_delete.sql`: when the deletion clock started and
who started it. A check constraint pairs `deleted_at` with the
`pending_deletion` status both ways, so a marked account can never be missing
its date and an ordinary one can never carry one.

**`auth_tokens`** — one-time links. Stores only a SHA-256 hash of the token,
its `purpose` (`verify_email`, `reset_password`, `login` or `change_email`), an
expiry, and `used_at`. A `login` token is a magic-link sign-in and lives 15
minutes. A `change_email` token also carries `new_email`, the address opening it
would move the account to; a check constraint pairs the two both ways, so a
change link cannot exist without a destination and no other kind carries one.
Arrives in `drizzle/0014_custom_shell_email_change.sql`.

**`oauth_accounts`** — one linked sign-in provider account per row: the
`provider`, the provider's own permanent id for the person, and the account here
it belongs to. Arrives in `drizzle/0013_custom_shell_oauth.sql`, which also
makes `users.password_hash` nullable — an account created by signing in with
Google has no password at all.

**`rate_limits`** — one row per throttle key, with the window start and a
`blocked_until`. In the database rather than memory so a restart does not hand
an attacker a fresh budget.

**`plans`** — the product catalogue: `slug`, `name`, `description`, monthly and
yearly price in cents, `currency`, the two Stripe price ids, `trial_days`, a
free-form `features` JSON, plus `is_default`, `is_public`, `sort_order` and
`active`. A partial unique index allows only one default plan.

**`subscriptions`** — one row per user (`user_id` is unique): which plan, the
Stripe customer and subscription ids, `status`, `interval`, `source`
(`stripe` or `manual`), `current_period_end`, `cancel_at_period_end`, and
`trial_ends_at`.

**`billing_events`** — every Stripe event id this app has processed. Makes a
replayed webhook a no-op.

**`subscription_events`** — one member's billing history: trial started,
subscribed, plan switched, payment failed, cancelled. Insert-only, and written
only when something actually changed. `subscriptions` above says what is true
now; this says how it got there. See Billing history below.

**`admin_audit_logs`** — who changed a role, suspended someone, granted a plan,
or edited a plan, with the affected record ids.

**`migration_state`** — bookkeeping for one-time data changes. See §9.

## 3. Accounts and sessions

Code: `src/server/security.ts`, `src/lib/api/auth.ts`, `src/server/email.ts`.

**Signing up.** `/register` creates the account as a `member`, issues a
verification token, and emails the link. The screen then says "check your
email" — it never reveals whether the address already existed.

**Verifying.** `/verify-email?token=…` spends the token. Spending is a single
`UPDATE … RETURNING` guarded on "not used and not expired", so a link cannot be
redeemed twice even under concurrent clicks. Verification links last 24 hours.

**Signing in.** `/login` refuses three ways: wrong credentials, an unverified
address, and a suspended account. Only the first is ambiguous on purpose. On
success it writes a session row and sets the cookie.

**Signing in with Google.** `/api/auth/google` sends the browser to Google and
`/api/auth/google/callback` brings it back, checking the `state` it echoes
against a ten-minute httpOnly cookie before trading the code for tokens. A
confirmed address that already has an account here joins it — the link in
`oauth_accounts` is keyed on Google's permanent id, so a later address change on
the Google side still finds the same account. Otherwise a confirmed `member` is
created with no password. The button appears only when both
`CUSTOM_SHELL_GOOGLE_CLIENT_ID` and `CUSTOM_SHELL_GOOGLE_CLIENT_SECRET` are set.
Code: `src/server/google-auth.ts`.

**Sessions.** A random token in an httpOnly, SameSite=Lax cookie; only its hash
is stored. `Secure` is set over HTTPS and left off in plain-http development so
the IDE's embedded preview can sign in. Lifetime defaults to ten years and is
overridable with `CUSTOM_SHELL_SESSION_TTL_HOURS`.

**Forgot password.** `/forgot-password` always reports success. If the address
exists, a one-hour link goes out. Completing the reset sets the new password,
marks the email verified (completing it proves the address works), and deletes
every session for that user.

**Changing a password** keeps the current session and drops all the others.
`/account/security` also offers "sign out other devices" and account deletion,
both requiring the current password.

**Profile photo.** Account → Profile carries the shared `ImageUpload`, so a photo
is picked or uploaded through the ordinary media library and R2 pipeline. Its
public URL is stored on `users.avatar_url` and drawn in the sidebar user button
and its dropdown; with none, both fall back to the account's initials. Saving
refuses any URL that is not one of this account's own *images*
(`isOwnedImageUrl`), because that value is stored and rendered back into every
page. Deleting the picture from the media library — by its owner or by an admin —
takes it off the account at the same time (`clearAvatarsForStoragePaths`), since
no foreign key can follow a URL. Deleting the *account* needs no such hook: media
rows cascade with it, and nobody else could have been holding its files.

**Changing an email address.** Account → Profile asks for the new address and
the current password (skipped for an account that has none), then mails a
`change_email` link there. Nothing about the account moves until that link is
opened at `/change-email?token=…`, which is why the tab shows the address it is
waiting on and offers to cancel. Asking again replaces the outstanding link, so
only one can ever be live. Uniqueness is checked when the link is issued *and*
inside the transaction that spends it — the second check is the one that matters,
since the address can be taken while the link sits in an inbox, and a clash rolls
the whole thing back and leaves the link usable. Confirming marks the account
verified and leaves every session alone. If the confirmation mail cannot be
delivered the token is dropped again, so the tab never claims a link is on its
way when none went out. Code: `src/server/email-change.ts`.

One thing it does **not** move: the address on the Stripe customer. Checkout
creates that customer with whatever address the person had at the time
(`customer_email` in `createCheckoutSession`) and this app never calls
`customers.update`, so Stripe receipts keep going to the old address. Sync it
there if that matters for your product.

**Suspension** deletes the person's sessions immediately, and
`findUserBySessionToken` treats a suspended account as signed out — so
suspending someone takes effect on an open tab, not whenever their cookie
happens to expire.

**Deleting an account** marks it rather than removing it. The status becomes
`pending_deletion`, `deleted_at` starts a 30-day clock, `deleted_by` records who
pressed the button, and every session for that account is dropped. A marked
account is signed out everywhere and cannot be signed in to by any route — the
password form, a sign-in link and Google all refuse it, and a change-email link
stops working. Code: `src/server/account-deletion.ts`, with the window itself in
`src/lib/account-deletion.ts` so the screens and the server read one number.

**Restoring** is a deliberate second act, never a side effect of signing in.
After refusing, `/login` offers "Restore my account and sign in", which sends the
same password with `restore: true`; that flag is the only thing that brings an
account back through sign-in. An account an *admin* deleted is refused even then
(`DELETED_BY_ADMIN`) — a member must not be able to reverse a moderation
decision — so a Google-only account, having no password to offer, is always an
admin's to restore. Admins restore from `/admin/users`, one row at a time or a
whole selection at once. An account always comes back **active**: the deletion
clock took the status column, so a suspended account that was then deleted
returns unsuspended. The restore confirmation says so.

**Purging.** Once the window passes the row is really deleted, and everything
that references it goes with it. There is no scheduled job in this app, so
`purgeExpiredDeletions()` runs on the two everyday write paths that care:
registering (an address stays taken until the account holding it is really gone)
and signing in. An admin who does not want to wait deletes a marked account a
second time, which removes it immediately.

**Throttles** (per IP, in `rate_limits`):

| Action | Limit |
| --- | --- |
| Sign in | 5 per 15 minutes, per IP + email |
| Register | 5 per hour |
| Password reset request | 5 per hour |
| Resend verification | 5 per hour |
| Email change request | 5 per hour, per account |
| Email change confirm | 10 per hour |

A successful sign-in clears its bucket. Note the registration limit is strict
enough that a shared office IP could hit it; raise it in `src/lib/api/auth.ts`
if that matters for your product.

## 4. Authorization

Three layers, each independent:

1. **Server functions.** Every one starts with `requireUser()` or
   `requireAdmin()` (`src/server/security.ts`). This is the layer that actually
   protects data — the other two are user experience.
2. **The `/admin` route gate.** `src/routes/_authenticated/admin.tsx` reads the
   role the shell already loaded and sends members to `/account`. It makes no
   network call of its own, so moving between admin pages stays instant.
3. **Navigation filtering.** Sidebar items may carry `roles: ["admin"]`, and any
   link to an `/admin` page is hidden from members regardless of what is stored
   in their workspace settings (`canSeeShellEntry` in `src/lib/custom-shell.tsx`).

Admin actions are audited and cannot remove the last admin: you cannot demote,
suspend, or delete the final remaining admin account, and you cannot delete
yourself from the users table.

## 5. Plans

Code: `src/server/plans.ts`, admin screen at `/admin/plans`.

Prices shown to people come from the plan row. What they are actually charged
comes from the Stripe price id on that row. The browser only ever sends a plan
slug and a billing period, so a tampered request cannot buy Pro at another
plan's price.

Rules the server enforces:

- Exactly one plan is the default, and the default must cost nothing. It is what
  everyone without an active paid subscription gets.
- A public paid plan needs at least one Stripe price id; a price with no id is
  rejected rather than silently unbuyable.
- Plans are **archived, never deleted** — existing subscriptions still point at
  them and their price history has to stay readable. The default plan cannot be
  archived.

`features` is free-form JSON, per product:

```json
{ "seats": 5, "prioritySupport": true, "storageGb": 100 }
```

Those entries become the bullet points on the pricing cards and the keys read by
`hasFeature`.

## 6. Entitlements

Code: `src/server/entitlements.ts`.

A subscription counts as paid only while **both** are true:

- its status is `active`, `trialing`, or `past_due`, and
- `current_period_end` has not passed (a manual grant with no end date never
  lapses).

Otherwise the default plan's features apply. That second condition is the safety
net: if a webhook never arrives, access expires on its own instead of lasting
forever.

Product code gates a paid feature one way:

```ts
const entitlements = await requireFeature("customDomains")
```

It throws `UPGRADE_REQUIRED` when the current plan's `features` lacks the key.

## 7. Billing

Code: `src/server/billing.ts`, `src/lib/api/billing.ts`, webhook at
`src/routes/api/webhooks/stripe.ts`.

**Buying.** `/pricing` or `/account/billing` → `startCheckout(slug, interval)` →
a Stripe Checkout session carrying `metadata.userId`. Stripe returns the person
to `/account/billing/success`, which polls briefly because the webhook can land
a beat later, then refreshes the shell so the plan badge updates.

**Managing.** "Manage in Stripe" opens the Stripe billing portal for card
changes, plan switches and cancellation. This app never handles card details.

**Invoices** are read live from Stripe on the billing page rather than mirrored
into a table, so they cannot drift.

**Webhook.** Authenticated by verifying Stripe's signature over the raw body —
deliberately no browser-origin check, because Stripe is a server and sends no
Origin. Handled events:

| Event | Effect |
| --- | --- |
| `checkout.session.completed` | Fetches the real subscription from Stripe and upserts it |
| `customer.subscription.created` / `.updated` / `.deleted` | Upserts status, plan, interval, period end, cancel flag, trial end |
| `charge.dispute.*` (created, updated, closed, funds moved) | Upserts the chargeback row behind the admin billing alert |

**The dispute events must be ticked in the Stripe dashboard's webhook
settings** (Developers → Webhooks → the endpoint → events). They are not on by
default, and without them a chargeback reaches its deadline in silence — see
Chargebacks below.

Processing is idempotent: the transaction claims the Stripe event id first, so a
duplicate delivery — even two copies arriving at once — writes nothing the
second time. If processing throws, the endpoint returns 500 so Stripe retries.
The user is matched by `metadata.userId`, falling back to the stored Stripe
customer id.

**Chargebacks.** A member telling their bank to take a payment back. These are
the one billing thing mirrored into a table (`disputes`), because the whole
point is knowing one is open without going to look — they carry a deadline, and
missing it loses the money automatically plus Stripe's fee. Code:
`src/server/disputes.ts`; the alert and history sit on `/admin/billing`.
Answering still happens in Stripe, which every row deep-links to.

Two deliberate choices there. The dispute's status has no database constraint
and anything unrecognised counts as *still open*, so a status Stripe adds later
makes the alert louder rather than hiding it. And a dispute whose charge cannot
be traced to an account here is still recorded, with no member name — losing the
deadline would be worse than an unattributed alert.

**Billing history.** The `subscriptions` row is overwritten on every change, so
on its own it can never answer "what happened with this person's billing?".
`subscription_events` is the diary beside it, shown as a timeline on the account
window (Admin → Users → any row → Details). Code: `src/server/subscription-events.ts`
for the writing and reading, `src/lib/subscription-events.ts` for the wording.

Three things hold it together. It is **insert-only** — nothing updates or
deletes a row, because a record that can be edited is not a record. It records
**only what changed**: the webhook compares Stripe's new state against the row
we already had, so a renewal, or Stripe repeating an admin cancel we already
mirrored, writes nothing. And **one row per Stripe event**, enforced by a unique
`stripe_event_id`, so a replayed delivery cannot duplicate a line.

History starts the day it shipped and nothing earlier is reconstructed, which
the card says out loud — a member who has been paying for a year would otherwise
look like one who joined last week. The date is `BILLING_HISTORY_START` in
`src/lib/subscription-events.ts`.

**Manual grants.** An admin can put someone on a paid plan without Stripe
(comp accounts, staff, a refund in progress). Those rows are marked
`source = 'manual'` with an optional end date, and a later Stripe event replaces
them cleanly.

## 8. Screens

**Public:** `/login`, `/register`, `/verify-email`, `/forgot-password`,
`/reset-password`, `/sign-in-link`, `/change-email`, `/pricing`.

**Member:** `/account` (photo, name, email address and plan), `/account/security` (password,
devices, delete account), `/account/billing` (plan, renewal or cancellation
state, upgrade, Stripe portal, invoices), `/account/billing/success`.

**Admin:** `/admin/users` (search, filter, sort, paging, mass delete, mass
restore, edit modal for role / status / granted plan / cancelling a paid plan,
plus a "Locked out" window showing who the rate limiter is currently blocking,
with one-click unblock), `/admin/plans` (create, edit, archive),
`/admin/billing` (monthly recurring revenue, subscriber counts, revenue by plan).

Both admin tables follow `.agents/skills/Ui-standards`: a selection column with
select-all, an interactive title that opens the edit modal, every data column
sortable, the multi-selection action first in the toolbar and the primary button
last, and each row ending with the same two ghost icon buttons — settings then
delete.

**Navigation.** New workspaces get an Account section, an admin-only
Administration section, and the existing Platform Settings section
(`createDefaultWorkspaceSections` in `src/server/workspaces.ts`). Home is
role-aware: admins go to their configured landing route, members to `/account`.

## 9. Migrations

`scripts/setup-database.mjs` replays **every** file in `drizzle/` on each
`predev`. So:

- All DDL is `IF NOT EXISTS`, and constraints are added inside guarded `DO`
  blocks.
- Every one-time **data** change records a key in `migration_state`. Without
  that, a replay would re-verify freshly registered users, resurrect plans an
  admin deleted, and hand new accounts the pre-SaaS navigation.

Current keys: `0003_workspace_backfill`, `0004_seed_plans`,
`0004_workspace_account_nav`.

If you add a data migration, follow the same pattern: guard it on a
`migration_state` key and insert the key in the same block.

## 10. Configuration

| Variable | Purpose |
| --- | --- |
| `CUSTOM_SHELL_APP_URL` | Base URL for email links and Stripe redirects. Empty locally falls back to the port in `local-apps.json`. |
| `CUSTOM_SHELL_BILLING_ENABLED` | `"true"` turns on checkout and the portal. |
| `CUSTOM_SHELL_STRIPE_SECRET_KEY` | Server-only Stripe key. |
| `CUSTOM_SHELL_STRIPE_WEBHOOK_SECRET` | Signing secret for the webhook. |
| `CUSTOM_SHELL_GOOGLE_CLIENT_ID` | Google OAuth client. Absent = no "Continue with Google" button. |
| `CUSTOM_SHELL_GOOGLE_CLIENT_SECRET` | Server-only half of the same pair. |
| `CUSTOM_SHELL_RESEND_API_KEY` | Sends auth email. Absent in dev = links logged to the console. |
| `CUSTOM_SHELL_EMAIL_FROM` | From address for auth email. |
| `CUSTOM_SHELL_SESSION_TTL_HOURS` | Session lifetime. Defaults to ten years. |
| `CUSTOM_SHELL_API_ENV` | `"production"` tightens the email fallback and origin allowlist. |

Stripe **price ids live on plan rows**, not in the environment. Real keys belong
in `.env.local`, which is git-ignored.

## 11. Running it locally

```bash
pnpm --filter custom-shell dev --port 3002     # port comes from local-apps.json
```

With no `CUSTOM_SHELL_RESEND_API_KEY`, verification and reset links print to the
server console, so sign-up works completely offline.

For payments:

```bash
stripe listen --forward-to localhost:3002/api/webhooks/stripe
```

Paste the `whsec_…` it prints into `.env.local`, put the Stripe **test** price
ids on the plan rows in Admin → Plans, set `CUSTOM_SHELL_BILLING_ENABLED=true`,
and pay with card `4242 4242 4242 4242`.

`stripe listen` forwards every event, dispute ones included. To raise a test
chargeback, pay with `4000 0000 0000 0259` — Stripe disputes it on its own a
few minutes later — then watch it appear on `/admin/billing`.

## 12. Testing

**Unit** (`src/server/saas.test.ts`, PGlite replaying the real migrations):
token single-use and expiry, rate-limit windows, every entitlement state,
plan lookup by Stripe price, webhook replay, and the admin guards including
last-admin protection.

```bash
pnpm --filter custom-shell test
pnpm --filter custom-shell exec tsc -p tsconfig.app.json --noEmit
```

**Browser.** Drive the real app with Playwright: sign-up, the verification link
and its rejection on reuse, an unverified sign-in being refused, a member seeing
only their own area and being bounced off `/admin/users`, and an admin clicking
through every page.

Because link tokens are stored hashed, a test cannot read one out of the
database. Plant a row whose hash matches a token the test knows, then visit
`/verify-email?token=…`.

## 13. When something looks wrong

**"Too many attempts."** The rate limiter is doing its job — likely you during
testing. Open the "Locked out" window from the Users page (`/admin/users`) and
unblock the row, or clear everything with `delete from rate_limits;` locally.

**Someone paid but is still on Free.** Check `billing_events` for the event id,
then `subscriptions.status` and `current_period_end`. A lapsed period reads as
unpaid by design. If `stripe listen` was not running, replay with
`stripe events resend <id>`.

**Verification emails never arrive.** With no Resend key, development logs the
link instead. In production the same situation throws `EMAIL_NOT_CONFIGURED`
rather than pretending to send.

**A new account has the wrong sidebar.** Its workspace was probably created by
the `0003` backfill rather than by signing in. That backfill is now guarded by
`migration_state`; delete the workspace row and sign in again to regenerate it
from the current defaults.

**Admin pages redirect to `/account`.** That account is not an admin. Roles are
in `users.role`; change it from `/admin/users`.

## 14. Adopting this in another app

1. Copy `drizzle/0004_custom_shell_saas.sql` and the matching tables in
   `src/server/schema.ts`.
2. Copy `src/server/`: the `security.ts` additions, `rate-limit.ts`, `email.ts`,
   `plans.ts`, `entitlements.ts`, `billing.ts`, `accounts.ts`, `app-url.ts`,
   `google-auth.ts`, `sign-in-link.ts`, `email-change.ts`.
3. Copy `src/lib/api/`: `auth.ts`, `billing.ts`, `admin-plans.ts`,
   `admin-users.ts`.
4. Copy the auth, account and admin routes plus
   `src/routes/api/webhooks/stripe.ts` and `src/routes/api/auth/`.
5. Rename the `CUSTOM_SHELL_*` variables for the new app.
6. Edit the plan rows for that product. Adding a tier needs no code change.

## 15. Not included

Teams or organisations (billing is per user), seats and invites, usage-based
metering, coupons and promotion codes, tax handling, and dunning email beyond
Stripe's own.
