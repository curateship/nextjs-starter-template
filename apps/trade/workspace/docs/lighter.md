# What Lighter does differently

Trade reads Lighter's perpetual markets, charts and funding at
`/admin/lighter`, on mainnet only, holds a connected Lighter wallet, shows what
it holds, and places, moves, cancels and closes orders on it with a stop and
targets. This file records only behaviour the app runs today or a live response
proved.

Every figure below was measured against Lighter's live API on 26 August 2026,
between 14:05 and 14:55 UTC. They are dated readings, not numbers the app
assumes will hold.

## The two things that shape everything else

- **Lighter's catalogue advertises no fees, and real trades still carry one.**
  Every one of its 212 active markets reported a maker fee of 0 and a taker fee
  of 0 in the catalogue. Actual trades read from its own trade history on
  26 August 2026 showed otherwise: one BTC fill carried a taker fee of 100 and
  a maker fee of 28, in millionths of a dollar, so a fraction of a cent on a
  $3.94 trade. The catalogue's zeros describe a fee tier rather than a promise,
  so the Journal takes each fill's fee from the trade itself and never assumes
  it is nothing.
- **A Standard account gets sixty requests a minute, and the socket spends the
  same sixty.** Lighter counts REST calls and socket messages against one
  allowance. That is why the socket does nearly all the reading here. Premium
  raises the cap to 24,000 a minute, but only by staking LIT, which Tyler has
  not done, so 60 is the number the code enforces.

## Markets

- Lighter listed 229 perpetual markets. 212 were active and 17 were inactive.
  Its spot list came back empty and is skipped either way.
- Trade lists 194 of the 212. The 18 it leaves out have never traded: no
  volume, no open interest, and Lighter answers zero candles on all six
  timeframes for them. KORU, GME, ARM and AVGO were among them. Lighter still
  prices those markets, because the mark comes from an outside index rather
  than from trading, so a price alone is not proof a market can be charted.
- The test is whether a market has EVER traded, not whether it traded today.
  Two markets that day, NZDUSD and GEV, had no trades since midnight but real
  history behind them. NZDUSD charts 1,673 four-hour bars.
- Every Lighter perpetual settles in USDC.
- Lighter states no kind of market. Its 212 active markets mixed 111 coins, 55
  US stocks, 14 non-US stocks, 11 metals and fuels, 9 currency pairs and 12
  others. The closest thing to a category is an undocumented `strategy_index`,
  and it groups cleanly until its seventh group, which holds a bond yield, two
  private-company markets and two memecoins together. Trade does not guess from
  it: every row says "other" and the market picker shows no category tabs.
- Lighter states how many decimal places a price may have, not a tick. BTC
  allows one decimal place, so its price step is $0.10. LAUNCHCOIN allows six,
  so its step is $0.000001. Trade turns the decimal count into the step the
  chart snaps a dragged order to.
- Lighter states the smallest order two ways and Trade keeps both. Every market
  read had a $10 minimum dollar value. BTC's smallest coin size is 0.0001 BTC,
  about $7.86 at that morning's price, so the $10 floor is the one that binds.
- Top leverage comes from Lighter's most generous margin requirement, stated in
  hundredths of a percent. BTC's 200 means a 2% margin floor, which is 50x.
  LAUNCHCOIN's 3,333 is 3x.

## The three prices

Lighter states a mark price, an index price and a last trade. It liquidates and
charges funding on the mark, so Trade uses the mark everywhere the other four
venues use theirs. The chart still draws traded prices, so the list and the
newest candle do not have to agree.

One BTC comparison across all five venues at 14:29:05 UTC, against Lighter's
$78,204.30 mark:

| Price | Gap from Lighter's mark |
| --- | ---: |
| Lighter index | $15.50 above |
| Lighter last trade | $0.90 below |
| Hyperliquid mark | $2.70 above |
| Phemex mark | $9.00 below |
| KuCoin mark | $23.62 below |
| Aster mark | $25.50 below |

Lighter's own three prices sat within $16.40 of each other. The five venues'
marks spread $28.20 from top to bottom, so which venue a position sits on
matters more than which of Lighter's prices is read.

