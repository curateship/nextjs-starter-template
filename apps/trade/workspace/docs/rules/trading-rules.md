# The trading rules

The rules of this app, stated once, in plain words. **This file outranks the
code.** Code is what happens; these rules are what is supposed to happen — and
when the two disagree, the code is the thing that is wrong. Every rule here
should be pinned by a test of the rule itself, not of the mechanism behind it,
so a change to the mechanism cannot quietly change the rule.

Most of these were learned the hard way on 18 Aug 2026, when several of them
turned out to live nowhere but in timing, comments, or nobody's head. The
mechanism docs — `orders/watched-orders.md`, `backtests/minute-zoom.md` and
`wallets/wallet-reads.md` — say how the machinery works; this file says what it must
add up to.

## Dashboard

- Tyler, 31 Aug 2026: **"Whatever I adjust in the dashboard should
  automatically be saved. I don't need to save them."** Dashboard choices save
  as they change. A selected named layout updates itself, and its menu has no
  separate save button.

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

- **Aster margin comes from the wallet setting when the order is sent.** A
  watched order does not keep an older margin choice. Isolated changes Aster
  to Single-Asset Mode. Cross changes Aster to Multi-Assets Mode.
- **A waiting plain order chases as a maker when price reaches it.** The engine
  rests a post-only limit just off the current price and follows it. Long and
  Short remember which side of the clicked level price started on, so a Long
  above the market waits for a rise and a Short below it waits for a fall.
- **Directional Long and Short orders ship with the trading engine.** The web
  app saves which way price must move, and the engine reads that field. An old
  engine does not know the field and applies the former rule, which turns a
  Short below the market into an immediate market sell. Deploy the trading
  engine first, then the web app from the same commit. Never put the new web
  app in front of the old engine.
- **The Market checkbox is the only plain-order choice that explicitly asks to
  fill now.** It sits inside the Long and Short window. When checked, the order
  uses the venue's current price, pays the taker fee, does not become a watched
  level and ignores the account's Watch or Rest choice.
- **A watched order may carry a stop loss without a take profit, or a take
  profit without a stop loss.** The stop can be its exact losing price or a
  percent away from entry. The chosen line stays with the watched level and is
  put on the position as soon as the entry fills.
- **A waiting manual order can gain its stop from the chart.** Right-clicking a
  losing-side price offers Stop loss for the active wallet's one eligible
  stopless watch, even when it also has a position on the same market.
  If several eligible watches make the target ambiguous, the shortcut stays
  hidden and the exact order line opens the edit window instead.
- **A waiting order edits beside its chart bar.** Its bar uses the standard
  12px settings cog used by the Grid bar, and the editor opens beside it like
  the other chart-order editors. It does not cover the workspace with a modal.
- Tyler, 1 Sep 2026: **"there is no leverage option in edit."** A waiting
  manual order's edit window has the same leverage slider used when the order
  is placed. The chosen number stays on the order and is used when it fills.
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
- **A position may hold up to three sized targets.** Each target is a fixed-size
  reduce-only order. The sizes together can cover no more than the position.
  A lone target may still leave its size blank to sell the whole position, as
  it always has. When one target sells, the other targets and the stop stay on
  the unsold part. In the chart's target window, a percentage applies to the
  position not already assigned to an earlier target. 100% always means all of
  what is left.
- **A part close chases as a maker and never leaves the rest unprotected.**
  Selling some of a position rests a reduce-only post-only limit off the price
  and follows it until it fills, never taking the market. It does not give up,
  because being half out is worse than any price the rest would have got. A
  target list is shortened to what will be left before the close is placed.
  The nearest targets stay first, and the last kept target is brought down when
  needed. Closing the WHOLE position keeps its own behaviour and is still a
  market order. See `orders/part-close.md`.
- **A remainder too small to be an order is not a remainder.** An amount that
  would leave less than the exchange's smallest order sells the whole position
  instead, because a scrap under the floor can never be closed again.
