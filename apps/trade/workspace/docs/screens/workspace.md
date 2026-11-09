# The Trade workspace

One dashboard at `/trade` since 8 Nov 2026: the left page of blocks, and the
middle, which is Overview's widgets or the exchange picked in the Protocols
block. There is no right panel. A member opens it as well as an admin, and
sees only their own wallets, orders and widgets there —
`who-can-open-a-protocol-screen.md` says who gets what, and
`dashboard-blocks.md` explains the page, the Protocols block and Overview.

```
┌────────────┬────────────────────────────────────────────┐
│ The page   │ [BTC chart ⓘ][Positions][Open orders]       │
│ of blocks: │ [Journal]                                   │
│ Protocols, │ Chart                                       │
│ Rules, …   │ (or Overview's widgets)                     │
└────────────┴────────────────────────────────────────────┘
```

- **Left, the dashboard's page.** A page of "/" blocks, one per person: the
  Protocols block, then Rules, Manual trades, Grid trades, DCA trades,
  Scanner and Folders, plus anything written there. The trading blocks show
  the exchange picked. Double-clicking the panel's blank space shuts it, the
  same as every other panel (Tyler, 15 Oct 2026). A double-click on words or a
  control does not.
- **Middle — the market you picked.** One header: the market's chart,
  Positions, Open orders and the Journal as tabs, then on the right the
  primary Browse market button (moved there 8 Nov 2026), the timeframe control (1m to 1d, remembered per browser, 4h the default),
  Indicators and View options, and a ⋮ holding Wallet, the market's Folders
  and Pin to top, and Close all (`dashboard-blocks.md`).
  Indicators and View options are buttons of their own (Tyler, 7 Nov 2026:
  "move the view options and indicatior buttons outside of the dropdown").
  Indicators carries a round count of the indicators that are on. A star
  beside each timeframe keeps that choice in the header as a shortcut. The
  browser remembers the stars. The timeframe menu arrow has its own fixed
  spot at the far right inside the timeframe tabs, so choosing another
  timeframe never carries the arrow to that tab. A narrow header shows only
  the selected timeframe and that fixed arrow. **Browse market opens on a
  click, never a hover**, and the market list stays open until a click
  outside it, Escape, or a pick. **No button in this header row has a
  background or a border** (Tyler, 31 Oct 2026: "remove all the buttons bg",
  then "remove the border too"), except the timeframes and Browse market. A
  button turns gray only under the pointer or while its menu is open. The
  timeframes sit in the pill tabs' grey track, the chosen one on a white pill
  and the arrow inside the same track (Tyler, 8 Nov 2026: "change the
  timeframe ui to this"). Every control in that row is 32px high. The full-screen button sits inside the plot's
  bottom-right corner, immediately left of the price numbers. Pressing it, or F
  from outside a field, leaves the chart and its own header on screen and hides
  the rest of the workspace and page chrome. Escape returns to the exact panel
  arrangement from before. Pressing Browse market
  opens the full market picker: search; segmented tabs; sortable figures; and
  a star on every row. Favorites, All and Trending are always there. Phemex and
  KuCoin stop there because every market is crypto. Hyperliquid also has Crypto,
  TradFi and HIP-3. Aster adds Crypto and TradFi only while its current list
  contains something outside crypto. An exchange omits funding or open
  interest when it cannot fill that column. Moving to an exchange that lacks
  the current sort returns the list to daily volume. Picking a market adds it
  to browser history, so Back returns to the market that was on screen before
  the pick. Below,
  the price chart fills everything, with volume tucked into its bottom fifth.
  Candles are the default. View options can instead draw a line through each
  real closing price or Heikin-Ashi candles, which smooth each body using the
  candle before it. The choice belongs to the account and follows it to every
  market, timeframe, visit and machine. Changing the type leaves the chart's
  zoom and position alone. Every type uses the real candles for its price
  scale, so a stop, target, drawing or indicator at $100 stays at $100 when the
  visible shape changes. Heikin-Ashi uses the candles already loaded and never
  asks the exchange for different data. The header does not name the source
  used to fill older history. A failed older-history request still appears
  there with a retry button.
  Candle green and red are the same colours as the list's pills, read
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
  **The chart is feature-blind by rule:** candles in, the chosen price shape
  drawn. Paint
  tools, alerts, indicators and orders arrive as their own modules against a
  small surface the chart offers — the chart never learns what a line means,
  and has never heard the word "indicator".
  Decided in `workspace/tasks/Platform/plain-price-chart.md`.
- **Middle header, Wallets.** Wallet is a row in the middle header's ⋮
  (Tyler, 7 Nov 2026: "Move the wallet into the 3 dotted dropdown"). The row
  names the wallet in use and nothing else (Tyler, 15 Oct 2026: "Show the
  wallet name only"). The total and the made-or-lost figure are in the menu it
  opens. The ⋮ is there with no market on the chart too, which is how a Solana
  wallet is made and funded before Solana has a market list.
  Pressing the row opens Active, All and Inactive. Active
  lists every wallet that is switched on. Pressing a wallet row makes it the
  wallet used for the next trade. The checked control names the selected wallet
  and the row keeps the panel background. Each wallet fits on one line:
  selection, name, connection dot, total, profit and a vertical three-dot
  button. A fresh mainnet wallet does not repeat its exchange, connection state
  or a Real chip. A failed or old read still says what is wrong beside its dot.
  All and Inactive use the same row grid, selector size, figures and three-dot
  placement. The menu has no footer: Add wallet is a grey square plus button
  at the right end of the tab row, wearing the same muted grey as the chart
  header's own icon buttons.
  Every three-dot button opens the same wallet details window. The window shows
  the key-expiry notice, Free, In trades, margin health and profit figures. It
  ends with Empty wallet and Edit wallet. Edit closes the details window before
  the settings window opens, so two windows never sit on top of each other. The
  wallet menu stays open behind the details window and is still open when the
  window closes.
  The wallet menu is at most 384px wide. Wallet rows are 48px high and run from
  one menu edge to the other. The wallet name, total and
  profit keep their own columns, so each set of figures ends at the same point.
  A wallet turns light gray under the pointer and keeps that background while
  selected. The hover and selected backgrounds are square and reach both edges.
  The menu clips its header, rows and footer to the rounded outer edge.
  The rows use 12px inside gutters and 14px primary labels.
  Money is monospaced and tabular. Wallet and smart-order profit use the same
  12px type and end on the same right edge.
- **Grid, DCA and Manual orders are blocks** on the exchange's page, Grid
  above DCA above Manual trades on a new page (Tyler, 6 Oct 2026 for the
  order). Each is as tall as its rows, up to a cap, then scrolls inside its
  block. Manual trades lists the coins you are holding by hand first, each
  with what it is up or down, then the hand-placed prices still waiting.
- **Positions, Open orders and the Journal are tabs in the middle**, beside
  the chart. The chart stays mounted under them.

**Every workspace panel header uses `DashboardCardHeader`.** The header is 57px
tall with 12px on its top, left and right around the shared 32px controls. Title
rows, tab rows, the market picker, feed cards and chart cards all render through
that one component. A panel body that begins directly under the header also
uses 12px. The tab strip immediately behind the buttons uses the same light
gray as the market control in the middle panel. The selected tab uses a small
shadow instead of a black underline. The component and its tabs live in
`src/components/shared/dashboard-card-header.tsx`, changed in Custom Shell first
and carried here unchanged.

**Grid and DCA are two blocks** on the exchange's page. Grid lists the grids you placed
by hand. DCA lists the DCA ladders you placed by hand. Both panels have the
same four columns, the same sorting and the same details card. Each block's
heading holds only its title, with no working, holding or running summary
beside it. The code is `src/components/trade/smart-orders-panel.tsx`, drawn
once per kind from `src/components/trade/trade-workspace.tsx` and handed to
the blocks in `src/components/trade/notes/trade-block-views.tsx`.

- **A flow's grids and ladders are not here.** They stay on that run's own
  dashboard, as before. A paused one does show here, in its kind's panel, because
  this panel owns the Resume button.
- **A paused signal trade shows under DCA.** It is the one other kind the panel
  lets through, and the Positions tab leaves its coin out, so with no panel its
  holding would vanish from the screen. The ladder engine runs signal trades,
  so DCA is its nearest home. Its details card says "Signals".
- **Each tab's empty answer names its own kind.** "No grid of your own is
  working" on Grid, "No DCA ladder of your own is working" on DCA. Still reading
  and could-not-read are separate answers, as before.
- **Running bots are no longer on this dashboard.** Until 6 Oct 2026 the second
  tab was Bots, a list of every switched-on flow with Pause and Stop. The
  trading overview's Running bots card lists them now, and a run's own page
  has Pause and Stop.

**A smaller window shrinks the chart, never the panels.** The left Rules panel,
the Smart orders column and the bottom Positions panel keep the pixel size they
were dragged to when the window changes size; the chart absorbs the whole
difference, both across and down. Before this every panel gave up its share,
and half a window's width left the market list too narrow to read (decided
23 Aug 2026). The panels' own minimums still hold on a screen too small for
everything, and a screen below the wide-screen line keeps its own layout —
the chart as the page with the side panels behind the header's two buttons.

Divider positions and shut panels belong to the account. The trade workspace,
backtest screen and live-run screen all read them with the preference row their
opening request already needs. A first visit after migration brings valid
positions from the seven old browser keys across once. A layout whose panel names
no longer match the screen is ignored, so a redesigned screen opens at its
defaults.

The chart's full-screen view records those positions without replacing the
panel groups. When it exits, the viewport-wide fixed frame comes off before the
recorded percentages are restored. That order matters because the side panels
preserve pixel widths: restoring against the wider frame would make them wider
when the shell returned even though the saved percentages were unchanged.

### What the Positions tab lists

The Positions tab lists everything you are holding **except the coins the Smart
orders panel is already showing on the right** (decided 24 Aug 2026). A ladder's
coin appears there under the strategy that owns it, with what that strategy is
doing, so listing its position here too put the same holding on screen twice and
neither copy said which was which.

There is no filter to switch. The panel on the right is the other half of this
list, not a hidden state, and the old All positions / Manual only dropdown is
gone.

A flow's position stays in this tab. Nothing else on this screen shows it — the
flow's own orders live on that run's dashboard — so leaving it out would be
money with nowhere on the page to see it.

The tab's own count is the number of rows drawn, so the count and the table
never disagree. **Close all is the exception, and it says so**: it closes the
coins a ladder or grid is running as well, so its Positions row can read 5 while
the tab reads 4, and the list names how many of the five are in the panel on the
right rather than in this tab.

Hovering over the Positions tab opens a small popover with the ticker, Type
(the same Long/Short and leverage badge as the table), current value and current profit or loss for every position in
this list. The figures
use the same live prices as the table. Each row is a button that changes the
chart to that market and closes the popover. No popover opens when this list has
no positions. Ticker, Type, Value and Current P&L are sort buttons. Ticker and
Type start alphabetically, while the two money columns start with the largest
figure;
pressing the same heading again reverses its order.
The popover grows with its position rows. It only scrolls when the rows exceed
the space available on screen, leaving room for the column headings.

### Close all, and the list it opens

**Close all** is the middle panel's emergency button. It is a row in the
header's ⋮, and is only there while there is something for it to take off. Pressing it opens a
list rather than doing anything, and the list has three ticks, all ticked
already (decided 24 Aug 2026):

- **Positions** — every open position, real money included. Each real one goes
  through the same close its own row's button uses. They are closed at whatever
  their market costs right now.
- **Watched** — every watched price still waiting. Nothing is bought at it and
  its line leaves the chart. A watch is a row in this app until its level is
  touched, so nothing is taken back off an exchange.
- **Smart** — every ladder and every grid you placed yourself, across every
  wallet, through the same Stop each one has of its own. **It closes nothing.**
  What those orders already bought stays open with its stop still under it.

Untick whatever should stay. Closing what you hold and standing your waiting
orders down are different decisions, and a fast market is exactly when somebody
wants one without the other. Every opening starts with all three ticked again,
because last time's answer was about last time's market.

The button at the foot of the list says **Confirm close all**, and that press is
the confirmation — there is no second window. The three jobs start together and
none of them queues behind another, so a stuck watch can never be the reason
real money stayed open.

The button wears the muted grey and the icon the chart's own toolbar buttons
wear, and its icon is a cross rather than a bin: on the Journal tab it stands
beside **Remove**, which throws records away, and one icon meaning both "delete
these rows" and "sell everything I own" is how a fast press goes to the wrong
button.

#### What the list says before you press

Each row carries its own count, and how much of that count is real money —
"3, 2 real", or just "3 real" when every one of them is, because printing the
same number twice is noise. Under the rows, only the sentences that apply to
what is ticked are shown, so the question stays short enough to actually read
in a hurry:

- Real money gets its own line, counted across only what is ticked, with the
  dollars behind the real positions at today's price.
- **A cancelled ladder loses its plan.** `../rules/trading-rules.md` holds that a rung is
  never written off and a ladder ends only when its rungs are used up, so the
  waiting rungs were the plan, and calling them off ends that ladder for good.
- **A plain order still waiting is left alone**, and the line says how many and
  that any of them can buy back in if it fills. Closing positions without
  taking those off is how an emptied account holds coins again a minute later.
  The line says "waiting" rather than "resting on the exchange", because a
  practice wallet's orders wait inside this app and no exchange has heard of
  them.
- **A coin a ladder or grid is running closes with the rest**, and the line says
  how many, because those coins are listed in the Smart orders panel rather than
  the Positions tab and the row's count would otherwise look wrong.

With nothing ticked the list says so, and Confirm close all is still pressable:
pressing it answers with a toast rather than sitting greyed out with no way to
say why.

What Close all deliberately leaves alone: a flow's orders, because the flow
would place them again on its next pass and standing a flow down belongs on that
run's dashboard; and plain orders resting on an exchange, which are cancelled
from their own chart line or their Open orders row.

A refusal is never dressed up as success. Four called off and two refused says
which two are still running, in the exchange's own words, and the two that
refused come straight back onto the screen instead of staying hidden.

## Where the navigation lives

The sidebar and the signed-in home page are Settings, held in the app's
database — not in code. Trade is a copy of Custom Shell, and an app never edits
a shell file, so these are changed on the Settings screens:

- Settings → Sidebar — the **Trade** link to `/trade`, with no exchange links
  under it since 8 Nov 2026 (migration `0234_trade_menu_one_link.sql`). A
  child link's eye switches that one shortcut off in both the sidebar and the
  sticky header without deleting it.
- Settings → General settings — the admin and member home pages. One that
  still names `/admin/trading-overview` opens the not-found page, so it
  should name `/trade`.
