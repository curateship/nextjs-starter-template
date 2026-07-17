# Bots

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
stays off until re-armed from the bots-page banner (or the settings card).
Re-arming resets the baselines to the next reading, so a loss that already
happened cannot instantly re-trip it. Saving new limits also restarts the
watch; it never clears a trip.

While watching, a quiet "Guardian armed" status chip sits in the Bots
table's toolbar next to the title; after a trip the page shows a red banner
with the trip reason and a "Re-arm guardian" button.
Pure evaluation logic lives in `src/lib/trading/guardian.ts` (unit-tested);
persistence in `src/server/guardian.ts`; the worker loop in
`worker/src/guardian-monitor.ts`.

**Residual risk:** if the bot worker itself is down, the guardian is down
with it — that gap is covered by the worker-down watchdog (see
`workers.md`), which alerts urgently when the Bot Worker dies with live
positions open.

## Fleet overview strip

The bots page (`/bots`) shows a summary strip above the table — one card per mode (live first, then paper; the two are never blended into one number):

- **Bots** — running / paused / total counts. "Starting" counts as running.
- **P&L today** — realized profit for the current UTC day, summed from each bot's per-market `bot_state.daily_realized_pnl` where `daily_pnl_date` is today (the worker keys that date to UTC).
- **P&L total** — the same all-time realized P&L shown on each row, summed.
- **Open positions** — count of open per-market positions.
- **Exposure (at entry)** — per-coin chips netting long vs short notional. Valued at **entry price** (size × entry), not live marks — the fleet page deliberately loads no market feed. The chip tooltip breaks down long/short and names the bots.
- **Pile-up warnings** — an amber chip appears when two or more bots in the same mode hold the same coin in the same direction. Clicking it filters the table to those bots; clicking again (or the clear chip) restores the full list.

### Data flow

`listUserBotStates` (`src/server/bots.ts`) returns every `bot_state` row for the user's bots; `botListForUser` (`src/lib/api/bots.ts`) folds them into each `BotListItem` as `positions[]` + `daily_realized_pnl`. The pure aggregation lives in `src/components/bots/fleet-overview.ts` (unit-tested in `fleet-overview.test.ts`); the UI is `fleet-overview-strip.tsx`.

### Known limits

- **Live bots show no exposure.** Only the paper broker persists positions to `bot_state.paper_position`; the live broker reads its position from the exchange and stores null. The live card says so explicitly. If live-position persistence is ever added, the strip picks it up with no changes.
- Exposure ignores mark-price moves by design (entry valuation). Treat it as "where capital is committed", not current market value.
