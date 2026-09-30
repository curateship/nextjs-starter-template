# Wallet checker

`/tools/wallet-checker` takes any Hyperliquid wallet address and says what
that wallet really made and lost, worked out from its own trades. A trader on
X claims $40,000 last month and posts their address; anybody can paste it here
and see the figure the trades add up to. The page opens without an account.

## What it shows

One card per checked wallet, with the shortened address as its heading and the
day its history starts underneath.

- **Made in the last 30 days** and **Made over the whole history**, each with
  the fees paid inside the same window underneath.
- **Trades that made money**, out of 100, with the count it came from: "67 out
  of 100, 2 of 3 finished trades".
- **Biggest loss**: the single worst finished trade, its coin and the day it
  closed.
- **Open now**: how many positions the wallet holds this minute.
- **The wallet's Trade profile**, linked, or one line inviting the owner to
  put their record on Trade.

The page never says who owns an address. Nothing on it is a guess at a name.

## Where the numbers come from

Hyperliquid publishes every address's trade history to anybody who asks, and
this page asks the same two questions Trade's own trading asks about a wallet
it holds the keys to.

- **The fills**: `userFillsByTime`, newest first, in one request.
- **The open positions**: `clearinghouseState`, Hyperliquid's main perps
  market only. A position on one of the markets other groups host on
  Hyperliquid is not counted, because there is no single question covering
  them all and asking each one is ten requests for one visitor.

Both reads live in `src/server/protocols/hyperliquid/public-wallet.ts`. They
are deliberately separate from the engine's own reads in `orders.ts`, which
answer the same questions off an open socket with gap bookkeeping around them.
All of that exists to keep a wallet Trade watches every second cheap, and none
of it fits a stranger's address pasted once.

## The counting is the P&L page's counting

A wallet that is on a Trade profile shows the same numbers here and on
`/t/<handle>`, because both call the same three functions. This is in
`buildWalletReport`, `src/lib/free-tools/wallet-checker.ts`.

- **A fill's money** is the exchange's own `closedPnl` less the fee it
  charged (`moneyForWalletFill`). Trade never subtracts a figure of its own,
  so the total agrees with the account.
- **A trade** is flat to flat: from holding nothing in a market to holding
  nothing again, however many times it was added to or trimmed in between
  (`buildLiveTrades`).
- **The windows** are `publicFigures`, the function a public trader profile
  uses, on the Toronto clock.

The one figure that can differ is a member's grid sale. On a profile, a sale
made by a grid is priced from the grid that made it, which only that member's
own account knows. A stranger's wallet has the exchange's figure and nothing
else, so a heavily gridded wallet's total here is the exchange's version of
the same trading.

## How far back it goes

Hyperliquid answers one fills question with at most 2,000 rows, and always the
most recent ones. The page therefore says the day its history starts, every
time, under the address.

- **The whole history fit**: "Hyperliquid gave its whole history for this
  wallet, starting Mar 2, 2026."
- **It did not fit**: the page says everything before that day is missing and
  that the figures cover that day onwards.
- **The cut falls inside the last 30 days**: a wallet that traded more than
  2,000 times in a month. The page adds that the 30-day figure covers only
  part of the month, so nobody reads a short figure as a full one.

The request asks for the newest rows first, which matters: asked from the
beginning of time, Hyperliquid returns the oldest rows it will part with, and
a busy wallet's answer would be ancient history with nothing from this month
in it.

## Staying inside Hyperliquid's budget

Hyperliquid allows this machine 1,200 request-weight a minute across
everything, the trading engine included
(`workspace/docs/protocols/hyperliquid-rate-limits.md`). One wallet check
costs 22: 20 for the fills and 2 for the positions. Three things keep the page
from starving the trading.

- **Each answer is kept for 10 minutes**, by address. The same address inside
  those ten minutes is handed the kept copy, costs the exchange nothing, and
  counts against nobody's limit. This is most of the protection if a post
  goes viral.
- **One read per address at a time.** The kept copy only helps once an answer
  exists, and a viral post means a thousand people pasting one address into an
  empty cache in the same three seconds. They wait on the first read instead
  of each starting one, so that moment costs the exchange a single request.
- **One visitor may check 5 wallets a minute.** Over that, the page says
  "You can check 5 wallets a minute. Try again in a minute."
- **Everybody together may run 12 reads a minute**, which is 264 weight, a
  fifth of the budget. Over that, the page says "Too many wallets are being
  checked right now", which is deliberately a different sentence: it is not
  that visitor's doing. Only the limit itself says this. A database that will
  not answer is a different failure and is never dressed up as a busy page.

Both limits are counted in the database (`enforceRateLimit`), so a restart
does not hand anybody a fresh minute. The numbers are the three constants at
the top of `src/lib/free-tools/wallet-checker.ts`.

## What it refuses, and what it says when something fails

- **Not an address**: checked in the browser and again on the server before
  anything is asked, so a typo never reaches Hyperliquid and never spends a
  check. `0x` and 40 hex digits, upper or lower case, spaces around it
  ignored. The sentence arrives as the error toast and the box is ringed red;
  leaving the box empty is not a mistake and is not marked.
- **Check pressed twice**: the second press while the first is still out is
  ignored, because the kept copy cannot help before the first answer exists.
- **A wallet with no trades**: "This wallet has no trades on Hyperliquid. It
  may trade on another exchange, or hold coins without ever having traded them
  here."
- **Hyperliquid did not answer**: "Hyperliquid did not answer. Try again in a
  minute." The exchange's own error goes to the server log, never to the page.

## The Trade profile link

A checked address is matched against `trade_record_wallets`. A wallet counts
only while its member has not deleted it, its last ownership check did not
fail, and the profile is switched on and not hidden by an admin: the same
three conditions that decide whether `/t/<handle>` answers at all. The stored
address is compared in lower case, because a member may have saved the
checksummed form.

An address with no profile behind it gets one line inviting its owner to put
their record on Trade.

## Where it is listed

The entry in `src/lib/free-tools/registry.ts` is marked shipped, so its card
shows on `/tools` under Wallet tools. `src/routes/tools_.wallet-checker.page.ts`
declares the page, which is what puts it in the sitemap and on the Pages
dashboard, and its title and share preview come from that declaration through
`freeToolHead`. The page has no sub-pages, so nothing is added to the app's
sitemap hook. A visitor who is signed out sees the Create account card at the
end.

## Not in this page

Solana and other chains are later tasks. So is naming who owns a wallet, which
this page will not do.
