# Solana

Solana is a network the app can hold a wallet on, and later buy and sell
coins on. It is not an exchange. There is no account to open anywhere: the
app makes or takes a wallet, the wallet holds the coins, and the app signs
with that wallet's own key.

This file records what the app does today. Where a later task will add
something, it says so, so nobody reads a promise as a feature.

## What Solana is in this app

- **Buying and owning coins**, the way a wallet does. A Solana wallet holds
  USDC and whatever coins it has bought, and the market list, once built, is
  every coin on Solana rather than one venue's short list.
- **Spot only.** There is no leverage, no short side, no funding and no
  liquidation, and there never will be on Solana here. Tyler turned down the
  Solana perpetuals venues because each has a short market list. Every
  leverage or margin control reads as "cannot" on a Solana market, with that
  reason.
- **Its page is `/admin/solana`**, the same workspace every exchange gets,
  with the market list Jupiter knows: every verified coin plus the day's most
  traded, tokenised stocks included. Without a Jupiter key it opens with an
  empty list and one sentence saying why (see "Before the key is set").

## The two services and what each one does

- **A Solana node** is how any wallet reaches the chain. The app uses it for
  exactly two things: reading what a wallet holds, and sending a signed
  transaction. Solana's public nodes are free and rate-limited; a paid node
  from Helius or QuickNode is the same thing at a different address.
- **Jupiter** is the swap router nearly every Solana app uses. One call finds
  the best price across Raydium, Orca, Meteora and the rest, and a second
  call hands back a ready transaction for the app to sign and send. Jupiter
  never holds money and never needs an account, only a free API key. If
  Jupiter went away, the one step that changes is "build me a swap", and
  Raydium's own API does the same job.
- **Where each lives in the code:** `src/server/protocols/solana/client.ts`
  is the only file that knows either address or the key. The fence test
  fails the suite if any other file names a node or Jupiter address, or
  imports `@solana/web3.js`, Solana's own library.

## The three settings in `.env`

| Setting | What it is | If it is missing |
| --- | --- | --- |
| `TRADE_SOLANA_RPC` | The mainnet node, once anything calls a node | Solana's public mainnet node is used |
| `TRADE_SOLANA_DEVNET_RPC` | The practice-network node, for rehearsing the wallet half | Solana's public devnet node is used |
| `TRADE_JUPITER_API_KEY` | The free key from Jupiter's developer portal | Jupiter's keyless host is used instead, and everything still works |

- **The key is optional and authorises nothing.** It is a rate-limit token.
  Jupiter never holds money and has no account, so the only thing that can
  authorise a trade is the wallet's own secret key signing the transaction
  Jupiter builds. Nobody at Jupiter can start or stop your trading, and
  leaving the key out protects nothing.
- The app keeps to one request a second, waits out one refusal and asks once
  more, and after a second refusal answers "busy" so the screen keeps what it
  has.
- A blank setting counts as missing.
- **Nothing calls a Solana node yet.** The market list and the prices come
  from Jupiter, and a wallet is proved by arithmetic rather than by asking
  the chain. The two node settings are read and ready; the first thing to
  use one is reading what a wallet holds.

## Why there is no practice network

- Solana's devnet exists and has a faucet, so the wallet half can be
  rehearsed there. Jupiter cannot swap on devnet, so nothing that buys or
  sells can be rehearsed anywhere.
- So the registry lists mainnet only, and the Solana page has no network
  switch. The first swap, when that task lands, is a tiny real one placed by
  Tyler.

## The wallet rule

- **The secret key holds the coins.** Hyperliquid and Aster let a throwaway
  key trade for an account, so the app never holds the key that can move
  money out. Solana has no such idea: whoever holds the secret key owns the
  wallet. So the rule, written on the Add wallet window: keep in this wallet
  only what you mean to trade.
- **Two ways to add one.** Paste a wallet address and its secret key as a
  wallet app such as Phantom exports it (base58, about 88 characters), or
  press "Make a new wallet". The made wallet's keypair is created on the
  server, the secret is encrypted at once into the same column every venue
  uses, and only the address is shown, with a Copy button, so USDC and a
  little SOL can be sent to it.
