# Orders on the chart

An order is placed by right-clicking the candles at the price you want, and
from then on it lives on the chart as its own line with a coloured bar at the
right-hand end.

Under Recent the menu has two fold-out rows, Manual order and Smart order,
drawn the way the Folders panel draws a folder: a chevron on the right that
turns when the row is open, the open row in gray, and its choices under it.
Manual order holds Long and Short. Smart order holds DCA ladder and Grid. Both
start closed. Clicking a row opens it, clicking it again closes it, and
opening one closes the other. Nothing is saved: the Recent list is what
remembers. The choices stay indented under their parent, but their hover and
keyboard-focus backgrounds reach both menu edges. A wallet that cannot place
smart orders gets no fold-out rows, just Long and Short.

Once an order has been placed, the right-click menu starts with **Recent**.
The latest kind is first, followed by the other unique kinds this account has
placed. Long, Short, DCA ladder and Grid can all appear there. Picking one uses
the price that was just clicked and opens the same window as its row lower in
the menu. The Long and Short window has a Market checkbox. Checking it fills
the chosen side now, but does not add a separate Market kind to Recent. Closing
a window without placing does not change the list.
The browser saves the list under the signed-in account, so a reload keeps the
same order without sharing it with another account on the same machine. A new
browser or a first visit has no Recent section.

With a position open, the same menu offers Take profit when the clicked price
is on the winning side of the entry and Stop loss when it is on the losing
side. Stop loss draws at the clicked price as soon as it is picked, while the
wallet saves and refreshes in the background. Take profit opens a small window
at the clicked level, matching the limit-order window. It chooses how much of
the still-unassigned position comes off and shows the profit at that price, so
100% always means everything left after earlier targets. The full Stop and
target window can hold up to three rows, with a running figure showing how much
of the position they cover. The chart draws one labelled line for every target
while the wallet saves in the background. The Take profit shortcut stays in
the menu until the position has three targets. A stop already set keeps the
Stop loss shortcut out because its chart line is the place to change it.

A live take-profit or stop-loss order appears once, as its coloured target or
stop bar. Each target label states the dollars sold and the profit at its
price. This includes a grid's own SL line, its stop. The chart does not draw the
exchange's copy of that order as a second gray Sell bar.

A position's Stop Loss and Liquidation labels state how many dollars the whole
position would make or lose at that price after the fees charged so far. The
Stop Loss figure changes while the line is dragged. A real position uses the
exchange's liquidation price, while a practice position uses Trade's estimate.
The fee on the future close is not included because the venue does not state it
until the order fills. A live position shows a dash when the fills on hand do
not cover its whole fee history.

A grid's SL label gives the same answer for the levels that
grid currently holds, including levels carried from an older range. It takes
off the opening fees still attached to those levels. A flat grid shows $0.00
because ending it at the stop would close no coin. Profit and fees already
banked by completed rounds are not part of the figure. A grid shows a dash when
the fills on hand do not add up to the amount its plan says it holds.

## The money beside each grid line

Every line of a grid carries a grey figure in dollars beside its price. It is
money, never a price. On a coin trading at $0.31 the figures still read $28.29
or $105, because they say what the level is worth, not where it sits.

One rule decides the figure, and it is the same rule on every line: **a level
that has bought shows what it is holding at its own price, and a level still
waiting shows the stake it will put in when it fills.** A rung carried from an
older range is holding by definition, so it shows what it holds, exactly like a
holding rung inside the range.

Before 3 September 2026 the rungs inside the range broke that rule. They showed
the size the level was planned with rather than the size it holds, so a KuCoin
BR rung holding 149 coins printed $13.94, the value of the 44 it was planned
with, while the carried rung beside it printed the $105 it really held. Two
meanings in one column is unreadable, and the wrong one understated real money.
`levelUsd` in `src/components/trade/grid-layer.tsx` is now the only place the
figure is worked out, and `grid-layer.test.tsx` fails if any line goes back to
the planned size while it is holding.

The Entry line, border and name are chart blue. Its current dollar profit is
green and its loss is red; exactly zero stays blue. The figure updates with the
market price and stays out until a price has arrived, rather than showing a
made-up zero. The bar does not borrow the account accent, so changing the theme
cannot turn the entry into the colour of some other kind of line.

A position's stop can be dragged past its entry after price moves in the
trade's favour. This trailing stop protects profit. It must remain below the
current price for a long, or above the current price for a short, so setting it
does not close the position immediately.

- **A waiting order shows its stop and its target too**, in the same green and
  red as a position's but in a finer dash — they are where the trade will get
  out once the order fills, which is a plan rather than a fact. The bar says
  what each would pay in dollars if it got there. Either line can be dragged,
  and the order's own window can change both together.
- **Pressing a waiting order's bar opens that window** — how much the order is
  for, the leverage it will use, and where it gets out. Not its price: the
  price is the line, and you drag it. The bar carries the same 12px settings
  cog as the Grid bar and other editable orders, tucked directly after the
  order label with the Grid bar's small gap. Its compact settings window opens
  beside that cog and leaves the chart visible; it is not a page modal. Its
  header only says Order settings, without repeating a long wallet name. The
  window's leverage slider changes both the saved order and the amount of your
  own cash shown under its size.
