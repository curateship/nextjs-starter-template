# Robinhood Chain

Robinhood Chain lists its stock tokens and coins and can hold a wallet in
Trade. Its charts, holdings and buying and selling each arrive with their own
task.

Robinhood Chain is Robinhood's own network. It is built on Arbitrum, which
makes it the same kind of chain as BNB Chain, and it has been public since
1 July 2026. Its point is Stock Tokens: tokens that track NVDA, SPY, TSLA, GLD
and at least fifty more stocks, trading 24 hours a day against USDG, a dollar
coin from Paxos.

- **Where to open it:** `/protocols/robinhood` is the shared exchange page.
  Robinhood Chain appears in the protocol list. The sidebar link is a
  Settings row, not code.
- **What works today:** the market list, with prices, the day's move and
  volume, charts with years of borrowed history, wallets with their holdings,
  and buying and selling through KyberSwap or Velora.
- **Spot only:** a coin is bought and owned outright. There is no leverage,
  short side, funding or liquidation, and there never will be here.
- **Money:** purchases will be paid in USDG. Network fees are paid in ETH, so a
  wallet needs a little ETH before its first swap.
- **Who may hold Stock Tokens:** Robinhood's terms bar offers and sales of
  Stock Tokens in the US and restrict them in Canada, the UK and Switzerland.
  The chain itself blocks nobody: on 5 Sep 2026 a simulated transfer of 1 NVDA
  and of 1 USDG to a brand-new address both went through. Whether Tyler may
  hold them is his call. The Add wallet window says so in one sentence and
  never blocks.

## The wallet

- **Wallet rule:** keep in this wallet only what you mean to trade. The private
  key is the key that holds the coins, not a limited trading key.
- **Pasting a wallet:** the key must be 64 hexadecimal characters, with or
  without `0x`. Trade works out which address the key opens and compares it
  with the pasted address, ignoring upper and lower case. Nothing is asked of
  the chain.
- **A mismatched pair:** refused before saving, with a sentence naming the
  address the key really opens, so you know which field to fix.
- **Making a wallet:** the server makes the key and stores it encrypted. The
  browser only ever sees the address, with a Copy button.
- **The orange key notice:** a saved wallet shows "Could not check what this
  key may do". Every chain wallet shows it, BNB Chain and Solana included,
  because a chain has no key permissions to read. That notice is written for
  exchange API keys and is wrong for a chain key. Changing it is a decision for
  the shared wallet code, not for this chain.

## The market list

The list is every stock token Robinhood has issued, under TradFi, plus the
coins in the chain's 200 busiest pools, under Crypto. Each is priced in USDG
from its most liquid DexScreener pair.

- **Counted on 23 Sep 2026:** Robinhood had issued 204 stock tokens and
  DexScreener priced 147 of them. A cold start listed 165 markets: those 147
  stocks and 18 coins from the first two pool pages. More coins join as the
  other eight pages arrive over five minutes. The picker then showed 100 coins
  and 27 stocks, because the daily-volume cutoff in Settings hides thin
  markets, as on every exchange.
- **What makes a stock token real:** Robinhood's StockFactory contract
  (`0x4783…C046`) made it. Every token the factory makes is a `Deployed` event
  on that address, and the list reads those events from Blockscout, the
  chain's explorer, once an hour, 204 in five pages.
- **Why not the name:** the task said to accept a token whose name ends
  "• Robinhood Token". On 23 Sep 2026, 539 tokens had that ending, including
  18 called NVDA and 19 called GME, because a copy can use any name. One real
  stock, WEEK, does not use that ending at all. The factory's own record is
  the only thing a copy cannot fake.
- **A coin named like a stock:** a token called NVDA that the factory did not
  make is a coin, listed under Crypto as Unverified, if it is listed at all.
  None of the fake NVDAs had a DexScreener pair that day.
