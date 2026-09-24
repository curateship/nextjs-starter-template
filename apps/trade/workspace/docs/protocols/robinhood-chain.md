# Robinhood Chain

Robinhood Chain can hold a wallet in Trade, and nothing more yet. Its markets,
holdings and buying and selling each arrive with their own task.

Robinhood Chain is Robinhood's own network. It is built on Arbitrum, which
makes it the same kind of chain as BNB Chain, and it has been public since
1 July 2026. Its point is Stock Tokens: tokens that track NVDA, SPY, TSLA, GLD
and at least fifty more stocks, trading 24 hours a day against USDG, a dollar
coin from Paxos.

- **Where to open it:** `/protocols/robinhood` is the shared exchange page.
  Robinhood Chain appears in the protocol list. The sidebar link is a
  Settings row, not code.
- **What works today:** adding a wallet and making one. The market list is
  empty, so nothing can be picked, charted or bought. The wallet row reads
  "Holdings not read yet" until the holdings task.
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

## The node and the network

- **Node setting:** `TRADE_ROBINHOOD_RPC` in `.env` defaults to
  `https://rpc.mainnet.chain.robinhood.com`. Nothing reads it yet, because
  saving a wallet needs no network request. The holdings task is the first
  reader.
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
quote and build checks, the receipt reader, the Multicall3 balance read and the
swap itself.

- **Each chain folder keeps its own facts:** its addresses, chain id, dollar
  coin, fee coin, explorer and services. It hands them to the shared code as
  settings.
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
2. Open `http://localhost:3014/protocols/robinhood`. Expect the page to load
   with an empty chart space and no market to pick.
3. Open Wallets, then Add wallet, then choose Real Robinhood Chain. Expect the
   USDG, ETH and Stock Tokens sentences under the private key.
4. Press Make a new wallet. Expect an address and Copy button and no key.
   Reload and expect the wallet with "Holdings not read yet".
5. Paste a mismatched address and key. Expect the refusal naming the address
   the key opens. Paste the matching address and expect it to save.
6. Delete the test wallets from Edit wallet. No funding is needed for any step.
