# Smart order windows

## Smart orders on live wallets

The Smart order is the same ladder on practice, testnet, and real wallets. The
same state machine owns its base or clicked anchor, rung sizes, two-green entry,
targets, stops, step-down, reclaim, cancellation, and restart recovery. A live
ladder stores Hyperliquid's order IDs and reconciles exchange fills before it
takes another action. If only part of a new ladder is accepted, those orders
are cancelled and no ladder is saved.

The ladder's Position card includes Borrowing. It starts at 1×, takes whole
numbers and remembers the last number placed. The chosen number sizes the
ladder on practice and real wallets as well as in a backtest. A market with a
lower maximum uses its own number. The Ladder card and its rung rows show the
amount of coin bought after borrowing, while the explanation says how much
account money backs it. On an automation, every rung shows that buy in dollars,
including when the flow names a saved wallet. Compound sizing reads the wallet's
current value. Fixed sizing reads the wallet's starting amount. If the wallet
cannot be read, the panel says the amounts are unavailable instead of replacing
the dollars with percentages.

**Neither window asks twice.** The ladder and the grid both place on the first
press, on every wallet including real money. There used to be a second,
confirming press on live wallets; Tyler had it removed. Two switches still
stand between a real-money order and the exchange. The server must allow
mainnet, and Real-money trading must be on in Settings.

Once an order or position window sends a change, every box, tick and choice in
that window locks while the answer is on its way. Cancel and Done lock too. The
save button shows its spinner for exactly the same time. A refusal unlocks the
window with every typed value still there, so the answer can be corrected and
sent again without guessing which version reached the exchange.

## The floating order frame

The quick order, DCA ladder and Grid forms use one floating frame on a wide
screen. Each form still opens at the price that was pressed. The frame keeps an
eight-pixel gap from every screen edge while it opens and while it is dragged.
Escape and a press outside close it.

The quick order stays 288 pixels wide and keeps its full form on screen. DCA
and Grid stay 304 pixels wide. Their fields scroll when the window gets short,
and their Place button remains visible because the frame never shrinks below
260 pixels. On a narrow screen all three use the existing bottom sheet instead
of dragging.

Every grab bar uses the same wallet line: the wallet name, followed by its free
cash and the word "free". The title and fields still belong to the order type.
Changing the frame does not change the order sent to the server.

## A stop that rests under the base

A DCA ladder can put its stop on the confirmed base instead of a fixed distance
below the entry. It is on the Stop loss part of both the window that places a
ladder and the one that edits a live ladder's exits, in its own grey card, and
it is a port of the QFL automation from the old app rather than anything new.

- **Bases are read off the 4h**, whatever chart the ladder was placed from. Not
  a setting: the rule was measured on the 4h, and a base found on the 5m is a
  different thing wearing the same name.
- **The base's own two numbers are frozen when the ladder is placed**, so
  nudging the indicator on the chart changes the chart and leaves every live
  stop exactly where it is.
- **There is always a stop.** Until a base has confirmed below what the ladder
  is holding, the plain percent stands. Setting that percent to 100 means price
  would have to reach zero, which is how you say "nothing until the base
  arrives" — and it writes no stop at all rather than one resting at zero.
- **A level above what is held is refused.** That is a place to take profit, not
  a place to give up, and a stop there would close winners as losses.
- **Being stopped is one rung failing, not the ladder failing.** Everything
  sells, every waiting rung comes off the book, and the next rung down is placed
  on its own with a fresh stop under whatever base is there by then. From the
  first stop onwards only one rung rests at a time.
- **The last rung stopping out ends it for good** — nothing is armed and nothing
  is remembered. A ladder whose bets double needs that full stop, or a long
  enough losing run outgrows the pot.
- **Buy back after a reclaim** puts the same rung back for the same money if
  price closes back above where the stop cut and keeps closing above it for the
  chosen number of days. A close back under starts the wait again; a wick under
  does not. It is capped in dollars rather than coins, so a level reclaimed
  months later costs what the rung was always allowed to spend.

## The grid window

Right-click the chart, pick Smart order, then Grid. The window floats where you
clicked and its cards read in the order the decisions are made. What the grid
does with each of these is in `grid-orders.md`; this is what is on screen.

- **Range** starts with **Where the range sits**, a two-item dropdown. "Around
  today's price" keeps the two boxes it has always had, Above % and Below %.
  "Below the price you clicked" swaps them for one, **How far below %**, because
  the top is worked out rather than typed. Where levels sit above the price,
  the card says so and says plainly that placing still buys nothing. The window
  leaves out the repeated current price, range prices, clicked top buy and step
  size. Those prices are already on the chart. **Share of account %** sits in
  this card beside Levels. The card shows the dollars of coin each buy controls,
  the margin behind that buy, and the dollars of coin the whole grid controls.
  Every control works the moment the window opens, on the settings last used —
  the saved grid setup arrives with the page itself, in the same bootstrap
  call that carries the quick-order window's setup, so even the first
  right-click after a reload opens on it rather than on defaults that snap a
  second later. A late-arriving answer never replaces a choice just made in
  the window or moves its preview. The DCA window follows the same rule, and
  the full rule lives in `../rules/instant-first.md`.