- **Warnings:** a stock token carries no badge, because the factory is the
  proof and GoPlus leaves its honeypot answer blank for them. A pool coin
  reads Unverified. Any coin GoPlus calls a honeypot, or taxes more than 10
  out of 100 on a sale, reads Suspicious. GoPlus answers one address per
  request, so the hourly check asks one coin at a time, as on BNB Chain.
- **Left out:** USDG itself, the native-ETH placeholder at address zero that
  Uniswap v4 pools use, and any coin DexScreener has no pair for. BND, WEEK
  and PEACH_DEFI_1 are real stock tokens with no pair yet, so they are not
  listed.
- **ETH:** the chain's wrapped ETH (`0x0bd7…ad73`, Arbitrum's standard
  `aeWETH`, 560,856 holders) is listed as ETH. At least seven other tokens call
  themselves WETH.
- **Pictures:** each stock token shows Robinhood's own logo, which lives at an
  address built from the token's address. 12 of 12 random stocks answered.
- **Decimals:** every stock token has 18. They all run one contract, and that
  contract keeps the standard 18.
- **Search:** typing a name the list does not have offers "Find ... on
  Robinhood Chain", which asks DexScreener. GOYBEAM, a coin outside the list,
  was found that way.
- **The explorer's wall:** Blockscout sits behind Cloudflare, which answers a
  plain request with a "Just a moment" page. The client sends a browser's
  User-Agent and the explorer's own tokens page as the Referer, and is let
  through. On 23 Sep 2026 either one alone was refused. The explorer has its
  own allowance of 30 requests a minute.
- **The explorer's page cursor:** Blockscout hands back a cursor with some
  values empty. Sent back as the word `null`, it gives the next page. Left
  out, it gives page one again, forever. The reader also stops if a cursor
  repeats, and after 40 pages.

## Prices on a clock

Prices on the Robinhood Chain screen are refreshed on a clock. This is not a
live feed, and the trading engine never reads it.

- **The clock:** ten seconds after the last refresh finished, the page asks
  the server for the 300 busiest markets' prices. The server asks DexScreener,
  thirty addresses a request, so ten requests at most. Measured on 24 Sep
  2026: each refresh took 1.1 to 6.6 seconds, so a price moves every 11 to 17
  seconds.
- **What moves:** only the price. The day's move and volume stay as the list
  read them. A refresh that fails changes nothing on screen, and the next one
  tries again.
- **A hidden tab asks nothing.** With the tab hidden for 35 seconds, no
  refresh started. Showing it again restarted them.
- **Checked against DexScreener:** NVDA's refreshed price was $224.92, and
  DexScreener's most liquid NVDA pair said $224.92 at the same moment.
- **The allowance:** DexScreener allows 300 requests a minute, and BNB Chain
  spends from the same 300. So each chain keeps under half. Robinhood Chain's
  worst case is 60 screen requests plus 27 for rebuilding the list, 87 a
  minute. BNB Chain's is 93. A test pins both.
- **Recorded bars:** each refresh also writes the prices as one-minute bars,
  so a chart has something to draw until the chart task gives it a source.
- **The engine asks at the moment it acts,** through `markets.prices`, which
  reads DexScreener directly and never falls back to an older list price.
  Robinhood Chain has no orders yet, so the engine does not act on it at all.
- **Not a live feed on purpose:** Robinhood Chain has no `livePrices` entry,
  and the engine's heartbeat does not use this timer. The server refuses a
  timed refresh for any exchange that does have a live feed.
- **The future live feed, measured and not built:** on 5 Sep 2026 the node's
  websocket at PublicNode pushed its first block in 0.27 seconds and 97 blocks
  in 10 seconds, free and with no key. Blocks come every 100 milliseconds. It
  is not used, for the same reason as on Solana: a price here is the best path
  across several pools, not one pool's numbers, and turning blocks into that
  price is its own piece of work.

## Holdings

A wallet's card shows what it is worth, the USDG free to spend, the ETH kept
for fees, and each stock token and coin it holds.

- **Free money is USDG,** at its 6 decimals. Worth is the USDG plus every
  holding with a price.
