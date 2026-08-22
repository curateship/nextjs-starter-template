# Wallet figures — who is asked, how often, and what a miss means

The five rows on a wallet card are Free, In trades, Open profit, Settled, and
Made or lost. The exchange supplies the account and open-position figures.
Settled comes from its recorded fills since midnight yesterday in Toronto, and
Made or lost adds that settled money to current open profit. Older profit and
changes to the account balance never enter those two rows. This doc says which
wallets get asked, how often, what it costs, and why a failed answer no longer
wipes the card.

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
sweep), `src/server/protocols/hyperliquid/account.ts` (one wallet's figures),
`src/components/trade/use-trade-account.ts` (the poll) and
`src/components/trade/account-panel.tsx` (the cards).

**This mechanism is not yet compliant with the exchange-connection rule.** A
screen may poll Trade's own server to repaint, but that server must answer from
state maintained by the exchange's account socket. It may not turn each screen
poll into another exchange request. Hyperliquid is there for prices, positions,
resting orders and fills. Phemex and KuCoin still ask for positions, resting
orders and fills on every pass.

## What each exchange's private line offers

Tested against the live exchanges on 22 August 2026, with this app's own keys.
Both work. Neither is built yet, and the two need different handling.

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

Both feeds must fall back to asking whenever they cannot vouch for an answer,
the way `hyperliquid/user-fills-feed.ts` does. A feed that guesses is worse
than the asking it replaced.

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