## Funding

- Lighter settles funding every hour. Three days of BTC rows came back 72 rows
  with every gap exactly 3,600 seconds. Nothing about this was assumed; the
  docs showed hourly rows and the measurement confirmed them.
- Lighter states the rate as an unsigned percent with a separate `direction`.
  "long" means longs paid shorts, which is the positive sign the app uses, so
  "short" comes back negative.
- Its `funding-rates` endpoint quotes Binance, Bybit and Hyperliquid beside its
  own rate, as the eight-hour figure so they can sit side by side. Lighter's own
  hourly charge times eight matched its quoted rate exactly, so Trade divides
  the quote by eight to show one hour. It reads only the row that says
  "lighter", never the Binance row quoted next to it.

## Charts

- Lighter hands over at most 500 bars per request. A 700-hour ask returned the
  newest 500 rows, so every window is cut to 500 and the oldest bars are never
  silently dropped.
- The four-hour chart loads everything Lighter has, the way the other venues do.
  BTC returned 3,518 four-hour bars back to 17 January 2025.
- **The market's first day is what makes that cheap.** Walking backwards until a
  page comes back empty always wastes a batch, and on a young coin it wastes
  most of the walk. Lighter states each market's first day in the catalogue
  Trade already holds. Measured on BTC: 18 requests walking blind, 8 once the
  walk stops at the birthday, for the same 3,518 bars in 0.7 seconds. Funding
  history and backtest windows are pulled forward to that day for the same
  reason.
- All six timeframes work on mainnet. BTC returned 499 bars on 1m, 5m, 15m, 1h
  and 1d, and 3,518 on 4h.

## Mainnet only

Lighter runs a practice network and Trade does not carry it. Decided 26 August
2026, after measuring what was actually there:

- It listed three markets: BTC, ETH and LIT. All three were created on 24
  August 2026, two days before the measurement, so it had just been reset.
- All three showed a last trade price but zero volume and zero trades.
- BTC returned zero candles on 1m, 1h, 4h and 1d, including a 400-day daily
  window. The practice network serves no candle history at all.

So there was nothing to look at, and the `/admin/lighter` page has no `?network`
setting at all. A pasted one is dropped from the address rather than accepted
and quietly overridden. This matches Phemex and KuCoin, which are mainnet only
for their own reasons.

Three places refuse another network rather than guessing, because a call for
one is a bug in this app rather than something a person did:

- The REST client refuses before it builds a request, so nothing is sent to a
  host the app should never talk to.
- The socket address refuses the same way.
- The price feed opens nothing and reports itself unfresh. It does not throw,
  because one stale saved market key must not take down an engine pass covering
  five exchanges, and it does not connect-and-retry, because that would loop on
  the same refusal forever. Reporting itself unfresh sends the caller to the
  REST path, where the refusal is named once and out loud.

**What this costs.** There is now nowhere to rehearse a Lighter signature before
real money is involved, and the signing work is the part most likely to fail.
The order path will be proven the way Phemex's and KuCoin's were: signed READS
first, which cost nothing and move no money but still prove the signature is
accepted, and only then one deliberately tiny real order behind both real-money
switches.

## What a minute costs

Sixty requests a minute, REST and socket together. Background reads stop at four
fifths of that, so 48, leaving the last twelve for order work when trading is
switched on. Each measured exactly:

- The market list on its own: **2 requests** — the catalogue and the funding
  rates.
- Opening the page on its default four-hour chart: **10 requests** — those 2
  plus 8 for the full history.
- A steady minute with a one-minute chart open: **1 request**, as each bar
  closes. Plus one or two socket keepalive frames.
- Re-opening the same four-hour chart inside the following minute: **0
  requests**. The history is held for a minute.

So the worst ordinary moment, opening the page, spends 10 of the 48 background
allowance, and a normal minute spends 2 or 3. Nothing measured came near the
cap.

**Those figures are for a page with no wallet on it.** Connect a wallet and the
account has to be read too, and that is a different order of cost — see the
next section, which is where the allowance actually went.

## The account is pushed, not polled