- **A pasted pair is proved by arithmetic.** The address is nothing but the
  public half of the key, so the app derives the address from the secret and
  compares. Nothing is asked of the chain. A pair that does not match is
  refused with a sentence naming the address the key really opens and saying
  which field to change.
- **The secret is never shown again**, not in the browser, not in an error,
  not in a log. Replacing it goes through the same proof against the saved
  address.

## What the wallet looks like before its holdings can be read

- The app cannot read what a Solana wallet holds yet. That arrives with the
  holdings task. Until then the wallet row says "Holdings not read yet", its
  worth shows a dash, and the details window says the wallet is saved and
  its address is ready to receive coins.
- This is deliberately not "Can't reach it". Nothing failed, nothing is
  retried, and the row is never counted as a missed read.
- The wallet's saved baseline (the fixed figure orders that do not compound
  size from) is zero, because there was nothing to read. Nothing sizes an
  order off it while Solana takes no orders. The holdings task decides what
  to do with wallets saved before it.
- This is the one venue with a sign-in form and no account block in the
  registry. Everywhere else the two travel together, and the registry test
  now pins the rule as: readable accounts always have a form, and any form
  always has a way to prove the credential before it is stored.

## The market list

Every figure here was read from Jupiter's live token API on 3 Sep 2026,
between 21:20 and 21:35 UTC. They are dated readings, not numbers the app
assumes will hold.

- **Two calls a minute make the list.** The verified tag list
  (`/tokens/v2/tag?query=verified`) and the day's hundred most traded coins
  (`/tokens/v2/toptraded/24h?limit=100`), verified or not, joined by mint
  address. The shared catalogue cache asks once a minute, so the list costs
  two of the minute's requests however many screens are open.
- **What came back:** 3,189 verified coins and 100 top-traded ones, 68 of
  which were already in the verified list, so 3,221 coins in all. 1,202 of
  the verified coins are tokenised stocks (`stocks` and `xstocks` tags), 3
  are metals, the rest are coins. The list files stocks and metals under
  their own kinds, so the Crypto and TradFi tabs show.
- **683 verified coins had no price and are left out.** `MarketRow.price`
  is a number every screen leans on, and a made-up zero would read as a real
  one. A coin with a price but no day's figures stays, with a dash for its
  move and zero for its volume; 900 of the 3,189 had no day's figures at all.
  So the page lists about 2,500 coins.
- **The market id is the mint address, never the ticker.** The verified list
  alone carried 50 tickers twice, TRUMP and WBTC among them. Only the address
  is unique, so the key is `solana:mainnet:<mint>` and the ticker is what
  prints. Two coins called TRUMP are two rows.
- **USDC itself is never listed.** Every market here is bought with USDC, and
  there is nothing to buy USDC with. Its mint address is
  `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`, and it is checked against
  Jupiter's own saved answer by a test rather than trusted: the first version
  of that constant was typed from memory, began with the same 17 characters,
  and matched no coin at all, so the rule quietly did nothing and Jupiter
  refused a quote against it with "not tradable".
- **A coin the venue warns about wears the word.** "Suspicious" when Jupiter's
  own audit flagged it, "Unverified" when nobody has vouched for it. In the
  day's top hundred, 32 were unverified. The coin is never hidden and never
  looks vetted.
- **The day's move and volume are Jupiter's.** The move is `stats24h.priceChange`,
  a percent Jupiter states as 3.29 for a 3.29% rise. The volume is the day's
  buys plus sells in dollars. There is no funding, no open interest and no
  leverage on a spot market, and those columns do not show.
- **Prices for the engine** come from `/price/v3` in pages of 50 mints, each
  page held for two seconds so a settle and a poll share one request. A coin
  Jupiter has not seen traded in seven days is left out of the answer rather
  than priced at zero.
- **A refresh that fails keeps the last good list.** Jupiter busy, the minute
  spent, a network hiccup: the page keeps showing the list it had, at most a
  minute old, rather than an empty list that would read as "Solana lists
  nothing today". The only refusal that reaches the screen is the missing
  key, because there is no list to fall back on.

## The coin's name, where only the key is in hand

- **A Solana market id is the mint address, so it is not a name.** Every
  screen that HAS the row prints `row.symbol` and shows the real ticker: the
  market list, the picker, the market header.
