# The trading overview

`/admin/trading-overview` answers the account-wide money question without
belonging to one exchange. PnL Graph, short for profit and loss, is the main
card. Its heading uses the shared dashboard card header. Made or lost replaces
the wallet count beside the title, with its share of the current shown balance
in a green, red, or neutral badge. Both use 20px type that fits inside the
header's 32px content row, so the standard 57px header does not grow. No
percentage appears when the shown balance is zero or below. The chart's top row
names Balance, Settled, Open, and Fees in that order. The age stays on the left.
The figures and the warning about trades with unstated money align to the right.
A light gray row and bottom divider keep this account summary apart from the
chart. The gray chart row and the wallet column header are both 40px high. The
old "made or lost" label and the breakdown below the wallet list are gone. The
old headline figures, Wallets card, and Money over time card are gone too. Their
answers now share this one card, so a wallet and the line it produced can be
read together. The age does not repeat under the result.

The left side starts with All wallets and then lists each real mainnet wallet.
Every answered row has the wallet's balance, Made or lost, and a small line over
time. The graph pane stays clear for the money-over-time chart. Switched-off
wallets stay out of PnL Graph. A wallet whose exchange did not answer stays
named as a failed answer. It never
becomes a row of zeroes. The All wallets row starts selected. The selected row
has no background fill. A 2px medium-gray right border and a heavier wallet name
show the selection. Every row reserves
the border's width so changing the selection does not shift its contents. Every
answered wallet row has a hand cursor and can be selected by mouse or keyboard.
Every wallet row keeps its bottom divider, including the final row.
Selecting one makes its chart line strong and quietens the other lines. The
right side draws the All wallets line strongly
and each answered wallet as a lighter line. Hovering the chart names the date
and the amount for every line. Hovering a wallet's small line keeps its dot and
opens a readout with the date and that wallet's result at the marked point.
The mini graph is a plain line and does not draw a filled block when it is
clicked.
The graph panel names the live age, such as "7 days ago", instead of the fixed
"Money over time" label.
The same line names when the whole overview last answered. The overview asks
Trade's server again every fifteen seconds while the browser tab is visible.
One answer updates every placed widget. Active Trades reads positions only
when that widget is placed, and Running bots follows the same rule for bot
runs. Hiding the tab stops the clock. Showing it makes one catch-up read and
starts the clock again, without replaying missed turns. A failed read keeps the
last answer and its older read time on screen.
The Wallets and Made or lost headings sort the wallet rows in either direction.
All wallets is an account summary and stays pinned first. Unavailable results
stay at the bottom when sorting by money. The last sort is remembered in this
browser.

The graph records results from midnight on 20 August 2026 in Toronto through
the latest account read. Controls in the card's top-right space show one week,
one month, three months, six months, or all recorded results. The two calendar
fields set an exact start and end date, and Reset returns to All. Every wallet
line changes together. Filtering crops the graph without changing the current
account and wallet figures. Dates outside recorded history show that no results
fall inside the range. The graph does not carry the last known result into days
the app has not read.

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

The Active Trades table has four columns: ticker, type, current position value,
and current profit in dollars and as a share of the money the trade holds. Type
is Long or Short. Value is the absolute position size at the current market
price, not the margin committed to the trade. The ticker cell has a 16px icon,
12px medium symbol, then a compact Testnet or Practice badge when the account is
pretend. Clicking the symbol or anywhere else on the row opens that market on
its protocol's chart. All four columns fit at the card's normal width. A narrow
screen keeps every column reachable through the table's horizontal scroll.
Trade rows use 10px of vertical padding, 2px more than the bottom Positions
panel, to give the list a little more air without changing its type size. The
table opens
with the largest P/L first. Every heading sorts, and Filter narrows the rows by
exchange, wallet, or both. Active Trades and Trades use the same counted Filter
menu, including the All rows, Clear all, Done, and the number of filters in
use. Each menu keeps its own open state when both widgets sit on screen. A
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
summary opens the same Active Trades widget, with the same rows, filters,
sorting, totals and chart links. Clicking the summary opens it for touch and
keyboard use. Moving away closes it. The header asks for a fresh answer every
15 seconds while the browser tab is visible. A wallet that misses a read keeps
its last known rows, and the header uses dashes rather than claiming a partial
account-wide total.

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
Trade rows inherit the dashboard's Inter typeface, including market names and
Money values. Their numbers keep tabular spacing without switching to a
monospace face.

Settings has two Widgets tabs and they do not share an arrangement. The
trading Widgets tab sits in the "This app" card and saves its top, left, right,
and hidden lists per account in `trade_prefs`. The platform Widgets tab sits in
the "Platform" card and saves the platform Overview arrangement in the shell
settings. Moving or resetting a card in one tab never changes the other.
The trading Widgets route arrives with its saved arrangement, and the Markets
route arrives with its saved daily-volume cutoff. Neither app settings panel
shows loading copy while a browser request catches up after mounting.
