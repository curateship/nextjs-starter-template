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
    (`clearinghouseState`), order status, the order book.
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

## The result, measured

- Before: bursts of ~5,500 weight, a log with **43,653** refusals in one
  session, and a chart that could not load its candles.
- After: roughly **500 weight a minute** in normal running — under half the
  budget — and **zero** refusals over a multi-minute watch with a live flow
  working 118 ladders.

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
