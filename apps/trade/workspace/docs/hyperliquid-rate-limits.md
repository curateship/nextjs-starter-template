# Hyperliquid's rate limits, and how this app stays inside them

Hyperliquid puts a cap on how often you can ask it anything. Go over and it
answers `429 Too Many Requests` to everything — prices, orders, your own
positions — until you slow down. On 13–14 Aug 2026 this app blew through that
cap so badly that the chart could not load, and the fixes below took a full
day. This doc is the record: the limits, every way we were spending them, and
what changed.

## The limits (as of Aug 2026)

Hyperliquid measures requests in "weight" — cheap questions cost 2, most cost
20 — and there are two separate budgets:

- **Per machine (IP): 1,200 weight a minute.** This is the one we kept
  hitting. It resets every minute.
  - Cheap, weight 2: prices (`allMids`), your positions
    (`clearinghouseState`), your spot balances (`spotClearinghouseState`),
    order status, the order book, the exchange's own status.
  - Normal, weight 20: almost everything else — market metadata, open
    orders, fills.
  - Candles (`candleSnapshot`): 20, **plus 1 more per 60 candles asked
    for**. Our usual 500-bar request costs about 28.
- **Per wallet address: 1 request per $1 ever traded, plus 10,000 free to
  start.** This one never resets — it only grows as the address trades. Run
  it out and that address gets one request every 10 seconds, forever, until
  it trades more volume. A fresh testnet wallet that trades nothing lives
  entirely on the 10,000.
- **Websockets are nearly free**: up to 10 connections, and the exchange
  pushing data to us costs no request weight at all. Every fix below that
  says "websocket" is spending from this free pool instead of the 1,200.
- **Open orders**: 1,000 resting orders per wallet to start (+1 per $5M
  traded, capped at 5,000). Not a request limit, but the reason resting
  ladder rungs were expensive in a second way.

Practice network (testnet) and the real network have the same written limits,
but testnet is far touchier in practice — its 429s come earlier and in
bursts, and its own status replies sometimes just fail. A refusal there is
routine, not an outage.

## What we were spending, and on what

Everything below was measured, not guessed — the app has a call counter
(start the server with `TRADE_COUNT_EXCHANGE_CALLS=true` and it prints every
call by name, every 30 seconds). The worst offenders, in the order we found
them:

- **Asking every market "what does this wallet hold?"** Hyperliquid is not
  one market — it is a main one plus every one people have opened: 10 on the
  real network, **249 on testnet**. There is no single REST question for
  "what do I hold anywhere", so once a minute the app asked each market in
  turn: ~5,500 weight in one burst, more than four whole minutes of budget.
- **Describing every market, one call each, in three different places.**
  The market list, the price feed's reconnect, and the order-id table each
  asked all 249 markets for their coin lists separately (~20 weight each).
  Worse, the price feed re-asked **on every reconnect**, and a rate limit
  drops the connection — so the 429 caused reconnects which caused more
  429s. Measured at 19 reconnects in 30 seconds.
- **The same portfolio question asked by three callers at once.** The
  browser polls every 4 seconds, the trading engine looks every second, and
  the smart-order reconciler asks on top — each making its own pair of
  calls for the same wallet. Measured at 51 `frontendOpenOrders` in 30
  seconds: 1,020 weight/minute on one question.
- **Candles re-fetched every second.** The engine asked for each ladder's
  candle history on every one-second pass — 127 `candleSnapshot` calls in
  30 seconds (~3,500 weight/min) — because its cache was keyed on a
  timestamp that changed every pass, so it never hit once.
- **A flow attempting every coin, every second.** 157 coins, each attempt
  costing a price read, an account read and sometimes a doomed order. And
  doomed orders themselves: rungs worth $2 sent to an exchange whose
  minimum is $10, refused one by one, ~13 an hour, forever.
- **Browsing charts.** Every look at a market pulls five hundred candles
  (~28 weight) and nothing remembered the answer — flicking between two
  charts paid full price on every single click. Brisk browsing on top of
  the engine's ordinary traffic tipped the minute over, and the refusal
  landed on the chart's own next pull: "could not load", caused by the
  clicking itself.
- **118 ladders all asking for base history in the same second.** Each
  ladder wants its 4-hour base candles once per 4 hours (~28 weight each).
  All at once = ~3,300 weight in one second, every 4 hours.

## What changed

