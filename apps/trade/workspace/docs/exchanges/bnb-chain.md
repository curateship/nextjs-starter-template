# BNB Chain

BNB Chain lists priced coins, draws charts and supports adding and making
wallets. Wallet cards read holdings. KyberSwap buys and sells use USDT, with BNB
reserved for network fees.

- **Where to open it:** `/admin/bnb` uses the shared exchange page and wallet
  controls. BNB Chain appears in the protocol list. The sidebar link is managed
  in Settings and is not added by code.
- **Wallet rule:** keep in this wallet only what you mean to trade. The private
  key controls the coins. The app accepts 64 hexadecimal characters with an
  optional `0x` prefix and checks that the key derives the pasted address.
  Address casing does not affect the match. Invalid keys and mismatched pairs
  are refused before saving.
- **Making a wallet:** the server generates and encrypts the private key using
  the existing wallet store. The browser receives the address only. A wallet
  has no key expiry. Its row shows the connected balance after the chain answers.
- **Network:** mainnet only, chain id 56. BNB Chain has a practice network, but
  the selected swap router does not support the practice workflow in this app.
  A pasted testnet selection cannot create a BNB wallet.
- **Node setting:** `TRADE_BNB_RPC` in `.env` defaults to
  `https://bsc-dataseed.binance.org`. The node reads balances. Adding and making wallets require a successful
  balance read before saving. The same node receives signed swaps.
- **Trading:** USDT is the purchase coin and BNB pays network fees.
  KyberSwap finds routes through liquidity pools. Trading buys and owns
  coins outright, without leverage, short positions, funding or liquidation.
- **Service limits:** the client allows KyberSwap 30 requests per ten seconds,
  with ten reserved for orders. GeckoTerminal gets 30 requests per minute and
  DexScreener gets 300. Each process owns its own counters. Full windows refuse
  immediately with the service name and count.
- **Request failures:** service reads time out after 15 seconds. GeckoTerminal
  pauses after its first 429 for at least one minute, or the longer time in
  Retry-After. New pool and candle requests fail locally during that pause.
  Other services retry a 429 once after a wait capped at five seconds. Signed
  transactions must not use this retrying read helper.
- **Code boundaries:** wallet signing and service addresses stay inside
  `server/protocols/bnb/`. Transaction storage uses migration 0172, applied on
  8 Sep 2026. Task 07 adds no package or migration.

