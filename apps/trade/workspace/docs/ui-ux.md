# Trade — screen structure and interaction rules

What the app looks like and how it behaves. One section per part of the product,
added as each part is approved. Anything not written down here has not been
agreed yet.

## The Trade workspace

Four areas on one screen, at `/trade`, which is also where signing in lands you.

```
┌────────────┬─────────────────────┬────────────┐
│ Markets    │ MARKET HEADER       │ Account    │
│  All|Fav…  │ ─────────────────── ├────────────┤
│  (list)    │ Chart               │ Order      │
│            │                     │            │
├────────────┴─────────────────────┴────────────┤
│ Positions | Open orders | Fills                │
└───────────────────────────────────────────────┘
```

- **Left — Markets.** The whole panel is the market list: which exchange it
  comes from, search, five tabs, a sort, and a star on every row. Live exchange
  data. (An earlier draft had a separate Favourites row below the list; it was
  replaced by the Fav tab — two homes for one list is duplication.)
- **Middle — the market you picked.** One header row, nothing more: the
  market's own logo (carried as data on the row, with a first-letter circle
  when an exchange has no art), its name, and on the right the timeframe
  picker (1m–1d, remembered per browser, 4h the default) with the Indicators
  dropdown after it. The live figures — price, day's move, volume, funding,
  open interest, and which exchange and network — live behind the market's own
  name, click or hover. Below,
  the real candle chart fills everything, volume tucked into its bottom
  fifth. Candle green and red are the same colours as the list's pills, read
  off the page rather than hard-coded. Loading, no-history and failed-fetch
  states each say so inside the panel; the rest of the page stands.
  **However you set the chart up is how every chart opens.** Remembered against
  the account and carried onto the next market, the next timeframe, the next
  visit and the other machine — four numbers, two for each direction: how many
  candles are across the screen and how far behind the newest one the right
  edge sits, plus how much of the height is left above and below the candles.
  That last pair is the up-and-down squash you get by dragging the price axis,
  and it is kept as a share of the height rather than a window of prices, which
  is the only form that means anything on a market trading at a different
  number. Fresh candles for the chart already on screen (the live feed
  refetches after every gap it recovers from) land without moving the view at
  all. A market with a shorter history keeps the zoom and shows the empty space,
  rather than quietly zooming out; only a view with no candles in it at all is
  slid back until it touches the data. **Double-clicking the dates along the
  bottom** puts a chart back to its whole history, which is also how the
  remembered view is reset.
  **The chart is feature-blind by rule:** candles in, candles drawn. Paint
  tools, alerts, indicators and orders arrive as their own modules against a
  small surface the chart offers — the chart never learns what a line means,
  and has never heard the word "indicator".
  Decided in `workspace/tasks/Platform/plain-price-chart.md`.
- **Right, top — Account.** Which account you are trading with.
- **Right, bottom — Order.** The form. Below the account, because the account is
  what decides where an order goes and what it is allowed to be — reading down
  the panel is the same order as making the decision.
- **Bottom — what you are holding.** Positions, open orders and fills, as tabs.

The right panel is **two rows with a divider between them**. The rows drag
against each other and their split is remembered. The panel as a whole is what
shuts, so both rows go together — and both cards have to be taken away at once,
or a row with no width still paints its side borders and leaves a stray line
down the workspace.

## Drawing on the chart

A small rail of tools sits at the chart's top-left corner, on the candles
rather than in the header row: the header says which market and which
timeframe, and the rail says what the pointer is holding.

- **Two tools: a level and a trendline.** Press a tool, draw one thing, and
  the tool puts itself down — staying armed would turn a stray click into
  another line. Pressing the tool that is already held puts it down too, and
  so does Escape.
- **A level is one click**; a **trendline is a drag from one end to the
  other**, or a tap at each end, which is the only way there is on a
  touchscreen. Either way a dashed preview shows where the line will land
  before it lands.
- **A drawing is kept as a time and a price, never as pixels**, so it comes
  back at any zoom and on any timeframe — a base marked on 4h is in the same
  place on 1d.
- **Drawings belong to the market**, saved against the account, so what is
  marked on BTC never appears on ETH and a second machine sees the same
  lines. Saving is optimistic: a line appears the instant it is drawn, and a
  save that does not land takes it back with a toast.
- **Clicking a line picks it out** — it thickens and takes a soft glow along
  its length, and a trendline shows a handle at each end. Dragging the line
  moves the whole thing; dragging a handle moves that end alone. Pressing
  anywhere else on the chart, or Escape, lets it go.
- **The glow is the focus mark too, and the browser's own ring is turned
  off.** A focus ring draws a box round the whole element, and on a line
  running corner to corner that is a grey rectangle over half the chart.