- **Each holding is a row marked Owned,** with dashes for margin and
  liquidation, as on BNB Chain. A token DexScreener has no pair for is shown
  and marked Unpriced. A priced holding worth under a cent is left out.
- **ETH for fees:** a swap costs about 0.00012 ETH (0.4 gwei times 300,000
  gas), so the card warns below 0.001 ETH, about eight swaps. The warning is
  the same amber sentence BNB Chain shows, and says wrapped ETH cannot pay
  fees. Native ETH also counts as an ETH holding.
- **Amounts come from the chain, never from the explorer.** One call to
  Multicall3 on the Robinhood node reads the ETH balance and every token's
  balance and decimals together. On 24 Sep 2026 the chain said NVDA's pool
  held $3,092,558.50 of USDG while the explorer still said $3,122,214.87.
- **The explorer says which tokens to ask about.** Blockscout's
  `token-balances` lists every token the wallet holds, so a coin bought
  elsewhere still shows. It is asked at most once a minute per wallet. A
  read waits three seconds for it at most, then goes on with the last answer,
  or with the listed tokens alone. For an address holding thousands of
  tokens the explorer took 100 seconds and then failed, on 24 Sep 2026.
- **The listed tokens are always asked about:** USDG, ETH and every market
  in the list, so the card still reads when the explorer refuses.
- **A token dropped into a wallet cannot blank the card.** A token the
  explorer found, but the app does not list, is left out if it will not say
  its balance. A listed token that will not answer fails the read, so money
  is never understated quietly. The explorer adds at most 200 tokens to a
  read, so a wallet flooded with junk cannot grow it without end.
- **One read every two seconds at most,** shared by the card, the positions
  list and the engine.
- **Stock tokens carry a multiplier.** NVDA's token is an ERC-8056 token
  with a multiplier of 1.000775 since 10 Sep 2026, so one token is slightly
  more than one share. The card counts tokens, priced at the pool's price per
  token, so the dollar value is right.
- **Made or lost on a sale is not stated.** The chain does not say what a
  sale made, so a zero there means "not stated".
- **Empty wallet** sells nothing yet. Each sell is refused, and the window
  says so, until buying and selling are built.

## Charts

A Robinhood Chain chart works like BNB Chain's: the pool's own bars for the
last 30 days, and older bars borrowed where the app can vouch for them.

- **The pool's bars:** GeckoTerminal's candles for each market's most liquid
  pool, priced in dollars for the token, not for the pool's other coin. They
  are kept in the candle store. The chain opened on 1 July 2026, so a pool
  holds about two months: NVDA's goes back to 21 July, 66 daily bars.
- **Stock tokens borrow Dukascopy.** The header reads "History from
  Dukascopy". NVDA's 4-hour chart drew 179 bars from the pool and 5,640 from
  Dukascopy, back to 2017. A stock token trades at its stock's price: NVDA's
  token was $225.21 when the stock was $225.03, TSLA $379.20 against $378.47,
  META $737.43 against $735.94, on 24 Sep 2026.
- **Which stock tokens borrow:** 72 of the 204.
  `src/lib/protocols/robinhood/history.ts` pins each one by contract address,
  never by ticker, because 18 tokens call themselves NVDA. Each passed three
  checks: Robinhood's factory made it, Dukascopy lists the ticker, and both
  name the same company. The other 132, GME, HIMS and DJT among them, have no
  Dukascopy instrument and draw the pool's bars alone. Meta is borrowed under
  Dukascopy's old name for it, FB.
- **ETH borrows Binance.** Only the chain's own wrapped ETH does. Its chart
  reads "History from Binance" and drew 14,958 older 4-hour bars.
- **Other coins:** the pool's bars alone, with no label. PONS drew 434 4-hour
  bars. A coin no pool answers for draws the one-minute prices the screen
  recorded, and says "No candles here yet" when there are none.
- **The seam:** the pool's bars cover the last 30 days, and borrowed bars
  cover everything before, as on every exchange (`charts/candle-store.md`).
  The task asked for the seam at the pool's first day instead; the candle
  store's 30-day rule came later and holds for every venue. Dukascopy's bars
  are stock hours only, and the pool trades around the clock, so nights and
  weekends appear only in the last 30 days, which are the pool's.
