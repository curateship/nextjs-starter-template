# Instant first

The rule, for all current and future work in this app:

**Everything the user does answers on screen instantly, using what the app
already knows. Any real computing, saving or fetching happens in the background
after the result is visible, and quietly corrects the screen if it must.
Nothing on first paint waits for a server.**

A press, a drag or a keystroke that shows nothing until a server replies reads
as broken, and on a trading screen it gets pressed twice. The app already
holds enough to draw an honest first answer for almost anything; the server's
job is to confirm it, not to unlock it.

## What follows from the rule

- **Trading engine Settings arrives with its values.** The route reads the
  engine, liquidation warning, saved Aster margin, and plain-order style before
  drawing the page. The browser does not mount an empty panel and ask four
  separate questions. Aster's saved margin draws first because asking the
  exchange can be slow. The row checks Aster in the background and corrects the
  choice if the account changed elsewhere.
- **Widgets and Markets Settings arrive with their values.** Each route reads
  its saved answer before drawing the panel. Widgets does not mount an empty
  editor and Markets does not replace its card with loading copy while the
  browser asks for a value the server already knows.
- **A window opens working, on the settings you last used.** The saved DCA
  and grid settings ride the page's own bootstrap call, the same one that
  carries the quick-order window's setup, and seed a browser-side copy at
  page load (`src/lib/trade/smart-prefs-cache.ts`). So the very first
  right-click after a reload already has them in hand, and every window opens
  on them with nothing left to fetch and nothing snapping afterwards. A
  placement updates the copy on the spot. Two kinds of late answer are thrown
  away rather than applied: one landing after a hand has touched a field,
  because a form must never change under somebody typing into it, and one
  from a read that left before a placement, because it describes the settings
  from before that placement and letting it land flipped the window back to a
  choice that had just been placed away.
  Both order windows use the same mounted form guard in
  `order-window-form.ts`. Each open window owns its own guard, so two windows
  cannot mark one another as edited, and closing a window clears the guard.
- **The DCA preview hangs from the click until the base loads.** The base
  read walks 500 candles and takes a second or two, so it is started the
  moment the right-click menu opens (`src/lib/trade/ladder-base-cache.ts`)
  and the preview re-anchors when it lands. Placing still waits for the real
  base, because what is shown has to be what is placed — that is the one
  spinner left in the window, and it is usually gone before it is seen.
- **A placed ladder or grid is on the chart in the same frame the window
  closes.** The server hands the written row back with its answer
  (`PlacedLadder.ladder`, `PlacedGrid.grid`), and the chart holds that copy
  until an ordinary read carries the same thing.
- **A drag answers with one write and no reads.** Moving a grid's range or an
  exit sends the one save; the server hands the saved grid back
  (`MovedGrid.grid`) and the chart holds it, so there is no follow-up
  portfolio read, no second reconcile, and the workspace-wide busy flag never
  flips for a drag. A refused save puts the line back where it was and says
  why in a toast.
- **A drag is smooth.** Pointer moves are coalesced onto one animation frame,
  and the layer's box is measured once when the drag starts, not on every
  pixel — `grid-layer.tsx` and `trade-lines-layer.tsx`, copying what the
  chart's own surface already did.
- **Redraws stay where the change is.** Every chart overlay layer is
  memoized and every handler the chart panel gives them is pinned, so a
  keystroke in an order window re-renders only the preview layer it belongs
  to, not all seven layers.

## How a background answer corrects the screen

The screen shows its own copy — a held row, a dropped price — and lets go of
it only when a read carries something at least as new, or after thirty
seconds, whichever comes first (`HOLD_GIVE_UP_MS` in `use-trading.ts`). A
save that fails releases at once and says why, so a price that never saved is
never left standing. The 4-second poll can land mid-drag without effect: the
hand's price always wins over a poll while the pointer is down or the hold is
younger than the server's copy.