- **Emptying a wallet stands its smart orders down before selling anything.**
  Selling first leaves a window where a rung waiting below fills and reopens
  the coin that was just closed. A cancel that is refused stops the whole
  thing: nothing is sold while something is still able to buy back in. Each
  position is then sold with the same chased maker order a part close uses —
  see `wallets/flatten-wallet.md`.
- **Leverage and margin on an open position come from the exchange, never from
  a copy.** Changing either asks the venue and writes nothing here; the row's
  leverage, margin and liquidation price all come from the next portfolio read,
  so a venue that clamps a request shows its own number.
- **Taking margin out is refused when it would bring the liquidation price
  inside the stop.** The stop is the worst case that was agreed to, and a
  liquidation inside it replaces that worst case with a bigger one quietly.
  Already being inside is not the same as being brought inside, and only the
  second is refused — see `wallets/position-margin.md`.
- **A position never carries a stop the app cannot see.** Replacing a stop or a
  target cancels every protection order the exchange is holding on that market,
  not the two the app happens to show. A leg it cannot see is a leg it can
  never cancel, and two live stops sell the position twice: the first closes
  it, the second opens a new one the other way round. See
  `orders/position-protection.md`.
- **Dragging is instant on screen.** The line stays where the hand let go; the
  saving happens behind it, and a refusal puts the line back with a reason.
- **Placing asks no second press.** The order goes on the first press and is
  on the chart to drag or cancel the moment it lands. While the exchange is
  answering, the price line says "sending". A refusal removes that line as
  soon as the reason comes back. A successful line stays until the real order
  replaces it, with no blank moment between them.
- **An order that does not fit the exchange's rules always says why.** The
  check uses that protocol's current price, coin-size step and dollar minimum.
  No coin has its own exception. A refusal from a press appears as a toast. A
  watched order refused later stays visible with the reason under it, and the
  same reason appears as a toast while Trade is open.
- **A confirmed fill changes Positions from that action.** The regular
  four-second repaint is a safety net for trades made somewhere else and for
  reconnect recovery. An order Trade sent does not wait for that repaint to
  show the position Aster has already confirmed.

## Ladders

- Tyler, 31 Aug 2026: **"if I buy at rung 3 then I expect to sell it at the
  level above rung 1".** In Sell back up the ladder, the deepest buy sells at
  Exit 1. Exit 1 is the clicked or base price immediately above Rung 1. There
  is no empty anchor level between the buys and sells.
- **Stopping a flow calls off every waiting ladder that flow placed.** A ladder
  that already bought stays in place with its stop and target. A hand-placed
  ladder on the same coin is never the flow's to cancel. A real exchange order
  gets two cancel attempts. If both fail, the coin is named in the result and
  in a critical bell notice.
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

- Tyler, 1 Sep 2026: **"for smart grid. I want to be able to move the whole
  grid at once. Add a draggable knob here"** and **"knob should be light gray
  and its not supposeed to disapear after i place the grid. I should be able to
  still move it"** The light-gray middle grip remains on the placed grid. While
  the grid is flat, it moves both range edges by the same amount, so the grid
  keeps its width while every rung moves with it. The grip sits at the range's
  vertical middle and 64 pixels left of the plot's right edge, beside the
  right-hand prices where Tyler marked it. Tyler's follow-ups **"Look where its
  at!"** and **"why the fuck cant you make it sit closer to the price?"** mean
  the grip follows the right edge as the chart widens. The placement preview is
  removed before the saved grid draws, so placement does not flicker. If the
  grid holds coin, the grip remains visible but waits until the grid is flat;
  an entry already paid at its old price cannot move.
- Tyler, 30 Aug 2026: **"In What calls the grid, I need to change by hours and
  not days."** The clean wait is shown and changed in hours. Since Grid only
  reads closed 4-hour candles, the choices move in 4-hour steps. The default is
  72 hours.
