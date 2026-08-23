---
name: Journal beyond 2,000 rows
status: done
---

## In Plain English

**What it is:** An "Older trades" control at the bottom of the Journal tab that
loads the next page of finished trades. Today the Journal stops at a fixed
number of rows and older trades are simply not there.

**Use case:** A practice wallet has run a ladder for four months and made 2,600
fills. The Journal shows the newest 2,000 fills' worth of trades. The first
month, the one Tyler wants to compare against, cannot be reached from the app
at all.

**Why it's a good idea:** The rows exist. The cap was put in so the panel's
poll, which runs every few seconds, stays fast. Paging keeps that: the poll
still reads one page, and older pages load only when asked.

**Why it is missing today.**

- Practice: `JOURNAL_PAGE = 2_000` at `src/server/trade/paper.ts:1282`.
  `loadPaperHistory` at `:1336` reads `.limit(JOURNAL_PAGE)` at `:1352`,
  newest first, with no offset or cursor. The portfolio read does the same at
  `:1413`.
- Live: `MAX_FILLS = 4_000` at `src/server/trade/live-fills.ts:102` and
  `MAX_TRADES = 500` at `:90`. `loadLiveHistory` at `:454` reads
  `.limit(MAX_FILLS)` at `:472` and cuts trades to 500 at `:521`. Same
  shape, no paging.
- Both are returned as `trades` by the server functions in
  `src/lib/api/live.ts:91` and `src/lib/api/paper.ts:125`, drawn by
  `TradesTable` in `src/components/trade/activity-panel.tsx:336` and
  `positions-table.tsx:814`.
- A trade cut in half by the limit is dropped on purpose (comment at
  `live-fills.ts:97`), so the oldest visible trade can silently be the second
  oldest in the page.

## Tasks:

- **MVP scope:** a "Show older" button under the Journal table that loads the
  next page of finished trades, for practice and live wallets, until none are
  left. Pages are appended; the poll keeps refreshing only the newest page.
- **Not in scope:** search, date filters, export, or paging the Positions or
  Orders tabs.
- **Where it touches:** `src/server/trade/paper.ts` (`loadPaperHistory`),
  `src/server/trade/live-fills.ts` (`loadLiveHistory`), new server functions in
  `src/lib/api/paper.ts` and `src/lib/api/live.ts`,
  `src/components/trade/use-trading.ts`, `src/components/trade/activity-panel.tsx`,
  `src/components/trade/positions-table.tsx` (`TradesTable`).

- **Page by time, not by row number.** Each page request carries `before`, the
  `at` (live) or `fillTime` (practice) of the oldest fill already shown. The
  query adds `lt(column, before)` and keeps the same limit. A row-number
  offset would shift when a new fill lands at the top.

- **Add `loadPaperHistoryBefore(userId, walletIds, before)` and
  `loadLiveHistoryBefore(...)`** that reuse the existing query bodies with the
  extra bound. Keep the "drop the half trade" rule, but return the cut point
  so the next page starts from the dropped trade's newest fill and that trade
  is drawn whole on the next page instead of vanishing.

- **Two server functions,** `loadOlderPaperTradesFn` and
  `loadOlderLiveTradesFn`, GET, guarded with `userGet` like
  `loadLiveTradingFn` at `live.ts:81`.

- **Keep older pages in `use-trading` state** as a separate list,
  `olderTrades`, keyed by wallet set. The poll replaces `trades` only. When the
  wallet filter changes, clear `olderTrades`. The table draws
  `[...trades, ...olderTrades]`, and the button shows "Show older" until a page
  comes back empty, then "That is everything".

- **Acceptance:** a practice wallet with more than 2,000 fills shows a "Show
  older" button. Pressing it adds older trades below, newest first, with no
  duplicate and no gap at the join. Pressing until empty reaches the wallet's
  very first trade. A live wallet with under 4,000 fills shows the button once
  and it says nothing more is there.

- **Verification:** real browser via the validate-app skill on a practice
  wallet. Run `select count(*) from trade_paper_journal where wallet_id = ...`
  to know the real total, then page to the end and check the oldest trade on
  screen matches the oldest rows in the table. Watch the poll in the network
  tab to confirm it still reads one page.

- **Docs:** edit `workspace/docs/reading-the-figures.md` or the Journal section
  of `ui-ux.md`, whichever describes the Journal tab, to say the tab shows the
  newest page and how to reach older trades.

- **Risks and open questions:** `hideLiveTrade` at `live-fills.ts:538` hides
  fills; an older page must honour `hidden = false` the same way. Grid fills
  are stamped by `stampGridFills` (`paper.ts:1356`), which has to run on each
  older page too. Should the practice page size drop from 2,000 now that older
  pages are reachable, to make the poll lighter? Measure before deciding.

## Rules

- Follow Ui Ux design at workspace/docs/ui-ux.md
- Use .agents/skills/audit-change to follow coding standards
- Don't make assumptions. If not clear, use @.agents/skills/interview-me
- For big changes use skill @.agents/skills/validate-live

## The Review Checklist

[ ] Brief in plain english
[ ] Edge cases handled
[ ] Error paths handled
[ ] Update documents (if applicable)

## Brief
