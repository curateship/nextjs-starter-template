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
screen. Quick orders and grids open at the point that was pressed. The DCA form
opens to the left of that point so it does not cover the rung handles on the
right edge of the chart. The frame keeps an eight-pixel gap from every screen
edge while it opens and while it is dragged. Escape and a press outside close
it. A DCA rung handle counts as part of the open window, so dragging one does
not close the form.

The quick order stays 288 pixels wide and keeps its full form on screen. DCA
and Grid stay 304 pixels wide. Their fields scroll when the window gets short,
and their Place button remains visible because the frame never shrinks below
260 pixels. On a narrow screen all three use the existing bottom sheet instead
of dragging.

Every grab bar uses the same wallet line: the wallet name, followed by its free
cash and the word "free". The title and fields still belong to the order type.
Changing the frame does not change the order sent to the server.

## The DCA window and chart shape

The Ladder card shows the dollars each rung will order. It leaves out the coin
price because the preview line already marks that price on the chart. A buy
rung's chart tag also shows its order dollars. An exit tag instead says **Exit
rung 3 for profit at +$…**, using that rung's buy price, coin size and exit
price to show the projected gross profit. The Position card puts Max position,
Size ramp and Borrowing on separate rows. The window no longer repeats the line
saying where the ladder hangs.

The Ladder card also has **Buy rung 1 at market now**. The choice starts off
every time because it spends money immediately and is not remembered with the
reusable ladder settings. When the choice is on, Place buys rung 1 at today's
price for the dollar amount shown on that row. The app
changes the coin amount to keep the dollars fixed. The deeper rungs stay at
their shown prices. If price has already passed one of those deeper prices,
that rung is skipped instead of being folded into the market buy. Two-green
confirmation still applies to the deeper rungs, not to the first buy requested
for now.

The first buy uses the same cash, market-minimum and exchange-refusal checks as
a rung reached later. If the buy cannot go through, the ladder stays saved and
rung 1 stays waiting rather than being recorded as filled. A practice-wallet
result says whether rung 1 bought or is still waiting.

On a real wallet, placement queues the first buy for the trading engine and the
result says it was queued. Before saving the ladder, the app checks that every
running engine copy understands this new instruction. An older engine makes
the placement fail before any ladder or exchange order exists. The web app and
engine must be deployed together before this choice can place real money.
An ordinary ladder does not store the new field, so it keeps working while the
engine versions are being changed.

When the ladder sells each buy at the previous rung, the market buy goes first.
The sell waits until the exchange shows the new position, then rests above the
current price if its original level has already passed. A sell that cannot rest
must never stop the requested buy from reaching the exchange.

The free-cash figure names what the wallet has available now, but it never
blocks Place. A watched ladder spends nothing until a rung's price arrives, so
the window does not compare the complete ladder cost with today's free cash.
The engine checks the full rung's margin at that later moment, including its
chosen borrowing, and leaves it waiting when the wallet cannot afford it.

Take profit and Stop loss have no settings chevron while their checkbox is off.
Turning either one on adds the chevron and opens its settings, matching the Grid
window.

The Take profit picker includes **Sell back up the ladder**. The clicked or
base anchor is Exit 1, exactly one ladder level above Rung 1. The largest and
deepest buy sells there. The remaining exits continue upward using the gaps
between the remaining buy rungs, and their sizes run in reverse. The chart
draws every exit at placement. The closest exit is labelled Exit rung 3 because
it sells Rung 3 first; the next is Exit rung 2, then Exit rung 1.
Waiting exits are faded and dashed; a funded reduce-only sell is solid. The
same choice appears when editing a running ladder's exits. Its **Extra gap %**
box starts at zero and moves the complete exit shape farther above the buys.
The steps between the exits still match the steps between the buys. The Exit
picker and its Target % or Extra gap % setting each use a full-width row, so
neither control is squeezed against the edge of the order window. Their labels
use the same field-label treatment as the rest of the order form.

