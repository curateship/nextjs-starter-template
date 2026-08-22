# Trade — screen structure and interaction rules

What the app looks like and how it behaves. One section per part of the product,
added as each part is approved. Anything not written down here has not been
agreed yet.

## The Trade workspace

Four areas on each exchange screen, at `/admin/hyper-liquid`, `/admin/phemex`,
`/admin/kucoin`, and `/admin/aster`.

```
┌────────────┬─────────────────────┬────────────┐
│ Markets    │ MARKET HEADER       │ Account    │
│ Watch|Fav… │ ─────────────────── ├────────────┤
│  (list)    │ Chart               │ Order      │
│            │                     │            │
├────────────┴─────────────────────┴────────────┤
│ Positions | Open orders | Fills                │
└───────────────────────────────────────────────┘
```

- **Left — Markets.** The panel is the compact market list: which exchange it
  comes from, search, tabs, and sorting. Live exchange data. Its first tab is
  the exception, and it lists orders rather than markets — see "The Watched
  tab" below. (An earlier draft had a separate Favourites row below the list;
  it was replaced by the Fav tab — two homes for one list is duplication.)
- **Middle — the market you picked.** One header row, nothing more: the
  star for that market, the market's own logo (carried as data on the row,
  with a first-letter circle when an exchange has no art), its name, and on
  the right the timeframe picker (1m–1d, remembered per browser, 4h the
  default) with the Indicators dropdown after it. The star is amber and filled
  when the market is in Fav and a hollow outline when it is not, so the two do
  not differ by colour alone, and it names the market it would star. The star
  leads the row so that the name is what gives way as the panel narrows. On a
  phone the timeframe row leaves the name no width at all, and anything behind
  the name would never be on screen. The timeframe picker is one segmented
  choice. Its raised tab marks the selected interval, and the arrow keys move
  through the row.
  Every control in that row is 32px high. Pressing the market name opens the
  full market picker: search; Favorites, All, Crypto, TradFi, HIP-3 and
  Trending tabs; sortable price, day's move, funding, volume and open-interest
  columns; and a star on every row. Below,
  the real candle chart fills everything, volume tucked into its bottom
  fifth. Candle green and red are the same colours as the list's pills, read
  off the page rather than hard-coded. Grid levels, ladder rungs and order
  lines read those same theme colours. Neutral waiting orders use the muted
  foreground so their labels and controls remain readable in either theme;
  only the chart frame uses the deliberately faint divider colour. Loading,
  no-history and failed-fetch states stay inside the panel; the rest of the
  page stands. While candles are
  loading, the whole empty chart surface gently fades in and out instead of
  showing an icon, spinner or loading screen. The completed chart fades in
  when ready. Reduced-motion settings keep both transitions still.
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
- **The eye after Indicators opens View options.** Its five checkboxes show or
  hide the chart grid, volume bars, crosshair, order arrows and your drawings.
  All five start on, and each choice follows the account onto the next market,
  visit and machine. Hiding drawings leaves every line saved in place, clears
  the picked line and switches off the paint tools until drawings are shown
  again. The bin still appears when hidden drawings exist because clearing and
  hiding are different actions.
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

### Smart orders on live wallets

The Smart order is the same ladder on practice, testnet, and real wallets. The
same state machine owns its base or clicked anchor, rung sizes, two-green entry,
targets, stops, step-down, reclaim, cancellation, and restart recovery. A live
ladder stores Hyperliquid's order IDs and reconciles exchange fills before it
takes another action. If only part of a new ladder is accepted, those orders
are cancelled and no ladder is saved.

**Neither window asks twice.** The ladder and the grid both place on the first
press, on every wallet including real money. There used to be a second,
confirming press on live wallets; Tyler had it removed. What still stands
between a real-money order and the exchange is the server's funded test switch:
mainnet cannot sign unless it is deliberately enabled.

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

### The grid window

Right-click the chart, pick Smart order, then Grid. The window floats where you
clicked and its cards read in the order the decisions are made. What the grid
does with each of these is in `grid-orders.md`; this is what is on screen.

