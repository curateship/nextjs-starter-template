# What ApeX Omni does differently

Trade reads ApeX Omni's perpetual and stock contracts, charts and funding at
`/protocols/apex`, on mainnet only, holds a connected ApeX wallet, and places,
moves, cancels and closes orders on its perpetuals. ApeX Omni is a decentralised perpetuals
exchange built on zkLink, the same kind of venue as Lighter. It is not the
Variational Omni planned in `workspace/tasks/Protocols/Omni/`, which is a
different product.

Every figure below was measured against ApeX's live API on 24 September 2026
unless it says otherwise. They are dated readings, not numbers the app
assumes will hold.

## The market list

- **127 markets.** ApeX's `/api/v3/symbols` answer held 138 perpetual rows
  (88 with trading switched on), 47 stock rows (39 on) and 184 prediction
  markets. Trade lists the 88 and the 39. The prediction markets are yes/no
  bets and are never read.
- **Coins under Crypto, the rest under TradFi.** ApeX files its stock
  contracts as STOCK (29), INDEX (4) or COMMODITY (6), and the app files them
  the same way: Tesla under Stocks, SPY under Indices, gold and oil under
  Commodities. All three sit inside the TradFi tab.
- **The picker shows fewer than 127 when the daily-volume setting is on.**
  With the admin account's setting on 24 Sep 2026 it showed 9: six coins, two
  stocks and one index. The setting filters lists only; a market it hides
  still opens by link.
- **One market ApeX lets close but not open.** IO had trading on and opening
  off. It is listed, because a position there still has to be closable.
- **Leverage from the margin rate.** A contract's `initialMarginRate` of 0.01
  means 100x, 0.02 means 50x.
- **Every contract settles in USDT.**

## Two spellings, one row

ApeX names each market twice. `crossSymbolName` (`BTCUSDT`) is what every
read and the socket use, so it is the market id and the key is
`apex:mainnet:BTCUSDT`. `symbol` (`BTC-USDT`) is what an order and the funding
history name. The funding history refused `BTCUSDT` with code 3, "invalid
symbol". Both spellings come off the same catalogue row in
`apex/catalogue.ts`; nothing rewrites one into the other.

## Where the figures come from

- **The socket, not one read per market.** ApeX has no read that prices every
  market at once: `/ticker` with no symbol answered an empty list. One topic
  on its public socket, `instrumentInfo.all`, pushes every market's figures,
  so the market list takes them from there. A catalogue costs one REST
  request a minute.
- **One `/ticker` read per market only when the socket has nothing.** The
  list waits up to 3 seconds for the socket's first frame. If none comes, it
  asks each market's ticker, six at a time, which is 127 of the 600 requests
  ApeX allows a minute. The whole list loaded in 1.5 seconds from the socket.
- **Funding is already hourly.** ApeX settles funding every hour, its docs say
  so, and 100 rows of BTC funding history sat exactly 3,600 seconds apart. So
  the rate ApeX quotes is shown as it is, not divided by eight.
- **The day's move is a fraction.** LTC's `price24hPcnt` of 0.233 was a real
  23% day: it went from $60 to $74, and Binance showed +23.9% the same day.
- **Open interest is in coins**, and the list multiplies it by the mark to
  show dollars.

## Charts

- **Never send `limit` to the candle read.** With a `limit` over 200 ApeX
  answers an empty list. With no `limit` it hands back up to 1,500 bars, the
  newest in the window. So every page is a time window of 1,400 bars, never
  wider, and no page can be missing its oldest bars.
- **Times go in as seconds and come back as milliseconds.** The window's
  `end` includes the bar that second falls in, so the app asks for the last
  second before its window ends and trims the answer.
- **ApeX's own bars start on 15 June 2024.** BTC's first daily bar opened
  then, and ApeX states no start per market (`klineStartTime` was 0 on every
  row). A walk into older years stops there. Anything older comes from the
  history source: Binance for coins, Dukascopy for stocks, indices, metals and
  oil. On the daily chart, dragging back reached BTC's first Binance bars near
  $10,300 in 2019.
- **The timeframes.** 1m, 5m, 15m, 1h, 4h and 1d map to ApeX's 1, 5, 15, 60,
  240 and D. All six drew BTC and all six received live candle pushes.

## Live prices

