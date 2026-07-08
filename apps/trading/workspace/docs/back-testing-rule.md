# Back-testing rules

Rules for testing any trading strategy so the results are honest and I don't
have to repeat myself. Plain English on purpose.

## The setup

- **Test at least 20 markets**, not one. A strategy that only works on one coin
  is almost always a fluke.
- **Include high-vol and low-vol coins** (or a clear category like mid-caps) so
  we see the full picture, not a flattering slice.
- **Match the timeframe to the strategy.** VWAP is an intraday tool → use 15m,
  not 4h or daily. Using the wrong timeframe breaks the strategy.
- **Mind the data limit.** Hyperliquid only serves ~5,000 candles per timeframe:
  15m ≈ 52 days, 1h ≈ 200 days, 4h ≈ 800 days. Pick the timeframe partly by how
  much history you need.

## Costs — the thing that makes or breaks it

- **Always include trading costs: slippage + fees** (Hyperliquid taker fee is
  ~0.045%). A strategy that trades a lot dies on costs even if each cost is tiny.
- **Never just pick a slippage number to make it look good.** Slippage is set by
  the market, not by us. Measure the *real* cost from the live order book for our
  *actual order size*.
- **Slippage depends on order size.** Published "0.5–3%" numbers are for big
  ($100k) orders. A small $2k order costs far less (often 0.01–0.05%). Match the
  cost assumption to the size we'll really trade.
- **Add a stress buffer.** The measured cost is a calm-market number. Strategies
  usually trade during fast moves, where the real cost is 2–3× higher. Plan
  around the higher number.
- **Find the break-even cost** — the cost level where profit hits zero — and make
  sure the real cost is comfortably *below* it. If the real cost is close to
  break-even, the edge is too fragile to trust.

## Don't fool yourself (overfitting)

- **Never optimize on a single coin.** Tune across the whole 20+ basket.
- **Never hand-pick the winning coins after the fact.** Choosing "the coins that
  happened to work" is cheating — you can't know them in advance.
- **Always walk-forward.** Tune the settings on older data, then test on newer
  data the strategy has never seen. If it falls apart on the unseen data, it was
  curve-fit — throw it out.
- **Report the out-of-sample (walk-forward) number, not the tuned number.** The
  number from the data you tuned on is always too rosy.

## Bet size and wipe-outs

- **Keep each trade about the size of the account — a normal bet.** Making trades
  *bigger* than the account makes the profit look amazing, but it makes the
  losses just as big and can wipe you out. This is exactly what faked some early
  "1%+ a day" results. Don't do it to pump the numbers.
- **Throw out any result where a single coin loses close to 100%.** That means
  the account got wiped on that coin. The backtest doesn't realize it and keeps
  "trading" a dead account, so those numbers are fiction.

## What counts as a real result

- **Use percentages, not dollar amounts.** The dollar size is arbitrary.
- **Track how many coins are green.** A real edge works on the majority of the
  basket, not a lucky few.
- **Use portfolio drawdown** (all coins combined), not just one coin's.
- **Be honest about the ceiling.** Some targets (e.g. 80% of coins green *and*
  5–10%/month) may simply not be possible for a given strategy. Say so instead of
  forcing it.

## Targets to aim for

- Monthly profit: **3–6%** (realistic), net of real costs, with a normal
  (not oversized) bet.
- Keep max drawdown reasonable (aim under ~20–30%).
- Majority of coins green.

## Order of operations (never skip a step)

1. **Backtest** across the basket with real costs → tells us it *might* work.
2. **Walk-forward** (test on unseen data) → tells us it isn't just curve-fit.
3. **Measure real slippage** from the live order book at our order size → tells
   us the cost assumption is fair.
4. **Paper-trade on the live market** (fake money, real prices, going forward) →
   the only true test of real fill quality. No backtest can replace this.
5. **Real money, small at first** → only after the steps above pass.

## Save the final results

- **Save the final, honest run to the database** so it can be inspected live —
  the walk-forward (out-of-sample) version is the one that matters most.
- Name it clearly with the key settings (timeframe, slippage, config).
