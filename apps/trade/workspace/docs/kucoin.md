# KuCoin

## Open orders

KuCoin can return finished stop-order history from `/api/v1/stopOrders` when
Trade asks for the protection and orders the account still holds. Trade drops
every row KuCoin marks `isActive: false` or `status: done` before drawing the
portfolio. A finished stop cannot appear as current position protection or as
an order with a cancel button.

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
