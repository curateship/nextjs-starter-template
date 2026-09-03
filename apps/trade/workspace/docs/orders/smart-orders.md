# Smart-order entries do not rest on the book

**A smart order normally places no entry until a price is actually reached.** A
level on the chart is a price the app is watching. When the market gets there,
an entry is sent. Nothing sits on the exchange's book waiting to buy.
Reduce-only exits may rest after a buy because they can only sell coins already
held.

A hand-placed DCA ladder has one deliberate exception. **Buy rung 1 at market
now** spends rung 1's shown dollar amount at today's price as part of placement.
The app changes the coin amount to keep those dollars fixed. Every deeper rung
stays at its shown price and waits under the same rules as before. The choice is
off by default, so an older saved setup still sends nothing when placed.

The real-wallet request belongs to the trading engine, not the web process.
Every running engine copy announces whether it understands the market-first
field. The web app refuses the placement before saving anything unless all of
them do. Deploy the web app and trading engine together; opening new web code
against an older engine would otherwise leave the ladder untouched forever.

Placing a ladder or grid does not reserve its planned buys from today's free
cash. The window may show that the complete plan controls more dollars than are
free now, but that does not block Place. Each level checks the wallet again
when its price arrives. For a borrowed ladder, that check uses the margin the
buy needs rather than its larger coin value. A level that cannot afford its
full size stays waiting.

This holds for every smart order, now and in future. It is a rule, not a
preference, and `../rules/trading-rules.md` outranks this file if the two ever disagree.
Plain orders are a separate story with a setting of their own, told in
`watched-orders.md`.

## Why

- **A resting order ties up money.** A plan with twelve resting buys reserves
  the whole pot the moment it is placed, so the rest of the account cannot use
  it, even though eleven of those levels may never trade all week. With a
  watched level the cash stays free until something actually happens.
- **A resting order uses up an order slot.** A wallet has a cap on how many
  orders can be open at once. A plan that is mostly waiting should not be
  holding most of that cap.
- **A resting order gets drawn twice.** A resting order is a row, and the chart
  draws every row it finds. The smart order's own layer then draws its line on
  top of the same price, so you get two labels and two lines for one price. A
  watched level is not a row, so the only thing on the chart is the smart order
  itself.

## How it is built

The engine compares today's price against each level on every pass and calls its
injected `fill` when one is crossed. There is no `insertOrder` for a level, no
order id on a level, and nothing to cancel when a level is called off. The
level's status changes and that is all.

Reaching a level chooses between a market order and no order. The live path
reads one fresh price immediately before sending. If that price has moved back
across the level, the app sends nothing and puts the level back to waiting. It
never changes the action into a normal order resting on the exchange.

Both halves matter. CHIP on Hyperliquid showed why a watched buy must never
become a resting order: the grid recorded the rung as bought before the order
filled, then ended when the next account read found no position. ANSEM on Aster
showed why a watched buy cannot be forced through after the fresh price leaves
the rung: the grid sold its old top, moved upward, then bought the new top five
seconds later at a higher price. A moved grid also starts its new top rung
unready. Price must reach the next rung above the sold price before a later
return may buy there again. Time does not prepare it. CHIP proved why on 27
August 2026: the grid waited 74 seconds, then sold and bought around $0.0433
because price had only wobbled slightly around the same rung.

## What watching costs

**A level the price reaches and leaves between two looks is missed.** That is
the price of the rule on this page, and it is worth saying plainly rather than
leaving it to be discovered. A resting order fills whether anyone is watching or
not. A watched level only fills if somebody is looking at the moment price is
there.

A missed level is not a lost level. It stays waiting and buys the next time
price reaches it. What is lost is that one dip.

CHIP on 22 August 2026 is the case this was found on. A grid's bottom level sat
at $0.026992, CHIP printed $0.026115, and it was back above $0.028 before the
next look came round. Three levels above it did buy, but each one filled 2.5% to
4% below its own price for the same reason: by the time the engine looked,
price had already gone past.

So the rule the app keeps is: **nothing rests, and the answer to a fast market
is to look more often.**

## How often it looks

Every second, at every wallet. Two things used to get in the way of that, and
both are fixed.

