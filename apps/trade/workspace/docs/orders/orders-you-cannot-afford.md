# An order the wallet cannot pay for

Trade refuses an order you place by hand when the wallet does not hold the
margin for it, and says both figures. Before this the order went to the
exchange, the exchange filled whatever the money reached, and nothing anywhere
said that was not what you asked for.

Tyler, 3 Sep 2026: "If I have $10 left and I enter a position for $100. It
still lets me enter but it only order $1."

The rule this follows is stated in `../rules/trading-rules.md` and outranks
this file: a buy the wallet cannot afford is refused, never made smaller.

## What is checked

The size box is the position's worth. Leverage decides how much of it the
wallet actually puts up, so the comparison is the margin rather than the order.
A $100 position at 10x needs $10, and at 1x it needs $100.

- **Adding to a position uses that position's own leverage**, not the number in
  the box, because that is the leverage the order will really run at.
- **A closing order is never refused.** Selling what you hold needs no new
  margin.
- **An account the exchange will not answer for is never refused either.** Not
  knowing is not the same as knowing there is not enough, and a person pressing
  a button deserves the exchange's own answer over a guess.

The refusal names the two amounts and what to do:

> This order needs $9,000.00 and HL1 has $10.00 free. Use a smaller size, more
> leverage, or close something first.

It lands as a toast on screen and as a refused row in the Journal, the same as
every other refusal.

A watched level is the one exception, and it goes the other way: a level
waiting for a price commits no money, so today's cash never blocks it. The
level is checked again by the engine when its price arrives, and waits if the
money is not there. An order that starts working immediately, which means
adding to a position, is checked here like any other. "Now" is exactly when
today's cash is the question.

## Only orders placed by hand

A rung, a grid level and a watched price each have their own affordability
rule, and every one of them **waits** rather than failing. A level that cannot
be afforded when its turn comes stays waiting for the next pass. Refusing those
here would turn a patient level into a failed one, so the check is only applied
to an order a person pressed a button for.

## A fill smaller than the ask says so

The check happens a moment before the order is signed, so a price move or a
thin book can still leave a fill short of what was asked. Hyperliquid answers
"filled" whatever amount it managed, so a short fill used to be
indistinguishable from a whole one.

- The Journal row reads **"Filled $5,000.00 of the $50,000.00 asked for."**
  instead of "Filled straight away."
- No toast interrupts the order. The smaller position appears on screen, and
  the Journal keeps the exact amounts for anyone who needs to check the fill.

Where it lives: `src/server/trade/live-orders.ts` (the refusal and the Journal
line), `src/lib/api/trade/live.ts` (which orders count as by hand), and
`src/components/trade/use-trading.ts` (the position shown after a fill).
