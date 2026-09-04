# Grid orders

A grid is a range of prices and a count. It puts an order at every level in that
range, and each level has its own way out one step away. When that way out fills
the level goes back to watching its own price. A nearby level cannot take the
same small wobble as the trade that just happened. Price must first move 1% past
it and return. The recycling is what the DCA ladder cannot do: a ladder buys one
fall and is then finished, while a grid can earn on repeated crossings.

Nothing rests on the exchange. A level is a price the grid is watching, and when
price reaches it the grid trades there and then. That is the app-wide rule and
`smart-orders.md` covers why.

## Grids placed by a flow

The automation canvas has a Grid step. The step watches closed 4-hour candles
and places an ordinary grid when every wick stays on one side of its saved EMA
for the chosen number of hours. The choice moves in 4-hour steps because only a
closed 4-hour candle can add to the wait. Above the EMA means a buying grid.
Below means a selling grid. A touch or a mix means wait.

The step starts at 72 clean hours and EMA 200. It needs 600 closed candles,
which is 100 days of history, before it can decide. The step also saves the
rungs, range, wallet share, borrowing, spacing, both price-following switches,
and an emergency stop distance. A flow grid has no End Grid line. Rungs can
split the money evenly or give each trade its own share. The EMA chooses
direction. A buying range reaches down from the current price, and a selling
range reaches up from it.

Rung 1 is always the first trade nearest the current price. When the EMA flips
the direction, custom shares turn over on the chart so the same rung keeps the
same money. Following price uses the rules later in this document without a
second automation-only version of the grid engine.

Once placed, the existing grid engine does all the trading. A mixed reading
does not end a running grid. A clean reading on the other side closes the old
grid first, including any coin it holds, after the full Clean hours wait. The
next engine pass places a fresh grid from the current price. Splitting the close
and placement means a server restart cannot leave two flow grids working on the
same coin. The EMA keeps changing the grid between buying and selling until
Stop is pressed on the flow.

The run page draws the saved EMA and lists the saved Grid settings. The main
trading chart shows the grid like any grid placed by hand. Stop calls off the
flow grid's waiting levels. If the grid holds coin, Stop leaves the position and
its emergency stop alone. If one grid reaches its emergency stop while the flow
is still on, the flow waits for a new closed candle and starts again in the
direction chosen by the EMA.

With pretend money selected on the Wallet step, the canvas also shows the
Backtest panel. Its replay uses the same range draft and grid engine as a paper
or live flow, including custom rung shares and both following switches. The
result chart draws the saved EMA, and selling-grid cycles appear as Short rows
whose exit is the buy-back.

## Buy the dips, or short the rallies

Two boxes, **Long** and **Short**, sit side by side at the top of the Range
card. They are the first thing the window asks, because every label under them
changes with the answer. Exactly one is ever ticked: clicking the one already
on does nothing, so a grid can never be left with no direction at all.

**Long** is the buying grid, which is what every grid was, and it is the one
the window opens on. It buys at each level and sells one step above it, and
earns while a coin chops sideways or drifts up.

**Short** shorts at each level and buys back one step below it. It earns while
a coin chops sideways or drifts down. Shorting a coin you do not own means
borrowing it from the exchange, selling it, and buying it back later. You keep
the difference if it got cheaper.

**A short grid's entries are called shorts, never sells** — "Place 5 shorts"
on the button, "RUNG 5 SHORTS" on the chart — Tyler's rule, so the word on the
screen is the word in his head. The buy-backs that close each rung keep the
words "buys back", because that is what they do. Picking Short also turns the
window's own Grid label and its Place button red, so the window agrees with
the chart about which way the money points.

Elsewhere the two are called **Buy the dips** and **Short the rallies** — on
the chart's badge and in the running grid's window, which are explaining
rather than asking, and have room for the phrase.

A coin that has run up and is now chopping under a ceiling is the case for
selling the rallies. A buying grid there keeps buying dips in something that is
slowly bleeding; a selling grid earns on the same chop with the drift going its
way.

**Everything else is the same grid with every price comparison turned upside
down.** The range, the levels, the recycling, the 1% clearance, the two follow
switches, the stop, End Grid, the background program that trades when nobody is
watching. One engine runs both.

**The direction cannot be changed once the grid is placed.** The prices are
frozen and they belong to one side. The running-grid window says which way the
grid runs and does not offer to turn it round.

**The one thing that is genuinely more dangerous.** A coin you bought at $100
can only fall to zero, so the most it costs you is $100. A coin you sold at
$100 has no ceiling: at $300 you owe $200 for every $100 you sold, and with
borrowing the exchange closes you out long before that. So a selling grid whose
stop sits at or past the exchange's close-out price is refused before anything
is placed or its range is moved, with a sentence saying what to change.
`../rules/trading-rules.md` holds that rule.

A worked example on a $10,000 account, coin at $100:

```
Range $80 to $120, 12 levels, step $3.33.
Pot 20% = $2,000, so $166 a level.
Stop $126 (5% above the top). End Grid $76.

  $126.00  STOP      buy the lot back, grid over
  $120.00  SELL $166  live   -> buys back at $116.67
  $116.67  SELL $166  live   -> buys back at $113.33
   ...
  $103.33  SELL $166  live   -> buys back at $100.00
   ---- price is here ----
   $96.67  SELL $166  waiting for price to go under it and come back
   ...
   $83.33  SELL $166  waiting for price to go under it and come back
   $80.00  bottom of the range
   $76.00  END GRID  you have made enough, close it
```