- **One connection carries every market.** The public socket is
  `wss://quote.omni.apex.exchange/realtime_public?v=2`. Measured over 20
  seconds: the first frame arrived 1.0 second after connecting, then a frame
  of all 368 markets (perpetuals, stocks, prediction markets and a few
  delisted ones) every 2.0 seconds. ApeX called every one of them a snapshot.
  A frame marked delta is applied the same way, market by market.
- **Predictions are dropped two ways.** The engine's feed keeps only what the
  catalogue lists, and re-reads the catalogue on every reconnect so a new
  listing is picked up. The browser has no catalogue in hand, so it drops by
  shape: every one of the 184 prediction ids looked like
  `Heat_Win_Against_Celtics_Dec19USDT`, and none matched the capitals and
  digits every contract has. ApeX's `ss` flag is not a prediction marker (the
  KORU perpetual carried 1 and 29 prediction markets carried 0), so nothing
  reads it.
- **Heartbeat.** ApeX pings each socket (its first ping came 7 seconds in) and
  the app answers with a pong carrying the same stamp. The app also pings
  every 15 seconds, the interval ApeX's docs ask for. Twelve seconds without a
  price frame, six missed frames, counts as a dead line and it reconnects.
- **Chart candles** come from `candle.<interval>.<market>` on the same
  connection, one topic per open chart.
- **Hiding the tab closes the line; showing it reopens it.** Checked in a
  browser: the socket closed while hidden, a new one opened when the tab came
  back, both topics were subscribed again and prices arrived 1.0 second later.

## Request limits

ApeX publishes its limits, which the other decentralised venues do not:

- 600 requests a minute per internet address.
- Per account, 300 POST and 600 GET requests a minute.
- 200 open orders per account.

`apex/budget.ts` counts all three windows before a request goes out and
refuses at once when one is full, with the count and how long until there is
room: "ApeX Omni — spent 240 of 240 requests from this server this minute,
room again in 12 seconds". Nothing waits inside a refusal.

- **The website and the engine share one address and one account.** Each
  process only sees its own requests, so the website takes two thirds of each
  window and the engine one third. The pair can never go over what ApeX
  counts.
- **Idle reads get three fifths of a process's share.** A chart somebody just
  opened gets seventeen twentieths, and order work gets all of it. For the
  website that is 240, 340 and 400 of the address window's 600.
- **When ApeX rations the app, the app stops asking.** A 429, a 403 or
  ApeX's own code 10003 holds that lane for 5 seconds, then 10, 20, 40 and at
  most 60 on each rationing answer in a row. The first normal answer clears
  it. The public lane and each account's signed lane are held apart.

## The clock

Every signed request carries `APEX-TIMESTAMP`, and ApeX answers a time it
does not accept with code 20002 on an ordinary HTTP 200. Measured on 5 Sep
2026, this machine ran 239 milliseconds ahead of ApeX.

- The app reads `/api/v3/time` at most once a minute and stamps ApeX's time,
  not its own.
- A 20002 re-reads the clock once and sends the same request once more. A
  second 20002 is refused. Nothing else is ever resent, because a resent
  order is a possible double order.
- Measured with made-up credentials: a missing timestamp answered
  `err APEX-TIMESTAMP`, one ten minutes old answered `APEX-TIMESTAMP out of
  allowed skew window`, and one ten minutes ahead was let through to the key
  check.
- **Every answer's `code` is read.** ApeX puts its refusals inside an HTTP
  200, and a healthy answer carries no code at all.

## Signing in

A wallet needs four values from ApeX's API management page and the wallet's
address. The Add wallet window has one "API values" box and a Passphrase box.

- **API values takes three values separated by spaces**: the API key, the
  secret and the omni key. The box is a single line, and a browser strips
  line breaks out of a single-line box, so one value per line cannot work.
  The omni key is found by its shape, 130 hex characters, wherever it sits.
  A label pasted with a value ("API Key:") is ignored.
- **The passphrase goes in its own box.**
- **Nothing is saved until it is proved.** One signed read of the account
  proves the key, secret and passphrase. The address must be the wallet ApeX
  has the account under. The omni key must sign as the public key ApeX holds
  for the account (`l2Key`): any 130 hex characters sign something, so only
  that match proves it is this account's key.
- **A wrong key, secret or passphrase gets one sentence naming all three.**
  ApeX answers all three with code 10002, measured with made-up values, so
  there is no telling them apart.
