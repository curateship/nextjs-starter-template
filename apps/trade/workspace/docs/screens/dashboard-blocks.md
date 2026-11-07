# The dashboard's pages and blocks

Every protocol dashboard (`/protocols/hyper-liquid` and the rest) is three
panels in the Admin 3 panel design
(`.agents/skills/Design/admin-3-panel-design/SKILL.md`). Tyler asked for it on
7 Nov 2026: "Left panel have blocks editor and we turn rules, folders,
scanners, alerts, grid trades, dca trades and manual trades into blocks. The
right panel now house the market itself detail informations with its own
blocks and we move the add to folder and pinned function there. We also need
to remove the bottom panel and move into the middle panel as tabs so it looks
like this [marketname chart][positions][journal]".

```
┌──────────────┬───────────────────────────────────┬──────────────┐
│ Hyperliquid ⋮│ [BTC chart][Positions][Open orders]│ BTC        ⋮ │
│              │ [Journal]  Browse market 4h 📈 👁 ⋮│              │
│ Rules        │                                   │ Market info  │
│ Manual trades│                                   │ notes...     │
│ Grid trades  │ chart                             │              │
│ DCA trades   │                                   │              │
│ Alerts       │                                   │              │
│ Scanner      │                                   │              │
│ Folders      │                                   │              │
└──────────────┴───────────────────────────────────┴──────────────┘
```

## The two pages

- **The left panel is the exchange's own page.** One page per exchange, so
  Hyperliquid and Phemex each keep their own. Its header is a button that
  hides the panel (Tyler, 7 Nov 2026: "add a collasible icon here to collapse
  the left panel"), the exchange's name and ⋮ My settings.
- **Each page can have a cover photo**, from the media library, lying faintly
  behind the panel's header and fading into the page, as Project's team and
  project pages do (Tyler, 7 Nov 2026: "both panel is missing cover photo").
  It is set in the page's ⋮ and stored with the page (`cover_url`, migration
  `0219_trade_page_cover.sql`).
- **The right panel is the market's page.** One page per market, so BTC and
  ETH each keep their own notes. Its header is the market's own icon (Tyler,
  7 Nov 2026: "Add the market favicon"), its name, the market ⋮, and a button
  at the outer edge that hides the panel ("add a collapsible icon here").
- **Both side headers keep the same edges:** the first icon sits 16px in from
  the panel's outer edge on the left, and the collapse icon 16px in on the
  right ("padding is not consistence"). There is no bell beside it: a market has nothing to follow
  (Tyler, 7 Nov 2026).
- **A page is a writing area with "/" blocks.** Typing "/" at the start of a
  line, or a right-click in the page, opens the list of blocks. Basic blocks
  are the same as every app's: Image, Video, Checklist, Callout, Divider, Fold
  section, Web page, Links. Advanced blocks are Trade's own, below.
- **A page saves itself** 700ms after typing stops, when the page is left,
  and when another market is picked. Words typed on one market's page are
  always saved to that market, never to the next one.
- **A new page is not empty.** An exchange's page starts with all seven of its
  blocks, so nothing that sat on the dashboard before 7 Nov 2026 goes missing.
  A market's page starts with Market info. Nothing is saved until the first
  edit. A page whose blocks were all deleted on purpose stays empty.
- **Lock the notes** is in each page's ⋮. A locked page reads only, blocks and
  all, at full strength, and the server refuses a save to it. Locking a page
  that was never written keeps the starting page it showed.
- **A page the server could not read opens locked**, so nothing typed can
  overwrite words that were only out of reach for a moment.
