# The Bots dashboard: Recipes, Backtests and Bots

Bots is one dashboard at `/bots`, in the Admin 3 panel design
(`.agents/skills/Design/admin-3-panel-design/SKILL.md`). It takes the place of
six screens: the Recipes table and each recipe's canvas, the Backtests table
and each backtest's page, and the Live runs table and each bot's page. Tyler
asked for it on 9 Nov 2026: "do you think it make sense to combine the
automation, backtest and bot dashboard into one 3 panel dashboard like in
shell?". The task is `workspace/tasks/Platform/bots-dashboard.md`.

A recipe is the plan. A backtest is that recipe run with pretend money, and a
bot is the same recipe run on a real or practice wallet.

```
             Left: page              Middle                                Right
Overview     Dashboards block        widget cards (no right panel)         none
Recipes      Dashboards block        recipes table (a line opens it)       none
Backtests    Dashboards block        backtests table (a line picks it)     the line's Result card, Open chart
Bots         Dashboards block        bots table (a line opens it)          none
Open recipe  Dashboards block        step list | ← name, status,           the step picked; with none,
                                     Backtest, ⋮; canvas                   Last result and Parameters
Open backtest Dashboards block       [Chart|Graph], chart                  Result, Trades and Skipped
                                                                           cards, Stop
Open bot     Dashboards block        [Chart|Graph], chart                  Result card, Trades card
                                                                           [Traded | Coins], Pause/Stop
                                     a coin pressed in Trades opens its trades in a popover over the chart
```

## Tyler's rules (9 Nov 2026)

- Its own dashboard named Bots, at `/bots` ("Own dashboard, Bots"). One Bots
  link in the left menu replaces the Recipes, Backtests and Live runs links.
  The old addresses are gone, not forwarded, as `/protocols` went.
- Admins only ("Admins only"). A member who opens `/bots` is sent to `/home`.
  A backtest and a bot both start from a recipe, and only an admin can make
  one.
- An opened line fills the middle ("1"): a backtest's or bot's chart. Its
  trades sat in a panel under the chart until 10 Nov 2026, when Tyler asked
  for them in a popover instead (see "Tyler's rules (10 Nov 2026)").
