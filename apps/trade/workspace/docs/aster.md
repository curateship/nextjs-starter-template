# Aster

Aster is a read-only exchange in Trade. Its mainnet and testnet markets can be
listed and charted without a wallet or signing key. Account reads and orders
remain unavailable until their own tasks are built and tested.

## What the app reads

- Trade uses Aster's V3 futures API. Mainnet reads
  `https://fapi.asterdex.com`; testnet reads
  `https://fapi.asterdex-testnet.com`.
- The market list includes active perpetual contracts whose quote asset and
  margin asset are both USDT. A paused contract, dated contract, or contract
  settled in another asset stays out of the list.
- The printed price is Aster's mark price from `premiumIndex`. The daily move
  and dollar volume come from the 24-hour ticker.
- Funding is shown as an hourly figure. Aster states the current rate and each
  market's settlement interval separately, so a four-hour rate is divided by
  four and an eight-hour rate by eight.
- Market rules come from each contract's filters. The app carries the exact
  price tick and turns the size step into the number of allowed decimal places.
  The market header names Aster and the network. Its info button shows the
  price tick and states when top leverage is not available publicly.
- Charts use Aster's traded-price candles. The six available intervals are one
  minute, five minutes, fifteen minutes, one hour, four hours and one day.

## What was measured

The public feeds were checked on 22 August 2026.

- Mainnet returned 535 active USDT perpetuals: 421 crypto markets, 105 stock
  markets and 9 commodity markets.
- Testnet returned 17 active USDT perpetuals.
- BTC returned candles on all six chart intervals. A two-day window contained
  2,880 one-minute bars and 2 one-day bars, with the expected counts between
  them.
- Ten days of BTC funding history returned 30 settlements.
- A fresh catalogue costs 43 units of Aster's request allowance: 1 for the
  exchange rules, 40 for every market's daily figures, 1 for mark prices and 1
  for funding intervals. The request-budget task owns reducing and sharing
  those reads as more Aster features arrive.

## What Aster does not say publicly

Aster's public `exchangeInfo` response does not state a trustworthy top
leverage. Its two margin percentage fields are marked "ignore" in Aster's V3
documentation, and the leverage-bracket endpoint needs a signed account. The
app leaves top leverage blank rather than work out a number Aster may not
enforce. The account task can fill the number once signed reads exist.

Aster also returns funding configuration rows with no settlement interval.
The app skips those unusable rows and keeps the valid intervals. A missing
interval leaves the market's current hourly funding blank rather than assuming
an eight-hour schedule. Funding-gap detection uses a conservative hourly
fallback so an unknown interval cannot make a missing charge look free. The
app keeps mainnet and testnet schedules separate because Aster gives some
symbols different intervals on each network.
