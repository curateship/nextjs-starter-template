# Solana

Solana is a network the app can hold a wallet on, and buy and sell coins on
through Jupiter. It is not an exchange. There is no account to open anywhere: the
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
  three things: reading what a wallet holds (see "What a wallet holds"),
  reading a confirmed swap back so the Journal gets the real fill, and
  listing the wallet's transactions so its swaps become fills. Solana's
  public nodes are free and rate-limited; a paid node from Helius or
  QuickNode is the same thing at a different address.
- **Jupiter** is the swap router nearly every Solana app uses. One call finds
  the best price across Raydium, Orca, Meteora and the rest, and a second
  call hands back a ready transaction for the app to sign and send. Jupiter
  never holds money and never needs an account, only a free API key. If
  Jupiter went away, the one step that changes is "build me a swap", and
  Raydium's own API does the same job.
- **The swap calls live under `/ultra/v1` on both Jupiter hosts.** Measured
  4 Sep 2026: `/swap/v2/order`, the path the task file named, answered
  "Route not found" on the free host and the same body as `/ultra/v1/order`
  on the keyed one. `/ultra/v1/order` and `/ultra/v1/execute` answered on
  both, so those are the paths used whichever host the key picks.
- **Where each lives in the code:** `src/server/protocols/solana/client.ts`
  is the only file that knows either address or the key. The fence test
  fails the suite if any other file names a node or Jupiter address, or
  imports `@solana/web3.js`, Solana's own library.

## The three settings in `.env`

| Setting | What it is | If it is missing |
| --- | --- | --- |
| `TRADE_SOLANA_RPC` | The mainnet node the wallet's holdings are read from | Solana's public mainnet node is used |
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
- **The node is asked three things per wallet read**, every two seconds at
  most: the SOL balance and the wallet's token accounts under each of the
  two token programs. The public node rations by address and answers a 429
  of its own; the app passes that on as "busy" and the card keeps its last
  figures. A paid node is the same three calls at another address.

## Why there is no practice network

- Solana's devnet exists and has a faucet, so the wallet half can be
  rehearsed there. Jupiter cannot swap on devnet, so nothing that buys or
  sells can be rehearsed anywhere.
- So the registry lists mainnet only, and the Solana page has no network
  switch. The first swap is a tiny real one placed by Tyler, and its
  signature goes under "The first real swaps" below once it is placed.

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

## What a wallet holds

A Solana wallet's holdings are public on the chain: its SOL, and one token
account per coin it has ever held. The app reads them by address alone, so
the secret key is never touched on this path. Each holding is priced and the
wallet card and positions list draw them the way they draw every venue's.

- **Worth is USDC plus every priced coin.** Free is the USDC, every USDC
  account added up (a wallet can hold several of the same coin; the saved
  real answer has three of USDC). In trades is the coins. Open profit is
  zero, because nothing yet records what a coin cost.
- **A position is a coin you own.** No leverage, no margin, no liquidation,
  no funding. Its badge in the positions list says "Owned" and how many are
  held, in place of "Long 5×". The Margin and Liquidation columns show a
  dash. The row offers two buttons: Add, which opens the order window at
  today's price, and the bin, which sells everything the wallet holds of the
  coin. No flip, no leverage, no stop-and-target button, because none of
  those exists on a coin owned outright.
- **The entry price is blank, so profit is blank.** The chain does not
  remember what was paid. Every coin reads as sent in, the Unrealized column
  shows a dash, and the chart draws no entry line for it. The Journal knows
  what each swap paid (see "Fills come off the chain"), and reading the
  entry price back from those rows is not built yet.
- **A coin Jupiter has no price for shows "Unpriced"** in the Value column
  rather than $0.00 or nothing. It adds nothing to the wallet's worth. Every
  coin already in the market list takes the list's own price, at most a
  minute old and free; coins outside the list are priced one page of fifty
  at a time, held for ten seconds, so a wallet full of airdrops cannot spend
  the minute's budget. The first real read of this code was an exchange's
  hot wallet holding 4,280 different coins, which would have been 86 price
  requests against a budget of forty.
- **A priced coin worth under a cent is dust and is not a row.** An unpriced
  coin is kept whatever its size, because nobody can say what it is worth.
  An empty token account (a coin sold down to nothing) is not a holding.
- **SOL is a holding too**, priced through wrapped SOL, the mint Jupiter
  lists it under, and it is the first coin priced so a wallet full of
  airdrops can never push it past the page.
