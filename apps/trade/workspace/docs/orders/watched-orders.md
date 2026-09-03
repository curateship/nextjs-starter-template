# Watched orders — how a plain order works now

Since 18 Aug 2026 a plain order does not rest in the exchange's book. The app
watches the price, and only when the market actually reaches the level does it
start placing anything. This doc says how that works, what dragging does for
each kind of order, and what the trade-offs are.

The rules this machinery must add up to are stated once, in
`../rules/trading-rules.md` — that file outranks both this doc and the code.

The code lives in `src/lib/trade/order-style.ts` (the setting),
`src/lib/trade/watch-order.ts` (what a watched level is),
`src/server/trade/smart-watch.ts` (the engine that works it), and
`src/server/trade/live-orders.ts` / `src/server/protocols/hyperliquid/orders.ts`
(the real-money doors).

## The two styles

- **Watch** (the default): the level stays inside this app as a row in the
  database. Nothing is sent to the exchange until the market touches the
  price. The money stays free until that moment, the level is nobody else's
  business, it never shows in the public book, and it does not use up the
  exchange's cap on open orders. The watch remembers which side of the level
  price started on. A Long above today's price waits for the rise and a Short
  below it waits for the fall. A Long below today's price also waits for the
  fall, and a Short above it waits for the rise.
- **Rest** (the old way, still choosable in Settings → Trading engine): the
  order sits on the exchange itself. It fills even when this app is switched
  off, and anyone reading the book can see it. Only a passive limit can rest.
  If the clicked level is already through today's price, the order becomes a
  local watch instead of quietly filling at market.

Every account starts on watch. One saved setting flips the whole account back
to resting.

The web app and the trading engine must run this behavior from the same commit.
The web app records whether price must rise or fall into the level. An older
engine ignores that new field and treats the row as an older watch, so a Short
below the market becomes a market sell. Deploy the trading engine first and the
web app second. Never expose the new window while the old engine still owns the
trading lock.

The watch keeps the chosen leverage while it waits. Its settings window can
change that leverage until the watch starts taking. DCA ladders start at 1×
and use a higher number only when somebody chooses it. Aster still reads the
wallet's current margin choice when the order fires, so Settings remains the
only place that controls Aster margin mode.

A wallet flow has no separate spending cap. Waiting levels commit no money.
The strategy works out each level from the wallet, and the engine checks the
free money again when the level's price arrives. A buy that does not fit is
refused and stays waiting.

The dedicated trading engine waits in PostgreSQL's lock queue when another
copy is already working. PostgreSQL gives the released lock to that queued
engine before a website backup or an older copy can race in. This matters
during a deploy: the new engine takes over as soon as the previous holder lets
go, while every other copy remains unable to trade.

The same check handles every market on every protocol. It reads the protocol's
current price, dollar minimum and coin-size step, then checks the rounded coin
size that would actually be sent. No coin has a separate branch. A request can
still become smaller when a market only trades whole coins. At $1.75, for
example, a $10 request becomes five coins worth $8.75. Trade refuses the watch
and reports the first legal size.

The first size check uses the clicked level because that is where a watched
Long or Short is meant to start. The engine checks the venue's current minimum
again when the level fires, so a coin that became too small while it waited is
refused rather than sent as an invalid order.

A press draws a temporary price line marked "sending" while the app waits for
the answer. A refusal removes that line as soon as the reason returns because
no saved watch or exchange order will replace it, and the toast shows the same
reason. A successful line remains until the saved watch or resting order takes
its place, so success never flashes an empty chart between the two.

## What happens when the price hits the level

When the market reaches a watched buy:

1. A **post-only limit** is rested just off the touch — post-only means the
   exchange refuses it rather than let it fill as a taker, so it always pays
   the cheaper maker fee.
2. If the price walks away, the engine moves the order after it — the same
   chase a signal trade uses — re-resting a little off the price each time.
3. **"How far it may follow"** is on the order: zero waits at the level for as
   long as it takes; a percent gives up once price has run that far past it.
4. Any stop loss or take profit chosen on the order rides along and is handed
   to the position the moment it opens. Either line can travel without the
   other.

