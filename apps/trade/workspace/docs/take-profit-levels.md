# Several take-profit levels

A live or practice position can hold up to three take-profit targets. Each row
sets the exact price and dollar amount sold there. The sizes together may cover
all or part of the position, but never more than the position holds.

The stop-and-target window shows the profit banked by each row and the running
dollar coverage at the entry price. The chart draws one green line per target.
Each line names its sale value and profit. Dragging or removing one line changes
only that target and keeps the others.

The chart's Take profit shortcut stays in the price menu until all three target
places are used. A second or third use adds a target without replacing the
earlier ones. When the first target covered the whole position, adding another
target gives the chosen slice to the new price and leaves the rest at the first
price.

The percentage buttons use only the position not already assigned to an earlier
target. If the first target has 50% of the position, 100% on the second target
means the other 50%, not the original whole position.

A lone target may have no fixed size. That keeps the old whole-position
behaviour for quick orders and positions saved before this change. Two or three
targets always carry fixed coin sizes, even though the window asks for dollars.
The app keeps the old single-target fields filled from the first target during
the compatibility release.

## Replacing live targets

The app creates the new stop and targets before cancelling the old protection.
A target move therefore cannot leave the position unprotected while the
exchange answers. If part of the new list fails, the old list stays on the
exchange and the refusal names any new protection orders that also went on.
If the new list succeeds but an old order cannot be cancelled, the refusal says
that both sets may be live.

Every target uses a fixed-size reduce-only order. Hyperliquid uses independent
`na` orders, and Aster always receives a quantity. [Phemex documents a limit of
20 conditional orders per trading
pair](https://phemex.com/help-center/summary-of-failed-orders-in-phemex-futures).
[KuCoin accepts up to 50 stop orders in one batch](https://www.kucoin.com/docs-new/rest/futures-trading/orders/batch-add-orders).
The largest replacement overlap here is eight orders, three old targets plus
an old stop and the same four new orders.

Each wallet read collects all take-profit orders for the position, sorts them
by price and removes their exchange copies from the plain open-orders list.
The first sorted target also fills the old single-target fields during the
compatibility release.

## Practice fills

Practice trading checks every target when a price update arrives. A crossed
target sells only its stated size and disappears. The remaining targets and
the stop stay attached to the unsold position. A price jump through two levels
fills both levels in order before saving the remaining position.

## Checks before real money

First open a $1,200 practice position at $100. Split its 12 coins into three
four-coin targets. Because the window asks for the dollars sold at the target
price, enter $440 at $110, $480 at $120 and $540 at $135. Add a stop below
$100, then move the practice price past $120. The first two targets should
appear as four-coin fills in the Journal. Four coins should remain with the
$135 target and the original stop.

For a small real Hyperliquid position, add three targets and a stop. Compare
the app with Hyperliquid's open orders. Both should show three fixed-size
reduce-only take-profit orders and one whole-position stop. Remove or move one
target from its chart line, then check that the other two stay unchanged.