- **Backtests stay off:** Robinhood Chain has no orders and records its own
  bars, and the backtest picker leaves out any exchange that does either.
- **Pool ids:** a Uniswap v4 pool is named by a 64-character hash, and
  GeckoTerminal answers for it. META's pool is one.

## Buying and selling

Every order is a swap: USDG for a stock token or coin, or back. The wallet's
key signs it on the server. Nothing rests on the chain, so a price you set is
watched here and swapped when the market gets there.

- **Two routers, better price wins.** Tyler decided on 24 Sep 2026: KyberSwap
  and Velora (formerly ParaSwap) are both asked for every quote, and the one
  giving more coins is used. If one is down, the other is used alone. That
  day KyberSwap answered Robinhood Chain "service temporarily overloaded"
  five times in a row, while its BNB Chain route worked.
- **The quote line** names the router that won: "Velora: 4.500458 NVDA for
  $1,000.00 at $222.2, price impact 0%, via metric-v1 → ramsesv2." On a
  stock-token buy it ends with the one sentence on who may hold Stock Tokens.
- **Approving the exact amount each time.** Also Tyler's decision on 24 Sep:
  before a swap, the wallet lets the router spend exactly that swap's coins,
  not unlimited. It costs about a cent and a second, and a router bug can
  never take more than one swap's worth. BNB Chain keeps its one unlimited
  approval per coin.
- **What is checked before signing.** Each router's transaction is decoded and
  refused unless it goes to that router's own contract, sends no ETH, swaps
  exactly the quoted coins and amount, pays the wallet itself, keeps the
  worst fill allowed, and carries no permit. Velora's must also carry no
  partner fee. Without our partner name Velora adds its default partner's
  0.01%; with it, the fee is zero. Its contract is pinned at
  `0x6a000f20005980200259b80c5102003040001068`.
- **Velora's swap has no deadline of its own.** KyberSwap's transaction
  carries one and the chain refuses it late; Velora's contract takes none.
  The app still refuses to sign after the two-minute deadline, and the
  minimum return still holds whenever it is mined.
- **When one router is refused.** If one router has no pool and the other is
  busy, the order is refused with the router that found no pool, because that
  says more. A route that breaks the order's worst fill loses to one that does
  not, even when it offers more coins.
- **Amounts read each coin's own decimals.** USDG has 6 and stock tokens 18,
  so $10 of USDG is 10,000,000 of its smallest unit.
- **Waiting for the receipt:** one confirmation, looked for every quarter
  second, for up to 15 seconds. Blocks are 100 milliseconds apart and the
  chain's sequencer orders them alone. BNB Chain waits for two, once a
  second. The real time to a receipt is measured on the first real swap.
- **Fees:** a real swap on 24 Sep used 382,266 gas at 0.042 gwei, about
  0.000016 ETH. The Journal row shows the fee in ETH and dollars.
