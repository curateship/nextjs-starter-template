# Changing leverage and margin on an open position

Every position row has a gauge button beside its cog. It opens a window with
two boxes: what leverage the position runs on, and how much of your own cash is
behind it.

## Both boxes are one figure seen from two sides

A $1,000 position with $200 behind it is running at 5×. Putting $200 more
behind it makes it 2.5×. Asking for 2.5× puts $200 more behind it. So the
window shows both, and each box says in dollars what the change comes to before
anything is pressed.

Each box has its own button. There is no Save: the two changes are separate
commands to the exchange and a single Save would suggest they travelled
together.

## The liquidation figure on the window is an estimate, and says so

The exchange will not say where liquidation *would* move to until the money has
actually moved. So the window works it out with this app's own formula and
writes "about" in front of it, followed by "This app's estimate. The row shows
the exchange's own figure once it answers."

After the change, nothing here is written down. The row's leverage, margin and
liquidation price all come from the exchange's next portfolio read, so what
ends up on screen is the venue's answer rather than what was asked for. A venue
that quietly clamps a request shows its own number.

**The estimate sits at or inside the venue's own.** It is deliberately the
conservative direction, so a change this app allows is one the venue allows
too. Measured on a real Hyperliquid position at 1×: the app estimates
liquidation at about 5% of the entry price where Hyperliquid says a fraction of
a cent.

## Taking margin out is refused when it would bring liquidation inside the stop

A stop at $90 with liquidation moved to $92 means the exchange takes the trade
before the stop can fire. The stop stops being the worst case somebody agreed
to, and a bigger one takes its place quietly. So that change is refused, and
the refusal names both prices.

**"Would bring it inside" and "is already inside" are different, and only the
first is refused.** A position whose stop already sits past its liquidation
price is in that state whatever anybody does next; blocking a withdrawal there
would trap the cash and fix nothing.

Both sides of that comparison use this app's estimate. Measuring "after" with
our formula and "now" with the exchange's would compare two different
arithmetics, and the gap between them would read as a change the withdrawal had
caused.

## Two more refusals

- **Taking out everything behind the position** leaves it nothing to stand on
  and is refused with what it holds now.
- **Adding cash to a position already worth less than its margin** buys no more
  room, because leverage cannot go under 1× on any of these venues. The window
  says so and suggests taking some back instead.

## What each exchange allows

The button is hidden where a venue allows neither change, and the window says
the venue's own reason for the half it cannot do. That table lives beside each
exchange's module in `src/server/protocols/registry.ts`, never in a screen —
a screen comparing exchange names is what the protocol fence forbids.

| Exchange | Change leverage | Add or take back margin |
| --- | --- | --- |
| Hyperliquid | Yes | Yes |
| Aster | Yes, but it will not LOWER isolated leverage while a position is open | Not built |
| Phemex | Not built | Not built |
| KuCoin | Not built | Not built |

**Aster's refusal is the venue's, not this app's.** It answers with its own
code, which `refusals.ts` already turns into "Aster will not lower isolated
leverage while this position is open. Close the position or keep its current
leverage." Raising it is allowed.

**Phemex and KuCoin still need reading.** Phemex sets leverage as part of an
order and a hedged account keeps a separate figure for each side; KuCoin keeps
leverage per market for cross margin only, and an isolated position carries
whatever its own order asked for. Neither has been read back from the venue on
an open position, so neither is offered. When one is, its row here changes and
the button appears on its own.

## Hyperliquid asks for isolated every time

Every position this app opens on Hyperliquid is opened isolated, because a
trade's stake being all it can lose is the promise the screens make. A
hand-changed leverage asks for isolated too, so it stays on the same footing as
the one placement sets. On a position opened isolated — which is every one of
ours — the mode does not change. On one opened cross somewhere else,
Hyperliquid switches it to isolated, and the row's next read shows that.
Nothing here leaves a position on a mode the app cannot describe.

## Practice wallets are refused rather than faked

The practice engine has no lender to renegotiate with. A practice position's
leverage decided how big the order was at the moment it was placed, and there
is nothing behind it to move afterwards. The window says that instead of
offering boxes that would pretend otherwise.

## Every ask is journalled

The leverage or margin asked for lands in the Journal before the answer
travels, and so does every refusal, in the venue's own words. That is the same
rule every other real-money action here follows.
