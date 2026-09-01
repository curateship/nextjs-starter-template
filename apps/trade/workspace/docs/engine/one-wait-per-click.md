# One wait per click

The database is far away, so what a click costs comes down to how many trips
it makes one after another. A scan on 29 August 2026 found nearly every
action running its trips in a line — placing a limit order made six database
trips plus three exchange calls in a row and took about five seconds in dev.
These are the rules the action paths follow now, and where each one lives.

## Independent questions go out together

Work that does not depend on other work runs in one wait, not a parade.

- `placeLiveOrder` fetches the price, the market rules and the portfolio in
  one `Promise.all`. The portfolio is only read to learn whether the coin is
  already held, which decides the leverage.
- `closeLivePosition` fetches the portfolio and the rules together. The
  portfolio read itself stays: the close is sized from the exchange's own
  number, never a cached one, because a sell bigger than the position becomes
  a short.
- `setLiveBrackets` fetches rules, portfolio, the stop's price check and the
  grid's spared stop ids in one wait. `changeLiveLeverage` pairs its two
  reads the same way.
- The place handler starts the order-style read alongside the rate-limit
  check instead of after it.
- The flow-run page (`readFlowRun`) and the canvas flow header
  (`loadFlowTradingFn`) fire their independent reads in one wait; the run
  page's were six in a row.

## The journal rides behind the answer, refusals in front of it

A successful action no longer waits for its journal row before answering the
browser — `journal()` never throws and logs its own losses, so the wait
bought nothing. A refusal still blocks: no refusal is ever answered before
it is recorded. The row itself is unchanged and still appears on the next
read.

## The real-money switch is remembered for two seconds

Every mainnet signature used to read the `trade_worker_controls` row fresh.
Now a "yes" is remembered for two seconds per process
(`src/server/protocols/real-money-memory.ts`). Only "yes" is remembered —
"off" is never cached, so switching trading ON is seen on the very next
signature. Switching it OFF forgets the memory inside the write itself, so
the container that took the click refuses immediately and the others within
two seconds. The memory is keyed to the database handle, so tests with fresh
databases never inherit it.

## Batches share their overhead

- Cancelling a ladder's remaining rungs reads the wallet row once for the
  whole batch instead of once per rung (`walletRow` on `cancelLiveOrder`).
  Each rung keeps its own exchange call and signing number.
- Dragging a row in the markets panel writes every folder's position and eye
  state in one CASE statement instead of one update per folder.
- Starring a coin no longer builds a fresh folder list the browser was going
  to throw away — the browser stars optimistically and only re-reads on a
  failure.
- Picking a wallet patches the remembered choice with one `jsonb ||` upsert
  instead of read-then-write, the `saveMarketPanelRows` idiom.

## The screen believes the server's answer

A placed order's "sending" line turns into the real order the moment the
answer names it — see `charts/orders-on-the-chart.md`. The full re-read
still runs and remains the truth.

## What stayed slow on purpose

- The paper portfolio read asks for smart orders after the settle, not
  alongside it, so a ladder a stop just finished is already gone from the
  answer. The comment in `loadPaperPortfolioFn` says so.
- The ladder settings window still runs the engine catch-up pass twice: once before
  the edit so it sees current fills, once after (forced) so the new
  protection goes onto the exchange now rather than on the engine's next
  turn.
- The Trading Overview reads the widget arrangement before the overview,
  because the arrangement decides which widget reads run at all.
- Aster's margin-mode save still reads back after writing — the verify is
  the point.
- Every safety check stayed: pairing rules, rate limits, the per-wallet
  queue, and the portfolio read before a close.

Still open, tracked in `workspace/tasks/Performance/one-wait-per-click.md`:
the paper paths settle the book before and after a change (15 to 22 trips),
and the account panel repeats settle work the portfolio poll just did.
