# Recipes dashboard

Recipes is the admin-only canvas for trading plans. It lives at
`/admin/recipes` and uses its own saved records. The shell's Automations page
now contains only the general email, audience, billing and timing steps.

## The dashboard

The table lists each recipe's name, step count and last update. An admin can
search, sort, create, rename, copy or delete a recipe. A recipe with a live run
cannot be deleted. A bulk deletion also stops if any selected recipe has a
live run, so the admin can stop that recipe and make the choice again.
Recipes belong to the workspace rather than the person who created them. Other
admins in that workspace see the same recipe name, and the name remains if the
creator's account is removed.

The sidebar is stored in the database. Add an admin-only link to
`/admin/recipes` in Settings, Sidebar after the code is running.

## The canvas

The palette has five steps: Wallet, Markets, DCA, Signals and Grid. The canvas
keeps the existing drag, connection, zoom, keyboard and inspector behaviour.
One Wallet connects to one Markets step, which connects to one DCA, Signals or
Grid strategy. Duplicate or disconnected Trade steps keep the recipe as a
draft and cannot run.

Recipe drafts save after an edit. The server checks the whole drawing again
before it saves the copy used for a run. A half-filled or unsupported step stays
visible on the draft, but it cannot run until the red problem is fixed.

The Backtest panel and trading status sit on the recipe canvas. Recipes do not
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