While the window is open, dragging any rung moves the complete ladder without
changing its gaps. The deepest rung has a second handle that spreads every gap
or brings the rungs closer. Moving a ladder by hand changes it to a clicked-price
ladder, and Place sends the dropped anchor rather than the original right-click.
Pressing a drag handle without moving it leaves the anchor and rung gaps alone.
Every exit has its own handle while Sell back up the ladder is selected.
Dragging any one moves every exit together and updates Extra gap %. Waiting
and funded exits use the same drag. A funded live sell is cancelled and
replaced at its new price; if the exchange refuses that cancellation, the
chart returns to the saved prices. When several funded sells are moving and a
later cancellation fails, the app remembers which earlier cancellations
succeeded so the engine can restore only those sells at the saved gap.
An old ladder still carrying sells from the empty-anchor shape refuses an exit
drag or gap change until the engine can move those sells to the corrected
levels without leaving the position uncovered.

An untouched saved ladder keeps the same handles after the window closes. The
DCA ladder summary sits below its deepest visible rung. The anchor still sets
the rung prices, and Sell back up the ladder uses it as Exit 1. The summary is
not a priced level of its own. The summary follows the rungs on every drag
frame; it does not wait for the server save after the pointer is released.
Pressing the summary's × calls off an empty ladder at once, without another
question or a success toast. Once a rung has bought, the × moves into the
position's entry bar and asks before it calls off the remaining buys. The
success toast appears in that case because the bought position stays open. The
server accepts a move only while every rung is still waiting and no rung has
been called off. Once a rung buys, sells or is cancelled, its prices are frozen
because moving them would rewrite the prices behind a position already in
progress. A ladder owned by an automation cannot be moved by hand.
A ladder paired with a grid must still keep its first buy below the grid's
stop, and an invalid drag is refused without changing the saved plan.

The gear on a placed ladder opens a small draggable window beside the gear. It
has no screen-covering backdrop. Escape or a press outside closes it. While
every rung is waiting, the window can change the rung list, account share, size
ramp, borrowing, liquidity limit, two-green choice, anchor, take profit, stop
loss and confirmed-base stop. Save redraws and resizes the complete ladder.
The dollar preview uses the account value of the wallet that owns the ladder,
even when another wallet is selected for new orders.
The server checks again that every rung is untouched while it holds the wallet
row, so an old browser cannot rewrite a ladder that bought during the save.

Once one rung buys or gets called off, the same gear window keeps only take
profit and stop loss. The window says that the rung shape and position size are
frozen. Percentage boxes draw the percent sign beside the number, and they also
accept a typed value such as `5%`. A bad stop names Stop loss in the refusal.

Changing borrowing before the first buy changes only the saved watched plan.
Placing a ladder sends no order to a live exchange. The venue receives the
chosen borrowing when the first rung reaches its price, so no exchange has a
placement-time borrowing setting to change or undo.

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

- **Range** starts with **Where the range sits**, a two-item dropdown: around
  today's price, or hanging under the price you clicked. Under it is one box,
  **Gap between rungs %**, and a line saying how far the range reaches from
  that gap and the rung count: "Reaches below your click 9.5%", or "Reaches
  either side of the price 4%". There is no depth box and no Above % and
  Below %; `grid-rung-gap.md` has the arithmetic. Where levels sit above the
  price, the card says so and says plainly that placing still buys nothing.
  The window leaves out the repeated current price, range prices, clicked top
  buy and step size. Those prices are already on the chart. **Levels** and
  **Share of account %** sit in this card under the gap. The card shows the dollars of coin each buy controls,
  the margin behind that buy, and the dollars of coin the whole grid controls.
  The complete grid may control more than the wallet has free now because none
  of those buys is placed yet. Today's free cash never blocks Place; each level
  has to fit only when its own price arrives.
  Every control works the moment the window opens, on the settings last used —
  the saved grid setup arrives with the page itself, in the same bootstrap
  call that carries the quick-order window's setup, so even the first
  right-click after a reload opens on it rather than on defaults that snap a
  second later. A late-arriving answer never replaces a choice just made in
  the window or moves its preview. The DCA window follows the same rule, and
  the full rule lives in `../rules/instant-first.md`.
