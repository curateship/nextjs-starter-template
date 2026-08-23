# Market folders

Market folders are account-owned lists of coins. Each folder belongs to one
exchange and network, so a Hyperliquid mainnet folder never appears on Phemex
or Hyperliquid testnet.

## Fav and the star

Every exchange starts with an empty Fav folder. Fav is always first and cannot
be renamed or deleted.

Pressing an empty star adds the coin to Fav. Pressing a filled star opens the
folder list because the coin may be saved in more than one place. The list can
add or remove the coin from any folder and can create a named folder with the
coin already in it. A failed create keeps the typed name in place for another
try. Each folder holds at most 100 coins, and one exchange can have at most 100
named folders plus Fav.

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
management controls. The cog window holds create, rename, drag-to-reorder and
delete instead. Its New folder card holds the folder-name input and Create
button. Fav stays first and cannot be renamed, moved or deleted.

The count on a folder is its saved total. If the daily-volume setting hides all
of a folder's markets, the open row names that setting instead of calling the
folder empty.

Folder names, contents and positions save to the account. Browser storage only
remembers the height of the two left panels.

## Storage

`trade_market_folders` holds the owner, exchange, network, name, Fav flag and
order. Names cannot repeat within one exchange when letter case is ignored.
`trade_market_folder_items` holds one market key per folder and deletes its rows
when the folder is deleted.

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
