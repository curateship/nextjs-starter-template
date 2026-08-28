# Why the dashboard was slow, and what it does now

The database is far away. One query, there and back, measured 120 ms from this
machine on 23 August 2026. Opening a brand-new connection measured 500 ms. So
the speed of every screen comes down to one question: how many trips does it
make?

Every server call the browser makes first checks who you are, and that check
is two or three trips before any real work. The check is shell code and stays
as it is. What the dashboard can control is how many calls it makes, and how
many trips each one makes after the check.

## Opening the page

The page's account-specific opening data arrives through one authenticated
answer, `loadDashboardBootstrap` in `src/lib/api/dashboard.ts`. It reads the
preference row once, including the sound switch, and starts the independent
reads together. That answer now carries the market list, folders, running bots,
wallet figures, chart drawings, the opening sound cursor and the first chart
candles.

Before this the page fired eight calls at once: the market list, the stars,
and six preferences. Seven of them read the same preference row. Each call
paid its own sign-in check, so opening the page was 24 to 32 trips for one row
and one list. The sections in the opening answer still do their own necessary
database and exchange work, but they run together behind one sign-in check.

The page's answer is good for a minute. A market click, or coming back to the
tab inside that minute, paints at once. Saving the volume cutoff, a sound
choice, a wallet or a drawing changes the cache version, so the next dashboard
navigation reads a fresh opening answer.

The raw exchange market list has its own one-minute server copy, keyed by
exchange and network. Two accounts opening the same exchange share that raw
answer, including when both opens overlap. Each account's dollar-volume cutoff
is applied after the shared read. A failed exchange read is removed at once, so
the next open asks again.

The protocol descriptions used by wallet forms and capability checks now ship
with the browser code. The list describes code compiled into this build, so it
does not need an authenticated server function. The server adapter registry
reads the same descriptions, and a test checks the registry's public answer.

The first 4-hour chart slice rides with the opening answer for the remembered
market. Hyperliquid and the other unrestricted exchanges ask for the same
two-year first slice as before, then the browser chases deeper history after it
has painted. Lighter keeps its 90-day first slice and does not chase. The chart
timeframe lives in this browser's local storage, which the server cannot read.
If that remembered choice is not 4h, the browser ignores the carried 4h slice
and makes the normal request for the chosen timeframe.

The wallet panel also starts from the opening answer. Its first timed refresh
is fifteen seconds later. If the wallet part of the opening answer failed, the
panel shows its existing error and retries at once instead.

The opening answer also carries the trade-sound setting and an event cursor.
When sounds are enabled, the live notification stream makes one small catch-up
read as it connects. The bootstrap query necessarily finishes before the
stream subscribes, and the stream cannot replay a notice from that gap; keeping
the catch-up means a fill sound is immediate rather than delayed until the next
notice or the one-minute fallback poll.

Opening the chart no longer writes its view back to the database. The charting
library rounds the saved range to pixels while it frames the first draw. Trade
now records that settled frame as its own work before it starts listening for
the person's pan or zoom.

The live feed catching up after a gap used to run the whole loader again,
preferences and all, every time the connection blinked. It now asks for the
market list alone (`useDashboardMarkets`), and keeps the list already on
screen if that ask fails.

The Bots tab gets its first list from that same opening call. Pressing the tab
asks again at once, so the figures do not wait up to six seconds for the first
timer. While the tab is open it checks every six seconds, because a bot can
stop without a click on the dashboard. Leaving the tab stops those checks.
Hiding the whole browser page stops them too. The old timer made 50 server
calls during five hidden minutes. It now makes none, and asks once as soon as
the page is visible again. A failed refresh keeps the last list rather than
replacing it with an empty answer.

The server reads only the active order rows placed by the runs in the list.
Fill history and permanent order ownership are limited to the wallets and
coins those runs use, including coins they placed and later removed from their
settings. Ownership from an older run on the same wallet and coin stays in the
answer because a position can outlive the run that opened it. The visible
money, finished trades and coins held therefore keep the same attribution
without pulling unrelated wallet history into every six-second refresh.