- **SOL kept back for fees.** A swap costs the network fee plus a priority
  fee, and buying a coin the wallet has never held pays about 0.002 SOL to
  open its token account. The card's "SOL for fees" row shows the SOL
  balance, and when it falls under 0.02 SOL, a working figure of 0.001 SOL a
  transaction times twenty, the card says so in one amber sentence: send a
  little SOL so a buy or sell never fails for want of a few cents.
- **Where the figures come from:** `getBalance` and `getTokenAccountsByOwner`
  for both the classic token program and Token-2022, `jsonParsed`. Amounts
  are the raw integer divided by the coin's decimals, never the node's
  floating `uiAmount`. Three chain calls per read, shared for two seconds so
  a poll and a settle ask once.
- **A wallet made before this task** has a saved baseline of zero (the fixed
  figure orders that do not compound size from), because there was nothing
  to read when it was saved. Nothing sizes an order off it while Solana
  takes no orders; a wallet added now records its worth at the time.
- Checked in the running app on 4 Sep 2026 with a freshly made, empty
  wallet: the row read "Connected $0.00", and the details window showed the
  amber sentence, Free $0.00, In trades $0.00 and SOL for fees 0 SOL. A real
  exchange wallet read through the same code answered $936,813,109.98 of
  USDC across 24 accounts and 4,180 coin rows.

## Buying and selling

There is no order book on Solana, so every order is a swap. Jupiter finds the
best path across the pools and builds the transaction, the app signs it with
the wallet's own key on the server, and Jupiter sends it. It fills at that
instant's price or it does not fill at all. The code is
`src/server/protocols/solana/orders.ts`.

- **Only a market order, and only when the price is reached.** The app's
  smart orders already send nothing until the price arrives
  (`../orders/smart-orders.md`); on Solana what is sent at that moment is the
  swap. A plain Buy or Sell placed at a level is always watched here, whatever
  the account's resting choice in Settings says, because there is nowhere for
  it to rest. "Swap now at the current price" in the order window sends the
  swap straight away.
- **The order window and the chart's right-click menu say Buy and Sell, not
  Long and Short.** A Sell is selling coins the wallet holds. There is no
  short side.
- **Checked in the running app on 4 Sep 2026** on JUP with the empty test
  wallet and the real-money switch off: the window read Buy, "Swap now at the
  current price", "Worst fill allowed %" at 0.5, and Jupiter answered a real
  quote for $10 (46.147 JUP at $0.2167 through the OKX DEX Router) followed
  by its refusal because the wallet holds nothing. On 4 Sep that refusal
  was Jupiter's own words, "Insufficient funds"; since 5 Sep it is the app's
  sentence (see "When Solana says no"). No console errors and no failed
  requests.
- **The cap on a bad fill.** "Worst fill allowed %" on the order window,
  half a percent unless changed, remembered with the window's other settings
  in the account's trading preferences and read by the engine when a watched
  level fires. Jupiter is told the cap as `slippageBps`, so a swap that would
  fill worse fails on the chain and moves nothing. A cap over 50, or nothing
  usable in the box, reads as the default.
- **Refused before signing, so nothing leaves the wallet**, when Jupiter
  cannot build the swap (said in the app's words, see "When Solana says
  no"), when the swap would move the price by more than the cap (a thin
  coin), or when Jupiter's quoted price is worse than the order's price by
  more than the cap. A buy at $100 with a 0.5% cap allows a quote up to
  $100.50 and refuses $101.
- **The quote before the order.** On a Solana market the order window asks
  Jupiter what it would do with the typed size, about a second after the
  typing stops, and prints it: "Jupiter: 0.098 SOL for $10.00 at $101.88,
  price impact 0.008%, via JupiterZ", or the sentence saying why the swap
  would be refused. It is information, never a block: a level waiting for a
  price is swapped later at that moment's quote. Each ask spends one of the
  reads' share of the minute.
- **The real-money switch sits between the quote and the signature.** With
  `TRADE_ENABLE_MAINNET` off on the server, or the Settings toggle off, a
  watched level that fires is quoted, checked, and then refused as switched
  off, so the whole path short of the send can be walked for free. Solana has
  no practice network Jupiter can swap on, so this switch is the only thing
  between a level and money.
- **A sell is capped at what the wallet holds.** The holding is read off the
  chain at that moment. "Sell only what I hold" (the box that means
  reduce-only elsewhere, only shown on a Sell) shrinks the sell to the
  holding. Without it, a sell of more than the wallet holds is refused before
  Jupiter is asked, and the refusal says how many are held.
