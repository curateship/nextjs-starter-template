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

- `instant-first.md` — the rule that everything answers on screen instantly
  from what the app already knows, with the server catching up behind it. It
  binds all current and future work in this app.
- `architecture-overview.md` — how Trade is put together on top of the shell.
- `reading-the-figures.md` — the one green for money made, the one spelling for
  every number, the text scale, the small badge every table shares, and what an
  open position has cost in fees.
- `chart-timezone.md` — the one clock the chart is on, where it is set, and why
  it is stored as a place rather than as an offset.
- `chart-loading.md` explains which candles arrive with a dashboard, when a
  chart asks on its own, and why later market choices wait briefly.
- `opening-range-indicator.md` — what the opening range is, its settings, and
  the rules it follows about breaks, gaps and the session in progress.
- `ema-indicator.md` — the three EMA lines and the 50 / 200 crossover rule.
- `smart-orders-never-rest.md` — why a smart order sends nothing until the price
  is reached, what watching costs when a market moves fast, how often the engine
  looks, and what a backtest does differently.
- `stopping-flow-ladders.md` — how Stop finds every ladder a flow owns, cancels
  real exchange orders, blocks a coin hunt already in flight, and reports a
  coin the exchange would not cancel.
- `grid-orders.md` — how a grid recycles, whether it buys the dips or sells the
  rallies, where its range sits, how the money is split between levels, what a
  sell is worth, and what following price up and down does.
- `grid-above-ladder.md` — the one allowed pairing of two smart orders on a
  coin: a grid working a range above a DCA ladder, the grid's own fixed-size
  stop, and every reason the pairing is refused.
- `watched-orders.md` — how a plain order works now, and what dragging does.
- `position-protection.md` — the stop and target riding on an open position: how
  a position ends up carrying spares, why replacing one takes every leg off, and
  how replacement prices stay on the market's legal steps.
- `take-profit-levels.md` — how one position banks profit at up to three fixed
  prices, and how the app replaces, reads and fills those targets safely.
- `part-close.md` — selling some of a position instead of all of it: why a part
  is chased as a maker where all of it is not, what the window asks, and what
  happens to the stop on the rest.
- `flatten-wallet.md` — Empty wallet: why the waiting orders come off before
  anything is sold, what a refused cancel stops, and how it differs from
  Close all.
- `position-margin.md` — changing leverage and the cash behind an open
  position: what each exchange allows, when taking margin out is refused, and
  why the liquidation figure on the window is an estimate.
- `wallet-reads.md` — which wallets get asked for figures, how often, and what a
  failed answer does to the details window.
- `worker-restart.md` — the Restart button on the Workers screen: how the
  engine sees the request, why a pass in flight finishes first, and who does
  the starting.
- `worker-image.md` explains why local worker builds keep source maps, why
  those maps contain no server source, and which files enter the running image.
- `liquidation-warning.md` — where the warning is set, how distance is measured,
  and why one crossing sends one notice.
- `trade-notices.md` — the bell notices: one per fill, a second when a stop or
  target fires, what a flow says when it stops or goes quiet on its own, and
  where clicking one takes you.
- `trade-sounds.md` — the optional sounds for fills and stops, what collapses a
  burst, and when a browser stays silent.
- `dca-rules-vs-old-app.md` — the DCA rules here beside the ones in the old
  trading app, line by line.
- `hyperliquid-rate-limits.md` — the cap Hyperliquid puts on requests and how
  this app stays under it.
- `aster.md` explains Aster's public markets, charts, funding, networks,
  measured catalogue size and the figures its public API does not state.
- `lighter.md` — Lighter's markets, charts and hourly funding: why 18 listed
  markets are left out, how far its three prices ran from the other four
  venues, what a minute of reading costs against its sixty-a-minute cap, why
  the account is pushed down a socket rather than polled, how leverage is
  stated, and why it is mainnet only.
- `backtest-market-selection.md` — how the Markets step picks the exchange and
  the coins.
- `backtest-minute-zoom.md` — how a backtest reads a candle, and why saved
  results from before 18 Aug 2026 are too kind.
- `dashboard-speed.md` explains what one database trip costs, what the opening
  answer carries, how market lists are shared for a minute, and what the
  four-second poll still asks for.
- `browser-tab-titles.md` — how each Trade screen names its browser tab, and
  how chart tabs include their market and exchange.
- `running-tests-fast.md` — `npm run test:app`, the everyday test command: what
  it skips, how the saved database copy works, and when the full suite still
  runs.
- `market-folders.md` — how Fav and named coin folders work on each exchange,
  how running flows follow them, and why backtests keep their starting list.
- `bottom-panel-tables.md` — the one frame shared by Positions, Open orders and
  the Journal, and the safety rules its empty and failed rows keep.
- `hyperliquid.md` — the Hyperliquid refusal phrases seen in the Journal and
  the next step Trade gives each one.
- `phemex.md` — Phemex refusal codes in plain words, with the action each one
  asks for.
- `kucoin.md` — which KuCoin stop rows count as open, the refusal codes seen
  locally and the published order families Trade translates.

## Adding a doc

One file per subject, named after the subject, plus its line above in the same
turn as the code. Write it the way `.agents/skills/unslop/SKILL.md` says. A rule
Tyler stated out loud goes into `trading-rules.md`, in his words.
