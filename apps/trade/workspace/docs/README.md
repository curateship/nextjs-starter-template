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
- `running-tests-fast.md` — the focused-test rule, what the two full-suite
  commands include, and why only Tyler decides when either one runs.
- `database-link-encryption.md` — the TLS on the database connection: what the
  server presents, the exact connection-string suffix, why a bare
  `sslmode=require` refuses, and how to check every connection is encrypted.

## screens/ — what each screen shows

- `hiding-profit-and-loss.md` — the one switch in the header's settings cog
  that blurs every figure saying what you made or lost, what it deliberately
  leaves readable, and how it is remembered.
- `pinned-markets.md` — fixed member links, saved header pins, price refreshes,
  the five-market limit, narrow screens and the pending member-access decision.
- `daily-goal.md` — the daily goal: how the target is set as a percent of the
  wallets or a fixed amount, what the header button says, what counts as money
  made today, and how often the exchanges are asked.

- `market-explorer.md` — Markets across exchanges, live estimates, filters,
  standard table header, saved views, grouping, folder stars, discovery filters,
  pins, map, first-seen migration verification, audit coverage and the Moving now widget.
- `pnl-page.md` — the P&L page at `/pnl`: the whole Journal read-only, the
  month grid on the Toronto clock, the three period windows, the five pattern
  groupings, what the AI score sends to the model and how long it is kept.

- `dialog-button-wording.md` — Save changes for wallet edits, Create folder in
  both folder forms, and primary Done in folder management.
- `who-can-open-a-protocol-screen.md` — the protocol screens sit outside
  `/admin` so a member can open one, the address of each, why protocol rather
  than exchange, why there is one address rather than one per role, and what
  stays admin-only.
- `workspace.md` — the trading workspace: its panels, the Positions tab, Close
  all, Long/Short badge columns, and where the navigation lives.
- `trading-overview.md`: the signed-in home page and its Active trades menu,
  including matching tab widths, waiting-order distances, scrolling, loading and failed reads.
- `engine-settings.md` — the trading engine settings screen, 30-day outage history,
  engine errors, and the health notices it raises.
- `market-list.md` — the market list, compact three-column pinned picker,
  checkbox filters, search toolbar and the Manual orders panel.
- `panels-and-loading.md` — how panels behave, narrow screens, stand-in
  figures, empty states, loading, and live prices.
- `rules-everywhere.md` — the interaction rules that hold on every screen.
- `reading-the-figures.md` — the one green for money made, the one spelling for
  every number, the text scale, the small badge every table shares, and what an
  open position has cost in fees.
- `bottom-panel-tables.md` — pinned totals including projected profit and fees for visible Positions and Open orders,
  and the one frame shared by Positions, Open orders and
  the Journal, the safety rules its empty and failed rows keep, and the separate warnings
  for missing position stops and watched stops.
- `market-folders.md` — the folder dropdown visibility, full-width rows and scrolling; how Fav and named coin folders work on each exchange,
  how running flows follow them, and why backtests keep their starting list.
- `notices.md` — the bell notices: one per order with total dollars and weighted
  average price, how pushed fills and recovery avoid repeats, what a flow says when it stops or goes quiet on its own, and
  where clicking one takes you.
- `sounds.md` — the separate optional sounds for fills and stops, and for price
  alerts, what collapses a burst, when a browser stays silent, and the one
  non-sound switch that shares their Settings tab.
- `price-alerts.md` — one-use chart price lines, click-to-clear fired alerts, the Alerts panel, engine
  firing, notices, sounds, deletion, and the account cap.
- `browser-tab-titles.md` — how each Trade screen names its browser tab, and
  how chart tabs include their market and exchange.

## charts/ — the chart itself

- `drawing.md` — levels, trendlines and TradingView-style fib retracements, by mouse and by touch.
- `smart-tools.md` — grid stop links and alerts carried by drawn lines: Alert on for new lines,
  the remembered on/off choice, the cog, the alert
  window, every way into it without a mouse, naming a line, the bell and the
  dot on the chart, what fires it, the percentage past the line it waits for,
  whether it waits for a touch or a candle's close, the above-average volume
  the breaking candle has to carry, and the master switch that pauses the lot.
- `indicators.md` — the indicator list and how each one draws.
- `orders-on-the-chart.md` — dragging orders on the chart, buying more, selling
  part, leverage, the one rule for the money beside each grid line, and which
  chart line wins an overlap.
- `timezone.md` — the one clock the chart is on, where it is set, and why it is
  stored as a place rather than as an offset.
- `loading.md` — which candles arrive with a dashboard, when a chart asks on
  its own, and why later market choices wait briefly.
- `candle-store.md` — the one shelf of finished candles every chart and
  backtest reads: the two sources, the 30-day rule, the seam, first use, the
  refresh job, stock hours and the volume label.