The levels above the price are live because price is already below them, and
they sell when price climbs to them. The levels below the price are dormant
until price drops under them and comes back up. That is the same rule the
buying grid keeps, read in a mirror.

**A selling grid needs the engine to know about selling grids.** The app and
the background engine that manages every order are two programs sharing one
database. An engine running older code does not know which way a grid runs, and
a field it does not know is dropped when it saves the plan back — so the
selling grid is read as a buying one, its End Grid ends up below the price, and
it closes seconds after being placed. If it were holding a short, its stop
would be written on the wrong side of it.

So the engine and the app are deployed together, or the engine first, never the
app alone. That happened on 28 Aug 2026, and selling grids have worked since. A
rollback has the same problem in reverse. Buying grids are
unaffected either way, because every stored plan stays in the shape every
version reads. `../rules/trading-rules.md` carries the rule this comes from.

**Funding is not modelled.** On a real exchange a short usually collects a
small payment every few hours from the people who are long. Nothing in the
practice engine models that, so a practice selling grid reads slightly worse
than the real one would.

## The placement window stays open while the grid is shaped on the chart

The window is not a dialog that owns the screen. It sits over a live chart,
nothing outside it closes it, and it goes away only from the × in its own top
right corner or the Escape key. That is what lets the grid be shaped by hand
before any money moves:

- **The preview's edges can be dragged, and only the dragged edge moves.**
  UPPER PRICE, LOWER PRICE, End Grid and the stop each carry a grip while
  the window is open. The two range names sit on rung 1 and the deepest rung
  (see "Where the names sit" below), so dropping UPPER PRICE on a buying grid
  lands rung 1 under the hand and the range's top is worked out one step past
  it. Around today's price, a drop rewrites that edge's own
  percent field. On a click-hung range the two edges share one depth field —
  writing it moves both — so a drop there becomes a hand-set range in plain
  prices instead: the dragged edge lands under the hand, the other stays
  put, the Range card says "The range is where you dragged it", and typing
  a percent takes the range back. Prices are what placing sends anyway, so
  what is drawn is exactly what is placed. Tyler's rule, decided 1 Sep 2026
  after the first version kept the clicked price pinned to its own rung and
  dragging one edge visibly moved the whole grid. A drop that would turn
  the range inside out changes nothing.
- **The DRAG GRID bar in the middle moves the whole grid.** It is dressed like
  the name bars, the same width, in black; on a placed grid the grid's options bar
  takes its place with the grip inside it.
  Dragging
  the grip shifts the upper and lower prices by the same amount, so the range
  keeps its width. Every rung redraws inside the moved range. The window holds
  the result as plain prices because a moved range may sit wholly above or
  below today's price. Typing a range percent takes control back. The grip also
  works from the keyboard with the up and down arrow keys. The grip sits at the
  range's vertical middle, flush with the plot's right edge, on its own row
  between the rungs. On a placed grid the grid's badge follows it on that row.
  It used to sit 64 pixels from the right edge on top of the rungs' furniture,
  until Tyler moved it on 3 Sep 2026. The same grip stays there after Place. The preview comes off before the saved grid is drawn, so the two copies
  never flash on top of each other.
- **The money is on the chart before placing.** Every rung carries the chip a
  placed level gets, saying what that rung puts in. The stop line says what
  firing it would cost if every rung had opened first — the worst case, which
  is what a stop is for, before fees. With borrowing above 1×, a dashed
  LIQUIDATION line shows where the exchange would take the whole trade and
  the margin that would be gone.
The window itself is dragged by its header wherever it is wanted. A "Pin to
top corner" switch was built on 1 Sep 2026 and removed the same day on
Tyler's call — "not very useful" — since the window already drags anywhere.

**A card's whole header folds it, not only the chevron.** Clicking anywhere
on the "Range −6%" strip opens or closes the card; the checkbox, the hint and
a switch-card's own label keep their own jobs. This lives in the shared
`OptionCard`, so the DCA window's cards behave the same way.

The window's header says "Grid" and the free cash — "$8,569.15 free". The
wallet name came off on Tyler's instruction; the free figure came off with it
and went back the same day when he asked for it. The Smart order menu's DCA ladder and Grid icons are grey like the
menu's other icons, for the same reason: the green is kept for money made.

## Where the range sits

Two choices, on the Range card, and both exist for either direction.

**Around today's price.** The range opens a percentage above and a percentage
below the price, so it straddles. Levels price has already passed can trade as
soon as price reaches them. Levels on the far side wait for price to go by and
come back.

**Below the price you clicked**, on a buying grid. The price you clicked becomes
the **top buy**, and the whole grid hangs under it, so every level is live from
the start.

**Above the price you clicked**, on a selling grid. The exact mirror: the price
you clicked becomes the **lowest sell**, and the whole grid sits above it. That
is how you hang a selling grid under a ceiling you can see on the chart.

Either way, **placing a grid trades nothing.**

In the second mode the top edge of the range sits one step above your click.
That edge is where your top buy sells, and it is not a price the grid ever buys
at, so it cannot be the click itself. The step is the range divided by the level
count, so the edge has to be solved for rather than set:

```
Coin at $100, you right-click at $95, 6 levels, 15% deep

  $100   price now

   $98   top edge of the range (where the top buy sells)
   $95   BUY   <- the price you clicked
   $92   BUY
   $89   BUY
   $86   BUY
   $83   BUY
   $80   BUY   bottom of the range
```

## A rung trades at its own price, or it does not trade

Written below for a buying grid. A selling grid is the mirror: a level may only
sell once price has been **below** it, and the levels below the price at
placement are the dormant ones.

This is the rule the whole order type rests on, and it used to be broken.

A grid placed with the price inside its range used to buy every level above the
price immediately, all in one market order. So a $2,000 grid whose top rung sat
at $94.54 bought that rung's coins at $87.44, and then sold them at $96.30. That
rung's round trip ran from a price it had never paid. Its own buy price was
decoration.

It failed in the direction that costs money, too. Place a grid, price drops, and
you were already holding the top half bought near the top of your own range
while the bottom half bought all the way down. Maximum long at the worst moment,
which is the opposite of what a grid is for.

In Tyler's words: **"you're buying 5 rungs at the top"**. One big lump is not a
grid, the same way one big lump is not a ladder, and the ladder rules had said
so all along.

So a level may only buy once price has been **above** it. At placement the
levels under the price are live; the ones above are dormant. If price climbs
past a dormant level and comes back down to it, it buys there, at its own price,
and sells one step up like every other level. A level price never visits simply
never trades, and that costs nothing.

The range stays adjustable after the first level opens. That entry price is the
fixed point. Dragging Upper price or Lower price spreads the waiting levels out
or pulls them in around it. The grid keeps the chosen equal-dollar or
equal-percent spacing, every rung keeps its share of the money, and the open
level keeps its entry, coins and budget. Its exit moves with the new spacing.

The middle grip remains visible on a placed grid. While the grid holds no coin,
dragging it moves the full range and every waiting rung together without
changing the range's width. Once a rung has bought, the grip stays where it is
but is disabled until the grid is flat again. A price already paid cannot move
with the waiting rungs without making the trade record untrue.

An edge that is itself the open entry has no grip because moving it would move
the entry. The other edge still works. Once two levels are open, or an older
followed range still holds coin, both edges lock. One evenly spaced grid cannot
change width while keeping two entry prices fixed.

## A trade needs space before a nearby level

Written below for a buying grid. On a selling grid the clearance inverts: a
waiting sell within 1% of a buy-back stays waiting until price falls at least
1% below it and returns.

Grid rungs share boundaries. One rung can sell at the same price where the next
rung buys. BSB exposed the problem: the grid sold around $0.1061, then bought
the next rung around $0.10635 less than a minute later. Price had only wobbled
around the shared boundary.

After any sale, every waiting buy within 1% of that sale stays waiting. Price
must first reach at least 1% above the buy, then come back down to it. A buy at
$0.1062 therefore waits for at least $0.107262 before a later return to $0.1062
can buy. Reaching $0.107262 does not buy anything. Buys more than 1% away from
the sale keep working normally.

## How the money is split

Share of account % sits in the Range card and decides the total money. The grid
then divides that money between its levels, and there are two ways it can:
equally, which is what it does by default, or by hand.

**By hand is the Rungs card.** Switching it on lists one row per rung, each
holding a relative weight and the dollars that weight receives. The price is
on the chart, where prices live. A grid on 20% of a $10,000 account has $2,000
behind it, and four weights at 10/20/30/40 give the levels $200, $400, $600
and $800.

**The grid always uses 100% of the money set aside, not a required weight
total.** Tyler's clarified rule, 3 Sep 2026. One rung gets the whole $100 grid.
Two equal weights get $50 each. Weights 20 and 30 do not need to be rewritten
as 40 and 60; the grid reads their 20:30 relationship and gives the rungs $40
and $60. Each weight can be any positive number up to 100, and their total can
be anything positive.

Typing, adding and deleting never rewrites the other weights. Add rung copies
the last weight into a new row. Deleting removes only that row. The dollar
amounts recalculate immediately so the surviving weights still divide the full
grid amount. Even split is the deliberate button for replacing every weight.
Remembered weights reopen exactly as saved, whatever number they add up to.

An older running grid keeps the dollar amount already frozen onto each rung.
Changing those amounts in the background could change real orders. Opening its
settings shows the current weights, and a deliberate re-slice scales those
weights across the full grid amount when it is saved.

**The window's tooltips are one or two short sentences.** Tyler, 1 Sep 2026:
"the tooltips are way too long. Condense them." The long explanations live in
this doc instead.

**A selling grid's rungs run backwards down the chart from a buying grid's.**
Tyler, 29 Aug 2026: _"if long was 1, 2, 3, 4, 5 then short is 5, 4, 3, 2, 1"_.

The card's rows always run down the range, top first, and each row's weight
lands at the price beside it. What reverses with the direction is the number on
the row: rung 1 is the first trade the grid makes, which is the top of the range
on a buying grid, reached on the way down, and the bottom on a selling grid,
reached on the way up.

Switching between Long and Short turns the typed weights over in the boxes, so
each rung keeps its weight and the grid comes out mirrored:

