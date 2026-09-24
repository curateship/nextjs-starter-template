# What edgeX does differently

Trade reads edgeX's perpetual contracts, charts and funding at
`/protocols/edgex`, on mainnet only, holds a connected edgeX account, and
places, moves, cancels and closes orders there with stops that rest on edgeX
itself. edgeX is a decentralised perpetuals exchange of the Lighter kind: the
account lives on edgeX's own chain and every order is signed with a key the
app holds, a key that can trade but never withdraw.

edgeX's terms bar people in the United States and in Ontario, Canada. Tyler
holds an edgeX account that can trade (5 Sep 2026), so there is no
eligibility step in the app.

Every figure below was measured against edgeX's live API on 24 September 2026
unless it says otherwise. They are dated readings, not numbers the app
assumes will hold.

## Two APIs, and only one works

edgeX's older host still lists its markets but answers no prices, candles or
funding, and signs orders with a different kind of maths. The v2 host,
`https://edgex-prod-v2.edgex.exchange`, answers everything and signs orders
with the same Ethereum signing the app already does for Hyperliquid and Aster.
Trade uses the v2 host only, and the older host is named nowhere in the code.

## The market list

- **180 contracts, all quoted and settled in USDC.** On 5 Sep there were 167.
- **Coins under Crypto, the rest under TradFi.** edgeX flags 98 contracts as
  stocks (SPY, QQQ, Apple, Nvidia, Samsung and the rest) and 3 as currencies
  (USD/JPY, JPY, EUR). It flags its metals and oil as neither, so the app
  files gold, silver, palladium, platinum, copper, oil, Brent and natural gas
  under Commodities by name. The other 71 are coins.
- **Three contracts edgeX hides from its own list are hidden here too.** JPY,
  EUR and ZRO are tradable but not shown on edgeX's site. Trade leaves them out
  of the list and keeps them in the catalogue, so a position on one can still
  be read and closed.
- **The picker shows fewer than 177 when the daily-volume setting is on.** With
  the admin account's setting on 24 Sep 2026 it showed 19: 14 coins, 4 stocks
  and gold. The setting filters lists only; a market it hides still opens by
  link.
- **Leverage from the first risk tier.** BTC's first tier allows 100x; Samsung's
  allows 20x.
- **Stock markets close.** A stock contract's ticker says `marketOpen: false`
  while its stock exchange is shut: 19 of 180 were closed at 20:00 UTC, all
  Asian stocks. edgeX does not say when a closed market reopens.

## Two ids, one row

edgeX names every contract twice: a name, `BTCUSDC`, and a number,
`30000001`. The **name is the market id**, so the key is
`edgex:mainnet:BTCUSDC`. The task notes asked for the number, "as Lighter
does", but Lighter's ids are names too. A number would print as "30000001" in
the Journal and in notices, and could not be matched to a borrowed history.
Every request and socket channel names the number, and both come off the same
catalogue row in `edgex/catalogue.ts`. The browser, which has no catalogue,
learns each number from the price feed's frames.

## Where the figures come from

- **The price feed, never one read per contract.** On 5 Sep 2026 edgeX's price
  read with no contract named answered every contract. On 24 Sep 2026 it
  answered an empty list. So the list's prices, day's moves, volumes, funding
  and open interest come from the public socket's `ticker.all.1s` channel.
  When the feed has not spoken within three seconds, the list is refused as
  busy and the next load asks again. 180 single reads would take three minutes
  of the app's allowance.
- **The price is edgeX's mark**, which equalled its oracle price on every
  contract.
- **The day's move is a fraction.** BTC's 0.001466 was $84,272.3 to $84,395.9.
- **Funding settles every four hours**, 240 minutes on every contract, although
  edgeX's funding page says eight. The list shows the hourly rate, a quarter of
  edgeX's figure.
- **Open interest is in coins**, and the list multiplies it by the mark.

## Charts

- **1,000 bars a request, newest first.** 1,001 is refused with
  `INVALID_GET_PAGE_SIZE`. A request can name a time window directly, so every
  page is a window 1,000 bars wide and several go out together; edgeX's
  `offsetData` paging is not needed.
- **edgeX's own bars are young.** ETH's first daily bar opened 9 May 2026, BTC's
  12 May and SPY's 19 May. Nothing is asked for before 9 May 2026.
- **Older history is borrowed.** Coins borrow Binance and stocks, metals and
  currencies borrow Dukascopy, chosen by the contract's name. Checked in a
  browser: BTC's daily chart reached back to 2020 through Binance, and SPY's
  reached early 2024 through Dukascopy, where it traded near $470. SPY's first
  Dukascopy fill was slow and the header said "Older bars could not all be
  loaded" until it finished.
