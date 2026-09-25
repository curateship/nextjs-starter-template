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

## Walking each candle

The engine fetches each coin's current candle once. The whole-candle walk, the
one-minute check and the fallback for coins without minute prices all reuse that
same candle. A coin with no candle at that time stays out of the walk.

The sorted lists of active ladders, grids and signal trades change only when a
trade starts or finishes. Each change replaces the list with a new sorted copy.
Code already walking the previous copy can finish without skipping the next
coin.

The ladder's candle feeds also stay in one cached map. A ladder change marks the
map for replacement at the start of the next candle. That boundary matters. A
ladder that finishes part-way through a candle must still see the feed map that
existed when the candle began.

Funding checks keep only coins with unread funding entries. A coin stays in the
set when its first funding entry is still in the future, then leaves after its
last entry is applied. Coins with no funding and coins whose history has ended
no longer get checked twice for every candle.

These caches do not change prices, fills, fees, funding or ordering. A speed
comparison uses the same saved run before and after the engine change, then
checks every dollar result and fill before comparing elapsed time.

## Checking a market-wide fall

The cascade calculation remembers the highest earlier candle price while
walking each coin's current window. Each high is considered once, instead of
searching all earlier highs again for every candle. For a 96-candle window,
the old inner search made 4,560 comparisons. The new search makes 95 checks
of an earlier high, plus one comparison with each candle's opening price.

The remembered high starts fresh for each window. The window still includes
both endpoints. A candle's own high cannot measure its own fall, because the
low may have happened first. Its opening price can. A candle with an invalid
low still contributes its high to later candles, just as before.

Live ladders and backtests use the same calculation. Thresholds, hold times,
prices and fills do not change. The speed benefit applies when the cascade
rule runs, and grows with the number of candles in the lookback window.

### Checking the calculation

Run `npx vitest run src/lib/trade/cascade.test.ts`. The tests compare exact
answers against the former scan across 5,000 seeded series, including empty
windows and unusual prices. Separate cases cover the exact window edge,
short windows, same-candle rallies and invalid lows. A high-read count test
rejects repeated scanning without relying on machine speed.

Run `npx vitest run src/server/trade/backtest/engine.test.ts -t "holding through a market-wide crash"`
for the three backtest cases covering the crash rule on, off and an isolated
coin falling.

For a saved-run comparison, replay identical coins, candles, funding, dates,
settings and starting money with the former and current calculation. Enable
the cascade rule. Compare every fill, fees, funding, ending balance and the
account-value curve exactly before comparing elapsed time. An older saved
result from a different engine version is not a reliable baseline. Candle
loading time can hide the calculation saving, so whole-run speed needs its
own measurement.
