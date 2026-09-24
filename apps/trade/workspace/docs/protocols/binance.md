# Binance

Trade reads Binance's USDⓈ-M futures for charts and backtests, and can trade
them from a Binance account with an API key. Trading was built on 24 Sep 2026
and has not yet placed a real order. Everything below marked "unproven" waits
for the first signed read on a real key.

## Who may trade Binance futures

Binance does not let Canadian customers open futures trades.

- **What Binance announced:** On 12 May 2023 Binance said it was leaving
  Canada. It emailed Canadian customers to close their open positions by
  30 September 2023. From 1 October 2023 their accounts went into
  "liquidation only mode", which means they can close positions but never
  open one.
- **Who the rule covers:** Binance applied the rule to its Canadian
  customers, meaning the accounts it knows as Canadian. Whether Binance also
  blocks by the internet address a request comes from is unproven. Only a
  signed request would show it.
- **What Tyler said (24 Sep 2026):** he holds a Binance account that can open
  USD-M futures trades today. That answer is why the trading work went ahead.
- **What Binance answers when it says no:** -4087 means the account may only
  close positions. -4402 means futures are not offered in the account's
  region. Both show as sentences (`refusals.ts`), and -4087's sentence names
  Canada as the usual reason.
- **What a keyless check from Canada showed (24 Sep 2026):** the public
  futures server answered, and every account read without a key was refused
  the way any keyless request is.

## Markets

- **Which markets:** every perpetual that settles in USDT and is trading. That
  was 527 on 24 Sep 2026. A few markets with Chinese names are left out,
  because their names cannot be written in a web address or an order here.
- **Market ids are coin names:** `BTC` is `BTCUSDT` and `kPEPE` is
  `1000PEPEUSDT`. Saved backtests and stored candles used those names before
  trading existed, so the order code converts them instead of the ids changing.
- **Trading rules come from Binance's market list:** the price step, the size
  step, the smallest size and the smallest order. The smallest order on
  24 Sep 2026 was $50 on BTC, $20 on ETH and $5 on most coins.
- **The price band:** a limit order must sit near the mark price. BTC's band
  was 95% to 105% of the mark. An immediate order stays inside it.
- **Top leverage is per account:** Binance only states it through a signed
  read, so it appears once a wallet is connected.

## Live prices

- **The socket:** marks, daily figures and candles come from
  `wss://fstream.binance.com/market/ws`. Binance split its sockets by kind on
  23 Apr 2026. On 24 Sep 2026 the old `/ws` address still accepted a
  subscription and then sent nothing.
- **The engine's feed:** the server keeps one socket of every mark, pushed
  once a second. If it goes quiet for 12 seconds it counts as down.
- **The chart's feed:** the browser opens the same address for the open
  chart's candle and the market list's figures. 214 messages arrived in about
  16 seconds on 24 Sep 2026.

## Signing in

- **What the window asks for:** the API Key and the Secret Key from Binance's
  API Management page. The key must be the ordinary kind Binance calls
  system-generated (HMAC). Ed25519 and RSA keys sign differently and are not
  accepted.
- **What is checked before saving:** first the key's own permissions. A key
  without Enable Futures is refused. Next, the account's position mode.
  Hedge Mode is refused, because Trade holds one direction per coin. Last, the
  futures account itself is read. Nothing is saved unless all three pass.
- **What is shown afterwards:** the wallet card shows One-way from that check.
  Each position shows cross or isolated as Binance reports it. A key with
  Enable Withdrawals on is flagged as able to withdraw.
- **A made-up key:** Binance's spot host answers -2008, "Invalid Api-Key ID".
  The window then says the key was not accepted. Checked in the browser on
  24 Sep 2026.

## Orders

- **No market orders:** an immediate buy is a limit order at most 3% above the
  mark, and it is cancelled if it cannot fill at once. A sell is the same
  below. If none of it fills, Trade says nothing was bought or sold.
- **Leverage:** read from Binance before each opening order, and set only when
  it differs.
- **Margin mode:** Trade never changes cross or isolated on Binance. It trades
  in whatever mode each market is already set to.
- **Moving an order:** Binance's amend keeps the same order id.
- **Closing:** a reduce-only order at most 3% through the mark. Once the
  position is flat, its stops and targets come off too. If one will not come
  off, the message says the position closed and names the leftover order to
  cancel on Binance, because a leftover target could open a new position.
- **Adding or taking margin:** works on isolated positions only. Binance
  refuses a cross position in its own words.

## Stops and targets

- **Where they live:** since 9 Dec 2025, Binance keeps every stop and target
  on a separate stop-order service with its own ids. Trade writes those ids as
  `algo:<id>`, so a cancel or a lookup knows which service to ask.
- **What a stop looks like:** it fires on the mark price. A stop with no size
  closes the whole position, however big it has grown. A target or a sized
  stop sells a fixed number of coins and can only reduce the position.
- **How they are replaced:** the new ones go on before the old ones come off,
  so a position is never without its stop. If Binance refuses a new one, the
  old one stays and the message says so.
- **Unproven:** Binance may allow only one whole-position stop per direction.
  If it does, putting a new stop on before the old one comes off will be
  refused. The old stop would still be on, but moving a stop would not work.
  Check this on the first real stop move.

## Fills

- **Pushed:** a listen key opens Binance's private account stream, renewed
  every 30 minutes. A fill arrives as it happens and goes to the Journal
  through the shared fill path. The address is the one Binance's own SDK uses,
  `/private/stream?streams=<listen key>`. **Unproven:** a made-up key opened
  and stayed silent, so only a real key shows messages arrive.
- **A stop that fired:** the stream says which plain order the stop became, so
  that fill is named as the stop. Without the stream, Binance's stop history
  is searched for the order.
- **The safety net:** the REST read of past trades runs at start, after any
  gap and when a fill could not be read. Binance answers it one coin and seven
  days at a time.
- **Which coins the safety net asks about:** every coin in the account's money
  history since the gap began, since every fee Binance charges writes a row
  there. Without that, a coin whose position closed while the server was down
  would never be asked about after a restart. The read costs 30 request units
  and runs at most once a minute.
- **Profit per sale:** every Binance fill states its own realised profit.

## Request limits

- **The allowance:** 2,400 request units a minute per internet address. Orders
  count separately, at 1,200 a minute and 300 per ten seconds. Both were read
  from Binance's market list on 24 Sep 2026.
- **Near the limit:** every answer says how much of the minute is spent. The
  backtest's candle reads share that allowance. Past 2,000, background reads
  wait for the next minute and orders still go through.
- **When Binance says slow down:** a 429 or a 418 on the futures host stops
  every Binance request for as long as Binance says. A 418 means the address
  is blocked. The spot host, asked only for a key's permissions every five
  minutes, has its own allowance, so its refusal pauses nothing else.
- **The clock:** Binance refuses a request stamped more than a second ahead of
  its clock. Trade measures Binance's clock and sends a refused request once
  more on a fresh reading. It never resends anything else.

## How to check it

- **Tests:** `npx vitest run src/server/protocols/binance/
  src/lib/protocols/binance/` and `npx vitest run
  src/server/protocols/fence.test.ts src/server/protocols/registry.test.ts
  src/server/protocols/order-values.test.ts`.
- **Page:** `/protocols/binance`.
- **The first real walk:** add the wallet, place the smallest order, set a
  stop, move it, cancel, close. Read the console and the network tab on every
  step. Both real-money switches must be on.
