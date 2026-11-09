# Recipes

Recipes are the admin-only canvases for trading plans. Since 9 Nov 2026 they
are the Recipes row of the Bots dashboard at `/bots?view=recipes`
(`../screens/bots-dashboard.md`), and use their own saved records. The shell's
Automations page holds only the general email, audience, billing and timing
steps.

## The table

The table lists each recipe's name, its bot's status, its steps and its last
update. Clicking a line opens its canvas; the table has no right panel. An
admin can search (in the header's ⋮), sort, make a recipe from the header's
New recipe dropdown, duplicate or delete one with a right-click on its line,
and rename, duplicate or delete the open one from its ⋮ in the canvas header. A recipe with a live run
cannot be deleted. A bulk deletion also stops if any selected recipe has a
live run, so the admin can stop that recipe and make the choice again.
Recipes belong to the workspace rather than the person who created them. Other
admins in that workspace see the same recipe name, and the name remains if the
creator's account is removed.

## The canvas

Each DCA rung percentage keeps the text being typed. Clearing the field leaves
it empty so a replacement can be entered. Values below 0.01 or above 99 remain
visible with an error explaining the range. Only valid values update the step.
The last valid setting remains saved while the field is invalid. The error is
linked to the field for screen readers, and the buy-size column stays beside it.
Adding or removing rungs resets their unsaved text so a draft cannot move onto
a different rung.

An opened recipe fills the middle of the Bots dashboard. The right panel shows
only while a step is picked, holding its settings, and closes again when the
empty canvas is clicked. The middle's one header reads: the back arrow to the Recipes table,
then two tabs, the recipe's name (the canvas) and **Results** (Tyler, 9 Nov
2026: "Turn recipe name into tabs ... [Recipe name canvas][result]"), then the
trading status, **Backtest** and the recipe's ⋮. Results opens
the newest finished backtest in the Backtests row. With none yet it is greyed
out, a press does nothing, and its tooltip says "No result yet. Press Backtest
to run one." (Tyler, 9 Nov 2026: "Just remove the toast altogether and gray out
the result tab if no result is ready with a tooltip"). An opened run's Canvas button comes back.

**Backtest** ("put the backtest button here") opens and shuts the Backtest
window over the canvas. The window starts shut. It stays loaded while shut,
because it is what finds the newest result for the Results tab.

There are five steps: Wallet, Markets, DCA, Signals and Grid. They come from the
**+ Add step** button at the canvas's bottom left, its own button beside the
zoom bar (Tyler, 9 Nov 2026: "actually move the add step here", "it should be
its own button and not stuck with the others"), not a panel, because the left panel is always the
dashboard's page (Tyler, 9 Nov 2026: "if we combine all the sidebars, there's
like 3 sidebar on the left"). Picking one puts it on the canvas and shows its
settings on the right. The canvas keeps the existing connection, zoom, keyboard
and inspector behaviour.
One Wallet connects to one Markets step, which connects to one DCA, Signals or
Grid strategy. Duplicate or disconnected Trade steps keep the recipe as a
draft and cannot run.

Recipe drafts save after an edit. The server checks the whole drawing again
before it saves the copy used for a run. A half-filled or unsupported step stays
visible on the draft, but it cannot run until the red problem is fixed.

The Backtest window and trading status sit on the recipe canvas. The Backtest
window stays usable while trading status loads and when a saved wallet is
selected. Existing results remain readable. Starting a backtest requires
pretend money on the Wallet step; the window explains that requirement. Recipes do not
have schedules, member tests, templates or the shell's run history.

## What the buttons run

Backtest and Switch on save pending canvas edits before doing anything else.
The server then reads the saved recipe again. Browser settings are never
trusted as the copy that spends money.

A Wallet step using pretend money starts a backtest. One unique ID is made for
each click, so a retried request cannot create the same backtest twice. A Wallet
step naming a saved wallet switches the recipe on. Real-money wallets keep the
existing confirmation window. Practice and real runs use the same trading
engine as before, and Stop, Pause and Try again keep their existing behaviour.

## Moving the saved drawings

The database change first creates `trade_recipes`. The next change moves every
Automations drawing that contains a Trade step, including an invalid draft with
no compiled copy. Recipe IDs do not change. Saved backtests and live flow rows
continue to point at the same ID, and a live flow keeps running while its name
lookup moves to Recipes.

The production database cutover has run. The matching app code still needs to
be deployed. Until that deployment, the old production Automations screen
cannot manage the seven moved recipes. The rest of the trading dashboard keeps
using its existing tables, and no recipe was running or stopping during the
cutover. Deploy the web app before the worker so both start against the new
table, then add the admin-only Recipes sidebar link.

## Naming and duplicating

New recipe is a dropdown holding the name and Create recipe; the name typed
stays for the next opening if it is closed. Rename is the Name row in the
recipe's ⋮, saved when the field is left.

Duplicating shows its spinner on the Duplicate row and allows one copy at a
time.

## Status in the list

Status sorts running recipes first, followed by paused, stopping, stopped and
never-run recipes. Running and paused rows name the wallet.
Stopping stays visible until cancellation finishes. Stopped rows show when the
last run stopped. A recipe without a run says Never run.

The recipe query also reads the current user's runs in one database statement.
Workspace admins can see shared recipes, but never another user's wallet name
or run link. If multiple active wallets become supported, the column says
Running on 2 wallets and links to the first running run, newest first. Paused
and stopping runs follow running runs. Renaming a recipe preserves its status.
Reload the list to read changes made from another screen.

## Controls on an opened bot

An opened bot's Pause, Stop and Run again sit in the right panel's footer,
under its Figures, Coins and Results tabs.

Pause and Resume use the shared `FlowPauseButton` and the `pauseFlow` server
action. Pause
stops the search for new coins and leaves placed orders alone. The button
changes immediately and returns to its previous state if the server refuses.
An opened bot reads again every five seconds while running or paused, so a
change made in another browser tab reaches it too.

Stop keeps the existing whole-run cancellation behavior. A stopped run offers
Run again in the same footer, on its original wallet. The confirmation says that today's saved
recipe runs, and shows the recipe's last change time if edited after the stop.
The server reads the current recipe under its recipe lock, takes the wallet ID
from the owner's stopped run, and runs the normal start checks. A busy wallet
refuses the restart. The saved recipe's wallet choice is not changed. A
successful restart opens the new bot in the middle.

Each coin has Stop while its run is running or paused. Confirmation names the
coin and explains what happens to a held position. Stopping remains visible
until the engine confirms cancellation, then becomes Stopped by you. The coin
stays visible in this run's report and cannot be restored by editing its folder.
See `../orders/stopping-flow-ladders.md` for order ownership and cancellation.

## Going back to the table

The canvas has no tips line ("Scroll to zoom · Drag to pan"); it was taken
out on 9 Nov 2026.

The back arrow in the canvas header and the Recipes row of the Dashboards
block both go back to the Recipes table. The shell's Dashboards rows ignore a
press on the row already picked, so the Bots block hears that press itself
while a record is open (Tyler, 9 Nov 2026: "if im in the canvas, clicking the
sidebar link here doesnt work"). Backtests and Bots do the same from an opened
chart.
