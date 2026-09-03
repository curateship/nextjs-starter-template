# Smart tools: alerts carried by drawings

A smart tool is an alert set with the drawing tools. Tyler's rule, in his
words: "Smart tools are a way to set an alert using the drawing tools." Both
drawings carry one, the trendline and the level. A base or a trendline marked
by hand is where the work happens, and before this the only alert was a flat
purple price line. A sloping line could not be watched at all.

## The marks a line carries, and where they sit

Everything a line carries hangs in **one column under the line, tucked in at
its right-hand end**: the bell nearest the line, then the cog, then the x. A
level runs the whole width, so its end is the right edge of the chart.

Under the line and at its end, rather than across its middle, because a row of
buttons over the middle covers the candles the line was drawn through, and
those candles are what the line was drawn to point at. The column starts far
enough below to clear the round handle on a trendline's end. A line lying too
near the bottom of the chart stacks its marks upwards instead.

Every mark is the same round chip, in the same muted grey, and every glyph is
drawn on the same 24-unit grid the icon set uses and brought down by the same
scale. That is what keeps them one size and one weight, rather than three sets
of hand-picked numbers that drift apart. Tyler's words, 3 Sep 2026: "they're
different colors, should all be gray and the icons needs to be the same size".
The bell wears the chip too, though it is not a button.

The bell's slot belongs to the bell whether there is one or not, so switching
an alert on never slides the buttons out from under the pointer.

## Opening the alert window

Pressing the cog opens the alert window, and double-clicking the line opens
the same one.

The window hangs off the foot of the line's column. It opens with a header
saying which drawing it is and where that line is right now in dollars, with a
divider under it running the full width of the window. Then a switch, Alert,
then Continuous line on a trendline, then a Name field.

**A line with no alert says nothing under the switches.** There used to be a
sentence there reading "Rings the bell once when the price crosses the line",
which is what the switch beside it already said. Words appear under the
switches only once there is something to report: what an armed line is waiting
for, or when a fired one went off. A
level's price is its price. A trendline's price "right now" is its slope
carried on past its second point. A line straight up and down has no one
price, and the switch stays off with the reason in a tooltip. The same
tooltip explains a switch that is waiting for the first live price.

## Without a mouse

Every way into the window opens the same window on the same line.

- **Enter or Space opens it on the line the Tab key is on.** The Tab key
  already reaches every line, and landing on one picks it out. Opening this
  way moves the keyboard into the window, so Tab then reaches the switch.
  Opening it with a pointer leaves the keyboard where it was.
- **Escape closes it and puts the keyboard back on the line**, still picked
  out, so Escape lands where Tab left off rather than at the top of the page.
- **A finger resting on a line for half a second opens it.** The same half
  second and the same eight pixels of movement the chart's order menu uses, so
  one finger learns one rule. A finger that moves further drags the line
  instead, and the window does not open.
- **The press never reaches the chart underneath**, so one finger can never
  open the line's window and the order menu together.
- **Below the 1280-pixel layout the window is the bottom sheet** the order
  windows and the side panels use, rather than a small box hanging off the
  edge of a phone screen.

## Naming a line

The window's Name field takes up to 24 characters, saved on the drawing the
way a drag is saved. The field stops at 24 itself rather than refusing the
25th afterwards. It is saved when the field is left or Enter is pressed, not
on every keystroke, because each save is a write of the whole line. Emptying
it takes the name away.

The name runs **along the line**, turned to the line's own angle, sitting five
pixels above it and starting at its left-hand end. Tyler's words, 3 Sep 2026:
"the text should line up againts the line". It is always the left end,
whichever end was drawn first, so the words read left to right rather than
upside down on a line drawn backwards. A line whose left end is off the side
of the chart is labelled where it comes into view, read along its own slope,
so the name never scrolls away with the end. It is in the line's own colour
and takes no pointer. A screen reader hears the name first and then what the line is:
"4h base, trendline from $100 to $120".

A name is not only for alerts. A line with no alert can carry one.

## What a line's alert draws on the chart

- **A bell at the head of every armed line's column**, picked out or not, in
  the muted foreground colour, so which lines are watched can be read off the
  chart without opening anything. It takes no pointer.
- **A dot where an alert fired**, at the moment and the price the engine
  compared, kept until the alert is switched on again or the line is deleted.
  Switching an alert on writes a fresh record, which takes the dot with it.
- **The window says when it fired and at what price**: "Fired 3 hours ago at
  $61,200."

A line that fired before the fire point was kept shows no dot. The record on
those rows has no price in it, and a dot in a guessed place is worse than no
dot.

## Continuous line

A trendline's window has a second switch, **Continuous line**, sitting right
under Alert. It was called "Extend to the right" until 3 Sep 2026, when Tyler
renamed it and moved it up under Alert; anything written before that date uses
the old name. On, the line carries on past its later point to the right edge
of the chart, on the same slope, drawn dashed and thinner so the part that was
drawn still reads as the drawn part. That dashed part is where the alert would fire, read with the
same arithmetic the engine uses, so what is on screen is what is watched.

