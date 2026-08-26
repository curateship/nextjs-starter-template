# What Lighter does differently

Trade reads Lighter's perpetual markets, charts and funding at
`/admin/lighter`, on mainnet only. It cannot yet hold a Lighter wallet or place
a Lighter order. This file records only behaviour the app runs today or a live
response proved.

Every figure below was measured against Lighter's live API on 26 August 2026,
between 14:05 and 14:55 UTC. They are dated readings, not numbers the app
assumes will hold.

## The two things that shape everything else

- **Lighter charges nothing to trade.** Every one of its 212 active markets
  reported a maker fee of 0 and a taker fee of 0. Every other venue in this app
  takes a cut on each fill.
- **A Standard account gets sixty requests a minute, and the socket spends the
  same sixty.** Lighter counts REST calls and socket messages against one
  allowance. That is why the socket does nearly all the reading here. Premium
  raises the cap to 24,000 a minute, but only by staking LIT, which Tyler has
  not done, so 60 is the number the code enforces.

## Markets

- Lighter listed 229 perpetual markets. 212 were active and 17 were inactive.
  Its spot list came back empty and is skipped either way.
- Trade lists 194 of the 212. The 18 it leaves out have never traded: no
  volume, no open interest, and Lighter answers zero candles on all six
  timeframes for them. KORU, GME, ARM and AVGO were among them. Lighter still
  prices those markets, because the mark comes from an outside index rather
  than from trading, so a price alone is not proof a market can be charted.
- The test is whether a market has EVER traded, not whether it traded today.
  Two markets that day, NZDUSD and GEV, had no trades since midnight but real
  history behind them. NZDUSD charts 1,673 four-hour bars.
- Every Lighter perpetual settles in USDC.
- Lighter states no kind of market. Its 212 active markets mixed 111 coins, 55
  US stocks, 14 non-US stocks, 11 metals and fuels, 9 currency pairs and 12
  others. The closest thing to a category is an undocumented `strategy_index`,
  and it groups cleanly until its seventh group, which holds a bond yield, two
  private-company markets and two memecoins together. Trade does not guess from
  it: every row says "other" and the market picker shows no category tabs.
- Lighter states how many decimal places a price may have, not a tick. BTC
  allows one decimal place, so its price step is $0.10. LAUNCHCOIN allows six,
  so its step is $0.000001. Trade turns the decimal count into the step the
  chart snaps a dragged order to.
- Lighter states the smallest order two ways and Trade keeps both. Every market
  read had a $10 minimum dollar value. BTC's smallest coin size is 0.0001 BTC,
  about $7.86 at that morning's price, so the $10 floor is the one that binds.
- Top leverage comes from Lighter's most generous margin requirement, stated in
  hundredths of a percent. BTC's 200 means a 2% margin floor, which is 50x.
  LAUNCHCOIN's 3,333 is 3x.

## The three prices

Lighter states a mark price, an index price and a last trade. It liquidates and
charges funding on the mark, so Trade uses the mark everywhere the other four
venues use theirs. The chart still draws traded prices, so the list and the
newest candle do not have to agree.

One BTC comparison across all five venues at 14:29:05 UTC, against Lighter's
$78,204.30 mark:

| Price | Gap from Lighter's mark |
| --- | ---: |
| Lighter index | $15.50 above |
| Lighter last trade | $0.90 below |
| Hyperliquid mark | $2.70 above |
| Phemex mark | $9.00 below |
| KuCoin mark | $23.62 below |
| Aster mark | $25.50 below |

Lighter's own three prices sat within $16.40 of each other. The five venues'
marks spread $28.20 from top to bottom, so which venue a position sits on
matters more than which of Lighter's prices is read.

## Funding

- Lighter settles funding every hour. Three days of BTC rows came back 72 rows
  with every gap exactly 3,600 seconds. Nothing about this was assumed; the
  docs showed hourly rows and the measurement confirmed them.
- Lighter states the rate as an unsigned percent with a separate `direction`.
  "long" means longs paid shorts, which is the positive sign the app uses, so
  "short" comes back negative.
- Its `funding-rates` endpoint quotes Binance, Bybit and Hyperliquid beside its
  own rate, as the eight-hour figure so they can sit side by side. Lighter's own
  hourly charge times eight matched its quoted rate exactly, so Trade divides
  the quote by eight to show one hour. It reads only the row that says
  "lighter", never the Binance row quoted next to it.

## Charts

- Lighter hands over at most 500 bars per request. A 700-hour ask returned the
  newest 500 rows, so every window is cut to 500 and the oldest bars are never
  silently dropped.
- The four-hour chart loads everything Lighter has, the way the other venues do.
  BTC returned 3,518 four-hour bars back to 17 January 2025.
