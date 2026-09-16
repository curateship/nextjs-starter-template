# Backtest screens

## Refreshing the list

While a backtest runs, the list refreshes every two seconds without dimming
the rows or toolbar. Changing which runs are shown or pressing Try again
after a failed read still shows the table's busy state. A background read
finishing cannot clear that state while the requested refresh is still pending.
The existing error message and retry action remain available after a failure.

## How long a run took

The Backtests list has a sortable Took column. A finished run says "Took 4m".
The stats panel on the run page repeats the same duration under its title.
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

- The Results table calls each coin's main figure Total because the figure
  includes closed trades and any position still open at the final price.
- A coin with an open position shows its open profit directly under Total. The
  table total shows the same split across every coin, so a large paper profit
  cannot look like money from the closed trade count.
- The Trades table puts the open profit in each open row's P&L column. Several
  open rungs share fees and funding by position size, and their figures add up
  to the open total in Results.
- Runs saved without the trade figures needed for the split say that open P&L
  is unavailable. The app never treats an unknown amount as zero.
- If the selected market's candle read fails, the Trades panel shows the same
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

- A backtest result opens on the first market in Results and the first trade in
  Trades, so its chart is useful immediately. Each run remembers the last
  market and trade chosen in this browser and restores them when reopened.
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
- Stocks have no funding on Dukascopy. A "Funding not counted" line names them
  and says "Stocks: no funding in this run". A Hyperliquid or Lighter stock
  perpetual does charge funding in real life; this run did not count it.

## Why a coin was skipped or failed

- The run header counts coins skipped before testing and coins that failed.
  Clicking the count opens the Skipped / failed tab and expands its panel.
- Each row shows its saved reason in muted, wrapping text. Failed rows show
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
narrow screens. The strategy's
own size starts checked. DCA and Signals offer 1m, 5m, 15m, 1h, 4h and 1d.
Grid offers only its fixed 4h size. Selecting sizes does not edit the strategy.
Changing the strategy's own size resets the checklist to that size.

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
press Backtest once. Follow View all backtests and check the three names.
Reload the list and open each result to check its candle size. Then choose
an oversized small-candle window and confirm that the refusal names the size
and creates no rows. Clear all checkboxes to check the empty-selection error.

## Progress on a running backtest

The full run page shows the shared meter beneath the stats header, and the
canvas card and Backtests list show the same words from `backtestMeter`
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

An unfinished coin shows its latest progress note in Results, such as reading
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