- **The wallet's own Ethereum key is never asked for**, so the app can trade
  but never withdraw.
- The four values are stored as one encrypted blob and only `apex/` reads it.

## The signer

Every ApeX order carries a zkLink signature besides the request's HMAC. ApeX
publishes the signer as a compiled WebAssembly file in its Node connector,
and `src/server/protocols/apex/signer/` holds an unedited copy.
`PROVENANCE.md` there names the commit and each file's checksum.

- **Proved against ApeX's own code.** Three orders were signed by the
  connector's own signing function with a made-up omni key, and the app's
  signer reproduces all three byte for byte.
- **A signer is used up by one signature.** Signing twice with the same one
  answered "null pointer passed to rust"; the connector makes a new one per
  order and so does the app. About 124 milliseconds each.
- **The request HMAC matches ApeX's documented Python signer** on the docs'
  own example credentials.

## The account

`GET /v3/account` and `GET /v3/account-balance`, read together.

- **Worth, free and in trades** are ApeX's `totalEquityValue`,
  `availableBalance` and `initialMargin`.
- **Open profit is priced the way the account says.** ApeX states
  `unrealizePnlPriceType` per account; its docs show both INDEX_PRICE and
  MARKET_PRICE, so the app reads it and uses the index or the mark to match.
- **Leverage is read, never assumed.** A market the account set its own rate
  for uses that rate; one it never set uses the market's default rate, ApeX's
  own rule. 5x is a rate of 0.2.
- **Margin held is ApeX's formula**: size times oracle price times the margin
  rate. The oracle price comes off the balance answer.
- **No liquidation price.** ApeX liquidates the whole account when its equity
  falls below the maintenance margin and states no price per position, so the
  position row shows none rather than a made-up one.
- **Cross margin, one pool for the account.** ApeX's docs describe no other
  mode.
- **One read every two seconds per account, longer while the private socket
  vouches for it** (see Fills). Two minutes is the ceiling.

## Stock contracts are listed but not traded

