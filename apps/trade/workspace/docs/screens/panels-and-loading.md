# Panels, loading and empty states

## How the panels behave

The same panel parts as the Automation Canvas, not a second system. Anything
fixed in one is fixed in both.

- **Grid, DCA and Manual orders are blocks on the exchange's page** (the
  Admin 3 panel design, 7 Nov 2026, `dashboard-blocks.md`). Each block is as
  tall as its rows up to a cap, then scrolls inside itself, and a folded block
  is its heading alone.
- **Every order panel adds its rows up in a row pinned to its bottom**
  (Tyler, 8 Oct 2026). The first cell counts the trades, "3 trades", in place
  of the word Total; then their Value added together and their PnL added
  together, each under its own column, the same footer for Grid, DCA and
  Manual orders. It stays on screen while the rows scroll and is not drawn
  while there is nothing to add up. PnL adds only the rows
  that have one, because a waiting grid, ladder or level has made and lost
  nothing yet; with none it shows a dash. Value shows a dash the moment one
  row has no value yet, since a total missing a row would be wrong rather
  than incomplete. The code is `order-panel-totals.tsx`.
- **"Empty" means nothing to show, never "could not read".** A block whose
  read failed shows its message and Retry button. A block still reading, with
  nothing remembered from last time, says so until its rows land.
- The dividers beside the chart still drag. Each side panel opens at 16% and
  drags to 36%.
- **Left and right shut all the way to nothing.** A slim tab appears on the
  middle panel's edge where each one disappeared, and brings it back. **Both
  edges have one**, so a panel dragged shut never looks gone for good.
- **Positions open with the most Unrealized P&L first.** The largest current
  profit sits at the top and losses fall underneath it. The Unrealized P&L
  heading shows that order and reverses it when pressed.
- **Double-clicking the blank part of a panel shuts it.** Double-clicking what
  is left opens it again. A double-click on a button, a box or a word is that
  control's, never the panel's.
- **Sizes and shut panels follow the account.** The trade workspace, backtest
  run and live-run screens keep their divider arrangements in
  `trade_prefs`. A drag or collapse therefore returns after a reload and on a
  second browser signed into the same account.
- **An old browser layout crosses over once.** The first browser with one of
  the seven earlier local-storage answers sends every valid answer it has to the
  account. The app then removes those browser copies and never uses them as a
  second source of truth. An account layout saved on another browser wins over
  a later old-browser import.
- A saved set of panel sizes returns only while its panel names still match the
  current screen. When a redesign replaces a panel, the old sizes are ignored
  and the current layout opens at its defaults instead of stopping the page.
- **The open folder row follows the account.**
  Opening or closing Watched, Fav, a named folder or All markets returns after
  a reload on that exchange. Another exchange keeps its own open row.
- **The chart has its own full-screen view.** Press the full-screen button or F
  while no field is being typed in. The side panels, the middle panel's tab
  row and the page chrome leave, while the chart header stays. The full-screen button remains at
  the plot's bottom-right, just left of the price numbers, as the exit button.
  Press the button again, F again or Escape to restore the exact divider
  positions and shut panels from before. The chart and its panel groups stay mounted, so
  entering or leaving does not ask for candles again. On exit the fixed,
  viewport-wide frame is removed before the saved percentages are put back;
  otherwise a percentage restored against that wider frame becomes a larger
  pixel width when the shell returns. Nothing animates.
- **Positions, Open orders and the Journal are tabs beside the chart** in the
  middle panel, each filling its height and scrolling inside it. The page
  itself never scrolls.
- **The column headings stay on screen while the rows scroll.** All three
  tables pin their heading row to the top of the box it scrolls in,
  so scrolling a long Journal never leaves you reading eleven unlabelled
  columns of dollars. The pinned row is opaque, because rows slide underneath
  it, and it takes the same hairline under it that every other table in the app
  draws. Nothing is covered until something is scrolled: at rest the headings
  sit exactly where the first row begins.
- **The market list's headings stay put the same way.** That list scrolls in
  the table's own box rather than a scroll area, which is the thing that makes
  it work: a table always wraps itself in a box that scrolls sideways, and a
  box that scrolls sideways is what a pinned heading inside it holds on to. The
  sideways box has the height now, so one box scrolls both ways and the heading
  has something to hold on to. It used to be 10,889 pixels tall inside a
  separate scrolling box, so it never scrolled and the heading never stuck.
- **A tab press never leaves the table highlighted.** The press moves
  everything under the pointer, and the browser finishes by highlighting
  whatever ended up between where the press started and where the content
  landed, which turned a whole table blue. Any highlight left by a press is
  dropped once the press is over. Nobody selects text by pressing a tab, so
  there is nothing lost.