- **The fill is read back from the chain, never taken from the quote.** After
  Jupiter reports the swap confirmed, the app reads the confirmed transaction
  from the node, up to fifteen times a second apart, and the Journal gets the
  size that really arrived and the dollars that really left. If the node has
  not shown the transaction after those tries, the answer says sent with no
  fill read yet, and the fills sweep below records it once the node has it.
- **Nothing retries, with one exception.** A swap sent twice could be a swap
  made twice. Jupiter busy, a timeout, or a refused execute is one answer
  and the level is left to its next pass. The exception is a swap Jupiter
  says expired before it was sent (its codes -1 and -1005, which it
  documents as never reaching the network): the app asks for one fresh
  swap and sends that, and if the fresh one expires too it says so.
- **The signature is the order id.** A swap has no order behind it, so the
  chain's transaction signature is what the Journal row and the fill both
  carry.
- **A stop or a take profit is a Sell placed at that price.** The chain holds
  no protective order, so the stop and target boxes are not on a Solana order
  window, the position row has no stop-and-target button, and an order that
  arrives at the engine carrying either says so in the Journal as protection
  not placed. Placing the sell smart orders automatically from a stop box is
  not built; today the Sell is placed by hand at the level.
- **Cancel and move refuse in plain words.** Nothing rests, so there is
  nothing to cancel or drag. The watched level itself is cancelled the way
  every watched level is, inside this app.

## When Solana says no

Every way Jupiter, the node or the chain can refuse a swap is turned into one
sentence that says what to do next. The code is
`src/server/protocols/solana/refusals.ts`, and the rule is Aster's: the known
refusals get a fixed sentence, and the text of an unknown one is thrown away.
Jupiter's words, the node's words and the chain's program errors never reach a
screen, the Journal or the app log. The one thing kept from outside is a
figure Jupiter states (how much SOL to top up) and the chain's signature.

- **Where the sentence shows.** The quote line in the order window (before
  anything is placed), the toast when a placed order is refused, the Journal
  row marked refused, and the reason beside a watched level the engine paused.
  All four already printed the shared refusal shape, so no screen changed.
