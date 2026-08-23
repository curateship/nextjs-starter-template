# Wallet figures — who is asked, how often, and what a miss means

The wallet card shows Free, In trades, Margin used, Nearest position, Open
profit, Settled, and Made or lost. The exchange supplies the account and
open-position figures.
Settled comes from its recorded fills since midnight two days ago in Toronto, and
Made or lost adds that settled money to current open profit. Older profit and
changes to the account balance never enter those two rows. This doc says which
wallets get asked, how often, what it costs, and why a failed answer no longer
wipes the card.

Margin used and Nearest position come from the positions already held by the
trading screen. The card never asks the exchange again. It adds each wallet's
position margin and compares the percentage distance between each current price
and liquidation price.

KuCoin states profit when a position closes, not on every partial sale. When a
recent sale is still unpriced, the info mark beside Settled says that Settled
and Made or lost are short and names how many trades are missing.

**Where that fact is written down.** Each exchange's entry in
`src/server/protocols/registry.ts` carries `account.profitPerSale`. Hyperliquid
and Phemex set it true; KuCoin sets it false. The sum that builds Settled reads
that line and never asks which exchange it is holding, so a new exchange joins
by answering the question in its own entry rather than by somebody finding the
sum and adding an `if`. A zero from an exchange that sets it false counts as
unpriced; a zero from one that sets it true is a sale that genuinely broke
even, and its fee is still a real loss.

The rules this machinery must add up to are stated once, in
`trading-rules.md` — that file outranks both this doc and the code. The
request budget this all has to live inside is `hyperliquid-rate-limits.md`.

The code lives in `src/server/trade/wallets.ts` (`loadWalletSummaries`, the
sweep), each exchange folder's `account.ts`,
`src/components/trade/use-trade-account.ts` (the poll) and
`src/components/trade/account-panel.tsx` (the cards).

## Trading-key expiry

Hyperliquid states when an agent key expires. An active wallet shows the days
left on its card, turns the line amber for the final 14 days, and turns it red
after the date passes. An expired line says that the wallet's ladders and grids
will not act. Their rows say the same thing in place of a normal waiting
message, so an order with no working key never looks healthy.

Phemex, KuCoin, and Aster do not state a key expiry through their APIs. Their
wallet cards show no expiry line. Trade never guesses a date or writes
"unknown". Inactive wallets show no warning because Trade does not ask or act
on them.

Replacing a wallet key verifies the new key with the exchange and saves the
new expiry in the same update. The next wallet read therefore replaces the old
countdown with the new key's date.

**Where each exchange stands against the exchange-connection rule.** A screen
may poll Trade's own server to repaint, but that server must answer from state
the exchange's own socket keeps. It may not turn each screen poll into another
exchange request. Hyperliquid is there for prices, positions, resting orders
and fills. Phemex and KuCoin are there for prices, and their orders and fills
are now read only when the exchange says something happened — see below. Their
positions and balances are still asked for, on purpose, and that is the one
piece left.

## The exchange rings the doorbell

Phemex and KuCoin each hold one open private socket per API key, and the app
uses it to decide whether a read is worth making at all. If the exchange has
said nothing about the account since the last answer was taken, that answer
still stands and nothing is asked. The reads themselves are unchanged.

**Measured against the live exchanges on 22 August 2026**, both accounts quiet,
asking every four seconds for a hundred seconds:

- Ignoring the socket: 33 requests, and it never stops. Four more every twelve
  seconds, for as long as the app is running.
- Using it: 13 requests, all of them in the first twenty-five seconds while the
  two sockets were signing in. Then nothing at all.

**It is a doorbell, not a delivery, and that was a deliberate choice.** Both
sockets carry the orders and the executions themselves. Serving them straight
from there was the obvious idea and the wrong one: Phemex writes the same facts
in a different dialect on the socket and marks nothing as a liquidation, and a
mislabelled liquidation is a wrong line in the Journal about real money.
KuCoin's channels carry changes only, so the app would have to follow along and
be right about every event shape it sends. Instead the socket answers one
question — has anything happened — and every schema and every quirk stays in
the REST reader that was always there.

