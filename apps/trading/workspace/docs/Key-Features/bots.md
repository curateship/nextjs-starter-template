# Bots

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
