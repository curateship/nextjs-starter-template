# Price alerts

Price alerts are private to the signed-in user. Create them from the Trade
chart by right-clicking or long-pressing a price and choosing **Add alert**.
`Alt+A` creates an alert at the current live price.

Use `/alerts` to edit, pause, resume, restart, or delete alerts. Active
exact-price alerts appear as dashed amber chart lines. Clicking a line edits
it. Dragging a line saves the new price immediately without opening a dialog.
Use the X on the line to delete the alert directly from the chart.

Use `/alert-log` for triggered alert history. Opening a row marks it read and
opens its market on Trade. History is kept for 30 days and remains available
after its rule is deleted.

## Conditions

- Exact price: cross a level in either direction, upward, or downward.
- Price move: move up or down by a percentage within 1m, 5m, 15m, 1h, 4h,
  or 24h.
- Unusual volume: current rolling dollar volume compared with the average of
  the previous 20 equal windows.

The first valid price arms an exact-price alert without firing it. A one-time
alert stops after its first event. A repeating alert must reset across its
boundary and wait for its chosen cooldown before firing again.

## Delivery and worker

Events appear in the shared notification inbox. Browser alerts work while
Trading is open and permission is granted. Turn them on or off under
**Settings → General Settings → Browser alerts**. This preference is saved in
the current browser and does not change Market Scanner browser alerts. The first
poll establishes a baseline, so old events do not create a burst of popups.
Tabs share a stored event key to avoid duplicate browser popups.

`npm run dev` starts Trading and all dedicated workers. Use
`npm run market-scanner:dev` only to run that worker by itself. The TradingView
alert evaluator shares its live trade feed with Market Scanner, but their rules,
history, routes, and behavior remain separate. Whale Scanner controls do not
affect either system.
