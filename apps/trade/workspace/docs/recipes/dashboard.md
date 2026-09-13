# Recipes dashboard

Recipes is the admin-only canvas for trading plans. It lives at
`/admin/recipes` and uses its own saved records. The shell's Automations page
now contains only the general email, audience, billing and timing steps.

## The dashboard

The table lists each recipe's name, status, step count and last update. An admin can
search, sort, create, rename, copy or delete a recipe. A recipe with a live run
cannot be deleted. A bulk deletion also stops if any selected recipe has a
live run, so the admin can stop that recipe and make the choice again.
Recipes belong to the workspace rather than the person who created them. Other
admins in that workspace see the same recipe name, and the name remains if the
creator's account is removed.

The sidebar is stored in the database. Add an admin-only link to
`/admin/recipes` in Settings, Sidebar after the code is running.

## The canvas

Each DCA rung percentage keeps the text being typed. Clearing the field leaves
it empty so a replacement can be entered. Values below 0.01 or above 99 remain
visible with an error explaining the range. Only valid values update the step.
The last valid setting remains saved while the field is invalid. The error is
linked to the field for screen readers, and the buy-size column stays beside it.
Adding or removing rungs resets their unsaved text so a draft cannot move onto
a different rung.

The trading status sits immediately before the **Canvas** and **Results** tabs
in the middle header. Canvas returns from a
result to the recipe. Results opens the newest finished backtest for that
recipe. A recipe with no result keeps Results muted and unavailable.

The palette has five steps: Wallet, Markets, DCA, Signals and Grid. The canvas
keeps the existing drag, connection, zoom, keyboard and inspector behaviour.
One Wallet connects to one Markets step, which connects to one DCA, Signals or
Grid strategy. Duplicate or disconnected Trade steps keep the recipe as a
draft and cannot run.

Recipe drafts save after an edit. The server checks the whole drawing again
before it saves the copy used for a run. A half-filled or unsupported step stays
visible on the draft, but it cannot run until the red problem is fixed.

The Backtest panel and trading status sit on the recipe canvas. The Backtest
window stays visible while trading status loads and when a saved wallet is
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

## Recipe windows and duplication

Create and rename put the name field in the shared small card section. Both
keep the form window's unsaved-change handling and validation.

Duplicating a recipe disables only that row's Duplicate button and shows its
spinner. Other recipes can be duplicated while the first request runs. Each
button becomes available when its own request finishes or fails.

## Status in the list

Status sorts running recipes first, followed by paused, stopping, stopped and
never-run recipes. Running and paused rows name the wallet and link to its run.
Stopping stays visible until cancellation finishes. Stopped rows show when the
last run stopped. A recipe without a run says Never run.

The recipe query also reads the current user's runs in one database statement.
Workspace admins can see shared recipes, but never another user's wallet name
or run link. If multiple active wallets become supported, the column says
Running on 2 wallets and links to the first running run, newest first. Paused
and stopping runs follow running runs. Renaming a recipe preserves its status.
Reload the list to read changes made from another screen.

## Controls on a run page

The run page has no separate recipe-name header or divider. Run controls sit
immediately before Chart and Canvas in the chart header.

Pause and Resume use the same button and server action as the Bots tab. Pause
stops the search for new coins and leaves placed orders alone. The button
changes immediately and returns to its previous state if the server refuses.
The run page reads again every five seconds while running or paused, so a
change from Bots reaches this page too.

Stop keeps the existing whole-run cancellation behavior. A stopped run offers
Run again immediately before Chart and Canvas in the chart header, on its original wallet. The confirmation says that today's saved
recipe runs, and shows the recipe's last change time if edited after the stop.
The server reads the current recipe under its recipe lock, takes the wallet ID
from the owner's stopped run, and runs the normal start checks. A busy wallet
refuses the restart. The saved recipe's wallet choice is not changed. A
successful restart opens the newly created run page.

Each coin has Stop while its run is running or paused. Confirmation names the
coin and explains what happens to a held position. Stopping remains visible
until the engine confirms cancellation, then becomes Stopped by you. The coin
stays visible in this run's report and cannot be restored by editing its folder.
See `../orders/stopping-flow-ladders.md` for order ownership and cancellation.
