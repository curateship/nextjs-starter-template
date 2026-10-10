# Authentication and sessions

Custom Shell supports several account access and email-ownership actions:

- Passwords and password recovery.
- Emailed sign-in links.
- Google OAuth.
- Passkeys.
- Email verification and email changes.

Platform settings can turn individual methods on or off without changing the
routes.

Registration creates a member account. Admins can also create accounts from the
Users dashboard and assign a role or plan. Email verification, password reset,
email change, unwanted sign-in reports, and sign-in links use short-lived tokens.
The server stores token hashes rather than the original token.

## Sessions and devices

A successful sign in creates a server session and sets the session cookie. The
Account window lists known devices and active sessions. A person can end another
session or sign out every other device while keeping the current session.

The platform can set idle and maximum session limits. The shell reads the active
policy while a signed-in page is open and signs the person out when the current
session no longer qualifies. Password changes can also end other sessions.

## Protection around account actions

Account actions have several server-side protections:

- Passwords use Argon2id.
- OAuth uses state and PKCE checks.
- Server mutations check the request origin, current session, and required role.
- Sign-in and token routes use rate limits.
- A hidden button never counts as permission.

The Security tab also supports passkeys when the deployment has a valid relying
party configuration. A passkey challenge expires and can only be used for its
intended registration or authentication step.

## Switching passkeys off

Settings → General → Passkeys has one switch, "Offer Sign in with a
passkey". It is on for every install until an admin turns it off, and it saves
the moment it is flipped, like every other setting on that page.

Switched off:

- The sign-in page drops its "Sign in with a passkey" button.
- Account → Security drops its Passkeys card, so nobody adds a passkey that
  could not sign them in.
- The server refuses all four passkey calls (start and finish, for signing in
  and for adding one) with "Passkeys are switched off here". That covers a
  sign-in page left open from before the switch was flipped.
- Passkeys people already added stay saved. Turning the switch back on makes
  them work again without anyone adding them a second time.

Turning passkeys off asks nothing first, because nobody is locked out: the
password form, the emailed sign-in link and Google are all untouched.

The value is app-wide and lives in the shell settings row as `passkeySignIn`.
A row saved before the switch existed has no value, and the reader treats a
missing value as on. The sign-in page reads it through `loadSignInOptions`
(`src/lib/api/auth/auth.ts`), and the passkey endpoints check it in
`requirePasskeysOn` (`src/lib/api/auth/passkeys.ts`).

The repo's `docs/shell/saas-foundation.md` contains the full account contract.
`docs/shell/security.md` contains the security requirements that every app must
keep.
