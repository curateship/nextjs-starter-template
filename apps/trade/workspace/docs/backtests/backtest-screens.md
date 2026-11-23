# Backtest screens

Backtests are the Backtests row of the Bots dashboard at `/bots?view=backtests`
(`../screens/bots-dashboard.md`) since 9 Nov 2026. The table lists every run.
A line picked shows its Result card on the right with **Open chart** in the
footer (Tyler, 10 Nov 2026), and Open chart opens its chart (or the Graph) in
the middle, where the right panel holds two folding cards, **Result** and **Trades**, with
Stop in its footer while it runs. Pin, Archive, Delete and the name are in the
opened backtest's ⋮; Delete is on a line's right-click too; Show archived is
in Filter, beside Recipe, which shows one recipe's backtests alone.

## The middle's header: Chart and Graph

Two tabs, then what the picture needs at the right (Tyler, 10 Nov 2026: "this
should be 3 tabs", then "remove canvas from the tab", "remoev the arrow back",
"move this to header right"):

- **No back arrow and no run name.** While the page panel is shut, its reopen
  button takes the arrow's spot. The Dashboards block's Backtests row goes
  back to the table.
- **Chart:** the picked coin's candles. Its coin, candle size and orders sit
  at the header's right on a wide screen.
- **Graph:** the pot over the whole run, with 1W to All at the header's right
  and a ⋮ after them holding its three lines (Off peak, Liquidations, In
  markets) as on and off switches, then From, To and Reset (Tyler, 10 Nov
  2026: "add a 3 vertical dot dropdown here and move the [lines] but make it a
  swicher to check on and off. Move the from, to and reset as well"). The ⋮
  stays open while a date is picked. No wallet figure sits over the graph
  ("remove these numbers"); the Result card has the outcome and the
  crosshair's box reads the wallet at any point. Left out on a run with no
  line to draw.

## The right panel: Result and Trades cards

Tyler, 10 Nov 2026: "remove the tabs and put them into collapsible cards
instead, first card is the figures card (rename to Result) second card is
"Trades" that shows all the tickers and a tab in that second card is
"Skipped" showing all the skipped markets".

- **Result** is what the Figures tab was: the progress meter while it runs,
  then the figures. How long the run took and how many coins it skipped are
  not on the card (Tyler, 10 Nov 2026: "remove [Took 10m]", "remove [3 coins
  skipped]"). The Backtests table has the time, and the Skipped card's
  heading has the count.
- **Result is one list in named groups** (Tyler, 10 Nov 2026: "revamp the
  results card", then "just make it look like what I showed you"). Under the
  headline percent and dollars come Trades (Win rate, Profit factor,
  Expectancy, Trades closed), Risk (Max drawdown, Buy & hold, Recovery, and
  Liquidated when it happened), Exposure (Time in market, In markets now,
  Peak wallet, Avg wallet) and Markets (Markets tested, Markets green). Each
  is a name on the left and a bold figure on the right, green or red when it
  is money made or lost. What each figure is made of, such as "917 won, 1181
  lost", is on its tooltip.
- **Setup and Costs** follow in smaller plain type, since they are the run's
  settings rather than its results. A long value, such as six exchanges after
  "Prices from", takes at most two thirds of the line and wraps at the right,
  so it never runs over its name.
- **"Funding not counted"** says how many stocks, such as "32 stocks", with
  the stocks named on its tooltip (Tyler, 10 Nov 2026: "hide this in a
  tooltip or something").
- **"Warning"** is an amber box at the
  bottom with the number of warnings in a circle. It opens to list them.
- The small pot graph that sat under the figures is gone. The graph in the
  middle shows the same line.
- **Trades** lists the coins that traded, with their totals. As the card
  narrows, Dip drops out under 18rem and Win under 14rem, so the coin and its
  Total always fit.
- **A coin still in a trade shows a green dot in place of its logo** (Tyler,
  11 Nov 2026: "replace the avatar with a green dot if the trade is still in
  progress and when hover over, it will show the amount open in tooltip").
  "Still in a trade" means money was still in the coin when the backtest
  ended. Pointing at the dot shows that amount, such as "$48 still in this
  trade".
- **A coin out of trades shows its logo, or a grey dot when it has none**
  (Tyler, 11 Nov 2026: "replace the ticker initual with a gray dot instead
  with markets thats not in trade"). Binance coins have no logos, so a
  Binance backtest is all green and grey dots.
- **The coin's name is the same size as the figures beside it**, 12px.
- **Total is one figure, with no "open" line under it** (Tyler, 11 Nov 2026:
  "both says open and theyre showing diff numbers"). The line showed the
  profit or loss on the money still in a trade, which Total already counts,
  and it sat beside the dot's tooltip with a different number and the same
  word.
- **Trades looks like the Grid trades block** (Tyler, 10 Nov 2026: "revamp
  backtest dashboard trades panel ... to this", with a picture of Grid
  trades). Each coin has its logo, or a dot, before its name in bold. The headings are
  small and left-aligned with the sort arrow after the word. The figures are
  in the monospaced font, Total is green or red for made or lost, and Dip is
  grey the way Grid trades' Value is. A coin's status note, such as "Reading
  candles", sits on its own line under its name.
- **The table fills the card's white tile**, straight under the "Trades"
  heading with no gap and no grey band behind its column headings, as Grid
  trades' table fills its block. It undoes the tile's own padding using the
  same settings the tile reads, so it follows Settings -> Styling -> Panel
  cards.
- **The right panel's padding is the panel gutter** (15px), the same as every
  other side panel and the footer, for a backtest and a bot alike
  (`bots-record.tsx`). It tells its cards that 15px, so "Panel cards reach the
  panel's edges" works here (Tyler, 10 Nov 2026: "the outer padding is not
  wired to the card settings").
- **Coin logos** come from the exchange's market list, read once per exchange
  when the backtest opens (`use-market-icons.ts`). Binance's list has no
  logos, so a Binance backtest shows each coin's first letter in a circle, as
  every Binance coin does elsewhere in Trade.
- **Skipped**, a card of its own under Trades, lists every coin that produced
  nothing, with the reason (Tyler, 10 Nov 2026: "Put the skipped markets into
  its own card and out of the tab").
- **Skipped groups its coins by reason** (Tyler, 10 Nov 2026: "revamp
  skipped card", with a picture). Each reason is written once in grey with
  its count in a pill, and its coins sit under it as small boxed names. The
  biggest group comes first. The heading says how many coins in all, such as
  "57 coins". It counts failed coins and coins that never traded as well as
  skipped ones.
- Each card folds and stays folded in this browser. The header's double-arrow
  button folds or opens both at once.
- The panel scrolls as one column; nothing inside a card scrolls on its own.

## A coin's trades: the popover

Tyler, 10 Nov 2026: "Clicking the market in the card open up a popup showing
trades within that market and with the ability to pin the popover and able to
drag it around and remove the bottom panel".

- There is no trades panel under the chart any more; the chart fills the
  middle.
- Pressing a coin in Trades opens a popover of that coin's trades beside the
  card, over the chart, and leaves the chart as it is (Tyler, 10 Nov 2026:
  "Dont make clicking on market open the market first trade", then "if its not
  first trade then just dont load the chart at all. Just open the popover").
  Pressing a trade in the popover moves the chart to its coin and frames it.
  The same holds on an open bot.
- The popover is as big as its trades and no bigger (Tyler, 10 Nov 2026: "The
  popover height and width should have a max size but it should grow and
  shrink with the amount of content thats in it"). It stops at 34rem tall
  ("Increase popover height by 30%", from 26rem) and 52rem wide, or the
  window's edge, and scrolls past that.
- The trades table has no # column (Tyler, 10 Nov 2026: "remove this"); the
  rows still come in trade order. Its columns sit close: 6px each side of a
  cell and 2px before a heading's arrow ("reduce the spacing between col").
- Its ⋮, before Pin, hides columns (Tyler, 10 Nov 2026: "add a 3 dot dropdown
  here with options to hide certain col"): Side, Entry, Exit, Amount, P&L,
  Return and Cum. P&L, each with an eye that swaps on a press while the menu
  stays open. The last column showing stays, and says "Keep at least one
  column showing." The choice is kept on the account
  (`trade_prefs.panel_layouts.hiddenTradeColumns.backtest`), apart from a
  bot's, whose table has other columns.
- **The popover reads the coin's trades and nothing else** (Tyler, 11 Nov
  2026: "how it takes 2-3 seconds to load the trades? some only have 2-3
  trades but they still take long"). It used to read the coin's whole price
  history and every coin's saved result first, which took 2 to 3 seconds
  whatever the number of trades. Now it is one database read, and on a
  finished backtest a coin opened once opens again at once.
- **Pin** keeps it open while anything else is pressed; unpinned, a press
  outside closes it. × closes it either way.
- Its header drags it, and it follows the mouse exactly and stops 8px from
  the window's edge ("if I drag the popover to the edge, it kept getting
  bounced around"). It no longer eases behind the mouse or gets nudged by the
  popover's own placing.
- It stays where it opened while the list beside it scrolls ("when i scroll
  the trades list, the popover also scrolls with it").
- Amount reads from the left. Every column is as narrow as its figures and
  heading. When the popover's header is wider than the columns, the spare
  width is shared out between them, so there is never an empty strip at the
  right (Tyler, 10 Nov 2026: "there's a gap here", "why is there so much
  space here?", "still a gap here"). The popover is as wide as its showing columns, or as the
  coin's name and the buttons if those are wider; the count after the name
  shortens or drops out to make room, the name never does. With columns hidden it shrinks with them (Tyler, 10 Nov
  2026: "now theres a huge gap here"). 24px come before Amount and after the last figures (Tyler, 10 Nov 2026: "increasing the padding of left and right slightly", then "more padding on the left"). Where it was left is kept in this browser
  (`bots-trades-popover-offset`) for every run, and pulled back inside the
  window if the window has since got smaller.
- The same popover opens from an open bot (`../screens/bots-dashboard.md`).
- Stop asks first ("Stop this backtest?"), as a bot's Stop does: the coins it
  has not reached are left untested, and what it has worked out stays.

## Refreshing the list

While a backtest runs, the list refreshes every two seconds without dimming
the rows or toolbar. Changing which runs are shown or pressing Try again
after a failed read still shows the table's busy state. A background read
finishing cannot clear that state while the requested refresh is still pending.
The existing error message and retry action remain available after a failure.

## How long a run took

The Backtests table has a sortable Took column, shown once the middle is wide
enough. A finished run says "Took 4m". An opened run's Result card repeats the
same duration at its top.
Both screens use the shared duration formatter for seconds, minutes, hours
and days. Sorting compares the full elapsed time, not the rounded text.
Pinned runs stay above the sort.

Elapsed time starts when the run was created and ends at its saved finish
time. The duration includes waiting, loading candles and retries. A run that
ended with a market error says "Gave up after 12m". A stopped run keeps the
time until its saved finish. Selecting a different chart window never changes
how long the backtest took.

An unfinished run says "Running for 2m". One local clock per screen updates
every second without adding server requests. The existing progress polling
still checks whether the run has finished. The timer stops when no unfinished
run remains. Before the first client clock tick the label says "Running…",
so server rendering does not guess the browser's clock. A future start time
shows zero until the clock catches up.

The list reads a failure flag derived from the market statuses already loaded
by the server. The run page uses its existing market rows. No database column,
migration or backtest rerun is needed to show durations on saved runs.

## Backtest results

- The Traded list calls each coin's main figure Total because the figure
  includes closed trades and any position still open at the final price.
- A coin with an open position shows its open profit directly under Total. The
  table total shows the same split across every coin, so a large paper profit
  cannot look like money from the closed trade count.
- The Trades table puts the open profit in each open row's P&L column. Several
  open rungs share fees and funding by position size, and their figures add up
  to the open total in Traded.
- Runs saved without the trade figures needed for the split say that open P&L
  is unavailable. The app never treats an unknown amount as zero.
- If the selected market's candle read fails, the trades popover shows the same
  error and Try again action as the chart. A failed read never leaves the panel
  saying that trades are still loading.
- Grid results can contain Long and Short rows. A selling grid starts with a
  sale and closes with a buy-back; its profit rises as the exit price falls.
- An ordinary Grid exit is paired with the rung it recycled, not the wallet's
  blended position price. Its arrow and closed-position row therefore show the
  profit from that rung's own entry after both fees. Stops and strategy closes
  can still show a loss.
- A selling Grid buy-back names the rung or rungs it closed. A closed position
  can leave a decimal speck of one billionth of a coin or less; the chart treats
  that as zero, so the next buying rung cannot be mislabeled as a buy-back from
  a short that never existed.
- The chart shows every closed position's dotted entry-to-exit line when no
  trade is selected. Selecting one closed row isolates its line, even when the
  same order closed several rungs; selecting that row again restores them all.

## EMA Grid backtests

- A flow ending in Grid shows the Backtest panel when its Wallet step uses
  pretend money. The run button is the same button used by DCA and Signals.
- Grid runs always use 4-hour candles and load 600 earlier candles for the EMA
  warm-up. The chosen result window still begins on the date in Markets; the
  warm-up cannot place a trade.
- The chart draws the EMA period frozen on the saved Grid step. Parameter
  settings returns to that Grid step, not to DCA.
- The figures list the clean-hour wait, rung count, wallet share and whether the
  range follows price up, down, both ways or neither.
- A confirmed opposite stance closes the current historical grid and starts
  the other direction at the same closed candle. The loop runs until the test
  window ends.

## Backtest candle history

- A backtest result opens on the first market in Traded with no trade picked,
  at the Trade chart's saved view: the same zoom and position the Trade
  dashboard's chart was last left at (`trade_prefs.chart_view`, read by the
  route and only read here, so panning a backtest leaves the Trade chart
  alone). Tyler, 10 Nov 2026: "Check my currant chart view setting and make
  default chart loading to it"; before, the whole history was squeezed in and
  the price axis ran below zero. Each run remembers the last market, and a
  trade picked on it, in this browser and restores them when reopened.
- Backtests read the shared candle store described in
  `charts/candle-store.md`, by history source and candle size. Coins read
  Binance's rows and stocks, indices, metals and currency pairs read
  Dukascopy's. Running the same window again reads those rows without asking
  the source again.
- The results page says whose candles the run walked on its "Prices from" line:
  Binance for coins, Dukascopy for the rest, or the venue itself on a run saved
  before the store had sources.
- Downloads are saved page by page, so a failed request resumes at its missing
  page. Every missing candle stretch stays visible as a recorded gap. For a
  stock, only two or more silent weekdays in a row count as a gap; nights,
  weekends and single holidays are silence.
- A market no source covers reads its own exchange's history, which may be
  short. The shortfall shows as a gap; no other source is substituted.

## Backtest funding

- Perpetual-market backtests use the exchange's saved historical funding rates
  at every settlement. Positive funding costs a long position; negative funding
  pays it.
- The dollar payment uses the replay's stored historical price at that time.
  The funding endpoint does not include the exchange's historical oracle price,
  so this is the same price history used for the rest of the replay.
- The result lists **Funding paid** directly below its fee and slippage settings.
  A negative figure means the position received more funding than it paid.
- Any missing market or settlement stretch appears in the result warning. It is
  never silently described as free.
- Stocks have no funding on Dukascopy. A "Funding not counted" line says how
  many stocks, and its tooltip names them. A Hyperliquid or Lighter stock
  perpetual does charge funding in real life; this run did not count it.

## Why a coin was skipped or failed

- The Skipped card's heading counts every coin that produced nothing:
  skipped before testing, failed, or never traded.
- Coins are grouped under their saved reason. Failed coins are grouped under
  their own saved error. A coin appears once even when both the run result
  and its coin record mention the skip.
- The tab also keeps coins that finished without a trade and explains why.
  Those coins do not count as skipped in the header because they were tested.
- From 6 Sep 2026, a new empty-history skip keeps the candle store's reason.
  Runs saved earlier retain their original wording. No migration rewrites them.
- A young coin with some prices still runs from its first available price.
  The app does not infer a listing date from missing candles. Missing funding
  remains a run warning and does not turn a tested coin into a skipped coin.
- Download and engine failures retain the existing retry and failure rules.
  A failure that stops the whole run can leave the same error on several coins.
  The screen displays the saved evidence without inventing a separate cause.
- Stocks are the exception. Tyler, 15 Sep 2026: "run cryptos first and still
  show results just for crypto if stocks refused". A run loads every crypto
  coin before any stock, and the stocks one at a time. A stock whose Dukascopy
  download fails is skipped on that first failure with "Dukascopy would not
  send this stock's history" and Dukascopy's own words, and is never retried.
- Inside a backtest a refused Dukascopy file is not retried either, so the
  refusal arrives in about a second rather than after five retries ten
  seconds apart. Charts keep the retries.
- Once one stock is refused, every stock after it in that run is skipped
  without asking Dukascopy, with "it had already refused another stock in this
  run". Tyler chose this on 15 Sep 2026 knowing a stock Dukascopy might have
  sent is lost with them. A pass that takes the run over reads the saved skips
  and keeps skipping. The run then finishes with results for the coins it
  could test.

## Several candle sizes from one press

The recipe canvas Backtest panel has a Candle sizes checklist on desktop and
narrow screens. The sizes the newest press ran start checked, so the ticks
match the result named in the panel's title. A recipe that has never been
backtested starts with the strategy's own size checked. DCA and Signals offer
1m, 5m, 15m, 1h, 4h and 1d. Grid offers only its fixed 4h size. Selecting sizes
does not edit the strategy. Changing the strategy's own size resets the
checklist to that size, because the last run no longer describes the recipe.

Each row estimates the candles needed for the recipe's coin count and date
window, including the base history used by the existing memory check. These
are workload estimates, not a promise of new downloads. Cached history is
reused. A folder's displayed count is an estimate; the server resolves its
current contents when the run starts.

Backtest saves the recipe before starting one named run per checked size,
such as "My recipe, 1h" and "My recipe, 4h". View all backtests opens the list
where those runs appear as separate rows. Each run has its own result page.
The panel continues to show the newest run's progress and result.

An empty selection reports an error. A size that exceeds the memory budget
refuses the whole selection and names the size. No rows are created for the
other sizes. All rows are inserted in one transaction, so a database failure
also leaves no partial set. Each size has a separate identifier derived from
the same button press. Retrying that press returns the existing set, including
when the submitted selection changed. A later intentional press starts a new
set. A failed network request keeps its press identifier for a retry with the
same recipe and selection.

This control starts backtests only. If the saved Wallet step now names a
trading wallet, the request is refused instead of switching on trading.

To check the workflow, select 1h, 4h and 1d on a pretend-money DCA recipe and
press Run backtest once. Follow View all backtests, which opens the Backtests row,
and check the three names.
Reload the list and open each result to check its candle size. Then choose
an oversized small-candle window and confirm that the refusal names the size
and creates no rows. Clear all checkboxes to check the empty-selection error.

## Progress on a running backtest

An opened run's Result card shows the shared meter under its duration, and the
canvas card and the Backtests table show the same words from `backtestMeter`
(`src/lib/trade/backtest/progress.ts`). A run with no coin rows starts at zero.
Finished runs hide the meter.

- While any coin is still waiting or loading its candles, the bar counts
  coins: "Loaded 290 of 314 coins". Tyler asked for this on 15 Sep 2026, after
  a run with every crypto coin loaded sat near 30% for an hour while its
  stocks loaded.
- That count fills only the first 30% of the bar, which is where a fully
  loaded run starts. Filled to the plain share, the bar read 98% with 309 of
  314 coins loaded and would have fallen back to 30% when the walk began.
- Once every coin is loaded or skipped, the bar goes back to percent through,
  the average of every coin's progress.

An unfinished coin shows its latest progress note in Traded, such as reading
candles or running the strategy. A coin without a note keeps its status wording.

## A run that stops moving

The worker holding a run beats once a minute to keep its claim. A second
worker takes the run back only after five minutes with no beat, and a run
taken back three times fails with "This run stopped part way through".

- The beat stops once the run has saved no progress for ten minutes. Progress
  means a coin's note, a coin marked ready or skipped, a coin prepared for the
  walk, or a step of the walk.
  A run waiting on a request that never answers is then taken back, instead
  of sitting at 0% for ever behind a fresh-looking beat.
- Every exchange request gives up after 15 seconds. Binance candle and funding
  pages retry a timeout like a dropped connection, and the Binance market list
  falls back to its last saved copy when one exists.
- A Dukascopy download gives up after five minutes, and a history page gives
  up after waiting five minutes for a request slot. Both fail with a plain
  error, so a run counts the try instead of retrying for ever.
- A refused stock no longer holds a run up at all. Before 15 Sep 2026 a
  Dukascopy refusal handed the whole run back untouched, the next pass asked
  again, and a 314-coin run sat at 157 coins for an hour with its try count
  never rising. The stock is now skipped on that refusal (see "Why a coin was
  skipped or failed").
- On 15 Sep 2026 two General Test DCA runs sat on their first six Aster coins.
  The same coins loaded in under a second from a fresh process. The server
  had a Dukascopy download with no time limit that never finished, and the
  history loads queued behind it held every request slot.