**Measured 26 Aug 2026: one idle tab on the Lighter page, nobody clicking, was
spending 46 requests a minute of the 48 allowed.** The chart asks last, so the
chart was what got refused — and it said "The chart could not load. Nothing is
wrong on your side", which sends a person hunting for a broken chart when the
allowance was simply gone.

The 46, counted at the budget over 92 seconds:

| what asked | a minute |
| --- | --- |
| the position, over REST | 15 |
| the resting orders, over REST | 14 |
| the balance — the SAME endpoint, from a second caller | 9 |
| the chart | 3 |
| the Journal's sweep | 2 |

Lighter was the only one of the five venues reading an account this way.
Hyperliquid has `open-orders-feed` and `user-fills-feed`, Aster has
`user-stream`, Phemex and KuCoin each have `private-feed`. Lighter had only its
price socket, because the stage that would have built the rest was still
unbuilt — and it is the one venue that cannot afford to poll, at sixty a minute
against Hyperliquid's thousands.

Now it reads three socket channels, and the same tab spends **17 a minute**:

- `account_all/{index}` — the positions, and the trades that say the Journal
  should be reconciled. **No auth.**
- `user_stats/{index}` — collateral, portfolio value and available balance.
  **No auth.** `account_all` does not state the money; this is where it comes
  from.
- `account_all_orders/{index}` — the resting orders. **This one needs the auth
  token**, and refuses with `20001 invalid param : auth field is required`
  without it. It is the only part that needs the signer, so a server with no
  signing files still shows a position and a balance.

The pushed rows carry exactly the fields the REST account read already parses,
so both paths end at the same two converters in `account.ts`. Two readers of
one payload is how a socket and a REST path quietly start disagreeing about
money.

**Silence is not staleness.** This is the one thing that separates an account
feed from a price feed here. Prices tick several times a second, so twelve
seconds of quiet means a broken line. An account that is not trading says
nothing at all after its opening snapshot, sometimes for hours. Ageing it out
on a timer tore the socket down and rebuilt it forever, and left every read
falling back to REST — the exact thing the feed exists to stop. So the snapshot
stands until Lighter replaces it or the line closes.

### It went round in a circle, and that was the real problem

Reading the account down a socket was not enough on its own, and the reason is
worth keeping.

**Lighter drops the socket when the minute's allowance is spent.** Measured
27 Aug 2026: the line died about every thirteen seconds. Each death wiped the
snapshot, so every four-second poll went back to REST, which spent more of the
allowance, which kept the socket dead. It fed itself, and the chart — which
asks last — was refused throughout.

Three things broke the circle, and all three were needed:

1. **Each program takes half the cap.** The website and the trading engine are
   separate containers with separate memory, so each counted its own sixty
   while Lighter counted the pair against one sixty. Both stayed politely under
   a limit that did not exist. Each now works to thirty, twenty-four of it for
   reading.
2. **A REST answer stands for ten seconds.** Only ever reached when the socket
   is down, and it is what lets the bucket drain so the socket can come back.
   Hyperliquid holds its portfolio for four seconds; ten here because Lighter's
   allowance is twenty times tighter. Anything this app sends the exchange
   drops the held answer first, because a cancelled order still being listed is
   how a stop gets taken off a position that still needs it.
3. **A line that keeps dying waits longer each time.** The backoff used to
   reset on the first frame, so every death was followed by a one-second
   reconnect and three more subscribe frames — spent from the bucket that was
   already empty. Only a line that stays up a full minute counts as recovered.

**The Journal is only read while you are looking at it.** It is history: it
changes when a fill lands and at no other time, so keeping it current behind
another tab bought nothing and cost a trade-history read every thirty seconds
forever. A wallet that has just filled is still read whatever tab is open, so
the bell notice and the row never disagree.

The engine also follows the Journal's one-minute floor. A refused trade-history
read now starts that wait instead of being tried again on every one-second
engine pass. Prices, positions, and resting orders keep moving during the wait,
and the Journal catches up on the next allowed read.

Measured on one idle tab, nobody clicking:

| | requests a minute | refused |
| --- | --- | --- |
| before any of this | 46 | 11 |
| socket only | 25 | 11 |
| with all four changes | **12** | **0** |

