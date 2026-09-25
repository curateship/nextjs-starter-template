# The trading overview

`/admin/trading-overview` answers the account-wide money question without
belonging to one exchange. PnL Graph, short for profit and loss, is the main
card. Its layout copies the design Tyler sent on 23 Sep 2026
(`workspace/docs/assets/pasted-image-1790208001182205000.png`).

- **The header:** a small grey line reads "Profit and loss · All wallets", or
  the selected wallet's name in place of All wallets. Under it sits the made or
  lost figure in 30px monospace type, with its share of the shown balance in a
  green, red or grey badge. No percentage appears when that balance is zero or
  below. The header is taller than the standard 57px card header because the
  figure is the card's headline.
- **The whole card follows the selected row:** picking a wallet changes the
  header figure, the badge, the four figures above the chart and the chart
  line to that wallet's own. All wallets puts the account totals back.
- **The four figures:** Balance, Settled, Open and Fees sit in a row above the
  chart, each an 11.2px grey label over a 12.8px monospace figure, with 25.6px
  between them. Tyler had the row made 20% smaller on 23 Sep 2026. The warning
  about trades with unstated money sits at the right end of that row.
- **The chart:** one black line for the selected row, with a faint grey fill
  under it and a dashed line at $0. The dollar labels on the left are
  monospace. Five dates run along the bottom, the first and last flush with the
  line's ends. A chart narrower than 480px shows only the first, middle and last
  date so the labels never touch. The other wallets' lines are not drawn.
- **What the card leaves out on purpose:** the "PnL Graph" title and its icon, the
  grey subheader bars, the small line in each wallet row, the coloured wallet
  squares, and the "7 days ago · last read just now" line. The dates button
  names the period instead.

Overview panels size themselves to their contents. There are no draggable
panel dividers or saved panel sizes. Populated tables grow with their rows;
the bottom panel in each column expands to fill any remaining space. Panels
above it keep their content height. On narrow screens, only the final panel
fills the space below the stacked content. Long content scrolls with the page,
while wide tables keep their horizontal scrollbars. The profit graph keeps
its own minimum drawing space, and the wallet list grows with its rows.
The two lower columns use a fixed 55/45 split on wide screens and stack below
1280px. A single occupied column uses the full width. Widget placement and
ordering are still managed in dashboard settings.

The left side starts with All wallets and then lists each real mainnet wallet.

- **A row:** the wallet's name with Made or lost on the right, and the exchange
  with the balance under it in grey. All wallets names how many wallets
  answered, and how many are missing when some did not.
- **The selected row:** a rounded grey fill. Every row has a hand cursor and
  can be picked by mouse or keyboard.
- **Empty wallets:** a wallet whose balance and made or lost both round to
  $0.00 is folded away under "Show 3 empty wallets" at the foot of the list.
  Clicking it shows them and the link then reads "Hide 3 empty wallets". Hiding
  them while one is selected puts the selection back on All wallets. The choice
  is not remembered after a reload.
- **Switched-off and failed wallets:** switched-off wallets stay out of PnL
  Graph. A wallet whose exchange did not answer stays named with "did not
  answer" under it. It never becomes a row of zeroes and never counts as empty.
- **Sorting:** the Wallets and Made or lost headings sort the rows either way.
  All wallets stays pinned first. Unavailable results stay at the bottom when
  sorting by money. The last sort is remembered in this browser.

The overview asks Trade's server again every fifteen seconds while the browser
tab is visible. One answer updates every placed widget. Active Trades reads
positions only when that widget is placed, and Running bots follows the same
rule for bot runs. Hiding the tab stops the clock. Showing it makes one
catch-up read and starts the clock again, without replaying missed turns. A
failed read keeps the last answer on screen.

The graph records results from midnight on 20 August 2026 in Toronto through
the latest account read. The card's top right holds the period tabs and a
dates button.

- **The tabs:** 1D, 1W, 1M, 3M, 6M and All. 1D means the current calendar day
  from midnight, not the last 24 hours.
- **The dates button:** it names the period on screen, such as "Aug 20 – Sep
  23, 2026", or one date when the period is a single day. Clicking it opens a
  small window with labelled From and To date pickers, Reset and Done.
- **Picking a date:** the chart changes at once. Done only closes the window.
  Reset returns to All and closes it.
- **No history yet:** the dates button is greyed out, and hovering or focusing
  it explains that there is no history to pick a range from yet.
- **What the dates change:** only the chart. The header figure and the four
  figures above the chart always describe the whole record. Dates outside the
  recorded history show that no results fall inside the range. The graph does
  not carry the last known result into days the app has not read.

Rows directly below a panel title and summary rows at the bottom use one panel
bar treatment. The bar has the muted light-gray fill and one divider on its top
and bottom. Both dividers take the Divider lines color from Styling. A panel
title drops its own bottom divider when the subheader owns that edge, so the
line never becomes two pixels thick. Sticky table headings use an opaque mix of
the same muted gray and card background, which keeps scrolling numbers from
showing through without changing the visible shade.

