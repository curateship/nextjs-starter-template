# Streak badge

A small image you can put on a blog or a Notion page saying how many days in a
row you have focused. It is live, so the number is the same one the dashboard
shows.

## Switching it on

Settings → Profile → Streak badge. Off until you switch it on, and the
address only exists while it is on.

Switching it on writes a secret into your profile row and gives you an
address like `/badge/streak/<token>.svg`. The card shows the address, a Copy
button, a live preview, and a ready-made `<img>` tag to paste.

"New link" writes a new secret, which is how you kill a link you shared
somewhere you should not have. Switching the badge off clears the secret
entirely.

## What the badge says

Two things: the streak number and your public display name, if you have set
one. A badge with no display name says the app's name alone.

Nothing else about the account is readable through it. No email, no id, no
session count, no task titles. The whole document is built by
`renderStreakBadgeSvg` in `src/lib/pomodoro/streak-badge.ts`, so what goes on
it is a short list you can read in one sitting.

The display name is XML-escaped on its way in. That matters more than it
sounds: the badge is served from the app's own address, so an unescaped `<`
would let someone put markup, and with it a script, on a page we serve. The
escaping has its own tests.

A name longer than 22 characters is trimmed with an ellipsis so the picture
keeps its shape.

## The streak it shows

The current streak, counted in the account's own timezone, the same boundary
the app uses everywhere else. So the number on a blog matches the number on
the dashboard.

## The address is the only lock

There is no password on a badge, so the secret is 32 random bytes written as
43 url-safe characters. That is the point of the "treat it like an unlisted
link" line on the settings card: anyone you give it to can see it, and anyone
you do not give it to cannot guess it.

A missing address, a revoked one and an invented one all answer 404 with no
body, so nobody can learn from the response whether a badge ever existed.

An address that is not shaped like a token at all is turned away before the
database is asked, by `isBadgeTokenShape`. That is not tidiness: Postgres
refuses a string carrying a NUL byte outright, so without the check
`/badge/streak/%00.svg` threw and answered 500 to anyone who asked for it.

## Revoking

Switching off sets the secret back to null, which is what makes the old
address stop working. There is no "disabled but still resolvable" state.

Revoking takes effect at our end on the very next request: the in-process
cache is cleared for that account at the same moment. Caches we do not own
are a different matter, and this is the honest limit of the feature. The
badge is served with `Cache-Control: public, max-age=300`, so a reader whose
browser already fetched it may keep seeing the old picture for up to five
minutes. That is the price of the caching the badge needs, and five minutes
is the ceiling.

## Caching

An embed sits on someone else's page and is fetched once per reader, so a
popular blog would otherwise turn every page view into a streak query.

Two layers, both five minutes: the `Cache-Control` header, and a plain Map in
the server process keyed by token. The window is the same on both, so a
reader is never handed something older than they were told they could keep.
The map is capped at 500 entries, so a flood of invented addresses cannot
grow it for ever.

## Why it is not a guarded server function

The guarded endpoints in `src/lib/api` are the app's own RPC addresses, and an
`<img>` tag cannot call one. The badge is a plain route,
`src/routes/badge.streak.$token.ts`, that answers a GET with an image.

The three things that *change* a badge, switching it on, switching it off and
reading your own address, are guarded server functions in
`src/lib/api/pomodoro/streak-badge.ts`. None of them takes a user id or a
token from the browser, so there is no address that touches someone else's
badge.

## The picture itself

One self-contained SVG with no external font, image or stylesheet. It is
embedded on other people's pages, where a request of ours to a third party
would be both slow and a thing those readers never asked for. The typeface is
whatever the reader already has.

It is served as strictly a picture: `X-Content-Type-Options: nosniff` and a
Content-Security-Policy that switches off scripts and outside fetches even
when the address is opened directly rather than through an `<img>`.

`Access-Control-Allow-Origin: *` is deliberate, because being fetched from
other people's sites is the entire feature.

## The `.svg` on the end

Cosmetic. Some embeds insist a picture's address ends in one, so the route
strips a trailing `.svg` and both spellings serve the same badge.
