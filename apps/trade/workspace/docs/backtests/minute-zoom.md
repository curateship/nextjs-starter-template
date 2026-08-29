# How backtests read a candle, before and after the minute zoom

What changed in the backtest engine on 18 Aug 2026, why every saved result from
before that date is too kind, and what the numbers looked like at each step.
The code lives in `src/server/trade/backtest/engine.ts` (the walk),
`src/server/trade/backtest/zoom.ts` (fetching the minutes), and
`src/server/trade/paper.ts` (the wallet the walk spends from).

The rules this machinery must add up to are stated once, in
`../rules/trading-rules.md` — that file outranks both this doc and the code.

## How it worked before

A backtest walked one 4-hour candle at a time, one coin at a time.

- **A candle only says four prices** — where it opened, where it closed, and
  the furthest it got up and down. It never says the order those happened in.
- **So the engine invented the order.** A candle that closed up was read as
  "dipped first, then ran". A candle that closed down was read as "ran first,
  then fell". One straight pass, one dip, no bounce in the middle.
- **Coins took turns.** The engine walked coin A through the whole four hours,
  then coin B, then coin C. While coin A was buying its rungs, coins B and C
  were still valued at yesterday's price.

## The three lies that came from that

Each one was found by comparing a saved run against what the real minute
prices show, on the day everything fell at once — 10 Oct 2025.

- **The money lie.** With every coin valued at its candle's close while one
  coin was still being walked, one coin's recovery paid for the next coin's
  buys. One run bought $125,274 of coin in a single candle on a wallet holding
  $10,151, and the pot leapt 11× in four hours. No exchange lets that happen.
- **The order lie.** A rung and a sale inside the same candle were filled in
  whichever order the invented path said, not the real one. A coin that
  dipped, bounced through the sell target, and dipped again could only ever be
  read as one straight fall — so the sale in the middle never happened.
- **The turn-taking lie.** The first coin alphabetically got the whole wallet
  for four hours before any other coin could spend a penny. On the crash day
  the coins starting with A filled entire ladders while later coins never
  entered at all. Same shortage of money, wrong winners.

## What it does now

- **Busy candles are walked minute by minute, every coin on one clock.** When
  a candle has a rung, a sell target, a stop, or a liquidation price inside
  its range, the engine fetches that day's 1-minute candles and replays all
  240 minutes in true order, across every coin at once.
- **Money moves when it really moved.** A coin that bought and sold within
  minutes really does free its money for the next coin — and a coin still
  falling really does hold that money down. Buying power always values every
  coin at the worst price the current minute reached, never at a recovery
  that had not happened yet.
- **Quiet candles are left alone.** A candle where no level could possibly
  fire is walked the old way, because the minutes would change nothing. That
  rule is what makes this affordable: a year-long run zooms a few hundred
  candles, not twelve thousand. On one crash window it cut the zoomed candles
  from 4,513 to 38 with the same answer to the dollar.
- **Minutes are fetched once and kept.** They go into `trade_candles` like
  every other candle, so the second run over the same window fetches nothing.
  A coin the exchange has no minutes for is walked the old way, and the run's
  warnings name it.

## What else was fixed along the way

- **A liquidation no longer ends the ladder.** The old rule read "bought
  something, holding nothing → the ladder is over" — which cancelled every
  waiting rung the moment a position was wiped out. On 10 Oct 2025 GALA bought
  two rungs, was wiped at $0.006146, and had three rungs waiting below with
  $4,044 of the wallet sitting free; the old rule threw them away. Now the
  wiped position is gone and the rungs below carry on buying.
- **The worst moment inside a candle is on the graph.** The pot used to be
  written down once per candle, at its close, so a fall and a full recovery
  inside one candle left no trace. On the old curve the whole run's worst fall
  was 24%, back in April — the crash night never showed at all, because its
  candle closed recovered. The wallet was really down 71% at 21:21 that night,
  and the minute walk now records the candle's lowest moment as its own point
  on the curve.
- **Fills stay stamped on their own candle.** The minutes decide what happened
  and when; the chart still pins each arrow to the 4-hour candle it belongs
  to, so marks never float between candles.

## The two new switches this made necessary

Walking the minutes exposed a real problem the old engine had hidden: on a
crash day, dozens of coins take their first rung in the same few minutes, the
wallet cannot fund anyone's second rung, and a coin holding only its first
rung is wiped out 45% below it at 2×. Forty-four coins died that way in one
candle. Two switches on the DCA step answer it, both off unless turned on:

- **"Limit how many coins it opens at once"** — for example 5 coins per hour,
  counted across the whole wallet. Only a coin going from holding nothing to
  holding something counts; adding to a coin already held never does. A rung
  held back is not cancelled — it buys as soon as the window moves.
- **"Only open coins the exchange allows 10x or more"** — inside the Market
  crash card, and it only bites while the crash rule is holding out. The
  exchange decides how far a coin can fall before it closes you out: at 2×,
  a coin capped at 3× dies 33% below its average entry, one at 10× survives
  to 45%. With rungs 30% apart, the 3× coins die almost exactly where their
  next rung would have bought. What was measured: testing ONLY the
  10×-and-up coins over the whole window cut the wipe-outs from 55 to 11 and
  the worst fall from 71% to 55%. The crash-only switch should land close to
  that — 54 of the 55 wipe-outs were on the crash candle — but it has not
  been measured on its own yet.

Both rules are enforced where a rung actually fires, so they hold on practice
and real wallets too, not just in backtests.

## What the numbers did

Two measurements, because they came from two different runs.

The saved "2x stress — 2025 to Oct" run — 156 coins, 1 Jan to 21 Oct 2025,
funding charges on, $10,000 start — replayed both ways:

| | old guessed path | real minutes |
| --- | --- | --- |
| ended with | $27,577 | $17,104 |
| profit | $17,577 | $7,104 |
| worst fall from a peak | 24% (in April) | 71% (the crash night) |

And the 21 coins that traded on the crash day, 1 Sep to 14 Oct 2025, funding
off: the old path ended at $20,123 against $12,982 on real minutes, and the
biggest one-candle pot jump fell from 1.96× to 1.23×.

On quiet windows the two agree to the dollar — the guess only flattered the
violent days, which are exactly the days this strategy makes its money on.

**So every backtest saved before 18 Aug 2026 is too kind. On the stress run
above, $10,473 of its $17,577 profit was the guess, not the market. Re-run
before trusting a number.**

## The honesty limit that remains

The replay fills a rung as a resting order at the exact rung price, paying the
maker fee. A real wallet fires a watched rung **at market** the moment price
crosses it — and in a real crash the order book is thin, so the fill lands
worse than the trigger. The gap between those two is biggest at exactly the
moment these results make their money. Until the replay models the
market-order fill, crash-day profits should be read as the ceiling, not the
expectation.