The twelve left are the chart, the catalogue, and the held REST reads for the
seconds when the socket is still coming up.

### Who loses when the minute runs short

Even at twelve a minute the chart was still being refused, and the reason was
not the traffic — it was the order things ask in. Every read used one priority,
so the idle reads, which go first on every poll, could spend the whole ceiling
before the chart asked at all. The person then saw "this exchange's allowance
is spent" about the one request they were actually waiting for, while nothing
they had asked for had taken it.

There are three tiers now, each with its own ceiling out of the process's
share:

| tier | what it is | website | engine |
| --- | --- | ---: | ---: |
| background | the account, resting orders, trade history, catalogue | 24 | 12 |
| watched | a chart somebody just opened | 34 | 17 |
| order | real money | 40 | 20 |

So idle polling can spend twenty-four and be refused, and the chart still has
ten in hand. Orders are never refused before either of them.

The fresh price needed to place or reshape a live grid, change End Grid, or
place a DCA ladder counts as order work. The price used to count as an idle
catalogue read, so a full background tier could refuse the change while sixteen
requests were still being kept for orders. Those actions can now use the kept
requests. A real firewall hold from Lighter still refuses a change until its
minute clears. A refused adjustment says the changes were not saved and the
existing grid is still running. It never uses the new-grid phrase "Nothing was
placed."

### What the chart asks for, and why Lighter asks for less

**None of the above was what kept refusing the chart.** Measured 27 Aug 2026
by clicking through Lighter's market list, which is what a person actually
does: the refusal came after eight coins, and eighteen of twenty-five clicks
were refused. The count in the message said `34 read, 0 socket` — not one
socket frame, so the feed, the polling and the split were all working. It was
the chart.

Every other venue's four-hour chart draws two years first and then chases the
whole history behind it. That is nine pages of five hundred bars, then eight
more: **seventeen requests for one coin.** Fine on Hyperliquid. On Lighter it
is a quarter of the minute for a coin somebody glanced at.

So Lighter, and only Lighter:

- **The first draw asks for ninety days**, not two years. One request.
- **It does not chase the full history.** Scrolling back asks for more on its
  own, which is when somebody has actually said they want it.

| clicking through 25 markets | before | after |
| --- | ---: | ---: |
| first refusal | after 8 coins | after 20 |
| clicks refused | 18 of 25 | 4 of 25 |
| at a normal clicking pace | — | **0 of 14** |

The cost is that a Lighter coin opens on three months of history rather than
two years. Scroll back and the rest arrives.

### What a browsing session costs now

Thirty coins clicked in a row with timeframe switches every fifth, measured
27 Aug 2026 at the budget itself:

| | requests | busiest minute | refusals |
| --- | ---: | ---: | ---: |
| before the shorter first chart | — | over 34 | 18 of 25 clicks |
| after it | 55 | 21 of 34 | 0 |
| holding a fallback answer 30s | 37 | 17 of 34 | 0 |
| Journal floor at a minute | **36** | **16 of 34** | **0** |

The chart is six of those thirty-six, for thirty coins — the held history is
doing its job. What is left is the account and its resting orders, and those
are only asked at all when the socket is not answering.

**The socket used to rebuild itself constantly, and that is fixed.** Three
readers open the feed in the same poll — the position, the balance and the
resting orders — and each could start its OWN connection, every one tearing
down the last. Lighter saw a burst of handshakes and refused some outright
with `1002`, a line that never upgraded, which read as a flaky socket and sent
every account read back to REST. One dial at a time now, the same flag Aster's
user stream has carried from the start. Over ninety seconds the line is now
built three times rather than seven, and serves the reads in between.

**The two programs take different shares, forty and twenty.** Splitting the
sixty down the middle was the first attempt and it caused the very thing it
was meant to stop: the website's ceiling halved, and a chart somebody had just
opened was refused by our own counter while the engine sat on an allowance it
was not using. The engine reads Lighter only for wallets running ladders, in
short bursts; the website serves a person watching a screen. They still add to
sixty, so the pair can never breach the one allowance Lighter counts. The
engine says which it is at boot, in `worker/src/index.ts`.

