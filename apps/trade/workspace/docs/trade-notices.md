# Trade notices in the bell and the inbox

The app tells the wallet's owner when something happened with their money while
they were not looking. Every notice goes through one helper,
`src/server/trade/notices.ts`, which writes an inbox row and nudges the bell in
the open browser at once. A notice that cannot be written is a log line and
nothing more — the trade, the stop or the flow pass it belongs to always
finishes first.

## When an order fills

One notice per fill, never a digest. The words come from
`src/lib/trade/trade-notice-words.ts` and always carry the dollars, the price
and the wallet's own label:

- **A fill:** "Bought $500 of ETH at $90 (Hyperliquid main)". Level `info`.
- **A closing fill:** the same, with what it banked in the body — "Lost $55.00
  on this close." A loss is level `warning`.
- **A liquidation:** "The exchange liquidated ETH: …". Level `critical`.
- **A practice wallet** says so in the label: "(Test wallet, practice)".

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

## What sends nothing

Resting orders being placed or cancelled, per-coin waiting reasons ("no base
yet" across four hundred coins is the strategy working), paper-only ladders
that never touch the exchange, and email anything.