- **Advanced settings** holds Borrowing, Follow price up, Follow price down,
  Levels spread and the liquidity guard. Borrowing starts at 1× and accepts
  whole numbers up to the coin's exchange limit. A grid paired with a DCA
  ladder shows the ladder's borrowing and does not let the grid choose a second
  number. A position already held by hand fixes the field in the same way. The
  card has no following summary on its folded header.
  Each follow setting keeps its explanation in the tooltip beside its tick box.
  The window does not repeat that explanation underneath the switch. The Levels
  spread tooltip compares its two choices with prices. Dollar spacing can put
  levels at $100, $90 and $80. Spacing them 10% apart puts them at $100, $90
  and $81, which keeps the same percentage move on every cycle.
- **End Grid** was called Finish the grid and keeps the same upper line. Its
  distance is measured above today's price or the top of the range, whichever
  is higher, so the line always starts above both. Its readout says **Grid ends
  at**. Follow price up leaves End Grid visible and switched on. The range walks
  upward under the fixed line until price reaches it. On the chart the line
  reads **END GRID**. When End Grid is unchecked, the checkbox is the card's
  only button. There is no help button or settings chevron to open. Checking it
  opens the settings and adds both controls.
- **Stop loss** is always on. Its card has no checkbox because a grid cannot be
  placed or left running without a stop. The card sets the distance below the
  range and the optional confirmed-base rule.
- **Refusals** are said on the window before the button is pressed, in the
  server's own words. If a level is too small for the market, the window names
  it and asks for fewer levels or a bigger account share.

The gear beside UPPER PRICE opens the running grid settings to the left of the
gear, vertically centred on it. The settings use the same draggable chart
window, folding option cards and fixed bottom button as the right-click Grid
order form. Slices includes Borrowing beside Levels and Share of account.
The Slices card is first, with no description above it. Borrowing is editable
while the grid holds no coin and still has buys waiting. Borrowing locks while
the grid holds coin or shares the position with a DCA ladder. The **End Grid**
card can switch the line on or off and change its percentage. The **Following**
card says that the fixed End Grid line stays in place and shows how many times
the range has moved so far.

## A placed grid is on the chart at once

Placing one draws it in the same frame the window closes. The server hands the
finished grid back with its answer, and the chart uses that until the next read
carries it.

Without that there is a gap nobody can explain: the window clears its own
preview lines as it goes, and the read that would replace them waits on an
exchange round trip, so the grid blinks off the chart and returns a second
later. It is the same trick the ghost order uses while a plain order is being
placed, and for the same reason.

## What the Smart orders panel counts as a sale

Opening a smart order in the right-hand panel lists what it has sold and what
that banked. Each sale says how long ago it happened, its clock time, and the
gross dollars sold. The exact date and time stays in the hover text. The market
price no longer takes the sold amount's place.

The list is a sortable table with three columns: Ticker, PnL, and Banked. There
is no Exchange or Type column; the order type remains in the details tooltip.
The favicon stays beside the ticker. Ticker takes the spare width, while PnL
and Banked align to the right edge of their columns. Banked puts its sort mark
before the label so the word and figures end together. Cell content keeps a
16px gutter from both panel edges while row backgrounds remain full width.
PnL is the profit or loss on what the smart order still holds. Banked is the
money from sales that have finished. Banked has no icon, and $0.00 stays visible
before the first sale.

Pointing at the ticker icon or the ticker name opens the smart order's
details — the hover target is the whole icon-and-name pair. Keyboard focus
opens the same tooltip. The card is 224px wide on the phone sheet and 256px on
larger screens. It stays centered beside the icon and keeps an 8px boundary
from the viewport, so it does not take over the chart or clip. The details card
uses the light popover surface and dark text, with no pointer arrow. The ticker
name remains the control that opens its market on the chart. The tooltip names
the wallet and shows progress, money still held, open profit, and the sale
history. A grid says how many levels are
waiting and completed and how many dollars it still holds to sell. A paused
smart order keeps its reason in the tooltip and puts Resume beneath its ticker,
so removing the old three-dot button and Type column does not remove the
recovery action.

Pressing a row opens its market on the chart and keeps the whole row light gray
while that market is selected. Pressing a heading sorts that column. PnL is the
opening sort, with the largest profit first. Ticker starts A to Z when pressed.
Banked starts with the largest figure. Figures the exchange has not
stated stay at the end in either direction.
A long Smart orders list scrolls inside the panel beneath its tabs. The panel
keeps its own height instead of growing the list past the bottom edge.
Two rules decide what appears in the opened sale list.

- **A sell out of a long-only order is a sale**, whether or not the venue put a
  figure on it. Grids and ladders are long only, so a sell on their coin is a
  sale. A short bought back counts too, through the profit the venue states on
  it.
- **Money the venue never stated is shown as a dash, never as zero.** Zero is a
  real answer meaning the sale broke even. KuCoin reports money per position
  closed rather than per fill, and a grid selling part of what it holds never
  closes a position, so its sales arrive unpriced. The panel lists them, leaves
  the figure blank, and says underneath how many the total is short of.