The bot count does not bring each smart order's plan back from the database.
PostgreSQL checks whether a DCA plan contains a waiting rung and returns one
yes-or-no value beside the order kind. The shared `isWorkingFlowOrder` rule
then counts signals and DCA ladders exactly as before. Grid and watched orders
do not count. If rung status ever moves somewhere else in a plan, the database
path and the browser-safe reader in `flow-run.ts` change together.

Measured with the database driver on 28 August 2026, one list read over 100
active DCA ladders with 20 rungs each returned 268,791 bytes when it selected
the plans. The same rows return 8,991 bytes with the small database answer.
The measurement JSON-encoded the rows the driver handed to `listFlowRuns`; it
does not include the other queries in that call, whose shapes did not change.

## The screen is built once

The three resizable panel groups remember their divider positions in the
browser. The shell's hook learns the saved positions after the first paint and
rebuilds the group under a new React key. On this page the group holds the
market list, the chart and every panel, so the rebuild set up the whole screen
twice: once for the server render, once a beat later. The chart library and
the candle request both ran twice.

Trade's own `useRememberedPanelLayoutInPlace` (`src/lib/trade/panel-layout.ts`)
reads the same saved positions and hands them to the group that is already on
screen through its `setLayout` handle, the moment the group reports its
starting layout. Nothing is rebuilt. It does this every time a group appears,
not once per page: the groups only exist on a wide screen, so narrowing the
window and widening it again brings the saved dividers back and never writes
the defaults over them.

## The poll, every four seconds

Three server calls run every four seconds while the dashboard is open. Each
one was made cheaper, and all three are now scoped to the page's exchange.

**Scoped to the exchange.** Every dashboard belongs to one exchange. The polls
used to read every wallet on every exchange and the browser threw the other
exchanges' rows away. They now say which exchange they are for, and the server
reads only those wallets. The rule that screens never compare exchange ids
still holds: the exchange arrives as data and the server filters by it.

**The nudge (`reconcileLiveSmartOrders`).** It takes the engine's lock for one
pass. It used to open a brand-new database connection to do that, which cost
half a second every four seconds from every open tab. It now borrows one
kept-warm connection (`tryBecomeLeaderForOnePass` in `leadership.ts`), and
skips the lock entirely when the account has no live wallet with a key. A
second tab finds that one connection busy and is told "not held" at once,
the same answer it got before; it never queues behind the first tab's pass. The
dedicated engine and the ladder worker, which hold the lock for hours, keep
their own connections as before.

**The practice read (`loadPaperPortfolio`).** Practice wallets were settled
one after the other, each in its own transaction, and each wrote its touched
markets one row at a time. The code's own note put that at 3.5 seconds on 21
August 2026, against a poll that repeats every 4. Wallets are now settled three
at a time (each holds one pooled connection, and the pool has ten), the
markets each wallet is in are looked up once for all of them, and a wallet's
touched markets are written in one delete and one upsert.

**The real read (`loadLiveTrading`).** The wallet list brings each wallet's
key along instead of a second read per wallet, and the smart-order read
leaves together with the exchange read instead of after it. A new index on
`trade_live_fills` (user, wallet, time) lets the Journal and the wallet card
read a wallet's newest fills without sorting its whole history. Migration
`0140`.

**A practice wallet holding nothing skips the lock.** Settling a wallet
takes a lock on its row inside a transaction, five round trips even when
there is nothing to settle. A wallet with no position, no waiting order and
no ladder watching now has its book read plain.

**Smart orders travel only when they change.** The active ladders, plans
included, measured 271 rows and half a megabyte for one account. Both halves
of the poll carried all of it every four seconds. Now the browser sends back
a stamp with each poll, and the server answers "unchanged" when the ladders
are the same. The stamp is a hash the database computes over each row's id,
market, kind, plan and flow (`activeSmartOrdersStamp`), thirty-two bytes
back. Not the row's timestamp: the engine rewrites a watched ladder's row
every few seconds without changing its plan, so a stamp on the timestamp
changed every poll and saved nothing. A carried-over smart order keeps the
`updatedAt` it was first read with; nothing on screen shows that field.

**The liquidation check** that runs inside the nudge used to delete stale
rows one at a time and update every position's row one at a time, every pass.
It now writes nothing on a pass where nothing changed, and one statement when
something did.

## The Journal travels only when a fill happened

