# What if I had bought

`/tools/what-if` says what money put into a coin on a past day is worth now.
$1,000 of Bitcoin bought at the close on 1 Jan 2026, at $88,800, is
0.011261 BTC, and at the last close on 24 Sep 2026, at $84,370, that is worth
$950. A second tab buys a fixed amount every week. It opens without an
account, and `?coin=SOL` opens another coin.

## Which coins are offered

- **Busy Hyperliquid coins with Binance history.** A coin is offered when it
  traded at least $1,000,000 on Hyperliquid over the last day, and Binance
  lists the same coin as a perpetual future. The dollar line is the
  converter's `OWN_PAGE_MIN_VOLUME_USD`, so both tools call the same coins
  busy. On 25 Sep 2026 that was 80 coins, busiest first.
- **Only coins whose prices are stored and current.** A coin is left off the
  list until the candle store holds a daily close from the last three days.
  A coin with no stored history is not offered at all.
- **A coin that is not offered** at `?coin=XYZ` is "not found".
- **The 72 stocks are built and switched off.** They are the Robinhood Chain
  stock tokens whose history comes from Dukascopy
  (`src/lib/protocols/robinhood/history.ts`). `STOCKS_OFFERED` in
  `src/lib/free-tools/what-if.ts` is false until Tyler decides, for the two
  reasons under "Stocks" below.

## Where the prices come from

- **Stored daily closes only.** Every figure is worked out from the candle
  store's daily closing prices (`loadStoredCandles`, `interval = "1d"`).
  Coins use Binance's perpetual future. The page says so under the answer.
- **"Now" is the last stored close**, which is yesterday's close in UTC. The
  answer names that day and that price, so the figure can be checked against
  the store.
- **A day is a UTC day.** A visitor in Sydney and one in Toronto who pick
  1 Jan get the same close.
- **How far back.** Back to the coin's first day on Binance's futures market,
  and never more than ten years, which is as long as the store keeps any bar.
  Bitcoin starts on 8 Sep 2019, Solana on 14 Sep 2020, and HYPE on 30 May 2025.
  The calendar switches off every day before the first close and after the
  last one.

## No visitor reaches an exchange

- **One kept copy for everyone.** The server works out the offered list and
  keeps it for an hour. Each coin's closes are kept for an hour the first time
  somebody opens that coin. Every visitor in that hour reads the kept copy.
  The code is `src/server/free-tools/what-if.ts`.
- **The list reads one shared thing.** Deciding which coins are busy reads
  Hyperliquid's market list, which the server already keeps for a minute and
  shares with the trading screens and the price converter
  (`loadRawMarketCatalog`). With the hour's keep on top, that is at most one
  read an hour from this page.
- **The sums run in the browser.** The closes arrive with the page, and every
  change to the date, the amount or the weekday is worked out there. Nothing
  is sent while typing.
- **If the market list cannot be read**, the page keeps serving the list it
  already has. With no list at all, the page says "The list of coins could not
  be read. Try again in a minute." with a Try again button.

## The nightly fill

- **What it does.** Once a UTC day, the worker lists every coin the page
  could offer and downloads daily closes for any that has none yet, none
  reaching back to the store's ten-year floor, or none from the last three
  days. It runs in the `what-if-daily-history` worker in
  `src/app/server-options.ts`.
- **One coin at a time, never waited on.** Each fifteen-second pass starts one
  coin's download and returns at once, so a slow download never holds up the
  worker's other jobs. The next coin starts once that download ends. A coin
  whose download fails is tried again the next night.
- **After the first night it normally finds nothing to do.** The candle
  store's own top-up (`src/server/trade/candle-refresh.ts`) already adds each
  new day to every market it holds. The first run, on 25 Sep 2026, took the
  offered coins back to their first Binance day, a few requests each. Before
  it, most stored daily history started on 21 Dec 2023.
- **Stocks are not filled** while `STOCKS_OFFERED` is false.

## Bought once

- **Money in, coins out.** The amount buys at the chosen day's close. Coins
  bought = amount ÷ that close. $1,000 at $190 is 5.26 SOL.
- **Worth now** = coins × the last close. 5.26 SOL at $150 is $789.
- **Money made or lost** = worth now − the amount.
- **Lowest along the way** is the lowest the holding was worth at any day's
  close from the buy to now, with that day. It is judged on closes, not on
  the lowest price inside a day.
