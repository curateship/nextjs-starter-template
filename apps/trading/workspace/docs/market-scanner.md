# Market scanner

The Market Scanner is an independent read-only worker subsystem that watches
Hyperliquid mainnet perpetual markets. It does not use the Research Scanner's
trade collector or pause switch. Rules and alerts are private to the signed-in
user.

`npm run dev` starts both Trading and the independent Market Scanner process.
Use `npm run market-scanner:dev` only when running the scanner by itself. The
scanner remains separate from `npm run worker:dev`, so it does not start bots.
The Research Scanner can be paused or disabled without affecting market rules.

Click an alert title on the Market Alerts dashboard to open its market on the
Trade dashboard. Market alerts in the notification tray open the same Trade
market.

## Rules

- Price move: `(latest price - price at window start) / price at window start`.
- Relative volume: current rolling dollar volume divided by the average dollar
  volume of the previous 20 equal windows.
- Windows: 1m, 5m, 15m, 1h, 4h, and 24h.
- A rule is evaluated independently for each market. It does not alert when it
  first loads in a matched state. It must be below its threshold, cross above
  it, reset below it, and cross again after its cooldown to alert again.

## Delivery and history

Rules are managed on the Market Scanner dashboard. Alerts appear on the
separate Market Alerts dashboard and in the shared notification inbox. Browser
alerts work only while Trading is open and browser permission is
granted. The first poll establishes a baseline so old alerts do not create a
burst of popups. Alert history is kept for 30 days and remains after a rule is
deleted.

## Status

- **Warming up:** the worker is loading enough candle history to evaluate.
- **Active:** the worker recently evaluated the rule.
- **Stale:** no evaluation has been recorded for more than two minutes.
- **Off:** the rule is disabled.

If Hyperliquid temporarily limits the market-list request, the dashboard keeps
existing rules visible and retries automatically instead of failing the page.