- **A normal Grid exit is measured against the rung it closes.** The wallet
  blends every open rung into one average price, so its accounting can call a
  profitable deep-rung sale a realized loss. A Grid trade is the round trip
  from that rung's own entry to its own exit. Only a stop, liquidation or
  strategy close may show a losing Grid round trip.
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
- **A price that leaves a rung before the order is sent buys nothing.** The
  exchange price is read again immediately before the order. If it has moved
  back above a grid buy, the rung stays waiting instead of buying at a price it
  never agreed to.
- Tyler, 27 Aug 2026: **"A buy cannot happen around the same price as the sell
  until it comes down to it from a minimum of 1%."** After a grid sells, every
  waiting buy within 1% of that sale stays waiting. Price must first rise at
  least 1% above that buy, then return to it. Buys farther from the sale keep
  working normally.
- **Moving a grid up does not ready its new top buy.** The rise that sold the
  old top rung has already done one job. The new top buy waits until price
  reaches its own sell, one full rung above the sold price. Only a later return
  may buy there again. Time does not ready the buy. CHIP waited 74 seconds and
  still sold and bought around the same price, so the old one-minute delay did
  not enforce the rule.
- **Every rung always spends the same money it was given**, cycle after cycle. A
  rung that buys back cheaper does not get to spend more next time.
- Tyler, 27 Aug 2026: **New grids divide their account share evenly between
  every level.** There is no doubled sizing choice. A grid placed before this
  rule keeps the level amounts it already has until it ends.
- Tyler, 26 Aug 2026: **With both follow switches on, the grid moves forever in
  either direction.** Selling the highest rung moves every rung up one step at
  once. Buying the lowest rung moves every rung down one step at once. Reaching
  the edge counts; the grid never waits for price to move beyond it.
- Tyler, 27 Aug 2026: **"Basically, the grid keep walking up until it hit this
  line."** The End Grid line stays fixed while the range follows price up.
  Reaching the line closes the grid before the range can move again.
- Tyler, 27 Aug 2026: **The End Grid line automatically starts above the
  current price.** Trade measures its distance from the current price or the
  top of the range, whichever is higher, so the line starts above both.
- **The stop hangs off the losing end of the range, never off the average
  price the grid paid.** Below the bottom on a buying grid, above the top on a
  selling one. The average moves as the grid recycles, so a stop following it
  would drift into the range and close the grid on an ordinary swing, which is
  the exact move a grid exists to trade.
- Tyler, 27 Aug 2026: **A grid smart order always has a stop loss.** The stop
  cannot be switched off when the grid is placed or while it is running.
- **A selling grid whose stop sits past the exchange's close-out price is
  refused.** A coin you bought at $100 can only fall to zero, so a buying
  grid's worst case is bounded. A coin you sold at $100 has no ceiling, and
  with borrowing the exchange closes the position out before a far-away stop
  can fire. A stop the exchange gets to first is not a stop, so the grid is
  refused before anything is placed and the window says what to change: a
  tighter stop, less borrowing, a smaller share of the account, or fewer
  levels. Worked out on the worst case, every level filled.
- **A selling grid is only placed once the engine is running code that knows
  about selling grids.** The app and the engine share one database, and an
  engine on older code drops the direction when it saves the plan back, then
  manages the short as a long. Deploy the engine with the app or before it,
  never the app alone; a rollback is the same hazard in reverse.
  `orders/grid-orders.md` has the detail.
- **A field inside a saved smart order is never renamed.** The deployed engine
  and a developer's local copy read and write the same records at the same
  time. New code can be taught to read an old record; an old copy can never be
  taught to read a new one — it fails to read the row and then skips it in
  silence on every pass, so the order stops trading, stops stopping out and
  never closes, with no error anywhere. On 28 Aug 2026 renaming a grid level's
  `buyPx` to `entryPx` took two live grids off the engine this way. Adding a
  field is safe; an older copy ignores what it does not know.
