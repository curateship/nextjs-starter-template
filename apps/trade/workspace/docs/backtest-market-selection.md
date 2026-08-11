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
- Volume-band buttons select from the current exchange's full catalogue using
  today's volume.
- **Every coin** selects the catalogue up to the 500-coin limit.
- A random sample is drawn while editing. It uses the full catalogue and
  respects how many candles the selected window can safely hold.
- Search only narrows the visible rows. It does not change which coins the
  volume, every-coin or random buttons use.

## What gets saved

- Quick picks are resolved while editing, not when Run is pressed.
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