- **The Tab key reaches every line**, and landing on one picks it out. Delete
  or Backspace throws the focused one away.
- **One line at a time goes from the line itself** — the small × over its
  middle while it is picked out, or Delete on the keyboard — and it comes back
  with **Undo** in the toast that follows. A marked base is work, and a slip of
  the mouse must not quietly erase it.
- **The bin in the rail clears the whole chart**, and asks first. It only
  appears once there is something to clear, it names how many go, and it takes
  this market's lines only — the others keep theirs. There is no Undo on that
  one; the question is asked before it runs instead.
- **The chart underneath still pans, zooms and shows its crosshair.** Only a
  line itself takes the pointer, plus the whole chart while a tool is held.
- Out of scope by the standing decision: alerts on lines and orders on lines.
  Each attaches to the same surface in its own task. Indicators now do —
  see below.

## Indicators

**An indicator is a chart control, so it lives in the chart's controls.** There
is no indicators page and no dashboard behind them. The **Indicators** dropdown
sits in the market header beside the timeframe, and the number in it says how
many are switched on.

- **A row per indicator: a checkbox to switch it on, and its name to open its
  settings.** One thing per job — the box switches it on, the name unfolds it —
  because a name that did both is how somebody ends up with an indicator they
  only wanted to look at.
- **Settings unfold inside the menu, split across two cards** in the same grey
  the DCA window uses for its advanced settings. **Settings** holds the rules
  that decide where the levels are; **Visibility** holds the ones that only
  decide which of them you are shown. That line is the answer to "why has that
  level got a dash but no arrow?" — it is always something on the second card.
- **Each card folds on its own, and both start open.** Folding one is for
  getting it out of the way while you work on the other, never for hiding a
  setting somebody then has to go looking for.
- **Every fold in the menu is remembered** — which indicator is unfolded and
  which of its cards are shut — against the account, beside the settings
  themselves. Left shut is still shut after a reload and on the other machine.
  Not in the browser's own storage: this app runs inside an embedded preview
  where those writes are quietly dropped, so a fold remembered there would be
  a fold that never sticks.
- **Back to the defaults leaves the folds alone.** They are how the menu is
  arranged, not one of the indicator's settings.
- Every setting explains itself through the info icon beside its label, and
  **Back to the defaults** undoes a session of fiddling in one press.
- **One indicator's settings are open at a time.** Every one unfolded at once
  would be a menu longer than the screen, and nobody sets up two at the
  same moment.
- **Which indicators are on is remembered against the account**, not the market
  and not the browser — the same rule as the zoom, and for the same reason: an
  indicator is how you read a chart, not a fact about one coin. It carries onto
  the next market, the next timeframe and the other machine.
- **A change is saved once the settings sit still for a moment**, because
  typing "150" into a field is three changes. A save that does not land is said
  in a toast and **does not undo what was just typed** — the chart is already
  drawing it, so what is lost is the memory, not the setting.
- **The layer takes no clicks.** An indicator is something to look at: the
  chart underneath still pans, zooms and shows its crosshair straight through
  it, and a drawn line or a stop sitting under a dash is still what the pointer
  finds. It also draws first, so nothing somebody put on the chart themselves
  ever ends up behind it.
- **Levels are worked out from closed candles only.** The bar the feed is still
  filling in cannot confirm a level anyway, and redoing every level on every
  tick would be work for an answer that cannot have changed.

**Base** is the first one, ported from the old Trading app with the same six
settings. It marks the floors price keeps bouncing off (a teal dash and a green
arrow up) and the ceilings it keeps getting turned away from (a red dash and a
red arrow down). The arrow lands on the candle that finished the wait, which is
usually well above the level itself — timing an entry near a level is a
different job.

Two of its settings only thin out the arrows and never the dashes, which is the
answer to "why does that level have a dash but no arrow": **Only mark levels
going the right way** (a base has to be above the base before it) and **Fewest
candles between arrows**.

### A stop that rests under the base

A DCA ladder can put its stop on the confirmed base instead of a fixed distance
below the entry. It is on the Stop loss part of both the window that places a
ladder and the one that edits a live ladder's exits, in its own grey card, and
it is a port of the QFL automation from the old app rather than anything new.

- **Bases are read off the 4h**, whatever chart the ladder was placed from. Not
  a setting: the rule was measured on the 4h, and a base found on the 5m is a
  different thing wearing the same name.
- **The base's own two numbers are frozen when the ladder is placed**, so
  nudging the indicator on the chart changes the chart and leaves every live
  stop exactly where it is.