- **Rungs** sits under Range and is switched off by default. On, it lists one
  row per rung, each holding that rung's percentage of the money Share of
  account % set aside, with the row's price and dollars beside it. The rows run
  down the range, top first, and each row's share lands at the price beside it,
  so the card and the chart always agree. The NUMBER on each row is what
  reverses: rung 1 is the first trade the grid makes, the top of the range on a
  buying grid and the bottom on a selling one. Switching Long to Short turns the
  values over in the boxes, which mirrors the grid on the chart. A line under
  the rows says what they add up to, in the refusal colour until it is 100. **Add rung** stops at 20 and the bin stops at 2. **Even split** fills the rows with an equal share that adds to exactly 100.
  Switching the card on for the first time starts from the split the grid was
  already using, so nothing about the grid moves. While it is on, the Levels
  box in Range is hidden, because the rows are what count the levels and the
  card's own header says how many; Share of account % stays, because it still
  sets the money. The Range card's readouts then say the smallest and biggest buy instead
  of one figure for each, since the levels are deliberately different sizes.
- **Advanced settings** holds End Grid, Borrowing, Follow price up, Follow
  price down, Levels spread and the liquidity guard. End Grid is a tick box,
  on by default, with a "Grid ends at" line while it is on. Borrowing starts at 1× and accepts
  whole numbers up to the coin's exchange limit. A grid paired with a DCA
  ladder shows the ladder's borrowing and does not let the grid choose a second
  number. A position already held by hand fixes the field in the same way. The
  card has no following summary on its folded header.
  Each follow setting keeps its explanation in the tooltip beside its tick box.
  The window does not repeat that explanation underneath the switch. The Levels
  spread tooltip compares its two choices with prices. Dollar spacing can put
  levels at $100, $90 and $80. Spacing them 10% apart puts them at $100, $90
  and $81, which keeps the same percentage move on every cycle.
- **End Grid** sits one gap above today's price or the top of the range,
  whichever is higher, so the line always starts above both. It has no percent
  of its own; the gap between rungs is its distance (Tyler, 3 Sep 2026).
  Follow price up leaves End Grid switched on. The range walks upward under the
  fixed line until price reaches it. On the chart the line reads **END GRID**,
  in orange.
- **Stop loss** is always on. Its card has no checkbox because a grid cannot be
  placed or left running without a stop, and no percent box because the stop
  sits one gap below the range. The card shows where that lands, the Reverse
  on stop loss switch and the optional confirmed-base rule.
- **Refusals** are said on the window before the button is pressed, in the
  server's own words. If a level is too small for the market, the window names
  it and asks for fewer levels or a bigger account share.

The gear on the grid's badge, at the middle of the range, opens the running
grid settings to the left of the gear, vertically centred on it. The settings use the same draggable chart
window, folding option cards and fixed bottom button as the right-click Grid
order form. Slices includes Borrowing beside Levels and Share of account.
The Slices card is first, with no description above it. Levels, Share of
account and Borrowing are editable while the grid holds no coin and still has
buys waiting. They lock while the grid holds coin because each one redraws or
resizes every level. Their tooltips explain that the chart's range lines can
still compress or expand around one open entry. Borrowing also locks when a DCA
ladder shares the position. A **Rungs** card sits after Slices with the same
rows as the placement window, filled from what the running levels actually
hold. Its rows and its switch lock whenever the grid holds coin for the same
reason. The **End Grid**
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

The list is a sortable table with four columns: Ticker, Type, PnL, and Banked.
Type is Long or Short and uses the same green and red badge as Active Trades.
Pressing Type sorts long and short smart orders. The strategy, such as a DCA
ladder or grid, remains in the details tooltip. There is no Exchange column.
The favicon stays beside the ticker. Ticker takes the spare width, using 35% of
the table. Type and PnL each use 20%, and Banked uses 25%. PnL and Banked align
to the right edge of their columns. Banked puts its sort mark before the label
so the word and figures end together. Cell content keeps a 16px gutter from
both panel edges while row backgrounds remain full width. The ticker is the
coin name from the market list, not the exchange's contract ID. Aster drops
USDT, KuCoin drops USDTM, and Hyperliquid drops the xyz: prefix. The full ID
still opens the right chart.
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
ladder or grid keeps its reason in the tooltip and puts Resume beneath its
ticker, so removing the old three-dot button does not remove the recovery
action. A paused watched price is not here; its Resume is on its Open orders
row (`watched-orders.md`).

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