- Pages are stored in the `trade_pages` table, one row per person, exchange
  and market (`""` for the exchange's own page), from migration
  `0218_trade_pages.sql`. The server code is `src/server/trade/pages.ts`.

## Trade's blocks

Each block is a folding card: a light grey box whose heading is the block's
name. Blocks sit 15px from the panel's sides, 15px apart, and the first one
15px under the header, the panel's own gutter (Tyler, 7 Nov 2026: "This should
be the gutter size for the blocks"). An empty line above a block goes with
Backspace or Delete, so a block can always be brought to the very top. A
click in the space above the first block, or between two blocks, starts a line
there to write on (Tyler, 7 Nov 2026: "cant click here"). The
panel inside a block is one white tile 3px inside the grey block, a thin grey
frame round it; a table's heading
and totals rows are white inside it, so the corners show. Pressing the name folds it, and this browser remembers the fold. The
bin sits in the heading row while the page can be written in. A block keeps
no values of its own. It draws the same live panel that used to sit in its own
column or behind a header button, with the same reads, so nothing about
trading changes. Each page holds each block once at most.

| Block | Page | What it shows |
|---|---|---|
| Rules | Exchange | The rules that check the next real-money entry, `../orders/rules-before-an-entry.md` |
| Manual trades | Exchange | The orders waiting at a price, `../orders/watched-orders.md` |
| Grid trades | Exchange | Grids you placed, with the count, value and PnL row |
| DCA trades | Exchange | DCA ladders you placed, with the same totals row |
| Alerts | Exchange | Fired and waiting price and drawing alerts, `price-alerts.md` |
| Scanner | Exchange | The market scanner's matches, its cog and broom in the heading, `market-scanner.md` |
| Folders | Exchange | The folders and their coins, plus and cog in the heading, `market-folders.md` |
| Market info | Market | The facts behind the info button: exchange, network, price tick, daily volume, smallest order, top leverage |

- **Counts on a heading.** Alerts counts what fired since the block was last
  open, and Scanner counts new matches the same way. An open block counts what
  it shows as seen.
- **Picking a coin in a block** puts it on the chart. On a narrow screen that
  also switches to the chart.
- **The Rules block is drawn by the chart.** With the left panel shut, in full
  screen, or with no Rules block on the page, the Rules card sits over the
  chart instead, unless Settings, Trading rules switched it off.
- **The folder manager** opens from the Folders block's cog and takes the
  page's place in the left panel until it is closed.

## The market ⋮

The right panel's ⋮ is the tabbed menu of grouped rows, 20.4rem wide, built
from the standard rows: the name muted on the left, the value on the right,
then an arrow (Tyler, 7 Nov 2026: "the settings dropdown options needs to
follow standard"). Its General tab holds a "This market" group (Folders, Pin
to top) and a "Page" group (Cover photo), then Lock the notes. The left
panel's My settings holds the same "Page" group and the lock.

- **Folders** lists every folder of this exchange with the market's ones
  ticked. One press adds the market to a folder or takes it out, and the list
  stays open for the next. "New folder" at the foot names a folder that starts
  with this market in it. This is what the star in the chart header did.
- **Pin to top** is On or Off, one press, and puts the market's chip in the
  header's pinned row, `pinned-markets.md`.
- **Cover photo** reads None until one is added, and opens a small box with
  the upload.
- **Lock the notes** sits under the group.

## The middle panel

- **Tabs:** `[BTC chart] [Positions] [Open orders] [Journal]`. The chart tab
  is named after the market. Open orders kept a tab of its own (Tyler, 7 Nov
  2026). The tab is remembered in this browser and starts on the chart.
- **The chart stays mounted** under the other tabs, so its live feed and
  drawings never reload when a table is looked at. Picking a Journal trade or
  pressing Add on a position goes back to the chart tab.
- **One header only** (Tyler, 7 Nov 2026: "There should only be one middle
  header"). It starts with Browse market, then the tabs, then the timeframe,
  Indicators and View options, then the ⋮. Indicators and View options are buttons of their
  own ("move the view options and indicatior buttons outside of the
  dropdown").
- **Browse market** opens the full market picker (Tyler, 7 Nov 2026: "Add
  another button called "Browse market" to open market picker"). It is the
  header's one primary button, at the UI standard's 32px, at the start of the
  header before the tabs ("make it primary and put it here"). The market's facts are the Market info block on the
  right.
- **The ⋮** is the last thing in the header and holds Wallet, naming the
  wallet in use, and Close all (Tyler, 7 Nov 2026: "Move the close all into a 3
  dotted dropdown" and "Move the wallet into the 3 dotted dropdown"). Close all
  shows only while there is something for it to take off.
- **A narrow middle panel**, under 1100px, keeps the word on the open tab only
  and shows just the picked timeframe, so the one header still fits.
- **Full screen** (the button in the chart's corner, or F) hides both side
  panels and the tab row and keeps the same chart on screen. Escape puts the
  panels back as they were.

## Widths and narrow screens

- **Widths:** each side panel opens at 16% and drags to 36%; the middle is at
  least 32%. Widths are saved on the account, so they follow you to another
  machine. The layout key is `trade-workspace-horizontal-2`, so a width saved
  for the old four-panel dashboard is not applied.
- **Shutting a side panel:** double-click its blank space, or drag it shut. A
  slim tab at the chart's edge brings it back.
- **There are no saved layouts.** Tyler removed them on 7 Nov 2026 ("also
  remove the saved layout feature"). Named layouts still stored on an account
  are not read, and go at its next width save.
- **Under 1280px** one panel shows at a time behind a pill row: Blocks, the
  market's name, Market. It opens on the chart.
