# The candle store

One shared shelf of finished candles for every market on every exchange,
read by both the chart and the backtester. Tyler, 2 Sep 2026: **"We only need
the first 30 days of real data from the protocol. The rest we can use our
candle storage."** and **"Dukascopy is for the stocks, Binance is for
cryptos."** Those two sentences are the whole design; the rest of this file
is how they are carried out.

## The two sources

- A candle from last Tuesday is finished and never changes. It is fetched once
  from the source with the longest memory and kept in `trade_candles`, under
  that source's market key.
- Binance supplies the coins. BTC on Hyperliquid, Lighter, Aster, Phemex and
  KuCoin all read `binance:mainnet:BTC`. Binance Futures opened in September
  2019, so that is as far back as any coin goes.
- Dukascopy supplies the stocks, indices, metals and currency pairs. TSLA on
  Hyperliquid (`xyz:TSLA`), Lighter (`TSLA`) and Aster (`TSLAUSDT`) all read
  `dukascopy:mainnet:tslaususd`, back to 26 January 2017.
  `exchanges/dukascopy.md` has the naming and the numbers.
- The map lives in one browser-safe file, `historySourceFor`. A US stock ticker
  becomes `<ticker>ususd`. Anything not a plain US ticker goes through a short
  hand-written alias table (gold, silver, oil, the S&P 500, the euro and so
  on), and a test checks that table against Dukascopy's published list so a
  typo cannot ship.
- Lighter states no category for any market, so a bare name there is only a
  guess until the server confirms it against the source's own list. KIOXIA on
  Lighter would be `binance:mainnet:KIOXIA` by the naming rule, and Binance has
  never listed it, so it maps to nothing. Three coin tickers spell a US stock
  as well (SUI, W, WEN) and are pinned as coins.
- A market that maps to nothing keeps today's behaviour. Its rows stay under
  its own key, its chart shows only what the venue has, and the backtest picker
  says "history from the exchange only". Nothing is guessed.

## A venue with no candles at all

Solana publishes none, and neither does Jupiter nor the chain. Its registry
entry says so once, with `recordsOwnBars`, and three things follow from that
one statement.

- **Borrowed by mint address, never by name.** Every other venue matches by
  ticker, which is safe where the venue curates its listings. Anyone can mint
  a coin on Solana and call it BTC, so a name match there would draw the wrong
  chart. `lib/protocols/solana/history.ts` holds a pinned list of 44 mints and
  the four checks each one passed on 4 Sep 2026: Jupiter vouched for it, only
  one verified Solana coin carries that ticker, Binance lists it, and it holds
  at least $200,000 of liquidity. Six coins were refused for the ticker check
  alone, TRUMP among them, because Solana has two verified coins with that
  name. Seventy-nine more were refused on liquidity, PORTAL at $4 of it.
- **The chart says whose history it is.** A borrowed chart on such a venue
  reads "History from Binance" beside the market name. Only a venue with
  `recordsOwnBars` says it, so no other venue's chart changed.
- **Everything else grows its own bars.** A coin with nothing to borrow gets
  one-minute bars written from the prices the screen refreshes, under its own
  key. Volume is zero, because a price carries none. A minute nobody was
  watching has no bar rather than a flat line, so a gap reads as a gap.
- **The first paint comes from the store, not from waiting.** Every other
  venue hands over its own recent slice at once and the store fills the years
  in behind it. A venue with no candles has nothing to hand over, so the chart
  reads the same recent slice — at most a thousand bars — from whichever key
  holds that market, and the backfill stitches the rest in behind exactly as
  it does elsewhere. Drawn the other way the chart waited on a read of every
  bar ever stored: JUP took 2.8 seconds against Hyperliquid's 0.8, and 1.3
  after.
- **While those bars are on their way the chart shows its loading state**, not
  "No candles here yet". The venue's answer is always empty here, so saying
  the market has no history would be true for a second and wrong after it.
- **Neither kind may be backtested.** Borrowed history is another venue's, and
  recorded history has holes wherever nobody was looking. The backtest picker
  offers only venues that can also take orders, which Solana cannot, and a
  test pins that a venue recording its own bars is never offered.

## The 30-day rule

- Every chart asks the venue for its own last 30 days, capped at a thousand
  bars on the fast timeframes: thirty days of minute bars would be 87 Lighter
  requests against sixty a minute. One request on most venues, two on Lighter.
- Everything older comes from the store. On the 4-hour and daily charts the
  store fills all the way back to the source's first bar. On the others it
  holds 20,000 bars: two weeks of minutes, about two years of hours. That
  limit is ours, not the source's.
- Nothing older than ten years is asked for, because the daily sweep removes
  it again (`engine/data-retention.md`). Gold on Dukascopy goes back to 2003;
  the chart reads it from ten years ago.
- Older bars on a chart are Binance or Dukascopy prices, not the venue's.
  BTC's mark differs by up to $28 across the five venues (measured 26 Aug
  2026), so the seam at day 30 can show a small step. The chart says where the
  older bars came from.

## The seam and the first paint

- The venue's slice is drawn the moment it arrives, exactly as before. The
  store's rows follow in a second request and go in behind it without a
  flicker: the newer bars are the same bars, and the chart keeps its own zoom.