- **Placing an order does not wait for the exchange.** The window shuts on the
  press and the order is drawn on the chart at once, labelled "sending". A
  "sending" line has no × and cannot be dragged; there is nothing on the
  server yet to change. For a real order that rests, the label clears the
  moment the exchange's answer names the order — the line then carries the
  real id and can be dragged or cancelled straight away, without waiting for
  the next full read. An order that filled on arrival becomes the position in
  the same moment: the answer says the fill price and size, so the Entry line
  and the position row are painted from it at once, and the next read swaps
  in the exchange's own figures. A reduce-only fill paints nothing new — it
  shrank a position rather than opening one.
- **Nothing is announced when it works.** No toast for placing an order and
  none for cancelling one: the line appearing and the line disappearing is the
  answer, and a toast on every click of a trading screen is noise. Refusals
  still speak up, and so does the one case that must never pass quietly — a
  real order that went on without the protection asked for.

### Buying more of what a position holds

Every position row carries a **+** button beside its cog, labelled "Add to the
BTC position". One press does what used to take five: it charts that coin,
switches the traded wallet to that row's wallet, and opens the same order window
a right-click opens, over today's price, on that position's side. The size box
is the only thing left to fill in, and it starts empty and focused.

- **The chart and the wallet both move before the window opens.** Two wallets
  can hold the same coin, and a window that opened before the switch landed
  would put the order on the wallet you were looking at rather than the one you
  pressed — which is the mistake this button exists to remove. The window also
  names the wallet inside itself, so a wrong one is readable before the press.
- **Adding never changes leverage.** The window shows the position's own
  leverage as a line and offers no slider. `placeLiveOrder` sends null for
  leverage and margin mode whenever a position already exists, and the exchange
  keeps what it has, so a slider here would be a promise the order cannot keep.
- **The window says what it is adding to, and what the position becomes**:
  "Adding to $500 long in Main wallet, at 3× leverage. After this order: $750 at
  an average of $98." Both figures are what was paid, never what it is worth
  today, so $500 plus $250 reads as $750 and the average is a number anybody can
  check. It re-reads itself as the size is typed.
- **A position that closes under the window takes the window with it.** The
  window is looking at what that position IS, resolved live, not at a copy of
  what it was when the button was pressed.
- **It refuses out loud rather than doing nothing.** A wallet that is switched
  off, a live wallet with no trading key, and a market the exchange has stopped
  listing each say so and nothing moves.
- **Nothing about the order path changes.** It is placed exactly as the
  right-click window places one: a watched trigger by default, resting only if
  Settings say so, chasing as a maker when price reaches it. There is
  deliberately no "double it" press that skips the window — the window is where
  the size is chosen and where the real-money check happens.

### Selling part of a position

The bin on a position row opens a window asking how much comes off, in dollars
or in coins, with 25%, 50% and All of it as presses that fill the box. It starts
on all of it, so the old one-press behaviour needs nothing filled in.

- **All of it and part of it are sold differently, and the window says which.**
  All of it is a market order. A part is a reduce-only limit that follows the
  price and never pays the spread, which is what the trading rules ask of a
  close.
- **It says what happens to the rest**, in dollars, including where its stop
  is. A refused amount says why above the button, with the box outlined.
- **An amount leaving less than the exchange's smallest order sells all of it.**
  A scrap under the floor could never be closed again. See `../orders/part-close.md`.

### Leverage and the cash behind a position

Every position row also carries a gauge button, labelled "Change the BTC
leverage and margin". It opens a window with two boxes, each with its own
button: the leverage the position runs on, and how much of your own cash is
behind it.

- **The button is hidden where the exchange allows neither**, and the window
  says the exchange's own reason for the half it cannot do. Hyperliquid allows
  both today; Aster allows leverage but will not lower it while a position is
  open; Phemex and KuCoin allow neither yet.
- **The liquidation figure on the window is this app's estimate and says so.**
  What the row shows afterwards is the exchange's own figure, read back —
  nothing about the change is written down here.
- **Taking margin out is refused when it would bring liquidation inside the
  stop**, with both prices in the sentence. Already being inside is not the
  same as being brought inside, and only the second is refused.
- **A practice wallet is refused rather than faked.** The practice engine has no
  lender to renegotiate with, and the window says that instead of drawing boxes
  that would pretend otherwise. See `../wallets/position-margin.md`.

## Which chart line wins an overlap

The position's pill does. Entry, LIQUIDATION and the targets stay on the far
right of the plot and never slide inwards to make room for a grid (Tyler,
3 Sep 2026). A grid rung at the entry price has its money chip under the Entry
pill; the pill is painted last and is what you see. The grid used to hand the
trade-lines layer a map of its chips so the pills could slide left of them,
and an Entry pill inside a grid ended up well inside the plot. That hand-off is
gone. Two pills from the trade-lines layer itself still move apart from each
other as before.