**A slow wallet used to set everybody's clock.** Wallets were worked one after
another and the whole round waited for all of them, so the slowest one decided
how often every wallet was looked at. On 22 August 2026 the slowest was a
KuCoin wallet carrying 454 markets. KuCoin has no all-markets price call, so it
is asked one market at a time, six at a time, and a full round takes about
fourteen seconds. Its two-second price cache expires long before the round
finishes, so it never gets to help. A Hyperliquid wallet sitting next to it
needs 0.3 seconds for the same job and was still only looked at every fourteen.
That is the window the CHIP level was missed in.

Now each wallet keeps its own clock. A wallet still busy is stepped over rather
than waited for, so a quick one is looked at every second whatever a slow one on
another exchange is doing.

**Looking for new coins used to hold up watching prices.** A switched-on flow
decides which of several hundred coins deserves a ladder, which means asking the
exchange about each one, and that took about five seconds at the start of every
round with every already-placed level waiting behind it. Finding new coins is
the patient half of the job and watching prices is the urgent half, so they no
longer share a clock. The cost is that a ladder the flow places starts watching
its rungs one second later than it used to, and a rung that has bought nothing
loses nothing by that second.

**A live price line that covers only some markets is now used for those.** The
open price line answers in an instant and asking costs a call, so the line is
always preferred. It used to be all or nothing: one market the line did not
carry threw away every price it did, and the whole lot was asked for by hand
instead.

**KuCoin now opens several price lines.** It is the one exchange here with no
all-markets feed, so it is subscribed to one market at a time and a single
connection will not hold them all. The app used to open one line, put ninety
markets on it and ask for the rest, so a wallet on 454 markets asked KuCoin 454
questions, one at a time, six at a time, every round.

Two things were measured against the live exchange on 22 August 2026 before
this was built, because both decide the design:

- **Going over the per-connection cap kills the whole line.** Same markets,
  40 seconds of listening: 100 on one connection ticked normally, and 130, 160,
  200 and 250 each delivered nothing at all. Not the first hundred and then
  silence. Silence from the first market on, on a socket still reporting itself
  connected. So the cap sits between 100 and 130, and 90 keeps a margin under
  it.
- **Six connections at once all worked**, carrying markets between them, so
  several lines is a thing KuCoin allows rather than a thing we hoped for.

Each line is a hub of its own: its own socket, its own watchdog, its own
reconnect. A line that goes quiet takes only its own markets off the feed, and
those are asked for by name while the rest keep arriving. That is why a price
is no longer handed out once its line goes quiet — with one line the caller
could check a single age, and one age cannot speak for six sockets that fail
one at a time.

This is not finished against the connection rule. The implementation stops at
eight sockets and repeatedly asks for markets that have not produced a pushed
price yet. The remaining work is one startup or reconnect snapshot to seed each
line, then no repeated price requests while the socket is healthy.

## What is looked at every second, and what is not

Looking every second is only safe if a look is nearly free. Hyperliquid allows
1,200 request-weight a minute per machine and answers `429` to everything once
that is gone, which took the app down for a full day on 13 August 2026.
`../exchanges/hyperliquid-rate-limits.md` has the whole budget.

**Every second, because these decide whether a level fires:** the price, what
the wallet holds, and what is resting on the exchange. Prices already arrive on
open sockets for the three trading venues. Hyperliquid also pushes positions
and open orders. Phemex and KuCoin hold a private socket that says when
something has happened on the account, and their resting-order read is skipped
entirely while it stays silent. Their positions and balances are still read
each pass, on purpose: they carry the open profit, which moves with the price
every second, and neither exchange pushes a position when only the price has
changed.

**Fills, on Hyperliquid, arrive pushed and cost nothing.** They are the record
of what already happened: they fill the Journal, move each order's watermark and
match a rung to what it bought. They used to be asked for, which costs 20
weight and no amount of throttling stops that being a poll. `user-fills-feed.ts`
now listens instead. Measured against the live exchange on 22 August 2026: the
first look costs one request to establish the line, and the next twenty looks
over twenty seconds cost **zero**. Before, twenty looks were twenty requests.

**A fills feed accumulates, and that is what makes it harder than the others.**
The resting-orders feed beside it is sent the whole list every time, so the
newest push is simply the answer. Fills only ever arrive as new events, so the
feed has to add them up — and an added-up list is worth nothing unless you know
it has no holes. So it keeps a window it can vouch for and answers "cannot say"
outside it. Three things put a hole in that window and each has an answer:

- **Before it was listening.** A question about last Tuesday is a question
  about a time nothing was watching, so the exchange is asked.