Active Trades is the account-wide exception to the real-money totals. It lists
every open position across every protocol and every wallet, including practice
and testnet wallets. Practice and Testnet rows name their account type so
pretend money cannot be read as real money. Real rows carry no account-type
chip. New dashboards put Active Trades under PnL Graph;
an account with a saved arrangement finds it under Settings → Widgets until it
is placed.

The Active Trades table has five columns: ticker, type, order, current position
value, and current profit in dollars and as a share of the money the trade
holds. Type is Long or Short. Order says Manual, DCA ladder, Grid, or Signal.
Manual means no running smart order owns the position. Value is the absolute
position size at the current market price, not the margin committed to the
trade. The ticker cell has a 16px icon, 12px medium symbol, then a compact
Testnet or Practice badge when the account is pretend. Clicking the symbol or
anywhere else on the row opens that market on its protocol's chart. A narrow
screen keeps every column reachable through the table's horizontal scroll.
Trade rows use 10px of vertical padding, 2px more than the bottom Positions
panel, to give the list a little more air without changing its type size. The
table opens
with the largest P/L first. Every heading sorts, and Filter narrows the rows by
exchange, wallet, or both. Every exchange and wallet starts checked. More than
one may stay checked, and unchecking a choice removes its rows. Clear all resets
the menu to every row. Each choice shows its row count in a muted badge directly
beside the exchange or wallet name. The checkmark stays at the far right. The
Filter button counts how many groups are narrowed.
Active Trades and Trades use the same checked Filter menu. Each menu keeps its
own open state when both widgets sit on screen. A
wallet that could not be read does not add an
orange warning row above the trades that did answer. When no trades answer, the
empty wording still avoids claiming that every wallet was empty. A market whose
current price could not be read shows a dash for both value and profit, never a
made-up zero. A plain divider sits
between every pair of trade rows, including the final two. The sticky table
header uses an opaque mix of the muted gray and card background. The shade is
light gray, but scrolling rows cannot show through it. Every Active Trades
column is left-aligned, including Value and P/L.
The footer stays at the bottom of the widget while the trades scroll. Total
adds the value and current profit for the rows shown. Filters update the total.
If any shown trade lacks a figure, the affected total uses a dash instead of
presenting a partial answer as complete. The footer does not show averages.
The PnL Graph and Trades cards use the same card, text, divider, and muted
background rules as the rest of the dashboard. Money values use the dashboard's
semibold tabular monospace treatment.

The signed-in header's top-right side also shows the account-wide Active Trades
total. The first figure is the current value held in every open position. The
second is their current profit or loss. Both are rounded to whole dollars in
the header so the answer stays readable beside the shell controls. Hovering the
summary opens a two-tab menu. Active trades has the same rows, filters, sorting,
totals, and chart links as the dashboard widget. Watching lists every active
manual watched price, DCA ladder, grid, and signal order across the account.
Its columns name the ticker, order kind, wallet, and Distance.
Distance uses the same percentage-away pill as Open orders. A manual watch
uses its waiting price; a grid or ladder uses its nearest waiting entry level.
Signals and plans with no waiting entries leave Distance blank. The snapshot
includes waiting prices and a market mark; live marks override that mark when
available. Clicking Distance sorts nearest first, with unavailable distances last. A watched row opens that
market on its protocol's chart. The two tabs keep separate exchange and wallet
filters, so narrowing one list does not silently narrow the other.

Clicking the summary opens the menu for touch and keyboard use. The menu grows
with its rows up to the available screen height. Longer lists scroll
under their sticky headings. The menu also respects the space Radix reports
around the header button, so it cannot exceed the available popover height.
Loading and failed reads use a padded line that fits its content. A failed
read offers Try again in that same compact menu.
Both tabs use the same 640px menu width, capped by the available browser
width. Each table fills that width, including its headings and dividers.
Narrow screens keep overflowing columns reachable through horizontal scrolling. Moving away closes it. The header asks for a fresh
answer every 15 seconds while the browser tab is visible. The Active trades item can be
moved or hidden under Settings → Top right menu. It appears only in the admin
menu. The eye beside Filter hides the profit or loss from the header button and
changes to a crossed eye. The value held stays visible, so the button still
opens and the crossed eye can show the profit or loss again. The table keeps
its P/L column either way. A wallet that misses a read keeps its last known
rows, and the header uses dashes rather than claiming a partial account-wide
total.

The header reads the wallet list and then the open positions that supply its
menu and total. It does not ask every exchange for a full account balance first.
That balance is not part of the Active Trades answer, and waiting for it left
the header on loading dashes long after the rest of the workspace had opened.

Running bots is the fourth trading-overview widget. A new or reset dashboard
puts it in the left column, beside All trades. A saved arrangement keeps its
choices and finds Running bots under Settings → Widgets until somebody places
it.