Lighter's docs list a weight per endpoint and say unlisted ones weigh 300. None
of the market-data reads are on that list, so each declares 300. A Standard
account's cap counts requests rather than weight, so the declared weight only
feeds the snapshot and this file's arithmetic.

## Live prices

- One socket per network carries everything that ticks. It subscribes to
  `market_stats/all` for the list and one `candle` channel per open chart.
- Sixty seconds on one read-only socket received **490 messages carrying 7,636
  market rows and marks for all 229 markets, for three frames sent and not one
  REST request.** Watched in the browser for twenty seconds, BTC's daily volume
  moved from $741m to $742m with zero REST calls to Lighter.
- **Lighter closes a socket whose client has been silent for two minutes, and
  pushed data does not count.** Only frames the app sends keep the line open, so
  both the server hub and the browser ping every 50 seconds. Each ping spends
  one of the 200 client messages a socket may send in a minute, and one of the
  sixty requests.
- A socket that goes quiet for twelve seconds is treated as stale, torn down and
  reconnected, backing off 1, 2, 5, 10 and then 30 seconds. A hidden browser tab
  drops its socket; a visible one reconnects and refetches what the gap missed.
- The public socket is opened with `?readonly=true`. It carries public prices
  and never an account.

## Refusals

- A 429 or a 405 stops Lighter requests on that network for **sixty seconds**,
  not the twenty the other venues use. Lighter's own docs state a static
  60-second firewall cooldown, so asking again at twenty would spend a third of
  the next minute's sixty requests on refusals. The refused request itself never
  sleeps or retries; the caller keeps what it has and asks on its next poll.
- The hold is kept per network, so it stays correct if Lighter ever gains a
  second network worth carrying.
- Lighter answers `code: 200` inside a healthy body. Any other code is a
  refusal, and Trade keeps only the number. Its free-form message is discarded
  before anything reaches a screen or a log.

## Signing in

Lighter signs nothing the way the other four venues do. It runs its own chain,
and its signatures are Poseidon hashes over its own curve rather than the
Ethereum signing Aster and Hyperliquid use, so the library that does it is
Lighter's own compiled one, vendored into
`src/server/protocols/lighter/signer/`. `PROVENANCE.md` beside it records the
exact file, the commit it came from and its checksum.

- The signer is 7.7 MB of WebAssembly that Lighter publishes already built,
  plus Go's own `wasm_exec.js` glue at the version that built it. Neither file
  is edited here.
- **It runs.** That was the one thing most likely to fail in the whole Lighter
  job, so it is proven by a test that really loads it and really signs, not by
  assumption. Under Node 24.1.0 it starts in about a second and signs in about
  two and a half milliseconds.
- Nothing outside that one folder may load either file. The protocol fence
  fails the build if anything does, because a second way into the signing path
  is a second place a private key could go.

## What proves a key belongs to you

**A signature proves nothing on its own here.** Any forty random bytes sign a
Lighter auth token perfectly well, so signing one and getting a result back
says only that the maths worked. What matters is whether Lighter has that key
registered against your account.

So the check is a comparison. Trade derives the public key from what you
pasted, asks Lighter which public keys it holds for the account, and looks for
a match. No signature, no spent order, and one clear answer.

That comparison also settles something nobody would otherwise know to ask.
Lighter files each key in a numbered slot, and every signed request has to name
its slot. Matching the public key finds that number, so nobody has to read it
off a screen and type it in.

- The Add wallet window asks for two things: the wallet address you trade with
  on Lighter, and the private key of an API key you made on Lighter's own site.
- Your wallet's own Ethereum key is never asked for and never needed.
- Trade finds your account number itself. One address can hold several accounts
  on Lighter, the main one and its sub-accounts, handed back in no promised
  order — the lowest number is the main account, and that is the one taken.
- **A Lighter API key is 40 bytes, not 32.** Its own signer refuses any other
  length, naming the length it wanted. This matters more than it sounds: the
  shared wallet dialog has a shape check for Ethereum agent keys that insists
  on 32, and while Lighter's key was wrongly flagged as one of those, the
  window refused every real Lighter key with "a key is exactly 64 characters"
  before it could be saved. Lighter's key is not an Ethereum key at all, so
  that check is off and the real length rule lives in the Lighter connector.
