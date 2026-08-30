# Backtest screens

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
- Backtests save finished candles in the app database by full market key and
  candle size. Running the same window again reads those rows without asking
  the exchange again.
- The selected protocol is also the history source. Hyperliquid markets use
  Hyperliquid candles and Binance markets use Binance candles; prices are never
  substituted across exchanges.
- Downloads are saved page by page, so a failed request resumes at its missing
  page. Every missing candle stretch stays visible as a recorded gap.
- Hyperliquid keeps a limited history. A window beyond that history shows the
  shortfall; adding a fallback source requires a separate decision.

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
