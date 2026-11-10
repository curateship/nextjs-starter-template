# The Trade dashboard: its page, its blocks and Overview

Trade is one dashboard at `/trade`, in the Admin 3 panel design
(`.agents/skills/Design/admin-3-panel-design/SKILL.md`) with no right panel.
It takes the place of the trading overview and of every exchange's own
dashboard. Tyler asked for it on 8 Nov 2026: "I want to revamp the trade
dashboard and consolidate everything into one 3 panel dashboard. The protocols
now goes into the left panel as a block. The widgets gets moved to the middle
like how shell does it (widgets are not in settings) another big thing is I
dont want a right panel so for the market info, just add the tooltip beside
market ticker on the middle tab." The task is
`workspace/tasks/Platform/one-trade-dashboard.md`.

```
┌──────────────┬────────────────────────────────────────────────┐
│ Trade       ⋮│ Overview picked:                               │
│              │ [PnL Graph ⋮]       [Active Trades ⋮]           │
│ Protocols    │ [Running bots ⋮]    [All trades ⋮]              │
│ ▬ Overview 4 │                                                │
│   Hyperliq 7 │ An exchange picked:                            │
│   Phemex   0 │ [BTC chart ⓘ][Positions][Open orders]           │
│   …          │ [Journal]   Browse market 4h 📈 👁 ⋮            │
│ Rules        │ chart                                          │
│ Grid trades  │                                                │
│ …            │                                                │
└──────────────┴────────────────────────────────────────────────┘
```

## Tyler's rules (8 Nov 2026)

- One address for everything, `/trade`, named "Trade". The old addresses are
  gone, not forwarded: "we dont need to forward old adress as the site is not
  open to public yet". That covers `/admin/trading-overview`, the eleven
  `/protocols/<x>` dashboards and the seven `/admin/<exchange>` redirects.