```
LONG (buying) grid            SHORT (selling) grid
range $80-$120                after switching the direction

 rung weight price  money      rung weight price  money
   1     5    $112    $50        5    45    $120   $450
   2    10    $104   $100        4    25    $112   $250
   3    15     $96   $150        3    15    $104   $150
   4    25     $88   $250        2    10     $96   $100
   5    45     $80   $450        1     5     $88    $50
```

A buying grid buys more the further price falls; the selling grid over the same
range sells more the further price climbs.

**The weights are held against prices, never against rung numbers.** That is a
rule learned the hard way: three attempts held them against rung numbers, and
each time the meaning of what was already saved changed under the new mapping,
the card silently flipped what had been typed, and the grid on the chart came
out exactly as it had been. Held against prices, what is on the card is what
lands, and nothing saved is ever re-read to mean something else.

The saved settings hold the card's rows, top of the range first. A placed grid's
plan holds level order, lowest price first, which is what the engine reads. The
two are mirror images with no direction in the conversion, and it happens in one
place: the door every grid goes through.

An older saved Short setup may still carry the Long row order. When that saved
split has its largest amount at the bottom, the placement window turns the rows
over before drawing or placing anything. A saved Short that already has its
largest amount at the top stays unchanged. The same check works the other way
for Long. An active grid is never changed in the background. If an active grid
still has the old order and holds no coin, its gear window shows the corrected
rows and Save changes redraws the waiting levels in that order.

While the card is on, the rows are also how many levels the grid has: adding a
rung adds a level, and the Levels box steps out of sight because the rows are
already answering that question. Share of account % stays, because it is still
setting the money being divided. Switching the card off puts the grid back on
the equal split and keeps the typed rows for next time.

**A hand-set split never changes size when price moves.** A grid that follows
price up or down redraws its levels at new prices, and each rung keeps exactly
the weight that was typed for it. Dragging the range does the same, including
when one entry is open. A grid reversing from long to short turns the weights
over, the same move the window makes when the direction is switched by hand,
so the reversed grid comes out as the mirror of the one it replaced.

The weights do not need to add to 100. Every move divides them by their own
total, just as placement does, so 10 / 15 / 20 still uses the complete pot in a
2 / 3 / 4 split. Following price never treats those weights as 10%, 15% and
20% and leaves the other 55% behind.

Both windows have the card. On a running grid it is beside Slices, and like
every other re-slice it can only be changed while the grid holds no coin.

Two settings carry the choice: `manualSizing` and `manualRungPcts`, in level
order, lowest price first. Both are additive fields with safe defaults, never a
new value in the `sizing` list, so an older reader sees an evenly split grid
rather than a row it cannot parse. That also means the engine ships with the app
or before it: an older engine strips the two fields when it saves a plan back,
which would flatten a hand-set grid to equal shares on its next move.

Borrowing sits in Advanced settings and starts at 1×. The account share is the
cash behind the grid. Borrowing changes how many dollars of coin that cash
buys. A grid using 20% of a $10,000 account puts $2,000 behind the range. At
3×, the levels can hold $6,000 of coin while the margin stays $2,000. The
window shows both the coin controlled by each buy and its margin.

The exchange's maximum for the coin is the ceiling. A live order sets the
chosen borrowing when the first grid level opens a position. Later levels add
to that same position and inherit its setting. A position already held by hand
also fixes the number, so the grid window shows that borrowing and does not let
the grid choose a conflicting one. Practice trading follows the same sizing
and margin arithmetic. Grids and DCA ladders sharing one coin must choose the
same borrowing because the exchange gives their shared position only one
setting.

A grid placed before doubled sizing was removed keeps the amounts already
written on its levels. Changing those amounts under a running live grid would
change what it can buy, so the engine still reads that old saved plan until the
grid ends. The old plan reader can be deleted once there are no active grids
whose saved `sizing` is `double`. New placements refuse that value.

Whatever a level is given is frozen the moment the grid is placed, and it spends
that same amount every cycle for the rest of its life. A level that buys back
cheaper does not get to spend more next time. A ladder rung buys back once; a
grid level buys back forever, so leftover carried forward would compound on
every round trip and turn a fixed pot into a much larger one.

## What a sell is worth

On a selling grid it is the buy-back that is worth what its own level made, on
the sell that level opened with. Same arithmetic, mirrored: the newest sell
still open is the one that bought back.

A grid sell is worth what **that level** made on **its own buy**. It is not
worth what the exchange says it made, and for most of a grid's life the two are
different numbers.

The exchange does not know a grid has levels. It holds one position per coin
with one average price, and it books every part-sale against that average. A
grid works the other way round. Each level buys its own coins and sells those
same coins one step up, and while the grid is running the levels still holding
are the expensive ones, so the average sits above what the selling level paid.
The exchange then calls a level that did exactly its job a loss.

CHIP on 22 August 2026 is the case this was found on.

- A level bought 1,713 coins at $0.027746 and sold them at $0.030268. That is
  **$4.28 in the account**, after both fees.
- Five levels were held at the time, at an average of $0.030928, so Hyperliquid
  booked the sale as a **$1.13 loss**.
- The chart said "lost $1.15" about a sale that made $4.28.

**The other $5.45 was not lost.** The exchange put it into the coins still
held, by leaving them carried at the old average instead of the higher one they
would have on their own. It comes back as those levels sell. Once the last
level is out, both ways of counting land on exactly the same total, which is
why nothing about the whole trade changes. Only what one sale is worth changes.