- **Range** starts with **Where the range sits**, a two-item dropdown. "Around
  today's price" keeps the two boxes it has always had, Above % and Below %.
  "Below the price you clicked" swaps them for one, **How far below %**, because
  the top is worked out rather than typed, and adds a line reading **Top buy,
  where you clicked** with that price on it. Where levels sit above the price,
  the card says so and says plainly that placing still buys nothing. Both modes still show the range as
  two prices, the step between levels, and what the whole grid costs.
  The range controls wait for the saved grid setup to arrive before they can be
  changed, so a late saved answer never replaces a choice just made in the
  window or moves its preview.
- **Money** keeps Share of account % and gains **Split between levels**: "The
  same at every level" or "Double at every level down". When it is set to
  doubling, the readout under Range stops saying "Each buy spends" and says
  **Top buy spends** and **Bottom buy spends** instead, because those are now
  two different numbers and one of them is the interesting one.
- **Follow price up** is its own card with a tick box, between Money and the
  finish line. It has no settings of its own, so the card holds nothing but the
  tick box: everything there is to say about it lives on the tooltip beside the
  title, including that the stop slides up too, that the grid never finishes on
  its own, and that levels the same dollars apart stop following once a round
  trip no longer clears the fee. A card with one switch does not get a paragraph
  under it.
- **Finish the grid** was called Take profit and is the same card renamed. Its
  readout says **Grid finishes at**, not "Sells everything at". Ticking Follow
  price up hides this card entirely and switches it off, because a line above a
  range that slides up ahead of price can never be reached, and a setting that
  quietly does nothing is worse than no setting. On the chart the line reads
  **FINISH**.
- **Refusals** are said on the window before the button is pressed, in the
  server's own words. Doubling gets its own: it names the level that is too
  small and offers the three ways out, fewer levels, a bigger share, or the same
  size at every level.

The window that edits a running grid gains a **Following** card between Slices
and Stop loss: the same tick box, a line saying how many times the range has
moved so far, and a warning before it removes a finish line that is already set.

### A placed grid is on the chart at once

Placing one draws it in the same frame the window closes. The server hands the
finished grid back with its answer, and the chart uses that until the next read
carries it.

Without that there is a gap nobody can explain: the window clears its own
preview lines as it goes, and the read that would replace them waits on an
exchange round trip, so the grid blinks off the chart and returns a second
later. It is the same trick the ghost order uses while a plain order is being
placed, and for the same reason.

### What the Smart orders panel counts as a sale

Opening a smart order in the right-hand panel lists what it has sold and what
that banked. Two rules decide what appears there.

- **A sell out of a long-only order is a sale**, whether or not the venue put a
  figure on it. Grids and ladders are long only, so a sell on their coin is a
  sale. A short bought back counts too, through the profit the venue states on
  it.
- **Money the venue never stated is shown as a dash, never as zero.** Zero is a
  real answer meaning the sale broke even. KuCoin reports money per position
  closed rather than per fill, and a grid selling part of what it holds never
  closes a position, so its sales arrive unpriced. The panel lists them, leaves
  the figure blank, and says underneath how many the total is short of.

## Orders on the chart

An order is placed by right-clicking the candles at the price you want, and
from then on it lives on the chart as its own line with a coloured bar at the
right-hand end.

With a position open, the same menu offers Take profit when the clicked price
is on the winning side of the entry and Stop loss when it is on the losing
side. Picking either opens the position's stop-and-target window with that
clicked price already filled in. An exit already set on that side keeps its
shortcut out of the menu because its chart line is the place to change it.

A live take-profit or stop-loss order appears once, as its coloured target or
stop bar. This includes a grid's own STOP LOSS line. The chart does not draw
the exchange's copy of that order as a second gray Sell bar.

A position's stop can be dragged past its entry after price moves in the
trade's favour. This trailing stop protects profit. It must remain below the
current price for a long, or above the current price for a short, so setting it
does not close the position immediately.

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

- **Three tabs, with icons: Watched, then Fav, then All.** Watched leads and is
  the tab the panel opens on, because a price you have money committed to beats
  a market you might look at. Fav (starred) is one click away, All is the whole
  catalog. An empty Fav points at the star in the market header, and an empty
  Watched points at the other two tabs — the panel no longer opens on a list
  of markets, so its first screen has to say where they went.