A watched Long or Short always enters through this post-only chase. The side of
the level decides what the touch means: a Long or Short placed above the market
waits for price to rise to it, and either one below waits for price to fall to
it. Rows saved before this direction was recorded keep their old behavior, so
an order already waiting does not change meaning during an upgrade.

The Long and Short window has a **Market** checkbox for filling now. With the
box clear, the account's Watch or Rest choice still decides where the level
waits whenever the level can rest passively. A crossed Rest level becomes a
local watch, because the unchecked box means it may not take the market. With
the box checked, the chosen side uses the venue's fresh current price, pays the
taker fee and never creates a watched row. A checked Market box works the same
whether the account setting is Watch or Rest.

Stop loss and Take profit are separate checkboxes in the same window. A watched
order may carry either one, both, or neither. The stop loss accepts either its
exact losing price or a percent away from the entry. A long stop must sit below
the entry, while a short stop must sit above it. A percent may include the `%`
sign. The price worked out from either form stays under the box so the line can
be checked before the order is placed.

The window remembers the two switches and the stop's price-or-percent choice
after a successful order. Saved settings from before the switches were split
still mean what they meant then: the old combined switch turns both lines on.

A stop can also be added after a manual watched order is placed. Right-click a
price on the losing side of a stopless waiting order and choose **Stop loss**;
the clicked price is saved on that watch without adding a target. The shortcut
prefers the active wallet's waiting order over a position on the same market.
When more than one stopless manual order is waiting on that market in the active
wallet, the shortcut stays hidden because the intended order would be
ambiguous. Press the exact waiting order line instead to open its edit window.

The DCA ladder's rungs work the same way on real and practice wallets, and the
grid always has. In a backtest a rung is modelled as a resting order the
candle's wick fills — the replay cannot watch a price tick by tick, and the
wick-fill is the same price the chase would have chased to.

## Dragging, for each kind of line

Dragging is instant on screen: the line is pinned where the hand lets go, and
the saving happens behind it. If the save is refused, the line goes back and a
message says why.

- **A watched level**: the drag rewrites the price the app is watching.
  Nothing touches the exchange. Once the level has been hit and the chase is
  working the exchange, the drag is refused — at that point it is an order in
  flight, not a line to reposition.
- **A real resting order** (rest mode): the level never ends up with nothing
  on it. On Hyperliquid, Phemex and Aster the exchange's own _modify_ command moves
  the order in place — same order, same size, new price, one call. For years
  the code said a real order "cannot be changed in place"; that was never
  true, the modify command existed all along.
- **A real resting order on KuCoin**: KuCoin Futures has no modify command,
  checked again on 21 Aug 2026 against the exchange's own SDK, whose futures
  order list is add, cancel and read with nothing between them. So a move
  there is two calls, and the new order goes on **first**. The old one comes
  off after it, so for a fraction of a second that level is covered twice
  rather than not at all. Three endings, and the screen says which:
  - The usual one. The new order goes on, the old one comes off, the line is
    where it was dropped and nothing is said.
  - The new order is refused, most often because both orders need margin at
    once and the wallet has not got it. Then **nothing moved**, the old order
    is still resting at its old price, the line snaps back and the message
    says why. A rate limit and a missing key are handed back as themselves
    rather than dressed up as a move that could not be made.
  - The new order goes on and the old one will not come off. Then **two orders
    may be resting**, the message says so in those words and says to check
    Open orders and cancel one. "May", because the old order might equally
    have filled while the new one was going on: the exchange is asked once,
    and only a straight answer that the old order has gone buys silence. An
    exchange that will not say is not an exchange saying no.

  `../rules/trading-rules.md` states what the doubled moment can cost in dollars. It
  used to be the other way round — cancel first, place second — and the moment
  in the middle was a level with nothing on it, which is the moment a fall can
  reach it.

- **A practice order**: re-prices its row, same as ever.
- A waiting order's **stop** drags too, and the order resizes so it still
  risks the same money. Its **target** drags without touching the size.

The order bar uses the same 12px settings cog as the Grid bar. Pressing it opens
a compact settings window beside the bar, like the DCA and Grid editors, rather
than a page modal. Its size, leverage, stop loss and take profit can still
change there, including adding a stop without adding a target. Once the level
has been hit and the order has started chasing, the same edit is refused
because the order is already in flight.