- **A dropped connection.** The transport reconnects and resubscribes on its
  own, and the exchange answers a new subscription with a fresh snapshot. A
  snapshot that is not the first one is therefore how a reconnect announces
  itself. The window reopens and one request covers the gap.
- **A subscription that dies for good.** The exchange's client says so once,
  through its own callback. The feed is dropped and the next look asks.

Silence is not suspicious here, which is why this feed needs no "quiet for too
long" rule. A wallet that has not traded for an hour genuinely has no fills to
be told about, and both real failures announce themselves.

**Phemex and KuCoin do not accumulate fills; they wait to be told to look.**
Both sockets carry the executions themselves and neither is read for them, on
purpose. Phemex writes the same fill in a different dialect on the socket and
marks nothing as a liquidation, and a mislabelled liquidation is a wrong line
in the Journal about real money; KuCoin's channels carry changes only. So the
socket answers one question — has anything happened on this account — and the
sweep that was always there runs only when the answer is yes. Measured against
both live exchanges on 22 August 2026, both accounts quiet, asking every four
seconds for a hundred seconds: **33 requests without the sockets and 13 with
them**, and all thirteen were in the first twenty-five seconds while the lines
were signing in. After that, nothing. `../wallets/wallet-reads.md` has the safeguards.

What is left is their positions and balances, which the engine still needs for
every decision. One successful answer now covers five seconds of engine passes,
shared by wallet rows pointing at the same exchange address. A failed answer is
never kept, and any order or protection change clears the held answer before
the next pass. The exchange adapters may save more calls through their own
account sockets; this five-second hold is the common backstop before the engine
reaches them.

**Every thirty seconds: the flow looking for new coins.** One scan asks about
twelve coins and each coin's base needs its 4h candles, about 28 weight each,
so a scan is roughly 340. A coin that gets its ladder half a minute later has
lost nothing, because it had no ladder at all a moment before.

A hunt that never finishes holds its own place and would quietly stop the flow
finding coins at all, with every wallet still trading and the Workers screen
still green. So one still running after two minutes is named there. The silence
was the dangerous part, not the delay.

This is why a slow round used to hide the problem. While one slow wallet held
everything to a round every fourteen seconds, the expensive reads were paced by
accident. Splitting the wallets apart means saying out loud what each read is
allowed to cost.

## What a round costs now

Measured on 22 August 2026, on the real wallets:

- **Hyperliquid, 269 markets: 0.3 seconds.** Was the same 0.3 seconds, but it
  only got a turn every 36.
- **KuCoin, 454 markets: 2.2 seconds, down from 14.** After a minute of
  listening, 390 of the 454 arrive on the open lines and only 64 are asked for.
  The number asked for keeps falling as thin markets tick for the first time.

A market that never ticks is never covered by a feed, however many lines are
open, so the REST read stays as the honest fallback for those.

The engine also keeps the active plans indexed by market for the lifetime of a
pass. Looking up the plan for each held coin no longer starts at the beginning
of the wallet's smart-order list each time. The index keeps every valid plan on
a market in its database order, including the allowed grid-and-ladder pair,
and ignores a stored row whose kind or plan cannot be read.

On 28 August 2026, a local run with 454 active markets and 454 held coins took
about 0.34 milliseconds per pass when each coin scanned the full list. Reading
the market index took about 0.008 milliseconds per pass. The run repeated each
version for 2,000 passes after warm-up. These numbers cover only the in-memory
plan lookup, not exchange or database time.

**The open dashboard also nudges the engine**, every four seconds, so a laptop
with no engine running beside it still trades. That nudge takes the engine's
lock for one pass and lets it go. It used to open a brand-new database
connection to do so, which cost half a second each time before any work
started. It now borrows one kept-warm connection, and an account with no live
wallet that has a key never touches the lock at all. `../engine/dashboard-speed.md` has
the numbers.

## When one smart order keeps failing

The engine writes the first failure to its permanent journal immediately and
prints every failure to the console. A continuing problem does not add the same
journal row every second. The engine counts repeats for the same wallet, market
and kind of failure. A price or another number changing inside the message does
not make a new kind of failure.

After one minute, the next repeat adds a short row with the total count and how
many minutes the problem has lasted. Later repeats add at most one counted row
per minute. A different problem on the same order gets its own detailed row at
once. Two wallets failing on the same market also get separate rows. A full
minute without the same failure ends its count. If the problem returns later,
the journal gets a fresh detailed row.

