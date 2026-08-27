# Grid orders

A grid is a range of prices and a count. It puts a buy at every level in that
range, and each buy has its own sell one step above it. When that sell fills the
buy goes straight back on at the same price, and the level starts again. The
recycling is the whole thing, and it is what the DCA ladder cannot do: a ladder
buys one fall and is then finished, while a grid earns a little on every bounce
for as long as price keeps crossing back and forth.

Nothing rests on the exchange. A level is a price the grid is watching, and when
price reaches it the grid buys there and then. That is the app-wide rule and
`smart-orders-never-rest.md` covers why.

## Where the range sits

Two choices, on the Range card of the window that opens when you right-click the
chart and pick Grid.

**Around today's price.** The range opens a percentage above and a percentage
below the price, so it straddles. Levels below the price can buy as soon as
price reaches them. Levels above the price wait for price to climb past them and
come back down.

**Below the price you clicked.** The price you clicked becomes the **top buy**,
and the whole grid hangs under it, so every level is live from the start.

Either way, **placing a grid buys nothing.**

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

## A rung buys at its own price, or it does not buy

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

## How the money is split

The Money card sets one share of the account for the whole grid, and how that
share is divided between the levels.

**The same at every level** gives every level equal dollars. It is the grid's
own instinct: a grid is not betting on direction, so it wants the same money
working at every price and each round trip earns the same.

**Double at every level down** gives each level twice what the level above it
got, so the deepest buy is the biggest. It is for a coin you are happy to own
more of the cheaper it gets.

```
$2,000 across 6 levels

The same at every level     Double at every level down

top     $333                top       $32
        $333                          $63
        $333                         $127
        $333                         $254
        $333                         $508
bottom  $333                bottom  $1,016
```

Doubling gets steep fast, and an exchange will not accept an order under $10. On
a $2,000 pot it fits about six levels. Twelve levels doubling would make the top
buy 49 cents, so the whole grid is refused and the window names the level that
broke it. That refusal is the feature working. Placing eight of the twelve
levels quietly would be worse.

Whatever a level is given is frozen the moment the grid is placed, and it spends
that same amount every cycle for the rest of its life. A level that buys back
cheaper does not get to spend more next time. A ladder rung buys back once; a
grid level buys back forever, so leftover carried forward would compound on
every round trip and turn a fixed pot into a much larger one.

## What a sell is worth

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

**A grid following up never finishes on its own.** It runs until you switch
upward following off or the stop below the range is hit. Switching upward
following on removes the finish line, and the window says so before it does it,
because a range that slides up ahead of price can never reach a line above it.

**It can stop following on its own, in one case.** Levels spread the same
dollars apart earn a smaller percentage the higher the range climbs: ten dollars
is nine percent of a hundred and ten and almost nothing at eight thousand. Once
a round trip would no longer clear the trading fee three times over, the grid
parks instead of following price into trades that lose money slowly. Levels
spread the same percent apart never thin, so those follow without that limit.

## Finishing the grid

The line above the range used to be called Take profit, which was wrong. It
takes no profit. By the time price is up there every level has already sold and
the grid holds nothing, so reaching that line sells nothing at all. What it does
is close the grid and stop it watching. It is called **Finish the grid**, and on
the chart the line reads FINISH.

The one time it genuinely sells is a jump: if price leaps from inside the range
straight past the line between two checks, the grid is still holding and sells
the lot there. That price is above every level's own sell, so it is the best of
the three outcomes.

Money the grid made never came from that line. It arrived in cash on each
level's own sell, one round trip at a time.

## The stop

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

**The stop can be moved whenever you like, including while the grid holds
nothing.** That is the ordinary state between one cycle and the next, and the
stop is then a plan for later rather than protection on something open. It is
written to the exchange the moment a level buys, not before. On a live wallet
this used to be refused with "That position is not on the exchange any more",
which threw the drag away along with the stop you had just moved.

**The stop is one line on the chart, never two.** The grid draws its own red
STOP LOSS line, and the untriggered leg the exchange is holding at that same
price is not drawn at all. Every other order type already worked this way. The
grid was the one that showed both, so a grey pill carrying the same price sat
right behind the red one and read as some second thing at that level. The leg
is matched by its price rather than by its order id, so a leg the exchange
re-made under a new id, or one left over from an earlier stop, is hidden too.

## No line on the chart carries its own price

A grid draws a dozen lines at once. Each of them used to wear a chip with its
own price, so a column of solid green, black and red ran down the right of the
chart, over the candles, saying what the price axis beside it was already
saying. The chips are gone. A line's price is read off the axis, at the height
the line sits at.

What a level puts in, in dollars, is still on the line, because the axis cannot
tell you that. So is the name of each of the four lines you set: UPPER PRICE,
LOWER PRICE, FINISH and STOP LOSS. The levels in between carry no name, because
a dozen labelled ones is a wall of text over the price action.

## The card headers say their answer

Each card on the window prints its answer on the right of its own title, so a
folded window still reads as a summary of what will be placed: Range shows the
depth ("±5%", or "−10%" when the grid hangs under a click), Money shows what the
whole grid costs in dollars, Stop loss and Finish the grid show their
percentages. A dash means that card's numbers do not make sense yet.

## What is remembered between grids

The window remembers shape, not prices: how deep, how many levels, how the money
is split, where the range sits, and whether it follows up or down. A percentage
means the same thing on the next coin you open and a price does not, so nothing
about one coin's range is carried onto another chart.
