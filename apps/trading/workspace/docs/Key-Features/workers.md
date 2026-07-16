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

Backtest requests only validate and enqueue work. The Backtest worker uses a
locked database claim so replicas cannot run the same row. Interrupted rows are
requeued on the next leader start and become a clear error after three failed
attempts.
