# Rules that hold on every screen

- **Every action shows its answer at once, and the exchange is told
  afterwards.** Opening, closing, cancelling, and dragging a price, a stop or
  a target all change the screen on the press. Nothing waits on a round trip
  to the venue, because a venue takes one to four seconds and a screen that
  sits still for that long reads as a press that did not land — which is how
  people end up pressing twice.

  **A held answer ends when the data agrees, never when a read merely lands.**
  Each of those actions keeps a hold — a note saying "show it this way for
  now". A read already on its way when the action started knows nothing about
  it, so letting that read end the hold snapped the line back to where it was
  and then forward again a moment later. It looked like a delay, and it looked
  like a _different_ delay on every exchange, because it was really a race
  with whichever venue's read happened to be slowest.

  So a cancelled row stays hidden until it is really gone, a dragged price is
  held until a row comes back carrying it, and a just-placed order is held on
  screen until the real one appears — never a gap between the two, and never
  a "sending" row that vanishes before its replacement arrives. A hold gives
  up after thirty seconds so a venue that never agrees cannot keep the truth
  off the screen, and a refusal releases it at once and says why.

  **This lives in one place on purpose** — `use-trading.ts`, which never knows
  which venue a row came from. An exchange added tomorrow inherits all of it
  without writing a line, and no exchange can get it subtly wrong on its own.

- **Never swap a missing market for a different one.** If a saved market is gone
  or unavailable, say so. Never quietly fall back to BTC or anything else.
- **An unavailable action explains itself.** Never hide the reason, and never
  quietly change what the user asked for into something that is allowed.

  **An incomplete form keeps its main action pressable.** The action becomes
  unavailable only while the app is saving. Leaving a bad box or pressing the
  action shows the reason in one red sentence. Pressing also shows the same
  reason in a toast, so the button always answers. Every window that can refuse,
  including the ladder, the grid, the order window, the stop-and-target window,
  the running grid's window and a live ladder's exits, draws the sentence
  through `order-refusal.tsx`. Floating chart windows place it directly above
  the button. A modal places it beside the footer buttons, where a scrolling
  body cannot carry it out of sight.

  The words name the box and what would fix it, in dollars wherever money is
  involved. Never a code and never a field name out of the source. The box at
  fault carries `aria-invalid` after the person leaves it or tries the action,
  so the eye and the screen reader are pointed at the same place. The button
  points at the sentence with `aria-describedby`. Typing an unfinished number,
  such as `0.`, does not mark the box as wrong before either of those moments.

- **The exchange and network stay one glance or one hover away** wherever a
  market or an account could be read as belonging to the wrong one — the
  search box names them outright, the market header holds them behind its
  info icon. (Softened from "always visible" on 6 Aug 2026, when the header
  chips were traded for one clean row; if a second exchange ever makes the
  hover too easy to miss, the labels come back on screen.)
- **Every icon-only control has a label**, focus stays visible, and every panel
  is reachable with the Tab key alone.
- **A real dollar never reads as a pretend one.** Rows a live wallet owns
  carry an amber "Real" badge in every table, and the order window's button
  turns into a said-back-in-dollars question ("Real money in <wallet>: buy
  about $X…") that must be pressed a second time before anything is sent.
  A live Smart order follows the same rule and confirms the ladder's buy count
  and maximum cost.
  Figures the exchange did not report (a live order's leverage) show as
  dashes, never as made-up zeros. A live position's fee total is the one that
  is counted rather than dashed, and it carries its own honesty rules — see
  "Fees beside profit" in `reading-the-figures.md`. The warning is all
  in front of the press; nothing is said afterwards, real or pretend — see
  "Orders on the chart".
  Active Trades is the exception: its real rows carry no repeated chip, while
  Practice and Testnet rows still name the pretend account type.

The wallet details window on each exchange dashboard shows settled trade
profit since midnight on the start day, 20 August 2026, in Toronto, and current
open profit. Its final row is Made or
lost: those two figures added together. It does not use the wallet's opening
balance, so older profit, deposits, and withdrawals cannot move either profit
row. When KuCoin has not stated the profit for a partial sale, an info mark
beside Settled says that both totals are short and names the missing trades.

