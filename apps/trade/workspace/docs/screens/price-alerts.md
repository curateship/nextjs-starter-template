# Price alerts

A price alert is a one-use line on one market. Right-click or long-press the
chart and choose **Alert at $X**. The alert works with or without a wallet
selected. The wallet only decides whether the menu also offers order actions.

The purple line and its row under the header's bell appear immediately. Its
dropdown has the same raised tab style as Smart orders. **Alert** holds lines
that are still waiting, and **Fired** holds the 100 most recent lines that
already went off. Each label has the same rounded count badge used by the
Positions tab. The bell itself gets a red count badge whenever fired price or
drawing alerts are waiting in Fired.
Selecting a row in either tab opens that market and leaves the dropdown open,
so a list of alerts can be walked down one row at a time. The dropdown closes
when the pointer leaves it, or on Escape. A row belonging to another exchange
is the exception: it opens that exchange's screen, and the dropdown goes with
the old page. The chart line
uses the same bar as an order: the dotted grip drags it to a new price and the
X closes it without leaving the chart. The solid purple price tag stays on the
axis. Saving continues in the background; a refused save puts the line back
where it was and says why. The dropdown lists every active alert on the
account. An active row's bin deletes the same alert. Both lists use 32px
one-line rows with no extra vertical padding. A hovered row has one complete
hairline around its top and bottom, without a doubled shared edge. Active rows show
the coin and direction beside the bin. Fired rows add how long ago the alert
fired and have their own bin. Deleting a fired row clears that panel history;
the bell notice remains. **Clear all** at the bottom asks for confirmation,
then clears only the tab on screen: active alerts from Alert, or saved history
from Fired. The other tab is untouched.

The direction is set from the live price whenever the line is created or
dropped. A line above that price waits for a rise; one below waits for a fall.
Dragging an alert through the live price changes which direction it waits for.
The engine cannot fire an older position of the line after a drag has saved.

## What fires it

The trading engine reads all active alerts once per pass and asks the existing
pushed-price feeds for their markets. A rise fires at or above its line; a fall
fires at or below it, so a move that jumps past the exact number is still
caught. A missing or stale feed gives no price and the alert waits. No page
needs to be open, and this check adds no exchange polling.

Firing is claimed with one conditional database update. Only the engine
process that changed the active row writes the notice, so two containers cannot
announce the same alert. The line and active row then leave on the next screen
refresh, and the row moves to **Fired**. The two tab labels show their current
row counts. A reload keeps the retired row without firing
again. An open screen checks active alerts every two seconds while it has an
alert to watch or a failed read to retry. Fired price alerts refresh every two
seconds while the Trade page is visible, so the closed bell can gain its red
badge as soon as one fires. The Fired tab also refreshes when opened.

The bell and inbox say, for example, "ETH reached $3,600 (was rising)," and the
notice opens that market. Price alerts have their own sound switch in Settings,
separate from fills and stops. Sound needs an open Trade tab and the browser's
audio permission; the inbox notice does not.

Alerts carried by drawn lines share the same two tabs and counts. Their rows
say the line's description, or else the word trendline or level, and where the
line is in dollars, and pressing one picks the line out on its chart. A master
switch in Settings pauses every one of them at once without switching any of
them off. See `charts/smart-tools.md`.

An account may have 100 active alerts. The next one is refused until one fires
or is deleted. Fired rows appear newest first in **Fired** and cannot re-arm
themselves. Deleting one removes only its saved history row.