ApeX trades its stock, index and commodity contracts from a separate RWA
account with its own API key and its own signing seed derived from the main
one (its docs' "RWA" section, and the `/v3/stock/...` endpoints). An order on
one from the main account is refused with PermissionDenied. Setting up that
second account also moves money between accounts, so Trade does not do it:
an order on a stock contract is refused before anything is sent, with that
reason. The market list and charts still show them.

## Orders

- **A resting order** is a LIMIT with GOOD_TIL_CANCEL, or POST_ONLY when it
  must rest or be refused.
- **A market order is a LIMIT with IMMEDIATE_OR_CANCEL, capped 3% through the
  price.** Never ApeX's own MARKET type. ApeX signs a price into every order
  anyway, and its docs say an order meant to cross must be priced worse than
  the index. A buy at $84,000 goes out capped at $86,520.
- **Sizes snap down to the step and prices to the tick.** A cap never rounds
  past itself: a buy's rounds down, a sell's up.
- **The smallest order is refused in dollars before sending**: "ApeX Omni's
  smallest BTC order is 0.001 BTC, about $84.00 at this price."
- **200 open orders** is ApeX's cap; a resting order past it is refused first.
- **Every order lives 28 days**, the life ApeX's docs recommend. A stop or
  target must not lapse while its position is open, which a one-day life
  would do. Nothing re-places a stop older than 28 days yet.
- **The fee cap** (`limitFee`) is price times size times the account's taker
  rate, rounded up to six places, as ApeX's docs and connector compute it.
- **Two ids.** The app's client order id goes in, as `trade-` and the rest of
  the id; ApeX's own order id comes back and is what the app stores, cancels
  and looks up by. An id starting `0x` would be hashed as bytes rather than
  text by ApeX's connector, so the `0x` is dropped.
- **No amend.** Moving an order cancels it and places a new one. If the new
  one is refused, the sentence says the old one came off and nothing replaced
  it.
- **Close** is a reduce-only IOC for the whole size at the 3% cap.
- **Read back, not trusted.** ApeX answers an order PENDING before matching,
  so the app reads it back: once for a resting order, and until it is filled
  or cancelled (about three seconds at most) for an IOC one. An IOC that found
  nothing to fill is refused in words, not reported as done.
- **A read-back that fails never turns a sent order into a failed one.** A
  resting order is reported resting. An IOC order whose result cannot be read
  says so and asks for a check of Positions before placing it again, because
  "try again" is how an order gets placed twice.
- **Both real-money switches** are checked on every change to an account.

## Stops and targets

- **ApeX holds them.** A stop is a STOP_MARKET and a target a
  TAKE_PROFIT_MARKET, reduce-only, triggered on ApeX's market price, with a
  worst price 3% through the trigger. They fire with the app off.
- **Whole position or a fixed size.** A stop for the whole position is ApeX's
  position TPSL, which it sizes to the position when it fires. A grid's own
  stop is a fixed size.
- **Never uncovered.** A moved stop is placed first, confirmed in the open
  orders, and only then is the old one cancelled, with any leftover guard on
  that market. If the place fails the old stop stands and the sentence says
  so. If an old one will not cancel, the sentence names it.
- **The wrong side is refused in one sentence**: "A long position's stop has
  to sit below the price, which is 84000 now."
- **An entry can carry its own stop and target** as ApeX's open-TPSL legs,
  each signed separately.

## Leverage and margin

- **Leverage** is `POST /v3/set-initial-margin-rate`, the rate being one over
  the leverage. It is set before the first order on a market and read back
  from the account; a leverage past the market's ceiling is refused first.
- **Margin cannot be moved.** ApeX's docs describe one margin pool for the
  whole account and list no call that adds or takes back cash behind one
  position, so the margin control says why instead.

## Fills

- **Pushed over the private socket.** `realtime_private?v=2`, signed in with
  the login frame from ApeX's connector: the HMAC over
  `timestamp + "GET" + "/ws/accounts"`. The task's notes said
  `/realtime_private`; the connector and the docs both sign `/ws/accounts`.
  After login the app subscribes to `ws_zk_accounts_v3`, as the docs do.
- **Each fill is a Journal row keyed by ApeX's own fill id**, with its price,
  size, fee and direction. A fill pushed and then read back in a recovery is
  one row.
- **No profit per fill.** ApeX's fill states its fee but no profit, in its
  docs and its connector's types; profit is stated only per whole close. So
  `profitPerSale` is false, and a zero on a fill means "not stated".
- **Recovery** reads `GET /v3/fills` at start, after a gap and on the shared
  schedule, 100 rows a page.
- **Any push** tells the account read to look again.

Refusals are in `apex-omni-refusals.md`.

## Settings

`TRADE_APEX_REST` (default `https://omni.apex.exchange/api/v3`) and
`TRADE_APEX_WS` (default `wss://quote.omni.apex.exchange`) replace the server's
addresses. The browser always opens ApeX's published quote host, because it
cannot read a server setting. Only `apex/` folders may name an ApeX address;
`fence.test.ts` fails otherwise.

## Mainnet only

Tyler decided on 5 Sep 2026 not to carry ApeX's testnet, although its twins
on `testnet.omni.apex.exchange` answered. The first order is one tiny real
order Tyler places himself.

## How to check it

The steps marked "real values" need Tyler's ApeX account.

1. Open `/protocols/apex?market=apex%3Amainnet%3ABTCUSDT`. The chart draws BTC
   at 100x with a live price line.
2. Open the market picker. The footer counts crypto, stock, index and
   commodity markets. Search "XAU" to find gold; search "Win_Against" and
   nothing appears.
3. Switch through 1m to 1d. Each draws, and the working candle moves.
4. On the daily chart, drag right until the bars end. They go back past 2024
   into Binance's history.
5. Leave the page for more than five seconds in another tab and come back.
   Prices move again within about a second.
6. Add wallet, Real ApeX Omni, made-up values: refused with "ApeX Omni did
   not accept these API values", and nothing saved.
7. Real values: the wallet saves and reads Connected. The card's worth, free
   and open profit match ApeX's own page.
8. Real values, real-money switches off: an order is refused with the switch
   sentence and nothing reaches ApeX.
9. Real values, switches on, one tiny order Tyler sizes: it rests on ApeX's
   page, moves when dragged, cancels when deleted; Close closes it; a stop
   dragged never leaves ApeX showing none; the fill reaches the Journal with
   its fee within a second.
10. `npx vitest run src/server/protocols/apex src/lib/protocols/apex` runs the
    saved-answer tests.
