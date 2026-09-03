# Backtest market selection

How the Markets step decides which coins a backtest uses, and where their
prices come from.

## One list, no exchange picker

- With pretend money the step shows one list: every market any trading venue
  lists, each shown once under its history source. BTC on Hyperliquid, Lighter,
  Aster, Phemex and KuCoin is one row. TSLA on Hyperliquid, Lighter and Aster
  is one row.
- Tyler, 2 Sep 2026: **"Dukascopy is for the stocks, Binance is for cryptos."**
  Coins read Binance's candles. Stocks, indices, metals and currency pairs read
  Dukascopy's. `charts/candle-store.md` explains the store both read from.
- Category tabs (All, Crypto, Stocks, Indices, Commodities, Forex) narrow the
  list. The tabs only appear when the list really holds more than one kind.
- Each row says which exchanges list it and how far its history goes on a
  line under its name, such as "Hyperliquid, Aster, Lighter · since 2017". A
  market no source covers is still listed and marked "history from the
  exchange only"; the run reads that exchange's own candles for it.
- There is no exchange to pick. Binance is not offered anywhere in the
  backtest; it is where a coin's history comes from, not somewhere to choose
  coins nobody could trade.
- With a wallet named the list is that wallet's exchange, because a wallet can
  only trade its own. The step says which exchange it follows. Coins saved on a
  different exchange are refused with the reason, and the fix is to pick them
  again from the list.

## Choosing coins

- **Pick coins** saves the checked list. **Use a folder** saves one folder and
  shows its current coin count.
- Coins can be checked individually or found with search.
- A minimum and maximum daily-volume filter treats plain numbers as millions,
  so `10` to `100` means $10m to $100m. The volume on a backtest row is the
  highest any listing exchange reported. The visible list is ordered from
  highest volume to lowest. Decimals and suffixes work too: `.5` and `500k`
  both mean $500,000.
- Selecting the header checkbox replaces the current choice with every visible
  coin. Coins left over from an older filter cannot fill the 500-coin limit.
- The volume range is saved with the Markets step and stays in place until it
  is changed. It only controls which rows are shown while editing.

## What gets saved

- Filters only narrow the list while editing. They are not run again later.
- A picked list saves source keys: `binance:mainnet:BTC`,
  `dukascopy:mainnet:tslaususd`. A market no source covers saves its own venue
  key.
- A folder choice is read when the backtest starts. Each folder coin is mapped
  to its source key then and the list is deduplicated, so a folder holding BTC
  on Lighter and BTC on Aster tests BTC once. The backtest then saves the exact
  keys it read, so its result stays repeatable after the folder changes.
- A trading flow reads its folder at every run start. A run already in progress
  keeps the keys it started with.
- A later candle-size choice that would use too much memory is refused plainly.
  The app never silently trims the saved list.

## Older saved backtests

- A backtest saved before 2 Sep 2026 holds venue keys such as
  `hyperliquid:mainnet:BTC`. Nothing rewrites them. The run maps every key to
  its source when it starts and when it walks, so the run reruns without
  editing. Its result chart reads the source's rows too; a run last walked
  before the change shows its candles again after one rerun.

## History and missing coins

- A listed coin remains selectable when its history is short or missing. The
  run records gaps and uses only what the source actually provides.
- A coin with no usable history is shown as skipped. Another source is never
  substituted silently.
- Stocks have no funding on Dukascopy. The result's Funding line says
  "Stocks: no funding in this run" and names them, instead of warning about a
  missing stretch. A Hyperliquid or Lighter stock perpetual does charge funding
  in real life; the run simply did not count it.
