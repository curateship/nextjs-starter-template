# Smart orders never rest on the book

**A smart order places nothing until a price is actually reached.** A level on
the chart is a price the app is watching. When the market gets there, and only
then, an order is sent. Nothing sits on the exchange's book waiting.

This holds for every smart order, now and in future. It is a rule, not a
preference, and `trading-rules.md` outranks this file if the two ever disagree.
Plain orders are a separate story with a setting of their own, told in
`watched-orders.md`.

## Why

- **A resting order ties up money.** A plan with twelve resting buys reserves
  the whole pot the moment it is placed, so the rest of the account cannot use
  it, even though eleven of those levels may never trade all week. With a
  watched level the cash stays free until something actually happens.
- **A resting order uses up an order slot.** A wallet has a cap on how many
  orders can be open at once. A plan that is mostly waiting should not be
  holding most of that cap.
- **A resting order gets drawn twice.** A resting order is a row, and the chart
  draws every row it finds. The smart order's own layer then draws its line on
  top of the same price, so you get two labels and two lines for one price. A
  watched level is not a row, so the only thing on the chart is the smart order
  itself.

## How it is built

The engine compares today's price against each level on every pass and calls its
injected `fill` when one is crossed. There is no `insertOrder` for a level, no
order id on a level, and nothing to cancel when a level is called off. The
level's status changes and that is all.

## The DCA ladder

The ladder has been on watched levels since 14 Aug 2026. Placing one sends
nothing anywhere, and each rung fires at market the moment the live price
crosses it, checked every second, the same as the grid.

The one place a resting rung still exists is inside a backtest. The replay's own
book models a watched level as an order the bar's wick fills, so crash-day
results stay comparable with everything measured before. On a real book there
are no exceptions left.
