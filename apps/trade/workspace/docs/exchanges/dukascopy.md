# What Dukascopy is for

Dukascopy is a Swiss bank that publishes years of price history for stocks,
indices, metals and currency pairs as public files. Trade reads those files
for the older bars of every stock, index, metal and currency-pair market the
venues list, and for backtests of them. Nothing is traded there, no account
is held there and no key is needed. Tyler, 2 Sep 2026: **"Dukascopy is for
the stocks, Binance is for cryptos."**

This document records only behaviour the app runs today or a live download
proved. The measurements came from the `dukascopy-node` package, version
1.50.0, on 2 September 2026.

## Where it sits in the code

- A protocol folder like Binance's, `src/server/protocols/dukascopy/`,
  registered with markets and candles and nothing else: no orders, no
  accounts, no funding, no live prices. The fence test keeps the package
  inside that folder.
- The package's ES module build imports named functions from `fs-extra`, which
  Node 24 refuses at load time. The folder loads the CommonJS build through
  `createRequire`, in dev and in the production bundle alike.
- Its market list is the instruments this app can map a venue market onto:
  every US stock and the aliased metals, energy, indices and pairs. Rows carry
  no live price or volume, because Dukascopy publishes finished bars and this
  app never trades on it. Categories come from the id's shape and are never
  "other".

## Instrument naming

- A US stock is `<ticker>ususd`: Apple is `aaplususd`, Tesla `tslaususd`, the
  SPDR S&P 500 ETF `spyususd`. Hyperliquid's `xyz:TSLA`, Lighter's `TSLA` and
  Aster's `TSLAUSDT` all land on `tslaususd`.
- Everything else goes through a short hand-written alias table in
  `src/lib/protocols/dukascopy/naming.ts`. Meta is still filed as Facebook,
  `fbususd`. Gold is `xauusd` (the venues call
  it XAU or GOLD), silver `xagusd`, platinum `xptcmdusd`, palladium
  `xpdcmdusd`, copper `coppercmdusd`, WTI oil `lightcmdusd` (CL or WTI),
  Brent `brentcmdusd`, natural gas `gascmdusd`, the S&P 500 `usa500idxusd`
  (SPX, SP500, US500), the Nasdaq 100 `usatechidxusd`, the Dow `usa30idxusd`,
  the Nikkei `jpnidxjpy`, the VIX `volidxusd`, the dollar index
  `dollaridxusd`, and the euro, pound, Australian and New Zealand dollars,
  yen, Canadian dollar, franc and Hong Kong dollar pairs.
- Left out on purpose: Hyperliquid's `xyz:JPY`, whose price runs the other way
  round from Dukascopy's `usdjpy`; the Korean and bond-yield markets; and the
  Japanese, Korean, Chinese and pre-listing companies Dukascopy does not
  publish. Those keep the venue's own history and the picker says so.
- Dukascopy's US stock list mostly stops at listings from before 2021, so
  Coinbase, Robinhood, Rivian, Arm, Circle, CrowdStrike, Reddit, Cloudflare,
  Hims, GameStop and MicroStrategy have no source and keep the venue's own
  history. Checked 2 Sep 2026 against the 1,499 published ids.
- The instrument list is copied into the app once, in
  `src/lib/protocols/dukascopy/instruments.generated.ts`: 1,499 ids, 615 of
  them US stocks, with a start date for each mapped one. A test checks every
  alias against that list. To regenerate, run the generator noted in the file
  against the package's
  `src/utils/instrument-meta-data/generated/instrument-meta-data.json`.
- Three coin tickers spell a US stock as well: SUI is the Sui coin on Lighter
  and `suiususd` is Sun Communities. Those are pinned as coins, and a test
  fails if one of them stops being a US stock id.

## Start dates

- Each instrument states when its ticks, minutes, hours and days begin. The
  package writes 2000-01-01 where it does not know, and that is ignored: the
  first bar every candle size exists is the latest of the starts it does know.
- Stock minute candles start on 26 January 2017 for the older listings, later
  for the newer ones. Daily candles often go much further back: the S&P 500
  from 1980, gold from 1999, oil from 1983.
- A fill is pulled forward to the instrument's first day. Every month before
  it is a download of nothing.

## Prices, hours and volume

