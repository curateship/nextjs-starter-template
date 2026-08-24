# The stop and target riding on a position

A position that is already open can carry a stop and a target. Both live on the
exchange as their own orders, called legs here, and both sell the position by
themselves when the price reaches them. This file is about how the app reads
them back, replaces them, and draws them.

## A position is meant to carry one of each. It can end up carrying more.

Nothing in the app places a second stop on purpose. Two ways it happens anyway:

- An order placed with a stop and a target attached leaves its own pair behind
  when it fills. Those legs are for the size of that order, not for the position.
- A position that grows after that gets a whole-position pair put over the top,
  and the older pair is still there.

On 24 Aug 2026 a real Hyperliquid position was found holding four legs: a
whole-position stop and target, plus a second pair covering 48% of it. Both
pairs sat at the same two prices.

## Replacing the protection takes every leg off

When you move a stop or a target, the app cancels what is there before placing
the new one. It cancels **every** reduce-only leg the exchange is holding on
that market, not the two it happens to show you.

This is the part that used to be wrong, and it cost real money rather than
looking untidy. The app knew two leg ids. A third leg was invisible to it, so
it could never be cancelled, and every replacement added one more. A position
with two live stops gets sold twice: the first stop closes it, the second opens
a new position the other way round.

Every exchange the app talks to does this the same way. The list of legs comes
back with the position on each read, so cancelling them costs no extra request.

## The one it shows you is the oldest one

When a position carries two stops, the app names the one with the lowest order
id as the position's stop. Not the first one the exchange happened to list.

Before this rule the answer changed between reads. The same untouched position
read "Take Profit 48% +$89.60" one second and "Take Profit +$185.96" the next,
because the exchange does not promise an order and the app took whichever came
first.

## What the chart draws

Every leg is drawn, and none of them is hidden. Hiding an order that sells a
position on its own would be worse than drawing it in an awkward place.

- The position's own stop and target are the red and green lines with the grip
  dots. Drag them, or press the × to take them off.
- A spare leg reads **Extra Stop** or **Extra Target** with what it sells, in
  the same red or green. Its × cancels that leg on its own.
- A spare leg is never draggable. It is a trigger, and the exchange has no way
  to move one in place.

Which of the two a spare leg is comes from its price, not from a flag. An exit
above where a long got in takes a profit; one below it stops a loss.

## Two labels never land on top of each other

Every label pill is 22 pixels tall and they all want the same place, hard
against the price axis and centred on their own line. Two prices closer
together than that used to land on the same spot, and the pill drawn second
covered the first, words and × and all.

- A pill that lands on a pill already there moves **left** of it, never up or
  down. A pill off its own line would be pointing at a price that is not its
  own.
- The price badge on the axis cannot move sideways, because the axis is the
  only place a price is read. Two badges showing the same price are one fact
  printed twice, so the second is dropped. Two showing different prices both
  have to be legible, so the later one slides down until it is clear.

## Still to do

Setting two separate take profits, each selling part of the position, is not
built. The task is `workspace/tasks/Trading/several-take-profit-levels.md`.
Right-clicking a position that already has a target does not offer another one.