- **The panel opens at a fifth of the workspace.** It used to open at a sixth,
  and three tabs did not fit that: "All" was half a label with the row scrolled
  sideways. The width is still yours to drag and still remembered per browser,
  so a width you have already dragged to wins over this.
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
- **Sort is drawn as column headers** — "24h Vol" left, "24h Change" right, the
  shared `TableSortButton` — and clicking the sorted one flips the direction.
  Both headings lead with the time window, and so does the market picker's "24h
  change", so the three read the same way round.
- **Stars are put on in the market header**, at the head of the row, before the
  logo of the market on screen. Every row of the market picker has one too. The
  rows of the market list have no star of their own. One star always on screen
  beats one per row behind a hover.
- **Stars save to the account, not the browser**, so favourites follow you
  between machines. Starring is optimistic and reverts with a toast if the save
  fails. Two presses in a row both count. A save already on its way no longer
  swallows the next press, it sends that press as soon as it is free.
- **Settings → Markets holds one minimum daily dollar volume for the account.**
  Every exchange uses the same number. Markets below it disappear from every
  list, including Favorites and search, and a linked or remembered market below
  it says the volume setting hid it instead of opening its chart or blaming the
  exchange. A zero setting keeps the old rule, where markets with no reported
  volume stay hidden. When the cutoff hides every market, All says none meet the
  setting. When it hides every starred market, Favorites says the setting hid
  them rather than saying nothing was starred.
- **Selection lives in the address** as a full market key
  (`?market=hyperliquid:mainnet:BTC`), so a link means the same market even
  when a second exchange exists.

### The Watched tab

Every price you are waiting at, across every coin and every wallet on this
exchange. A plain order does not rest on the exchange any more — the app holds
the level and sends nothing until the market comes to it, which
`watched-orders.md` explains — and those levels were only ever visible one coin
at a time on the chart, or mixed in with everything else under Open orders.

- **A row per order, not per coin.** Two levels on the same coin are two rows.
  That is the one way this tab differs from Fav and All, which are slices of
  the catalogue.
- **Two lines, two columns each.** The coin and what it will spend on the top
  line; which way, at what price, and how far today's price is from it on the
  second. The panel is a few hundred pixels wide, so the coin and the level
  give way to an ellipsis first and the two figures on the right never do.
- **The wallet is named only when the list spans more than one.** With every
  level in the same wallet its name is the same word on every row, pushing the
  level into an ellipsis to say nothing.
- **Newest first, and it stays that way** while prices move. Sorting by which
  level is closest would reshuffle the list under the pointer every second.
- **Pressing a row charts that coin**, the same press the market rows answer
  to. Calling an order off stays where it already is, the × in Open orders and
  the line on the chart, rather than becoming a second place to cancel.
- **The sort headers are hidden on this tab.** There is no volume and no day's
  move to sort by, and a sort button that does nothing is worse than none.
- **"Reached" is the engine's own rule**, so the list and the engine can never
  disagree about whether a price has arrived: a buy is reached when today's
  price has come down to it, a sell when it has come up. Without a live price
  the distance column is empty, because a dash there would read as zero.
- **Loading, empty and failed are three different answers.** "Nothing is
  waiting" is only said once the read has come back.
- **It opens on the levels this browser saw last time**, so there is no spinner
  on the first thing anybody looks at. Measured on 21 Aug 2026: the rows used
  to land 5.3 seconds after a reload and now land at 1.8, which is as soon as
  the panel itself exists. `watched-orders.md` says what is kept and why it is
  never trusted.
- **Nothing marks those rows while the read is on its way.** A "checking these
  are still waiting" line was tried and taken out on 21 Aug 2026: the read
  lands almost at once, the levels almost never differ, and a spinner on the
  first thing on screen is the wait wearing a different hat.
- **A read that FAILS is the one case that speaks up.** It keeps last time's
  answer and puts "The read failed. This is what was here last time." above it,
  with a Try again. Nothing is coming to correct it, so it has to say it is
  old. That line sits above the "nothing is waiting" wording just as it sits
  above rows. With no cache at all it says instead that it could not find out.
- **The cache only ever stands in until this session has an answer of its own.**
  A read that refuses in the afternoon never puts the morning's levels back
  over what is on screen.
