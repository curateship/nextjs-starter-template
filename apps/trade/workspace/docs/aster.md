# What Aster does differently

Trade can read and trade Aster perpetual markets on mainnet and testnet. A
separate Pro API wallet signs account reads, order commands and the private
account stream. This document records only behavior the app runs today or a
live response proved.

The measurements below came from Aster's V3 API on 22 August 2026. Market and
price figures were read at 13:08 UTC. They are a dated comparison, not values
the app assumes will stay fixed.

## Markets and networks

- Trade keeps only active perpetual contracts whose quote and margin assets
  are both USDT. Mainnet returned 536 markets: 422 crypto markets, 105 stock
  markets and 9 commodity markets. Testnet returned 17 crypto markets.
- Aster listed one more eligible mainnet market than it had earlier the same
  day. Trade reads the list rather than keeping a fixed set of symbols.
- Every one of the 536 mainnet markets reported a $5 minimum order value. The
  coin-size rule can make the real minimum higher. BTC accepts sizes in 0.001
  BTC steps, so its smallest order is about $77 while BTC trades near $77,000.
  Trade shows the larger current dollar figure and checks both rules before it
  saves a watched order. A ladder or grid whose split puts any level below the
  floor is refused whole.
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
  one instant, and a fresh measurement after a clock refusal. Mainnet account
  reads use the corrected clock without placing an order.

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
- Key verification also asks Aster for the account-wide position mode. A
  one-way answer is saved on the wallet. A two-sided answer is refused with
  the name of the Aster setting to change.
- Aster's known refusals for authentication, time, request limits, address
  blocks, minimum order value, price steps, leverage changes and missing orders
  are translated inside the Aster connector. Trade discards unknown response
  text and gives a general next step, so exchange text cannot reach a screen or
  log by accident.

## Account and positions

- One account refresh asks for Aster's converted account totals and position
  risk together. The engine shares the result for fifteen seconds, and a
  failed answer is never saved in the cache. A successful order, cancellation
  or move clears the saved answer before the next pass.
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
  blank. Open trigger orders are joined back to that position as its stop and
  target, while ordinary waiting orders stay in Open orders.
- Account and position refreshes accept only `BOTH`, which is Aster's one-way
  shape. A `LONG` or `SHORT` row stops the refresh before any position figure
  reaches a screen. The wallet says that Aster can hold both directions and
  asks for One-way Mode. Empty `LONG` and `SHORT` rows count too, so changing
  the setting on Aster is noticed even when the account holds no position.
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
- One 1,000-bar chart request costs 5 units. A backtest history page asks for
  Aster's full 1,500 bars and costs 10 units. The shared chart asks again when a
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
- An account-total read costs 5 units and a position read costs 5. Verifying a
  new key adds one 30-unit position-mode read. Three active
  wallets read every fifteen seconds spend 120 signed units a minute. Including
  budget setup, one clock read and a one-minute chart makes 127 units against
  the 2,400-unit mainnet limit. This is a deterministic request count. A live
  several-wallet half hour still needs real Aster keys before funded use.
- Before an opening order, Trade reads the market's current margin mode and
  leverage. Trade changes only a setting that differs. Trade had been asking
  Aster to set isolated margin without reading the current value first, and
  Aster's refusal kept the SOL buy from being sent.
- An unknown Aster refusal keeps its numeric code in the Journal while dropping
  Aster's free-form message. The code is enough to name a missing case without
  risking a key or account detail from the exchange's text.
- Aster refuses isolated margin with code `-4168` while the futures account is
  in Multi-Assets Mode. Trade names the account setting and tells the person to
  change Aster to Single-Asset Mode. Trade does not make that account-wide
  change by itself.
- Aster returns code `-5019` when its regional rules block the server that sent
  an order. Trade says that no order was sent and leaves a watched level ready
  instead of freezing it as sent. The engine must run from an Aster-supported
  region; Trade does not route orders around Aster's location rules.
- The engine shares Aster's account and open orders for fifteen seconds while
  watched prices and the recent-fill check still move every second. One active
  wallet had been spending more than 3,000 signed units a minute against
  Aster's 2,400-unit limit. The paced reads cost about 500 units a minute for a
  wallet with one watched market.

## Orders, leverage and protection

- A watched order is rounded down to Aster's coin-size step before it is saved.
  If the rounded size is below Aster's minimum coin size or dollar value, Trade
  refuses it before the engine can see it. Older undersized watches end without
  sending money instead of sitting forever after their price is reached.
- A fresh entry sets the margin mode shown in the order window, then sets the
  chosen leverage, then sends the order. A reduce-only order changes neither
  account setting. The last successful setting per account and market is kept
  for this process so an unchanged choice does not spend another request.
- If Aster refuses either account setting, no entry is sent. The refusal names
  the requested leverage or margin mode. An existing position keeps its own
  settings instead of being changed underneath it.
- An order that must fill now is still a limit: Trade caps it three percent
  through the mark and sends it Immediate-or-Cancel. Aster may fill inside that
  cap or cancel the rest; it never receives a naked market entry from Trade.
- Aster stops and full targets use its whole-position flag. They follow
  whatever size remains without a replacement. A partial target names its own
  coin size and is reduce-only. Closing the position removes any whole-position
  stop or target still waiting on that market.
- A resting Aster limit moves with `PUT /fapi/v3/order`. Price and size change
  on the existing order in one command. There is no cancel-and-replace
  fallback. If the order filled during the drag, the app says it is gone and
  the line returns to the exchange's answer.

## Private account stream

- The first account use opens a signed listen key and one private socket per
  account and network. The key is renewed every thirty minutes. A failed
  renewal, an expired key, a socket close or a socket error tears the line down
  and reconnects with a delay that tops out at thirty seconds.
- Order and account events invalidate the short account cache. Trade fills are
  translated immediately into the same record used by recovery reads, whose
  primary key makes the pushed and recovered copy one fill. A REST fill read
  runs once after the stream opens or reconnects, not on a healthy timer.
- Aster requires a market name on its recovery trade endpoint. The connector
  remembers markets seen in positions, open orders and orders sent by this
  process, then recovers those markets. A newly connected account with only
  old, fully closed markets has no safe all-market history endpoint to ask.

## Flows and four-venue operation

- Aster now carries the same order adapter and pushed mark-price feed the live
  flow engine requires. Choosing an Aster wallet moves the Markets step to
  Aster and clears coins from the old venue. A testnet wallet is named Aster
  Testnet, and the existing market-key checks keep it away from mainnet.
- The worker opens price feeds from the registry, so Aster joins Hyperliquid,
  Phemex and KuCoin without a special engine branch. Its heartbeat is named
  separately. Blocking one feed is isolated by the existing per-venue error
  boundary.
- Mainnet operation is the long-running observation. A separate testnet or
  twenty-four-hour certification run does not hold up Aster trading.

## Mainnet operation

- Aster work targets the connected mainnet account. Testnet is not a release
  step and does not hold up live trading work.
- Opening orders set the chosen margin mode and leverage before the order is
  signed. Whole-position stops and targets follow the size that remains.
- The private account stream pushes order, position and fill changes. A recovery
  read runs when the stream opens again after a disconnect.
- Mainnet orders still require `TRADE_ENABLE_MAINNET=true` and the Real-money
  trading switch in Settings. Those two switches protect live money; testnet
  does not decide whether they can be turned on.