- **There is always a stop.** Until a base has confirmed below what the ladder
  is holding, the plain percent stands. Setting that percent to 100 means price
  would have to reach zero, which is how you say "nothing until the base
  arrives" — and it writes no stop at all rather than one resting at zero.
- **A level above what is held is refused.** That is a place to take profit, not
  a place to give up, and a stop there would close winners as losses.
- **Being stopped is one rung failing, not the ladder failing.** Everything
  sells, every waiting rung comes off the book, and the next rung down is placed
  on its own with a fresh stop under whatever base is there by then. From the
  first stop onwards only one rung rests at a time.
- **The last rung stopping out ends it for good** — nothing is armed and nothing
  is remembered. A ladder whose bets double needs that full stop, or a long
  enough losing run outgrows the pot.
- **Buy back after a reclaim** puts the same rung back for the same money if
  price closes back above where the stop cut and keeps closing above it for the
  chosen number of days. A close back under starts the wait again; a wick under
  does not. It is capped in dollars rather than coins, so a level reclaimed
  months later costs what the rung was always allowed to spend.

## Orders on the chart

An order is placed by right-clicking the candles at the price you want, and
from then on it lives on the chart as its own line with a coloured bar at the
right-hand end.

- **A waiting order shows its stop and its target too**, in the same green and
  red as a position's but in a finer dash — they are where the trade will get
  out once the order fills, which is a plan rather than a fact. The bar says
  what each would pay in dollars if it got there. Neither can be dragged: they
  hang off the order's price, so the order's own window is where they change.
- **Pressing a waiting order's bar opens that window** — how much the order is
  for, and where it gets out. Not its price: the price is the line, and you
  drag it. The window shows what the size costs in dollars and how much of your
  own cash is behind it, and the same window is what the ⚙ on the bar means.
- **Placing an order does not wait for the exchange.** The window shuts on the
  press and the order is drawn on the chart at once, labelled "sending" until
  the answer lands — a second or two later. A "sending" line has no × and
  cannot be dragged; there is nothing on the server yet to change.
- **Nothing is announced when it works.** No toast for placing an order and
  none for cancelling one: the line appearing and the line disappearing is the
  answer, and a toast on every click of a trading screen is noise. Refusals
  still speak up, and so does the one case that must never pass quietly — a
  real order that went on without the protection asked for.

## The market list

The panel is shaped like the automation palette, its sibling on the other
workspace: the underline tab row is the top of the panel, the sort headers sit
under it, the list fills the middle, and the search is the bottom bar — its
placeholder names the exchange ("Search Hyperliquid Mainnet"), so what the
list covers is on screen without spending a row on it.

- **Three tabs, with icons: Fav first and the one it opens on** (starred), then
  All (the whole catalog), then Watch (markets with an alert, once alerts
  exist). Fav leads because the markets you actually trade are a short list,
  and scrolling past hundreds of others to reach them every time is the wrong
  default; All is one click away and is where stars are put on. A tab whose
  data source does not exist yet says what it is waiting for instead of drawing
  an empty list that reads like a bug, and an empty Fav points at All.
- **A row is the symbol and the day's move, nothing else.** The percentage is
  signed and sits in a soft pill of its colour — green up, red down; the price
  belongs to the market header; a market with no yesterday price shows a plain
  dash, not a zero in a pill.
- **Sub-exchange markets keep their full name** — "xyz:SNDK", never a
  stripped "SNDK" that could be read as a main-exchange coin. The (i)
  tooltip names the venue; coin art and the letter fallback use the bare
  name.
- **The bottom bar carries a kind-of-market filter** beside the search —
  crypto, stocks, indices, commodities, forex, other; only kinds actually in
  the list are offered. It narrows the All tab only (stars are stars), is
  remembered per browser, and reads as switched off on the other tabs.
- **The (i) tooltip ends with the market's ground rules:** the smallest size
  an order may use, the max leverage, and — where it applies — "Isolated
  only", explained in the same line. A rule the exchange does not state
  shows nothing, never a guess.
- **A bare visit reopens your last market**, remembered against the account
  (a second machine gets it too). A link with `?market=` always wins, and a
  remembered market that no longer resolves shows the honest missing state.
- **Sort is drawn as column headers** — "Market / 24h Vol" left, "Change 24h"
  right, the shared `TableSortButton` — and clicking the sorted one flips the
  direction.
- **Stars save to the account, not the browser**, so favourites follow you
  between machines. Starring is optimistic and reverts with a toast if the save
  fails.
- **Markets nobody trades are hidden** (zero volume) — unless starred or
  selected, which keeps your own markets visible no matter what.
- **Selection lives in the address** as a full market key
  (`?market=hyperliquid:mainnet:BTC`), so a link means the same market even
  when a second exchange exists.