- **The chart never walks edgeX's whole history**, as on Lighter: sixty
  requests a minute cannot afford it, and the borrowed history covers anything
  older anyway.
- **The timeframes.** 1m, 5m, 15m, 1h, 4h and 1d map to edgeX's `MINUTE_1`,
  `MINUTE_5`, `MINUTE_15`, `HOUR_1`, `HOUR_4` and `DAY_1`. All six drew SPY in a
  browser, and each subscribed its own live candle.

## Live prices

- **One connection carries every contract.** The public socket is
  `wss://edgex-quote-prod-v2.edgex.exchange/api/v1/public/ws`. Measured over 20
  seconds: the first frame came 1.1 seconds after connecting with all 180
  contracts, then one every second. One contract's own ticker pushed 46 times in
  20 seconds and its 1-minute candle 19 times.
- **edgeX pings, the app pongs.** edgeX sends `{"type":"ping","time":…}` and
  wants the same time back in a pong, the opposite direction from Bybit and OKX.
  The first ping came 8.9 seconds in. Twelve seconds without a price frame
  counts as a dead line and the app reconnects.
- **The chart's candle** is `kline.LAST_PRICE.<contract number>.<timeframe>` on
  the same connection.
- **The engine's feed** is the same channel, opened on the server, and named in
  the worker heartbeat as "edgeX". It re-reads the catalogue on every reconnect,
  so a new listing is picked up.
- **Hiding the tab closes the line; showing it reopens it.** Checked in a
  browser: the line closed when the tab was hidden, a new one opened when it
  came back, prices arrived 0.4 seconds later and the chart's candle was
  subscribed again on its own.

## Request limits

edgeX publishes no numbers. Its docs say public endpoints have "higher rate
limits", private ones depend on the key's tier, and a breach is HTTP 429.
Measured: 80 public calls in 47 seconds on 5 Sep 2026, all answered.

- **Sixty a minute until measured.** `edgex/budget.ts` starts from Lighter's
  figure. A day-long run (task 11) is what raises it, and the new figure goes
  here.
- **The website takes two thirds and the engine one third**, because both share
  one internet address and each only sees its own requests.
- **Idle reads get three fifths of a share.** A chart somebody just opened gets
  seventeen twentieths, order work all of it. For the website that is 24, 34 and
  40 a minute.
- **A full minute is refused at once, with the count**: "edgeX — spent 24 of 24
  requests this minute, room again in 30 seconds". Nothing waits inside it.
- **A 429 stops the asking.** It holds that lane for 5 seconds, then 10, 20, 40
  and at most 60 on each 429 in a row, and the sentence says how many in a row.
  The first normal answer clears it. The public lane and each account's signed
  lane are held apart.

## The clock

Every signed request carries edgeX's time in milliseconds, and edgeX refuses
one more than 60 seconds out. On 24 Sep 2026 edgeX ran 160 milliseconds ahead
of this machine; on 5 Sep it ran 409 behind.

- The app reads `/api/v2/public/meta/getServerTime` at most once a minute and
  stamps edgeX's time, not its own.
- A timestamp refusal re-reads the clock once and sends the same request once
  more. A second one is refused. Nothing else is ever resent.
- edgeX checks the key before the time: a made-up key with a ten-minute-old
  stamp answered `INVALID_API_KEY`, so the timestamp refusal's own code has not
  been seen yet. Any code with TIMESTAMP in it is treated as one.

## Signing in

A wallet needs the Account ID from edgeX's API Management list and four
values from the SDK Signer dialog on that row (Perps V2 tab). The dialog lists
Private Key, API Key, secret and passphrase, in that order.

- **The Account ID goes in the first box**, digits only. It is a column of the
  API Management list, not a field of the dialog.
- **SDK Signer values takes three values separated by spaces, in the dialog's
  order**: the Private Key (the signer key), the API Key and the secret. The box
  is a single line, and a browser strips line breaks out of one, so one value
  per line cannot work. A label pasted with a value ("API Key:") is ignored.
- **Which value is the signer key.** The API key and secret wrap onto two lines
  in edgeX's dialog, so either could be 64 hex characters too. The signer key
  is the one written with `0x` if exactly one is, else the only 64-hex value,
  else the first value, which is where the dialog puts it. A wrong guess is
  refused by the sign-in check and never saved.
- **The passphrase goes in its own box.**
- **Nothing is saved until it is proved.** One signed read of the account
  proves the account id, key, secret and passphrase, and the account it answers
  about must be the id typed in. Where edgeX names the account's signing
  address, the signer key must sign as that address. edgeX's docs show an older,
  longer key there, so the first order may be the first real proof of the signer
  key.
- **A made-up key is refused in edgeX's words.** Checked in a browser: "edgeX
  did not accept this API key. Copy the API key again from API Management →
  Perps V2 → SDK Signer on edgeX", and the window stayed open with nothing
  saved.
