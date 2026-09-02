# Drawing on the chart

### By touch

A finger opens the chart's order menu by staying still for half a second. A
finger that moves more than eight pixels pans the chart and opens nothing.
Below the 1280-pixel wide layout, the order menu and every order window open in
the same bottom sheet used by the workspace side panels. A tap outside closes
the sheet and does not pass through to the chart.

Order lines keep their thin drawing, but the invisible area a finger can grab
is 44 pixels tall on a touch screen. Dragging that area moves the line and does
not pan the chart. Placing still takes one press on the order window's Place
button. Touch adds no second confirmation.

A small horizontal toolbar starts at the top-right corner of the candles, just
before the chart's price labels, rather than in the header row: the header says
which market and which timeframe, and the toolbar says what the pointer is
holding. The translucent background leaves the candles visible underneath with
a moderate blur and stronger colour. The border separates the toolbar without a
shadow. Its right-hand grip moves the toolbar anywhere inside the candles. A
dashed copy marks its home while it moves. The copy and the toolbar brighten
inside the snap range, then the toolbar lands eight pixels from both the top and
the price-label edge. Arrow keys move the focused grip eight pixels at a time,
and Home returns it to that corner. The account layout remembers the toolbar's
relative place across live, backtest and flow-run charts, even when the chart
panel changes size. A selected named workspace layout remembers the same place.

- **Two tools: a level and a trendline.** Press a tool, draw one thing, and
  the tool puts itself down — staying armed would turn a stray click into
  another line. Pressing the tool that is already held puts it down too, and
  so does Escape. A right-click puts the held tool down without opening the
  browser menu or the order menu.
- **A level is one click**; a **trendline is a drag from one end to the
  other**, or a tap at each end, which is the only way there is on a
  touchscreen. Either way a dashed preview shows where the line will land
  before it lands.
- **Levels and trendline ends snap to candle highs and lows within eight screen
  pixels as they are drawn or moved.** A small dot marks the wick tip that will
  take the point. Hold Alt to draw or drag an end exactly under the pointer
  instead. On touch, hold the first point still for half a second before
  drawing to skip snapping for the whole line.
- **A drawing is kept as a time and a price, never as pixels**, so it comes
  back at any zoom and on any timeframe — a base marked on 4h is in the same
  place on 1d.
- **Drawings belong to the market**, saved against the account, so what is
  marked on BTC never appears on ETH and a second machine sees the same
  lines. Saving is optimistic: a line appears the instant it is drawn, and a
  save that does not land takes it back with a toast.
- **Clicking a line picks it out** — it thickens and takes a soft glow along
  its length, and a trendline shows a handle at each end. Dragging the line
  moves the whole thing; dragging a handle moves that end alone. Pressing
  anywhere else on the chart, or Escape, lets it go.
- **The glow is the focus mark too, and the browser's own ring is turned
  off.** A focus ring draws a box round the whole element, and on a line
  running corner to corner that is a grey rectangle over half the chart.
- **The Tab key reaches every line**, and landing on one picks it out. Delete
  or Backspace throws the focused one away.
- **One line at a time goes from the line itself** — the small × over its
  middle while it is picked out, or Delete on the keyboard — and it comes back
  with **Undo** in the toast that follows. A marked base is work, and a slip of
  the mouse must not quietly erase it.
- **The bin in the toolbar clears the whole chart**, and asks first. It only
  appears once there is something to clear, it names how many go, and it takes
  this market's lines only — the others keep theirs. There is no Undo on that
  one; the question is asked before it runs instead.
- **The chart underneath still pans, zooms and shows its crosshair.** Only a
  line itself takes the pointer, plus the whole chart while a tool is held.
- Out of scope by the standing decision: alerts on lines and orders on lines.
  Each attaches to the same surface in its own task. Indicators now do —
  see below.
