# Trade docs

This folder belongs to the Trade app. Nothing in it comes from Custom Shell, so
nothing in it ever conflicts when the shell is merged in. Everything true of
every app built on the shell is in the repo's `docs/shell/` instead.

Every doc sits in a folder, one folder per part of the app, and only this
README sits at the top. One file outranks the rest, and outranks the code:
`rules/trading-rules.md`, the rules of this app in plain words. When the code
and that file disagree, the code is the thing that is wrong. The screen docs in
`screens/`, `charts/` and `orders/` carry the same weight for what is drawn on
screen: anything not written there has not been agreed yet.

## rules/ — the rules that outrank the code

- `trading-rules.md` — the rules of this app in plain words.
- `instant-first.md` — the rule that everything answers on screen instantly
  from what the app already knows, with the server catching up behind it. It
  binds all current and future work in this app.

## app/ — the app as a whole

- `architecture-overview.md` — how Trade is put together on top of the shell.
- `running-tests-fast.md` — `npm run test:app`, the everyday test command: what
  it skips, how the saved database copy works, and when the full suite still
  runs.

## screens/ — what each screen shows

- `workspace.md` — the trading workspace: its panels, the Positions tab, Close
  all, and where the navigation lives.
- `trading-overview.md` — the signed-in home page.
- `engine-settings.md` — the trading engine settings screen and the health
  notices it raises.
- `market-list.md` — the market list and the Watched row.
- `panels-and-loading.md` — how panels behave, narrow screens, stand-in
  figures, empty states, loading, and live prices.
- `rules-everywhere.md` — the interaction rules that hold on every screen.
- `reading-the-figures.md` — the one green for money made, the one spelling for
  every number, the text scale, the small badge every table shares, and what an
  open position has cost in fees.
- `bottom-panel-tables.md` — the one frame shared by Positions, Open orders and
  the Journal, and the safety rules its empty and failed rows keep.
- `market-folders.md` — how Fav and named coin folders work on each exchange,
  how running flows follow them, and why backtests keep their starting list.
- `notices.md` — the bell notices: one per fill, a second when a stop or target
  fires, what a flow says when it stops or goes quiet on its own, and where
  clicking one takes you.
- `sounds.md` — the optional sounds for fills and stops, what collapses a
  burst, and when a browser stays silent.
- `browser-tab-titles.md` — how each Trade screen names its browser tab, and
  how chart tabs include their market and exchange.

## charts/ — the chart itself

- `drawing.md` — the paint tools, by mouse and by touch.
- `indicators.md` — the indicator list and how each one draws.
- `orders-on-the-chart.md` — dragging orders on the chart, buying more, selling
  part, leverage, and which chart line wins an overlap.
- `timezone.md` — the one clock the chart is on, where it is set, and why it is
  stored as a place rather than as an offset.
- `loading.md` — which candles arrive with a dashboard, when a chart asks on
  its own, and why later market choices wait briefly.
- `opening-range-indicator.md` — what the opening range is, its settings, and
  the rules it follows about breaks, gaps and the session in progress.
- `ema-indicator.md` — the three EMA lines and the 50 / 200 crossover rule.

## orders/ — placing and protecting orders

- `smart-orders.md` — why a smart order sends nothing until the price is
  reached, what watching costs when a market moves fast, how often the engine
  looks, how repeated failures are counted, and what a backtest does
  differently.
- `smart-order-windows.md` — the windows a smart order is placed from: the
  floating frame, the base stop, and the grid window.
- `grid-orders.md` — how a grid recycles, whether it buys the dips or sells the
  rallies, where its range sits, how the money is split between levels, what a
  sell is worth, and what following price up and down does.
- `grid-above-ladder.md` — the one allowed pairing of two smart orders on a
  coin: a grid working a range above a DCA ladder, the grid's own fixed-size
  stop, and every reason the pairing is refused.