- **Journal rows can be removed one at a time or many at once.** Every row
  keeps its own bin. A right-click on a row offers Mass select and Delete
  (Tyler, 10 Nov 2026: "Add right click ability for journal to delete and mass
  select"). Mass select shows the tick boxes, hidden otherwise, and ticking
  rows puts a Remove (n) button in the tab bar; the checkbox in the table
  header ticks or unticks every listed row. One row or many, the same confirm
  asks first, and confirming only hides the fills behind the trades: a
  practice wallet's cash is added up from its fills, so nothing about the
  money moves. A tick disappears with its row when a refresh takes the trade
  away, so Remove (n) can only ever mean rows on screen. Positions has the
  same right-click and Mass select, with Close (n) over the ticked rows;
  `trade-details-panel.md` has both.

## Narrow screens

Designed with the wide one, not bolted on.

- **Under 1280px the chart fills the screen** and a bar along the bottom
  slides the other panels up over it: Left panel, Positions, Browse and Right
  panel. `dashboard-on-a-phone.md` has the whole of it.
- Picking a coin in a block or in Browse shuts the panel and shows the chart.
- Close all is a row in the chart header's ⋮ at every width.
- Full screen shows the chart alone at any width, and hides the bottom bar
  until Escape or the button brings it back.

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
Words written for an empty panel are the same words a brand-new account sees on
the finished page, so the empty page gets designed once, at the start. The
middle panel draws its header only for a real market. No selection and an
unavailable market leave the header out rather than drawing a substitute. On a
narrow screen, either state opens the Markets sheet so the missing header does
not remove the way to choose a market.

- Chart — "The chart goes here." Under it, "Pick a market from the list and its
  candles draw in this space." It never names a side of the screen, because on a
  narrow screen the list is behind a header button and there is no left. It
  never writes "the Markets list" either: no panel on this page carries that
  caption, the sheet's "Markets" title is read only by screen readers, and
  Settings has its own Markets tab that the sentence would be confused with.
- Account — "No account connected yet."
- Positions / Open orders / Journal — each says what would be there.

**A table with nothing in it keeps its column headings.** The empty words are a
row inside the table, spanning every column, sitting under the real heading
row. They are never a paragraph drawn instead of the table. Closing your last
position therefore leaves the headings where they were and the table does not
jump, which matters because that jump used to land at the exact moment
a position closed. Still reading and a failed read already worked this way; the
empty state now matches them, and the three answers stay separate — a table
never says "nothing here" before a read has really landed.

When the exchange returned no markets to show, the market list says "The
exchange is not listing any markets right now." The middle panel adds no second
header for the same failure.

## Still reading

Waiting labels use Reading with no trailing dots. Market-folder menus,
the scanner and market explorer say "Reading the market list". The Fired
alerts tab says "Reading fired alerts". Settings and account readouts name
what they are reading. Each waiting surface uses the shared spinner.
The margin window says "Reading what this exchange allows" with a spinner
in each pending section. A refusal keeps its explanation instead of spinning.
The chart keeps its documented loading exception.

**"Nothing here" and "I have not looked yet" are different answers**, and on a
screen listing money only one of them is safe to act on. Every panel that
fetches its own contents says which one it means.

**A return visit starts with the last complete answer this browser saw.** The
wallet menu and Smart orders panel cache their last answer for each signed-in
account and exchange, including an empty answer. The cached rows stand in only
until the first fresh read lands. A different account or exchange never sees
them. Cached wallets can only draw the panel. They cannot choose where an order
goes or open wallet settings. A first visit, a cleared browser, or a cache
written by an older build still uses the reading state below.

- **One treatment, and it is the shared spinner.** `loading-row.tsx` states the
  rule the whole app follows: a compact centred spinner sitting in the
  surface's own frame, never a skeleton. The wallet menu used to draw five
  grey bars instead, which on a card of figures read as money arriving.
- **The waiting words name what is being read** — "Reading your wallets",
  "Reading your smart orders", "Reading what you are holding". Whoever is
  looking should be able to tell which panel is slow. The wallets and Smart
  orders panels show these words only when this browser has no saved answer to
  stand on.
- **A count nobody knows yet shows nothing**, never a zero. The Smart orders
  header says "none working" only once the read has landed; before that its
  count is blank, because a zero is an answer the panel does not have.
- **A flow's trading button keeps its place while its first status is read.**
  The button says "Reading trading status" with the shared spinner until the
  answer lands. A failed read keeps the button on screen and says what failed
  in the error toast; later reads keep the last complete status rather than
  opening a gap in the header.
- **The flow status popover leads to the run.** When the flow has a run id, its
  name and figures at the top of the popover form one keyboard-reachable link
  to that run's dashboard. Pause, Stop, Try again and Open the dashboard keep
  their own jobs. A status without a run id shows the same summary without a
  link. The run chart does not repeat the old notice that more orders may
  appear while the run is switched on.
- **Both halves have to finish.** The trading read comes back in two pieces,
  practice and real, and either may be first. A person whose ladders are all on
  real wallets holds an empty practice half for a second or two, and that half
  is not the whole answer. Every panel waits on `settled`, never on `loading`.
  A refusal counts as finished and switches the panel to its failed words with
  Try again. A refusal never leaves the spinner running forever.
- **The market list has no waiting state and does not need one.** Its markets
  arrive with the page rather than being fetched by the panel, so there is no
  moment where the list is on screen and its markets are not. A retry after a
  failed read keeps the rows it already had, which is a refresh rather than a
  load. The Manual orders panel does fetch its own contents, and it uses the
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
- **A venue with no socket refreshes instead, and it is never called live.**
  Solana is the one: Jupiter publishes no websocket, so the screen asks for
  the busiest markets' prices on that venue's own clock, every ten seconds
  for up to 200 coins. It drives the screen alone. The trading engine never
  reads it and asks for a price at the moment it acts, which is what keeps
  the rule in `../rules/trading-rules.md` intact. The server refuses a
  refresh for any venue that does publish a socket, so a future dashboard
  cannot quietly start polling one. A hidden tab asks nothing, and a refused
  or failed turn leaves the figures already on screen rather than blanking
  them. `../protocols/solana.md` has the arithmetic.
