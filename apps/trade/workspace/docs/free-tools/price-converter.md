# Price converter

`/tools/convert` turns coins into US dollars and dollars into coins at
Hyperliquid's live price. 0.5 BTC at $64,000 is $32,000.00, and $1,000 at
$150 buys 6.666667 SOL. It opens without an account, and every coin Hyperliquid
lists has its own page, such as `/tools/convert/btc-usd`.

## Where the price comes from

- **One exchange, Hyperliquid.** Every price on the page is Hyperliquid's, and
  the page says so beside the price. Other exchanges are not mixed in.
- **The socket, not a question.** Hyperliquid pushes every coin's price to the
  server about once a second over one open line
  (`src/server/protocols/hyperliquid/live-prices.ts`). The converter reads
  that line's latest prices, so no visitor makes the server ask Hyperliquid
  for a price.
- **The website keeps its own line.** The website and the trading engine run
  as two separate programs, so the website cannot read the engine's copy. The
  first visitor after the website starts opens the website's line, and it
  stays open for every visitor after that. The first visitor waits up to three
  seconds for the first prices to arrive.
- **Prices are never saved to the database.** Tyler, 25 Sep 2026: "It
  doesn't need to save the price to the db because it's not like people need
  repeated conversion." The trading engine does not write its prices anywhere
  for the website to read. The website's own line is the whole arrangement.
- **The coin list.** The list of coins and each coin's trading over the last
  day come from Hyperliquid's market list, which the server keeps for a minute
  and shares with the trading screens (`loadRawMarketCatalog`). Reading it is
  at most one request a minute, however many visitors come.
- **Coins only.** Markets that other groups run on Hyperliquid, such as stocks
  and indexes, are left out, because they are not coins and some share a
  coin's name.

The code is in `src/server/free-tools/price-converter.ts`, and the maths in
`src/lib/free-tools/price-converter.ts`.

## How old the price can be

- **The age shown** is how long ago Hyperliquid last sent prices, counted on
  from when the page arrived. On a healthy line it reads 1 to 4 seconds.
- **Old after a minute.** A price read more than a minute ago says "Old
  price." in words beside the age.
- **The page does not refresh itself.** A visitor who leaves the page open
  sees the age climb, and the Refresh price button reads the server's copy
  again. Refresh price never reaches Hyperliquid.
- **A quiet line.** If Hyperliquid goes quiet for 8 seconds, the server drops
  the line and reconnects. The last prices are kept meanwhile, so the page
  shows them with their true, growing age.
- **No price at all.** A coin Hyperliquid has not sent a price for shows a
  dash in the answer box and says there is no answer. If the line has sent
  nothing since the website started, the page says "no price received yet".

## The form

- **Coin.** Every Hyperliquid coin, busiest first. Picking one opens that
  coin's page.
- **Amount.** Coins or dollars, from 0 to 1,000,000,000, with decimals and
  thousands commas. A number outside that is marked, and leaving the box says
  what is allowed. The answer keeps the last number that fit.
- **Swap.** The button between the boxes swaps which one you type in. The
  answer becomes the typed amount, so 0.5 BTC = $41,831 swaps to $41,831 =
  0.5 BTC.
- **Dollars in the answer** keep their cents from $1 up and show five
  significant digits below $1, so $0.018342 does not read "$0.02". Coins show
  up to six decimals.
- **k-coins.** A coin whose name starts with a small k, such as kPEPE, is a
  thousand of that coin on Hyperliquid. The page says so under the answer.

## The coin pages and search engines

- **Address.** `/tools/convert/<coin>-usd`, with the coin in small letters.
  Capitals in the address still work. A coin Hyperliquid does not list is
  "not found".
- **Which coins get listed in search.** A coin that traded at least $1,000,000
  over the last day is in the sitemap. Every other coin's page still works but
  asks search engines not to list it, because a pile of near-empty pages
  drags the whole site down in search. On 25 Sep 2026 that was 88 coins listed
  and 90 not. The line is `OWN_PAGE_MIN_VOLUME_USD`.
- **The sitemap.** `/tools/convert` is in the sitemap through its page
  declaration, `src/routes/tools_.convert.page.ts`. The coin pages go in
  through the app's sitemap option in `src/app/server-options.ts`. If
  Hyperliquid cannot send its list, the coin pages are left out and the rest of
  the sitemap still loads.
- **Title and share preview.** `/tools/convert` uses the declaration's name. A
  coin page says "BTC to USD converter" through `freeToolHead`.

## Switching it off

The Price converter row on the Pages dashboard covers `/tools/convert` and
every coin page. Switched off, all of them are "not found" and none are in the
sitemap.

## When it cannot load

If Hyperliquid does not send its coin list, the page says "Hyperliquid did not
send its list of coins. Try again in a minute." with a Try again button. A
failed Refresh price shows the same sentence as an error message and leaves
the page as it was.

## Not built

Coin to coin, and currencies other than US dollars.