- Tyler, 28 Aug 2026, on whether a reversed grid may reverse again: **"Yes i
  can."** Hand reversals chain freely, both ways round. Only the AUTOMATIC
  reverse-when-stopped switch never carries onto the grid a reversal creates,
  so an unattended market cannot ping-pong the account; switching it back on
  is a person deciding.
- Tyler, 28 Aug 2026, on the reversal itself: **"I can reverse the grid from
  long to short. The end grid can then served as a stop loss for short and the
  long's stop now changed to end grid. Whatever amount im holding will sell at
  market price and the reverse grid begins."** The range never moves in a
  reversal.
- Tyler, 28 Aug 2026: **Both range choices exist for a selling grid, the same
  as for a buying one.** In his words: "Why is this an option? long has both
  option I can choose. The same should be for shorting". A selling grid can
  open around today's price or hang above a price you right-click, exactly
  mirroring the buying grid that hangs below one.
- Tyler, 27 Aug 2026: **"There is no such stop on Lighter. Even a stop is a
  watched order."** A Lighter grid keeps its stop price inside Trade. Lighter
  receives no stop order when the stop is set or moved. When price reaches the
  saved line, Trade sends one reduce-only close and ends the grid.

## Money

- **Placing a watched ladder or grid reserves no money.** Today's free cash
  never blocks the plan itself, however many plans are already waiting. Each
  rung asks for its full chosen size only when price reaches it. The margin it
  needs is the coin value divided by the chosen borrowing. A rung the wallet
  cannot afford then stays waiting and is never made smaller.
- Tyler, 26 Aug 2026: **A wallet flow has no hand-set spending cap.** Its
  orders wait inside Trade and commit no money until their price arrives. The
  strategy and the market's own limits decide each order's size. A buy the
  wallet cannot afford at that moment is refused, never made smaller.
- **Borrowing is chosen, never assumed.** A new DCA ladder starts at 1×, which
  uses cash only. The setting takes whole numbers. A higher choice applies to
  backtests, practice wallets and real wallets. The market's lower maximum wins
  when the chosen number is too high. The position percentage is account money,
  before borrowing: 20% of a $10,000 account at 2× uses $2,000 and buys $4,000
  of coin.
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
  for positions and orders. See `wallets/wallet-reads.md`.
- **The widgets start on 20 August 2026 and never move.** Tyler's words: the
  stats start from that day, so the screen said two days ago, then three, then
  four, and it keeps counting up. It is a start date, never "the last two
  days" and never "since yesterday" — a rolling window would drop the earliest
  trades every midnight. Settled is recorded trade money since midnight that
  day in Toronto; Made or lost adds current open profit. The balance the
  wallet had when it was added, older profit, deposits, and withdrawals do not
  enter either figure. This rule was broken twice by writing it as "today
  minus N days", so it is now fenced: `profit-window.test.ts` fails any build
  where the start is worked out from a clock, or where a screen writes the
  period as a fixed number of days instead of counting up from the start day.

## Candles

- Tyler, 2 Sep 2026: **"We only need the first 30 days of real data from the
  protocol. The rest we can use our candle storage."** A chart asks the venue
  for its own last 30 days and reads everything older from the candle store.
  The store is filled once from the source with the longest memory and read
  by every chart and every backtest.
- Tyler, 2 Sep 2026: **"Dukascopy is for the stocks, Binance is for
  cryptos."** Coins read Binance. Stocks, indices, metals and currency pairs
  read Dukascopy. A market neither can name keeps the venue's own history, and
  the chart and the backtest picker say so. Nothing is guessed.
- **The chart says where its older bars came from.** "Older bars: Binance" or
  "Older bars: Dukascopy" in the header, and nothing when the whole chart is
  the venue's own.
- **A stock's closed hours are not missing data.** Nights, weekends and single
  holidays are silence, never gaps.
- **A stock's history is drawn in today's units.** A split is folded back so
  the chart is continuous and matches the venue's own bars, and every split
  the store folded is on record in `trade_candle_splits`.

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
