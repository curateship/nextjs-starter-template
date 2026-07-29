# Price alerts

Price alerts are private to the signed-in user. Create them from the Trade
chart by right-clicking or long-pressing a price and choosing **Add alert**.
This immediately creates a one-time crossing alert. `Alt+A` creates the same
alert at the current live price. Click its chart line to customize it.
Alerts work with every active mainnet perpetual market shown in Trade,
including markets on Hyperliquid's HIP-3 exchanges.

Use `/alerts` to edit, pause, resume, restart, or delete alerts. Active
exact-price alerts appear as dashed amber chart lines. Clicking a line edits
it. Dragging a line saves the new price immediately without opening a dialog.
Use the X on the line to delete the alert directly from the chart.

The Trade market list has a **Watch** tab listing every market that still has
an alert on it — active or paused. An alert that has already fired drops off
the tab; restart it from `/alerts` to bring the market back.

Use `/alert-log` for triggered alert history. Opening a row marks it read and
opens its market on Trade. History is kept for 30 days and remains available
after its rule is deleted.

## Conditions

- Exact price: cross a level in either direction, upward, or downward.
- Price move: move up or down by a percentage within 1m, 5m, 15m, 1h, 4h,
  or 24h.
- Unusual volume: current rolling dollar volume compared with the average of
  the previous 20 equal windows.
- Drawn line: price reaches a trendline you drew by hand (see below).

## Alerts on drawn lines

Any trendline drawn on a chart can become an alert. Click the line to open
its settings and tick **Alert me when price reaches this line**. A bell
appears on the line while it is armed. For a sloped line the trigger price
moves with time: the worker recomputes the line's price on every check, so
the alert fires where the line is *now*, not where it was drawn. Lines are
extended past their last anchor point, so an old line keeps working.

What counts as a touch is an explicit choice on the line:

- **Any touch, even a wick** — the first trade that reaches the line fires
  the alert.
- **1-minute candle closes past it** — a one-minute candle must finish on
  the far side of the line; a wick that pokes through and closes back does
  not fire.

Arming is always quiet. If price is already past the line when you arm it,
nothing fires until price actually crosses it again. The alert fires once,
then shows as **Triggered** — re-tick the box on the line (or restart it
from `/alerts`) to re-arm it.

The alert follows the line: drag or re-slope the line and the trigger moves
with it (re-arming silently, so the edit itself never fires it). Deleting
the line deletes its alert. On the `/alerts` page drawn-line alerts can be
paused, resumed, restarted, or deleted, but not edited — the line on the
chart is the alert. The Alert Log records the price that touched the line
and where the line was at that moment. Vertical lines have no single price
and cannot be armed.

The first valid price arms an exact-price alert without firing it. A one-time
alert stops after its first event. A repeating alert must reset across its
boundary and wait for its chosen cooldown before firing again. If a price
crosses while a newly saved alert is waiting for the worker's next rule
refresh, the worker replays its short recent trade window so the crossing is
not lost. After a worker restart, exact-price alerts rebuild their position
from closed one-minute market history before continuing with exact live trades.

## Delivery and worker

Events appear in the shared notification inbox. Browser alerts work while
Trading is open and permission is granted. Turn them on or off under
**Settings → General Settings → Browser alerts**. This preference is saved in
the current browser and applies to all alert sources. The first poll establishes
a baseline, so old events do not create a burst of popups. Tabs share a stored
event key to avoid duplicate browser popups.

`npm run dev` starts Trading and all dedicated workers. Use
`npm run alert-worker:dev` only to run the Alert Worker by itself. It owns its
live trade feed, evaluation, history retention, heartbeat, and runtime control.
Market Scanner and Whale Scanner controls do not affect Trade chart alerts.
