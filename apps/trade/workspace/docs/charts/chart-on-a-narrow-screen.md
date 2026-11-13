# The chart on a narrow screen

Under 1280px the chart fills a phone's width when it opens, its prices drop the
cents from $1,000 up, and a placed grid's levels are bare lines until one is
tapped. Tyler picked this on 13 Nov 2026: "Candles fill the width when the
chart opens, with shorter price labels and grid labels moved out of the way."
At 1280px and above nothing here applies, and the chart is as it was.

1280px is the same line the bottom bar uses (`screens/dashboard-on-a-phone.md`),
read through `useWideScreen` in `src/lib/layout/wide-screen.ts`.

## Its own zoom

The chart remembers how far it is zoomed and scrolled on the account. A
narrow screen keeps a second copy of that, so a phone never opens at the
computer's zoom and the computer never opens at the phone's.

- **Where it is kept:** the wide screen's view is `trade_prefs.chart_view`, as
  before. The narrow one is `narrowChartView` inside `trade_prefs.panel_layouts`,
  saved by `saveNarrowChartView` in `src/server/trade/prefs.ts`. No migration
  was needed. A view the build cannot read is refused rather than stored.
- **Before it has been moved:** a narrow chart opens at `NARROW_START_VIEW` in
  `src/lib/trade/chart-view.ts`. That is the last 60 candles across the whole
  width with two candles' room after the newest, about five pixels a candle on
  a 390px phone.
- **Crossing 1280px** with the page open, by turning a tablet or resizing a
  window, frames the chart again at the view kept for the new width.

**Why the candles used to bunch up on the left.** The page is first built at
computer width, then the browser narrows it. The chart library keeps the empty
room to the right of the newest candle at the same number of pixels when it
narrows. On a computer that room was about 300px, which is most of a phone's
chart, so the candles were squeezed into its left fifth.

## Price labels

The price column and the price tags on its right edge use `formatAxisPrice` in
`src/lib/trade/format.ts`:

- **$1,000 and up:** whole dollars with commas. "69012.00" reads "69,012".
- **Under $1,000:** the five significant digits every Trade price uses. "142.38"
  stays "142.38" and a $0.0001234 coin reads "0.0001234".

There is no dollar sign, since the whole column is dollars. A wide screen keeps
the chart library's own labels.

## Grid levels

On a narrow screen a placed grid's levels are lines only. The dollar figure
each level puts in, and the × that calls that level off, are hidden. The UPPER
PRICE and LOWER PRICE names, the grid's "8/10" label, End Grid and the stop
keep everything they had.

- **A tap on a level** shows that one level's dollars and ×. A tap anywhere
  else hides them again.
- **A tap is short and still:** under 400 milliseconds and under 8 pixels of
  movement. A pan or a long press across a level is never a tap, so the chart
  still pans from anywhere and the long-press order menu still opens.
- **It picks the nearest level** within 16 pixels of the finger.
- **The money column keeps its width** while hidden, so the grid's controls
  stay lined up.

The tap is watched with one listener on the page rather than a strip on each
line, because a strip would take the press from the chart and a pan starting
on a level would move nothing. It is in `GridLayer`,
`src/components/trade/grid-layer.tsx`. The grid being set up in the placement
window still shows every level's dollars.

## Checking it

Open `/trade?view=hyperliquid` at 390×844 on the dev server's port from the
repo's `local-apps.json`:

1. The candles run across the whole chart with the newest one near the right
   edge.
2. The price column reads like "68,000" and "69,012", with no cents.
3. A grid's levels show no dollars and no × until one is tapped. That level then
   shows both, and a tap on the header hides them.
4. At 1440px the chart opens at the computer's own zoom and its prices keep
   their cents.
