# Old addresses

Promo used to keep a page for every screen that moved, which did nothing but
send the old address on to the new place. Fourteen of them are gone. Tyler,
13 Nov 2026, choosing from a code scan's suggestions: "do all 3", one of
which was taking those pages out. An old address that is gone now shows
"not found".

## What is gone

| Address | Where that screen is now |
| --- | --- |
| `/admin/reddit` | The Projects dashboard |
| `/admin/today`, `/admin/jobs` | Reddit's Today tab and Jobs window, on Commenting inside a project |
| `/admin/voices`, `/admin/accounts`, `/admin/reddit-accounts`, `/admin/messages`, `/admin/archive` | The Projects dashboard's Voices, Accounts, Messages and Archive sections |
| `/admin/profiles`, `/admin/proxies`, `/admin/bans` | The Anti Detect dashboard's Profiles, Proxies and Bans sections |
| `/admin/phones`, `/admin/racks`, `/admin/racks/<id>` | The Anti Detect dashboard's Phones, with the Racks block as its filter |

## What stays, and why

- **`/admin/comments` stays.** Reddit's reply and removal notices still open it.
  The address is worked out when it is pressed, so it follows a comment's
  account into whichever project it is in now
  ([Old addresses in Networks as modules](network-modules.md#old-addresses)).
- **A project page's own old addresses stay.** Those are not pages of their
  own: the project page reads `?view=today` and the like itself
  ([Commenting inside a project](commenting.md#old-addresses)).

## Video's links to items sent before 12 Nov 2026

Video keeps the Promo address of every item it sent, in Video's own database,
and items sent before 12 Nov 2026 hold `/admin/archive`. Promo cannot change
what Video stored, so Open in Promo on those older items shows "not found".
Tyler, 13 Nov 2026, picked this over keeping the page. Items sent since then
hold the Projects dashboard's Archive address and still open.

## Bell notices written before

A bell notice remembers the address it opens, in `promo_notices.href`.
`drizzle/0160_promo_old_addresses.sql` points every notice still holding a
removed address at the new place. It keeps the rest of the address, such as
`?open=` and `?platform=`, after the section. Today and Jobs notices, and
`/admin/reddit`, open the Projects dashboard, since the project they meant is
no longer known.

## Links to a phone

Everything that links to a phone now writes the Anti Detect dashboard's
address straight away: `/admin/anti-detect?section=phones&open=<id>`. That
covers the phone's bell notices (health, setup check, daily self-test), the
phone window's Copy link, and the phone links on an account, its ban card and
its importance card. The address does not name a rack, so it stays right when
the phone moves rack.
