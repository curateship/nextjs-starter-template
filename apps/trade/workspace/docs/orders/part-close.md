# Selling part of a position

The bin on a position row opens a window asking how much comes off. It starts
on all of it, which is what the button did before, so nothing has to be filled
in to get the old behaviour.

## All of it and part of it are sold differently

This is the part worth understanding, because it is not a detail.

- **All of it is a market order.** It pays the spread and the taker fee to be
  out right now, which is what somebody pressing "close everything" is asking
  for.
- **A part is a limit order that follows the price.** It rests just off the
  market, never crosses it, and moves as the price moves until it fills. That
  is what `../rules/trading-rules.md` asks of a close, and taking some profit off a
  winner is exactly the case where it matters: the trade is going your way,
  there is no hurry, and the spread is money.

The window says which of the two a press will do, in dollars, before it is
pressed.

## What the window asks

- **An amount, in dollars or in coins**, with 25%, 50% and All of it as
  presses that fill the box. Switching the unit says the same amount in the
  other unit, so switching never quietly changes what would be sold.
- **What happens to the rest**, in dollars, including where its stop is. "$49.62
  of the $99.23 position, about 17.852132 coins at $2.7795. $49.61 keeps
  running, with its stop at $2.40."
- **A refused amount says why**, above the button, and the box is outlined. An
  amount bigger than the position names what the position holds; an empty box
  says what all of it comes to.

## The sums happen on the server, not in the window

The window shows dollars and coins side by side, but the price it showed them
at is a second or two old by the time the press lands. Dollars become coins on
the server, against the price the exchange is quoting then, and the result is
rounded down to the market's own size step.

**More than the position holds is capped, not refused.** A window saying "sell
$95.57, all of it" is quoting an old price, and if the coin has dropped since,
$95.57 is more coins than the account holds. Refusing there would turn a plain
"all of it" press into an error on a falling market, which is the worst moment
for one. Capping cannot over-sell, because of the next rule.

**A remainder too small to be an order is not a remainder.** If what would be
left is under the exchange's smallest order, the whole position is sold
instead. Leaving a scrap behind would leave something that can never be closed
again: from then on the close button itself would be refused. This also covers
a near-miss the window makes on its own — the amount box holds cents, and all
of a $99.29 position is 35.699133 coins, which read back from "99.29" is a hair
short.

## How the chase works

Nothing is sent to an exchange when the press lands. One row is written, and
the engine's next pass rests a reduce-only post-only limit just off the price
and follows it. It is the same chase a watched order runs, with the same
ten-second spacing between moves and the same "has the price moved enough to be
worth moving" test.

That means the practice lane and the real lane need no separate code: the
engine already knows how to place an order in either, and a practice run that
filled instantly where the real one had to queue would make practice a worse
guide than no practice at all.

**It does not give up.** The order follows the price for as long as it takes.
That is the app's existing rule rather than an oversight: being half out of a
position is worse than any price the rest would have got. The window says so
before the press.

**It never asks for more than is left.** The chase cancels and re-places its
order whenever the price drifts, and a fill landing in between would otherwise
be forgotten — the next order would go out at the full size and four coins
asked for could leave as six. What is left to sell is the amount asked for less
how far the holding has already come down, so the position itself is the count.
The one way that can be wrong is something else reducing the position, a stop
firing or a ladder exit on the same coin, and then the close stops early. Early
sells less than asked and never more.

**A missing order does not mean a part close is gone.** The exchange's open
order list can briefly leave out an order that is still working. Trade waits
until the whole requested piece has left the position before it releases that
order number. A partial fill does not prove the unsold remainder has gone. A
replacement could meet the first order and sell too much.

## Calling one off

The resting order shows under Open orders like any other. The × on it stops the
close rather than taking that one order back — taking it back would be answered
by the engine placing another a few seconds later, and the row would come back
looking like the press had missed.

Cancel a part close from Trade, not from the exchange's own screen. If an order
vanishes outside Trade before the requested piece has left, Trade waits instead
of guessing that another order is safe.

## The stop and the target on what is left

A whole-position target shrinks with the position on its own and is left alone.
A target set to sell a fixed number of coins does not, so one bigger than what
will be left is brought down to what will be left, before the close is placed.

It is done then rather than after the fill because the fill happens in the
engine minutes later, and a target the exchange refuses is a position with no
way out. The cost is that a close which never fills leaves a smaller target
than was asked for, which sells less than intended and never more.

**Not read back from Aster, Phemex or KuCoin yet.** Hyperliquid's whole-position
bracket tracks the position; what the other three do with a fixed-size target
after a part close has not been checked against those venues, and the answer
belongs in this file when it has been.