- **The exchange call failing does not take the page down.** The list shows
  the error and a retry; every other panel still works.

## The protocol layer (where the exchange lives)

- Screens draw `MarketRow`s from `src/lib/protocols/contracts.ts` — never an
  exchange's raw response. A market is identified by protocol + network + id.
- Everything Hyperliquid is in `src/server/protocols/hyperliquid/`, the only
  folder allowed to import its SDK. `fence.test.ts` fails the suite if it
  leaks, or if shared code ever asks `=== "hyperliquid"`.
- Adding an exchange is a new folder plus one entry in
  `src/server/protocols/registry.ts`, followed by its own dashboard. The
  current Trade dashboard remains Hyperliquid-only.

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
- **Pressing a tab in the bottom panel grows it to fit that tab's rows.** Six
  waiting buys means all six on screen without touching the divider. The panel
  grows through the same resizable panel the divider drags, so there is one
  thing setting the height rather than two fighting over it.
- **It grows to the rows or to half the workspace, whichever is smaller.** The
  chart always keeps the other half. Past that the table scrolls inside the
  panel; the page itself never scrolls.
- **The tab you are already on opens the panel too, and closes it again.**
  Press it and the panel grows to fit that tab's rows; press it once more and
  it goes back to the height you had dragged the divider to. That is the press
  you make when the rows you want are already in front of you and there are not
  enough of them on screen, so it can never be the press that does nothing.
- **A panel shut down to its tab row opens when its tab is pressed**, to the
  height the divider was left at. Pressing again then grows it to fit. It opens
  rather than growing straight to the rows because the panel learns the height
  to reopen on from whatever height it was shut at, so a panel shut while grown
  would reopen on the grown height and then remember it, which is the one thing
  the grown height must never become.
- **A double-click on blank space shuts the panel from any height**, grown or
  not, and opens it again on the dragged height. The gesture is told plainly to
  shut or to open rather than to toggle, because a toggle judging the panel
  after the growing had already been undone shut it and reopened it in the same
  motion, on alternate tries.
- **The grown height is never remembered.** A reload opens on the height the
  divider was left at, which is what the rule above already promises. Dragging
  the divider after growing wins: the new height is the one remembered and the
  one a second press returns to.
- **Growing never makes the panel smaller.** A tab with two rows in it leaves
  the divider where it is.
- **A table still loading grows nothing.** Neither does one whose read failed.
  Both draw a single message where the rows would be, and fitting the panel to
  a sentence is not fitting it to the rows.
- **The panel jumps to the new height, with nothing animating.** So the
  reduced-motion setting has nothing to switch off here, and a chart in the
  middle of drawing is not redrawn thirty times on the way.
- **A tab press never leaves the table highlighted.** The press moves
  everything under the pointer, and the browser finishes by highlighting
  whatever ended up between where the press started and where the content
  landed, which turned a whole table blue. Any highlight left by a press is
  dropped once the press is over. Nobody selects text by pressing a tab, so
  there is nothing lost.

## Narrow screens

Designed with the wide one, not bolted on.

- The middle panel takes the whole width and stays the main thing.
- Two labelled buttons in the market header slide the side panels in. The
  markets sheet is the full market list; the account sheet carries its two rows
  stacked, sharing the height — no divider, because a screen with no room to
  spare does not need a third way to size the same thing.
- A sheet closes toward the same edge it opened from. Closing Account keeps the
  account sheet on the right until it is gone; it never turns into Markets on
  the left during the closing animation. The panel completes that exit in
  150ms instead of drifting a short distance and then disappearing. Reduced
  motion removes the animation.
- In the Account sheet, Add wallet stays in the account header but leaves a
  clear gap for the sheet's close button. The two actions never overlap.
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
- Chart — "The chart goes here." Under it, "Pick a market from the list and its
  candles draw in this space." It never names a side of the screen, because on a
  narrow screen the list is behind a header button and there is no left. It
  never writes "the Markets list" either: no panel on this page carries that
  caption, the sheet's "Markets" title is read only by screen readers, and
  Settings has its own Markets tab that the sentence would be confused with.
- Account — "No account connected yet."
- Positions / Open orders / Fills — each says what would be there.

**A market that is not there has one voice.** Both places say the exchange is
not listing it, in the same words and the same tense:

- The market header, when a saved or linked market no longer resolves — "The
  exchange is not listing this market right now."
- The market list, when the exchange returned nothing to show — "The exchange is
  not listing any markets right now."

The only difference between the two is "this market" against "any markets". A
second wording for the same failure makes a reader think there are two
failures.

## Still reading

**"Nothing here" and "I have not looked yet" are different answers**, and on a
screen listing money only one of them is safe to act on. Every panel that
fetches its own contents says which one it means.

- **One treatment, and it is the shared spinner.** `loading-row.tsx` states the
  rule the whole app follows: a compact centred spinner sitting in the
  surface's own frame, never a skeleton. The wallets panel used to draw five
  grey bars instead, which on a card of figures read as money arriving.
- **The waiting words name what is being read** — "Reading your wallets",
  "Reading your smart orders", "Reading what you are holding". Whoever is
  looking should be able to tell which panel is slow.
- **A count nobody knows yet shows nothing**, never a zero. The Smart orders
  header says "none working" only once the read has landed; before that its
  count is blank, because a zero is an answer the panel does not have.
- **Both halves have to land.** The trading read comes back in two pieces,
  practice and real, and either may be first. A person whose ladders are all on
  real wallets holds an empty practice half for a second or two, and that half
  is not an answer. Every panel waits on `settled`, never on `loading`.
- **The market list has no waiting state and does not need one.** Its markets
  arrive with the page rather than being fetched by the panel, so there is no
  moment where the list is on screen and its markets are not. A retry after a
  failed read keeps the rows it already had, which is a refresh rather than a
  load. The Watched tab beside it does fetch its own contents, and it uses the
  spinner like everything else.
- **The chart is the one exception and it is deliberate.** While its candles
  load, the whole empty chart surface fades gently in and out instead of
  showing a spinner. See "The Trade workspace" above, where that decision is
  recorded.

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

## Backtest candle history

- A backtest result opens on the first market in Results and the first trade in
  Trades, so its chart is useful immediately. Each run remembers the last
  market and trade chosen in this browser and restores them when reopened.
- Backtests save finished candles in the app database by full market key and
  candle size. Running the same window again reads those rows without asking
  the exchange again.
- The selected protocol is also the history source. Hyperliquid markets use
  Hyperliquid candles and Binance markets use Binance candles; prices are never
  substituted across exchanges.
- Downloads are saved page by page, so a failed request resumes at its missing
  page. Every missing candle stretch stays visible as a recorded gap.
- Hyperliquid keeps a limited history. A window beyond that history shows the
  shortfall; adding a fallback source requires a separate decision.

## Backtest funding

- Perpetual-market backtests use the exchange's saved historical funding rates
  at every settlement. Positive funding costs a long position; negative funding
  pays it.
- The dollar payment uses the replay's stored historical price at that time.
  The funding endpoint does not include the exchange's historical oracle price,
  so this is the same price history used for the rest of the replay.
- The result lists **Funding paid** directly below its fee and slippage settings.
  A negative figure means the position received more funding than it paid.
- Any missing market or settlement stretch appears in the result warning. It is
  never silently described as free.