- **What each refusal says.** The wording, in short:
  - Jupiter rationing (a 429 that came back after the app waited a second and
    asked once more): Jupiter is rationing requests, the free key allows 60
    calls a minute, wait for the minute to roll over. When the app's own
    budget said no before asking, the sentence carries the count, "spent 40
    of its 40 Jupiter calls this minute".
  - A missing or bad key (Jupiter answered 401 or 403): the key in
    `TRADE_JUPITER_API_KEY` was not accepted, get a free one at portal.jup.ag
    or take the line out to use the keyless host, then restart the app.
  - Price moved past the cap (the chain's program error 6001, on a
    transaction that landed and failed): nothing was bought or sold and the
    wallet is as it was, try again or raise "Worst fill allowed %". The
    signature is named so it can be looked up on solscan.io.
  - No SOL for the fee (Jupiter's order code 2, "Top up 0.01 SOL for gas"):
    send at least that much SOL to the wallet address on the wallet card.
  - Not enough USDC for a buy, or not enough of the coin for a sell
    (Jupiter's order code 1, or an order with no transaction and no code,
    which is what the free host answers for a wallet holding nothing): send
    USDC to the wallet address, or lower the size. On a sell, tick "Sell
    only what I hold".
  - The wallet could not cover the swap plus its fee on the chain (program
    error 6024): check the USDC and SOL on the wallet card. Signature named.
  - Expired before it reached the chain (Jupiter's -1 or -1005, after the one
    fresh swap also expired): nothing moved, try the order again.
  - No route (Jupiter's code 3 "under the fee-free minimum", a 400 on the
    order call, or words about a route or quotes): Jupiter found no pool with
    enough money in it to swap this coin at this size, try a smaller size or
    a coin that trades more.
  - The chain confirmed the swap as failed for any other program error:
    nothing moved, and the signature is named so it can be looked up.
  - Anything else, Jupiter's 500 "Something unexpected occurred" and the
    node's own errors included: "Solana refused the trade, and nothing
    moved. Try it again in a moment." plus the signature when there is one.
- **Why "nothing moved" is always true.** A Solana transaction is one step:
  the chain does all of it or none of it. A swap that fails on the chain, for
  slippage or anything else, leaves the wallet as it was, less nothing.
- **How each one reaches the screen.** A refusal that moved nothing is thrown
  as `LIVE_ORDER_REFUSED:` plus the sentence, which the order form prints as
  written, the Journal stores without the code, and the engine counts towards
  pausing a watched level. A rate limit is thrown as `EXCHANGE_BUSY:` plus the
  sentence, which the engine holds off from rather than counting, and a flow
  files under "the exchange is asking us to slow down". Every other refusal
  reads, on a flow, as "something refused it that this app does not have
  words for", the same as every venue's written sentences do; the Journal
  row under it carries the words.
- **Proved on real answers.** `refusals.fixture.json` holds the answers the
  tests run on: a bad key (401 from the keyed host), a mint that does not
  exist (500), a wallet holding nothing (an order with an empty transaction
  and no code), a broken execute (-2), all fetched on 5 Sep 2026 for free,
  plus the order and execute bodies Jupiter's response reference documents
  (codes 1, 2, 3, -1, -1005, 6001, -2005) and one made-up program error
  carrying secret-looking text, to prove the text goes nowhere.
- **Checked in the running app on 5 Sep 2026** on JUP with the empty test
  wallet: the order window's quote line read "The wallet does not hold enough
  USDC for this buy, so nothing was sent. Send USDC to the wallet address on
  the wallet card, or lower the size." for $10 and $200, and "The wallet has
  no SOL to pay the network fee…" for a size no pool could fill. No console
  errors and no failed requests. The bad-key case needs the key changed in
  `.env` and the server restarted, so it is proved by the test alone.

## Fills come off the chain

Solana has no fills endpoint. The record is the chain itself, so the fills
reader reads it.

- **One listing call a sweep** asks the node for the wallet's latest fifty
  transactions with the time of each. Those newer than the sweep's start,
  and not already read, are fetched one at a time and read as fills, at most
  ten new ones a sweep, because the public node rations by address.
- **What counts as a fill:** this wallet's USDC moved one way and exactly
  one other coin moved the other way. A deposit moves one coin and no USDC; a
  swap of SOL for some other coin moves two coins and no USDC. Neither is a
  fill, because neither is a buy or sell the app prices in dollars. The saved
  fixture holds one of each.
- **SOL is read from the wallet's own balance** with the fee it paid added
  back, and only when no token moved, because buying any other coin also
  costs a little SOL in fees and the rent of a fresh token account. Wrapped
  SOL the wallet keeps counts as SOL.
- **The fill's price is dollars moved divided by coins moved.** The saved
  fixture is a real buy of 4 Sep 2026: $0.20 of USDC for 0.001962107 SOL,
  which is $101.93 a SOL.
- **The fee** is the transaction fee in SOL times the last known SOL price,
  and zero when Jupiter's market maker paid it (a "gasless" route). Nothing
  on the chain states what a sale made, so every fill's profit reads as not
  stated, the same rule as KuCoin's.
- **A sale of a coin that was sent in, never bought here, is a fill but not
  a round trip.** The Journal pairs a sell with the buy that opened it; with
  no buy on record the sell stands alone in the fills and the trades list
  starts at the next whole trade, the same as every other venue.
- **Signing trusts Jupiter's transaction.** The app signs the transaction
  Jupiter built without reading its instructions, which is how every Jupiter
  client works. The protection is the wallet rule: keep in this wallet only
  what you mean to trade.
- **A transaction once read is remembered**, fill or not, up to two thousand
  of them, so a sweep costs the listing call and nothing else once the wallet
  is caught up.

## The first real swaps

Nothing here yet. The first $10 buy and the first $10 sell are Tyler's to
place with the switch on; their signatures go here when they are.

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

## How the prices move

Jupiter publishes no websocket, so the Solana page asks. That is a refresh
and never a live feed, and the difference is what keeps it on the right side
of `../rules/trading-rules.md`.

- **Every ten seconds, for the 200 busiest markets on the page.** Four pages
  of fifty coins, so four requests a refresh and 24 a minute. The market
  list's own two a minute sit on top, which leaves 14 of the 40 a read is
  allowed, and never touches the 20 kept back for swaps.
- **Only the price is refreshed.** The day's move and volume come from the
  list's own read; overwriting them with nothing would blank the columns
  beside a price that had just moved. The market list row shows the day's
  move and volume rather than the price, so the tick shows in the market
  picker's Last price column and on the chart, not in the panel rows.
- **The trading engine never reads it.** When the engine acts it asks for a
  price at that moment, through the same rationed, paged, briefly shared read.
  A refresh and a settle in the same second cost one request between them.
- **The server refuses a refresh for any venue that publishes a socket.**
  The rule is enforced where it cannot be forgotten rather than left to
  whoever writes the next dashboard.
- **A hidden tab asks nothing.** It picks up again when it is looked at.
- **A failed or refused turn changes nothing on screen** and waits for the
  next one. There is no "prices may be stale" label: one existed briefly and
  Tyler had it removed on 7 Aug 2026, and nothing has claimed freshness since.
- **Measured in the running app on 4 Sep 2026:** three refreshes in 35
  seconds, none at all across 25 seconds with the tab hidden, and SOL moving
  from $101.16 to $101.46 inside one 26-second window.

**Why not a socket.** Solana's own node does push: `accountSubscribe` on a
live pool answered and pushed changes within seconds, free and keyless. It is
not enough on its own, because a coin's price here is the best path across
several pools rather than one pool's numbers — eight of the day's busiest
coins routed through nine different venues, and most took two or three hops.
Pricing from the chain means rebuilding that routing, which is its own piece
of work.

## The chart

Neither Jupiter nor the chain publishes candles, so a Solana chart is
borrowed or grown. Which one it is, the chart says.

- **44 coins borrow Binance's history**, pinned by mint address. SOL, JUP,
  BOME, POPCAT, FARTCOIN, PUMP and the rest draw years of bars, and the
  header reads "History from Binance" beside the market name.
- **Pinned by mint and not by ticker, because anyone can mint a coin here and
  call it BTC.** Each of the 44 passed four checks on 4 Sep 2026: Jupiter
  vouched for it, exactly one verified Solana coin carries that ticker,
  Binance lists it, and it holds at least $200,000 of liquidity. TRUMP was
  refused because Solana has two verified coins by that name; PORTAL was
  refused for holding $4 of liquidity.
- **Every other coin grows its own chart**, one-minute bars written from the
  prices the screen is already refreshing. Volume is zero on those bars
  because a price carries none, and a minute nobody watched has no bar at
  all rather than a flat line.
- **A coin with neither says so**, in one sentence, with nothing drawn behind
  it pretending to be a chart.
- **No Solana market can be backtested.** Borrowed history is Binance's and
  recorded history has holes, so either would read as a real result.
  `../backtests/market-selection.md` says it there too.

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
  The chart has no equivalent and needs none: a venue with no candles of its
  own answers with none rather than refusing, and the chart either draws
  borrowed bars or says there is no history yet.
- Solana no longer uses the markets one, because there is no longer a state
  where it cannot list markets.

## Where things are

- `src/server/protocols/solana/client.ts` — the node and Jupiter addresses,
  the key, the one-a-second pacing, the timeout, the one retry.
- `src/server/protocols/solana/wallet.ts` — packing, proving, deriving and
  making the wallet.
- `src/server/protocols/solana/account.ts` — the holdings: the three chain
  reads, the pricing rules, the dust rule and the SOL fee reserve.
- `src/server/protocols/solana/account.fixture.json` — a real exchange
  wallet's chain answers of 4 Sep 2026, trimmed to ten accounts, and
  Jupiter's prices for them the same minute.
- `src/server/protocols/solana/markets.ts` — the market list, the lookup,
  the engine's prices, each listed coin's decimals, and the empty candle
  answer.
- `src/server/protocols/solana/orders.ts` — the quote, the swap, the sell
  cap, the confirmed-transaction read and the fills reader.
- `src/server/protocols/solana/refusals.ts` — every no from Jupiter, the
  node or the chain as one sentence with a next step; the outside text
  stops here. `refusals.fixture.json` holds the real answers it is tested on.
- `src/server/protocols/solana/swap.fixture.json` — Jupiter's real answer to
  "buy $10 of SOL" and two real confirmed transactions, all of 4 Sep 2026.
- `src/server/protocols/solana/jupiter.fixture.json` — Jupiter's real
  answers of 3 Sep 2026, trimmed to the records the tests need.
- `src/server/protocols/solana/base58.ts` — the alphabet Solana writes keys
  in, thirty lines rather than a package.
- `src/lib/api/trade/protocols.ts` — what the browser knows: the capability
  flags (markets, accounts and orders on, and `ordersAreSwaps`, which is what
  the order window reads to show the quote and drop the resting shape) and
  the Add wallet window's labels and help.
- `src/lib/api/trade/live.ts` — `loadSwapQuote`, the door the order window
  asks the quote through, and the rule that a swap venue's plain order is
  always watched.
