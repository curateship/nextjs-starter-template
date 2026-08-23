# The trading rules

The rules of this app, stated once, in plain words. **This file outranks the
code.** Code is what happens; these rules are what is supposed to happen — and
when the two disagree, the code is the thing that is wrong. Every rule here
should be pinned by a test of the rule itself, not of the mechanism behind it,
so a change to the mechanism cannot quietly change the rule.

Most of these were learned the hard way on 18 Aug 2026, when several of them
turned out to live nowhere but in timing, comments, or nobody's head. The
mechanism docs — `watched-orders.md`, `backtest-minute-zoom.md` and
`wallet-reads.md` — say how the machinery works; this file says what it must
add up to.

## Exchange connections

- **Aster work targets mainnet.** Aster testnet is not a completion step and
  does not hold up live trading work. Mainnet orders still pass both real-money
  switches before the connector signs anything.
- **For prices and orders, use the exchange's direct socket instead of
  polling.** Prices, positions, open orders, order changes and fills arrive as
  pushed events. Trade may ask once when a feed starts, and ask again to recover
  messages missed during a disconnect, but it never keeps asking the exchange
  on a timer as its normal live path.
- Tyler, 22 Aug 2026: **"We do not poll unless it's absolutely necessary. We
  use websocket, multiples of them, to stream prices if it's available."** One
  socket not being enough is not a reason to fall back to asking. It is a
  reason to open another socket. An exchange that caps how many markets one
  connection carries gets as many connections as its markets need, and asking
  is what is left for the markets no feed can answer for — not for the markets
  we could not be bothered to open a line for.
  KuCoin is the case that produced the rule: it publishes no all-markets feed
  and one connection dies outright past about a hundred markets, so a wallet on
  454 markets was asking 454 questions, one at a time, every round. It now gets
  six sockets and asks about 64.
- **Order commands are still requests.** Placing, moving and cancelling an
  order use the exchange's authenticated order command. The socket reports what
  happened after the command; it does not replace the command itself.
- **No socket means no live trading.** A protocol may expose historical data or
  a manually refreshed snapshot while it is being built, but it is not ready
  for live prices or live orders until both pushed feeds work and recover cleanly
  after a reconnect. This applies to every current and future protocol.

## Orders

- **A waiting plain order chases as a maker when price reaches it.** The engine
  rests a post-only limit just off the current price and follows it. A buy
  placed above the current price, or a sell placed below it, is already
  marketable and takes the current price immediately, with the taker fee.
- **A plain order is a watched trigger by default.** The level stays in this
  app, invisible to the book, spending nothing until it fires. Resting on the
  exchange remains a choice in Settings → Trading engine, and its honest cost
  is stated there: a watched order only fires while the engine runs.
- **A plain order is not a strategy.** It coexists with a ladder on the same
  coin, several can sit on one coin, it counts and shows under Open orders,
  and it never appears in the Smart orders panel.
- **A real resting order moves without ever leaving its level empty.** Where
  the exchange has a modify command — Hyperliquid, Phemex and Aster — that is what is
  used: same order, same size, new price. KuCoin Futures has no such command,
  so there the new order goes on FIRST and the old one comes off after, and for
  the fraction of a second between them that level is covered twice. Cancelling
  first is banned everywhere. An empty level is the one thing a move may never
  produce, because the moment a level is uncovered is exactly the moment price
  can reach it.
- **The doubled moment on KuCoin is a decision, and here is what it costs.**
  Dragging a $250 buy means $250 of buying is on the exchange twice for about
  a third of a second. If price falls through both prices inside that moment,
  $500 of the coin is bought instead of $250, and nothing in this app agreed to
  the second $250. That is the risk taken, deliberately, in exchange for never
  missing a buy that a fall was about to fill. The far more common ending is
  the harmless one: both orders need margin at once, so a wallet with little
  free cash has the new order refused, nothing moves, and the old order is
  still sitting exactly where it was.
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

## Grids

- **A rung buys at its own price, or it does not buy.** Never at a price that
  belongs to no rung. A grid placed with the price inside its range used to
  market-buy every rung above the price, all in one order, at whatever the
  market happened to be. That gave the top rung a round trip from a price it had
  never paid, and left the account at its most long at the exact moment a grid
  is supposed to be waiting. In Tyler's words: "you're buying 5 rungs at the
  top". It is the same rule the ladder already had — one big lump is not a
  ladder, and it is not a grid either.
- **Placing a grid buys nothing.** Whatever the price is doing, whatever the
  range straddles. Every rung waits its turn.
- **A rung above the price waits to be reached.** Price climbs past it, comes
  back down to it, and then it buys and sells one step up like every other rung.
  A rung price never visits simply never trades, and that costs nothing.
- **Every rung always spends the same money it was given**, cycle after cycle. A
  rung that buys back cheaper does not get to spend more next time.
- **The stop hangs off the bottom of the range, never off the average buy
  price.** The average falls as the grid recycles, so a stop following it would
  drift into the range and sell the grid on an ordinary dip, which is the exact
  move a grid exists to trade.

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
- **Only wallets that are switched on are asked about.** A wallet nobody is
  trading with spends none of the exchange's allowance, and says it is
  inactive rather than pretending it could not be reached.
- **A read that failed is never drawn as an empty wallet.** The figures that
  last landed stay, marked as a moment old, until enough reads in a row have
  missed to say plainly that the exchange cannot be reached. The same holds
  for positions and orders. See `wallet-reads.md`.
- **A wallet card's profit starts yesterday.** Settled is recorded trade money
  since midnight yesterday in Toronto. Made or lost adds current open profit.
  The balance the wallet had when it was added, older profit, deposits, and
  withdrawals do not enter either figure.

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
