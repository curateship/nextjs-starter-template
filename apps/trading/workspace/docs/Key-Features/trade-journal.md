# Trade Journal

## What it is

`/journal` is the per-trade view of your own real money. `/pnl` can say *how
much* a day made; the journal says *what you did* — every trade, on a chart you
can pan and scroll back through.

It is the same four-panel workspace as the backtest run page and the bot run
page: summary rail (left), price chart (centre), markets table (right), trade
list (bottom). Clicking a market loads it; clicking a trade zooms the chart to
it and draws the entry → exit result box.

Those three pages are held to one standard, written down in `.agents/skills/Ui-standards` under
"Three-panel resizable workspaces": panel sizes, the show/hide toggles living in the bottom
panel's tab bar, that panel collapsing to exactly its tab bar rather than to nothing (so the
toggles never disappear), the divider above it keeping its gap, and reopening always at the
default size. Change the standard, not one page.

Route: `src/routes/_authenticated/journal.tsx` →
`src/components/journal/journal-workspace.tsx`.

## Real money only, enforced at the source

The sync reads **mainnet wallets only**. Testnet and practice fills never enter
the table, so there is nothing to filter in the UI and no way to forget to.
This is not fussiness: in an early sample, 39 of the first 46 fills synced were
testnet, and practice money turned a real −2.91 record into −9.97. Fake money
silently dominates whenever it is allowed in.

## Why it stores its own copy

Hyperliquid serves roughly 365 days of fills and caps a response near 2,000.
Bot fills are saved in `bot_trades`, but **hand-placed fills are persisted
nowhere else** — that third of the record was quietly expiring.

`wallet_fills` (migration `0051`) is that copy. One row per fill, unique on
`(wallet_id, hl_tid)` so a re-sync can never double-count.

**Bot fills are ordinary wallet fills.** They arrive through this same feed and
are tagged with `bot_id` by matching `hl_tid` against `bot_trades`. There is
deliberately no second feed for them.

Sync and read: `syncWalletFills` / `listWalletFills` in `src/server/journal.ts`,
behind `loadJournalOverview` (`src/lib/api/journal.ts`). The sync runs on page
load, throttled to once per 30s per user — Hyperliquid answers a burst of
reloads with 429. **A sync failure never blanks the page:** the stored history
is served and the error shows as a warning strip.

## Never build a second chart

A first version of this page was built and thrown away on 19 July 2026 because
its chart was a static snapshot of a fixed window — it could not be dragged
back, loaded no history, and could not replay the trade. See
`workspace/tasks/Performance/trade-journal.md` for the post-mortem.

The centre panel reuses `BotLiveChartPanel` → `PriceChart`, which already pans,
loads older candles progressively as you scroll back, and sources candles from
Hyperliquid — so dex-prefixed markets like `xyz:SILVER` work, which the
backtest's Binance-sourced history cannot do. `BotLiveChartPanel` gained
optional `intervals` / `onIntervalChange` props for this page: a real trade has
no saved timeframe, so the reviewer picks one. Bot call sites omit them and
keep their locked interval.

## Everything else is reused, not rebuilt

Round-trip pairing already existed and is already tested. The journal maps its
stored fills into `RoundTripFill` (`src/components/journal/journal-model.ts`)
and then uses the bot helpers unchanged:

- `buildBotRoundTrips` — pairs fills into entry → exit cycles, splitting flips
  pro-rata and handling scale-ins.
- `buildBotResult` — the `BacktestResult` shape `StrategyTester` renders.
- `buildBotMarketRows` — the right-hand `BacktestMarketsTable` rows.
- `buildBotFillMarkers` — the chart's O/C/F chips.

Those four were widened to take `RoundTripFill` instead of the bot-specific
type. Bot data satisfies it as-is; no file moved and no logic was rewritten.

## Numbers to read carefully

- **Capital base.** A real wallet has no per-market cash, so every market's
  %-return and drawdown are measured against the wallet's own starting equity
  (equity now, less what these trades realised). Unreadable equity leaves those
  columns as "—" rather than inventing a denominator. `buildBotMarketRows` takes
  an optional `capitalBase` override for this.
- **Cumulative totals are computed on the client, after filtering.** A total
  worked out before the wallet filter blends two wallets' money together.
- **Positions are per market.** Markets are paired separately and only then
  merged onto one timeline. Walking two markets' fills together would invent
  trades that never happened.
- **The markets table's "Total" row averages** drawdown and win rate across
  markets; the left rail's figures are whole-account. They are different
  statistics, not a contradiction.
- **Open positions show.** The newest cycle is often still open; it renders as
  the trade list's live row, marked to the current price from `useMarketRows`.
  The page opens on the most recent market that has a *finished* trade, so it
  never starts on an empty list.

## Known limits

- **Stops and take-profits cannot be drawn.** Hyperliquid takes them as separate
  trigger orders and returns nothing tying them to the entry; bot stops are
  percentages in config, not prices. Recording intent at order time is the only
  fix, and it is a separate change.
- **No notes, tags, or grades yet** — day one is read-only review.
- Deposits and withdrawals are not in the fill feed, so the derived starting
  equity is an estimate.