- `opening-range-indicator.md` — what the opening range is, its volume filter
  and settings, and the rules for breaks, gaps and the session in progress.
- `ema-indicator.md` — the three EMA lines and the 50 / 200 crossover rule.

## orders/ — placing and protecting orders

- `smart-orders.md` — why a smart order sends nothing until the price is
  reached, what watching costs when a market moves fast, how often the engine
  looks, how repeated failures are counted, how a DCA ladder sells back up its
  mirrored exits, how one extra gap moves those exits together, and what a
  backtest does differently.
- `smart-order-windows.md` — percentage stops below the last DCA rung, combined stop-loss dollars and chart dragging, the separate Rung 1 exit % for market buys and
  the windows a smart order is placed from: the
  floating frame, synchronized DCA entry and exit dragging, the draggable
  ladder summary, red DCA exit lines and labels, the DCA exit choices and draggable exit gap, the base stop,
  and the grid window.
- `rules-before-an-entry.md` — the three rules Tyler sets for himself before a
  real-money Long, Short, DCA or Grid, the one warning window that names what
  is unmet and asks him to confirm or go back, and the "Overrode" note the
  Journal keeps.
- `grid-orders.md` — the wait message when replacing a grid during cancellation; drawing-alert stop losses with red chart lines and labels, linked-line protection and engine rollout requirements; how a grid recycles, whether it buys the dips or sells the
  rallies, where its range sits, how the money is split between levels, what a
  sell is worth, and what following price up and down does.
- `grid-rung-gap.md` — typing the percent gap between rungs instead of a
  count, how the range decides how many fit, and what is saved.
- `grid-above-ladder.md` — the one allowed pairing of two smart orders on a
  coin: a grid working a range above a DCA ladder, the grid's own fixed-size
  stop, and every reason the pairing is refused.
- `watched-orders.md` — how a plain order works now, why dragging cannot revive
  a confirmed order's temporary sending line, why
  adding to a position uses a market order with visible submission progress,
  and how watched limits allow immediate fills without exceeding the chosen
  price, including moving paused watches that have not submitted an order.
- `orders-you-cannot-afford.md` — why an order placed by hand is refused when
  the wallet does not hold the margin, which orders that applies to, and how a
  fill smaller than the ask says so.
- `position-protection.md` — the stop and target riding on an open position:
  how a position ends up carrying spares, why replacing one takes every leg
  off, how a stop you move by hand is written onto the smart order working that
  coin, how replacement prices stay on the market's legal steps, and how a fast
  entry avoids a stale missing-position answer.
- `take-profit-levels.md` — up to three Exit targets per position, including
  exits at a loss, their messages, and safe replacement, readback and fills.
- `part-close.md` — selling some of a position instead of all of it: why a part
  is chased as a maker where all of it is not, safe retries after a refused
  waiting price, progress notices, and what happens to the stop on the rest.
- `stopping-flow-ladders.md` — how Stop finds every ladder a flow owns, cancels
  real exchange orders, blocks a coin hunt already in flight, and reports a
  coin the exchange would not cancel.
- `rate-limits.md` — the separate signed-in caps for orders and cancellations,
  the measured twenty-position bulk actions, and why worker orders do not use
  them.

## wallets/ — money and margin

- `wallet-reads.md` — which wallets get asked for figures, how often, and what
  a failed answer does to the details window, plus the saved position mode in wallet details.
- `flatten-wallet.md` — Empty wallet: why the waiting orders come off before
  anything is sold, what a refused cancel stops, and how it differs from Close
  all.
- `position-margin.md` — changing leverage and the cash behind an open
  position: what each exchange allows, when taking margin out is refused, and
  why the liquidation figure on the window is an estimate.
- `stuck-wallet-warning.md` — when a wallet turn is called stuck, what the
  Workers screen says, and why the engine does not cancel the turn.
- `liquidation-warning.md` — each wallet's distances, the account fallback,
  the saved wallet display, how distance is measured, and why one crossing
  sends one notice.

## protocols/ — the venues

Protocol, not exchange: Hyperliquid, Phemex, KuCoin, Aster and Lighter are
exchanges, Solana and BNB Chain are chains, and protocol is the word that is
true of all of them. It is what the ids, the tables and the addresses have
always used.

- `bnb-chain.md` explains BNB Chain wallets, pool-based markets, search, risk
  labels, ten-second screen prices, pool and borrowed charts, request limits
  provider-refusal handling, wallet holdings, fee reserves and balance checks.
  KyberSwap quotes, approvals, receipt recovery and transaction-storage migration
  requirements are covered with the testing roadmap.
  BNB refusal wording covers provider codes, fee certainty, pending and replaced
  transactions, secret-text removal and controlled failure checks.
  Recovery includes saved approval fees and keeps wallet validation errors separate.

