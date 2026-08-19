# Wallet figures — who is asked, how often, and what a miss means

The five rows on a wallet card — Free, In trades, Open profit, Settled, Since
it started — come from the exchange, not from our database. This doc says
which wallets get asked, how often, what it costs, and why a failed answer no
longer wipes the card.

The rules this machinery must add up to are stated once, in
`trading-rules.md` — that file outranks both this doc and the code. The
request budget this all has to live inside is `hyperliquid-rate-limits.md`.

The code lives in `src/server/trade/wallets.ts` (`loadWalletSummaries`, the
sweep), `src/server/protocols/hyperliquid/account.ts` (one wallet's figures),
`src/components/trade/use-trade-account.ts` (the poll) and
`src/components/trade/account-panel.tsx` (the cards).

## Only wallets that are switched on are asked

Every wallet has a status: **active** or **inactive**. The sweep reads the
whole list — the panel needs it for its tabs — but asks the exchange **only
about the active ones**. An inactive wallet answers `state: "inactive"`
without a single request being sent, and its practice equivalent is not
settled either.

**This was not always true, and it was expensive.** Every live wallet costs
three requests each time it is read, and the exchange counts every request
from this machine together. Five wallets meant up to sixty requests a minute
from this one panel, most of them about wallets nobody was trading with.
Running out of allowance is exactly what makes a wallet answer with nothing —
so the wasted reads were causing the very "Can't reach it" they were paying
for.

**Inactive is not a failure and must never be drawn as one.** The card says
"Not switched on" and the picker says "Inactive". Both look identical to
"Can't reach it" if you are careless, and they mean opposite things: one is a
wallet nobody is using, the other is a wallet that would not answer.

## What one wallet costs

A live wallet's figures are three calls to Hyperliquid, made together:

- `userAbstraction` — which margin mode the account is in. In the unified
  modes the perp summary's totals stop being meaningful and the figures come
  from the spot side instead, which is why this is asked at all.
- `clearinghouseState` — equity, margin used, withdrawable, and every open
  position's unrealized profit.
- `spotClearinghouseState` — the spot balances, needed by the unified modes.

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
- A wallet that has *never* answered shows "Can't reach it" at once. There are
  no old figures to stand on, and inventing zeros would be making them up.

The merge rule is `keepGoodSummaries` in `src/lib/trade/wallets.ts`, and the
miss counts live in refs in `use-trade-account.ts` so the count cannot be
double-incremented by a re-render.

**Why the rule exists.** Drawn straight, one failed answer replaced the whole
card with "Can't reach it" until the next tick fifteen seconds later put it
back — so the card flickered all day on an account that was never actually
unreachable. This is the same rule `keepUnreachableRows` already applies to
positions and orders, which was written after real *positions* blinked out the
same way. A read that failed and a wallet that holds nothing must never look
alike.

## What is deliberately not softened

- **A figure the exchange sends that cannot be read fails the whole wallet.**
  Open profit is subtracted from the journey to get the settled figure, so one
  silently-zeroed position would put a wrong number in two rows and still look
  like an answer.
- **The whole-list read failing is different from one wallet failing.** If the
  request itself throws, the panel keeps what is on screen and only announces
  a failure when there is nothing up yet; the next tick is the retry.