- **The market's first day is what makes that cheap.** Walking backwards until a
  page comes back empty always wastes a batch, and on a young coin it wastes
  most of the walk. Lighter states each market's first day in the catalogue
  Trade already holds. Measured on BTC: 18 requests walking blind, 8 once the
  walk stops at the birthday, for the same 3,518 bars in 0.7 seconds. Funding
  history and backtest windows are pulled forward to that day for the same
  reason.
- All six timeframes work on mainnet. BTC returned 499 bars on 1m, 5m, 15m, 1h
  and 1d, and 3,518 on 4h.

## Mainnet only

Lighter runs a practice network and Trade does not carry it. Decided 26 August
2026, after measuring what was actually there:

- It listed three markets: BTC, ETH and LIT. All three were created on 24
  August 2026, two days before the measurement, so it had just been reset.
- All three showed a last trade price but zero volume and zero trades.
- BTC returned zero candles on 1m, 1h, 4h and 1d, including a 400-day daily
  window. The practice network serves no candle history at all.

So there was nothing to look at, and the `/admin/lighter` page has no `?network`
setting at all. A pasted one is dropped from the address rather than accepted
and quietly overridden. This matches Phemex and KuCoin, which are mainnet only
for their own reasons.

Three places refuse another network rather than guessing, because a call for
one is a bug in this app rather than something a person did:

- The REST client refuses before it builds a request, so nothing is sent to a
  host the app should never talk to.
- The socket address refuses the same way.
- The price feed opens nothing and reports itself unfresh. It does not throw,
  because one stale saved market key must not take down an engine pass covering
  five exchanges, and it does not connect-and-retry, because that would loop on
  the same refusal forever. Reporting itself unfresh sends the caller to the
  REST path, where the refusal is named once and out loud.

**What this costs.** There is now nowhere to rehearse a Lighter signature before
real money is involved, and the signing work is the part most likely to fail.
The order path will be proven the way Phemex's and KuCoin's were: signed READS
first, which cost nothing and move no money but still prove the signature is
accepted, and only then one deliberately tiny real order behind both real-money
switches.

## What a minute costs

Sixty requests a minute, REST and socket together. Background reads stop at four
fifths of that, so 48, leaving the last twelve for order work when trading is
switched on. Each measured exactly:

- The market list on its own: **2 requests** — the catalogue and the funding
  rates.
- Opening the page on its default four-hour chart: **10 requests** — those 2
  plus 8 for the full history.
- A steady minute with a one-minute chart open: **1 request**, as each bar
  closes. Plus one or two socket keepalive frames.
- Re-opening the same four-hour chart inside the following minute: **0
  requests**. The history is held for a minute.

So the worst ordinary moment, opening the page, spends 10 of the 48 background
allowance, and a normal minute spends 2 or 3. Nothing measured came near the
cap.

Lighter's docs list a weight per endpoint and say unlisted ones weigh 300. None
of the market-data reads are on that list, so each declares 300. A Standard
account's cap counts requests rather than weight, so the declared weight only
feeds the snapshot and this file's arithmetic.

## Live prices

- One socket per network carries everything that ticks. It subscribes to
  `market_stats/all` for the list and one `candle` channel per open chart.
- Sixty seconds on one read-only socket received **490 messages carrying 7,636
  market rows and marks for all 229 markets, for three frames sent and not one
  REST request.** Watched in the browser for twenty seconds, BTC's daily volume
  moved from $741m to $742m with zero REST calls to Lighter.
- **Lighter closes a socket whose client has been silent for two minutes, and
  pushed data does not count.** Only frames the app sends keep the line open, so
  both the server hub and the browser ping every 50 seconds. Each ping spends
  one of the 200 client messages a socket may send in a minute, and one of the
  sixty requests.
- A socket that goes quiet for twelve seconds is treated as stale, torn down and
  reconnected, backing off 1, 2, 5, 10 and then 30 seconds. A hidden browser tab
  drops its socket; a visible one reconnects and refetches what the gap missed.
- The public socket is opened with `?readonly=true`. It carries public prices
  and never an account.

## Refusals

- A 429 or a 405 stops Lighter requests on that network for **sixty seconds**,
  not the twenty the other venues use. Lighter's own docs state a static
  60-second firewall cooldown, so asking again at twenty would spend a third of
  the next minute's sixty requests on refusals. The refused request itself never
  sleeps or retries; the caller keeps what it has and asks on its next poll.
- The hold is kept per network, so it stays correct if Lighter ever gains a
  second network worth carrying.
- Lighter answers `code: 200` inside a healthy body. Any other code is a
  refusal, and Trade keeps only the number. Its free-form message is discarded
  before anything reaches a screen or a log.

## Not built yet

Accounts, keys and orders. Lighter runs its own chain and signs orders with its
own scheme rather than the Ethereum signing Aster and Hyperliquid use, so
signing needs the WASM build from Lighter's Go library vendored into the app.
Until that lands, `/admin/lighter` reads and charts and offers no trade, and the
market picker says so rather than showing a button that would be refused.
