# The Grid automation step

A trading flow can end with Grid after Wallet and Markets. Grid follows one
exponential moving average, or EMA, on closed 4-hour candles. The step decides
the grid direction. The person drawing the flow decides how long price must
stay clear and how the grid spends its money.

## When it places

Grid starts with EMA 200 and 72 clean hours. The setting moves in 4-hour steps
because Grid only reads closed 4-hour candles. The default means 18 closed
candles. Every low must sit above the EMA for a buying grid. Every high must sit
below it for a selling grid. A wick touching the line fails both checks. Mixed
candles also mean wait.

The EMA needs 600 closed candles before Grid makes a call. That is 100 days of
4-hour history. The run page says when a coin is too new, when its wicks are
mixed and when a grid is waiting for a new candle.

The step saves its own EMA period and clean-hour wait. The saved Grid block
holds range, wallet share, borrowing, spacing and an emergency stop distance.
It also holds the two switches for following price and either an even level
count or a custom share for every rung. There is no End Grid setting. Direction
is absent because the EMA decides. A buying range reaches down from the current
price, and a selling range reaches up. Automatic stop reversal stays off
because the flow handles a change of direction itself.

## Rungs and following price

Rung price distance has no separate percentage box. Range from the current
price sets how far the last rung sits from the first one, and the number of
rungs splits that distance. With the same-dollars choice, a coin at $100, a 10%
range and six rungs puts a buying grid at $100, $98, $96, $94, $92 and $90.
Spacing changes whether those gaps use the same dollars or the same percent.

Custom rungs divide the money set by Share of wallet, and their shares must add
up to 100. Read from the top of the chart down, a three-rung buying grid is 1,
2, 3 and puts the largest amount on rung 3 at the bottom. A selling grid is 3,
2, 1 and puts the largest amount on rung 3 at the top. The EMA turn moves the
shares with those rung numbers instead of flattening or reversing their sizes.
The percentages in the Rungs card divide money. They do not move the rung
prices.

Follow price up and Follow price down use the ordinary grid engine. Either
switch can be on by itself, both can be on, or both can be off. Following toward
the winning end walks an empty range behind price. Following toward the losing
end adds one new rung at a time and keeps the emergency stop fixed.

## What happens after placement

The step uses the same paper or live placement path as the chart window. Every
size, fee, market and account check still applies. The new grid carries the run
ID, which lets the run dashboard count its trades and lets Stop find only the
orders the flow owns.

The normal grid engine runs each level. A same-side EMA reading leaves the grid
alone. A mixed reading leaves it alone too. When every wick confirms the other
side for the full Clean hours wait, the flow closes what that Grid holds,
cancels the old waiting levels and marks the old grid finished. The next pass
places the opposite grid around the current price. A bell notice confirms the
flip. A refused fresh grid gets a warning instead.

A flow checks one coin per candle pass and starts with the coin it checked least
recently. An active Grid keeps that check time, so a long coin list keeps moving
instead of checking the first active coin forever.

Signals and Grid share one paced candle read across running flows. The flow
checked least recently goes first, so one older flow cannot take every candle
read from the flows started after it.

The close belongs to this Grid, not the wallet's whole position. If a live DCA
ladder shares the coin, the flow first cancels the Grid's separate stop and
sells only the coins recorded on the Grid's levels. It subtracts the DCA
ladder's filled rungs from the exchange position. Repeating the close after a
server interruption therefore cannot sell the ladder's coins. A practice Grid
uses the same ownership limit when the wallet holds extra coins.

The flow remembers the last closed candle it acted on. If a grid reaches its
emergency stop, the flow waits for a newer closed candle before it can place
again. The current EMA reading chooses the direction again. The grid has no End
Grid line, so only Stop on the flow ends the EMA loop. Signals and Grid share
one candle allowance, so adding Grid does not double exchange candle reads.

## Switching it off

Stop blocks a Grid placement already in flight once Stop owns the wallet lock.
The engine then cancels waiting levels on every grid stamped by that flow. A
hand-placed grid has no run ID and is left alone. A flow grid that already holds
coin also stays in place with its emergency stop.

## Backtesting it

A Grid flow whose Wallet step uses pretend money has the Backtest panel and
button on the automation canvas. The replay always walks 4-hour candles because
that is the EMA Grid's clock. It loads 600 candles before the chosen window so
the first candle in the result can have a real EMA 200 answer; those warm-up
candles are context and cannot trade.

Each closed candle makes the same long, short or mixed decision as the running
flow. The replay places the same ordinary Grid plan, works its levels through
the same grid engine, closes it when the opposite side completes the clean-hour
wait, and immediately drafts the opposite grid at that candle's close. An
emergency stop ends one historical grid, not the loop. Later closed candles can
start another until the backtest window ends.

The saved result draws the EMA used by the run and lists its clean hours, levels,
wallet share and following choices. Sell-first rounds are stored as short
trades, so their entry is the sale, their exit is the buy-back, and profit is
measured in the right direction. Where a grid can touch a level inside a 4-hour
candle, the replay asks for minute candles. If that exchange has no minute
history, the result carries the same missing-minute warning as other smart
orders instead of pretending the candle's close reveals the path of its wick.