After Save succeeds, the changed size, leverage, stop loss and take profit stay
on the chart while the next account read confirms them. Reopening the window in
that gap shows the saved values, not the copy from before Save was pressed.

## Where they are on screen

A watched level shows in three places, and all three are drawn from one list
built in `use-trading.ts`, so they can never disagree.

- **On the chart of its own coin**, as the line the order would have been.
- **Under Open orders** in the bottom panel, mixed in with real and practice
  orders, because a watched price IS an open order to the person who placed it.
- **Under the Watched tab**, the first tab of the market list on the left. That
  is the only one of the three that answers "what am I waiting on across all my
  coins" without changing market. Each market appears once. When several
  orders wait on the same market, the row shows the order nearest today's
  price. `../screens/rules-everywhere.md` has the rest of its rules.

It is deliberately NOT in the Smart orders panel beside the wallets. That panel
is for strategies being worked — a ladder, a grid — and a plain order waiting
at a price is not one.

### A level that was refused says so

A watched level that the exchange keeps refusing used to look exactly like one
waiting patiently. On 21 Aug 2026 a Phemex level was refused twenty times over
eighteen minutes — the market had reached the exchange's cap on open interest
and would not accept anything that opened a position — and the row said
"waiting" the whole time. There was no way to find out from the app at all.

The reason now sits under the level, on the Watched tab row.

- **It comes from the record that was already being kept.** Every refusal has
  always been written to `trade_live_journal`. Nothing read it, on the
  reasoning that a person could go digging when an order had gone wrong —
  and digging needs a database client, so the answer may as well not have
  existed. `loadLiveRefusals` reads it now, one row per wallet and market, six
  hours back.
- **One line per wallet and market, not one per attempt.** A full market
  refuses every retry, so twenty identical rows are one fact. The newest
  carries the reason and the rest are noise that would bury every other
  market. Two wallets watching the same coin keep separate answers.
- **A refusal is a toast and a row.** A refusal that comes back from a press
  appears as a toast at once. The browser's regular read carries a refusal from
  the background engine. Trade shows the first new reason as a toast while the
  page is open and keeps the reason under the watched level, so closing the
  browser cannot erase the explanation.
- **The triangle says it as much as the colour does**, per the UI standard's
  rule against saying anything in colour alone. The panel is about 300px wide,
  so the sentence is clamped to two lines with the whole of it on the row's
  tooltip, and it breaks anywhere it has to: an exchange code arrives as one
  unbroken token and ran off the edge until it was allowed to.
- **Nothing there offers a retry.** The engine is already retrying — that is
  what made twenty rows — so a button promising to do again what is happening
  anyway would be a lie about who is stuck.
- **The words are ours, not the exchange's.** `TE_OI_LIMIT_REDUCE_ONLY` reads
  as this app being broken. Each protocol folder turns its own exchange's
  codes into a sentence, because that is the only place that knows what the
  number means — Phemex's are in `src/server/protocols/phemex/orders.ts`.

### A refused chase clears itself and tries again

The chase only ever sends post-only orders, and a market that moves into one
between the price read and the send is refused by the exchange rather than
filled as a taker. That refusal is normal; the next pass simply asks again.

What decides whether the watch survives it is `nothingStood` in
`live-smart-orders.ts`: the short list of exchange answers trusted to mean
"nothing was kept", which clear the watch's money-was-sent flag so it can act
again. Hyperliquid says this refusal two ways — as an order status on a plain
place, and wrapped in "Error placing new order during modify" when the chase
moved an order — and both are on the list. The second was not until
23 Aug 2026, and the untrusted wording left a reached ETH watch frozen for
good: flag raised, no order anywhere, and nothing left that could clear it.
Any answer NOT on the list still freezes the watch on purpose, because a
timeout mid-order may have filled, and spending again on top of that fill is
worse than standing still.

### A level refused five times running pauses, and stays on its own rows

After five order-specific refusals in a row the engine puts the watch down:
nothing rests on the exchange, later passes skip it, and the fifth refusal
sends one notice (`../screens/notices.md` has the counting rule). A paused
watch does not move anywhere. It stays under Open orders, on the Watched tab
with the refusal under it, and on its chart, exactly where an unpaused one
sits.