- `watched-orders.md` — how a plain order works now, and what dragging does.
- `position-protection.md` — the stop and target riding on an open position:
  how a position ends up carrying spares, why replacing one takes every leg
  off, and how replacement prices stay on the market's legal steps.
- `take-profit-levels.md` — how one position banks profit at up to three fixed
  prices, and how the app replaces, reads and fills those targets safely.
- `part-close.md` — selling some of a position instead of all of it: why a part
  is chased as a maker where all of it is not, what the window asks, and what
  happens to the stop on the rest.
- `stopping-flow-ladders.md` — how Stop finds every ladder a flow owns, cancels
  real exchange orders, blocks a coin hunt already in flight, and reports a
  coin the exchange would not cancel.
- `rate-limits.md` — the separate signed-in caps for orders and cancellations,
  the measured twenty-position bulk actions, and why worker orders do not use
  them.

## wallets/ — money and margin

- `wallet-reads.md` — which wallets get asked for figures, how often, and what
  a failed answer does to the details window.
- `flatten-wallet.md` — Empty wallet: why the waiting orders come off before
  anything is sold, what a refused cancel stops, and how it differs from Close
  all.
- `position-margin.md` — changing leverage and the cash behind an open
  position: what each exchange allows, when taking margin out is refused, and
  why the liquidation figure on the window is an estimate.
- `stuck-wallet-warning.md` — when a wallet turn is called stuck, what the
  Workers screen says, and why the engine does not cancel the turn.
- `liquidation-warning.md` — where the warning is set, how distance is
  measured, and why one crossing sends one notice.

## exchanges/ — the venues

- `protocol-layer.md` — where the exchange lives in the code, one door per
  venue.
- `hyperliquid-rate-limits.md` — the cap Hyperliquid puts on requests and how
  this app stays under it.
- `hyperliquid-refusals.md` — the Hyperliquid refusal phrases seen in the
  Journal and the next step Trade gives each one.
- `aster.md` — Aster's public markets, charts, funding, networks, measured
  catalogue size and the figures its public API does not state.
- `lighter.md` — Lighter's markets, charts and hourly funding: why 18 listed
  markets are left out, how far its three prices ran from the other four
  venues, what a minute of reading costs against its sixty-a-minute cap, why
  the account is pushed down a socket rather than polled, how leverage is
  stated, and why it is mainnet only.
- `phemex-refusals.md` — Phemex refusal codes in plain words, with the action
  each one asks for.
- `kucoin.md` — which KuCoin stop rows count as open, the refusal codes seen
  locally and the published order families Trade translates.

## backtests/

- `backtest-screens.md` — the results, candle history and funding screens.
- `backtest-speed.md`: the one-pass base scan, one-statement saved-run
  actions, bounded coin preparation and the time and memory saved with a run.
- `market-selection.md` — how the Markets step picks the exchange and the
  coins.
- `minute-zoom.md` — how a backtest reads a candle, and why saved results from
  before 18 Aug 2026 are too kind.
- `dca-rules-vs-old-app.md` — the DCA rules here beside the ones in the old
  trading app, line by line.

## engine/ — the server side

- `dashboard-speed.md` — what one database trip costs, what the opening answer
  carries, how market lists are shared for a minute, and what the four-second
  poll still asks for.
- `worker-restart.md` — the Restart button on the Workers screen: how the
  engine sees the request, why a pass in flight finishes first, and who does
  the starting.
- `worker-image.md` — why local worker builds keep source maps, why those maps
  contain no server source, and which files enter the running image.
- `data-retention.md` — which trading rows are permanent records and which
  exchange caches the capped ten-year sweep may rebuild.

## Adding a doc

One file per subject, named after the subject, in the folder for the part of
the app it describes, plus its line above in the same turn as the code. Write
it the way `.agents/skills/unslop/SKILL.md` says. A rule Tyler stated out loud
goes into `rules/trading-rules.md`, in his words.