**Two safeguards, because a socket can lie by going quiet.** A line only
vouches for a stretch it was watching all the way through: a disconnection, a
missed heartbeat, or a subscription that has not been acknowledged all mean it
says nothing and the read happens. And no answer is ever held for more than two
minutes however silent the exchange is, so if a subscription were ever accepted
and then quietly starved, the worst case is a two-minute-old answer rather than
a permanent one.

**This app's own orders ring the bell immediately.** A place, a move or a
cancel counts as a change the moment the request finishes, without waiting for
the exchange to push it back. Otherwise the next pass could be told the account
was quiet and skip the read that would have shown the order just placed.

**Positions and balances are deliberately left out.** They ride the same lines,
but both exchanges push them only when the position itself changes, never when
the price moves — measured on KuCoin: three open positions, prices moving, and
forty-five seconds of complete silence. Open profit moves every second, so
holding a balance because "nothing changed" would freeze the profit on a wallet
card, which is worse than the read it saved.

## What each exchange's private line offers

Tested against the live exchanges on 22 August 2026, with this app's own keys.

**Phemex is the straightforward one.** Sign in on the socket with `user.auth`,
then `aop_p.subscribe`, and it answers immediately with a full snapshot:
balances, every resting order and every position, in one message marked
`type=snapshot`. Changes follow as `type=incremental`. One subscription covers
all three things, and each row carries the whole object rather than a
difference, so nothing has to be added up and nothing can drift. An order row
also carries its own fill — `execID`, `execQty`, `execPriceRp`, `closedPnlRv` —
so fills come off the same line.

**KuCoin needs one read at the start.** A signed POST to
`/api/v1/bullet-private` grants a ticket, and the socket then accepts
`/contract/positionAll`, `/contractAccount/wallet` and
`/contractMarket/tradeOrders`. All three were acknowledged. The catch is that
they carry changes only: subscribing tells you nothing about what you already
hold. So the app has to ask once when the line opens, and again after every
reconnect, and apply changes in between. That is the "ask once when a feed
starts, and again to recover a disconnect" the rule allows, and it is not
optional here.

Both lines fall back to asking whenever they cannot vouch for an answer, the
way `hyperliquid/user-fills-feed.ts` does. A feed that guesses is worse than the
asking it replaced.

The code is `src/server/protocols/phemex/private-feed.ts` and
`src/server/protocols/kucoin/private-feed.ts`, read from the fills sweep and
the resting-order read in each folder's `orders.ts`.

## Only wallets that are switched on are asked

Every wallet has a status: **active** or **inactive**. The sweep reads the
whole list — the panel needs it for its tabs — but asks the exchange **only
about the active ones**. An inactive wallet answers `state: "inactive"`
without a single request being sent, and its practice equivalent is not
settled either.

**This was not always true, and it was expensive.** Every live wallet costs the
exchange's own allowance each time it is read, and the exchange counts every
request from this machine together. Five wallets meant sixty requests a minute
from this one panel, most of them about wallets nobody was trading with.
Running out of allowance is exactly what makes a wallet answer with nothing —
so the wasted reads were causing the very "Can't reach it" they were paying
for.

**Inactive is not a failure and must never be drawn as one.** The card says
"Not switched on" and the picker says "Inactive". Both look identical to
"Can't reach it" if you are careless, and they mean opposite things: one is a
wallet nobody is using, the other is a wallet that would not answer.

An account setting Trade cannot read is not a short outage either. Aster's
two-sided position mode arrives as a named reason, replaces old figures at
once, and tells the wallet owner to choose One-way Mode on Aster. The usual
three-miss wait does not apply because another retry cannot change the answer.

