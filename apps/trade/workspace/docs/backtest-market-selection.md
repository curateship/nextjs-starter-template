# Backtest market selection

How the Markets step decides which exchange and coins a backtest uses.

## Choosing the exchange

- **Markets from** offers Hyperliquid and Binance.
- The selected exchange's full mainnet perpetual catalogue is shown. The list
  is not filtered through another exchange or by available candle history.
- One Markets step belongs to one exchange. Switching exchanges clears the
  chosen coins, preventing one run from mixing exchanges.
- Binance supplies prices, funding and backtests but does not place orders.
  Hyperliquid markets can also be traded when the flow and wallet allow it.

## Choosing coins

- Coins can be checked individually or found with search.
- A minimum and maximum daily-volume filter treats plain numbers as millions,
  so `10` to `100` means $10m to $100m. The visible list is ordered from highest
  volume to lowest. Decimals and suffixes work too: `.5` and `500k` both mean
  $500,000.
- The header checkbox selects or clears every coin visible after the volume and
  search filters are applied.

## What gets saved

- Filters only narrow the list while editing. They are not run again later.
- The step saves the exact full market keys, including exchange, network and
  coin. Running the same saved flow again tests the same list.
- A later candle-size choice that would use too much memory is refused plainly.
  The app never silently trims the saved list.

## History and missing coins

- Each saved market key chooses its own candle and funding source. Hyperliquid
  stays Hyperliquid and Binance stays Binance.
- A listed coin remains selectable when its history is short or missing. The
  run records gaps and uses only what that exchange actually provides.
- A coin with no usable history is shown as skipped. Another exchange is never
  substituted silently.