**How a sale is matched to a level.** The newest buy still held is the one that
sold. That is not an accounting convention, it is what really happens: price
falls through the levels on its way down, so the lowest level holding is always
the one bought most recently, and the lowest level is also the first to reach
its sell.

Two places show this figure, and they now agree.

- **The arrow on the chart.** Point at this grid's sell and it reads "Sold
  $51.85, made $4.28", with "Still holding $182.82" under it. Buy arrows use
  the same rule and say how many dollars they bought, while their place on the
  price axis still shows the price.
- **The Smart orders panel**, on the grid's row, as banked.

**A ladder is left alone on purpose.** A ladder's exits take a share off one
blended position, so the average really is its story and the exchange's figure
is the right one for it. Only a grid's fills are counted level by level.

One thing this fixes by accident. KuCoin reports money per position closed
rather than per sale, so a KuCoin grid's sells arrived with no figure at all
and the panel had to leave them blank. A level's round trip is worked out from
the fills, so KuCoin's grids now get a figure like everybody else's.

## Following price up and down

The two switches keep their names on either grid, and **which one is the safe
one swaps**.

- On a **buying** grid, following **up** is the free move and following **down**
  is the dangerous one.
- On a **selling** grid, following **down** is the free move and following **up**
  is the dangerous one.

The free move is free because price has left through the winning end of the
range, so the grid has already closed every level and holds nothing: no position
to settle means not one order is placed. The dangerous one walks the range
towards the loss, one level per pass, without moving the agreed loss limit away.
The window carries a "Careful" line beside whichever switch that is.

Everything below describes a buying grid. A selling grid is the same, mirrored.

Switched on, the range slides up behind price. When the highest rung sells at
the top, the whole range moves up at once. Every rung moves with it and the new
top sits one step above price. The grid does not wait for price to move beyond
the old top.

**It only follows a range price has actually been in.** A grid placed below
the price — hung under a clicked level, waiting for a fall — stays exactly
where it was put, even with following on, until price first comes down to the
top of its range. Without that rule the remembered follow setting dragged a
freshly placed below-the-click grid straight up to the market, which threw the
placement away. Switching following on by hand on an existing grid is a direct
instruction and still catches the range up at once.

It costs nothing. By the time price is above the top the grid has already sold
every level and holds nothing, so there is no position to settle and not one
order is placed. The move puts price back inside the top step, at or above every
level's buy price, so the grid buys nothing on the way and is simply ready for
the next dip.

The sold top price does not become a buy after a timer. Its new level must first
reach the sell one full rung above it. Only a later return can buy the sold price
again. CHIP showed why a clock cannot do this job: it waited 74 seconds, then
sold and bought around $0.0433 after a tiny wobble around the same price.

**Following down is a separate switch and starts off.** When the lowest rung
buys at the bottom, the range moves down by one level on that engine pass. A
fall through several whole ranges still introduces one new lower buy at a time,
so one fast candle cannot send a pile of new orders together.

The old top level leaves the active range on each downward move. If that level
still holds coins, it keeps its original buy and sell prices until it sells.
The grid calls it a carried level and never recycles it after the sale. The
active range keeps the original number of levels and splits its next buys by
the same money rule the grid was placed with.

On the chart a carried level is two lines. Its entry is a solid line in the
closing colour at the price it opened, carrying the dollars it holds, and its
way out is a dashed line one step past it named "Carried buy sells here" on a
buying grid or "Carried short buys back here" on a selling one. Before 4
September 2026 only the entry was drawn, so on AZTEC an open short carried
below the range read as the grid's exit (Tyler asked what it meant). Hovering
the entry says it was carried out of the range and where it closes.

Percentage-spaced ranges keep every overlapping level at its existing price
when they move. The moved range is rounded to the market's price step first,
and the levels are drawn from that rounded range, so the next move redraws the
same prices it saved. Before 3 September 2026 the levels were drawn from the
unrounded range, which left a saved level one step away from the redraw and
paused a healthy grid with "does not fit this market's price step" (MUBARAK on
KuCoin was the case). A saved level one step away from the redrawn one is now
the same level, and it keeps the price it traded at. A gap of two steps or more
still pauses before an existing level can be changed.

The position on the wallet is still the final count of what exists. If coins
from a carried level were already closed by hand, the grid removes that carried
level when price next crosses its sale instead of leaving a sale behind for
coins the wallet no longer holds.

Both follow switches may be on. Upward following still waits until every
active and carried level has sold. Downward following can keep adding one lower
level while older levels remain carried above it.

**The stop rides up with an upward move**, because the stop is measured from the
bottom of the range. A grid that keeps climbing keeps what it has made. A stop
you dragged into place by hand stays where you put it.

**The stop never rides down.** Switching downward following on freezes the stop
at the price where it was set. The range may move through that line, but the
line still fires there. Any new lower level at or below the stop stays unable to
buy. The grid window says this beside the switch because following down means
buying into a fall without moving the agreed loss limit away.

If the next lower price cannot fit the exchange's price step, or its buy would
be smaller than the exchange accepts, the grid pauses before sending it. The
Smart orders panel shows the reason and a Resume button.

**End Grid is a fixed ceiling while the range follows up.** The range keeps
moving behind price, but the End Grid line does not move with it. Reaching the
line closes the grid. With End Grid switched off, an upward-following grid runs
until you switch following off or the stop below the range is hit.

