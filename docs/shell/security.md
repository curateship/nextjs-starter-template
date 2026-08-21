# Security

The account, role, and billing behaviour summarised here is documented in full
in `saas-foundation.md`.

## Accounts and sessions

- Passwords are hashed with argon2id. Only the hash is ever stored.
- A session is a random token in an httpOnly cookie; only its SHA-256 hash is
  stored. `Secure` is set over HTTPS and left off in plain-http development so
  the embedded preview can sign in.
- Sign-in refuses accounts that are unverified, suspended, or marked for
  deletion. Suspending someone deletes their sessions, and a suspended account
  is treated as signed out even on a session that has not expired.
- Deleting an account marks it instead of removing it, deletes its sessions, and
  starts a 30-day restore window. Nothing signs in to a marked account through
  any route — the password form, a sign-in link, and Google all refuse it — and
  a change-email link stops working too.
- Bringing it back is a second, deliberate act. The sign-in page offers "Restore
  my account" after refusing, and that button sends the same password again with
  a flag; nothing else sets it, so a routine sign-in can never undo a deletion by
  accident. An account an admin deleted is refused even then, because a member
  must not be able to reverse a moderation decision — `users.deleted_by` is what
  tells the two apart.
- Once the window passes the row is really deleted and everything hanging off it
  goes with it. There is no background job, so the purge runs on registration
  and on sign-in; an admin can also delete a marked account a second time to
  remove it immediately.
- Verification, password-reset, sign-in and email-change links are single-use,
  expiring tokens; only their hash is stored. Completing a reset signs out every
  session.
- A sign-in link lasts 15 minutes, the shortest of the three, because it hands
  over the account outright. Opening one proves the address works, so it also
  verifies an account that had never confirmed its email. Suspended accounts are
  sent no link and are refused if they present one issued earlier.
- A link is spent by the request that signs the browser in, not by opening its
  address, so a mail scanner following the link cannot burn it.
- Changing a password keeps the current session and drops all the others.
- Changing the email address asks for the current password whenever the account
  has one, because a stolen session would otherwise be enough to take an account
  over: move the address, then ask that address for a password reset. The link
  goes to the new address and lasts 24 hours; nothing about the account changes
  until it is opened, and uniqueness is checked again at that moment. An admin
  looking at the app as a member cannot change either account's address — they
  have to leave that view first.

## Signing in with Google

- The button only appears when both Google keys are set, so nothing is offered
  that this server cannot finish.
- The trip out to Google carries a random `state` and a PKCE secret, both kept
  in a ten-minute httpOnly cookie. The callback refuses anything whose `state`
  does not match that cookie, and the cookie is cleared as it is read, so one
  trip can complete at most one sign-in.
- The code is traded for tokens by this server over HTTPS, authenticated with
  the client secret. The id token is read without a signature check because it
  never touched the browser; its audience is checked all the same.
- An address Google has not confirmed is refused. Everything else rests on the
  address being proven.
- A Google account that has been here before is found by Google's permanent id
  for it, not the email, so changing the address there does not create a second
  account. Otherwise the confirmed address decides: it joins the account that
  already holds it, or a new one is created.
- Suspended accounts are refused exactly as the password form refuses them, and
  the callback is rate limited per IP like the other sign-in paths.
- An account created this way has no password at all — the column is null, not a
  hash nobody knows. It can set one from Account → Security, where the signed-in
  session is the proof of identity, and deleting it asks for the account's own
  email address instead of a password.

## Abuse limits

Sign-in, registration, password reset, sign-in links, and verification resends
are limited per IP in the `rate_limits` table, so limits survive a restart.
Password reset, sign-in links, and verification resend always report success, so
none of them can be used to discover which email addresses have accounts.
Asking for an email change is limited per account rather than per IP — what that
endpoint could be abused for is mailing strangers, and the account is who would
be doing it — while confirming one is limited per IP like the other link
landings.

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