- Overview is the first row of the Protocols block ("First row of
  Protocols"). Picking it fills the middle with widgets, as the shell's Admin
  Overview does. It is not a tab.
- The other left blocks follow the exchange picked ("The picked exchange"),
  and on Overview they keep showing the last exchange picked ("Last exchange
  you had").
- Each exchange's row counts its open positions ("Open positions").
- All eleven exchanges are listed to start, and the Protocols block's own ⋮
  hides the ones not used, each with an eye (Tyler, 8 Nov 2026: "the
  protocols show and hide should be edited here and use the eye icon with a
  slash to hide/unhide").
- Members see Overview too, with only their own money ("Everyone, own
  money").
- The widget layout is each person's own ("Per account"), in the shell's
  rows, started fresh ("Shell's rows, fresh start"), and offers only Trade's
  six widgets ("Trade's six only").
- `/trade` opens on the row picked last, and on Overview the first time
  ("Last one you had").
- No right panel. Folders and Pin to top are in the chart header's ⋮ ("Chart
  header's ⋮"), and the All markets page was deleted with what was written on
  it ("Delete it").
- One left page, started fresh ("Start fresh"): nothing was copied from the
  old page per exchange.
- The market's facts are a tooltip on an "i" inside the chart tab ("Inside the
  chart tab").
- A phone shows two pills, Page and the picked row's name ("Page and the
  middle").
- The left menu has one Trade link ("One trade link"), and the old exchange
  links are gone ("if we're not using the old protocol links then just remove
  it").

## The address

- `/trade?view=overview` is Overview, and `/trade?view=phemex` is Phemex on
  the market it was last on.
- `/trade?market=<key>` is that market on its own exchange. A market key names
  its exchange, so it wins over `view`. Every link to a coin, from a notice, a
  pinned chip, the scanner or Active Trades, is this form
  (`marketChartHref` in `src/lib/protocols/contracts.ts`).
- `?network=testnet` opens the practice network on an exchange that still
  runs one, Hyperliquid and Aster. On every other exchange it reads as mainnet.
- A bare `/trade` opens on the row picked last, saved on the account the
  moment a row is pressed. Picked rows are saved in `trade_prefs.dashboard_view`,
  and the exchange picked last, which Overview keeps showing on the left, in
  `trade_prefs.dashboard_protocol`.
- The rules live in `src/lib/trade/dashboard-view.ts`.

## The left page

- **One page per person**, the same whichever exchange is picked. Its header
  is the button that hides the panel, "Trade", and the dashboard's ⋮. It is
  stored in `trade_dashboard_pages` (migration `0233_trade_one_dashboard.sql`),
  and the server code is `src/server/trade/pages.ts`.
- **It carries on across a switch.** The page is held above the exchange's
  half of the dashboard, so moving to another exchange never reads it again.
  Words typed in the moment before a row is pressed are saved first.
- **A page can have a cover**, the shell's standard (Tyler, 8 Nov 2026:
  "cover photos is not using shell standard"): the ⋮'s Cover photo row opens
  square tiles, None, Sky (the sky following the real sunrise and sunset of
  Settings → General → Sky city), each picture the page has had, then + for
  the media library. A page keeps up to 8 pictures (`cover_images`, migration
  `0235_trade_page_cover_images.sql`). The rules are the shell's,
  `docs/shell/page-blocks.md`.
- **A page is a writing area with "/" blocks.** Typing "/" at the start of a
  line, or a right-click in the page, opens the list of blocks. Basic blocks
  are the same as every app's: Image, Video, Checklist, Callout, Divider, Fold
  section, Web page, Links. Advanced blocks are Trade's own, below.
- **A page saves itself** 700ms after typing stops, when the page is left,
  and when a row of the Protocols block is pressed.
- **A new page** starts with the Protocols block, then the six trading
  blocks. Nothing is saved until the first edit. A page whose blocks were all
  deleted on purpose keeps only its Protocols block.
- **Lock the notes** is in the ⋮'s General tab. A locked page reads only,
  blocks and all, and the server refuses a save to it. A page the server
  could not read opens locked.
- **The old pages are not read.** The `trade_pages` table, a page per
  exchange and an All markets page, stays in the database untouched until a
  later migration drops it.

## The Protocols block

- **Rows:** Overview first, then each exchange shown, drawn as the shell's
  Dashboards block draws its sections (`DashboardsRows`): names grey and the
  picked one dark, a small bar sliding in before the picked row, and a count in
  a grey pill.
- **Counts:** Overview counts the widgets it shows. An exchange counts the
  trades open on it in every wallet, practice ones too, as Active Trades does,
  read as the dashboard opens and every thirty seconds while the browser tab
  is visible. An exchange with a wallet that did not answer shows no number
  rather than a short count (`loadOpenPositionCounts` in
  `src/server/trade/trading-overview.ts`).
- **A press** picks the row at once and switches after the bar has grown.
- **Fixed:** the block is always on the page, as Admin's Dashboards block is.
  It has no bin; its ⋮ ends with Move up and Move down, and it is never
  offered in the "/" list. A page saved without it gets it back at the top
  when it is read.
- **Hiding an exchange:** the block's ⋮ lists every exchange, an open eye on
  one that shows and an eye with a slash on one that is hidden. One press
  swaps it, saved at once on the account (`trade_prefs.hidden_protocols`),
  and the menu stays open for the next. The eyes work on a locked page too;
  only the moves need it unlocked. Hiding the exchange on screen keeps its
  row until another row is picked.
- **Names fit.** The name takes the room the count leaves and shortens only
  when there is none, so at the left panel's narrowest every name shows in
  full, "Robinhood Chain" included.

## Trade's blocks

Each block is a folding card, drawn as the shell's blocks are and following
Settings → Styling → Blocks: its corners, its grey (the Shade) and the white
tile's inset, a little see-through and frosted over a cover (Tyler, 8 Nov
2026: "This should follow settings shade"). The tile is the card colour, so
it is right in the dark theme too. A table's heading and totals rows are the
tile's colour, and the line under them is the Divider lines colour alone
(Tyler, 8 Nov 2026: "this border here is not wired to the styling setting").
The heading is the block's name, then the block's ⋮ (Tyler, 8 Nov 2026: "this
is suppoosed to be a 3 dot dropdown with delete in the bottom"): the block's
own rows, then Delete block at the bottom under a line, as the shell's blocks
have. There is no bin. Blocks sit 15px from the panel's sides, 15px apart, and the first one
15px under the header. With Settings → Styling → Blocks → Edge to edge on,
the Trade blocks (Protocols, Grid trades and the rest) reach the panel's left
and right edges instead, as the shell's app blocks do (Tyler, 9 Nov 2026:
"the trade dashboard block edge is not wired to panel settings"). Image,
video and link blocks keep the 15px either way. An empty line above a block goes with Backspace or
Delete. A click in the space above the first block, or between two blocks,
starts a line there to write on. The panel inside a block is one white tile 3px
inside the grey block. Pressing the name folds it, and this browser remembers
the fold. A block keeps no values of its own: it draws the same live panel the
dashboard always had, for the exchange picked. Each page holds each block once
at most.

| Block | What it shows |
|---|---|
| Protocols | Overview and the exchanges, above |
| Rules | The rules that check the next real-money entry, `../orders/rules-before-an-entry.md` |
| Manual trades | The orders waiting at a price, `../orders/watched-orders.md` |
| Grid trades | Grids you placed, with the count, value and PnL row |
| DCA trades | DCA ladders you placed, with the same totals row |
| Scanner | The market scanner's matches, its cog and broom in the heading, `market-scanner.md` |
| Folders | The folders and their coins; a new folder and Manage folders in its ⋮, `market-folders.md` |

- **The totals row has no lines** above or below it (Tyler, 10 Nov 2026:
  "Remove footer borders"). Its shade alone sets it apart. The Positions
  table's total keeps its lines.
- **Hiding columns:** Manual trades, Grid trades and DCA trades each list
  Avatar, Type, Value and PnL in their ⋮, an open eye on a column that shows
  and an eye with a slash on one that is hidden (Tyler, 10 Nov 2026: "I want
  to hide certain col in the dropdown here ... I want to hide avatar, type
  value and pnl", then "All three, each its own"). One press swaps it and the
  menu stays open. Avatar is the coin's picture beside the ticker; Ticker
  always shows. The totals row drops the same columns, so each sum stays under
  its heading, and "10 trades" wraps onto two lines in a narrow block rather
  than run into the Value sum. Rows sorted by a column that is then hidden
  keep that order.
  Each block keeps its own list, saved on the account
  (`trade_prefs.hidden_block_columns`, migration
  `0248_trade_hidden_block_columns.sql`), and the ⋮ works with the page locked
  too.

- **Hide empty blocks**, in the page's ⋮ → General, On or Off, saved on the
  account (`trade_prefs.hide_empty_blocks`, migration
  `0236_trade_hide_empty_blocks.sql`; Tyler, 8 Nov 2026: "why is the block
  with no trades on it not hiding?", then "1"). On, Manual trades, Grid trades
  and DCA trades leave the page while they have nothing to show on the
  exchange picked, and come back as soon as they do. Each panel says when it
  is empty, because only it knows what it lists: still reading is not empty,
  a coin held by hand is a Manual trades row, and a failed read is never
  empty, so its Try again stays reachable. A hidden block stays on the page
  underneath, so moving or deleting blocks around it works as before. The old
  "Hide on empty" in View options did this for the three panels until 7 Nov
  2026.
- **No Alerts block.** Alerts are a tab of the page's ⋮ since 8 Nov 2026
  (Tyler: "Put the alerts archive here and remove the alert block. We already
  have these alert in the notification tray so I dont think we need the
  block"). A page that held the block loses it the next time it is read.
- **Counts on a heading.** Scanner counts new matches since the block was last
  open.
- **Picking a coin in a block** puts it on the chart, which also leaves
  Overview for that coin's exchange. On a narrow screen it switches to the
  chart.
- **The Rules block is drawn by the chart.** With no Rules block on screen
  (the panel shut, full screen, or none on the page), the Rules card sits over
  the chart instead, unless Settings, Trading rules switched it off.
- **Manage folders** opens from the Folders block's ⋮ as a popover beside the
  block, over the middle; the page stays where it is underneath.
- **The last block fills the panel** (Tyler, 8 Nov 2026: "always make it fill
  all available space"). The last block on the page that shows, while it is
  open, reaches the panel's bottom with the 15px gutter under it, and its
  list scrolls inside it. The page then fits the panel exactly, so there is
  one scrollbar, the list's (Tyler, 8 Nov 2026: "theres 2 areascroll here"):
  the page's empty last line and the writing area's bottom padding take no
  room meanwhile. Words written on that last line bring it back, and the
  block stops filling. With less than 240px left under it, it keeps its own
  height and the page scrolls as before. A block hidden by Hide empty blocks
  does not count as last.
- **Block titles stay on one line.** A title too long for a narrow panel
  shortens with "…" rather than breaking mid-word.

## The dashboard's ⋮

The ⋮ in the left page's header is the tabbed menu of grouped rows, as the
Admin page's is. Every row saves itself. It opens to the right, over the
middle, from the ⋮ (Tyler, 8 Nov 2026: "the left panel dropdown to align
right").

- **General:** the page's Cover photo and Hide empty blocks, then Lock the
  notes.
- **Widgets:** Overview's Rows (Top row 1 to 4 columns, Bottom row None or 1
  to 4), then a spot picker for each spot, as the shell's Widgets tab is.
  Widgets are not in Settings any more.
- **Alerts:** the price and drawing alerts, Fired and Alert, as the Alerts
  block held them (`price-alerts.md`). It carries no count; a fired alert is
  told by the bell's tray.

## Overview

- **Where it sits:** straight on the dashboard beside the left page, with no
  panel or header of its own, taking the room the chart has on an exchange.
  The chart and its tables stay mounted under it out of sight, so going back
  to the exchange draws nothing again. Full screen (F) does nothing on
  Overview.
- **The widgets:** PnL Graph, Active Trades, Running bots, Profit calendar,
  All trades and Moving now, each in the shell's widget card with its name,
  a count where it lists rows, its own buttons, and its ⋮ to swap it or
  remove it. The buttons sit in the card's heading beside the ⋮ (Tyler, 8 Nov
  2026: "move the buttons here"): Filter on Active Trades and All trades, the
  period tabs and dates on PnL Graph, All markets on Moving now. When a card
  is too narrow for them beside its name, they and the ⋮ go to a second line
  under it.
- **Spacing:** the widgets sit the site's gutter apart, from Settings →
  Styling, the same gap the panels keep (Tyler, 8 Nov 2026: "the widgets
  doesnt follow the gutter settings"). An empty
  spot reads "Add a widget". `trading-overview.md` explains what each one
  shows.
- **A fresh start:** PnL Graph and Active Trades on top, Running bots and All
  trades under them. Profit calendar and Moving now wait in the Widgets tab.
- **Saved per person** in `trade_prefs.overview_widgets`, cleaned on the
  server against Trade's six. The older top, left and right arrangement in
  `dashboard_widgets` is not read.
- **Figures:** read as Overview opens and every fifteen seconds while the
  browser tab is visible, `useTradingOverview` in
  `src/components/trade/trading-overview-dashboard.tsx`. The first read asks
  every exchange and takes a few seconds; "Reading your overview" shows until
  it lands. A failed later read keeps the last figures on screen.
- **Members** open their own Overview: the reads ask only for a signed-in
  person (`src/lib/api/trade/trading-overview.ts`).
- **Wide**, the two rows share the height and a long list scrolls inside its
  card. **Narrow**, the widgets stack at their own height and Overview
  scrolls.

## An exchange in the middle

- **Tabs:** `[BTC chart ⓘ] [Positions] [Open orders] [Journal]`, names and
  counts with no icons (Tyler, 8 Nov 2026: "remove the icons in the middle
  tabs"). The chart tab is named after the market. Every tab keeps its name;
  a header too narrow for them all scrolls its tab row sideways. The tab is remembered in this browser.
- **The "i" inside the chart tab** shows the market's facts on a pointer:
  exchange, network, price tick, list price, chart bars, daily volume, pool
  liquidity where the venue gives one, smallest order and top leverage. A
  press on the "i" stays the "i"'s and never switches tab.
- **One header:** the tabs, drawn as Settings → Styling → Dashboard tabs
  says, grey pills or words over a sliding line (Tyler, 8 Nov 2026: "wire the
  tabs to the dashboard tab option in settings"), then on the right Browse
  market, the timeframe in its grey track, Indicators, View options and the
  ⋮. Browse market sits just before the
  timeframes (Tyler, 8 Nov 2026: "move the brwose market button here"). It is
  drawn as a search box reading "Search markets" (Tyler, 10 Nov 2026: "turn
  the browse button into a search box and clicking it will open the browse
  market modal"). It is 126px wide and 168px on a wide screen, 30% narrower
  than the toolbar search ("reduce the search field by 30%"). A press opens the
  market list with the cursor already in the list's own search box, so typing
  starts at once. On a phone it is the magnifier alone, and the list opens
  without raising the keyboard.
- **The ⋮** holds Wallet, then the market's Folders and Pin to top, then Close
  all while there is something for it to take off. Its rows are 32px high
  (36px before 10 Nov 2026, when Tyler asked to "Reduce the spacing a bit").
  The Folders row shows the market's first folder as a grey chip, then a
  second chip counting the rest, such as "+1", or "None". Folders lists every folder
  of this exchange with the market's ticked; one press adds or removes it and
  the list stays open, and "New folder" at the foot starts a folder with this
  market in it. Pin to top is On or Off, one press, `pinned-markets.md`.
- **Full screen** (the button in the chart's corner, or F) hides the left
  panel and the tab row and keeps the same chart on screen. Escape puts the
  panel back.

## Widths and narrow screens

- **Widths:** the left panel opens at its narrowest, the left width set in
  Settings → Styling → Side panels, as every shell dashboard does (Tyler,
  9 Nov 2026: "the panel width is also not wired"). At 12% that is 150px of
  the dashboard at 1440 wide. It drags to 36%, and the middle is at least
  32%. A dragged width is kept in this browser, as on every shell dashboard,
  under `trade-workspace-horizontal-5:` plus the setting's widths (`:12-0`
  at 12%). Changing the setting starts the panel from the new width, and
  Settings' Reset panels button forgets the dragged one (Tyler, 10 Nov 2026:
  "yea fix it"). A shut panel is kept shut the same way. Full screen never saves a width. Until
  10 Nov 2026 the width was saved on the account under
  `trade-workspace-horizontal-4`; the server no longer reads that copy.
- **Shutting the left panel:** the button in its header, a double-click on its
  blank space, or a drag. On an exchange, a button at the start of the middle
  header brings it back, before the tabs, as on the shell's dashboards (Tyler,
  8 Nov 2026: "put the uncollapse here like how shell does it"). Overview has
  no header, so a slim tab at its edge brings it back there, as on the
  shell's Overview.
- **Under 1280px** one panel shows at a time behind two pills: Page, and the
  picked row's name (Overview, or the market's symbol).

## The left menu

The left menu's Trading overview link became the Trade link to `/trade`, and
the exchange links under it were removed, in every site's saved menu
(migration `0234_trade_menu_one_link.sql`). Every other link is untouched.