When a grid starts, End Grid is measured from today's price or the top of the
range, whichever is higher. A range drawn below the market therefore still gets
an End Grid above the market. Moving an untouched range applies the same rule.

**It can stop following on its own, in one case.** Levels spread the same
dollars apart earn a smaller percentage the higher the range climbs: ten dollars
is nine percent of a hundred and ten and almost nothing at eight thousand. Once
a round trip would no longer clear the trading fee three times over, the grid
parks instead of following price into trades that lose money slowly. Levels
spread the same percent apart never thin, so those follow without that limit.

## Reversing a grid

A grid can turn around: everything it holds is closed at market, the grid ends,
and a grid running the OTHER way appears over the same range in the same
motion. The range never moves. The two outer lines swap meaning: the old End
Grid line becomes the new grid's stop, and a new End Grid sits past the fired
stop by the same distance the old stop sat past the range. Both new lines drag
afterwards, like any grid's.

Two ways to trigger it:

- **By hand**, from the reverse icon on the grid's badge on the chart, beside
  the cog. One click, and a confirmation that says in plain words what will be
  sold at market and where the two new lines go. Hand reversals chain: a grid
  that came out of a reversal reverses back the same way, as many times as you
  like.
- **On its own**, when the stop fires, if **Reverse on stop loss** is ticked —
  it sits in the Stop loss card of the placement window and of the running
  grid's window, off by default. (Called "Reverse when stopped" until
  1 Sep 2026; renamed to Tyler's words, the switch itself is unchanged.) The switch never carries onto the grid a
  reversal creates, so a whipsaw market cannot flip the account back and forth
  unattended; ticking it again on the new grid is one click, and that click is
  a person deciding.

The automatic flip only happens when the stop demonstrably fired. A position
that vanished with price still inside the range was closed by hand or
liquidated, and neither reverses on its own.

A reversal can be refused, and a refusal is never silent: the sentence lands in
the bell and on the closed grid. The reasons are the ones every grid placement
already checks — the step too thin to clear the fee, a level too small for the
market, the new stop past the price the exchange would close the short out at,
price already past where the new End Grid would sit — plus three of the
reversal's own: no End Grid line to make the stop from, a stop sitting exactly
on the range, and an End Grid more than 50% past the range. A grid paired with
a DCA ladder never reverses; the selling grid would fight the ladder.

The new grid's badge tooltip says it continues a reversed grid. The greyed-out
reverse icon says why it is greyed, on hover.

## Ending the grid

On a selling grid End Grid sits **below** the range instead of above it, and
the same sentences hold with up and down swapped.

The line above the range used to be called Take profit, which was wrong. It
takes no profit. By the time price is up there every level has already sold and
the grid holds nothing, so reaching that line sells nothing at all. What it does
is close the grid and stop it watching. It is called **End Grid**, and the chart
line reads **END GRID** in orange. Orange because it is neither a buy nor a
sell and neither a win nor a loss, and it must never be read as a rung. Tyler
asked for the colour on 3 Sep 2026.

End Grid sits one gap past the range: the gap between rungs is its distance,
and the placement window has no separate percent for it (Tyler, 3 Sep 2026).
The stop sits one gap past the other end for the same reason.
End Grid starts above both today's price and the range, then stays fixed when
the range follows price up. The range can keep walking up underneath it, but the
range never moves above the line. The first price at or above End Grid closes
the grid before the range can move again.

The one time it genuinely sells is a jump: if price leaps from inside the range
straight past the line between two checks, the grid is still holding and sells
the lot there. That price is above every level's own sell, so it is the best of
the three outcomes.

Money the grid made never came from that line. It arrived in cash on each
level's own sell, one round trip at a time.

A grid is never ended by a build that does not understand it. A saved grid
carrying a setting the running engine has never heard of was written by a
newer build, and that engine leaves the row alone: no trades, no saving, no
ending. On 3 Sep 2026 an older shell worker stood in for the engine during a
redeploy, read seven short grids as buying grids holding a short, and ended
them all. `../engine/worker-restart.md` has the whole story and the rule that
came out of it: in production only the engine trades, and Web, Worker and
Engine deploy together.

A grid holding coins also ends when its position is gone — stopped out, closed
by hand, or liquidated. On real money that judgement waits: the exchange read
can be blind for a few seconds (on 1 Sep 2026 a grid's first buy on a hosted
Hyperliquid market was invisible to the very next read, and the grid declared
itself stopped out three seconds after buying, leaving a real position with no
stop and nothing managing it). A live grid whose position is missing from a
read now freezes — no buys, no sells, no ending — and only believes the
position is gone once it has stayed missing for fifteen seconds. A stop that
really fired loses nothing by being written down a few seconds later; the coins
are already sold. A practice grid keeps the same-moment answer, because the
practice book settles its own fills and cannot be behind.

## Changing a running grid

The gear on the grid's badge, at the middle of the range, opens Grid settings to the left of the gear,
vertically centred on it. The settings use the same draggable chart window,
folding option cards and fixed bottom button as the right-click Grid order
form. It can change Levels, Share of account, Borrowing, End Grid, following
and the stop. The first thing inside is the Slices card, with no description
above it. Clicking outside or pressing Escape closes it.
End Grid can be switched on or off, and its percentage is measured above
today's price or the top of the range just like placement.

