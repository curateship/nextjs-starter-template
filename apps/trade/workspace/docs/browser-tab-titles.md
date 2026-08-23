# Browser tab titles

Every Trade screen names its browser tab and keeps the saved app name at the
end. The trading overview, backtests list, one backtest, flow-runs list and one
flow run each have a different title. The four exchange workspaces use Aster,
Hyperliquid, KuCoin and Phemex, so several open charts do not look alike in the
tab bar.

When a chart address includes a market, the title starts with that market and
its exchange, such as `BTC · Hyperliquid · Trade`. Changing the market changes
the title. A bare or invalid market address uses the screen name instead.

The titles belong to the app's route files. The shell's title list and its
fallback stay untouched.