- A key that is the wrong length is refused before a single request is spent
  on it. A key that is the right length but not registered is refused after
  two. Neither refusal ever repeats the key back.

### Two things that had to be right for a save to work

Both were found by pasting a key into the running app, not by any test, and
both showed up as the same unhelpful "That did not save. Try it again."

- **The pasted key arrives under one of two names.** The wallet window sends
  it as `agentKey` when a venue's secret is an Ethereum agent key, and as
  `secret` otherwise. Lighter's is not an Ethereum key, so it comes as
  `secret`. While the Lighter connector read only `agentKey`, every save
  arrived with an empty key and was refused as malformed — with a key plainly
  sitting in the field on screen.
- **Only two refusal codes carry their reason to the screen.** The wallet
  window reads the sentence after `KEY_NOT_APPROVED:` or
  `WALLET_POSITION_MODE:` and drops everything else, so Lighter's own
  carefully worded refusals were being thrown away. They now use the shared
  code, and the reason arrives with the refusal.

## What a connected wallet shows

The account panel reads Lighter's account endpoint, which is public: an account
can be read by its number with no signature at all. The credential is still
needed, because the number itself is found from your address and your key.

- Account worth, free cash, money in trades and open profit. Checked against a
  live account on 26 Aug 2026: worth $3.708185, free $2.771356, and money in
  trades came to $0.936829 — the same figure to the cent that Lighter states
  as that account's own margin requirement.
- Positions carry Lighter's own size, entry price, liquidation price and
  leverage. Lighter states direction as a separate flag beside an unsigned
  size, so a short is put back together here rather than read off one number.
- **Leverage is a percent turned around.** Lighter states a position's margin
  requirement as "2.00", meaning 2%, which is 50x. Note the units differ from
  the market list, where the same idea is stated in hundredths of a percent.
- A cross position leaves its allocated margin at zero and states the percent
  instead, so its margin is worked out from the percent. That reproduced
  Lighter's own account-wide figure exactly.

## The signer is two files, and a build leaves them behind

Learned the hard way on 26 August 2026. Lighter's signer is a `.wasm` binary
and Go's glue script — data, not code — so a bundler compiles everything
around them and does not carry them along. They existed only under `src/`.

On a development machine the app runs straight from source, so it worked
perfectly. On the deployed server the files were simply not there, and the
result was silent in the worst way: every Lighter read failed on a missing
file, the engine stepped over that whole wallet, and a watched Lighter order
sat at a price it had already reached without one line in the Journal to say
why. The other four venues carried on normally, which made it look like a
Lighter problem rather than a missing file.

Two things stop it happening again:

- The worker's own Dockerfile copies both files next to the built bundle,
  which is the first place the loader looks.
- The loader searches the places a build can put them and, finding none,
  refuses with a sentence saying the signing files are missing and listing
  where it looked. A missing file must never again read as a bad key.

**Anything that loads a file by path needs proving against a real build**, not
against the development server. The signing itself was well tested and still
none of it ran in production.

## Lighter decides by country, and only for orders

Measured 26 August 2026. Every read answered normally from a machine in
Canada — markets, candles, funding, accounts, and even `nextNonce`, which
belongs to the order path. `POST /api/v1/sendTx` and `sendTxBatch` answered
`20558`, "You are accessing Lighter from a restricted jurisdiction".

- It is decided by where the server sits, not by the key or the account, so a
  new API key changes nothing.
- It is worth naming apart from every other refusal because it arrives looking
  exactly like a rejected key, and somebody could spend an afternoon making
  new ones.
- **The practice network is not blocked.** The same machine reached testnet's
  `sendTx` and got ordinary validation errors back.
- The database this app uses sits in Germany. If the app runs beside it, it is
  very likely able to place Lighter orders even though a Canadian laptop
  cannot — but that has not been proven, and it can only be proven by the
  server actually sending one.

