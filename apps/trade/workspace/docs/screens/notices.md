# Trade notices in the bell and the inbox

The app tells the wallet's owner when something happened with their money while
they were not looking. Every notice goes through one helper,
`src/server/trade/notices.ts`, which writes an inbox row and nudges the bell in
the open browser at once. A notice that cannot be written is a log line and
nothing more — the trade, the stop or the flow pass it belongs to always
finishes first.

## Clicking a notice opens where it came from

Every notice above points at the page it happened on, and pressing it goes
there.

- **A fill, a stop, a target, a price alert or a liquidation warning opens that coin's chart**
  on the exchange it happened on. The chart, not the Journal: a stop that fired
  at 3am is a thing to look at and decide about, and the Journal is where it is
  read back later. The market key carries its own exchange and network, so a
  practice fill opens the practice chart rather than the real one wearing the
  same coin's name.
- **A flow notice opens that run's own page**, where the reason and the coins it
  watched are already written down. A flow a trigger could not start has no run
  to open, so that one opens the flow's canvas instead.
- **A notice with no page behind it still opens nothing**, and the tray stays up
  rather than shutting on the words somebody just clicked. A coin on an exchange
  with no dashboard here is one of those.

**How it is stored.** The shell's bell knows what the shell's own notices are
about and opens each one. It cannot know what this app's notices are about,
because they are written as announcements — a title and a body, with nowhere to
go. So the page each notice came off is written into `trade_notice_links` at the
same moment the notice is, and the bell asks for it through the shell's
`notifications.linksFor` app option.

The bell asks **once per page of notices, while the tray is being read**, not
once per click. The database is a second away, and a second of nothing between
pressing a notice and the page moving reads as a dead button.

**Addresses are checked, not trusted.** These strings come out of a database, so
the browser follows one only when it is plainly a path inside this app.
`isOwnAppHref` is that check, and it does two things: the address has to start
with a slash, and it has to still be on the same site once the browser has
resolved it.

The second half is the one that matters, and reading the text cannot replace it.
A browser treats a backslash as a slash, so `/\example.com` is `//example.com`
wearing a disguise: one leading slash by eye, another site in fact. Resolving
the address and comparing the site it lands on catches that, and catches the
next disguise nobody has thought of yet. Anything that fails is dropped and the
notice opens nothing.

Asking for somebody else's notice comes back empty. The read joins through the
notice's own recipient, so a guessed id is not that reader's notice and is not
in the answer.

## When a price alert fires

A price alert writes one `info` notice when a fresh pushed price reaches or
passes its line. The title names the coin, saved price and original direction,
for example, "ETH reached $3,600 (was rising)." Pressing the notice opens that
coin's chart.

The engine first changes the alert from active to fired with a conditional
database update. Only the engine process that changed the row writes the
notice, so another process checking the same price cannot announce it again.
A stale or missing price writes nothing and leaves the alert waiting.

## When an order fills

One notice per fill, never a digest. The words come from
`src/lib/trade/trade-notice-words.ts` and always carry the dollars, the price
and the wallet's own label:

- **A fill:** "Bought $500 of ETH at $90 (Hyperliquid main)". Level `info`.
- **A closing fill:** the same, with what it banked in the body — "Lost $55.00
  on this close. That is measured against the whole position's average entry
  of $95.00, not the last buy." A loss is level `warning`.
- **A liquidation:** "The exchange liquidated ETH: …". Level `critical`.
- **A practice wallet** says so in the label: "(Test wallet, practice)".

**The money on a close is the exchange's own figure, and it is measured
against the whole position's average entry.** On 2 September 2026 Tyler bought
782 ENA at 0.14737, sold them an hour later at 0.15105, and the bell said
"Lost $3.81". Hyperliquid was right: the position also held 1,734 coins bought
near 0.16, and an exchange never pairs a sale with one particular buy. The
notice now says the average entry beside the figure, so the number can be
checked against the position row. The entry is worked back from the
exchange's own two numbers (the fill's price and what it banked, per coin) in
`averageEntryOf` in `src/server/trade/live-fills.ts`. KuCoin gets no entry,
because its closed money is the whole position's landed on the last fill, and
that arithmetic does not hold there.

A ladder with twenty rungs filling in a cascade is twenty notices. That is the
rule — one per event — and it is loud on purpose; grouping is a later task.

## When a stop or a target fires

