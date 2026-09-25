# True Cost Report — what fees and funding really take

The P&L page (`/pnl`) has a "True cost of trading" section that breaks the
headline number into what the trades actually made and what the exchange took:

- **Gross result** — realized profit and loss before any costs.
- **Fees** — the fee on **every** fill, entry and exit.
- **Funding** — the small hourly payment perpetual positions pay or receive
  for staying open. Positive means the wallet received it.
- **Net after costs** — gross − fees + funding, by construction. The lines
  always add up; each figure is rounded to the cent for display, so a shown
  row can drift by a cent from summing the shown figures.

The table has one row per wallet plus a pinned "All wallets" row, and follows
the page's wallet, symbol, and range filters.

**The whole page uses this same definition of net.** Every figure on /pnl —
the tiles, equity curve, daily bars, calendar, and the Wallet performance
table — is built from daily nets of gross − all fees ± funding
(`buildDayIndex` in `pnl-dashboard-model.ts`), so the performance table's Net
P&L equals the cost table's Net after costs. Days where only costs moved
money (funding on a held position, no trades) count toward totals and the
equity curve but are not "trading days": they don't affect win rate, streaks,
best/worst day, and the calendar only labels them once the amount is visible
at whole-dollar rounding.

## Where funding comes from

Funding is not part of any fill — Hyperliquid reports it as its own ledger
(`userFunding`), serves a limited window, and caps each response at 500
entries. So the app keeps its own permanent copy in the `wallet_funding`
table (migration 0052), synced by `src/server/funding.ts`:

- First sync backfills up to 365 days, paging through the 500-entry cap.
  Each page is stored as it arrives, so an interrupted backfill resumes where
  it stopped.
- Later syncs re-ask only from the newest stored payment (minus a one-minute
  overlap). The unique key (wallet, market, funding time) makes re-inserting
  a payment a no-op — re-fetching never double-counts.
- The sync runs on P&L page load, throttled to once per 30 seconds per user,
  for **all** wallets on both networks (testnet costs must reconcile too).
  This mirrors the Trade Journal's `wallet_fills` sync.

**Sign convention** (verified against live payments): the stored `usdc` value
is the signed amount credited to the wallet — positive = received, negative =
paid. A short position under a positive funding rate receives; a short under a
negative rate pays.

## Honest labeling

- If a wallet's funding refresh fails but history is stored, the card says
  recent payments may be missing.
- If a wallet's funding was never fetched at all, its Funding shows
  "unavailable" and its Net after costs shows "—" instead of a silently wrong
  number.
- If the selected range reaches further back than the earliest stored
  payment, the card says since when funding is actually recorded.

Tests: `src/server/funding.test.ts` (dedupe, paging, sign passthrough,
partial failure, window filtering).
