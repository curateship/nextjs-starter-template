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
Backtests    Dashboards block        backtests table (a line opens it)     none
Bots         Dashboards block        bots table (a line opens it)          none
Open recipe  Dashboards block        ← [Recipe name][Results] tabs,        the step picked; none until
                                     status, Backtest, ⋮; + Add step       a step is clicked
                                     beside the canvas's zoom bar
Open backtest Dashboards block       ← name, Graph/Chart, Canvas,          Figures | Results | Skipped
                                     chart over its trades
Open bot     Dashboards block        ← name, Graph/Chart, Canvas,          Figures | Coins | Results,
                                     chart over its trades                 Pause and Stop in the footer
```

## Tyler's rules (9 Nov 2026)

- Its own dashboard named Bots, at `/bots` ("Own dashboard, Bots"). One Bots
  link in the left menu replaces the Recipes, Backtests and Live runs links.
  The old addresses are gone, not forwarded, as `/protocols` went.
- Admins only ("Admins only"). A member who opens `/bots` is sent to `/home`.
  A backtest and a bot both start from a recipe, and only an admin can make
  one.
- An opened line fills the middle ("1"): a backtest's or bot's chart on top
  and its trades in a panel at the bottom, with a line between them to drag.
  The run's figures and its lists are tabs on the right.
- The left panel is always the page ("if we combine all the sidebars,
  there's like 3 sidebar on the left"). Nothing opened ever swaps it.
- A recipe's five steps come from a **+ Add step** button of its own beside
  the canvas's zoom bar, bottom left ("+ Add step button", "actually move the
  add step here", "it should be its own button and not stuck with the
  others"); the canvas tips line is gone, and the right panel shows the
  picked step's settings.
- An Overview row comes first ("Overview first"), with widget cards in the
  shell's rows.
- Running bots is on both Overviews, the Trade dashboard's and this one
  ("Both dashboards"). A row opens that bot here.
- A recipe's line opens its canvas at once ("clicking on the recipe should
  just go to the canvas. it doesnt need to load the right sidebar"), so the
  Recipes table has two panels, page and table. An open recipe has no right
  panel either until a step is clicked ("just dont show the right panel until
  a node is clicked on"); showing the recipe's bot and backtests there was
  tried and taken out the same day ("makes the flow clunky").
- Backtests and Bots open the same way ("we dont need the right panel for
  backtest dashboard. it should go straight to the result chart. same with
  bots dashboard"): a line opens its chart, and the tables have no right
  panel.
- Results on an open recipe is greyed out with a tooltip while there is no
  backtest yet ("Just remove the toast altogether and gray out the result tab
  if no result is ready with a tooltip").
- Search and Mass select are in the middle header's ⋮, as on the CRM ("Inside
  the ⋮, like CRM"), not buttons of their own.

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
- **An opened line:** the line's own header becomes the middle's one header,
  with the back arrow first. Back returns to the table with the same line
  picked, and so does pressing the section's own row in the Dashboards block
  ("if im in the canvas, clicking the sidebar link here doesnt work").

## The right panel

- **No table has one** (Tyler, 9 Nov 2026: "we dont need the right panel for
  backtest dashboard. it should go straight to the result chart. same with
  bots dashboard"). A line opens its record in the middle in one click, so
  the three tables are two panels, page and table, under the same width key
  as Overview.
- **An opened backtest:** tabs Figures, Results and Skipped, the backtest's ⋮
  (the Name, Pin to top, Archive, Delete in red under a line), and Stop in the
  footer while it runs.
- **An opened bot:** tabs Figures, Coins and Results, the bot's ⋮ (Delete,
  only once it is stopped: a run is a record of money that moved, and one
  still switched on is stopped, never deleted), and Pause, Stop and Run again
  in the footer.
- **An opened recipe:** no right panel until a step is clicked; then that
  step's settings. Clicking the empty canvas closes it. The step picked is
  `?node=` in the address, so a reload keeps it.

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