A second notice, after the fill's own: "Stop hit on ETH: sold at $80, lost
$55.00 (Hyperliquid main)". Two notices for one stop is the honest shape,
because the app learns the two facts at two different moments — the fill
arrives first, and which order caused it can arrive seconds or minutes later,
from `resolveClosingOrders` asking the exchange. When the stop was already
written down while it rested on the position, the second notice goes out with
the first.

A stop that closed at a loss is `warning`; a target is `info`.

The fill announcer reads the known stop and target rows for the whole fresh
fill batch before it writes the notices. It asks in groups of 500 order ids, so
a large catch-up cannot exceed the database's parameter limit. The same rule
applies when the app has just learnt several old order types from the exchange:
their recent fills are read together and then matched in memory.

Measured in the database test on 28 August 2026, 501 closing fills used two
trigger queries instead of 501 and still produced 1,002 notices, one fill notice
and one stop notice each. Two newly learnt triggers used one fill query instead
of two. An empty or old batch asks nothing.

## What keeps repeats out

- The fill's row in `trade_live_fills` is the one source of truth. Whichever
  process inserted the row sends the notice; a process whose insert conflicted
  sends nothing. Reloading the page, or a recovery read after a reconnect,
  re-inserts nothing and so announces nothing.
- **Only news is announced.** A fill more than 15 minutes old goes into the
  Journal silently. A wallet's first sweep pulls months of history, and three
  hundred notices about last spring would bury the one that matters.

## The engine keeps the record now

The fills record used to be written only when a browser polled, so a 3am stop
was recorded — and announced — whenever somebody next opened the page. The
engine now runs the same sweep from its own pass
(`reconcileLiveLaddersOnce` in `live-smart-orders.ts`), for every real wallet
with working orders, with the same saved key the browser read uses. With no
page open anywhere, the notice is already in the inbox when the page reopens.

## When a flow stops on its own

A flow that stopped quietly looks exactly like a flow that found nothing to
buy, so every stop a person did not ask for is a notice, level `warning`:

- **The engine stopped it** — the wallet was switched off or deleted. Title
  "Flow ⟨name⟩ stopped", body the same sentence written into the run's
  `stoppedReason`, so the bell and the history can never disagree.
- **Pressing Stop is silent.** The person pressing the button already knows.
  The Stop button passes `byHand: true` to `stopFlowRun`; nothing else does.
- **It went quiet** — the same refusal came back three times running and the
  flow entered its hold. One notice at the moment the hold begins, naming the
  reason in the same words the canvas uses (`flowWaitWords`) and how many
  minutes it waits. The hold doubles while the strikes rise; those doublings
  send nothing. A hold that clears and later begins again sends again
  (`flowHoldJustBegan` in `src/lib/trade/flow-waiting.ts`).
- **A trigger's start was refused.** A flow a Time or event trigger tried to
  start has nobody watching the step, so the refusal goes to the bell too, in
  the `flowStartProblem` words. A start refused while somebody pressed Run
  stays where it was: a sentence on the step in front of them.

Switching one wallet off and on repeatedly is one stop — and one notice — per
off. Correct, and a little loud.

## When one smart order keeps getting refused

A live ladder, grid or watched order pauses after five order-specific refusals
in a row. The pause belongs to that one strategy. Other strategies on the same
wallet keep working, and any position or stop already on the exchange stays
untouched.

The fifth refusal sends one warning notice. Its title names the coin and the
kind of smart order, its body carries the exchange's plain explanation, and
pressing it opens that coin's chart. Later engine passes send nothing for the
paused strategy and no more notices. A paused ladder or grid shows the same
reason and a Resume button in the Smart orders panel; a paused watched price
shows "Paused" and Resume on its Open orders row instead, because a watched
price is never listed in that panel (`../orders/watched-orders.md`). Resume
clears the count, but it never happens on its own.

One accepted order resets the count to zero. A rate limit, timeout or exchange
outage neither adds to the count nor clears it, because those problems belong
to the exchange-wide request limits and engine health. The default of five can
be changed with `TRADE_SMART_ORDER_REFUSAL_LIMIT`; values are kept between two
and twenty.

## What sends nothing

Resting orders being placed or cancelled, per-coin waiting reasons ("no base
yet" across four hundred coins is the strategy working), paper-only ladders
that never touch the exchange, and email anything.
