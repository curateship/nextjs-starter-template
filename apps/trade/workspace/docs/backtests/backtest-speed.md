# Backtest speed

## Base levels

The base indicator keeps the best low or high in a moving queue. Each candle
enters the queue once and leaves once. A 200-candle search no longer scans the
same 200 prices again at every candle.

The rule itself has not changed. The first complete window, equal prices,
floors, ceilings and histories shorter than the search all produce the same
answer as the older scan. The saved result and the chart still read the same
level list.

## Saved-run actions

Pinning, archiving and deleting selected backtests each use one database
statement. The statement includes the signed-in account's id, so foreign and
missing ids do not change. A pin or archive request also leaves a row out of
the completed list when the row already has the requested value.

The database helpers stay in the server-only backtest folder. The browser API
module calls them through server functions, so the PostgreSQL driver never
becomes part of the page's client code.

Deleting a group still lets the database remove its coin rows through the
existing relationship. The response keeps the selected order for every id
that changed, so the results screen can describe completed and skipped rows.

## Preparing coins

The worker prepares two coins at a time. Two is deliberate. A coin can carry
ten years of candle objects, so a wider batch can make several full histories
exist twice while the database turns rows into the arrays the strategy keeps.

Within one coin, the market rules, base candles, indicator warm-up candles,
window candles and funding start together. A four-hour run still slices its
window from the base candles instead of loading a second copy. A coin that the
exchange no longer lists becomes a skipped result without stopping the other
coin in its batch.

Coins from the same exchange share one market-catalogue read, including while
the first read is still running. Starting two coins together never starts the
same catalogue download twice.

Price-gap and funding-gap checks run together for five coins at a time. Those
answers are small, and ten reads match the database pool's default limit of ten
connections.

Every new saved run keeps these preparation measurements in
`result.preparation`:

- the number of coins prepared
- the batch size
- preparation time in milliseconds
- heap memory at the start
- the highest heap-memory sample while coins and batches finished

The measurements belong to the saved run. Comparing two runs of the same
window can therefore check speed and memory together instead of timing one run
and guessing what happened to memory.