- **The chart** shows what the holding was worth at every close from the buy
  to now. Past about 400 days it draws every few days, always keeping the
  first day, the last day and the lowest day.
- **Amount** takes $1 to $1,000,000,000, with decimals and thousands commas. A
  number outside that is marked, and leaving the box says what is allowed.
  The answer keeps the last number that fit.

## Bought every week

- **Buying days.** The chosen weekday, starting on the first one on or after
  the chosen date. Each week buys at that day's close.
- **Money put in** = the weekly amount × the number of buys. $100 every
  Monday for 38 weeks is $3,800.
- **Average price paid** = money put in ÷ coins owned. 142 buys of $100 of SOL
  that came to 111.13 SOL is an average of $127.77.
- **Worth now** and **money made or lost** work as in the one-off buy.
- **The chart** shows what the coins owned were worth each day, and a dashed
  line for the money put in so far, named in a legend under it.

## Missing days

- **A day with no close buys at the next close there is.** The answer says so
  in words, for example: "No close on Thu 1 Jan 2026. Binance has no price from 1 Jan 2026
  to 4 Jan 2026. The exchange had no price for this stretch. The buy uses the
  next close, on Mon 5 Jan 2026."
- **Where the words come from.** The stretch and its reason are the store's
  own records of missing prices (`listCandleGaps`). A day that is not inside
  one of those records says only that the source has no close for that day.
- **Every other missing stretch inside the holding is named** under the
  answer, and the chart draws straight across it.
- **A week with no close at all** buys nothing, and the answer counts those
  weeks.
- **A date before a coin's first close.** Switching to a coin whose closes
  start later than the chosen date moves the date to that coin's first close,
  and the answer says so.

## Stocks

Built and switched off. Two things stand in the way.

- **Dukascopy's terms.** Stock prices come from Dukascopy. Its terms of use,
  read on 25 Sep 2026, say: "You agree to use the WEBSITE solely for your own
  non-commercial use and benefit" and "You may not recirculate, redistribute
  or publish the analysis and presentation included in the WEBSITE without
  DUKASCOPY's prior written consent." They also say the information "may not
  be used to construct a database of any kind." A public page showing their
  prices looks like publishing them.
- **Most stored stock history is missing.** On 25 Sep 2026, 11 of the 22 US
  stocks with daily closes stored had only 5 to 7 of them, all from 16 Sep
  2026 on. Micron is one. The store marks the years before as fetched, so
  neither the store's top-up nor the nightly fill would ask for them again.
  Only Tesla, Amazon and Meta reach back to 2017.

What the stock side does once it is switched on:

- **Share counts are in today's shares.** The candle store folds every split
  into the prices before it, so a stock bought before a split is counted in
  today's shares. Tesla's stored close on 22 Aug 2022 is $289.80, already
  divided by three for its three-for-one on 25 Aug 2022.
- **A split inside the holding is named by its day.** "TSLA split its shares
  on 25 Aug 2022. Every stored price before then is in today's shares." The
  ratio is left out on purpose. The store's split records repeat one split
  once per timeframe and can add a reversing row the next day, so Tesla's one
  split is three rows. Only the day can be read from them.
- **Weekends are not offered as buying days,** and a buying day the market
  was shut buys at the next close that week.
- **The picker** lists the stocks after the coins, as "NVDA, NVIDIA CORP",
  and the address is `?stock=NVDA`.

## The page

- **Registered** by `src/routes/tools_.what-if.page.ts`, which puts it in the
  sitemap, on the Pages dashboard, and gives it its title and share preview
  through `freeToolHead`. It needs no entry in the app's sitemap option.
- **On `/tools`** once `shipped` is true in `src/lib/free-tools/registry.ts`.
- **Switched off** from the Pages dashboard, it is "not found" and leaves the
  sitemap.
- **Ends with one sign-up link** for a visitor who is not signed in.
- **Fees and taxes** on the pretend buys are left out, and the page says so.

The maths is in `src/lib/free-tools/what-if.ts`, the page in
`src/components/free-tools/what-if.tsx`, and the date field with month and
year lists in `src/components/free-tools/past-date-field.tsx`.