- `protocol-layer.md` — where the exchange lives in the code, one door per
  venue, and which venues push fills.
- `connector-helpers.md` — the shared order, cache, public socket and private
  order-line rules, including the five-second idle wait and 30-second trust
  window.
- `hyperliquid-rate-limits.md` — the cap Hyperliquid puts on requests and how
  this app stays under it.
- `hyperliquid-refusals.md` — the Hyperliquid refusal phrases seen in the
  Journal and the next step Trade gives each one.
- `aster.md` — Aster's public markets, charts, funding, networks, measured
  catalogue size and the figures its public API does not state.
- `dukascopy.md` — the stock, index, metal and currency-pair history feed:
  instrument naming, start dates, bid prices, hours, volume, request pacing
  and the measured numbers from the build.
- `lighter.md` — Lighter's markets, charts and hourly funding: why 18 listed
  markets are left out, how far its three prices ran from the other four
  venues, what a minute of reading costs against its sixty-a-minute cap, why
  the account is pushed down a socket rather than polled, how leverage is
  stated, and why it is mainnet only.
- `phemex-refusals.md` — Phemex refusal codes in plain words, with the action
  each one asks for.
- `kucoin.md` — which KuCoin stop rows count as open, the refusal codes seen
  locally, the published order families Trade translates, and counting each
  closed position's money once across split fills.
- `solana.md` — Solana as a network the app holds a wallet on: why it is spot
  only, what the node and Jupiter each do, the three `.env` settings, why
  there is no practice network, the wallet rule, what a wallet holds, buying
  and selling as swaps through Jupiter with the slippage cap and the
  refusals, how fills are read off the chain, the market list and its
  measured counts, the lookup for a coin outside the list, and the
  sixty-a-minute budget.

## backtests/

- `backtest-screens.md` — the results, candle history and funding screens,
  plus multi-size backtest starts, elapsed time in the sortable Took column, skipped and failed coin reasons,
  and the run header links to those reasons.
- `backtest-speed.md`: the one-pass base and cascade scans, one-statement saved-run
  actions, bounded coin preparation, cached per-candle work and the time and
  memory saved with a run.
- `market-selection.md` — how the Markets step picks the coins from one list,
  and where each coin's prices come from.
- `minute-zoom.md` — how a backtest reads a candle, and why saved results from
  before 18 Aug 2026 are too kind, plus opening-gap fills and uncertain
  stop-versus-target order inside each minute.
- `dca-rules-vs-old-app.md` — the DCA rules here beside the ones in the old
  trading app, line by line.

## automations/

- `grid-step.md` explains how the Grid recipe step reads the 4-hour EMA, places
  and flips an ordinary grid, shares candle reads with Signals, and stops
  safely.

## recipes/

- `dashboard.md` explains the admin Recipes table and canvas, what Backtest and
  Switch on run, the live-run deletion rule, and how saved Trade drawings move
  out of Automations.

## engine/ — the server side

- `in-memory-retention.md` — expiry of account and portfolio reads, the shared
  5,000-entry timestamp cap, replacement safety and the heap-check road map.

- `one-writer-at-a-time.md` — the shared wallet lock for plan edits, bounded
  waits, nested actions, exchange refusals, and PostgreSQL concurrency tests.

- `dashboard-speed.md` — what one database trip costs, what the opening answer
  carries, how market lists are shared for a minute, and what the four-second
  poll still asks for.
- `one-wait-per-click.md` — the rules the action paths follow so a click pays
  one wait, not a parade of database trips: reads that go out together, the
  journal behind the answer, the two-second real-money memory, and what
  stayed slow on purpose.
- `deploying-all-three.md` — `npm run deploy`, which rebuilds engine, worker
  and web in that order; the old server at 5.78.189.158 that kept taking the
  trading lock during engine restarts in September 2026; and why the engine
  leaves a grid with no direction or with unknown fields alone.
- `worker-restart.md` — the Restart button on the Workers screen: how the
  engine sees the request, why a pass in flight finishes first, and who does
  the starting.
  Also the rule that in production only the engine trades, and why a
  saved plan a build does not understand is left alone.
- `worker-image.md` — page-registry build checks, why local worker builds keep source maps, why those maps
  contain no server source, and which files enter the running image.
- `data-retention.md` — which trading rows are permanent records and which
  exchange caches the capped ten-year sweep may rebuild.

## Adding a doc

One file per subject, named after the subject, in the folder for the part of
the app it describes, plus its line above in the same turn as the code. Write
it the way `.agents/skills/unslop/SKILL.md` says. A rule Tyler stated out loud
goes into `rules/trading-rules.md`, in his words.
