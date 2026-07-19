# Bots

## The run model — a bot is the automation running live

A bot is not a separate thing with its own settings. It is a **live run of an
automation**: the only choices it owns are the markets it runs on, the wallet,
and paper/live mode. Its strategy config is the automation's server-compiled
canvas, and it stays linked — saving the canvas pushes the fresh compiled
config to the automation's non-stopped bots and enqueues `update_params`
(`syncAutomationBots` in `src/server/bots.ts`, called from
`saveUserAutomation`; a save that doesn't change the compiled config is a
no-op). Stopped runs keep their snapshot — they are history.

**Where you run it:** the automation editor's third tab. The Canvas ·
Backtest · **Bot** switcher swaps the editor in place; Bot mode shows a
market selector (markets + wallet + mode + paper equity) for a new run, then
the live dashboard: summary rail (left), live chart (center, lifecycle
Pause/Resume/Flatten controls in the chart toolbar), per-market results table
(right), and the StrategyTester trades panel (bottom). State machine:
`src/components/automations/use-automation-bot.ts`; setup/results panel:
`automation-bot-side-panel.tsx`. Deploying is gated by the editor's save
gate, exactly like running a backtest.

**Run lifecycle (same save-override as backtests):** a deploy auto-names the
run `Previous run · {automation} · {markets}` and the **next deploy replaces
it** — the prior unnamed run is flattened, stopped, and deleted
(`deployAutomationBot` → `retireReplaceableAutomationBots`; a still-winding-
down run is deleted by a later deploy, never out from under its runners).
Typing a name into "Name this run to keep it" (`renameUserBot`) makes it a
keeper; keepers are never auto-replaced, and "Deploy a new run" then starts
the next one alongside.

**SL/TP editing:** dragging the TP/SL lines on the live chart rewrites the
matching canvas node (same math as backtest tune-drags), marks the graph
dirty, and Save pushes it to the bot. There is no bot settings dialog and no
separate order form — the canvas is the config.

**Standalone surfaces:** `/bots` is the run history (one row per run, like
`/backtest`); clicking a run opens `/bots/$botId`, the same four-panel
dashboard as a pure history-record viewer (`bot-workspace.tsx`) — the same
header anatomy as `/backtest/$groupId` (back · breadcrumbs · markets badge ·
panel toggles), with lifecycle Pause/Flatten in the chart toolbar since a
kept run still trades. It carries **no** Canvas/Backtest/Bot switcher —
strategy editing happens only on the automation's canvas. There is no fleet
page, create-bot dialog, or edit-bot sheet anymore.

## Command feedback (honest buttons)

Bot commands are queued for the worker, and the UI never pretends they
already happened:

- **In-flight badges.** While `desired_state` disagrees with `status`, the
  badge shows a spinner with "pausing…", "stopping…", "resuming…" or
  "starting…" instead of the stale status. The pure rules live in
  `src/components/bots/bot-status.ts` (unit-tested): an `error`/`killed`
  status always wins over a transient label, and a mismatch older than 30
  seconds falls back to the real status (the command likely failed or the
  worker is off). The server only pre-writes `starting` for start/resume;
  pause/flatten/stop leave `status` alone until the worker really did it.
- **Readable failures.** On `error`/`killed`, the `status_reason` shows as
  plain text next to the badge; command errors toast directly.
- **Worker offline.** The run dashboard shows the shared offline banner
  (`worker-offline-banner.tsx`) while the bot worker's heartbeat is stale.

## Bot guardian (automatic kill switch)

An account-level safety rule so an unattended bad day has a bounded cost.
Settings → Trading → "Bot guardian" holds the limits: a daily loss limit (in
dollars and/or percent of the day's starting value), a max drop from the
account's watched peak (percent), and the action — pause all bots (default)
or flatten (close positions at market, then pause; picking flatten requires
typing FLATTEN).

**How it decides.** The bot worker's snapshot poller already reads every
active wallet's account value once a minute; the guardian sums those
readings (all active exchange wallets, so manual positions count — they move
the same account value) and compares against the limits. The daily baseline
is the first reading of each UTC day; the peak only ratchets up. A limit
must stay crossed for **3 consecutive readings** (~3 minutes) before the
guardian acts — one bad mark price or a single spiky reading can never trip
it. A tick where any wallet's snapshot failed is skipped entirely, because a
missing wallet would fake a loss.

**What a trip does.** Exactly once per trip: enqueues the chosen global
command (each affected bot pauses with "Guardian tripped: …" as its status
reason and event), files one "Guardian tripped" bell alert, and latches the
tripped state in the `bot_guardian` table — so it survives worker restarts
and can never double-fire (the latch is an atomic `tripped_at is null`
update).

**After a trip.** Bots stay paused until resumed by hand, and the guardian
stays off until re-armed (the settings card). Re-arming resets the baselines
to the next reading, so a loss that already happened cannot instantly
re-trip it. Saving new limits also restarts the watch; it never clears a
trip.

Pure evaluation logic lives in `src/lib/trading/guardian.ts` (unit-tested);
persistence in `src/server/guardian.ts`; the worker loop in
`worker/src/guardian-monitor.ts`.

**Residual risk:** if the bot worker itself is down, the guardian is down
with it — that gap is covered by the worker-down watchdog (see
`workers.md`), which alerts urgently when the Bot Worker dies with live
positions open.

## Known limits

- **Live bots show no exposure.** Only the paper broker persists positions to
  `bot_state.paper_position`; the live broker reads its position from the
  exchange and stores null. If live-position persistence is ever added, the
  dashboards pick it up with no changes.
- The run dashboard's equity curve and per-market drawdown derive from
  realized round-trip P&L (the bot stores no equity history), so intratrip
  drawdown is invisible.
- Replacing an unnamed run flattens its position via the worker's normal
  command path — with the worker offline, the retire commands queue like any
  other command.
