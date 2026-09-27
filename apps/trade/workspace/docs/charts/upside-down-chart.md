# Turning the chart upside down

The chart can be flipped so the highest price sits at the bottom. A fall then
looks like a rise, which is how a short trade reads: the shape you want is the
one going up.

## Where the button is

Bottom-right corner of the chart, beside the full-screen button, inside the
price axis rather than over it. Two buttons in one row: flip on the left,
full screen on the right. Both are drawn by `chart-panel.tsx:2110`, which
places whatever `cornerControl` it is handed; the pair itself is built in
`trade-workspace.tsx:1184`.

The button is `chart-invert-button.tsx`. It reads "Turn the chart upside down",
and once the chart is flipped it reads "Turn the chart back up".

## What flips and what does not

- **The price scale flips, nothing else.** The chart sets `invertScale` on the
  right-hand price scale in `price-chart.tsx:390`. Prices, orders and candles
  are untouched. Only which way the picture points changes.
- **Everything drawn on top follows.** Trendlines, fib levels, grid lines,
  stops, order arrows and indicators all ask the chart where a price lands
  (`yOf` in `price-chart.tsx`), so they land flipped without any of them
  knowing the chart flipped.
- **Volume stays at the bottom, growing up.** Volume has its own scale, and
  that scale is not flipped.
- **Buying and selling are unchanged.** A buy is still a buy. Dragging a stop
  still sets the price the line sits on, because the drag reads the price back
  from the screen position rather than from the direction of the drag.

## Where the choice is kept

In the account's chart options, beside the chart type, the grid, the crosshair
and the clock. It is saved on the server, not in the browser, so the flip is
still on after a reload and on another machine. It is one choice for the whole
account, not one per market: flipping BTC flips the next coin you open too.

A saved row written before the flip existed reads back as not flipped, and
keeps every other choice on it (`chart-options.ts`).

## The remembered zoom

Each chart remembers its zoom and how much of the height the candles fill.
Those two margins are shares of the screen, measured from the top and bottom
edges, and a flipped chart reads the low as the candle nearest the top. That
is what `inverted` does in `viewOf` (`chart-view.ts`). Without it a flipped
chart would read a negative height and quietly stop saving the zoom.

## Testing it

- `src/lib/trade/chart-view.test.ts` covers the flipped margin reading and
  refuses a flipped reading taken the upright way round.
- `src/lib/trade/chart-options.test.ts` covers the saved choice and an older
  row that never had it.
