# The trading rules

The rules of this app, stated once, in plain words. **This file outranks the
code.** Code is what happens; these rules are what is supposed to happen — and
when the two disagree, the code is the thing that is wrong. Every rule here
should be pinned by a test of the rule itself, not of the mechanism behind it,
so a change to the mechanism cannot quietly change the rule.

Most of these were learned the hard way on 18 Aug 2026, when several of them
turned out to live nowhere but in timing, comments, or nobody's head. The two
mechanism docs — `watched-orders.md` and `backtest-minute-zoom.md` — say how
the machinery works; this file says what it must add up to.

## Orders

- **Nothing is ever bought or sold at market.** Every order waits at its price.
  When the market reaches it, the engine rests a post-only limit just off the
  touch and chases — maker fees, never taker.
- **A plain order is a watched trigger by default.** The level stays in this
  app, invisible to the book, spending nothing until it fires. Resting on the
  exchange remains a choice in Settings → Trading engine, and its honest cost
  is stated there: a watched order only fires while the engine runs.
- **A plain order is not a strategy.** It coexists with a ladder on the same
  coin, several can sit on one coin, it counts and shows under Open orders,
  and it never appears in the Smart orders panel.
- **A real resting order moves in place.** The exchange's modify command —
  same order, same size, new price. Never cancel-and-replace: the level is
  never left uncovered mid-move.
- **A trigger's price is never rewritten into a limit.** A stop or target leg
  the exchange holds is not a resting order, and no drag may turn it into one.
- **A take profit can be sized.** By default it sells the whole position, as
  it always has. Given a size, it sells exactly that much at the target price
  and is used up by firing — the rest keeps running with no target. A size is
  never more than the position holds, and on the exchange a sized target is a
  fixed-size reduce-only trigger, never a position-scaled leg the exchange
  would grow back to everything.
- **Dragging is instant on screen.** The line stays where the hand let go; the
  saving happens behind it, and a refusal puts the line back with a reason.
- **Placing asks no second press.** The order goes on the first press and is
  on the chart to drag or cancel the moment it lands.

## Ladders

- **Rungs buy deeper as price falls, sizes ramping, and each sold rung exits
  by the chosen mode** — at the rung above, at the nearest rung, or a percent
  above the average. The percent means nothing outside the average mode and
  is never shown as if it did.
- **A liquidation takes the position, never the plan.** The waiting rungs have
  spent nothing and keep waiting. This must hold at any moment inside a
  candle, not only at its end — it once held by lucky timing alone.
- **A ladder ends only when its rungs are used up.** Then, and only then, may
  the flow start a fresh ladder on a new base.
- **A new ladder starts from the first rung still below the price.** Rungs the
  price has already fallen past are thrown away at birth — otherwise a ladder
  born under three of its levels would buy all three instantly at one price,
  which is one big lump, not a ladder. This is a birth rule only: a rung a
  RUNNING ladder already owns is never thrown away (the rule below). Live and
  the replay do the identical thing here.
- **The base stop steps the ladder down.** Selling at the stop and re-buying
  at the next rung is one motion of the same ladder, not a new ladder.
- **A rung is never written off for money or price.** Dropped for cash, it
  goes back to waiting. Passed by the price while it was held back, it fires
  at the market the moment the wallet's rules allow — today's price, taker
  fees, exactly as a live trigger would — and until they allow, it keeps
  waiting. A rung only ends by filling and selling, by a hand cancelling it,
  or with its ladder.

## Money

- **The exchange's account is one pool.** Hyperliquid backs every market from
  the same USDC, moving slices as orders need them. Nothing in this app may
  gate an order, a coin list, or a flow on "money parked on that market" —
  that wall existed once and is gone.
- **Buying power is what the account is worth minus what is committed**, with
  every open position valued at the worst price reached so far — never at a
  recovery that has not happened yet.
- **Wallet-wide caps fire where the trigger fires**, on practice and real
  wallets alike, not only in replays: the cap on coins opened per hour, and
  the crash rule's floor on what leverage the exchange must allow a coin.
- **A refused market waits a minute.** Whatever the exchange's reason, a
  persistent refusal costs one request a minute, never sixty.

## Backtests

- **A busy candle is walked on its real minutes, every coin on one clock.**
  Money frees up when it really did; a coin still falling holds its money
  down. Quiet candles are walked whole, because minutes would change nothing.
- **The candle's worst moment is on the curve.** A fall and recovery inside
  one candle is a drawdown, not a smooth line. Curve times stay ascending on
  the bar-open naming, and fills stay stamped on their own candle.
- **The replay is kinder than live on crash days, and says so.** It fills
  rungs as resting orders at the exact price with maker fees; live fires
  watched rungs into whatever book exists. Crash-day profits are a ceiling.
- **A run's credibility problems are printed on the run** — skipped coins,
  missing history, missing funding, missing minutes. A quiet hole is the most
  expensive kind.

## When a rule and the code disagree

Check the rule against the exchange or the data first — rules go stale too
(the money wall did). If the rule stands, fix the code and pin the rule with a
test at the rule's own level. If the rule is stale, change THIS FILE in the
same commit that changes the code, so the two are never both claiming to be
the truth.