- **A caller holding only the key shortens it**, `CbyTNf…pump`, the way every
  other address in this app is shortened. That is the browser tab, a notice,
  an alert row, a toast. The ticker is not in the key and cannot be worked
  out from it, and printed raw it filled the whole browser tab saying nothing.
- Reading a Solana coin's ticker from a key alone would need a lookup the
  server does not have yet. When notices need it, that is the task to do it
  in.

## Finding a coin outside the list

- Jupiter's search (`/tokens/v2/search?query=`) finds any coin by name or
  address, verified or not, up to twenty at a time. The picker offers it as
  one button, "Find "BONK" on Solana", when a search matches nothing loaded.
  A button rather than automatic, because each lookup spends one of the
  minute's requests.
- A coin it finds joins the list for the session, in the picker and in All
  markets, with its warning word if it has one, and can be charted like any
  other. Nothing found says so. A coin Jupiter has no price for is left out
  of the answer the way it is left out of the list.
- The search for "BONK" on 3 Sep 2026 answered 20 coins: Bonk itself, then
  nineteen look-alikes, sixteen of them unverified.
- Searching "BONKGUY" in the running app on 4 Sep 2026 answered five coins
  that all call themselves BONKGUY or BonkGuy, at five different prices, from
  $6 of volume a day to $37,900, every one of them unverified. That one
  screen is the argument for both rules on this page: the mint address is the
  id because a ticker is not unique, and the badge is there because not one
  of those five is vetted.

## The two hosts, and what a key buys

Measured 4 Sep 2026, with no key at all: the whole verified token list
(3,189 coins) came back from both hosts, a real quote came back, and Jupiter
built a real unsigned swap transaction. So the key chooses a host rather
than switching Solana on.

- **No key: `lite-api.jup.ag`**, the free host. 70 requests back to back were
  answered without one refusal.
- **A key: `api.jup.ag`**, the keyed host, at the stated sixty a minute. That
  host does answer without a key, but only 5 requests per 10 seconds before
  it refuses, which is why it is never used unkeyed. A wrong key is refused
  outright with a 401, so the header only goes on when there is a real one.
- **A key is still worth having before real swaps.** An order refused for
  want of an allowance is a trade that did not happen.

## The budget

- Sixty requests a minute, which is the keyed tier's stated figure and is
  comfortably under what the keyless host served. `client.ts` holds the one
  constant and shares it: reads may spend forty, and twenty are kept back so
  a swap is never refused for want of a request while somebody clicks
  through the list. A read the minute has no room for is refused at once as
  "busy" and the screen keeps what it has.
- What the page spends: two requests a minute for the list, one per fifty
  coins the engine needs a price for, and one per lookup. An idle Solana tab
  spends two a minute.
- Requests also queue a second apart, and a refused request is waited out
  once and sent again before "busy" is answered.

## The chart, before it is built

- Picking a coin opens the chart space, and the chart says in one sentence
  that Solana charts are not built yet. The coin's price, day's move and
  volume are already in the list; the chart arrives with the chart task.

## When a venue knows why it has nothing to show

- An exchange that knows why it cannot answer throws `MARKETS_UNAVAILABLE:`
  with its own sentence after the code, and the market list prints that
  sentence as it is instead of the generic "did not answer, try again".
  `CANDLES_UNAVAILABLE:` does the same for the chart, which is how Solana
  says its chart is not built yet.
- Solana no longer uses the markets one, because there is no longer a state
  where it cannot list markets.

## Where things are

- `src/server/protocols/solana/client.ts` — the node and Jupiter addresses,
  the key, the one-a-second pacing, the timeout, the one retry.
- `src/server/protocols/solana/wallet.ts` — packing, proving, deriving and
  making the wallet.
- `src/server/protocols/solana/markets.ts` — the market list, the lookup,
  the engine's prices, and the chart's honest refusal until it is built.
- `src/server/protocols/solana/jupiter.fixture.json` — Jupiter's real
  answers of 3 Sep 2026, trimmed to the records the tests need.
- `src/server/protocols/solana/base58.ts` — the alphabet Solana writes keys
  in, thirty lines rather than a package.
- `src/lib/api/trade/protocols.ts` — what the browser knows: the capability
  flags (all off) and the Add wallet window's labels and help.