- **Open orders says "Paused" beside the coin and puts Resume beside the ×.**
  Resume clears the count and lets the next engine pass act; × calls the
  watch off. Nothing resumes on its own. Calling it off also lifts the pause,
  because the engine never reads a paused row and a stop it cannot read would
  never be carried out.
- **It is never listed in the Smart orders panel.** Until 2 Sep 2026 a paused
  watch was the one exception to the rule above, because that panel owned the
  only Resume button. The panel's list also decides which coins the Positions
  tab leaves out, so the paused half close of SOL that day took the SOL
  position off the bottom panel while 25.96 SOL short was still on
  Hyperliquid. The Positions tab now keeps every coin a watch touches.
- **A half close that has already filled ends instead of pausing.** The same
  SOL close paused because 51.91 less 25.96 came out to 25.949999999999996 on
  the computer, and the leftover 0.0000000000000036 SOL went to Hyperliquid
  as an order for $0.00, five times. What is left to sell is now rounded to
  the coin's size step before the watch decides whether it is finished, so a
  leftover smaller than one step counts as done. `part-close.md` covers the
  close itself.

### The Watched tab opens on last time's levels

The rows come from the trading read, and that read takes about three and a half
seconds against the database. Measured on 21 Aug 2026, the same on a warm
server, so it is not a dev-server cold start. The panel opens on this tab, so
those seconds were the first thing on screen every visit.

So the browser keeps the last answer and draws it at once. The code is
`src/lib/trade/watched-cache.ts`.

- **It is a picture of the past and it is never trusted.** Nothing is placed,
  cancelled or priced from it. It only decides what is drawn for the second or
  two before the truth lands, and the first real read replaces it whether it
  agrees or not.
- **They arrive silently.** A line saying "checking these are still waiting"
  was tried and taken out on 21 Aug 2026: the read lands almost at once, and a
  spinner on the first thing on screen is the wait wearing a different hat. A
  read that REFUSES is the one case that still speaks up, because then nothing
  is coming to correct what is drawn — the tab says "The read failed. This is
  what was here last time." and offers a Try again.
- **"You had none waiting" is a picture too.** A cached list of nothing stands
  in exactly like a cached list of three. Leaving it out was why an exchange
  with no levels still sat on the spinner: Phemex took 2.6 seconds to say
  "nothing is waiting" where Hyperliquid took 0.6 to draw three rows. All three
  exchanges now take the same 0.6.
- **It is kept per account and per exchange.** localStorage belongs to the
  browser rather than to whoever is signed in, so without the account in the
  key the next person to sign in on that machine would see somebody else's
  levels. A different account looks in a different place and finds nothing.
- **Only the eight fields a row is drawn from are stored**, and at most sixty
  levels. A blob is read back by whatever build is running months later, so the
  less of the order's shape it copies, the less there is to go stale. Anything
  that will not parse is dropped rather than patched. Coin art is deliberately
  not among the seven: it comes from the exchange's catalogue every time, so a
  hand-edited blob cannot put a picture of its choosing on the page.

**The read itself was also holding itself up.** The practice half and the real
half were both waited for before either was drawn, so every screen on this page
sat on the slower one — 3.5 seconds against the database while the exchange
answered in 1.4. Each half now lands on its own, which is why the Positions,
Open orders and Journal tabs fill sooner too. The 3.5-second practice read is
still 3.5 seconds; that is the database round trips and it is its own job.

**But half a read is not an answer, and this tab is where that showed.**
Somebody whose every waiting level is on a real wallet has an empty practice
half in their hands for a second or two, and the tab read it as the answer: it
said "Nothing is waiting at a price" on all three dashboards, and wrote that
empty list into the cache, so the next visit opened on the same claim before
the exchange had said a word.

Every list that merges the two halves can be told the same lie, and the bottom
panel's Positions, Open orders and Journal all merge them — they said "No open
positions" off `loading` in exactly the same way, and the count on each tab
said "0". It showed on the Watched tab first because that is the tab the panel
opens on, and because that tab was also writing the half-answer down. All four
wait for the whole read now.

Measured in a browser on 21 Aug 2026, with the exchange half held back seven
seconds the way a rate-limited venue holds it back: the old build showed both
"Nothing is waiting at a price" and "No open positions" for 3.1 seconds of it,
with every tab counting "0", while the account beside them read $5,898. The
same test on the fixed build shows neither, says "Reading your watched prices"
and "Reading what you are holding" instead, leaves the counts blank, and fills
in the moment the exchange answers.

