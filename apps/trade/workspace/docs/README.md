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
- `opening-range-indicator.md` — what the opening range is, its settings, and
  the rules it follows about breaks, gaps and the session in progress.
- `smart-orders-never-rest.md` — why a smart order sends nothing until the price
  is reached, and what a backtest does differently.
- `grid-orders.md` — how a grid recycles, where its range sits, how the money is
  split between levels, and what following price up does.
- `watched-orders.md` — how a plain order works now, and what dragging does.
- `wallet-reads.md` — which wallets get asked for figures, how often, and what a
  failed answer does to the card.
- `dca-rules-vs-old-app.md` — the DCA rules here beside the ones in the old
  trading app, line by line.
- `hyperliquid-rate-limits.md` — the cap Hyperliquid puts on requests and how
  this app stays under it.
- `backtest-market-selection.md` — how the Markets step picks the exchange and
  the coins.
- `backtest-minute-zoom.md` — how a backtest reads a candle, and why saved
  results from before 18 Aug 2026 are too kind.

## Adding a doc

One file per subject, named after the subject, plus its line above in the same
turn as the code. Write it the way `.agents/skills/unslop/SKILL.md` says. A rule
Tyler stated out loud goes into `trading-rules.md`, in his words.
