# Who can open a protocol screen

A member can open a protocol screen. An admin can open everything a member
can, plus the screens that describe the whole installation rather than one
person's trading.

**Protocol, not exchange.** Hyperliquid, Phemex, KuCoin, Aster and Lighter are
exchanges. Solana and BNB Chain are chains, and calling them exchanges was
simply wrong. Protocol is the word that is true of all of them, and it is what
the ids in the code, the `trade_wallets.protocol` column and these addresses
have always used.

## The addresses

Each protocol screen has one address, and it is not under `/admin`:

| Protocol | Address |
| --- | --- |
| Hyperliquid | `/protocols/hyper-liquid` |
| Phemex | `/protocols/phemex` |
| KuCoin | `/protocols/kucoin` |
| Aster | `/protocols/aster` |
| Lighter | `/protocols/lighter` |
| Solana | `/protocols/solana` |
| BNB Chain | `/protocols/bnb` |

The old `/admin/…` address of each one is kept as a redirect that carries the
search params across, so a saved link, a browser's history entry, and a bell
notice written before the change all still land on the right coin.

## Why they are not under `/admin`

Nothing under `/admin` can be shown to a member, and no amount of sidebar
configuration changes that. A saved link starting with `/admin` is dropped
from a member's sidebar before it renders, and the admin layout sends anyone
who is not an admin back to the home page on arrival. So an exchange screen
kept under `/admin` could never be opened by a member, whatever was linked.

There is one address per protocol rather than one per role because roughly
twenty places in the app build a link to a coin's chart, and eight of those
run on the server inside the alert and fill watchers. Those eight write the
address into `trade_notice_links` at the moment an alert fires, long before
anyone opens the bell, so the server cannot know whether an admin or a member
will click it. One address is the only answer that is right for both.

`PROTOCOL_DASHBOARD_PATHS` in `src/lib/protocols/contracts.ts` is where that
one answer is written down. Every caller goes through `marketChartHref`.

## What a member sees there

Their own trading, and only their own. Every wallet, order, drawing, alert and
journal row is stored against the account that made it, and the two calls the
screen loads with ask for a signed-in user rather than an admin. Two members on
the same installation share no wallets and see none of each other's positions.

A member who has added no wallet sees the screen with an empty wallet list and
the usual invitation to connect one. Adding a wallet is something each person
does for themselves: the create call always saves the wallet against whoever is
signed in, so no admin can attach a wallet, or its trading key, to somebody
else's account.

## What stays admin-only

These are about the installation rather than about one person's trading, and a
member is still refused them by the layout and by the server call underneath:

- The trading overview at `/admin/trading-overview`.
- The Active trades button in the header, which is limited to admins in
  `src/app/options.ts`.
- Recipes, at `/admin/recipes`.
- The Markets explorer, at `/admin/markets`.
- The trading engine's controls and settings tabs, under `/admin/settings`.

A member's sidebar should therefore link to the protocol screens and not to
these. A link to one of them would be dropped from their sidebar anyway.

## The sidebar entries

Which links appear is saved configuration, not code. The admin list is saved
per workspace and the member list is saved once for the installation, and both
are edited in Settings. Changing the addresses above means the saved entries
have to name the new addresses too, or the sidebar will not mark the open
screen as the active one. Redirects keep an old saved entry working, but a
redirected link never matches the address bar, so it never highlights.