Changing Borrowing redraws every waiting level with the new amount of coin.
Borrowing can change only while the grid holds no coin and still has buys
waiting. A held position has already fixed its borrowing, and a paired DCA
ladder fixes the same number for their shared position.

An edit that started before the grid finished cannot bring the grid back. The
save changes only a grid that is still running. If the engine finished the grid
first, the edit changes nothing and the screen says, "That grid has already
finished, so nothing was changed."

## The stop

Every grid has a stop. The placement window asks where it sits, but has no
switch that can remove it. The running grid window can move or change the stop,
but cannot remove it either.

The stop hangs off the **losing end of the range** — below the bottom on a
buying grid, above the top on a selling one.

It can rest on a confirmed 4h level instead, and that level has two sides. A
buying grid rests under a confirmed floor, and the card is called **Stop under
the base**. A selling grid rests above a confirmed ceiling, and the same card
reads **Stop above resistance**. One indicator, one pass, one set of settings,
mirrored.

Everything below describes a buying grid.

The stop hangs off the **bottom of the range**, never off the average buy price.
As levels recycle that average ratchets downward, so a stop following it drifts
further away on every cycle, and after a run of shallow cycles it would sit
inside the range and sell the grid on an ordinary dip. An ordinary dip is the
exact move a grid exists to trade.

It can rest under the confirmed 4h base instead, but only when a base has
confirmed below the range. A base inside the range is a level the grid fully
intends to buy at, not a level at which to give up.

**A stop dragged by hand may sit inside the range.** That is the trailing
move: price has worked the low rungs and come back up, and the stop is pulled
up behind it to lock in what the cycles have made. The rungs at or past a stop
like that fade on the chart and cannot buy — price cannot reach them without
ending the grid first — and they wake again if the stop is later dragged back
out. Only the automatic stop keeps off the inside, because it follows a rule
rather than a hand; the paragraph above says why the rule must measure from
the range's edge.

**A missing stop is never a hand move.** After every buy the engine compares
the stop it last sent with the stop the exchange shows. A stop at another price
is a hand move and is honoured. A position showing no stop at all, while the
grid has a stop setting, is placed again on that pass. Before 3 September 2026
the engine believed the absence: the kSHIB grid on Hyperliquid bought, read
"no stop" from the exchange in the same second, wrote an empty stop price into
its plan and never placed one. A grid saved that way, with a frozen stop and no
price, now falls back to the percent its stop setting names and places that.
A DCA ladder keeps the old rule, because its stop is optional and clearing it
by hand is a choice.

The one place a dragged stop may not go is at or past the current price, where
it would fire the moment the hand let go. That drop is refused with "The price
is already past there". If the venue will not give a current price at that
moment, only the always-safe drop past the losing end of the range is
accepted, and trying again a moment later unlocks the inside.

A grid never writes a take profit onto the position. Its exits are its own
sells, one per level, and a single target would sell the lot at one price and
defeat the whole order.

When a DCA ladder shares the coin, the position's ordinary stop belongs to the
ladder and the grid carries its own fixed-size stop instead, sized to exactly
what the grid holds. `grid-above-ladder.md` is the rulebook for that pairing,
including why the grid's stop must sit above the ladder's first buy.

**A selling grid and a DCA ladder can never share a coin.** The ladder is a
buying plan and the exchange holds one position for the coin, so the ladder's
rungs would close the grid's short instead of building anything. That is
refused before every other pairing rule is even looked at.

**The stop can be moved whenever you like, including while the grid holds
nothing.** That is the ordinary state between one cycle and the next, and the
stop is then a plan for later rather than protection on something open. It is
written to exchanges that carry grid protection the moment a level buys, not
before. On Lighter the stop always stays inside Trade as a watched price. When
Lighter's live price reaches the line, Trade sends one reduce-only close and
ends the grid. Setting or moving the line sends no stop order to Lighter.

**The stop is one line on the chart, never two.** The grid draws its own red
SL line, the stop. On Lighter that line is the whole order until its price is
reached. On exchanges that hold the stop, the untriggered leg at the same price
is not drawn. The grid was the one that showed both, so a grey pill carrying
the same price sat right behind the red one and read as some second thing at
that level.

The SL label, the stop, states what the grid's currently held levels would make or
lose if they all closed at that price after their opening fees. Carried levels
count too. The future closing fee stays out because the venue does not state it
until the order fills. The figure follows the line while it is dragged, and
reads $0.00 while the grid is between positions. Money and fees already banked
by completed rounds stay out because the stop cannot lose them. The label shows
a dash when the fills on hand do not add up to what the grid says it holds.

## No line on the chart carries its own price

A grid draws a dozen lines at once. Each of them used to wear a chip with its
own price, so a column of solid green, black and red ran down the right of the
chart, over the candles, saying what the price axis beside it was already
saying. The chips are gone. A line's price is read off the axis, at the height
the line sits at.

What a level puts in, in dollars, is still on the line, because the axis cannot
tell you that. So is the name of each of the four lines you set: UPPER PRICE,
LOWER PRICE, END GRID and SL, the stop. A buying grid also names rung 1's exit
while rung 1 holds coins. The levels in between carry no name, because a dozen
labelled ones is a wall of text over the price action.