- Where both have a bar, the venue's wins. The seam is the venue's first bar,
  and there is no duplicate and no hole at it.
- One short line in the chart header, in the same small text as the timeframe
  picker: "Older bars: Binance" or "Older bars: Dukascopy". Nothing when the
  whole chart is the venue's own.
- If the source will not answer, the store answers with what it already holds:
  those rows are drawn behind the venue's, and the header line says "Older
  bars: Dukascopy, not all loaded." with Try again. With nothing stored it
  says "Older bars could not be loaded." A failure never overwrites bars
  already drawn.
- A refresh on a bar close asks the venue again and leaves the store alone.
  The refresh job below keeps the store itself current.
- Two browsers opening the same market at once share one fill; the second
  waits for the first rather than asking the source twice.

## First use

- The first open of a market and timeframe fills the store and takes longer;
  every open after that reads straight from the table.
- Measured 2 Sep 2026 on this worktree's dev server:
  - BTC 4-hour from Binance: 15,307 bars from 8 September 2019, one page of a
    thousand bars per request, and the second request answered in about two
    seconds when the rows were already stored.
  - TSLA 4-hour from Dukascopy: 5,602 bars from 26 January 2017. The library
    downloads one file per month of hourly data, so a full fill is about 116
    files; the first attempt at the library's default pace drew a 429 and the
    fill finished on Try again. The pacing is now slower, see
    `exchanges/dukascopy.md`. TSLA 1-hour, the store's 2.3-year depth, is
    28 files and 14 seconds. Gold 4-hour back to 2003 is 280 files and 159
    seconds, with the venue's 30 days on screen throughout.
  - Opening the same market again sent nothing to Binance or Dukascopy: the
    coverage table already said the window was there.
- On Lighter a chart open is now one candle request for the 30 days (two on
  the minute chart) instead of the nine a two-year first paint with the chase
  behind it used to cost. Measured 27 Aug 2026, the old shape ran Lighter's
  sixty-a-minute allowance out after eight coins.

## Kept fresh

- One background job, `trade-candle-refresh`, rides the shell's fifteen-second
  ticker. Each pass it looks at the pairs of market and timeframe already in
  coverage, finds the ones whose newest stored bar is behind the last closed
  one, and tops them up, most-behind first.
- It only tops up what somebody has opened or tested. It never walks a
  catalogue, and a pair whose newest bar is older than the store's own depth
  for that timeframe is left alone until a chart asks for it again. A backtest
  over 2022 writes minute rows for 2022, and nobody wants two weeks of this
  year's minutes for every coin it tested.
- One pass spends at most 20 requests, so it can never crowd the trading engine
  or a backtest out of the shared six-in-flight gate. Binance goes through its
  own back-off and Dukascopy through the library's batch pause under that.
- Only the sources are topped up. Rows an older build stored under a venue's
  own key are left alone; they are harmless and the ten-year sweep removes
  them in time.
- The job logs one line per pass that did anything: how many pairs it topped
  up and how many requests that took.

## Stock hours are not gaps

- A stock only trades during its market's hours. Nights, weekends and single
  holidays come back from Dukascopy as silence, and the store never writes
  them down as gaps.
- For a source whose bars only exist in session, a gap is two or more silent
  weekdays in a row inside the window. The day still in progress is never
  judged before its market has opened.
- Coins trade around the clock, so their gaps are what they always were: a
  missing bar is a missing bar.

## Stock splits

- Dukascopy publishes what traded, splits and all. Tesla is $2,211 on 28 Aug
  2020 and $443 the next session (five-for-one), $891 on 24 Aug 2022 and
  $303 the next (three-for-one). Drawn as they are, the older candles sit far
  above the chart's price range and read as holes, with the EMA sliding down
  across each cliff. That is what Tyler saw on 2 Sep 2026.
- The store folds a split back so the whole history reads in today's units,
  which is also the units the venue's own bars are in. A step between two
  sessions that lands on a whole number of two or more (or its reverse) within
  three percent is read as a split: prices before it are divided by the
  ratio and volume multiplied, on every timeframe of that market.
- That is the one guess in the store, and it is written down.
  `trade_candle_splits` holds every split found: the market, the first bar in
  the new units, and the ratio. A raw page fetched later for a stretch before
  a recorded split is folded on its way in, and a split that lands in a later
  top-up folds the years already stored.
- Rows stored before the store knew about splits were folded by hand on
  2 Sep 2026 with `adjustStoredSplits`, and the same call is the repair if a
  split is ever missed.
- Coins never split, and Binance's prices are used as they are.

## The volume label

- Dukascopy's volume is its own brokerage volume, not the stock market's. It
  is stored as it comes, and the chart's volume pane says "Dukascopy volume"
  for the bars that came from there.
- Binance's volume is the market's own, so nothing is said for coins.

## What the backtester reads

- The Markets step shows one list of every venue's markets, each once under
  its source, with category tabs. `backtests/market-selection.md` explains
  the list and what gets saved.
- The run maps every key to its source before it reads, so a backtest saved
  with venue keys before 2 Sep 2026 reruns untouched.
- Stocks have no funding on Dukascopy, and the result says so.
