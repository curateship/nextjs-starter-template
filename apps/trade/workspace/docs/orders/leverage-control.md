# Leverage in the order windows

Every order window names leverage "Leverage" and sets it with the same slider.
Leverage is how much the exchange lends on top of your own cash: at 3×, $1,000
of your cash controls $3,000 of coin.

Five windows draw the one control, `src/components/trade/leverage-slider.tsx`:

- **Quick order**, the window a right-click on the chart opens.
- **Order settings**, the window that edits a waiting order.
- **Grid**, in the Range card under Share of account, beside the money it multiplies.
- **Grid settings**, in the Slices card of a running grid.
- **DCA ladder**, in the Position card when placing or editing a ladder.

## How the slider behaves

- **Range:** it runs from 1× to the most the exchange lends on that coin, in
  whole steps. The grid and DCA windows also stop at 50×.
- **The number:** the chosen leverage shows beside the word, for example "3×".
- **Keyboard:** the arrow keys move it one step at a time.
- **A market that lends nothing:** the slider is not drawn, because 1× is the
  only choice.
- **Locked:** a grid sharing a position with a DCA ladder, or a coin already
  held by hand, shows that position's leverage on a greyed-out slider. The info
  icon beside the word says why.

## Why one control

The quick order and order settings windows used to say "Leverage" with a
slider, while the grid and DCA windows said "Borrowing ×" with a typed box. Two
names and two controls made one setting look like two. Tyler chose "Leverage"
and the slider on 23 Sep 2026.

Stored settings keep their field name, `leverage`, so saved grids, ladders and
remembered quick-order choices read the same as before. The margin window on an
open position still uses a typed box. It is not an order window, and it already
says "Leverage".
