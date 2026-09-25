# One writer at a time

The website and trading worker take turns before reading or changing a wallet's
smart-order plans. PostgreSQL holds the wallet row lock until the writer finishes
and commits its recorded changes. Another wallet can take its own turn meanwhile.

## The shared lock

- `src/server/trade/db.ts` owns the transaction and wallet row lock. The lock
  includes the user id, so a caller cannot take another user's wallet.
- Trade helpers use the current transaction through the Trade database handle.
  Outside a wallet write, that handle uses the normal database pool. The shell's
  database file stays unchanged.
- Nested work on the same wallet shares the transaction. A grid edit can run an
  engine catch-up pass without waiting for a lock the edit already holds.
- A nested call for a different wallet is refused. Work spanning several wallets
  must give each wallet a separate turn.
- Pushed-fill callbacks run independently of the transaction that opened their
  socket. A later callback that edits a plan must acquire a fresh wallet lock.
- Fill and history writes also lock the wallet before their history rows. That
  order prevents a fill recorder and an engine pass waiting on each other's rows.
- A waiting writer has five seconds to acquire the wallet lock. After that,
  the action returns `SMART_ORDER_WRITE_BUSY` without starting its work.
- Hyperliquid HTTP requests time out after fifteen seconds while a wallet turn
  is active. The timeout lets the transaction finish and release its lock when
  the exchange stops answering.
- The five-second limit applies to acquiring the lock. An exchange request
  already running keeps ownership until it finishes. Releasing the lock while
  that request can still place an order would allow two writers again.
- PostgreSQL releases a transaction's lock when its connection closes, including
  when a process dies. No separate lock record needs cleanup.

## Which actions take turns

The live grid and ladder actions, engine pass, hand-set protection, watched-order
edits and cancellation, resume, and wallet flattening use the same wallet lock.
Practice grid and ladder edits also use that lock. The practice engine already
locks the wallet row before reading and advancing its plans.

Flow signal exits reread their plan after acquiring the lock. A signal seen before
a cancellation cannot overwrite the cancellation with an older plan. Flow grid
flips and flow stopping also keep the wallet locked while reading and writing.
Flow stopping checks the grid's current holdings before deciding whether to end
the row.

The existing completed-row checks remain in place. Those checks prevent an older
save from reopening a completed row. The wallet lock also protects edits while
the row remains active, including cancelling waiting buys while held coins
still have exits to finish.

## What the screen says

A lock timeout says, "Another action is still updating this wallet. Your change
was not made. Try again in a moment." The existing error toast shows the refusal
and the pending state clears.

If a second cancellation finds no waiting entries, the individual grid or ladder cancellation
request says that no new trades remain to stop. Bulk cancellation can still
continue past an order that already has no waiting entries. Neither action sells
its held coins.

## Exchange actions and database failures

An exchange refusal does not undo earlier accepted steps. The wallet transaction
commits the progress already recorded before returning that refusal. Nested
database transactions still use savepoints for operations that must roll back
together.

A database failure is different. If PostgreSQL has aborted the transaction,
Trade reports failure rather than claiming that an attempted commit saved the
plans. A database transaction cannot undo an order already accepted by an
exchange. Existing fill and order reconciliation still handles that boundary.

## Local verification

Run only the focused test files for the workflow being checked.

```sh
npx vitest run --config vitest.app.config.ts src/server/trade/live-smart-orders.test.ts src/server/trade/smart-grids.test.ts
```

Set `TRADE_TEST_POSTGRES_URL` to a local PostgreSQL administrator connection.
The test helper refuses remote hosts. Each test creates its own temporary
database, applies the migrations, and drops that database afterward. The tests
never use the application's tables.

```sh
npx vitest run --config vitest.app.config.ts src/server/trade/wallet-plan-lock.test.ts
npx vitest run --config vitest.app.config.ts src/server/trade/live-smart-orders.test.ts -t 'wallet plan concurrency'
```

The PostgreSQL tests observe a waiting database connection before releasing the
first writer. The live-order tests run the actual engine pass and grid cancellation
functions with controlled exchange responses. Cancellation must survive both arrival
orders and later passes. Additional cases cover separate wallets, timeouts,
connection loss, nested actions, ownership, and a caught SQL failure.
They also cover a callback after its original turn and a pushed fill arriving
while an engine pass records the same fill.

For an exchange check, use a testnet wallet and a worker running the same code.
Delay the exchange response during a pass, then cancel the grid's waiting entries.
After the pass finishes, cancellation must remove the remaining waiting buys and
later passes must leave those buys cancelled. Repeat with cancellation first and
with two browser tabs. Verify the available cancellation control in the running
app before this check; this change does not add a grid Stop button.

## Deployment

No database migration is required. Every writer must run the new code before the
cross-process guarantee applies. Deploy the website and trading engine together
when deployment is authorized. An older process still using only its own memory
queue does not participate in the database lock.
