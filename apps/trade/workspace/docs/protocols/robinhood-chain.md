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
  volume, and adding or making a wallet. Nothing can be bought yet, and a
  chart shows only the prices recorded while the page is open. The wallet row
  reads "Holdings not read yet" until the holdings task.
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

## The node and the network

- **Node setting:** `TRADE_ROBINHOOD_RPC` in `.env` defaults to
  `https://rpc.mainnet.chain.robinhood.com`. Nothing reads it yet: saving a
  wallet needs no network request, and the market list reads the explorer and
  price services, not the node. The holdings task is the first reader.
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
quote and build checks, the receipt reader, the Multicall3 balance read, the
swap itself and the market list (DexScreener prices, GoPlus checks, pool
pages and search).

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
   src/server/protocols/bnb src/server/protocols/fence.test.ts
   src/server/protocols/registry.test.ts`. The fence has two failures that
   were there before this chain: a protocol comparison in
   `server/trade/live-orders.ts` and BNB's folder reading the app's tables.
2. Open `http://localhost:3014/protocols/robinhood?market=robinhood:mainnet:0xd0601ce157db5bdc3162bbac2a2c8af5320d9eec`.
   Expect NVDA-USDG in the header. A fresh page with no market chosen shows
   only "Robinhood Chain", as every exchange page does.
3. Open the picker from NVDA-USDG. Expect ETH, stocks and pool coins with
   the day's move and volume, and a footer counting coins and stocks.
4. Choose TradFi in the "All markets" menu. Expect only stock tokens, with no
   Unverified badge. Sort by 24h change and search "GME".
5. Search a coin that is not listed, such as GOYBEAM. Press "Find ... on
   Robinhood Chain" and expect it to appear as Unverified.
6. Open Wallets, then Add wallet, then choose Real Robinhood Chain. Expect the
   USDG, ETH and Stock Tokens sentences under the private key.
7. Press Make a new wallet. Expect an address and Copy button and no key.
   Reload and expect the wallet with "Holdings not read yet". Delete test
   wallets from Edit wallet. No funding is needed for any step.
