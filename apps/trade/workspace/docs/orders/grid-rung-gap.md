# One gap between rungs sets the range, the stop and End Grid

The Grid window's Range card asks one thing about the range's size: **Gap
between rungs %**. Tyler's rule, 3 Sep 2026: "we just need to set a % between
rungs." There is no depth box, no Above % and Below %, no percent on the stop
and no percent on End Grid. Everything is that one gap.

## The arithmetic, in numbers

3 rungs under a $80 click with a 4.75% gap: rung 1 is the click at $80, rung 2
is 4.75% under it, rung 3 is 9.5% under it at $72.40. The range reaches 9.5%
below the click, and the card says so on the line under the box: "Reaches
below your click 9.5%". Change the Rungs card to 5 rungs and the same gap
reaches 19%, because there are now four gaps.

- **Hanging off a click**, the click is rung 1, so the depth is one gap fewer
  than the rungs.
- **Around today's price**, the rungs straddle it. 4 rungs 2% apart is an 8%
  range, 4% above and 4% below, and the line reads "Reaches either side of the
  price 4%".
- **The stop** sits one gap under the bottom rung (over the top rung on a
  selling grid). The Stop loss card has no percent box; a line reads "Sits
  past the range by −2%", the same percent as the gap. The confirmed-base stop and Reverse on stop loss are
  still there.
- **End Grid** sits one gap above the range and closes the grid when reached.
  One exception, and it is not a choice: when the range hangs below today's
  price, one gap above the top of the range would be below the price, and a
  grid with End Grid below the price closes the moment it is placed. So End
  Grid is measured from today's price instead, and the line says so: "Ends
  past today's price by +2%" rather than "Ends past the range by +2%". It is
  a tick box in Advanced settings, on by default. It shows a percent, never a
  price (Tyler, 3 Sep 2026: "it should be the same percentage"). End Grid has
  no card and no percent box of its own any more.

With Levels spread set to the same percent apart, the gaps compound: 3 rungs
10% apart on a buying grid reach 19% down ($100, $90, $81). The same-dollar
setting adds them: 20%.

## Dragging on the chart

Dragging UPPER PRICE or LOWER PRICE on the preview still moves that edge one
for one. One gap cannot say "the top moved and the bottom did not", so the
range becomes a hand-set range in plain prices and the card says "The range
is where you dragged it". Typing a gap takes the range back. The stop and End
Grid lines can be dragged too: dragging one gives that line its own distance,
say a stop 5% under the range while the rungs stay 2% apart, and its readout
says so. Typing the gap again takes both lines back to the gap.

## Refusals

- A gap that is not a number above zero: "Type the gap between rungs as a
  percent above zero."
- A buying grid whose rungs would reach below zero, say 5 rungs 30% apart:
  the refusal names the count and gap and asks for a smaller gap or fewer
  rungs.

## What is saved

The engine never sees the gap. A grid is saved with its depths, its stop
percent and its End Grid percent exactly as before, all worked out from the
gap, so nothing that trades changed. The window also remembers the gap itself
so the next grid opens on it. Settings saved before the gap existed open on a
2% gap. The running grid's settings window still edits the count, the stop and
End Grid as numbers of their own.
