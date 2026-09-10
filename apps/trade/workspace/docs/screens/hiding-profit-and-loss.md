# Hiding profit and loss

One switch blurs every figure in this app that says what you made or lost, so
the screen can be shown to somebody, or shared on a call, without the money
being readable. It is in the header's settings cog, beside colour mode, and it
is remembered per account.

## Where the switch is

The cog at the right of the header opens a small panel with two rows: colour
mode, and **Hide profit and loss**. The cog and the panel belong to the shell,
and the second row is this app's — `docs/shell/shell-and-apps.md` explains the
`header.quickSettings` option that puts it there. The old eye button inside the
Active trades dropdown is gone; there is one switch now, not two.

## What it hides, and what it deliberately does not

- **Hidden: what you made or lost.** A position's open profit, the header's
  running total, the wallet's figure beside its balance, the Smart orders PnL
  column, the Manual orders pills, the bottom panel's Unrealized P&L, If
  stopped and Journal results, the P&L page's day squares and its cards.
- **Readable: money you have and money already taken.** Balances, free cash,
  what a position is worth, order sizes and coin prices all stay, because
  somebody hiding their profit still has to be able to trade. **Banked stays
  readable too** — Tyler, 10 Sep 2026 — it is money already taken rather than
  what a position is doing now.
- **Readable: the chart's own lines, except Entry.** An Exit or a Stop Loss
  label says what WOULD happen at a price nothing has reached, and those are
  the figures a line is dragged by. The Entry line's figure is the position's
  open profit, so it is hidden with the rest of them.
- **Untouched: backtests and flow runs.** A backtest's result is research
  about months that have already happened, not money in a wallet.

## Frosted glass, not a dash

A hidden figure is blurred where it stands and cannot be selected, so it cannot
be copied out of the page either. It keeps its real width: swapping it for dots
would move every column beside it the moment the switch was pressed, and a row
that jumps is a row somebody has to find again.

## How it is remembered

- **The server holds the answer**, in the same saved field the old header eye
  button used (`headerProfitVisible` inside the saved panel layouts, kept under
  its old name so nobody's choice was thrown away). `src/lib/api/trade/hide-pnl.ts`
  reads and writes it.
- **The browser holds a copy** in `localStorage` under `trade:hide-pnl`, and
  that copy is applied before the first paint. Without it a reload would show
  every figure readable for the second the server takes to answer, which is the
  one moment the switch exists for. It is one key for the browser rather than
  one per account: at the moment it is read nobody knows yet who is signing in,
  and hiding a figure that did not need hiding is a much smaller mistake than
  showing one that did.
- **A saved panel layout still carries it.** Applying a named layout sets the
  switch to what it was when the layout was saved, exactly as before.
- **The reading happens in the header's pinned-markets control**, not in the
  switch itself. A menu draws nothing until it is opened, so a switch that read
  its own setting would leave every figure readable until somebody opened the
  cog. `src/lib/trade/use-hide-pnl-sync.ts` is that reader, and it asks the
  server once per page.

## The code

`src/lib/trade/hide-pnl.ts` is the store: a module with a listener list rather
than a React context, because these figures are on nearly every screen and a
context would need a provider wrapped round a tree the shell owns. Every hidden
figure is drawn by `src/components/trade/pnl-amount.tsx`, so there is one answer
to "is this hidden" rather than thirty.