The same rule covers the shared positions table. The portfolio loader removes
inactive wallets before reading an encrypted key or calling an exchange. Aster
uses this read-only route because its account and positions are connected while
its order path remains closed.

## What one wallet costs

A live wallet on a classic account is **one cheap call**, and that is 2 of the
1,200 request-weight Hyperliquid allows a minute:

- `clearinghouseState` — equity, margin used, withdrawable, and every open
  position's unrealized profit. Weight 2.

Two more are asked for, and neither on every read:

- `userAbstraction` — which margin mode the account is in. In the unified modes
  the perp summary's totals stop being meaningful and the figures come from the
  spot side instead, which is why this is asked at all. It costs 20, the most
  of anything here, and it answers a setting a person changes on Hyperliquid's
  own site perhaps once ever — so it is asked **once a minute**, not once a
  read. The price of that: somebody who switches their account into or out of a
  unified mode while this app is open sees the figures read from the wrong side
  of it for up to a minute, and then it corrects itself.
- `spotClearinghouseState` — the spot balances. **Only the unified modes need
  them**, so only those accounts pay for them. A classic account used to read
  them on every poll and throw the answer away.

`hyperliquid-rate-limits.md` has the before-and-after figures, counted.

A practice wallet costs nothing per wallet. The engine settles them together
and asks the exchange once for every market they are collectively in — see
`paperWalletFigures`.

**One read stands in for the next for five seconds.** The panel polls every
fifteen seconds, and the flow runner and wallet picker ask the same question
on their own beats; without a cache each of them paid separately for the same
answer. Five seconds is deliberately shorter than the panel's own poll, so
nothing on screen is staler than it always was, while everything asking at
once shares a single answer. **A failed read is never cached** — one refusal
must not be handed to every caller for the next five seconds, and "Try again"
has to really try.

Aster shares its balance and position pair for two seconds. Each pair costs 10
of Aster's request units, 5 for balance and 5 for positions. The shorter cache
still joins the wallet card and positions table when they repaint together.

## A missed read is not "this wallet is worth nothing"

The exchange rations requests, so a miss is ordinary. The panel therefore
**keeps the figures that last landed** and marks them stale rather than
blanking the card.

- While holding old figures the card reads **"Figures a moment old"** with an
  amber dot, never "Connected". Nothing claims to be fresh when it isn't.
- After **three misses in a row** — about forty-five seconds of real silence —
  the card gives up and says "Can't reach it" with the Try again button.
- A single good read clears the count immediately.
- A wallet that has _never_ answered shows "Can't reach it" at once. There are
  no old figures to stand on, and inventing zeros would be making them up.

The merge rule is `keepGoodSummaries` in `src/lib/trade/wallets.ts`, and the
miss counts live in refs in `use-trade-account.ts` so the count cannot be
double-incremented by a re-render.

The browser also keeps the last complete wallet list and figures for each
signed-in account and exchange. A return visit draws that answer before the
first new read lands, so the panel does not go back through "Reading your
wallets" on every load. The saved answer can only draw the panel. It never
chooses the wallet used for an order or opens wallet settings. The fresh answer
always replaces the saved one. A failed refresh keeps the figures already on
screen under the same missed-read rules above.

**Why the rule exists.** Drawn straight, one failed answer replaced the whole
card with "Can't reach it" until the next tick fifteen seconds later put it
back — so the card flickered all day on an account that was never actually
unreachable. This is the same rule `keepUnreachableRows` already applies to
positions and orders, which was written after real _positions_ blinked out the
same way. A read that failed and a wallet that holds nothing must never look
alike.

## What is deliberately not softened

- **A figure the exchange sends that cannot be read fails the whole wallet.**
  Open profit enters Made or lost, so silently replacing a missing position
  figure with zero would still print a believable but wrong answer.
- **The whole-list read failing is different from one wallet failing.** If the
  request itself throws, the panel keeps what is on screen and only announces
  a failure when there is nothing up yet; the next tick is the retry.