The switch is off for a new line and goes on by itself the moment the
line's alert is switched on. Switching the alert off leaves it on. It is saved
on the drawing, so it survives a reload, and a level never shows it because a
level already runs the whole width.

The dashed part takes no pointer. Clicking it reaches the chart underneath
rather than picking the line, the two handles stay on the two real points,
and dragging either end moves the dashed part with it. A screen reader still
hears one line.

The window reads the market's lines again as it opens. The engine fires an
alert, and the chart only hears about that by asking, so the switch could
otherwise read on for a line that already rang the bell.

Backtest and flow-run charts draw the same lines but offer no cog and no
double-click. Only the live chart's lines are watched.

## What the switch does

On, the direction is fixed from the live price at that moment, the same rule
the purple price alerts use. A line above the price waits for a rise, and one
below waits for a fall. The switch flips at once and the server's answer
replaces it. A refused save puts the switch back and says why. On a
trendline, switching on also switches Continuous line on, in the same save.

The alert is stored on the drawing itself, in an `alert` field beside the
shape, not in a second table. Deleting the line deletes its alert. Moving the
line moves the alert, and when the screen knows the live price the direction
is set again from the line's new place, so a line dragged across the price
waits for the right side rather than firing on the next pass for nothing. An
alert that has already fired is never changed by a move.

## What fires it

The trading engine reads every armed line once per pass, beside the price
alerts, and asks the pushed-price feeds for their markets. It works out where
the line is at that moment, a level's own price or a trendline's slope carried
on, and compares the price to it. A rise fires at or above the line, a fall
at or below it. A market with no pushed price waits.

Firing is claimed with one conditional update that names the line's points
and the alert as they were read. A line moved after the read, or an alert
switched off meanwhile, misses the claim and nothing fires. Two engine
containers cannot both announce the same line.

The bell and inbox say, for example, "BTC crossed your trendline at $61,200
(was rising)" or "BTC crossed your level at $61,200 (was falling)", the alert
sound plays, and the notice opens that market. **A named line is called by its
name instead**: "BTC crossed 4h base (was rising)", with the price moved into
the sentence underneath. A price in a notice needs translating and a name the
person typed does not. The alert then switches itself off and the line stays
on the chart. Opening the window again says when it fired, and the switch can
go on again for another single ring.

## The master switch in Settings

Settings → Sounds and alerts holds one switch, **Line alerts**, that belongs
to the account. Off pauses every line alert on it. Going away for a week
should not mean switching off twenty lines and remembering which ones to
switch back.

- **Every line keeps its armed state.** The switch pauses the engine, not the
  lines, and the line's own window still switches its alert on and off.
- **The line's window says "Paused in Settings"** above its own switch, so the
  reason a line is not ringing is on the line rather than only in Settings.
- **A cross that happens while paused rings nothing, and does not ring later
  either.** The engine turns that line to face the price again, the same rule
  a dragged line follows, so the line then waits for the price to come back
  across it. Switching the master switch on with the price already past a line
  is silent; the next real cross rings once.
- Purple price alerts are not affected. This switch is only about lines.

## A level is not a purple price alert

They stay two things. A purple price alert is a one-use dashed purple line
placed from the right-click menu, with an Alert tag on the price axis, and it
says "reached" when it fires. A level is a drawing in the chart's line colour,
solid, with no tag, and it says "crossed your level" when it fires. A level
and a purple alert at the same price both fire, each once. Nothing on a
resting level says it is armed except the bell at the end of it. The cog is
the same grey as the rest, armed or not: it used to go the primary colour
while the line was armed, and the bell beside it now says that on its own.

## In the Alerts menu

Every armed line has a row in the header bell's Alert tab, beside the price
alerts, oldest first. The row says the coin, the line's name or else the word
trendline or level, where the line is right now in dollars, and the direction
it waits for. A fired line has
a row in Fired, newest first, priced at where the line was when it fired and
saying how long ago. Both tab counts include the lines.

Pressing a line row opens that market and picks the line out once its
drawings have arrived. The bin on an armed row switches the alert off, and
on a fired row clears it from the list. The line stays on the chart either
way.

The footer's **Clear all** asks for confirmation, then removes every line and
price alert from the tab on screen while leaving the other tab alone. Clearing
a line alert removes its alert state; the drawing stays on the chart.

The list reads every two seconds while any line is armed, so a fired line
moves to Fired on its own. Switching an alert on or off from the chart tells
the list to read again at once.

## Not yet

Rules beyond a plain cross, repeat firing, a full history of every fire on one
line, extending a trendline to the left, and orders from a line. Each is its
own task in `workspace/tasks/Smart tools/`.
