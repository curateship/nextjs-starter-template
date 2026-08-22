# What Aster does differently

Trade can read Aster markets on mainnet and testnet without a wallet or API
key. Aster accounts, orders and fills are not connected yet. This document
records only behavior the app runs today or a live response proved.

The measurements below came from Aster's V3 API on 22 August 2026. Market and
price figures were read at 13:08 UTC. They are a dated comparison, not values
the app assumes will stay fixed.

## Markets and networks

- Trade keeps only active perpetual contracts whose quote and margin assets
  are both USDT. Mainnet returned 536 markets: 422 crypto markets, 105 stock
  markets and 9 commodity markets. Testnet returned 17 crypto markets.
- Aster listed one more eligible mainnet market than it had earlier the same
  day. Trade reads the list rather than keeping a fixed set of symbols.
- Every one of the 536 mainnet markets reported a $5 minimum order value. BTC
  also reported $5. Trade does not place Aster orders yet, so the value is not
  used for sizing. Any future ladder child must be worth at least $5 when it is
  sent. [grid-orders.md](grid-orders.md) holds the shared grid rules; Aster task
  13 owns applying the exchange's floor.
- Aster's public market response does not state a trustworthy top leverage.
  The two margin percentage fields are marked "ignore" in Aster's V3 docs, and
  the leverage bracket needs a signed account request. Trade prints "Not
  stated publicly" instead of working out a number Aster may not enforce.

## The two prices

- The market list uses Aster's mark price from `premiumIndex`. Aster's V3
  reference uses that price for current margin calculations and some order
  filters. The chart uses traded-price candles, so the list and the newest
  candle do not have to match.
- Twelve BTC comparisons over about seven seconds found gaps from $0 to
  $28.82. One sample had a $77,236.42 mark and a $77,207.60 last trade.
- One snapshot compared all 536 eligible markets. RIVN had the largest dollar
  example in that read: a $16.79 mark and a $14.77 last trade, a $2.02 gap.
  The gap changes with trading. Trade does not copy the last trade into a field
  that says mark price.
- The daily move and dollar volume come from the 24-hour ticker. Those figures
  describe trading activity, while the main price still comes from the mark.

## Funding and charts

- Aster states the current funding rate and settlement interval separately.
  Trade divides a four-hour rate by four and an eight-hour rate by eight so the
  market list always shows one hour.
- Aster sometimes returns a funding configuration row with no interval. Trade
  leaves that market's hourly figure blank. Funding history uses an hourly
  fallback for gap warnings so an unknown interval cannot make a missing charge
  look free.
- Mainnet and testnet schedules stay separate. A live comparison found 15
  shared symbols with different intervals. WIF settled hourly on mainnet and
  every eight hours on testnet in that read.
- BTC returned 30 funding settlements over ten days. BTC also returned candles
  on all six chart intervals. A two-day read produced 2,880 one-minute bars and
  2 one-day bars.

## Clock

- Today's Aster reads are public, so Trade sends no timestamp and applies no
  clock correction yet.
- Eleven calls to Aster's time endpoint put its clock 153 to 304 milliseconds
  ahead of the midpoint of the local request. The middle sample was 182
  milliseconds ahead. Round trips took 162 to 468 milliseconds.
- Signed requests need a deliberate clock rule rather than the dated number
  above. Aster task 7 owns that rule and must measure it again before account or
  order traffic depends on it.

## Request cost and live updates

- Trade reads Aster's limits from `exchangeInfo` on the first Aster request in
  each network. The 22 August response stated 2,400 request units a minute,
  1,200 orders a minute per account and 300 orders in ten seconds per account.
  Trade does not keep those numbers in code.
- Every current Aster request states its measured cost before it is sent. Trade
  keeps a rolling minute of public and signed spending. Aster's
  `x-mbx-used-weight-1m` response header also tells Trade what the internet
  address has spent, so calls from another process count after Aster reports
  them.
- Background reads stop at four fifths of the limit Aster states. At the
  measured limit, background work can spend 1,920 units and leaves 480 for
  orders. A forced ten-unit test spent eight on startup and background work.
  The next background request never reached Aster, while two units of order
  work still fit.
- A 429 answer stops public Aster calls for twenty seconds. Polling code can try
  again after the hold; the refused request itself never sleeps or retries. A
  418 answer means the internet address is banned. Trade stops both Aster
  networks for the life of the process and does not start a retry timer.
- A fresh market catalogue costs 61 units of Aster's one-minute request
  allowance. Exchange rules cost 1, every market's 24-hour figures cost 40,
  all mark prices cost 10, and funding intervals cost 10. The response headers
  increased by those exact amounts during the measurement.
- One 1,000-bar chart request costs 5 units. The shared chart asks again when a
  bar closes, so a visible one-minute chart spends 5 units a minute. A visible
  four-hour chart spends 5 units once every four hours.
- The Aster market list has no browser subscription yet. Its figures stay at
  the catalogue snapshot until the page reloads. Leaving only the list open
  therefore spends 0 units a minute after the initial 61-unit load.
- A live several-wallet half hour cannot be counted yet because Trade has no
  Aster wallet or order request. Task 9 must declare the signed read costs, then
  repeat the half-hour measurement before funded use. Task 4 owns replacing the
  market snapshot with a subscription.

## Behavior that is not known yet

- Trade has no Aster credential form or signed request. Task 6 must record how
  the app signs in and what the smallest useful key is allowed to do.
- Trade has no Aster account, position or order block. A dragged Aster order has
  never been moved by this app, so there is no one-step move claim yet. Task 16
  owns that measurement.
- Trade has not placed an Aster stop. Task 15 must prove whether a stop follows
  the remaining position size after part of the position closes.
- Trade has not received an Aster fill. Task 17 must record which fields Aster
  sends and how Trade works out what a finished trade made.
- Trade cannot place a real Aster trade. Practice trading inside Trade is local
  simulation and is not evidence about Aster's order behavior.