## Rules that hold everywhere

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
  Figures the exchange did not report (a live position's running fees, a live
  order's leverage) show as dashes, never as made-up zeros. The warning is all
  in front of the press; nothing is said afterwards, real or pretend — see
  "Orders on the chart".

The wallet card on each exchange dashboard shows settled trade profit since
midnight yesterday in Toronto and current open profit. Its final row is Made or
lost: those two figures added together. It does not use the wallet's opening
balance, so older profit, deposits, and withdrawals cannot move either profit
row. When KuCoin has not stated the profit for a partial sale, an info mark
beside Settled says that both totals are short and names the missing trades.

## The trading overview

`/admin/trading-overview` answers the account-wide money question without
belonging to one exchange. The headline card puts total balance, made or lost,
settled money, and money still open in four large columns. Under it, draggable
cards show the wallets, money over time, and every recorded real fill.
Active Trades is the account-wide exception to the real-money totals. It lists
every open position across every protocol and every wallet, including practice
and testnet wallets. Each row names its account type so pretend money cannot be
read as real money. New dashboards put Active Trades under the headline figures;
an account with a saved arrangement finds it under Settings → Widgets until it
is placed.

The Active Trades table has five columns: market, protocol, wallet, entry price,
and current profit in dollars and as a share of the money the trade holds. The
market cell copies the bottom Positions panel: a 16px icon, 12px medium symbol,
the compact Long or Short and leverage badge, then the compact Real, Testnet, or
Practice badge. Clicking the symbol or anywhere else on the row opens that
market on its protocol's chart. The Market column takes only the width its
ticker cluster needs, so resizing the widget keeps every column visible. Trade
rows use 10px of vertical padding, 2px more than the bottom Positions panel, to
give the list a little more air without changing its type size. The table opens
with the largest P/L first. Every heading sorts, and Filter narrows the rows by
protocol, wallet, or both. A
wallet that could not be read stays named above the rows rather than being
mistaken for a wallet with no open trades. A market whose current price could
not be read shows a dash for profit, never a made-up zero. A plain divider sits
between every pair of trade rows, including the final two. The sticky table
header uses the lighter muted gray rather than the full muted background. Every
Active Trades column is left-aligned, including Entry and P/L.
The Wallets, Money over time, and Trades cards use the same shared
workspace-panel header as the rest of the dashboard, including its icon,
height, spacing, and divider; none carries a second descriptive line in the
header. The Wallets table uses the same sizing, sticky light-gray header,
horizontal scrolling, compact cells, and dividers as Active Trades rather than
a separate fixed-width layout. Every Wallets column is left-aligned.
Headline and chart totals use the dashboard's shared stat typography: Inter
for labels and the dashboard's semibold tabular monospace treatment for values.

Practice wallets never enter a number on this screen. If one real wallet cannot
be read, the rest of the screen stays up, the missing exchange is named, and
every affected total says it is short. A failed read is never drawn as an empty
wallet.

The wallet card is one comparison table. Each wallet has a separate Protocol
column, balance, made or lost, settled money, and money still open on one row.
Protocol no longer sits under the wallet name. Wallet rows use the same 10px
vertical padding and plain divider as Active Trades. A switched-off wallet stays
as a quiet row saying it was not asked or counted. Every column heading sorts
the wallet rows, while wallets without figures stay at the end. The table opens
with the largest open profit first.
Testnet wallets do not appear in this card. The Wallets heading tooltip states
the money rule. Made or lost is settled trade money plus current open profit.
The settled trades start at midnight yesterday in Toronto. Deposits and
withdrawals can change Balance but never profit.

The money-over-time card starts at zero at midnight yesterday in Toronto and
charts priced settled trade money from then until now. Its final point adds the
current open profit, so the value above the line is the same current profit as
Made or lost. Opening balances, deposits, withdrawals, and older fills never
enter the line. There are no longer historical range controls because the card
has one stated period. The area under the line fades to transparent toward the
bottom, and the profit rule is in the heading tooltip.

The trades table uses the money each exchange stated. A KuCoin sale that did
not close the position has no stated profit, so its Money cell is a dash. The
Money column's header tooltip and the chart header say how many trades their
total is short of. An unstated figure never becomes zero. Trade rows are grouped
by day and keep market, side, time, exchange, wallet, money, size, and fee in a
compact four-column table. The Filter menu narrows the table to one exchange,
one wallet, or both, and Clear all restores every trade. A fill hidden from the
Journal stays hidden here too.
Trade rows inherit the dashboard's Inter typeface, including market names and
Money values. Their numbers keep tabular spacing without switching to a
monospace face.

Settings has two Widgets tabs and they do not share an arrangement. The
trading Widgets tab sits in the "This app" card and saves its top, left, right,
and hidden lists per account in `trade_prefs`. The platform Widgets tab sits in
the "Platform" card and saves the platform Overview arrangement in the shell
settings. Moving or resetting a card in one tab never changes the other.

## Where the navigation lives

The sidebar and the signed-in home page are Settings, held in the app's
database — not in code. Trade is a copy of Custom Shell, and an app never edits
a shell file, so these are changed on the Settings screens:

- Settings → Sidebar — the **Trading overview** link to
  `/admin/trading-overview`.
- Settings → General settings — the admin and member home pages, both
  `/admin/trading-overview`.