- **The wallet's own key is never asked for**, so the app can trade but never
  withdraw.
- The values are stored as one encrypted blob and only `edgex/` reads it.

## The two signatures

Every private request is signed with the secret, and every order is signed
again with the signer key.

- **The request.** HMAC-SHA256 in hex over timestamp, method, path and the
  sorted parameters, keyed with **the base64 of the secret's text**. The task
  notes said "base64-decoded"; edgeX's authentication page and both its SDKs
  encode it. A POST body is signed as sorted `key=value` pairs, lists joined by
  `&`, true and false in lower case, exactly as the SDKs' `getValue` builds it.
  Trade never sends an empty field, so the signed text and the sent JSON always
  name the same fields.
- **The order.** EIP-712 typed data, `LimitOrderParams`, for the domain `EdgeX`,
  version 1, chain 3343 and contract `0xeeb3fb05…fac8`, all read from edgeX's
  metadata every time, never written into the code. Amounts are size and value
  times the resolutions in the metadata; the fee cap is the value times the
  higher of the contract's two fee rates, rounded up to a whole dollar. It is a
  cap, not the fee charged.
- **The nonce** is the first 32 bits of SHA-256 of the client order id. edgeX's
  signing page shows a different formula (modulo 2^63); both SDKs and the order
  page use 32 bits, so the app does.
- **An order lives 22 days** and its signature 30, as the SDKs sign them; edgeX
  wants the signature to outlive the order by eight days.
- **Proved against edgeX's own code.** edgeX's Python SDK 2.0.1 signed three
  orders (a limit buy, a post-only stock sell and a stop) and one GET with a
  made-up key, and the app reproduces all of them byte for byte
  (`signer.test.ts`).

## The account

`GET /api/v2/private/account/getAccountAsset`, one read for everything.

- **Worth, free and in trades** are the collateral row's `totalEquity`,
  `availableAmount` and `initialMarginRequirement`.
- **Two spellings are read.** edgeX's account page writes `availableAmount`,
  `liquidatePrice` and `unrealizePnl`; its Go SDK writes `availableBalance`,
  `liquidationPrice` and `unrealizedPnl`. No real account has been read yet, so
  both are read. Once Tyler's account answers, the spelling it does not carry
  should be cut.
- **The side is the sign of `openSize`.** Negative is short.
- **Leverage is read, never assumed**: the position's own figure, then what the
  account set for that contract, then the account default, then the
  contract's default.
- **Liquidation price is edgeX's own.**
- **Margin mode is not claimed.** edgeX's account page shows no margin mode on
  a position, so the row shows none rather than calling it cross.
- **One read every two seconds per account, longer while the private socket
  vouches for it.** Two minutes is the ceiling.

## Orders

- **A resting order** is a LIMIT with GOOD_TIL_CANCEL, or POST_ONLY when it
  must rest or be refused.
- **A market order is a LIMIT with IMMEDIATE_OR_CANCEL, capped 3% through the
  price.** Never edgeX's own MARKET type (Tyler, 5 Sep 2026). A BTC buy at
  $84,000 goes out capped at $86,520.
- **Sizes snap down to the step and prices to the tick.** A cap never rounds
  past itself: a buy's rounds down, a sell's up.
- **The smallest order is refused in dollars before sending**: "edgeX's smallest
  BTC order is 0.001 BTC, about $84.00 at this price."
- **A closed stock market is refused before sending**, in the closed-market
  sentence.
- **Two ids.** The app's client order id goes in as `trade-` and the rest of the
  id; edgeX's own order id comes back and is what the app stores, cancels and
  looks up by.
- **No amend.** Moving an order cancels it and places a new one. If the new one
  is refused, the sentence says the old one came off and nothing replaced it.
- **A cancel is read per order.** edgeX answers SUCCESS for the request and a
  result per order inside it, so an order that already filled is said to be
  gone rather than cancelled.
- **Close** is a reduce-only IOC for the whole size at the 3% cap.
- **Read back, not trusted.** edgeX answers a new order with its id alone, so
  the app reads it back: once for a resting order, and until it is filled or
  cancelled (about three seconds at most) for an IOC one.
- **A refused order signature is signed once more.** A refused order was never
  placed, so sending it again cannot double it.
- **Both real-money switches** are checked on every change to an account.

## Stops and targets

- **edgeX holds them.** A stop is a STOP_MARKET and a target a
  TAKE_PROFIT_MARKET, reduce-only, triggered on the oracle price, which equalled
  the mark on every contract. They fire with the app off.
- **Price "0", worst price in the signature.** As edgeX's SDK sends one: the
  order's price is 0 and its signature carries a worst price of one tick for a
  sell and ten times the price for a buy.
