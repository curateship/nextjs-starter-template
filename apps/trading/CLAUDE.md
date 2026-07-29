# CLAUDE.md

Guidance for agents working in Trading.

## Route First

- Shared skills live in `../../.agents/skills/`.
- Trading docs live in `workspace/docs/`.
- Trading tasks live in `workspace/tasks/`, sorted into category folders — see `workspace/tasks/README.md` for the map.
- Before coding, read the relevant docs in `workspace/docs/`.
- Before changing task-driven work, check `workspace/tasks/`.
- **Before back-testing any strategy, read and follow `workspace/docs/back-guide.md`.**
- **Before building or changing any UI/layout, read and follow `workspace/docs/ui-rules.md`, including its site-gap rules.**
- **Before adding any new page, dashboard, or nav item, read and follow `workspace/docs/app-guide.md`** 
- **Before touching any indicator or strategy, read and follow `workspace/docs/Key-Features/indicator-strategy-parity.md`.**

## App Context

Trading is a TanStack Start app in the monorepo.

Use this app's local code, config, and workspace docs as source of truth for Trading behavior.

## Communication Style

- **ALWAYS answer in plain English. This applies to EVERYTHING, every response, no exceptions.**
- Write for a smart person who is NOT a programmer or a trader. Assume no technical background.
- Avoid jargon. If a technical term is unavoidable, explain it in everyday words the first time.
- Prefer short sentences, everyday analogies, and concrete examples over precise-but-dense wording.
- Still be accurate and honest — plain does not mean vague or dumbed-down on the facts.

## The One-Candle Profit Trap (this has bitten us three times)

A candle records four numbers — open, high, low, close. It does **not** record
whether the high or the low came first. The replay has to assume an order, and
whatever it assumes decides which orders fill. Assume the flattering order and
the backtest invents money that was never on the table.

This has now caused three false results:

- **Take-profit fills** — exits were filling at the bar's best price instead of
  their own. Faked a "17%/month" QQE result. Fixed with `exitTriggers`, which
  pause the intrabar walk at each trigger level.
- **DCA at 15m** — an intrabar-ordering artifact closed that campaign out.
- **DCA ladders at 4h** — a rung buys at the bar's low and the ladder sells at
  the bar's high, same candle. The gain lands on the exact figure `1/(1−rung%)−1`
  (6.383% off the first rung), which is arithmetic, not price action.

**Rules:**

- **Never let an entry and its exit both fill from one candle unless the close
  proves it.** If the close finished beyond the exit level, price demonstrably
  got there and stayed. If it didn't, hold the exit to the next bar.
- **Treat any repeated, suspiciously round profit figure as this bug** until
  proven otherwise. Real trades don't land on the same number hundreds of times.
- **Check the same-bar count before trusting a result.** Query the run's fills
  for buys and sells sharing a timestamp. A high share means the numbers rest on
  an assumption the data cannot support.
- The intrabar walk lives in `worker/src/backtest/runner.ts` (`processBarOpenPath`);
  the DCA ladder's own same-bar guard is `holdExits` in
  `worker/src/engine/dca-automation.ts`.

## Working Rules

- Keep changes small and direct.
- Fix only the requested behavior.
- Do not refactor adjacent systems unless required.
- Do not hide failed operations.
- Only fix build, lint, or type errors caused by your change.
- When summarizing work, do not include full file paths.
- Keep answers short and concise.
- Update documents when applicable
- Never start a new dev server if one is already running. The app's dev server is on port 3007. If 3007 is taken, that running server IS the one to use — do not spawn another on 3008+. Check with `lsof -iTCP -sTCP:LISTEN -nP | grep :3007` first. (`strictPort` is on, so `pnpm run dev` will error instead of hopping ports.)

## Tools

- Use Playwright to test (not chrome extension)