## Where the names sit

**UPPER PRICE and LOWER PRICE sit on the first and last rung's own prices.**
Tyler's rule, 3 Sep 2026. On a buying grid UPPER PRICE sits on the highest
buy, rung 1, and LOWER PRICE on the deepest buy, which is the bottom of the
range. A selling grid is the mirror: UPPER PRICE on the top of the range, the
deepest short, and LOWER PRICE on the lowest short, rung 1. The bars say only
UPPER PRICE and LOWER PRICE, and every named bar on the grid, END GRID and
SL included, is the same fixed width, 112 pixels, about a tenth wider than a
position's Entry pill, so they all start and end on the same x. A name too long for the bar is cut short with an ellipsis. They used to add the rung number and trade
("RUNG 1 BUYS", "RUNG 3 SHORTS"); Tyler had that removed the same day.

Five round trips still need six prices. The sixth is the range's winning edge,
one step past rung 1, where rung 1 closes. Before rung 1 trades, the grid does
not draw that edge and stops the shaded band at rung 1: UPPER PRICE on a buying
grid, LOWER PRICE on a selling one. The empty strip no longer looks like another
rung. The placement preview follows the same rule, so it shades only the real
rungs even though it keeps the later exit price for its placement maths. Once
rung 1 buys, its sell line appears at the winning edge with the full label
"Rung 1 exit and move up" and the band grows to meet it. The line and the extra
strip leave again after that sell moves the range up. The selling grid copies
that pattern exactly: nothing at the bottom edge in the preview or on the placed
grid, and once rung 1 sells, its buy-back line appears at the bottom edge
labelled "Rung 1 exit and move down", in the buy colour, with the band reaching
down to it (Tyler, 4 Sep 2026). The two named range lines carry the rung's money
chip and its ×, so a rung is never drawn twice.

Dragging a named line moves the RUNG under the hand. On a buying grid, dropping
UPPER PRICE at $110 with the bottom held at $92 over four rungs puts rung 1 at
$110, the steps at $6 and the top edge at $116. The deepest rung IS the range's
far edge, so dragging LOWER PRICE on a buying grid moves the bottom one for
one, as it always did. With one entry open, the server keeps that entry fixed
and spreads the other prices around it, so the dragged rung can land a little
off the hand. The range still moves the way it was pulled.

**The bars sit flush against the plot's right edge, the amounts beside them.**
Reading left to right a line goes: the rung's × if it can be cancelled, then
the rung's money chip, then the name bar last, against the edge (Tyler, 3 Sep
2026: the grip on the options bar has to slide to the edge). While a grid is
being set up, the preview also prints each rung's number between the money and
the bar, 1 nearest the market; a placed grid does not. The money column is one
width for the whole grid, as wide as its widest chip, so every amount stacks in
one straight column and every bar starts on the same x. The gear, the reverse arrows, the × and the count,
"2/3", are not on any rung's line of their own: they sit on the grip's row,
midway between the UPPER PRICE and LOWER PRICE bars, flush right, with the grip
in front of them (Tyler, 3 Sep 2026). On a grid with an odd number of rungs
that middle IS a rung's line, and the grip and badge then join that rung's
row, in front of its × and money, rather than covering them. The grip is a
small rectangle the same height as the badge, so the two read as one bar. A position's pills from the other layer, Entry, LIQUIDATION and the
targets, stay on the far right and never slide inwards to make room for the
grid (Tyler, 3 Sep 2026). A pill on a rung's own price is drawn over that
rung's money chip. The grid no longer hands that layer anything to avoid. The position's liquidation pill reads LIQUIDATION, in caps
like the grid's bars beside it.

**Two named lines on one price share one row.** A stop 0% under the bottom
sits on the bottom rung's own price, and an End Grid 0% over the top sits on
the top of the range. Drawn as two lines, the second bar landed on top of the
first and hid half of it. Now the way out's bar is drawn on the rung's row
instead, to the left of the rung's furniture, still in its own colour and
still draggable: "SL $0.00 · × · $140 · LOWER PRICE". The
stop's own line is still drawn underneath. Anything more than a label's height
apart keeps its own bar.

## Green grid, red grid, orange End Grid

Everything a grid owns on the chart wears its direction. A buying grid's
range band, its UPPER PRICE and LOWER PRICE lines and its badge are green. A
selling grid's are red. The levels in between keep the colour of the trade
each one is waiting to make, as before: green where the grid buys, red where
it sells, so a held level on a buying grid is red because its next trade is a
sell. END GRID is orange on both. SL, the stop, is red on both. Nothing on a grid
wears the account's accent colour any more, so a grid can be told from a
position's blue Entry pill at a glance.

## The card headers say their answer

Each card on the window prints its answer on the right of its own title, so a
folded window still reads as a summary of what will be placed: Range shows the
depth ("±5%", or "−10%" when the grid hangs under a click), while Stop loss and
End Grid show their percentages. A dash means that card's numbers do not make
sense yet.

## What is remembered between grids

The window remembers shape, not prices: which way round the grid runs, the gap
between rungs and the depth it works out to (`grid-rung-gap.md`), how many
levels, how the money is split, the chosen borrowing, where the range sits,
and whether it follows up or down. A percentage means the same thing on the next coin you open and a
price does not, so nothing about one coin's range is carried onto another
chart.