- **Whole position or a fixed size.** A stop for the whole position carries
  `isPositionTpsl`; a grid's own stop is a fixed size.
- **Never uncovered.** A moved stop is placed first, confirmed in the open
  orders, and only then is the old one cancelled, with any leftover guard on that
  contract. If the place fails the old stop stands and the sentence says so. If
  an old one will not cancel, the sentence names it.
- **Clearing every guard needs no price.**
- **The wrong side is refused in one sentence**: "A long position's stop has to
  sit below the price, which is 84000 now."
- **An entry can carry its own stop and target** as edgeX's `openSl` and
  `openTp`, each signed separately. edgeX's SDK shows these fields and not their
  meaning, so this shape is unproven until a real order carries one.

## Leverage and margin

- **Leverage** is `POST /api/v2/private/account/updateLeverageSetting` for the
  contract, set before the first order on it and read back from the account. A
  leverage past the market's ceiling is refused first. edgeX refuses the change
  while the contract has open orders (`ACCOUNT_UPDATE_LEVERAGE_FAILED_ORDER`,
  seen in its SDK's tests).
- **Margin cannot be moved.** edgeX's docs list no call that adds cash to, or
  takes it back from, one position (checked 24 Sep 2026), so the margin control
  says so.
- **Margin mode is never changed.** edgeX can switch a contract between cross
  and isolated with a signed `setMarginMode`, but Trade has no margin-mode
  control for any exchange except Aster, so nothing sends it.

## Fills

- **Pushed over the private socket**, `/api/v1/private/ws?accountId=…&timestamp=…`,
  signed in by the socket's opening request carrying the same four headers a
  private REST request carries. edgeX answers `connected`, a `Snapshot` of the
  account, then an `ORDER_UPDATE` whenever an order changes. Node's own
  WebSocket sends those headers; checked against a local server.
- **Each fill is a Journal row keyed by edgeX's own fill id.** A fill pushed and
  then read back in a recovery is one row.
- **Profit is `realizePnl` with the fee put back.** edgeX folds the fee into it:
  its docs show an opening fill with a fee of $0.01754 and `realizePnl` of
  -$0.01754. Every other venue here keeps the fee apart, so an opening fill banks
  $0 and its fee is $0.01754.
- **A push without profit is read back.** edgeX's socket example leaves
  `realizePnl` out, so a pushed fill without it is looked up on the fill page by
  its order id, one request, before it becomes a row. A fill the page does not
  have yet makes no row, and the recovery read catches it. Whether the real push
  carries the profit is not known until Tyler's first fill.
- **Recovery** reads the fill page at start, after a gap and on the shared
  schedule, 100 rows a page.
- **One line per account**, never one per reader.

Refusals are in `edgex-refusals.md`.

## Settings

`TRADE_EDGEX_REST` (default `https://edgex-prod-v2.edgex.exchange`) and
`TRADE_EDGEX_WS` (default `wss://edgex-quote-prod-v2.edgex.exchange`) replace
the server's addresses. The browser always opens edgeX's published quote host,
because it cannot read a server setting. Only the `edgex/` folders may name an
edgeX address; `fence.test.ts` fails otherwise.

## Mainnet only

edgeX's practice network redirects to a staff-only login, so Tyler decided on
5 Sep 2026 to carry mainnet only. The first order is one tiny real order he
places himself.

## How to check it

The steps marked "real values" need Tyler's edgeX account.

1. Open `/protocols/edgex?market=edgex%3Amainnet%3ABTCUSDC`. The chart draws
   BTC-USDC at 100x with a live price line.
2. Open the market picker. The footer counts crypto, stock and commodity
   markets. Search "SPY" and "XAU".
3. Switch through 1m to 1d on SPY. Each draws, and the working candle moves.
4. On BTC's daily chart, drag right until the bars end. They go back into 2020
   through Binance.
5. Leave the page for more than five seconds in another tab and come back.
   Prices move again within about a second.
6. Add wallet, Real edgeX, made-up values: refused with "edgeX did not accept
   this API key", and nothing saved.
7. Real values: the wallet saves and reads Connected. The card's worth, free and
   open profit match edgeX's own page. If they do not, the account answer's
   field names are the first thing to check (see "Two spellings are read").
8. Real values, real-money switches off: an order is refused with the switch
   sentence and nothing reaches edgeX.
9. Real values, switches on, one tiny order Tyler sizes: it rests on edgeX's
   page, moves when dragged, cancels when deleted; Close closes it; a stop
   dragged never leaves edgeX showing none; the fill reaches the Journal with
   its fee within a second.
10. `npx vitest run src/server/protocols/edgex src/lib/protocols/edgex` runs the
    saved-answer tests.
