# Browser tab titles

Every Trade screen names its browser tab and keeps the saved app name at the
end. The Trade dashboard is named after the market on its chart. The Bots
dashboard says Bots, and an opened backtest or bot names the coin on its chart,
such as `BTC · Hyperliquid · Trade`. The four exchange workspaces use Aster,
Hyperliquid, KuCoin and Phemex, so several open charts do not look alike in the
tab bar.

When a chart address includes a market, the title starts with that market and
its exchange, such as `BTC · Hyperliquid · Trade`. Changing the market changes
the title. A bare or invalid market address uses the screen name instead.

A Solana market is named by its mint address rather than a ticker, because
two coins there can share a ticker. The tab shortens it, `CbyTNf…pump ·
Solana · Trade`, instead of spending 44 characters saying nothing. The page
itself still shows the real ticker, which it has the market row for.

The titles belong to the app's route files. The shell's title list and its
fallback stay untouched.