- **Every signed transaction is saved before it is sent,** in
  `trade_robinhood_transactions` (migration 0185, applied to the live
  database on 24 Sep 2026 with Tyler's approval). A send the chain may have
  received is never signed or sent again. A send the node refused for lack
  of ETH is closed at once, so it cannot block every later swap.
- **Fills reach the Journal two ways.** The app's own swaps are read from
  their receipts. Swaps made anywhere else are found through the explorer's
  list of the wallet's USDG transfers, since every pool here is paired with
  USDG. When the explorer refuses, the app's own swaps are still settled, and
  the others are found on a later pass (see Refusals below). There is no log scan to fall back on:
  with 100-millisecond blocks, a node's usual 10,000-block window is only
  about 17 minutes. A sweep looks back a week at most, so a new wallet's
  first one cannot turn into hundreds of node reads, and a transaction it
  has settled is never read again.
- **Carried over from BNB Chain:** a buy of a coin GoPlus flags is refused and
  a sell never is; a sell above the holding is refused unless "Sell only what
  I hold" is ticked; the real-money switch is checked twice before signing;
  a failed swap moves no coins but the fee is paid, and the sentence says so;
  a buy bigger than the wallet's USDG is refused before the approval, so no
  fee is spent on it; a swap that confirmed but does not read as one buy or
  sell is closed with a note instead of staying pending. BNB Chain's doc
  explains the last two.
- **Velora's allowance** is not published and it sent no limit headers. The
  app allows itself 60 requests a minute, 20 of them kept for swaps.
- **No practice network.** The first swap is a small real one, placed by
  Tyler. Its transaction hashes go here once they exist.

## Refusals

Every "no" from KyberSwap, Velora, the node, the explorer or a coin's own
contract reaches the order window and the Journal as one sentence. It says
what to do next and whether a fee was paid. The sentences live in
`src/server/protocols/evm-chain/refusals.ts` and are shared with BNB Chain.
`robinhood/refusals.ts` supplies the chain's name, its fee coin, its
explorer, and the two refusals that only Stock Tokens raise.

- **A Stock Token's compliance check.** Every Stock Token transfer checks
  both addresses against Robinhood's access list. A blocked address makes
  the token raise `Blocked(address)`. The node passes that on as revert data
  starting `0x75e91ce7`, with no words. The sentence names the token by its
  symbol, for example "NVDA's own contract refused the transfer: its
  compliance check blocked an address in it." It then points at the note
  under the buy button, and says whether coins moved and a fee was paid. Any
  refusal whose text says "compliance" gets the same sentence. The codes
  were read from the verified Stock Token contract on 24 Sep 2026. On 5 Sep
  a simulated transfer to a fresh wallet went through, so the check had not
  refused anyone then.
- **A paused Stock Token.** Robinhood can pause a token, for example for a
  corporate action. The token then raises `IsPaused()` (`0x1309a563`), and
  the sentence says the token cannot move right now.
- **Where they are caught.** If the check trips before signing, while the
  swap's gas is being estimated, nothing is sent and no fee is paid. A swap
  can also be mined and then fail. The app replays it at that block to read
  why, and the Journal row keeps the sentence along with the fee and the
  hash.
- **The token's symbol is a courtesy.** Any contract can name itself
  anything, so only a short plain symbol is used. Otherwise the sentence says
  "The coin".
- **The explorer refusing** (a 403 without the browser headers, or a 429)
  stays silent. The app's own swaps are settled from the node instead. Only
  if the node fails too does the Journal say "Neither Robinhood Chain's
  explorer nor its node answered a trade history request. The Journal
  catches up on the next read."
- **A market list that cannot load** names the service that refused, for
  example "DexScreener could not refresh the Robinhood Chain market list.",
  never the service's bare status such as "DexScreener:503". BNB Chain's
  list reads the same way, through the shared code.
- **Anything unrecognised** is never repeated, because a provider's words
  can carry anything. It becomes "Robinhood Chain refused the trade, and no
  coins moved. Check the wallet and request a fresh quote.", plus the fee and
  the hash when a transaction was sent.
- **Shapes:** a refusal travels as `LIVE_ORDER_REFUSED:<sentence>`, and a
  busy service as `EXCHANGE_BUSY:<sentence>`. The browser shows the
  sentence after the colon.

## The node and the network

- **Node setting:** `TRADE_ROBINHOOD_RPC` in `.env` defaults to
  `https://rpc.mainnet.chain.robinhood.com`. The holdings read is what uses
  it. Saving a wallet needs no network request, and the market list reads the
  explorer and price services, not the node. Multicall3 is at its usual
  address on this chain.
- **Chain id:** 4663, kept beside the node address in
  `src/server/protocols/robinhood/client.ts`. That file is the only one allowed
  to name a Robinhood address, and `fence.test.ts` fails if another file does.
- **Mainnet only:** the testnet exists (chain id 46630), but KyberSwap does not
  route on it, so there is no practice network to list. The first swap will be
  a small real one, as on Solana and BNB Chain.
- **Measured on 5 Sep 2026, with no key:** the public node and a second one at
  PublicNode both answered. Gas was 0.4 gwei, blocks were 100 milliseconds
  apart, and Multicall3 sat at its usual address. KyberSwap listed the chain,
  quoted 10 USDG for 0.0432 NVDA and built the transaction, with the same
  router address as on BNB Chain.

## Shared with BNB Chain

BNB Chain and Robinhood Chain share the code in
`src/server/protocols/evm-chain/`, so a fix there is a fix on both. The folder
holds the wallet, the request counters, the refusal sentences, the KyberSwap
and Velora quote and build checks, the receipt reader, the Multicall3 balance
read, the swap itself, the market list (DexScreener prices, GoPlus checks,
pool pages and search) and the pool candles.

- **Each chain folder keeps its own facts:** its addresses, chain id, dollar
  coin, fee coin, explorer and services. It hands them to the shared code as
  settings.
- **One allowance per service, not per chain:** DexScreener, GeckoTerminal,
  GoPlus and KyberSwap limit the caller, whichever chain it asks about. Both
  chains count against one shared window per service. GeckoTerminal's two
  pages a minute are now two between the chains.
- **The rule for the shared folder:** it names no chain, no chain's coin and no
  web address. `fence.test.ts` fails if it does, which also stops it importing
  from either chain's folder.

## How to test it

1. Run the focused tests: `npx vitest run --config vitest.app.config.ts
   src/server/protocols/evm-chain src/server/protocols/robinhood
   src/lib/protocols/robinhood src/server/protocols/bnb
   src/server/protocols/fence.test.ts
   src/server/protocols/registry.test.ts`. The fence has two failures that
   were there before this chain: a protocol comparison in
   `server/trade/live-orders.ts` and BNB's folder reading the app's tables.
2. Open `http://localhost:3014/protocols/robinhood?market=robinhood:mainnet:0xd0601ce157db5bdc3162bbac2a2c8af5320d9eec`.
   In the browser's network tab, filter for `_serverFn` and expect one price
   refresh every 11 to 17 seconds. Hide the tab for 30 seconds and expect none
   to start.
   Expect NVDA-USDG in the header. A fresh page with no market chosen shows
   only "Robinhood Chain", as every exchange page does.
3. Open the picker from NVDA-USDG. Expect ETH, stocks and pool coins with
   the day's move and volume, and a footer counting coins and stocks.
4. Choose TradFi in the "All markets" menu. Expect only stock tokens, with no
   Unverified badge. Sort by 24h change and search "GME".
5. Open NVDA at 4 hours. Expect "History from Dukascopy" and bars back to
   2017. Open ETH and expect "History from Binance". Open PONS and expect
   about two months of pool bars with no label.
6. With a Robinhood Chain wallet active, right-click the chart, choose Manual
   order, then Buy. Expect a quote line naming Velora or KyberSwap, and on a
   stock token the sentence about who may hold them. Do not press the button
   unless you mean to trade: real money is switched on here.
7. Search a coin that is not listed, such as GOYBEAM. Press "Find ... on
   Robinhood Chain" and expect it to appear as Unverified.
8. Open Wallets, then Add wallet, then choose Real Robinhood Chain. Expect the
   USDG, ETH and Stock Tokens sentences under the private key.
9. Press Make a new wallet. Expect an address and Copy button and no key.
   Reload and open the wallet. Expect "Connected", Free $0.00, In trades
   $0.00, "ETH for fees 0 ETH" and the amber ETH sentence. Delete test
   wallets from Edit wallet. No funding is needed for any step.
10. In the step 6 order window, type 1000000000 in Size with USD chosen.
    Expect "This size is above Velora's maximum. Lower the size and ask for
    another quote. No swap coins moved. No new transaction fee was paid."
    Expect no code such as `503`, `0x…` or `LIVE_ORDER_REFUSED` anywhere on
    the page. On 24 Sep 2026, $5,000,000 still found a route, at 4.61% price
    impact.
