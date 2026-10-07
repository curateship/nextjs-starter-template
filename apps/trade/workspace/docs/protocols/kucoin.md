# KuCoin

## What a KuCoin market is called on screen

KuCoin's contract ids end in the quote currency and a perpetual's M, so
Bitcoin is `XBTUSDTM` and Solana is `SOLUSDTM`. Every screen prints the coin
on its own: SOL, PUMP, ARB, MARSCOIN. The market list strips the ending when
it builds its rows, and `marketSymbol` in `src/lib/protocols/contracts.ts`
strips the same ending for every panel that holds only a market key, which is
how the Positions table, the orders panels and a notice's words all say the
same thing. Positions and waiting orders read `SOLUSDTM` before that
(Tyler, 3 Oct 2026).

XBT stays XBT. KuCoin calls Bitcoin XBT in its ids and in the base currency it
publishes, so renaming it to BTC here would disagree with the exchange and
with the market list. Chart history is the one place that maps XBT to BTC,
because the history source lists the coin under its ordinary name.

## Open orders

KuCoin returns finished stop-order history by default from
`/api/v1/stopOrders`. Trade asks for `status=active`, then also drops any row
KuCoin marks `isActive: false` or `status: done` before drawing the portfolio.
A finished stop cannot appear as current position protection or as an order
with a cancel button.

A field KuCoin leaves blank arrives as `null`, not as missing. A plain limit
order carries `"stopPrice": null`, and until 6 Oct 2026 Trade's reader
accepted only a number or an absent field there, so it threw the whole order
away. Trade then read the account as holding no open orders. A close it had
just placed looked lost from the moment it was sent, and because a lost close
is never assumed gone, the engine waited forever and never followed the price.
The chart read "Placing order..." for a sell of 5813 ARB at 0.20739 while
KuCoin listed that order as open the whole time. Every field KuCoin may leave
blank is now read as blank, in `src/server/protocols/kucoin/orders.ts`
(`orderRowSchema`). The same reader confirms an order after placing it, so
that confirmation also failed silently before the fix. After the deploy the
engine sees the order on its next pass, clears its "missing" mark and resumes
following the price. Nothing in the database needs changing.

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

`100001 Leverage parameter invalid.` is KuCoin's whole answer when the
leverage asked for is more than the market allows a position of that size.
Seen in the Journal on 1 and 2 September 2026 while setting leverage on
ETHUSDTM. It reads as "KuCoin will not accept that leverage on this market.
KuCoin lowers the most it allows as a position gets bigger, so pick a lower
leverage, or reduce the position and try again." 100001 is KuCoin's general
bad-parameter code, so only an answer with the word "leverage" in it gets that
sentence.

An unknown code keeps KuCoin's scrubbed words after a sentence that says Trade
does not recognize the reason and names the code once. The `KUCOIN_100001:`
prefix the app puts on the raw answer is stripped before it is shown, because
a code in the middle of the sentence is what made the refusal unreadable. The
app does not guess that an unknown code means the order is safe to repeat.

KuCoin never refuses a post-only order that would trade at once. It accepts
it and cancels it a moment later ("Post-only order conditions not met"). How
Trade keeps a waiting close clear of that is in `orders/part-close.md`, under
"On KuCoin the price is checked against the book".

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

## Closed-trade money

KuCoin reports profit or loss for a closed position, while one order can fill
in many pieces. Trade records each pushed execution and its fee immediately.
Only the complete history sweep assigns the position's result to one fill.
The saved zero receives the settled amount without another fill notice.
Repeated recovery and late pushed copies do not change the settled total.

Before this fix, each pushed closing piece could receive the whole position's
result. On 6 September 2026, USELESS stored a $2.74687686 loss eleven times.
KuCoin confirmed the trade lost $2.98367808 after fees and funding. The same
fault duplicated a $1.93248160 gain on an SKR close. Repair uses KuCoin's
closed-position record, keeps the result on the final fill, and preserves all
executions and fees. A repair alone does not fix a running older engine.

The two confirmed records were repaired against KuCoin's live history in the
same work session. USELESS now has one settled loss and SKR one settled gain.
Their net results are minus $2.98367808 and plus $1.85379004. The repair changed
only duplicated money and the wallet history version, so readers reload the
corrected totals. No exchange order or fee changed. The prevention code needs
deployment before the live engine uses it.

Focused verification covers single fills, fourteen-piece closes, repeated
recovery, and late zero-money notifications. All 52 tests in the KuCoin
orders, fill feed, and live-fill storage files passed. The local P&L page
showed USELESS at minus $2.98 and the affected SKR trade at plus $1.85 before
and after reload, with no browser exceptions or failed HTTP responses.
Lint and formatting passed. The app type check still reports unrelated test
fixture errors in market picker, workspace layout, use-trading, and smart grids.
