# Drawing on the chart

### By touch

A finger opens the chart's order menu by staying still for half a second. A
finger that moves more than eight pixels pans the chart and opens nothing. A
finger resting on a drawn line for the same half second opens that line's
alert window instead, and the press never reaches the chart, so one finger
never opens two things.
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
The grip has no hover message.

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
  save that does not land takes it back with a toast. A re-read of the lines,
  which a line's window asks for as it opens, keeps any line changed or
  deleted on this screen after the re-read began. The re-read's copy is older
  than that change, so it must not flip a switch back or bring a line back.
- **Clicking a line picks it out** — it thickens and takes a soft glow along
  its length, and a trendline shows a handle at each end. Dragging the line
  moves the whole thing; dragging a handle moves that end alone. Pressing
  anywhere else on the chart, or Escape, lets it go.
- **The glow is the focus mark too, and the browser's own ring is turned
  off.** A focus ring draws a box round the whole element, and on a line
  running corner to corner that is a grey rectangle over half the chart.
- **The Tab key reaches every line**, and landing on one picks it out. Delete
  or Backspace throws the focused one away.
- **One line at a time goes from the line itself** — the small × in the column
  under its right-hand end while it is picked out, or Delete on the keyboard —
  and it comes back
  with **Undo** in the toast that follows. A marked base is work, and a slip of
  the mouse must not quietly erase it.
- **The bin in the toolbar clears the whole chart**, and asks first. It only
  appears once there is something to clear, it names how many go, and it takes
  this market's lines only — the others keep theirs. There is no Undo on that
  one; the question is asked before it runs instead.
- **The chart underneath still pans, zooms and shows its crosshair.** Only a
  line itself takes the pointer, plus the whole chart while a tool is held.
- **A picked-out line, level or trendline, also shows a cog above its x**,
  which opens its alert window. Double-clicking the line, pressing Enter or
  Space on the line the Tab key is on, and resting a finger on it for half a
  second all open the same window, and Escape closes it and puts the keyboard
  back on the line. On a narrow screen the window is the bottom sheet the
  order windows use.
- **That window also describes the line and switches its alert on**, and on a
  trendline has a Continuous line switch that draws the line on to the right
  edge, dashed. A described line shows its description beside its start, and
  an armed one shows a bell at the head of that same column. The Description
  box grows with the text and accepts up to 240 characters.
- **Continuous line is on for every new trendline until it is switched off
  once.** Tyler asked for this on 4 Sep 2026. Flipping the switch on any line
  changes that line and is remembered against the account as the answer for
  the next line drawn, on this machine and any other. The last flip wins, so
  switching one line off makes the next line plain, and switching a line back
  on makes the next one continuous again. The memory sits with the chart's
  other view options, and it is not on the options menu. Lines drawn before
  4 Sep 2026 stay as they were.
  Break buffer follows the same account-wide rule: it starts at 1%, and the
  last saved input on any line becomes the starting value for the next alert.
  All of it is smart tools, in `smart-tools.md`. Orders on lines are still out
  of scope and attach to the same surface in their own task.