The counts live in the running engine, not in the database. Restarting the
engine forgets them, so the first failure after a restart writes one fresh
detailed row. A journal write that fails still does not stop the engine pass.
The console continues to carry every attempt.

## The DCA ladder

The ladder has been on watched levels since 14 Aug 2026. Placing one sends
nothing anywhere, and each rung fires at market the moment the live price
crosses it, checked every second, the same as the grid.

**The ladder's window follows the grid window's rules**, on Tyler's ask,
1 Sep 2026. Nothing outside it closes it — the chart stays live for dragging
the ladder's handles — and it closes from the × in its header or Escape. The
header says "DCA ladder" and the free cash, never the wallet's name. The
button says "Place 4 longs": the ladder's entries are longs, the way a short
grid's entries are shorts.

The one place a resting rung still exists is inside a backtest. The replay's own
book models a watched level as an order the bar's wick fills, so crash-day
results stay comparable with everything measured before. On a real book there
are no exceptions left.

The ladder has four take-profit choices. Average price keeps one target above
the changing average. Previous rung gives each buy its own sell one rung up.
Nearest rung sells everything at the first rung above the deepest buy. Sell
back up the ladder uses the clicked or base anchor as Exit 1. Exit 1 is the
first level above Rung 1, not a second step above it. Later exits continue
upward using the gaps between the remaining buy rungs.

Sell back up the ladder reverses the buy sizes. If the buys are $100, $200 and
$300 as price falls, the exits are $300, $200 and $100 as price rises. The
largest buy therefore gets the closest exit. Every exit appears on the chart
as soon as the ladder is placed. A faded dashed exit has not been funded yet;
a solid exit is a reduce-only sell resting for coins the ladder holds.

### Exit-ladder cutover record

Plans saved before 31 August 2026 used an empty anchor and put every exit one
step too high. The engine recognizes those old prices long enough to account
for a fill. It then cancels and replaces the funded sells at the corrected
levels. A real sell stays at its old higher price while the corrected level is
already at or below the market, because cancelling it there would leave the
position without a resting replacement. The engine changes it after price is
below the corrected level. Exit drags and gap changes are refused during that
wait, so an edit cannot bypass the same protection and cancel the old sell.

This compatibility path is a temporary staged cutover because the old sell is
an order on an exchange, outside the database transaction that changes the
plan. The Trade engine owns the cutover. A failed cancellation keeps version 1
and its old order IDs, so the next pass can retry without placing a duplicate.
The tracked cleanup is to remove `exitLadderVersion`, the version-1 formula and
the cutover block after this query returns zero in every production database
for 24 hours:

```sql
SELECT count(*)
FROM trade_smart_ladders
WHERE kind = 'dca'
  AND status = 'active'
  AND plan #>> '{takeProfit,mode}' = 'exitLadder'
  AND COALESCE((plan ->> 'exitLadderVersion')::int, 1) = 1;
```

Zero active version-1 exit ladders also means no managed version-1 sell remains,
because every managed sell ID belongs to its active plan. Before cleanup, a
rollback can run the previous release against plans still marked version 1.
After cleanup, Git is the rollback record and the corrected shape is the only
accepted exit-ladder shape.

The engine funds exits from the lowest one upward. The funded total never
exceeds the ladder's held coins. When a new buy fills, the engine may replace
the one partly funded exit and then fund the next level. A market-wide cascade
hold pauses new exit sells. An exit sale counts against the deepest filled buys
first, and a ladder ends when the position is flat. Sold rungs do not buy again;
cycling after a sale is future work.

Extra gap moves the complete exit shape farther above the buys. A zero gap is
the direct mirror. The percentage steps between exits still come from the buy
steps, so changing the gap never stretches one exit away from the others.
Dragging any exit line changes this same value and moves all exit lines
together. If a funded live exit is resting, the app cancels it before saving
the new gap and placing its replacement. A refused cancellation leaves that
sell and the saved gap alone. If another sell in the same change was already
cancelled, the app records the missing order and the next engine pass restores
it at the old gap.

A backtest places these exit sells after the bar that filled the buys. A bounce
inside that same bar therefore cannot fill the mirrored exit until a later bar,
so this mode's replay is slightly more cautious than the previous-rung replay.
