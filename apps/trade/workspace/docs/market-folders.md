# Market folders

Market folders are account-owned lists of coins. Each folder belongs to one
exchange and network, so a Hyperliquid mainnet folder never appears on Phemex
or Hyperliquid testnet.

## Fav and the star

Every exchange starts with an empty folder called Fav. It can be renamed and
moved like any other folder, and it cannot be deleted. Everything that reaches
for it finds it by its own flag rather than by the name Fav, so a renamed one
keeps working. The star and the picker's Favorites tab keep their own wording.

Pressing an empty star adds the coin to Fav. Pressing a filled star opens the
folder list because the coin may be saved in more than one place. The list can
add or remove the coin from any folder and can create a named folder with the
coin already in it. A failed create keeps the typed name in place for another
try. Each folder holds at most 500 coins (raised from 100 on 23 Aug 2026,
because Tyler keeps whole-category folders — every stock, every liquid coin —
and one exchange lists more than 100 of each), and one exchange can have at
most 100 named folders plus Fav.

The market picker uses the same control. Its Favorites view reads Fav only.

## The left column

The Markets panel has Watched and All. Folders live in a separate panel below
Markets, following the same stacked-panel pattern as the right column. The
lower panel is independent of Markets. Its header reads Folders and has + and
cog buttons. The + opens an inline name field for a new folder.
The cog opens the folder management window.

Each folder is a toggle inside the lower panel. Pressing Fav, Daily or another
folder opens that folder's coins directly under its row. Pressing the same row
again closes its coins. Each row shows how many markets the folder contains.
Expanded market rows have no dividers between them. The next folder toggle has
its own top edge, so it remains separate from the markets above it. Folder
presses never change the Markets panel above. Named folder rows include no
management controls. The cog window holds create, rename, drag-to-reorder,
hide and delete instead. Its New folder card holds the folder-name input and
Create button.

Markets inside an open folder run from the largest reported 24-hour gain to
the largest loss. A market whose exchange did not report a 24-hour change sits
after every known move. All markets opens in the same order, though its column
headings can still switch to volume or reverse the change order.

## The cog window

The Order card lists every row the panel can draw: Watched, Fav, each named
folder, and All markets. All four kinds of row behave the same way there.

- Drag any row by its handle to put it where you want it. Nothing is pinned,
  Watched and All markets included.
- Press a row's name to rename it. Fav can be renamed; Watched and All markets
  cannot, because neither is a folder. A name another folder on that exchange
  already has is refused before anything is written, and the row keeps its old
  name.
- Press the eye to keep a row out of the panel. The eye gains a line through
  it, the row's count is replaced by the word Hidden, and the row disappears
  from the panel. Nothing is deleted: a hidden folder keeps its coins, still
  takes coins from the star, and still runs in a flow.
- The bin deletes, and only named folders have one.

Hiding every row leaves the panel saying so and pointing back at the cog.

A drag or an eye saves the whole arrangement in one go, because moving one row
moves every row under it. The panel shows the change straight away and puts
back what it had if the save is refused.

The count on a folder is its saved total. If the daily-volume setting hides all
of a folder's markets, the open row names that setting instead of calling the
folder empty.

Folder names, contents and positions save to the account. Browser storage only
remembers the height of the two left panels.

## Storage

`trade_market_folders` holds the owner, exchange, network, name, Fav flag,
order and the hidden flag. Names cannot repeat within one exchange when letter
case is ignored. `trade_market_folder_items` holds one market key per folder and
deletes its rows when the folder is deleted.

Watched and All markets are not folders, so they have no row in that table.
Where those two sit and whether each shows lives in `trade_prefs`, in
`market_panel_rows`, keyed by exchange and network. A drag writes both places
inside one transaction, so a half-saved arrangement cannot be read back.
Migration 0144 adds both. A dashboard whose database is missing them fails its
single server call, and a failed call is what strips the market header down to
a plain title with no star and no buttons.

Migration 0141 copies the old starred keys into a Fav folder for each exchange
and network found in those keys. The old `trade_market_favorites` table remains
for one deployment so the copied rows can be checked before a later migration
removes it.

## Flows and backtests

A Markets step can save individual coins or a folder. Picking a folder clears
the individual list. A trading flow reads the folder when the flow starts and
copies those market keys into the run. Changes to the folder do not change a
run already in progress.

A missing or empty folder stops the next run and names the folder in the
message. A folder from another exchange cannot run against the wallet.

A backtest also reads the folder once at the start. The backtest saves the
exact market keys it read, so the result still records the coins that produced
it after the folder changes.
