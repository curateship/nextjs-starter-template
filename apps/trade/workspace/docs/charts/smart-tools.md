# Smart tools: alerts carried by drawings

A smart tool is an alert set with the drawing tools. Tyler's rule, in his
words: "Smart tools are a way to set an alert using the drawing tools." The
first one is the trendline. A base or a trendline marked by hand is where the
work happens, and before this the only alert was a flat purple price line. A
sloping line could not be watched at all.

## Opening the alert window

Pick a trendline out and two small buttons sit over its middle: the x on the
left, and a cog on the right, a button's width apart. Pressing the cog opens
the alert window. Double-clicking the line opens the same window. A level
shows no cog, because a level's alert is its own task.

The window hangs off the line's middle and holds one switch, Alert, and a line
of words saying where the line is right now in dollars. A trendline's price
"right now" is its slope carried on past its second point. A line straight up
and down has no one price, and the switch stays off with the reason in a
tooltip. The same tooltip explains a switch that is waiting for the first live
price.

The window reads the market's lines again as it opens. The engine fires an
alert, and the chart only hears about that by asking, so the switch could
otherwise read on for a line that already rang the bell.

Backtest and flow-run charts draw the same lines but offer no cog and no
double-click. Only the live chart's lines are watched.

## What the switch does

On, the direction is fixed from the live price at that moment, the same rule
the purple price alerts use. A line above the price waits for a rise, and one
below waits for a fall. The switch flips at once and the server's answer
replaces it. A refused save puts the switch back and says why.

The alert is stored on the drawing itself, in an `alert` field beside the
shape, not in a second table. Deleting the line deletes its alert. Moving the
line moves the alert, and when the screen knows the live price the direction
is set again from the line's new place, so a line dragged across the price
waits for the right side rather than firing on the next pass for nothing. An
alert that has already fired is never changed by a move.

The cog is drawn in the primary colour while the line is armed, so a watched
line can be told from a plain one without opening the window.

## What fires it

The trading engine reads every armed line once per pass, beside the price
alerts, and asks the pushed-price feeds for their markets. It works out where
the line is at that moment and compares the price to it. A rise fires at or
above the line, a fall at or below it. A market with no pushed price waits.

Firing is claimed with one conditional update that names the line's points
and the alert as they were read. A line moved after the read, or an alert
switched off meanwhile, misses the claim and nothing fires. Two engine
containers cannot both announce the same line.

The bell and inbox say, for example, "BTC crossed your trendline at $61,200
(was rising)", the alert sound plays, and the notice opens that market. The
alert then switches itself off and the line stays on the chart. Opening the
window again says when it fired, and the switch can go on again for another
single ring.

## In the Alerts panel

Every armed line has a row in the Alerts panel's Alert tab, beside the price
alerts, oldest first. The row says the coin, the word trendline, where the
line is right now in dollars, and the direction it waits for. A fired line has
a row in Fired, newest first, priced at where the line was when it fired and
saying how long ago. Both tab counts include the lines.

Pressing a line row opens that market and picks the line out once its
drawings have arrived. The bin on an armed row switches the alert off, and
on a fired row clears it from the list. The line stays on the chart either
way.

The list reads every two seconds while any line is armed, so a fired line
moves to Fired on its own. Switching an alert on or off from the chart tells
the list to read again at once.

## Not yet

Rules beyond a plain cross, repeat firing, marks on the chart, naming a line, touch and keyboard ways into the window, alerts on
levels, and orders from a line. Each is its own task in
`workspace/tasks/Smart tools/`.
