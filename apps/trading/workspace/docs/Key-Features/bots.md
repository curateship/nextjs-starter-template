# Bots

## The run model — a bot is the automation running live

A bot is not a separate thing with its own settings. It is a **live run of an
automation**: the only choices it owns are the markets it runs on, the wallet,
and paper/live mode. Its strategy config is a **snapshot** of the automation's
server-compiled canvas, taken at deploy — and saving the canvas **never
touches a deployed run** (30 Jul 2026; auto-save previously restarted all
runners on every editor fiddle, 8,208 reboots in one day, and rate-limited
the exchange). Instead the run page shows an amber "settings changed" strip
when the automation has drifted ahead of the run, and the admin hands the
change over explicitly: **pause → Apply new settings → resume**
(`applyAutomationSettings` in `src/server/bots.ts`, strip:
`bot-settings-banner.tsx`; drift flag: `settingsBehind` on `getBotDetail`).
Apply refuses running bots outright, and the per-market state rows survive
the hand-off. Stopped runs keep their snapshot — they are history.

**Where you run it:** the automation editor's third tab — but only for
**deploying**. The Canvas · Backtest · **Bot** switcher's Bot mode is the
setup form (markets + wallet + mode + paper equity) with a live preview
chart in the center. When the automation already has a current (unnamed)
run, clicking Bot **navigates to that run's page** (`/bots/$botId`) instead
of swapping the editor — and a successful deploy navigates there too. The
live dashboard no longer renders inside the editor. State machine (setup
only): `src/components/automations/use-automation-bot.ts`; setup panel:
`automation-bot-side-panel.tsx`. Deploying is gated by the editor's save
gate, exactly like running a backtest.

**Run lifecycle (same save-override as backtests):** a deploy auto-names the
run `Previous run · {automation} · {markets}` and the **next deploy replaces
it** — the prior unnamed run is flattened, stopped, and deleted
(`deployAutomationBot` → `retireReplaceableAutomationBots`; a still-winding-
down run is deleted by a later deploy, never out from under its runners).
Saving happens on the run page: the header's **Save run** button (next to
Settings, only on the unnamed run) opens a naming modal (`renameUserBot`) —
finishing the run (closing any open position at market and stopping it,
which the modal's button says outright) and filing it under its name. Saved
runs are never auto-replaced; the editor's Bot tab then offers the setup
form for the next run. The backtest panel mirrors this: its **Save run**
button sits in the title row with Re-run/New run and opens the same style
of naming modal.

**SL/TP editing:** the setup preview chart draws the canvas's TP/SL levels
around the current mark price; dragging a line rewrites the matching canvas
node (same math as backtest tune-drags) and marks the graph dirty. For a
running bot, the canvas is still where settings are edited — but a save only
updates the automation; the run picks it up when the admin applies it from
the run page (see the run model above). The drag-on-the-live-chart
affordance for an open position went away with the in-editor live view.
There is no bot settings dialog and no separate order form — the canvas is
the config.

**Standalone surfaces:** `/bots` is the fleet control room
(`bot-runs-dashboard.tsx`): the worker offline and guardian-tripped banners
when real, and the run table — one row per run with sortable columns,
search, mode/status filters, a Position column, per-row
Pause/Resume/Start/Flatten/Stop/Delete actions, global Pause-all/Flatten-all
behind confirm dialogs, and the quiet "Guardian armed" toolbar chip
(`guardianTableStatus`). (A fleet totals strip above the table was built and
then removed at Tyler's request — no summary card.) Below the table sits the
**Activity feed** — the newest 100 `bot_events` across the fleet
(`listUserBotEvents`), each row opening its bot. Clicking a run opens
`/bots/$botId`, the four-panel run viewer (`bot-workspace.tsx`). Its header
carries the same centered **Canvas · Backtest · Bot** pills as the editor
(`ViewSwitcher` — Bot is this page; the other two navigate to the
automation's editor, with an "Open automation" fallback button below `xl`)
and a **Settings** button that opens the markets dialog. The right panel
follows the backtest side panel's anatomy: a "Bot · N markets" title row
with lifecycle **Pause/Resume/Flatten right-aligned inside it** (a kept run
still trades) and the per-market results table beneath. Run saving lives in
the header — the **Save run** button beside Settings (see Run lifecycle).
The bottom panel has an **Events** tab showing that run's own log. **Settings → markets** (`bot-markets-dialog.tsx`): adding a market
spawns a fresh runner with the run's current settings; removing one makes
the worker close that market's position at market and stop its runner
(`updateBotMarkets` → the supervisor's `update_params` path, which already
flattens removed markets) — the dialog warns loudly before removals that
close a position, and a stopped run just picks the new list up on its next
start. For DCA runs the live chart draws the ladder's pending buys as
**yellow dashed "waiting" lines labeled with the DOLLARS each rung will
buy** ("Waiting for rung 1 · $70" = a $70 buy waiting at that line's
level): an armed cycle uses its exact frozen-equity budgets, a confirmed
base that hasn't armed yet shows estimates ("~$70") or percent shares
(`bot-rung-lines.ts`, unit-tested; state read defensively from
`bot_state.strategy_state`). The page also remembers each run's last-viewed
market (`bot-run-market:{botId}` in localStorage, the panel-layout pattern)
so returning reopens the chart you were on. Strategy editing happens only on
the automation's canvas. There is still no create-bot dialog or edit-bot
sheet; deploying stays in the editor's Bot tab.

**Live positions** persist via the worker (`livePositionSnapshot` in
`worker/src/brokers/types.ts`, written by `persistState` in
`worker/src/bot-runner.ts`), so the Position column is real for live bots
too — with the caveats under Known limits.

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

- **A live bot's position is its wallet's position on that market.** The
  worker persists the exchange-refreshed position the bot manages (flatten
  closes exactly this), so manual trades on the same wallet and market blend
  into the shown figure, and two live bots sharing a wallet and market each
  report the same position. The run table's Position tooltip carries this
  note for live bots.
- **A paused live bot's stored position freezes** until it resumes — the
  evaluate loop that persists it isn't running. Pause/flatten/stop each force
  one final persist, so the freeze starts from an accurate snapshot.
- The run dashboard's equity curve and per-market drawdown derive from
  realized round-trip P&L (the bot stores no equity history), so intratrip
  drawdown is invisible.
- Replacing an unnamed run flattens its position via the worker's normal
  command path — with the worker offline, the retire commands queue like any
  other command.
