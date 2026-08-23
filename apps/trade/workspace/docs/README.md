# Trade docs

This folder belongs to the Trade app. Nothing in it comes from Custom Shell, so
nothing in it ever conflicts when the shell is merged in. Everything true of
every app built on the shell is in the repo's `docs/shell/` instead.

Two files outrank the rest, and outrank the code:

- `trading-rules.md` — the rules of this app in plain words. When the code and
  this file disagree, the code is the thing that is wrong.
- `ui-ux.md` — what the screens look like and how they behave. Anything not
  written there has not been agreed yet.

## The rest

- `architecture-overview.md` — how Trade is put together on top of the shell.
- `reading-the-figures.md` — the one green for money made, the one spelling for
  every number, the text scale, and the small badge every table shares.
- `chart-timezone.md` — the one clock the chart is on, where it is set, and why
  it is stored as a place rather than as an offset.
- `chart-loading.md` — when the first candle request leaves, and why later
  market choices still wait briefly.
- `opening-range-indicator.md` — what the opening range is, its settings, and
  the rules it follows about breaks, gaps and the session in progress.
- `ema-indicator.md` — the three EMA lines and the 50 / 200 crossover rule.
- `smart-orders-never-rest.md` — why a smart order sends nothing until the price
  is reached, what watching costs when a market moves fast, how often the engine
  looks, and what a backtest does differently.
- `grid-orders.md` — how a grid recycles, where its range sits, how the money is
  split between levels, what a sell is worth, and what following price up does.
- `watched-orders.md` — how a plain order works now, and what dragging does.
- `wallet-reads.md` — which wallets get asked for figures, how often, and what a
  failed answer does to the card.
- `liquidation-warning.md` — where the warning is set, how distance is measured,
  and why one crossing sends one notice.
- `dca-rules-vs-old-app.md` — the DCA rules here beside the ones in the old
  trading app, line by line.
- `hyperliquid-rate-limits.md` — the cap Hyperliquid puts on requests and how
  this app stays under it.
- `aster.md` explains Aster's public markets, charts, funding, networks,
  measured catalogue size and the figures its public API does not state.
- `backtest-market-selection.md` — how the Markets step picks the exchange and
  the coins.
- `backtest-minute-zoom.md` — how a backtest reads a candle, and why saved
  results from before 18 Aug 2026 are too kind.
- `dashboard-speed.md` — what one database trip costs, why the page opens with
  one server call, what the four-second poll does now, and why the Journal
  and the smart orders only travel when they changed.
- `browser-tab-titles.md` — how each Trade screen names its browser tab, and
  how chart tabs include their market and exchange.
- `market-folders.md` — how Fav and named coin folders work on each exchange,
  and when flows and backtests read them.

## Adding a doc

One file per subject, named after the subject, plus its line above in the same
turn as the code. Write it the way `.agents/skills/unslop/SKILL.md` says. A rule
Tyler stated out loud goes into `trading-rules.md`, in his words.