The Journal is up to two thousand practice rows and four thousand real ones,
built into trades on the server. Both halves of the poll used to carry all
of it every four seconds. Now each poll sends back a stamp for the Journal it
holds, and the server answers "unchanged" unless a fill has landed, been
binned, or (real wallets) a trigger has been learnt since. The stamp is one
count plus the newest fill time per table, computed after the practice
settle and after any waited-for sweep, so a fill written in that very poll
is in it. A finished trade shows on the next four-second poll, and a quiet
Journal costs one small aggregate query.

Tyler's rule, 23 August 2026: the Journal reads when something actually
happened, not on a clock.

## In the browser

A price tick used to be stored as React state in the chart panel, so every
tick re-rendered the 1,200-line panel and every layer drawn over the chart.
The chart now subscribes to ticks itself (`liveBars` on `PriceChart`, backed
by `watchLiveCandle`) and applies each one to its last candle directly. A
tick re-renders nothing.

The all-market feed sends one message containing hundreds of prices. The live
store writes those prices at once, then wakes each interested screen once on
the next animation frame. A screen watching all 450 prices used to receive 450
callbacks for one message. The store test now measures one callback and one
render. Two messages inside the same frame still cause one callback, with the
newer price in the map. A tab that becomes hidden flushes the waiting batch
instead of leaving it until animation frames resume.

`useLiveMarks` keeps its last map between callbacks. React may ask for the
current value while checking an unrelated update, and that check now returns
the same map instead of building and comparing a replacement. A subscriber
added while a batch is waiting reads the prices already in memory immediately.
The chart does not use this batch and its candle callback remains immediate.

The market rows and the picked market are memoised in the workspace, so the
market picker no longer re-sorts every market on every poll while it is
closed. The Journal's sort is memoised too.

## The engine pass, every second

The engine first asks for the wallet keys used by active smart orders and by
running or stopping flows. It then reads all matching wallet rows in one query
and keeps the resulting map only for that pass. A flow can therefore use a
wallet that has no ladder yet, and a deleted or inactive wallet still gets the
same handling as before. The order placement path keeps its own locked check;
the one-pass map does not replace that safety check.

Measured with 20 active ladder wallets and no flow cleanup waiting, the old
pass setup made 23 database trips: one ladder-key query, 20 wallet queries, and
two full flow cleanup queries. The new setup makes three: ladder keys and the
small flow-status probe leave together, followed by one wallet query. The
wallet table therefore falls from 20 reads to one. With no ladder or flow
wallets, the batch wallet reader makes no query.

The flow-status probe also says whether cleanup has anything to do. When no
flow is stopping and no running flow has a removed market, neither cleanup
query runs. When cleanup is needed, its first read names only the columns that
the cancel path uses instead of pulling every saved strategy and coin-history
object back from PostgreSQL.

## Measured on 23 August 2026

Playwright against the dev server on port 3014, signed in, the Hyperliquid
dashboard with seven positions, twelve orders, 271 active ladders and 141
Journal rows. The server runs against the same database production uses.

- Page open: panels drawn at 1.0 s, chart drawn at 2.9 s. Before the change
  the first paint waited on eight server calls; now on one.
- Practice read, every 4 s: 1.7 s before, 0.75 s after.
- Real read, every 4 s: 1.2 s before, 0.55 s after.
- Wallet read, every 15 s: about 1.0 s, unchanged in shape; it is scoped to
  the page's exchange now.
- The nudge, every 4 s: 0.5 s, of which the sign-in check is most.

What is left in each call is mostly the sign-in check (two or three round
trips, shell code) and one exchange request.

The opening path was measured again in a fresh signed-in browser on 28 August
2026 after restarting the local server. With trade sounds enabled it made seven
calls instead of the original twelve: the document/bootstrap, the deeper candle
chase, the ladder nudge, the practice and live portfolio reads, the
unread-notification count and the sound stream's gap-closing read. Panels
appeared in 1.28 seconds and the chart in 1.59 seconds. The separate protocol,
sound-setting, drawing, wallet and opening-candle calls were absent, and opening
the chart did not save its view.

## Still to do

- The market list and the Journal draw every row. Virtualising them is the
  next gain, and a visible change, so it waits for a measurement of what the
  above leaves.
- KuCoin's 4h first paint makes about 22 exchange calls and caches none of
  them. Its own small task.