Wallet generation follows the existing viem library's
[private-key account API](https://viem.sh/docs/accounts/local/privateKeyToAccount).

## Testing road map

1. Open `/admin/bnb` on the running Trade app. Expect BNB Chain and the wallet
   control, with priced markets and Buy and Sell controls.
2. Open Add wallet, select Real and make an unfunded wallet. Expect its address
   with Copy, and no displayed private key. Close the window and reload.
   Expect the wallet to remain saved with "Connected" and $0.00.
3. Add an unfunded wallet using a matching address and private key. Expect a
   saved wallet. Try a mismatched pair and expect a sentence naming the address
   the key opens. The refused wallet must not appear in the list.
4. Try malformed and empty keys. Expect validation with the entered fields
   preserved. Confirm the wallet dialog offers no practice network.
5. Check narrow and desktop layouts, keyboard controls and the browser console.
   Do not fund a wallet or place a real order for this task.
6. Run focused BNB client and wallet tests, protocol contracts, registry and
   fence tests, plus the wallet-store regression tests. Run the app TypeScript
   check and distinguish baseline errors from new errors.


## Markets from pool lists

The market list joins coins by their lowercase contract address. A ticker is
only a display name, so two coins called BTR remain separate markets.

- **Source list:** PancakeSwap's extended list supplies token names, decimals
  and the vetted list. A successful read lasts one hour. GeckoTerminal adds
  tokens from the busiest pools, including coins outside that list.
- **Pool discovery:** two pages per rolling minute, rotating pages 1 through
  10. The first load covers up to forty pools. Five successful rounds cover up
  to 200, then rotation refreshes each page about every five minutes while the
  list is requested. A failed page keeps its previous data. Retries count
  against the same two-request ceiling.
- **Prices:** DexScreener prices batches of at most thirty addresses. Each
  coin uses the base-token pair with the most dollar liquidity. Price, daily
  move, volume, liquidity and pool address all come from that pair. Quote-token
  prices are never mistaken for base-token prices. USDT is excluded, unpriced
  coins are omitted and WBNB displays as BNB.
- **Displayed information:** the picker uses the existing search, sort and
  caution badges. The market information tooltip shows BNB Chain, Mainnet and
  pool liquidity. Decimals stay unknown for a search-only coin when neither
  metadata source reports them. No decimal count is guessed.
- **Refresh and failures:** concurrent requests share one list build. The
  catalogue lasts one minute. A failed refresh keeps the last good list.
  A cold failure names the failed service through `MARKETS_UNAVAILABLE`.
  Current-price reads ask DexScreener separately and never fall back to the list.
- **Search:** the existing Find button asks DexScreener by name or address,
  keeps only BNB results, and requests GoPlus checks immediately. An exact
  address query cannot return a different same-name coin. Found tokens join
  the browser session and the server's bounded one-hour discovery cache.
- **Risk labels:** a honeypot or sell tax above ten out of 100 is Suspicious,
  even if PancakeSwap lists the coin. Other coins stay Unverified until both
  the vetted list and a complete recent GoPlus answer support removing the
  badge. No risk label hides a coin. Buy refusal belongs to task 06.

## GoPlus differs from the task's batch assumption

Two live requests on 8 Sep 2026 supplied the same two addresses in reverse
order. Each answer contained only the first address. Later requests returned
`code: 4029`, meaning too many requests, despite HTTP success.

- **Individual checks:** the free endpoint is asked about one address at a
  time. The background scan attempts at most 25 per minute, spaced 2.1 seconds
  apart. Five of the local thirty-request allowance remain available for
  searches. A refused scan stops until the next catalogue refresh.
- **First visit:** most coins initially show Unverified. A healthy service can
  check about 800 priced coins in 32 active minutes. Checks are cached for an
  hour. Provider refusals can extend that time; there is no claim of full
  hourly coverage when the service refuses requests.
- **Safety during failure:** missing or incomplete answers never count as a
  completed check. Expired clean checks become Unverified when rows rebuild.
  Known suspicious results remain visible when later data is unavailable.
- **No waiting screen:** the risk scan runs after prices are ready. The market
  list does not wait for the full security scan.

Provider references are the [DexScreener API](https://docs.dexscreener.com/api/reference),
[GeckoTerminal API](https://api.geckoterminal.com/docs/index.html) and
[GoPlus token security API](https://docs.gopluslabs.io/reference/tokensecurityusingget_1).

## Validation measurements

- **Live data:** a validation read returned 791 priced coins from the 980-token
  BNB source list plus the first two pool pages. It used one PancakeSwap read,
  two GeckoTerminal reads and 33 DexScreener reads. These counters belong to
  each server process, not to the browser's network tab.
- **Filtering:** the browser initially showed 88 coins above the saved volume
  cutoff. Later pool pages changed the visible count. The source count and
  filtered count are intentionally different.
- **Desktop browser:** selected CAKE, sorted by volume, found BabyDoge through
  the external lookup and selected the returned address. The information
  tooltip showed Mainnet and $6.41k of liquidity for that selected pool.
  No JavaScript errors, console errors or non-cancelled request failures appeared.
- **Narrow browser:** existing header controls overlapped the market picker at
  390 pixels. The narrow click path remains unverified. The hidden side panel
  also resisted opening in the saved desktop layout, so the populated picker
  was reached through a direct CAKE market link.
- **Fixtures:** token metadata, pool metadata, pair statistics and a clean
  GoPlus answer were saved from live responses. Honeypot and tax boundary
  cases explicitly modify those saved shapes; they are not claimed as live
  scam detections. Rotation and request ceilings use a controlled clock.

To repeat the market check, open `/admin/bnb` and choose a market. If the saved
layout hides the list, open
`/admin/bnb?market=bnb%3Amainnet%3A0x0e09fabb73bd3ade0a17ecc321fd13a19e81ce82`.
Use the market-name picker to sort and search. Enter a name absent from the
filtered list and press Find. Expect separate address-based results and
Unverified or Suspicious badges where applicable. Select a result and open its
information tooltip to see liquidity. Holdings and swaps are later work;
no funded wallet is needed.

## Prices on a clock

BNB screen prices refresh ten seconds after the previous request finishes.
The existing screen refresh chooses up to 300 markets by daily volume.
Hidden tabs skip requests. Failed requests preserve the displayed figures.
Only price changes during these turns; daily change and volume keep the
catalogue's values. There is no stale-price label.

- **Allowance:** thirty addresses per DexScreener request means at most ten
  calls per turn, sixty per minute. Adding the measured 33-call catalogue
  build gives 93 of 300 requests. Retries, searches, other tabs and engine
  reads share each process's rolling allowance. Separate processes have
  separate counters, so this is not a deployment-wide quota guarantee.
- **Browser requests:** each turn sends one authenticated server-function
  request. The server makes up to ten provider calls. A filtered catalogue
  with fewer than 300 markets uses fewer pages.
- **Engine reads:** `markets.prices` asks for current pairs directly, without
  loading the catalogue. Identical thirty-address pages share concurrent
  requests and answers requested less than two seconds ago. Failed pages
  are removed from that cache. A failed page rejects the whole price read.
  Missing prices stay absent; an old catalogue price is never substituted.
- **Live feed:** the registry has no BNB `livePrices` adapter and the engine
  heartbeat does not use this screen timer. A future pushed feed would need
  chain websocket events and prices across pools. That work is not built.

To check the clock, open CAKE in the market picker and watch Last price.
Keep the page visible for several turns, then hide the tab for thirty seconds.
Expect refresh requests while visible, none starting while hidden, and requests
resuming when visible again. A previously started request can still finish.
In browser developer tools, count the price-refresh server function, not every
background request. Compare CAKE with the most liquid DexScreener base-token
pair. An unchanged provider price should remain unchanged on screen.


The local clock check observed four successful browser requests about 10.5
seconds apart, each requesting the 106 markets in the filtered catalogue.
That request size needs four server-side provider pages, below the ten-page
maximum. CAKE's provider answer stayed at $2.30 during the observation.
A controlled browser response changed CAKE to $2.345 and the picker displayed
$2.345. This proves the display path, not a measured natural CAKE price move.
A simulated hidden document made no refresh requests for 25 seconds and
resumed when restored to visible. No application errors appeared during those
checks. A later attempt to inject a failed browser response hit a Playwright
route-handling error, so browser failure coverage was not completed. The
focused rendered-component tests cover failed turns and recovery on both BNB
and Solana.

Task 03 validation passed targeted lint and 61 focused tests. Its root
TypeScript command did not check the app. Task 04 used `tsconfig.app.json`
and confirmed the existing eight diagnostics without new errors.
The remaining protocol fence failure names the pre-existing direct protocol
comparison in `server/trade/live-orders.ts`. No BNB code crosses that boundary.
The combined changes are not ready to commit while that check fails. No commit,
migration or deployment was performed for this task.

## Charts

BNB charts use the existing chart panel, timeframe picker and candle store.
There is no separate BNB chart interface.

- **Pool candles:** GeckoTerminal supplies dollar prices for the requested
  contract in its most liquid DexScreener base-token pool. The reader uses
  the pool address saved on the market row. A search result not yet in the
  catalogue resolves its pool directly. All six existing timeframes work.
  Responses are validated, sorted and restricted to the requested window.
  Missing pools return no bars. Rate limits and malformed responses remain
  errors rather than pretending that history does not exist.
- **Stored history:** `storesVenueCandles` makes the chart fill missing store
  coverage before reading recent pool bars. Repeat opens read covered rows.
  Complete pool candles replace recorded snapshots at the same timestamp.
  Only closed candles are fetched and stored. Concurrent older-history fills
  share work, and failed fills preserve successful pages for the next attempt.
- **Depth and cost:** the public pool endpoint returned 184 daily candles
  during validation. New fetches stop at that measured retention boundary;
  previously stored older rows remain readable within the chart's limits.
  Four-hour and daily charts need roughly one to three calls on a cold open.
  Faster charts keep the existing 20,000-bar limit and can need up to twenty
  historical pages, plus the recent slice. Six months of minute bars cannot
  fit in three 1,000-bar calls. All calls share the thirty-request rolling
  GeckoTerminal allowance, including pool discovery and retries. A partial
  fill shows the existing retry message and keeps stored bars.
- **Borrowing:** `lib/protocols/bnb/history.ts` pins contract addresses checked
  against PancakeSwap's extended list, unique vetted tickers, active Binance
  USDT perpetuals and pool liquidity above $200,000. The saved evidence lives
  beside that list. CAKE and wrapped BNB qualify. The server confirms the
  Binance listing again before borrowing. The header says "History from
  Binance" while the recent slice remains the pool's own history.
- **Unsupported Binance names:** the app's existing Binance adapter only
  accepts Latin alphanumeric tickers. Non-Latin matches remain unpinned and
  use their pool history. Ticker duplicates also remain unpinned.
- **Recorded fallback:** markets without a borrowed source continue recording
  one-minute screen prices through the task 03 refresh. When no pool candles
  exist, those stored minutes draw the chart. Unwatched minutes are gaps,
  and recorded volume is zero. Pool candle volume is the provider's dollar
  volume. Recorded minutes are not invented into larger-timeframe bars.
- **Empty charts:** "No candles here yet" appears only after the older-bars
  request reports. The existing loading behavior already handles BNB.
- **Backtests:** BNB remains excluded through `recordsOwnBars`, even though
  the chart can now fetch pool candles. No schema migration is required.

To test charts, open CAKE at four hours and expect "History from Binance".
Scroll back to see years of bars. Choose BTR at contract
`0xfed13d0c40790220fbde712987079eda1ed75c51` and expect pool candles without the
Binance label. Switch between four hours and one day, then reopen each chart.
Expect stored history to return without fetching the same completed windows.
For a coin with no pool history, select one minute and leave the page visible.
After a minute closes, reload and expect recorded bars if the coin was included
in the price refresh. A coin with neither source should show the empty sentence.


Chart validation on 8 Sep 2026 opened CAKE with 6,247 four-hour Binance bars
back to November 2023. BTR at `0xfed13d0c40790220fbde712987079eda1ed75c51`
returned 1,103 four-hour pool bars and 183 daily bars, reaching March 2026.
The other BTR contract, `0x5a16e8ce8ca316407c6e6307095dc9540a8d62b3`, also
returned pool history. Solana JUP and Hyperliquid BTC still drew charts with
their existing labels. No application errors appeared on those successful
chart checks. The naturally recorded-only case was proved in database tests;
the rendered chart test proves the empty sentence waits for older history.
A naturally history-free coin was not identified in the browser session.

The chart audit also found that the screen price request exceeded the server's
URL limit. A 300-entry GET produced a 24,952-character URL and HTTP 431.
The same request now uses an authenticated, origin-checked POST. A live check
with 300 distinct token addresses returned 240 prices without an error.
The missing prices were absent from the provider response, not filled with
old catalogue prices. This transport change also applies to Solana's screen
refresh. It keeps the same reader, limits and two-second cache.


The final chart checks passed 120 focused tests and targeted lint. The app
TypeScript check matched its eight baseline errors exactly. The existing
protocol fence failure in `server/trade/live-orders.ts` also remains, so the
combined changes are not ready to commit. No commit or deployment was made.
Chart validation used the existing configured candle database and required
no schema migration.


## GeckoTerminal refusals

A live check reproduced HTTP 429 while investigating the chart error.
The previous reader retried after a short delay, then let the refusal prevent
first paint even when cached or borrowed history was available. The raw
provider sentence also occupied the error formatter's service-name field,
producing the repeated "would not answer" wording.

GeckoTerminal now pauses requests after the first 429. The pause lasts at least
one minute and honors a longer numeric or HTTP-date Retry-After value. Missing
or invalid headers use one minute. The pause is shared by pool discovery and
candle reads in the process. It does not control other processes sharing the
provider's allowance and cannot make the provider resume service.

If recent pool coverage cannot refresh, the chart can still paint its stored
rows or start loading its borrowed history. A cold market without either keeps
an explicit error. Older pool fills still report partial coverage and offer a
retry. Refusal details remain separate from the service name in that error.
The local browser check opened CAKE at one minute with a drawn chart and no
console errors. Controlled database tests prove behavior during refusals;
the browser check alone does not prove GeckoTerminal was refusing at that moment.


## Wallet holdings

The wallet card reads USDT as free money and values every priced holding.

- **Chain read:** `server/protocols/bnb/account.ts` sends one `eth_call` to
  Multicall3 for native BNB and each known token's balance and decimals.
  The card and positions share a read for two seconds. Slow requests stay
  shared until they finish. Failed reads also wait out the two-second window.
  No private key is decrypted for this read.
- **Token list:** USDT, USDC and WBNB are always included. Market-list coins,
  picker discoveries and the wallet's historical buys join that list.
  A cold server loads the catalogue before its first balance read.
  Historical buys come from `trade_live_fills`, scoped by owner and wallet.
  Hiding a journal row does not hide its token from the balance reader.
- **Discovery limit:** an outside transfer of a token absent from every list
  stays unseen until the picker finds it. Picker discoveries live in the
  server's session cache, which expires after an hour or a server restart.
  Tokens bought here remain discoverable from their saved fills.
- **Units:** the chain supplies decimals in the same call. BNB Chain USDT
  and USDC both have 18 decimals. Missing balances or decimals for a positive
  holding refuse the read rather than returning an understated wallet.
- **Worth:** equity is USDT plus every priced coin. Free is USDT. In trades
  is the coins' value. A priced holding below $0.01 still counts toward worth,
  but has no position row. Unpriced positive balances keep an Unpriced row.
- **Prices:** listed coins use the catalogue price. Held coins absent from
  the priced catalogue are requested in pages of thirty, cached ten seconds.
  A provider failure is a failed wallet read. A successful response without
  a price means Unpriced.
- **BNB:** native BNB and WBNB share one Owned position. Only native BNB pays
  fees and appears in the card's BNB for fees amount. Below 0.005 native BNB,
  the amber sentence requests BNB. The reserve is 0.00025 times twenty
  transactions. Exactly 0.005 clears the warning.
- **Entry and profit:** Owned rows have no margin or liquidation price.
  Entries remain unknown, as in Solana. Swap receipts supply executions,
  but reconstructing the remaining holding's cost is a separate history task.
  The chain supplies balances rather than lifetime purchase history. `profitPerSale` is false.
- **References:** the [Multicall3 contract](https://www.multicall3.com/)
  defines the batch format. The [PancakeSwap token list](https://tokens.pancakeswap.finance/pancakeswap-extended.json)
  independently confirms the stablecoin addresses and decimals.

### Holdings checks

1. Open BNB Chain, then Wallets. Make a fresh Real wallet. Expect Connected,
   $0.00 and an empty Positions list. Open its details and expect 0 BNB for
   fees with the amber request for at least 0.005 BNB. Reload and check again.
2. On an existing funded wallet, compare the USDT and token amounts with
   BscScan at the same block. Free equals USDT. Worth also includes USDC and
   every other priced holding. Explorer dollar prices may differ from
   DexScreener, so compare amounts first and use the app's prices for dollars.
3. Confirm positive holdings show Owned, with dashes for margin, liquidation
   and unknown entry profit. A token with no pair should say Unpriced.
4. Check a wallet holding WBNB but under 0.005 native BNB. The warning must
   remain. WBNB alone cannot clear the fee warning.
5. Run `pnpm exec vitest run src/server/protocols/bnb/account.test.ts
   src/server/protocols/registry.test.ts` for decoding, valuation, ownership,
   request sharing and price-page checks. The saved Multicall answer is real;
   zero, dust, unavailable-price and failure scenarios are explicit test data.


Verified locally on 8 Sep 2026 with the existing server on port 3014.

- **Real data:** `account.fixture.json` saves one public exchange wallet's
  raw Multicall3 request and answer. Tests check USDT, USDC, CAKE and
  native plus wrapped BNB amounts. Synthetic scenarios cover unavailable
  prices, dust, zero balances, six-decimal tokens and refused responses.
- **Browser:** created the unfunded wallet "BNB holdings check" at
  `0xcB0F61027FadAadead7d13baCF7bFE3939D23783`. The wallet remains saved.
  Connected, $0.00, an empty Positions list and the native-BNB warning were
  visible before and after reload. No private key appeared.
- **Layout and errors:** the wallet details measured 390 pixels wide in a
  390-pixel viewport, with no internal horizontal overflow. Escape closed
  the window. There were no browser JavaScript errors. Navigation cancelled
  background requests, and one unrelated Hyperliquid coin image was blocked.
- **Limits of the check:** no funded wallet was opened on screen, no funds
  were moved and no BscScan dollar comparison was made. The public fixture
  proves balance decoding, not live dollar agreement between price sources.
- **Project checks:** 78 focused tests pass across BNB account, BNB markets,
  registry and the shared positions table. Targeted lint and whitespace
  checks pass. The app type check still reports the same eight pre-existing
  test errors, with no new diagnostic. No migration is required. Nothing
  was committed or deployed.

## Buying and selling through KyberSwap

The BNB order adapter quotes and builds USDT swaps through KyberSwap. Trading
requires migration `0172_trade_bnb_swaps.sql` before mainnet can be enabled.

- **Quote:** the order window shows coins, USDT, price, derived price impact
  and route pool names. Kyber supplies input and output dollar valuations;
  impact is their positive difference divided by the input valuation.
  The default worst fill is 0.5%. The order price and execution allowance
  share that cap rather than applying the allowance twice.
- **Requests:** GET `bsc/api/v1/routes` and POST `bsc/api/v1/route/build` use
  `X-Client-Id: nodabot-trade`. The route summary retains its dollar strings
  for the build request. Sender and recipient are the wallet. The deadline
  is two minutes, and slippage is whole basis points. Each unsigned request
  retries a 429 once after a wait of at most five seconds. Both attempts count
  against the existing 30-request allowance. Signed broadcasts never retry.
- **Before signing:** the server checks the route tokens, amount and impact.
  It decodes the built transaction and checks recipient, router, input,
  minimum output, native value, permit and added fees. Partial fills are
  refused. Kyber can round the built minimum down one smallest token unit.
  Mainnet authorization is checked after the free build and before signing.
- **Approvals:** insufficient allowance causes one unlimited approval to the
  freshly returned router. Confirmation and a sufficient allowance are
  required before the swap. The only extra attempt is one approval following
  a preflight `TRANSFER_FROM_FAILED` error. Broadcasts never retry.
- **Buy guard:** a GoPlus honeypot or sell tax over 10% refuses the buy before
  any approval or swap. Sells do not consult the buy guard.
- **Sells:** a fresh token balance caps a reduce-only sell. Without that
  checkbox, an oversell is refused. Native BNB remains available for fees;
  a WBNB sell spends only wrapped BNB, although the holdings card combines
  native and wrapped BNB under one Owned position.
- **Signing:** viem prepares and signs locally, then sends the signed bytes
  once. Saving their hash before broadcast makes a lost response recoverable.
  The private key never goes to KyberSwap or the browser. A database lock
  serializes sends for an address across workers and imported copies.
- **Uncertain sends:** pending hashes block another transaction from that
  address. A timeout is not a fill or permission to send again. The shared
  journal records submission without inventing a price or size. A hash that
  never appears on chain requires investigation before releasing the pending
  record; the app deliberately has no automatic resend or expiry.
- **Receipts:** two confirmations are required. Net wallet Transfer logs
  include refunds and token taxes. USDT divided by actual coins gives the
  fill price. A multi-token bundle is not guessed into one swap. Gas used
  times effective gas price gives BNB fees, valued with the latest BNB price.
  Approval hashes and fees survive pending-swap recovery. Journal information
  buttons show receipt and approval details beside the trade status.
- **History:** own receipts are stored immediately and advance the wallet's
  history version. Recovery also checks pending hashes outside the recent
  window. Outside swaps are discovered through incoming and outgoing USDT
  Transfer logs. The first scan covers at most 10,000 blocks in 1,000-block
  pages; later scans overlap two blocks. This is recent recovery, not a full
  lifetime wallet history. Native-only swaps and non-USDT swaps are outside
  this task's fill discovery.
- **Measured node limit:** PublicNode accepted wallet-filtered ranges of
  1,000, 5,000 and 10,000 blocks and refused 50,000 with HTTP 403. The exact
  boundary between 10,000 and 50,000 was not established. Binance's public
  RPC supplied the saved receipt when PublicNode refused that receipt read.
- **Scope:** cancel, move and venue brackets explain that no order rests on
  chain. Watched orders stay in Trade. Holdings still have unknown entry cost,
  matching the Solana account behavior; these receipts do not reconstruct
  missing lifetime history or invent open profit.

### Swap verification and rollout

The quote fixture records a free $10 USDT route returning
4.346284956561207 CAKE and a decodable build. The separate public receipt
`0x043f52dc6393c5317372fd3dbabc90aaeb968cd596631134f8a499ec1ddc7afd`
records 7.227355150720868 USDT paid and 10999.84805120629 token units received
with 18 decimals. Its gas cost was 0.000018431215 BNB. This was an existing
public transaction, not a trade placed during implementation.

1. Apply the reviewed migration after authorization. It widens order and fill
   identifiers to 128 characters and creates the private pending-transaction
   table. It does not change the mainnet switch or move funds.
2. Keep `TRADE_ENABLE_MAINNET` off. Open CAKE with an empty BNB wallet, right-click
   the chart, choose Buy and enter $10. Expect KyberSwap's quote, pool names
   and impact. An attempted execution must not sign or broadcast.
3. Run the focused `quote`, `orders`, `receipts`, `fills` and `ledger` tests
   under `src/server/protocols/bnb/`. These cover captured data, mocked chain
   failures, allowances, scam refusals, sell caps, owner isolation and a fresh
   local migration. They are not funded end-to-end transaction evidence.
4. After authorization and funding, Tyler places the first $10 buy. Check
   the approval hash, swap hash, actual coins, BNB fees and updated holdings.
   Reload the Journal to check persistence. Then Tyler places one $10 sell
   and checks the reverse token movements.
5. Record those two new hashes here. Neither real-money acceptance trade has
   been placed by this implementation work. Migration 0172 has now been applied
   with authorization. Funded acceptance remains pending; deployment is separate.


Verified locally on 8 Sep 2026 for task 06.

- **Browser:** the empty saved wallet opened the Buy window on port 3014.
  Entering $10 showed 4.388893 CAKE at $2.2785 through
  `pancake-infinity-cl-dynamic`, with 0.542% impact and the selected-price
  refusal. Quote details remain visible alongside a refusal. Escape closed
  the window. There were no JavaScript errors or horizontal page overflow.
- **Focused checks:** 108 distinct tests passed across the BNB swap files,
  registry, shared fill history, order window and positions table. Targeted
  lint passed. The app type check reports the same eight existing test
  diagnostics and no new diagnostic.
- **Transaction boundaries:** a routing regression test verifies independent
  hash writes and wallet-transaction history writes. The local database test
  checks migrations, owner isolation, full hashes and duplicate suppression.
  These checks do not prove simultaneous workers against the remote database.
- **Migration applied:** on 8 Sep 2026, Tyler authorized migration 0172 on the
  configured remote database. Its migration record, six widened identifier
  columns, readable transaction table and three indexes were verified.
- **Still pending:** Tyler's two funded acceptance trades and verification of
  their recovered receipts. The current mainnet configuration was enabled when
  the migration ran and was left unchanged. No transaction was signed or sent
  by the migration work. Nothing was committed or deployed.

## Refusals in plain words

BNB refusal messages name the next action and distinguish confirmed fees from
an unknown transaction outcome. Translation happens inside the BNB connector,
before the shared order handler can store or display an error.

- **KyberSwap:** malformed requests, missing routes, unknown coins and amounts
  above the maximum each have fixed wording. Both HTTP failures and errors
  inside successful HTTP responses are checked. A second 429 explains the
  30-per-ten-second allowance. Local allowance exhaustion uses the same advice.
- **Node errors:** too little output names "Worst fill allowed %". A failed
  token transfer after the fresh approval asks the user to check that approval.
  Insufficient gas asks for native BNB at the wallet-card address, with the
  shared 0.005 BNB reserve. Node rate limits ask the user to wait.
- **Confirmed failures:** a reverted receipt proves that swap coins did not
  move and supplies the exact BNB network fee. The message includes the full
  transaction hash and bscscan.com. Confirmed approval fees are stated
  separately when the current attempt has paid them.
  Recovery restores the saved approval fees too, so a restart does not leave
  those fees out of a failed swap's Journal note.
- **Revert reasons:** receipts contain no failure reason. The order handler
  tries one unsigned replay at the mined block. A recognized output failure
  says the replay suggests the price passed the allowance. Later transactions
  in that block can change replay results, so the message does not claim the
  replay proves the original reason. An unavailable replay uses the general
  refusal. A reverted sell of a cached GoPlus honeypot names that warning.
- **Uncertain transactions:** pending, replaced and unanswered broadcasts never
  claim that no coins moved or no fee was paid. The message asks the user to
  inspect the hash before another trade. A replacement receipt cannot count as
  the original swap. Both hashes are shown when available. Pending storage
  continues blocking a new send until the original outcome is resolved.
- **Unknown text:** provider messages, URLs, bodies and nested causes never
  pass through to shared logging or display. Even forged shared error prefixes
  are discarded. Only locally created refusal objects carry sentences through
  the connector's outer catches. Hashes require exactly 64 hexadecimal digits.
- **Existing display:** `LIVE_ORDER_REFUSED:` and `EXCHANGE_BUSY:` carry the
  sentence. The order form uses its existing error area. Attempted orders store
  the sentence in the Journal's refusal records. Quote previews alone do not
  create Journal entries. Receipt recovery also journals confirmed failures.
  A refused swap creates no completed-trade row because no fill exists.
- **History validation:** missing wallet ownership, an invalid address or an
  unsupported network is refused before reading the chain. These validation
  errors are not relabelled as pending transactions.

The saved fixtures include free live malformed-address, unknown-token and
filtered-pool answers from 8 Sep 2026. The live malformed answer used code
4000 and the filtered-pool answer used 40011, beyond the task's documented
list. The other fixtures use the codes in
[KyberSwap's API specification](https://docs.kyberswap.com/developer-guide/aggregator-api/aggregator-api-specification/evm-swaps.md).
Rate limits and chain failures are simulated. No live request flood or paid
failed transaction is needed to test the wording.

### Checking refusals

1. Open BNB Chain on the existing app at port 3014. Choose CAKE and the empty
   wallet, right-click the chart, choose Manual order, then Buy. Enter $10.
   Expect quote details or a plain refusal, with the entered size preserved.
2. Run the focused `refusals`, `quote`, `orders`, `receipts` and `fills` tests
   inside the BNB folder. Expect known-code translation, secret-text removal,
   one unsigned rate-limit retry, paid approval fees and no repeated broadcast.
3. Run the order-window and shared trade-refusal tests. Every refusal must
   appear without its internal prefix. The shared live-order test checks all
   sentences in local Journal storage. No real wallet signs in these tests.
4. The browser validation forces a no-route answer at the quote-response
   boundary. Expect the missing-pool sentence, the unchanged $10 size and
   Escape closing the window. This is a controlled failure, not a claim that
   CAKE naturally has no route.
5. For a real failed or pending order, compare its hash and fee with BscScan
   before another attempt. Do not deliberately pay for a failed transaction to
   check wording. Task 06's funded buy and sell acceptance remains separate.

The task 07 checks passed 169 tests across eleven focused files. These cover
the BNB refusal, quote, order, receipt, recovery, account and ledger tests,
plus the shared formatter, order window and live-order Journal tests. Targeted
lint passed. The app type check has seven existing test diagnostics and no new
diagnostic. No full suite or production build was run.

The controlled browser check on port 3014 displayed the no-route sentence,
preserved the $10 size and closed with Escape. The page measured 1440 pixels
for both content and viewport width, with no horizontal overflow.
The final browser check reported no JavaScript errors, console errors or
failed requests. Task 07 is done. Its audit found no remaining in-scope issue.
No code was committed or deployed, and no network transaction was signed.

The follow-up audit reproduced two errors before correcting them. Recovery
omitted saved approval fees, and missing wallet ownership became a pending
transaction message. Both regression checks failed before the fixes. After
the fixes, 47 focused recovery, refusal, receipt and order tests passed, along
with targeted lint. The same seven existing TypeScript diagnostics remain.
These recovery checks use mocked chain responses. No funded transaction or
additional browser run was performed for the audit.


Combined BNB commit verification on 8 Sep 2026:

- The 23 named test files passed all 309 tests. The BNB provider-boundary
  test passed separately. Lint passed for the changed TypeScript files.
- The app type check still reports seven existing test-fixture errors outside
  this change. The full suite was not run.
- Playwright opened the existing BNB chart and Buy form. A controlled
  no-route response displayed the expected refusal and preserved the $10 size.
  Escape closed the form, page width stayed at 1440 pixels and no JavaScript
  errors occurred. No transaction was submitted.
- Task 06 still needs Tyler's funded $10 buy and $10 sell acceptance checks
  described above. The migration is already applied; deployment is separate.
