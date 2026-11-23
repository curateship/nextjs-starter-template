# Background workers

Trading keeps long-running work outside the web app. Each responsibility has
one worker process and one database leader lock, so a second copy waits instead
of processing the same work twice.

- **Bot Worker** runs live and paper bots. Whale Wall bots read their own order
  books and do not depend on either scanner. It also records trading
  notifications in the background, so opening a page does not trigger exchange
  requests. Notification recording continues while bot workloads are paused.
- **Whale Scanner** collects whale trades, wallets, positions, book metrics,
  and research alerts from mainnet.
- **Market Scanner** evaluates saved Market Scanner rules from its own market
  feed.
- **Alert Worker** evaluates Trade alert rules from a separate live market
  feed and recovers exact-price crossings missed during a restart.
- **Backtest Worker** claims queued historical runs one at a time, records
  progress, and retries work interrupted by a process restart.

The standard `npm run dev` command starts the app and all five workers and stops
them together. Run one process for focused work with:

```bash
npm run bot-worker:dev
npm run whale-scanner:dev
npm run market-scanner:dev
npm run alert-worker:dev
npm run backtest-worker:dev
```

Production builds and starts use the matching `:build` and `:start` commands.
`npm run workers:build` builds all workers.

## Controls and status

All worker-wide controls live under **Settings → Workers**. Off and Paused stop
the workload but leave the process heartbeat online so it can be resumed from
Settings. Individual bot actions, Market Scanner rule switches, and Backtest
run pages remain on their feature pages.

The page shows online state, leader or standby role, heartbeat, uptime, current
activity, workload counts, and safe error summaries. It never returns keys,
secrets, private network details, or order payloads.

## Liquidation-risk alerts

The Bot Worker's snapshot poller already fetches every active wallet's account
state from the exchange once a minute (that data feeds the equity curves).
The same fresh data now powers a liquidation warning: if any position's
distance to its forced-liquidation price drops to the threshold saved in
**Settings → Trading → Liquidation warning** (percent of current price,
0 = off, default 10%), the poller files a "close to liquidation" notice in
the notification bell.

The same once-a-minute readings also drive the **bot guardian** — the
account-level automatic kill switch that pauses (or flattens) all bots when
a saved daily-loss or drawdown limit stays crossed for three consecutive
readings. Its rules and behavior are documented in `bots.md`; if the Bot
Worker is down, the guardian is down too, which is exactly the gap the
worker-down watchdog below covers.

A position hovering at the threshold alerts at most once every 30 minutes.
The database also dedupes by a time-bucketed event key, so a worker restart
cannot double-alert inside the same window. The distance itself is visible in
two places without waiting for an alert: the trade workspace's positions
table has a color-graded "Liq. distance" column, and the Wallets page has a
"Margin health" card showing each wallet's margin usage, withdrawable
balance, and its riskiest position's distance. Positions the exchange reports
with no liquidation price (and flat wallets) show an em-dash instead of a
made-up number.

## Worker-down watchdog

Every worker also keeps an eye on the other four. Once a minute-ish (every 30
seconds by default), each leader worker checks the others' heartbeats. If a
worker's heartbeat is older than three times its beat rate (with a one-minute
floor) while its Settings switch says it should be running, the survivor files
one alert in the notification bell: **"URGENT: Bot Worker is down with live
positions open"** when the dead worker is the Bot Worker and the account still
has open live positions or working live orders, or a calmer "worker is down"
notice otherwise. Workers turned Off or Paused in Settings never count as dead.

Each outage produces exactly one alert no matter how many workers spot it or
how long it lasts (the alert is keyed to the moment the heartbeat stopped).
When the heartbeat comes back, one "back online" notice follows — the Bot
Worker already rechecks its bots and orders against the exchange on startup,
so recovery needs no extra cleanup. The first sweep waits one staleness window
after a worker boots so a cold start of the whole stack does not misread
last session's old heartbeats.

Settings → Workers shows each worker's own "Watchdog check" time and the
"Last incident" a watchdog ever filed against it (ongoing or recovered).
Thresholds are tunable with the `WORKER_WATCHDOG_INTERVAL_MS`,
`WORKER_WATCHDOG_STALE_MULTIPLIER`, and `WORKER_WATCHDOG_MIN_STALE_MS`
environment variables.

**Residual risk:** the watchdog is mutual, so it goes silent if every worker
dies at once (for example the whole machine goes down). Catching that needs an
external uptime ping from outside the box — deliberately out of scope here.

Backtest requests only validate and enqueue work. The Backtest worker uses a
locked database claim so replicas cannot run the same row. Interrupted rows are
requeued on the next leader start and become a clear error after three failed
attempts.

## A failed basket leader no longer strands its markets (July 29, 2026)

A shared-wallet basket (DCA, and legacy QFL rows) runs every market on one
account, so only ONE row is claimable — the group leader, the row whose `id`
equals its `group_id`. The leader then pulls its siblings in and replays them
together.

That left a hole. If the leader row reached `error`, nothing could ever claim its
siblings, because they are not `id = group_id`. It happened for real: a 401-market
basket was led by HYPE, which Binance does not list, so its history load failed
within a second. The worker then restarted, the restart recovery put the other
markets back to `pending`, and **399 rows sat unclaimable forever** while the
worker reported "Waiting for queued backtests".

A sibling may now take over, under two conditions that both matter:

- **The leader must have FAILED**, not merely stopped being pending. While it is
  `running` it legitimately owns the basket, and letting a sibling in would replay
  the same basket a second time on a second wallet.
- **No sibling may be `running` or `done`.** `running` is the duplicate guard the
  old leader-only rule gave for free. `done` is the important one:
  `runPortfolioGroup` marks markets finished **one at a time in a loop**, so a
  worker killed mid-loop leaves some `done` and the rest back at `pending`.
  Promoting there would replay only the leftovers on a fresh FULL wallet while the
  finished markets were computed sharing it — every leftover's numbers would be
  inflated and saved as if real.

**So a partially finished basket still strands, on purpose.** A visibly stuck run
is recoverable; silently wrong shared-wallet numbers are not. Re-run the group.

Residual risk: two drainers opening the claim transaction at the same instant
cannot see each other's uncommitted work, so the guard is not airtight against
true simultaneity. It holds for the sequential drain this queue does, and the
worker takes a leadership lock so only one drainer runs.

Three tests in `backtest-worker.test.ts`: a failed leader hands over and the
promoted market then holds the group alone; a running leader hands over to nobody;
and a basket with any finished market hands over to nobody.

**Editing worker files restarts the worker and kills any backtest mid-flight.**
That is how the 401-market run above died. Do not save worker code while a run is
going.
