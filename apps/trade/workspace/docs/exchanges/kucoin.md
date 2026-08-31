# KuCoin

## Open orders

KuCoin returns finished stop-order history by default from
`/api/v1/stopOrders`. Trade asks for `status=active`, then also drops any row
KuCoin marks `isActive: false` or `status: done` before drawing the portfolio.
A finished stop cannot appear as current position protection or as an order
with a cancel button.

Trade sends protection added to an open KuCoin position with the exact number
of contracts held at that moment. KuCoin accepted the more general
`closeOrder` form and returned an order id, but the exchange marked those stops
and take-profit targets finished without triggering them. A grid replaces its
sized stop whenever its held amount changes. A whole-position target keeps the
size held when the target was placed.

An order id does not prove that protection is working. Trade reads every new
stop and target back from KuCoin. Each one must be active before Trade records
success or removes the old protection. A leg that is already finished, or
cannot be found after three reads, is reported as refused.

## Refusals

Trade maps the KuCoin Futures codes this app has seen, plus the size, price,
cash, risk and request-limit families KuCoin publishes. Every sentence names
KuCoin and says what to change.

The local Journal showed code 300009 when there was no position to close and
330005 when the order used the wrong margin mode. KuCoin's Futures code list,
checked on 24 August 2026, supplies the other families. Those cover orders
below the minimum, a size or price between legal steps, too little cash, prices
outside the market's allowed range, too much risk and too many requests.

An unknown code keeps KuCoin's scrubbed code and words after a sentence that
says Trade does not recognize the reason. The app does not guess that an
unknown code means the order is safe to repeat.

## Market-order price bands

Trade sends a KuCoin market order as an immediate-or-cancel limit, normally no
more than 3% through the price. KuCoin gives each market its own live allowed
boundary, and some thin markets use less. STXX used 2% on 27 August 2026, so a
grid trigger that was otherwise legal was refused when the old 3% cap crossed
that boundary.

The order path now reads that market's live `buyLimit` or `sellLimit` after the
margin-mode read and immediately before placing the order. It keeps a small
amount of room inside the moving boundary. The 3% protection still applies on
markets whose allowed range is wider.

A watched rung remains only in Trade while it waits. KuCoin sees the boundary
read and the immediate order only after Trade sees the rung's price reached.

## Part closes and fresh order reads

Trade drops its saved KuCoin open-order answer after every accepted placement
or cancellation. The next account read must ask KuCoin again. Reusing the
answer taken just before a half-size sell would hide the new order from the
engine and could make the engine send the same half a second time.

A part close also keeps its order number when KuCoin briefly leaves the order
out of an open-order answer. Trade releases the number only after the whole
requested piece has left the position. A partial fill does not prove the
unfilled remainder has gone. Replacing that remainder while the first order
can still fill would sell too much.
