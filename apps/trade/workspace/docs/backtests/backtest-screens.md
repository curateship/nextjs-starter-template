# Backtest screens

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
