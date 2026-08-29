# Backtest market selection

How the Markets step decides which exchange and coins a backtest uses.

## Choosing the exchange

- **Markets from** offers Hyperliquid, Binance, Phemex, KuCoin and Aster from
  the same protocol list used by the rest of Trade.
- The selected exchange's full mainnet perpetual catalogue is shown. The list
  is not filtered through another exchange or by available candle history.
- One Markets step belongs to one exchange. Switching exchanges clears the
  chosen coins, preventing one run from mixing exchanges.
- Binance supplies prices, funding and backtests but does not place orders.
  Hyperliquid, Phemex, KuCoin and Aster markets can also be traded when the flow
  and wallet allow it. Aster history comes from Aster, in pages of up to 1,500
  candles. The candle store hands over up to six pages at once, and the shared
  request queue keeps those reads inside one bounded batch.

## Choosing coins

- **Pick coins** saves the checked list. **Use a folder** saves one folder from
  the selected exchange and shows its current coin count.
- Coins can be checked individually or found with search.
- A minimum and maximum daily-volume filter treats plain numbers as millions,
  so `10` to `100` means $10m to $100m. The visible list is ordered from highest
  volume to lowest. Decimals and suffixes work too: `.5` and `500k` both mean
  $500,000.
- Selecting the header checkbox replaces the current choice with every visible
  coin. Coins left over from an older filter cannot fill the 500-coin limit.
- The volume range is saved with the Markets step and stays in place until it is
  changed. It only controls which rows are shown while editing.

## What gets saved

- Filters only narrow the list while editing. They are not run again later.
- A picked list saves the exact full market keys, including exchange, network
  and coin.
- A folder choice is read when the backtest starts. The backtest then saves the
  exact keys it read, so its result stays repeatable after the folder changes.
- A trading flow reads its folder at every run start. A run already in progress
  keeps the keys it started with.
- A later candle-size choice that would use too much memory is refused plainly.
  The app never silently trims the saved list.

## History and missing coins

- Each saved market key chooses its own candle and funding source. An Aster key
  stays on Aster. Trade never substitutes another exchange's longer history.
- A listed coin remains selectable when its history is short or missing. The
  run records gaps and uses only what that exchange actually provides.
- A coin with no usable history is shown as skipped. Another exchange is never
  substituted silently.
