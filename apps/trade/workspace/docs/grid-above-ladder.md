# A grid above a ladder

One coin can hold a grid and a DCA ladder at the same time, on a live wallet.
The grid works a range up high and earns on the bounces. The ladder waits
below to catch a real fall. The grid's stop sits just above the ladder's first
buy, so on the way down the grid sells out first and the ladder takes over.
This is the only pairing of two smart orders the app allows on one coin —
everything else is still refused, exactly as before.

## The one position problem, and how the pairing solves it

The exchange holds one position per coin. A position normally carries one
stop, and that stop sells everything when it fires. Two strategies sharing a
coin therefore need two stops that each sell only their own coins, and the
app now does that like this:

- **The ladder keeps the position's ordinary stop.** That stop grows with the
  position on its own, so every new rung the ladder buys is covered without
  the app rewriting anything.
- **The grid gets its own separate stop order**, sized to exactly the coins
  the grid is holding right now. When a grid level buys or sells, the engine
  replaces that stop at the new size on the same pass. The order's id is
  written on the grid's own record, so only the grid can move or cancel it.
- **The grid's stop must sit above the ladder's first buy.** Price falling
  reaches the grid's stop first, the grid's coins are sold, the grid is over,
  and only then can the ladder's stop ever be reached — by which time closing
  everything is right. This ordering is refused when it does not hold, not
  warned about.

## What is refused, and why

- **Practice wallets.** The practice book holds one stop per position, so it
  cannot simulate the handoff honestly. Live wallets only.
- **Phemex.** Its stops carry a flag that may close the whole position no
  matter what size is given, and until a real-exchange test answers that,
  a part-size stop there could sell the ladder's coins. Hyperliquid, Aster
  and KuCoin are allowed; their adapters can hold a fixed-size stop beside a
  whole-position one.
- **A grid with no stop, or with a base-riding stop.** No stop means no
  handoff line. A stop riding the 4h base can move down later, below the
  ladder's first buy, which would break the ordering after the fact. Percent
  and fixed stops only ever rise, so those are fine.
- **A second of the same kind, or anything involving a signal trade.** Only
  the grid-plus-ladder pair is allowed, one of each.

The same rules guard every later edit: dragging the grid's stop, changing it
in settings, or moving the range is refused if the stop would land at or
below the ladder's first buy, or vanish.

## What still cannot be split

The two strategies are separate in the app but one position to the exchange.
They share one pot of margin and one liquidation price, so a ladder deep
underwater can get the whole position force-closed, grid coins included. No
stop ordering prevents that, and both placement windows say so before the
pairing is placed. The exchange also reports one average entry price for the
blob, so profit per strategy is the app's own count from each order's fills.

## What appears in Smart orders

A grid placed by hand stays in the Smart orders panel when the ladder below it
belongs to a running automation. Older orders that do not carry their owner's
run id are matched back to an automation by wallet, coin and order kind. The
coin alone is not enough because the automation's DCA ladder and the manual
grid deliberately share it.

## How the app keeps the two stops apart

- Replacing a position's protection normally cancels **every** leg the
  exchange holds (see `position-protection.md`). The grid's own stop is the
  one exception: an ordinary replace — a hand dragging the position's stop,
  the ladder's engine re-aiming — spares the order id written on the grid's
  record. The grid's own replace names exactly its old order and touches
  nothing else.
- Every exchange read names the oldest stop leg as "the position's stop",
  and the grid's leg is usually the oldest. The app re-reads that answer and
  hands each stop back to its owner before the engine or the screens see it,
  or the ladder would mistake the grid's stop for a hand-move and stop
  managing its own.
- When the grid's stop order disappears from the exchange, the grid treats
  that as its stop having fired: it closes itself and the ladder carries on
  untouched. A short grace covers a slow read.
- The ladder's take profit is sized to the ladder's own coins while paired,
  so it cannot sell the grid's. The grid never writes a take profit at all —
  its finish line, if price jumps past it, sells only the grid's holdings.

## Where the pieces live

The pairing rules are in `src/lib/trade/pairing.ts` and are enforced from
`src/server/trade/smart-pairing.ts` at both placement paths and every grid
stop edit. The grid's stop record is `pairedStop` on the grid's plan. The
sized stop travels through `setLiveBrackets` (`slSz`, beside the target sizes
that already existed) into each exchange adapter.