So the tab waits for BOTH halves before it speaks. `settled` on the trading
hook is the fact it waits for — both halves have answered, landed or refused —
and it is what the empty wording and the cache write are allowed to speak from.
`loading` still means "neither half is in", which is the right question for a
spinner and the wrong one for a claim about what somebody is waiting on.

**Waiting is not the same as showing nothing, and the cache is untouched by
this.** It stands in for longer now, not less: it used to be shoved aside the
moment the first half landed, which is the moment the tab had least to say.
Levels the landed half DID bring are drawn straight away, whether or not the
other half is in. The spinner is only ever what is left when a browser has no
cached picture and neither half has brought a row — and the poisoned blobs
correct themselves, because the very next whole read overwrites them.

## What it costs

A watched order only fires **while the engine is running**. A resting order
filled at 3am with the laptop closed; a watched one is this app's own eyes,
and closed eyes see nothing. That is the price of the money staying free and
the level staying private. On the server deployment the engine runs all the
time, so this matters most when trading against a dev machine.

## The safety around it

- **A refused market is held back for one minute.** When the exchange refuses
  an order on some market, that market's triggers stop firing for sixty
  seconds instead of retrying every pass — a persistent refusal costs one
  request a minute, not sixty. The app once rate-limited itself off the
  exchange with exactly that loop. A fill clears the hold.

  A rate limit is not held that way. "Too fast" is already held off inside the
  exchange's own client — for the whole key rather than for one market, and
  the next attempt costs no request at all — so a minute on top of it would
  only make the level late once the allowance came back.

- **A refusal puts the level back to waiting.** The moment a watch asks for an
  order it writes down that it has spent, and while that is written and no
  order is in sight it does nothing at all: that is what stops one level
  buying the same coin twice. Nothing clears it but the fill arriving or a
  person calling the order off — so the wait is forever, and a level that
  writes it down for an order that never went out is a level that will never
  fire again.

  Trade also believes a refusal from the margin or leverage check because the
  order endpoint has not been called yet. The other two certain answers are an
  order the exchange read and refused, or an exchange too busy to look. In
  those cases no money moved, the level goes back to waiting, and it tries
  again. A timeout after the order starts may have filled, so the level stays
  marked sent rather than risking the same buy twice.

  Both doors were open until 21 Aug 2026. A watch drawn above the price on
  Phemex NFLX was refused at 17:40 because the exchange had put that market
  into reduce-only, and stood still for the next seventy-seven minutes while
  the price sat a dollar under the level it was told to buy at. Re-drawn at
  18:57, it was rate-limited on its first attempt and froze again in four
  seconds.

  The same rule covers a size that no longer meets the protocol's minimum when
  price reaches the level. The watch stays active, the protocol's order path
  records the reason, and nothing is sent. The old path marked the watch done
  before the protocol could answer, which removed both the level and its
  explanation.

- **Calling a watch off wins over an engine pass already in progress.** The
  engine may have read the watch just before the press. A later save from that
  older read cannot make the cancelled watch active again, and pressing the
  cancel control twice has the same result as pressing it once.

  A watch that has only just been placed can still be the copy held on screen
  while the account read catches up. Its cancel still goes through the watched
  order path, and a successful cancel removes that held copy at once. It never
  falls through to the practice-order path merely because the full read has not
  returned yet. Calling off every watched price in one press follows the same
  rule for each held copy.

- **A refusal stays with the order that received it.** Reusing the same coin
  in a new watched order does not carry the previous order's refusal onto the
  new row. Refusals also stay separate when two wallets watch the same coin.

- **Wallet-wide entry rules fire where the trigger fires.** The cap on how
  many coins open per hour, and the crash rule's "only coins the exchange
  allows 10× or more on", are checked at the moment a trigger would open a
  new coin — on practice and real wallets alike, not only in backtests.
- **Money is one pool.** Hyperliquid unified its account on their side: the
  USDC balance backs orders on every market, main or side, with the exchange
  moving slices onto a market as orders there need them. The app no longer
  gates anything on "money parked on that market".
