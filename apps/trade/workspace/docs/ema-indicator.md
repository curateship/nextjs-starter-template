# The EMA indicator

EMA means exponential moving average. The average follows recent closes more
closely than older closes, which smooths the candles without giving every old
price the same weight.

The indicator draws three lines:

- Blue follows the last 20 closed candles.
- Orange follows the last 50 closed candles.
- Green follows the last 200 closed candles.

Each line starts only after the chart has enough closed candles for its period.
The candle still forming does not count.

## The crossover call

The 50 and 200 lines make the buy and sell calls. The 20 line does not change
the call.

- A buy arrow appears when the 50 line moves from at or below the 200 line to
  above it.
- A sell arrow appears when the 50 line moves from at or above the 200 line to
  below it.

The arrow lands on the close of the candle that completed the cross. The
Signals step receives the same moment, so a chart arrow and an automation call
cannot disagree.

## Where it is

Open the Indicators menu above the chart and switch on **EMA 20 / 50 / 200**.
The same indicator appears in the Signals step because the crossover can call a
trade.

Each line has its own **Show on chart** checkbox and colour picker. Hiding a
line only changes the chart. The 50 / 200 crossover call keeps running even
when one or both of those lines are hidden.

The **Signals** card has a **Show buy / sell arrows** checkbox. Hiding the
arrows only changes the chart. A Signals step still receives the same crossover
calls.

The three periods and the crossover pair stay fixed so the chart, a backtest
and a running flow all read the same rule.
