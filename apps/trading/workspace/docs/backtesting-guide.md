# Back-testing rules

Rules for testing any trading strategy so the results are honest and I don't
have to repeat myself. Plain English on purpose.

## The setup

- **Test at least 20 markets at once**, not one. A strategy that only works on one coin
  is almost always a fluke.
- **Do not overfit**
- **Include high-vol, mid-vol and low-vol** coins so we get a range of variants
- **Match the timeframe to the strategy.** Using the wrong timeframe breaks the strategy.
- **Backtest data comes from Binance, not Hyperliquid.** Hyperliquid only serves
  ~5,000 candles per timeframe (15m ≈ 52 days), which is too short. Binance keeps
  years of history and lists more coins, so all backtest candles come from
  Binance. Hyperliquid is still used for live trading, order books, and slippage.
- **How many markets fit depends on the timeframe and the window.** One run may
  pull a million candles in total, so a market's cost — its window of candles plus
  the strategy's warm-up — sets how many fit. 51 is the ceiling; 30 days of 1-minute
  candles allows 22, and the longest window at any timeframe allows 19. Randomize
  fills to whatever the current setting allows, and the panel prints the number, so
  the 20-market minimum above is reachable at every timeframe.

## Costs — the thing that makes or breaks it

- **Always include trading costs: slippage + fees** (Hyperliquid taker fee is
  ~0.045%). Slippage fees is usually 4 or 0.04%. Published "0.5–3%" numbers are for big
  ($100k) orders. A small $2k order costs far less (often 0.01–0.05%). Match the
  cost assumption to the size we'll really trade.
- **Add a stress buffer.** The measured cost is a calm-market number. Strategies
  usually trade during fast moves, where the real cost is 2–3× higher. Plan
  around the higher number.
- **Sanity-check fill prices.** A take-profit exit must fill at the take-profit
  level, never better. If the average winning trade is *bigger* than the
  take-profit percent (on a 24/7 market with no gaps), the backtest is filling
  exits at the bar's best price — a bug, not an edge. This exact bug faked a
  "17%/month" QQE result in July 2026; the engine now pauses the intrabar price
  path at each strategy's trigger levels so TP/SL fill at their own price.

## Don't fool yourself (overfitting)

- **Never optimize on a single coin.** Tune across the whole 20+ basket.
- **Never hand-pick the winning coins after the fact.** Choosing "the coins that
  happened to work" is cheating — you can't know them in advance.
- **Always walk-forward.** Tune the settings on older data, then test on newer
  data the strategy has never seen. If it falls apart on the unseen data, it was
  curve-fit — throw it out.
- **Report the out-of-sample (walk-forward) number, not the tuned number.** The
  number from the data you tuned on is always too rosy.

## Rules of engagement for an optimisation run (NOT optional)

The rules above say what a clean test looks like. These say how to *run* one
without quietly destroying it. They exist because on 25–26 July 2026 a QFL
campaign broke every one of them: ~3,000 combinations, ~12 re-runs, the scoring
rule changed twice mid-campaign, the market basket changed three times, and six
separate candidates tested against the window that was supposed to stay sealed.
Every number reported along the way collapsed on the next honest test. Hours were
spent generating noise and it read like progress the whole time.

1. **Decide these BEFORE the first search, write them down, and do not change
   them:** the market basket, the walk-forward dates, the scoring rule, the cost
   assumptions. Changing any of them mid-campaign means the holdout is
   contaminated — if you must change one, you are starting a NEW campaign and
   the old results are void.
2. **One walk-forward. If it fails, that is the answer.** Do not re-run with a
   different scoring rule, a different basket, or a different split hoping for a
   better number. "Keep trying until it wins" is the definition of overfitting,
   and no amount of it produces a real edge.
3. **Never say a tuned number out loud.** Not in a progress update, not as a
   leaderboard, not as "the search is at 5%/month so far". A contaminated number
   is worse than no number, because it reads as progress and gets acted on.
   Mid-run status is *"N candidates screened, nothing validated yet."*
4. **Seal the holdout.** Load it once, test ONE candidate — the one the tuning
   and validation windows already chose — and report whatever it says. Every
   extra peek is another chance to fool yourself, and they accumulate silently.
5. **Declare the degrees of freedom with the result.** State how many
   combinations were tried, how many times the run was restarted, and how many
   candidates touched the holdout. A result without those numbers cannot be
   judged. "Best of 6 candidates against a window I'd already looked at" is a
   different claim from "one shot at sealed data" — say which one it is.
6. **One clean window is one observation, not a verdict.** A holdout that lands
   in a crash tells you what happens when nothing works; a holdout in a bull run
   tells you nothing about a crash. Aim for a clean read in both regimes before
   claiming a strategy works, and say plainly which one you have.
7. **A negative result delivered cleanly IS the job.** "This does not clear the
   bar" is a complete, valuable answer. Say it early and stop.

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
- **The pot is the starting balance, once.** Every basket percent — Net P&L,
  combined drawdown, bucket low, the combined equity curve — divides by that
  single number, however many markets the run covered. Testing 20 markets does
  not mean 20 accounts existed. Until 26 July 2026 non-DCA baskets divided by
  the starting balance × the market count, so **any basket percentage copied out
  of the app before that date is roughly 1/N of its true size** — profit and
  loss alike. DCA runs already used one wallet and are unaffected.
  This assumes each market sizes its bets off a share of the pot (the usual
  `targetEquityPct` setup). If every market were instead sized as though it had
  the whole balance to itself, the run would be over-committed and no
  denominator would make it realistic.
- **Track how many coins are green.** A real edge works on the majority of the
  basket, not a lucky few.
- **Use portfolio drawdown** (all coins combined), not just one coin's.
- **Check "In Markets" before you believe the P&L.** A test window stops on a
  fixed date, usually in the middle of some trades. That tile is the money still
  sitting in open positions at that moment — it is an unfinished bet, not a
  booked result. A big number there means much of the P&L could still swing.
- **Read the wallet tiles on a DCA basket.** Peak Wallet is the most of the one
  shared pot ever committed at once, with how long it stayed up there
  underneath ("held 6d"). Avg Wallet is how much of the pot was typically in
  use, weighted by time. Read them together: a 104% peak held for 6 days out of
  a 200-day run, against a 25% average, means the money mostly sat idle and
  there was room for more coins. A peak held for a large slice of the run means
  coins were being turned away, so a bigger basket would not have helped. Both
  are blank on every non-DCA run, which gives each market its own account
  instead of sharing one wallet.
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

## Save the final results

- **Save the final, honest run to the database** so it can be inspected live —
  the walk-forward (out-of-sample) version is the one that matters most.
- Name it clearly with the key settings (timeframe, slippage, config).