- **The exchange call failing does not take the page down.** The list shows
  the error and a retry; every other panel still works.

## The protocol layer (where the exchange lives)

- Screens draw `MarketRow`s from `src/lib/protocols/contracts.ts` — never an
  exchange's raw response. A market is identified by protocol + network + id.
- Everything Hyperliquid is in `src/server/protocols/hyperliquid/`, the only
  folder allowed to import its SDK. `fence.test.ts` fails the suite if it
  leaks, or if shared code ever asks `=== "hyperliquid"`.
- Adding an exchange is a new folder plus one entry in
  `src/server/protocols/registry.ts`. No screen changes.

Two things the old Trading app had that this does not, on purpose:

- **No bar across the top.** The old one put the market's figures and the
  account's picker in the same strip, where each could be read as the other's.
  The market's figures belong to the chart underneath them.
- **No order book or trades tape panels.**

## How the panels behave

The same panel parts as the Automation Canvas, not a second system. Anything
fixed in one is fixed in both.

- Every divider drags.
- **Left and right shut all the way to nothing.** A slim tab appears on the
  middle panel's edge where each one disappeared, and brings it back.
- **The bottom never disappears.** It shuts down to its own tab row, which stays
  on screen with its counts, and the divider above it stays draggable.
- **Double-clicking the blank part of a panel shuts it.** Double-clicking what
  is left opens it again. A double-click on a button, a box or a word is that
  control's, never the panel's.
- **Sizes and shut panels survive a reload**, remembered per browser.

## Narrow screens

Designed with the wide one, not bolted on.

- The middle panel takes the whole width and stays the main thing.
- Two labelled buttons in the market header slide the side panels in. The
  markets sheet is the full market list; the account sheet carries its two rows
  stacked, sharing the height — no divider, because a screen with no room to
  spare does not need a third way to size the same thing.
- The bottom panel stays where it is — it already works at any width.
- A slid-open sheet closes when the window crosses the width boundary, in
  either direction.

## Stand-in figures

While a part of the page is not connected to anything, its numbers are made up,
and they have to say so three ways at once, because any one of them can be
missed:

- **Quieter and dashed-underlined** — the shell's `SampleValue`.
- **A "Sample" badge in words** on the panel, for greyscale and screen readers.
- **Hovering says it plainly** — "a stand-in figure".

A stand-in figure is never coloured green or red. Colour is what makes a made-up
number look like a real one.

Watch for this: putting an `inline-flex` box inside `SampleValue` stops its
dashed underline painting at all. Arrows and icons go beside the figure, not
inside it.

## Empty states

Every panel says something true about itself rather than "coming soon". The
words written for an empty panel are the same words a brand-new account sees on
the finished page, so the empty page gets designed once, at the start.

- Markets — "Pick a market to chart it."
- Chart — "The chart goes here."
- Account — "No account connected yet."
- Positions / Open orders / Fills — each says what would be there.

## Live prices

The page keeps itself current instead of freezing at load. One connection per
exchange streams every market's figures about once a second; the chart's
working bar streams beside it.

- **A tick repaints only what moved.** Each row and the header tooltip
  subscribe to their own market; unchanged markets stay silent. The list's
  ORDER stays on the loaded snapshot on purpose — rows shuffling under the
  pointer every second would be worse than a sort that catches up on the next
  refetch.
- **Silence is the outage.** Feed health is judged by data arriving, not by
  what the socket claims: a quiet spell tears the connection down and
  rebuilds it on a capped backoff. (An on-screen "prices may be stale" label
  existed briefly and was removed on 7 Aug 2026 at Tyler's direction — the
  feed heals itself without announcing it.)
- **Recovery refetches.** The first tick after a gap re-pulls the market
  snapshot and the chart's candles, so nothing that moved during the outage
  lingers on screen.
- **A hidden tab lets the connection go** and reconnects — with the same
  catch-up — when you come back.

## Rules that hold everywhere

- **Never swap a missing market for a different one.** If a saved market is gone
  or unavailable, say so. Never quietly fall back to BTC or anything else.
- **An unavailable action explains itself.** Never hide the reason, and never
  quietly change what the user asked for into something that is allowed.
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
  Figures the exchange did not report (a live position's running fees, a live
  order's leverage) show as dashes, never as made-up zeros. The warning is all
  in front of the press; nothing is said afterwards, real or pretend — see
  "Orders on the chart".

## Where the navigation lives

The sidebar and the signed-in home page are Settings, held in the app's
database — not in code. Trade is a copy of Custom Shell, and an app never edits
a shell file, so these are changed on the Settings screens:

- Settings → Sidebar — the **Trade** link.
- Settings → General settings — the admin and member home pages, both `/trade`.
