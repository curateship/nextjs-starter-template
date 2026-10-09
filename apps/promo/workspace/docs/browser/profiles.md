# Browser profiles

A browser profile is one isolated browser: its own cookies, its own identity and
its own proxy. A Reddit account does not own any of that. It points at a
profile, and so will an Instagram account when there is one.

Tyler, 5 Oct 2026: "Proxy and isolation profile should have its own dashboard
and not lives in the reddit settings as proxy and browser isolation is an app
wide feature, not just a reddit feature." This file covers the record. The
[Browser profiles dashboard](profiles-dashboard.md) and the
[Proxies dashboard](proxies-dashboard.md) are where a person works with it.

## What a profile holds

The table is `promo_profiles`, in `src/server/browser/schema.ts`.

- **A name**, the person's own words. The first one is called Main.
- **A proxy**, or none. With none, the browser goes out from this computer's own
  address. Deleting the proxy leaves the profile and its cookies alone.
- **An identity**, the fingerprint the browser launches with, kept whole in one
  column. Today only the operating system in it reaches the browser.
- **The name of its cookie volume**, the Docker volume the browser's cookies
  live in. Stored rather than worked out from the profile, for the reason under
  "The profiles that already existed".
- **Notes**, and the usual dates.
- **A folder, a label and tags**, for sorting once there are more than a
  handful. A label is the state a person gives it, such as Ready, Warming or
  Banned; it is not whether its browser runs.

Whether its browser is open is not a column. It is a live row in
`promo_browser_sessions`, which now belongs to the profile rather than to an
account, so the two can never disagree.

## The rules the database holds

- **One live browser per profile.** Two browsers on one cookie volume corrupt it,
  so this is a unique index, `ux_promo_sessions_live_profile`, not a check in
  code that two programs could both pass.
- **One account per network inside a profile.** Two Reddit accounts in one
  browser would be signed in over each other. A Reddit account and a later
  Instagram account may share a profile. The index is
  `ux_promo_accounts_profile_platform`.
- **One profile per cookie volume**, `ux_promo_profiles_volume`.
- **Deleting a profile keeps the account.** The account is left with no profile,
  and every job for it is refused with "This Reddit account has no browser
  profile. Pick one in Settings."

## How a job finds its browser

A search, a thread read or a comment goes from its keyword or post to the
Reddit account, from the account to its profile, and opens that profile's
browser. Keywords do not name an account yet, so a search uses the person's one
Reddit account. That changes when more than one browser can run at once.

Opening and closing name a profile directly, because a profile's browser is not
any one network's.

## The profiles that already existed

Before profiles, each account had its own cookie volume, named
`promo-profile-<account id>`. Migration `0094_promo_browser_profiles.sql` made
one profile for each account, carried over the account's proxy and identity,
and stored that exact volume name on the profile. The volume was never renamed,
so the sign-in inside it was not lost.

A profile made from now on gets a volume named after itself,
`promo-profile-<profile id>`.

A Reddit account picks its profile on the Reddit account tab in Settings. A
profile that already holds a Reddit account is not offered there, and saving
one anyway is refused with the profile's name. New profiles are made on the
[Browser profiles dashboard](profiles-dashboard.md).

## The columns that stayed behind

`promo_accounts.proxy_id`, `promo_accounts.fingerprint` and
`promo_browser_sessions.account_id` are still in the database with whatever they
held. Nothing reads or writes them any more, and they are left out of the
Drizzle tables so nothing can start to by accident. A stored column is never
renamed or dropped.

## What the account keeps

The voice, the product and the rules the AI writes with, the karma and the
account's age (see [How Reddit sees the account](../reddit/account-health.md)), and what the
browser program last saw on that network: the signed-in name (`handle`),
whether the site is asking the browser something (`blocked`), what it asked
(`blocked_reason`), and when that was read (`state_read_at`). The browser
program writes those four after every job, so a dashboard reads them instead of
asking a browser. [The isolated browser](isolated-sessions.md) explains why.
