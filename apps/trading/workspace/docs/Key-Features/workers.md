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