**What this costs.** The order path cannot be exercised end to end from a
development machine here. Signing can: the signer runs locally and produces a
complete signed transaction, so everything up to the moment of posting is
checked by tests. Only the posting itself is unproven, and the first proof of
it will be a real order from the server.

## Closing, and the expiry that has to be zero

Closing is the one order here that is not post-only, because post-only refuses
to cross the spread and crossing is exactly what closing does. It goes as a
reduce-only limit priced three percent through the mark, immediate-or-cancel —
still a price, never a market order.

**Its expiry must be zero.** An order that lives only for this instant cannot
also carry one weeks away, and Lighter's own signer refuses the whole
transaction with "OrderExpiry is invalid". A close built with the usual
28-day default never reached the exchange at all, and the screen said only
"That did not go through. Try it again."

## Every refusal now carries its own words

Only a few refusal codes reach a screen with their sentence intact, and the
ones this connector invented were not among them. So every Lighter refusal on
the order path — the country block, a missing signer, a price that will not
fit — arrived as "That did not go through. Try it again.", which is the least
useful thing the app can say about real money and, for the country block, an
instruction that can never work. The order path now badges them so the reason
survives to the screen.

## Stops and targets

- **Every order this app sends Lighter is a limit with a price on it**, stops
  included. Lighter has a plain stop-loss that fills at whatever the market is
  when it triggers, and it is never used. The stop-loss LIMIT and take-profit
  LIMIT kinds are, with the limit priced three percent through the trigger on
  the side the order will cross to — so a stop that fires actually gets out
  instead of resting above a market that has already fallen past it.
- Every protective leg is reduce-only, so it can only ever shrink the position
  it guards and can never open one the other way.
- **Lighter has no "whatever the position holds" flag**, so a leg names a
  number of coins. When the position grows or shrinks, the old legs come off
  and fresh ones go on at the new size. The cancels go first: a leg left
  behind sells the position a second time.
- An entry asked for with a stop reports its protection as "partial", because
  Lighter cannot carry one on the entry itself — the legs go on just after the
  position opens. Reporting "ok" for legs that were not sent with it would be
  the worst kind of lie here.

## Leverage, and the cash behind a position

Lighter takes each as its own transaction, and carries neither on the order —
an order simply uses whatever the market was last told. **So the leverage on
the screen is sent before the first order on a market**, or the position would
open at whatever was set last time while the screen said something else.

Leverage is stated in hundredths of a percent of the position's value, so 50x
is 2% is 200. That is the same unit the market catalogue uses for its own
maximum, and **not** the unit a position reports — a position says "2.00", a
plain percent. Mixing the two sends a leverage a hundred times off on real
money, so the conversion lives in one function and is pinned by a test.

That test also caught a real hole on the day it was written: 20,000x rounds to
one whole unit, and one unit *is* 10,000x. It would have been sent without a
word. Any leverage that does not survive being turned back into a number is
now refused instead.

Taking margin back out is refused where the position is not isolated, and the
amount goes in whole millionths with the direction in its own field, so it is
never negative.

## A watched level is refused when it is saved, not when it fires

Worth keeping even though it no longer bites Lighter, because it will bite the
next venue added. A watched order sends nothing to the exchange until the price
arrives — that is the whole point of it — so a venue with no order path has
nothing to reject at the moment the level is saved. One sat in the Watched tab
looking like it was working, and the first sign of trouble would have been a
refusal at the price, repeated on every engine pass. All three doors check the
venue first: a plain watched level, a DCA ladder or grid, and an order that
fills straight away. Practice wallets are exempt, because they never reach an
exchange at all.

## Still to prove

- **A day with all five wallets trading at once**, with Lighter blocked at the
  network on purpose while the other four carry on. That is a real day's
  running, not something a test can stand in for.
- **What Lighter pushes on `account_all`'s `trades` field during a real
  trade.** It was empty every time it was watched. Until that is seen, a pushed
  trade is treated as "go and read the history", never as a fill in its own
  right — the Journal is still written from Lighter's own trade history, which
  has been checked against real fills. The saving is in how often that history
  is read: when something happens, and otherwise five-minutely, instead of
  every thirty seconds forever. It can never be read more often than the poll
  it replaced, whatever the socket does.
