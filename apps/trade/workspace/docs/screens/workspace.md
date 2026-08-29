# The Trade workspace

Four areas on each exchange screen, at `/admin/hyper-liquid`, `/admin/phemex`,
`/admin/kucoin`, `/admin/aster`, and `/admin/lighter`.

```
┌────────────┬─────────────────────┬────────────┐
│ Folders    │ MARKET HEADER       │ Account    │
│  Watched   │ ─────────────────── ├────────────┤
│  Fav …     │ Chart               │ Order      │
│  All       │                     │            │
├────────────┴─────────────────────┴────────────┤
│ Positions | Open orders | Fills                │
└───────────────────────────────────────────────┘
```

- **Left — one Folders panel** (decided 23 Aug 2026, replacing the market
  list panel that sat above it). Every row wears a folder's shape and opens
  in place: **Watched first** — it lists orders rather than markets, see "The
  Watched row" below — then the saved folders, then **All markets** last with
  its sort headers. Live exchange data. The panel opens on Watched.
- **Middle — the market you picked.** One header row, nothing more: the
  star for that market, the market's own logo (carried as data on the row,
  with a first-letter circle when an exchange has no art), its name, and on
  the right the timeframe dropdown (1m–1d, remembered per browser, 4h the
  default), the indicator button and the view button. The indicator button's
  small count says how many indicators are on. Each control uses the muted gray
  inside its border, while the rest of the header keeps the card background.
  The market dropdown uses the same light gray as the other header buttons.
  The star is amber and filled when the market is in any folder and a hollow
  outline when it is not, so the two do not differ by colour alone. An empty
  star names the Fav action. A
  filled star names the folder menu. The star
  leads the row so that the name is what gives way as the panel narrows. On a
  phone the timeframe row leaves the name no width at all, and anything behind
  the name would never be on screen. The star has its own outlined button. The
  market logo, name, top leverage, arrow and info button sit in one outlined
  group. The leverage is secondary 12px text beside the larger market name.
  Every control in that row is 32px high. Pressing the market name
  opens the full market picker: search; segmented tabs; sortable figures; and
  a star on every row. Favorites, All and Trending are always there. Phemex and
  KuCoin stop there because every market is crypto. Hyperliquid also has Crypto,
  TradFi and HIP-3. Aster adds Crypto and TradFi only while its current list
  contains something outside crypto. An exchange omits funding or open
  interest when it cannot fill that column. Moving to an exchange that lacks
  the current sort returns the list to daily volume. Picking a market adds it
  to browser history, so Back returns to the market that was on screen before
  the pick. Below,
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
- **Middle header, Wallets.** The wallet control sits after the chart controls.
  It names the wallet in use, separates the name and total with " - ", then
  shows the made-or-lost figure. On a phone it becomes a wallet icon with a
  Manage wallets tooltip, so the header does not scroll sideways.
  Pressing the control opens Active, All and Inactive above the chart. Active
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
- **Right, Smart orders and Bots.** The wallet block no longer takes the top of
  this column. Smart orders and Bots use the full height.
- **Bottom, what you are holding.** Positions, open orders and fills, as tabs.

**Every workspace panel header uses `DashboardCardHeader`.** The header is 57px
tall with 12px on its top, left and right around the shared 32px controls. Title
rows, tab rows, the market picker, feed cards and chart cards all render through
that one component. A panel body that begins directly under the header also
uses 12px. The tab strip immediately behind the buttons uses the same light
gray as the market control in the middle panel. The selected tab uses a small
shadow instead of a black underline. The component and its tabs live in
`src/components/shared/dashboard-card-header.tsx`, changed in Custom Shell first
and carried here unchanged.

The right panel opens on **Smart orders**. The Smart orders tab keeps the
hand-placed ladders and grids it already showed. The header has only the Smart
orders and Bots tabs, with no working, holding or running summary beside them.
The **Bots** tab lists every running bot for the exchange on the page. Each row
shows the bot's name, strategy, banked money, and how many of its coins are
working. A bot with no closed trade shows a dash for money, never a made-up
zero. The name opens that run's results dashboard. A stopped bot leaves the
list on the next read.

The row's three-dot button opens the same small popover shape as a wallet row.
It shows the wallet, real or practice money, closed trades, working and held
coins, and when the bot was switched on. Pause leaves every order and position
where it is. Stop opens the shared confirmation before it calls off orders
that have not bought anything. Coins already held keep their stops and targets.

The Bots tab has a cached first answer when the dashboard opens, then asks for
a fresh one as soon as the tab is pressed. The cached rows stay on screen while
that answer lands. While Bots stays open, the list checks again every six
seconds. A failed first read says the bots could not be read and offers Try
again. A later failure keeps the last answer on screen and says the refresh
failed. An empty answer says no bot is running on this exchange.

**A smaller window shrinks the chart, never the panels.** The Folders panel,
the Smart orders column and the bottom Positions panel keep the pixel size they
were dragged to when the window changes size; the chart absorbs the whole
difference, both across and down. Before this every panel gave up its share,
and half a window's width left the market list too narrow to read (decided
23 Aug 2026). The panels' own minimums still hold on a screen too small for
everything, and a screen below the wide-screen line keeps its own layout —
the chart as the page with the side panels behind the header's two buttons.

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

### Close all, and the list it opens

**Close all** is the bottom panel's emergency button. It sits in the tab row,
uses the same light gray as the market dropdown, and is only there while
there is something for it to take off. Pressing it opens a
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

- Settings → Sidebar — the **Trading overview** link to
  `/admin/trading-overview`. A child link's eye switches that one shortcut off
  in both the sidebar and the sticky header without deleting it.
- Settings → General settings — the admin and member home pages, both
  `/admin/trading-overview`.