Running bots uses the same table shape as Active Trades. Its columns are
Automation, Status, Markets, Positions, and Made or lost. Markets is how many
markets the automation watches. Positions is how many of those markets still
hold an open position from the current run. When several runs added to the same
open position, the run whose earliest recorded order opened it gets the count.
Later runs do not count the same position again.

Running bots also uses Active Trades' row type. Automation uses the same 12px
medium text as Ticker. Status uses 12px muted text. Markets and Positions use
the same 12px monospaced numbers as Value.
Made or lost uses the same 12px type and medium-weight dollar figure as P/L.

Each automation gets one row. When an automation has run more than once, its
newest run supplies the status, counts, money, and dashboard link. Running
comes first, followed by waiting, paused, stopping, and stopped. Waiting uses
the same explanation as the run dashboard. Every heading sorts its column. A
flow that stopped without a person pressing Stop stays in the table until its
run is deleted or the flow is started again. A flow stopped by hand leaves the
table. Backtests never enter the widget. The widget chooses the newest run of
every automation before the history page's 200-run display limit is applied, so
one frequently restarted automation cannot hide another.

The whole row opens `/flow-runs/$runId`. The table scrolls inside the card when
there are more rows than its height can hold. An empty card says "No running
bots" and links to the automation canvases. The rows arrive in the same server
answer as the other overview widgets, with no timer of their own. A row keeps
its last banked dollar figure until the overview is read again.

Profit calendar is the P&L page's month grid as an overview widget. It draws
the same component, `src/components/pnl/pnl-month-grid.tsx`, inside
`src/components/trade/profit-calendar-widget.tsx`. New and reset dashboards
leave it out, so it waits under Settings → Widgets until somebody places it.

- **Where its dollars come from:** it splits the overview's own real fills by
  Toronto day. It asks the server for nothing extra and updates with the
  overview's fifteen-second read.
- **Why the tiles give no trade count:** the overview carries fills, not
  finished trades. Rebuilding every finished trade on each fifteen-second read
  would be a much heavier read, so the widget names dollars and the P&L page
  keeps the trade count.
- **How it agrees with PnL Graph:** a month's tiles add up to the settled
  figure the graph names for that month. Unpriced fills are counted apart and
  never as zero, as on the P&L page.
- **When the two can differ:** the graph leaves out a wallet whose balance
  could not be read. The calendar still counts that wallet's saved fills,
  the same as the P&L page does.
- **Which month it opens on:** the current one. The arrows walk back to August
  2026, and the chosen month is not remembered after a reload.

Practice wallets never enter a number on this screen. If one real wallet cannot
be read, the rest of the screen stays up, the missing exchange is named, and
every affected total says it is short. A failed read is never drawn as an empty
wallet.

Testnet wallets do not appear in PnL Graph. Made or lost is settled trade money
plus current open profit. Deposits and withdrawals can change Balance but never
profit.

Fees are the exchange's stated charges on every fill in the same window,
including a fill whose profit the exchange did not state. Made or lost stays
the net figure Tyler reads first; the fee note explains part of that result.

The Journal starts with the newest bounded page so the four-second account poll
does not grow slower as a wallet ages. Show older reads and appends the next
page without changing that poll. The pages overlap their boundary timestamp so
fills recorded in the same millisecond do not fall through the join. If a page
cuts through a trade, the next page also rebuilds the trade whole. Once an empty
page comes back, the control says That is everything.

Each line starts at zero on the start date and adds priced settled trade money
until now. Its final point adds current open profit. Opening balances, deposits,
withdrawals, and older fills never enter a line. If an exchange did not state a
trade's money, the chart names how many trades are missing instead of counting
them as zero.

The trades table uses the money each exchange stated. A KuCoin sale that did
not close the position has no stated profit, so its Money cell is a dash. The
Money column's header tooltip and the chart header say how many trades their
total is short of. An unstated figure never becomes zero. Trade rows are grouped
by day and keep market, side, time, exchange, wallet, money, size, and fee in a
compact four-column table. The shared Filter menu narrows the table to one
exchange, one wallet, or both, and Clear all restores every trade. A fill hidden from the
Journal stays hidden here too.
An unhidden fill that cannot be rebuilt into a complete trade stays in this
table and also appears in the Journal as History incomplete. A PnL figure can
therefore never depend on saved history that the Journal silently omits.
Trade rows inherit the dashboard's Inter typeface, including market names and
Money values. Their numbers keep tabular spacing without switching to a
monospace face.

Settings has two Widgets tabs and they do not share an arrangement. The
trading Widgets tab sits in the "This app" card and saves its top, left, right,
and hidden lists per account in `trade_prefs`. The platform Widgets tab sits in
the "Platform" card and saves the platform Overview arrangement in the shell
settings. Moving or resetting a card in one tab never changes the other.
The trading Widgets route arrives with its saved arrangement, and the Markets
route arrives with its saved daily-volume cutoff. When Widgets needs a browser
read, its titled card stays visible with the shared loading row inside.
Reset dashboard is an outline action inside the collapsible card. Folding the
card hides Reset too. Reset opens the existing confirmation before changing
the arrangement.