- Bid prices. They are a touch below the mid; on a $200 stock the spread is
  cents. Stated here, not hidden.
- A stock only trades during its market's hours. A recorded week of Tesla
  hourly bars (24 to 28 August 2026) held 35 bars: seven a day, 13:00 to
  19:00 UTC, which is New York's 9:30 to 16:00 in summer, and nothing at the
  weekend. Four-hour bars fall at 12:00 and 16:00 UTC. Flat bars are dropped,
  which is how the closed hours come back as silence.
- The candle store never writes that silence down as a gap. Only two or more
  silent weekdays in a row count. `charts/candle-store.md` has the rule.
- Volume is Dukascopy's own brokerage volume in units, not the stock market's.
  The chart's volume pane says "Dukascopy volume" for the bars that came from
  here.
- A Dukascopy timestamp is already epoch milliseconds UTC.
- Prices are what traded, not adjusted for splits: Tesla reads $2,211 on
  28 Aug 2020 and $443 the next session. The candle store folds each split
  back into today's units and records it in `trade_candle_splits`;
  `charts/candle-store.md` has the rule.

## Request pacing

- The package downloads one file per hour of ticks, per day of minutes, per
  month of hours and per year of days. A full Tesla 4-hour history is about
  116 monthly files; two weeks of minutes is 14 daily files.
- At the library's default pace, ten files a batch with a one-second pause,
  the first full Tesla 4-hour fill drew a `Request failed with status 429`
  part-way through, and Dukascopy then refused a fresh two-week minute ask a
  few minutes later. The refusal is an address-wide cooldown, not a per-file
  one.
- Three files a batch with a second and a half between them held for about a
  minute and then drew refusals again, so Trade asks two files a batch with
  two seconds between batches, about a file a second, and a refused file
  waits ten seconds before each of five more tries. A full 4-hour history of
  a stock, about 120 monthly files, is two minutes on the first open. One history call covers a whole ask, so the library's one pacing
  schedule runs the download rather than the store asking page after page.
- Downloads run one at a time across the whole process. A backtest loads
  several coins at once, and five stocks each pulling three files a batch is
  fifteen files a batch against the same feed, which is the pace that drew
  the 429. Every call also takes one slot in the process-wide six-in-flight
  gate shared with the other sources.
- A refusal that reaches the backtest worker is an ordinary failed pass: the
  run is released and retried on a later tick, as any exchange fault is.
- A second and a half passes between one download finishing and the next
  starting, on top of the batch pause inside each.
- A 429 refused after every retry is raised as `EXCHANGE_BUSY:Dukascopy`,
  the same code Binance and the venues use for "slow down". The backtest
  worker hands the run back untouched and tries again on a later pass, with
  no strike against it; the chart says the source would not answer just now,
  keeps the venue's 30 days and offers Try again. The store keeps every page
  it saved. Nothing comes back as an empty answer the store would mistake
  for a market with no bars.

## What is published when

- A day's minute file appears after the day ends. Measured 2 Sep 2026: minute,
  5-minute and 15-minute asks answered through 1 September and nothing for the
  2nd; the daily file for the year in progress answered through 1 September
  too. So the candle store treats midnight UTC today as the latest moment
  Dukascopy can have covered, and never writes today down as covered. The
  venue's own 30 days carry the chart through today.
- Hourly and 4-hour bars come from one file per month, and the file for the
  month in progress is empty until the month ends: the September file
  answered nothing on 2 September. For the month so far Trade reads the daily
  15-minute files and folds them into hours, so a backtest over the last 30
  days of a stock still has its 4-hour bars. Same bid prices, same bars.

## Measured numbers

- One week of Tesla hourly bars, one monthly file: 0.9 seconds, 35 bars.
- Two years and three months of Tesla hourly bars, 28 monthly files, at three
  files a batch: 13.9 seconds, 3,985 bars. That is the store's whole depth
  for an hour chart.
- One day of Tesla minute bars, one daily file: about 0.1 seconds, 390 bars.
- The full Tesla 4-hour history from 2017 is about 116 monthly files; at the
  same pace that is a minute or so on the first open, and never again.
- Gold's full 4-hour history from May 2003, about 280 monthly files: 159
  seconds on the first open of XAU on Lighter, measured through the running
  app, and the chart's 30 days were on screen the whole time. Every open
  after that read the store in about a second.
