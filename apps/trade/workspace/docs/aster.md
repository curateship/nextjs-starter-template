# What Aster does differently

Trade can read Aster markets on mainnet and testnet without a wallet or API
key. A separate Pro API wallet can sign account and position reads. Orders and
fills are not connected yet. This document records only behavior the app runs
today or a live response proved.

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
  $28.82. One sample had a $77,236.42 mark and a $77,207.60 last trade. A
  second live check on 22 August found a $77,283.64 mark and a $77,273.50 last
  trade, a $10.14 gap.
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

- Before the first signed read, Trade asks Aster for its time and measures the
  difference from the midpoint of the request. The result lasts five minutes.
  A clock refusal throws away the old measurement before the next request.
- Signed requests use millionths of a second. Trade remembers the last number
  for each API wallet and network, so two requests made in the same instant
  still carry different numbers.
- Eleven calls to Aster's time endpoint put its clock 153 to 304 milliseconds
  ahead of the midpoint of the local request. The middle sample was 182
  milliseconds ahead. Round trips took 162 to 468 milliseconds.
- Unit checks cover a machine clock ahead of and behind Aster, two requests in
  one instant, and a fresh measurement after a clock refusal. A deliberate
  five-minute wrong-clock check still needs a working Aster practice key.

## Signing in and refusals

- The Add wallet window asks for the main account address and the private key
  of a separate Pro API wallet. Trade derives the public signer address from
  that key. The signer and private key share one encrypted server-side value.
  If the derived address matches the entered account address, Trade refuses the
  pair and asks which Aster value belongs in each field. The app cannot prove
  from that match alone whether Aster generated the key, so it does not call it
  the main key.
- Each private request signs the exact encoded parameters with Aster's EIP-712
  domain. The request carries the account, signer, time and signature. The
  private key never enters the request or a browser response.
- Trade proves a key with account-total and position reads before saving it. A
  bad key says where to make a replacement. A clock problem, a short request
  hold and an address block have separate messages because each needs a
  different next step.
- Aster's known refusals for authentication, time, request limits, address
  blocks, minimum order value, price steps, leverage changes and missing orders
  are translated inside the Aster connector. Trade discards unknown response
  text and gives a general next step, so exchange text cannot reach a screen or
  log by accident.

## Account and positions

- One account refresh asks for Aster's converted account totals and position
  risk together. The result is shared for two seconds, and a failed answer is
  never saved in the cache.
- The wallet card uses Aster's total margin balance, available balance and
  total open profit. Aster converts every supported margin asset into those
  totals, so money held as USD1 is not lost behind an empty USDT row. Money in
  trades is the difference between account worth and the available balance.
- A funded mainnet check on 22 August first reproduced the broken `$0.00`
  card. Reading Aster's account total changed the same connected card to
  `$104.98` without replacing its saved key. Aster's separate read-only balance
  endpoint reported the underlying perpetual balance as `105 USDC`. The signed
  converted total and Trade's card agreed at `$104.98`.
- A nonzero position keeps Aster's signed size, entry price, leverage and
  liquidation price. Isolated positions use Aster's isolated margin. Cross
  positions use Aster's position margin from the account response because the
  isolated field is zero there. A zero or missing liquidation price stays
  blank. Aster orders remain unavailable, so the positions reader does not
  open an order or fill path by accident.
- Switching a wallet off removes it before credentials are read. Account and
  position polling then sends no request for that wallet.

## Request cost and live updates

- Trade reads Aster's limits from `exchangeInfo` on the first Aster request in
  each network. The 22 August response stated 2,400 request units a minute,
  1,200 orders a minute per account and 300 orders in ten seconds per account.
  Trade does not keep those numbers in code.
- Testnet currently returns `-2` instead of a finite one-minute request or order
  limit. Trade treats that value as no stated cap and still enforces the
  positive ten-second order limit testnet returns. Treating `-2` as a missing
  limit used to block every practice signed request before it reached Aster.
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
- A 429 answer stops public and signed Aster calls on that network for twenty
  seconds. Aster counts request weight by internet address, and its response
  does not reliably say which allowance fired, so continuing on the other lane
  could turn the warning into a block. Polling code can try again after the
  hold; the refused request itself never sleeps or retries. A 418 answer means
  the internet address is banned. Trade stops both Aster networks for the life
  of the process and does not start a retry timer.
- A fresh market catalogue costs 61 units of Aster's one-minute request
  allowance. Exchange rules cost 1, every market's 24-hour figures cost 40,
  all mark prices cost 10, and funding intervals cost 10. The response headers
  increased by those exact amounts during the measurement.
- One 1,000-bar chart request costs 5 units. The shared chart asks again when a
  bar closes, so a visible one-minute chart spends 5 units a minute. A visible
  four-hour chart spends 5 units once every four hours.
- The browser opens one socket per network. One command subscribes to the
  all-market mark stream, the day's trading figures and the open chart's
  candle stream. A ten-second mainnet check received 20 messages, 7,113 rows
  and marks for 707 markets without another web request for prices.
- The list keeps the order from its last full read. A changed ticker row waits
  for the next mark update, then only that market repaints. The chart's newest
  traded-price bar grows from its own candle stream.
- A hidden browser tab closes its Aster socket. A visible tab reconnects and
  asks for a fresh list and chart after data resumes. The server keeps one
  all-market mark stream per network for the engine and treats it as stale
  after twelve quiet seconds.
- An account-total read costs 5 units and a position read costs 5. Three active
  wallets read every fifteen seconds spend 120 signed units a minute. Including
  budget setup, one clock read and a one-minute chart makes 127 units against
  the 2,400-unit mainnet limit. This is a deterministic request count. A live
  several-wallet half hour still needs real Aster keys before funded use.

## Behavior that is not known yet

- A dragged Aster order has never been moved by this app, so there is no
  one-step move claim yet. Task 16 owns that measurement.
- Trade has not placed an Aster stop. Task 15 must prove whether a stop follows
  the remaining position size after part of the position closes.
- Trade has not received an Aster fill. Task 17 must record which fields Aster
  sends and how Trade works out what a finished trade made.
- Trade cannot place a real Aster trade. Practice trading inside Trade is local
  simulation and is not evidence about Aster's order behavior.