Every fix is one of three moves: ask over a websocket instead (free), share
one answer between callers (cache), or stop asking a question whose answer
cannot have changed (pace / don't ask).

- **Positions come over a websocket now.** One `allDexsClearinghouseState`
  subscription pushes what a wallet holds on every market as it changes —
  the 249-market sweep is gone. The old REST read stays as the fallback if
  the socket goes quiet for 5 minutes, because a stale position about real
  money is worse than a slow one. (`user-markets.ts`)
- **Market descriptions are one call, kept for 10 minutes.** `allPerpMetas`
  returns every market's coin list at once; the answer is cached because it
  only changes when a coin is listed. The reconnect storm is dead twice
  over: reconnects reuse the cached layout, and the retry back-off no
  longer resets on the first message — a connection must stay healthy 30
  seconds before it counts. (`orders.ts`, `live-prices.ts`)
- **One portfolio read per wallet per 4 seconds, shared.** Matching the
  screen's own refresh beat, so nothing on screen got staler. Placing or
  cancelling any order throws the cache away instantly. 51 calls per 30s
  became 14. (`orders.ts`)
- **Candle reads are cached by market** (30 seconds — a closed 4h bar
  cannot move) **and paced**: at most one candle fetch every 2.5 seconds
  across all wallets, so 118 ladders drain their 4-hour base refresh over
  ~4 minutes instead of one second. 127 calls per 30s became 14.
  (`candles.ts`, `live-smart-orders.ts`, `paper.ts`)
- **A flow paces itself and backs off.** It looks at 12 coins per pass
  (least-recently-looked first), and when the same refusal comes back three
  times in a row it stops asking — 2 minutes for a rate limit, doubling to
  30. When it comes back it retries **one** coin, so being wrong costs one
  call. A 429 is named on screen ("the exchange is asking us to slow down")
  instead of masquerading as a missing price. (`flow-run.ts`,
  `flow-waiting.ts`, `prices.ts`)
- **Nothing rests on the book any more.** A ladder's rungs are prices the
  engine watches, fired at the moment price crosses them. That removed the
  place/cancel churn, the order-cap problem, and the double-drawn chart
  lines in one move. And a rung under the exchange's $10 minimum never
  fires at all — it stays waiting rather than spending a request to be told
  no. (`smart-ladders.ts`, `smart-orders.ts`, `live-smart-orders.ts`)
- **Ordinary ladders want no candle feed at all now.** Only two-green mode
  reads candles (its trigger is two green closes by definition). A 157-coin
  flow stopped asking for 157 candle feeds. (`dca.ts`)
- **Charts are remembered at both ends.** The server keeps each chart's
  answer for 15 seconds, so flicking between markets stops re-asking the
  exchange; the browser keeps the last forty charts it drew and paints them
  the instant you click back — the fresh answer replaces them silently, and
  a refresh that fails never overwrites bars already on screen. An open
  chart now refreshes itself only when a bar of its own timeframe closes:
  once a minute on the 1m chart, every four hours on the 4h — the forming
  bar is painted live by the price feed either way, and a hidden tab skips
  its turn. When the chart's own pull is the one refused, it now says so —
  "Hyperliquid is asking us to slow down" — instead of the generic could-not-
  load. (`candles.ts`, `api/candles.ts`, `chart-panel.tsx`)
- **Booting no longer sweeps.** A fresh server's funding feed is always
  cold, and the portfolio fallback swept every market on the exchange —
  five hundred calls in the first half minute of every restart, so the app
  rate-limited itself on boot. While the feed is warming up (its first push
  lands within seconds), the read covers the main market only.
  (`user-markets.ts`, `orders.ts`)
- **Doomed orders cannot loop.** Hyperliquid keeps each of its markets' money
  separate, so a buy on a market where the wallet holds nothing is refused
  every single time — and a refused rung used to be recorded as bought,
  which ended the ladder, which let the flow place a fresh one into the same
  refusal, forever. Three guards now: switching a flow on refuses coins on
  markets the wallet has no money on (the exchange gets a moment to say
  which; silence skips the check), placing a ladder by hand refuses the same
  way, and the engine itself skips firing on any market the feed says is
  unfunded. When the exchange still definitely refuses an order — its own
  status said no, so nothing stood — the rung is put back to waiting instead
  of being recorded as bought; that promise has its own error code
  (`LIVE_ORDER_REFUSED`) minted at the one line where it is true, and
  anything more ambiguous still keeps the safe "assume it filled" state.
  (`flow-run.ts`, `live-smart-orders.ts`, `smart-ladders.ts`,
  `hyperliquid/orders.ts`)

## Reading an account, counted again on 21 Aug 2026

The fixes above left one spender standing, and it was the biggest one. Reading
a wallet — its positions, its resting orders and its own figures — was costing
more than a third of the whole allowance for a single wallet nobody was even
trading with.

Counted, not guessed. `src/server/protocols/hyperliquid/account-cost.test.ts`
drives the real read paths against a fake exchange and adds up Hyperliquid's
own published weights, so the same figure comes back every time and the build
fails the day it goes up. The live counter needs a real account and a real
minute; this needs neither, and it measures the same thing.

**The scenario, stated so the two figures compare.** One Trade tab left open,
one active real wallet, the wallet using only the main market, the market
socket up, nothing placed or cancelled. The chart and the bottom panel ask for
positions and orders every four seconds; the account card asks for its figures
every fifteen. The market catalogue is excluded — it is one pair of calls every
ten minutes for the whole app.

| One minute of watching | Before | After |
| --- | --- | --- |
| One wallet | 426 weight | 58 weight |
| Three wallets on three accounts | 1,278 weight | 174 weight |

1,278 is more than the entire 1,200-a-minute budget, spent before a single
price or candle was asked for. That is the shape of the August failure, still
sitting there.

**And counted again live, on the real account.** The dev server run with
`TRADE_COUNT_EXCHANGE_CALLS=true`, the Trade workspace left open on the real
network for two and a half minutes, the same wallets both times, and the third
thirty-second window taken from each so the boot traffic is out of it:

| Steady state, per minute | Before | After |
| --- | --- | --- |
| Real network | 1,088 weight | 221 weight |
| Practice network | 285 weight | 56 weight |

The before figure is over the cap. 1,088 of the 1,200 went on the real network
alone, with the practice network on top of it, in ordinary running with nothing
being traded — which is what makes an otherwise harmless burst of chart
browsing turn into refusals. There were no refusals in either run.

`frontendOpenOrders` went from 18 calls in thirty-two seconds to **zero**: the
socket is doing the work, and the fallback to asking the exchange never fired.

Where the 426 went, and what each cut was:

- **Resting orders: 300 weight a minute, seventy per cent of the whole thing.**
  `frontendOpenOrders` costs 20 and was asked fifteen times a minute, for an
  answer that usually had not changed. Hyperliquid pushes the same list over a
  socket for nothing, in full rather than as a stream of changes, so there is
  no running total to get out of step. It is used only when it can be trusted,
  and every doubt falls back to asking the exchange the way it always did:
  nothing until a push has landed, nothing pushed before this app last changed
  an order, and nothing from a feed that has gone quiet for five minutes. The
  worst that feed can do is save nothing. (`open-orders-feed.ts`)
- **The margin mode: 80 weight a minute.** `userAbstraction` costs 20 — the
  most expensive question this read asks — and it answers which margin mode the
  account is in, a setting a person changes on Hyperliquid's own site perhaps
  once ever. Now asked once a minute instead of once a read. The price is
  stated plainly: somebody who switches their account into or out of a unified
  mode while this app is open sees the figures read from the wrong side of it
  for up to a minute. (`account.ts`)
- **Spot balances read and thrown away: 8 weight a minute.** Only the unified
  modes use them. A classic account was paying for them on every read and
  discarding the answer. Now the mode decides whether they are asked for at
  all. (`account.ts`)

**Two wallets pointed at one account already share their reads**, and always
did — both caches are keyed on the address, not on the wallet, and the entry
goes in before the read is awaited, so the second wallet joins the first one's
answer rather than paying for its own. Pinned by a test rather than left as a
claim.

The five-second rule for wallet reads is untouched: a failed read is still
never remembered, and a stale answer is still marked as a moment old rather
than served as fresh. See `wallet-reads.md`.

## The result, measured

- Before: bursts of ~5,500 weight, a log with **43,653** refusals in one
  session, and a chart that could not load its candles.
- After the August work: roughly **500 weight a minute** in normal running —
  under half the budget — and **zero** refusals over a multi-minute watch with
  a live flow working 118 ladders.
- After the account-read cuts of 21 Aug 2026: **277 weight a minute** across
  both networks, measured live with the counter. See the section above for how
  that was counted and what it replaced.

## Where the wallet panel fits

The account cards are their own spender and have their own doc:
`wallet-reads.md`. Three calls per live wallet, every fifteen seconds, shared
through a five-second cache, and **only for wallets that are switched on** —
reading wallets nobody was trading with was itself a cause of the refusals it
then displayed.

## If it happens again

- Start the dev server with `TRADE_COUNT_EXCHANGE_CALLS=true` and read the
  30-second call summaries. Count first, guess never — every wrong guess in
  this saga cost an hour.
- A burst of 429s drops the price websocket, which used to cause its own
  429s. If refusals climb *and* the price feed keeps reconnecting, suspect a
  new burst source, not the connection.
- Remember the per-address budget: a wallet that has never traded has
  10,000 requests for life. On testnet, trading pretend volume is how you
  earn more.