- The left panel is always the page ("if we combine all the sidebars,
  there's like 3 sidebar on the left"). Nothing opened ever swaps it. The
  recipe's step list (10 Nov) is a panel of its own after the page, never in
  its place.
- An Overview row comes first ("Overview first"), with widget cards in the
  shell's rows.
- Running bots is on both Overviews, the Trade dashboard's and this one
  ("Both dashboards"). A row opens that bot here.
- A recipe's line opens its canvas at once ("clicking on the recipe should
  just go to the canvas. it doesnt need to load the right sidebar"), so the
  Recipes table has two panels, page and table. An open recipe's right panel
  is the picked step, or with none picked its Last result and Parameters
  cards (Tyler, 11 Nov 2026, replacing his 9 Nov "just dont show the right
  panel until a node is clicked on").
- Backtests and Bots open the same way ("we dont need the right panel for
  backtest dashboard. it should go straight to the result chart. same with
  bots dashboard"): a line opens its chart, and the tables have no right
  panel.
- Result on an open recipe (Results until 10 Nov) is greyed out with a
  tooltip while there is no backtest yet ("Just remove the toast altogether and gray out the result tab
  if no result is ready with a tooltip").
- Search and Mass select are in the middle header's ⋮, as on the CRM ("Inside
  the ⋮, like CRM"), not buttons of their own.

## Tyler's rules (10 Nov 2026)

- **The recipe's steps go back on the left, as Automations draws them** ("In
  recipes, I want to put that back into the left panel, look at how
  automation dashboard does it and copy its design pattern"). An open recipe
  is page | step list | canvas | picked step; the + Add step button by the
  zoom bar is gone. `../recipes/dashboard.md` has the details.
- **A run's right panel is cards, not tabs** ("remove the tabs and put them
  into collapsible cards instead, first card is the figures card (rename to
  Result) second card is "Trades" that shows all the tickers and a tab in that
  second card is "Skipped" showing all the skipped markets"). A bot gets the
  same two cards; its Trades tabs are Traded and Coins.
- **A coin's trades open in a popover you can pin and drag, and the bottom
  panel goes** ("Clicking the market in the card open up a popup showing
  trades within that market and with the ability to pin the popover and able
  to drag it around and remove the bottom panel"), on a backtest and a bot
  alike ("Backtest and bot").
- **No success toasts** ("Remove all success toast", then "All of trade and
  shell too"). `no-success-toasts.md` has the rule.

## The left panel

- **The page:** one per admin (`trade_bots_pages`), started fresh, written on
  like every page in the design, with the shell's basic "/" blocks. Trade's
  trading blocks need an exchange, which this dashboard has none of, so they
  are not offered.
- **The Dashboards block:** fixed at the top of a new page, never in the "/"
  list, moved with its ⋮. Its rows are Overview, Recipes, Backtests and Bots.
  Overview counts its widgets, Recipes every recipe, Backtests every run not
  archived, and Bots the bots still switched on (running, waiting, paused or
  stopping). The counts are read again after each section switch and after a
  change.
- **Its ⋮:** General (Cover photo, Lock the notes) and Widgets (the Overview's
  two rows).

## The middle

- **One header:** the section's icon and name, the "N selected" menu while
  lines are ticked, Filter (Backtests: Show archived), New recipe (Recipes
  only; Backtests and Bots have none, because those only come from a run),
  then the ⋮ with Search and Mass select. The tables have no right panel, so
  there is no button to reopen one.
- **The tables:** the shell's CRM table. Names are grey, dark when pointed at
  or open, with the sliding bar before the open line. Columns drop out as the
  middle narrows. A right-click on a line offers Mass select, Duplicate
  (recipes) and Delete.
- **What each table keeps:** pinned backtests stay on top; bots still switched
  on stay above finished ones, and only finished bots can be ticked or
  deleted. While a backtest runs the table reads again every two seconds, and
  while a bot runs every five.
- **Delete and select-all say why rather than greying out.** Delete on a bot
  still switched on, and the Mass select box with no stopped bot to tick, stay
  pressable and say why in an error toast ("Stop this bot first. A bot still
  switched on holds its wallet, so it is never deleted."). Backtests' box says
  there are none to tick.
- **The live re-reads:** they pause while the browser tab is hidden, and a
  failed one shows "Couldn't refresh" with Try again under the header, so old
  figures never sit there looking current.
- **A duplicated recipe** lands under the one it came from and is picked.
- **An opened line:** the line's own header becomes the middle's one header,
  with the back arrow first. Back returns to the table with the same line
  picked, and so does pressing the section's own row in the Dashboards block
  ("if im in the canvas, clicking the sidebar link here doesnt work").

## The right panel

- **Every right panel's header starts the same way:** the Recipe, Backtest
  and Bot panels and a recipe's step have their icon at the header's own
  padding, 10px to the title, in the dashboard heading's type, over the
  panel's blue cover, with no grey line under the title (Tyler, 11 Nov 2026:
  "all the nodes header still need to inherate the background too", "the
  overview right panel header and the nodes header alignment is not the
  same", "Copy the node header left padding"). `RightPanelHeading` in
  `bots-record.tsx` draws it for all four.
- **The Backtests table has one:** a line picked shows its Result card on
  the right, with **Open chart** in the footer, which opens its chart and
  graph in the middle (Tyler, 10 Nov 2026: "clicking on the table item should
  open up the right panel to show the results and in the footer have a button
  to click on to show the chart and graph"). Back from the chart returns to
  the table with that line still picked.
- **Each Backtests line ends in three buttons:** a chart, which opens that
  run's chart straight away, the recipe's icon, which opens the recipe it
  ran on its canvas, and the bin (Tyler, 11 Nov 2026: "replace this icon to
  a chart icon and clicking on it goes to the chart page. Beside it add
  another icon that links to the canvas recipe"). The chart took the cog's
  place.
- **The Recipes and Bots tables have none** (Tyler, 9 Nov 2026: "we dont need
  the right panel for backtest dashboard. it should go straight to the result
  chart. same with bots dashboard"). A line opens its record in the middle in
  one click.
- **An opened backtest:** the header says Backtest, then the button that
  folds or opens every card, the backtest's ⋮ (the Name, Pin to top, Archive,
  Delete in red under a line) and the collapse button. Under it, the Result
  card, the Trades card and the Skipped card, and Stop in the footer while it
  runs, which asks first. `../backtests/backtest-screens.md` has the cards
  and the trades popover.
- **An opened bot:** the same, headed Bot: Result, then Trades (Traded |
  Coins); the bot's ⋮ (Delete, which says why while the bot is switched on: a
  run is a record of money that moved, and one still switched on is stopped,
  never deleted), and Pause, Stop and Run again in the footer. A coin pressed
  in Trades opens that coin's finished trades in the same popover as a
  backtest's. Its ⋮ hides Market, Opened, How it ended, Amount, Made or lost,
  Return and Running total, kept on the account apart from a backtest's;
  Closed always shows. The bot's chart already opened at the Trade chart's
  saved view, and still saves back to it when panned.
- **The cards** are the shell's `PanelCard`, folded or open per card in this
  browser; the right panel scrolls as one column.
- **An opened recipe:** no right panel until a step is pressed on the canvas
  or in the step list; then that step's settings ("Not added yet" with Add
  step and Cancel for one pressed in the list). Clicking the empty canvas
  closes it. A step on the canvas is `?node=` in the address, so a reload
  keeps it.

## Overview

Two panels, the widgets taking the right panel's room, under the same width
key as the tables and a canvas with no step picked. The one widget so far
is Running bots, the same card the Trade Overview has; widgets for backtests
come later. The layout is each admin's own, in `trade_prefs.bots_widgets`,
apart from the Trade Overview's, and starts as Running bots across the top
row. Its figures are read again every fifteen seconds while the tab shows.

## The address

`/bots?view=overview|recipes|backtests|bots&open=<id>&full=1&coin=<market>&node=<step>`,
read by `src/lib/bots/bots-search.ts`. `open` is the line picked and `full`
opens it in the middle. Picking a line replaces the address; opening it adds
to the history, so Back closes it. A bare `/bots` goes back to the place last
open in this browser; a first visit opens Overview.

## Where the old links went

Migration `0242_trade_bots_dashboard_links.sql` moves what was saved:

- A bot's bell notice opened `/flow-runs/<id>`; it now opens that bot here.
- In each site's left menu, every link to `/admin/recipes`, `/backtests` or
  `/flow-runs` comes out. The first top-level one becomes the Bots link,
  keeping its place, icon and who can see it; whatever was nested under a
  removed link moves up into its place. A menu whose old links were all
  nested gets Bots after Trade.
- The members' and app roles' menus lose the old links with no Bots link put
  back, since the dashboard is admins only.

Both migrations change the live database the moment they run, and the live
release keeps serving the old screens until the new code is deployed. So
`0241` (the page table and the widgets column, additions only) can run early,
and `0242` must wait for the deploy: run before it, the live menu and notices
would point at an address the live release does not have.

An open backtest and an open bot share one middle header: the page's reopen
button while the page is shut, the **Chart** and **Graph** tabs, then the
Graph's 1W to All and its ⋮ (line switches, From, To, Reset) or the Chart's
coin at the right.
No back arrow, name or Canvas button (Tyler, 10 Nov 2026: "remove canvas from
the tab", "the chart and graph tab needs to be applied to the bots dashboard
too"); the Dashboards block's row goes back to the table.
