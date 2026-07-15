# Market scanner

The Market Scanner is an independent read-only worker subsystem that watches
Hyperliquid mainnet perpetual markets. It does not use the Whale Scanner's
trade collector or pause switch. Rules and alerts are private to the signed-in
user.

Worker-wide controls live only under **Settings → Workers**. Turning the Market
Scanner off or pausing it stops its subscriptions and processing without
deleting rules or alerts. **Pause my rules** skips only the signed-in user's
saved rules. None of these controls affect the Whale Scanner or bots.

`npm run dev` starts Trading and all four independent worker processes.
Use `npm run market-scanner:dev` only when running the scanner by itself. The
scanner remains separate from `npm run bot-worker:dev`, so it does not start
bots. An intentional Off or Paused setting survives a process restart. The
Whale Scanner can be paused or disabled without affecting market rules.

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
burst of popups. The shared browser alert setting is under **Settings → General
Settings**. Alert history is kept for 30 days and remains after a rule is deleted.

TradingView-style chart alerts are separate. They have their own rules, Alert
Log, and evaluation behavior; sharing the live trade feed does not change
Market Scanner rules or results.

## Status

- **Warming up:** the worker is loading enough candle history to evaluate.
- **Scanner off:** Market Scanner evaluation was intentionally turned off.
- **Paused:** this user's Market Scanner rules are not being evaluated.
- **Active:** the worker recently evaluated the rule.
- **Stale:** no evaluation has been recorded for more than two minutes.
- **Off:** the rule is disabled.

If Hyperliquid temporarily limits the market-list request, the dashboard keeps
existing rules visible and retries automatically instead of failing the page.
