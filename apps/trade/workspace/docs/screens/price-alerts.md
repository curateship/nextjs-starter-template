# Price alerts

A price alert is a one-use line on one market. Right-click or long-press the
chart and choose **Alert at $X**. The alert works with or without a wallet
selected. The wallet only decides whether the menu also offers order actions.

The purple line and its row under **Alerts** appear immediately. The panel has
the same raised tab style as Smart orders. **Alert** holds lines that are still
waiting, and **Fired** holds the 100 most recent lines that already went off.
Each label has the same rounded count badge used by the Positions tab.
Selecting a row in either tab opens that market. The chart line
uses the same bar as an order: the dotted grip drags it to a new price and the
X closes it without leaving the chart. The solid purple price tag stays on the
axis. Saving continues in the background; a refused save puts the line back
where it was and says why. The Alerts panel sits below Folders, can collapse to
its tab row, and lists every active alert on the account. An active row's bin
deletes the same alert. Both lists use 32px one-line rows with no extra vertical
padding. Active rows show
the coin and direction beside the bin. Fired rows add how long ago the alert
fired and have their own bin. Deleting a fired row clears that panel history;
the bell notice remains.

The divider above Alerts drags up and down. Pressing either visible tab while
the panel is collapsed opens it again. The account remembers the split between
Folders and Alerts, including a panel collapsed to its header. Saved
workspace layouts include that split too. Older saved layouts leave the split
where it already is when they open.

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
alert to watch or a failed read to retry. The Fired tab refreshes on open and
while active alerts can still go off.

The bell and inbox say, for example, "ETH reached $3,600 (was rising)," and the
notice opens that market. Price alerts have their own sound switch in Settings,
separate from fills and stops. Sound needs an open Trade tab and the browser's
audio permission; the inbox notice does not.

An account may have 100 active alerts. The next one is refused until one fires
or is deleted. Fired rows appear newest first in **Fired** and cannot re-arm
themselves. Deleting one removes only its saved history row.
