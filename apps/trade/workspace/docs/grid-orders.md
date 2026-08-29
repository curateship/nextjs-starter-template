# Grid orders

A grid is a range of prices and a count. It puts an order at every level in that
range, and each level has its own way out one step away. When that way out fills
the level goes back to watching its own price. A nearby level cannot take the
same small wobble as the trade that just happened. Price must first move 1% past
it and return. The recycling is what the DCA ladder cannot do: a ladder buys one
fall and is then finished, while a grid can earn on repeated crossings.

Nothing rests on the exchange. A level is a price the grid is watching, and when
price reaches it the grid trades there and then. That is the app-wide rule and
`smart-orders-never-rest.md` covers why.

## Buy the dips, or sell the rallies

Two boxes, **Long** and **Short**, sit side by side at the top of the Range
card. They are the first thing the window asks, because every label under them
changes with the answer. Exactly one is ever ticked: clicking the one already
on does nothing, so a grid can never be left with no direction at all.

**Long** is the buying grid, which is what every grid was, and it is the one
the window opens on. It buys at each level and sells one step above it, and
earns while a coin chops sideways or drifts up.

**Short** sells at each level and buys back one step below it. It earns while a
coin chops sideways or drifts down. Selling a coin you do not own means
borrowing it from the exchange, selling it, and buying it back later. You keep
the difference if it got cheaper.

Elsewhere the two are called **Buy the dips** and **Sell the rallies** — on the
chart's badge and in the running grid's window, which are explaining rather
than asking, and have room for the phrase.

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
is placed, with a sentence saying what to change. `trading-rules.md` holds that
rule.

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
version reads. `trading-rules.md` carries the rule this comes from.

**Funding is not modelled.** On a real exchange a short usually collects a
small payment every few hours from the people who are long. Nothing in the
practice engine models that, so a practice selling grid reads slightly worse
than the real one would.

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

One consequence worth knowing: while a grid is holding anything, its range
cannot be dragged. That level bought at its own price and sells one step above
it, so sliding the range under it would leave it selling coins it never paid
that price for. A grid holds nothing for most of its life, so most of the time
the range moves freely.

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

Share of account % sits in the Range card. The grid divides that money equally
between every level. There is no sizing dropdown.

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
- **On its own**, when the stop fires, if **Reverse when stopped** is ticked —
  it sits in the Stop loss card of the placement window and of the running
  grid's window, off by default. The switch never carries onto the grid a
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
line reads **END GRID**.

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

## Changing a running grid

The gear beside UPPER PRICE opens the running grid window. The window can
change Levels, Share of account, Borrowing, End Grid, following and the stop.
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
STOP LOSS line. On Lighter that line is the whole order until its price is
reached. On exchanges that hold the stop, the untriggered leg at the same price
is not drawn. The grid was the one that showed both, so a grey pill carrying
the same price sat right behind the red one and read as some second thing at
that level.

## No line on the chart carries its own price

A grid draws a dozen lines at once. Each of them used to wear a chip with its
own price, so a column of solid green, black and red ran down the right of the
chart, over the candles, saying what the price axis beside it was already
saying. The chips are gone. A line's price is read off the axis, at the height
the line sits at.

What a level puts in, in dollars, is still on the line, because the axis cannot
tell you that. So is the name of each of the four lines you set: UPPER PRICE,
LOWER PRICE, END GRID and STOP LOSS. The levels in between carry no name, because
a dozen labelled ones is a wall of text over the price action.

## The card headers say their answer

Each card on the window prints its answer on the right of its own title, so a
folded window still reads as a summary of what will be placed: Range shows the
depth ("±5%", or "−10%" when the grid hangs under a click), while Stop loss and
End Grid show their percentages. A dash means that card's numbers do not make
sense yet.

## What is remembered between grids

The window remembers shape, not prices: which way round the grid runs, how deep,
how many levels, how the money is split, the chosen borrowing, where the range
sits, and whether it follows up or down. A percentage means the same thing on the next coin you open and a
price does not, so nothing about one coin's range is carried onto another
chart.
