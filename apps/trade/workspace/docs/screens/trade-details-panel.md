# The trade details panel

The Trade dashboard has a right panel whenever an exchange is picked. It shows
one trade in full: its money, every buy and sell, and for a grid or DCA ladder
its settings, its levels or steps, and every sale it has made. Overview has no
right panel.

## Tyler's words (10 Nov 2026)

- "I want to add a right panel in the positions and journal tab. Clicking on
  the trade open the right panel to show more details. For example a grid
  trade will show all the grid sales."
- "Any chart should have a right panel to show its previous trade history",
  and "currant trade also have a right panel too that shows currant trade and
  if its a grid trade then list its grid sales so far".
- "Add right click ability for journal to delete and mass select".
- What the panel holds came from his picks: every buy and sell, a money
  summary at the top, grid levels, grid or DCA settings, DCA steps and sales,
  footer buttons, who placed it, rules you skipped, what the stop and target
  would make, earlier trades on the same coin, the coin's money over time, and
  sharing a trade as a picture. On 11 Nov 2026 he took out the Stop and target
  and Grid levels cards.

His 8 Nov "I dont want a right panel" still holds for Overview
(`dashboard-blocks.md`).

## What each tab opens

- **Positions:** the position you clicked. A click on a row also charts its
  coin, as it always did.
- **Journal:** the trade you clicked. The tab stays on the Journal, and the
  trade is drawn on the chart underneath. Show on chart, in the panel's
  footer, is the press that goes to the chart tab. An "Open, history
  incomplete" row opens too: it is where a grid that has never sold down to
  nothing lives, so it opens that grid's position.
- **The chart and Open orders:** the coin on the chart. Its open position
  first, if you hold one, then its earlier trades. With nothing held it says
  so above the earlier trades.

The panel never sits empty while a list has rows. Each tab opens the row it
had open last, kept in this browser, or the first row when that one has gone.
There is no ×. The button at the panel's edge folds it away, and the same
button at the end of the middle header brings it back. Folding or opening
either side panel slides over 240ms instead of snapping and then jumping a
further 7px a frame later as the gap closed (Tyler, 11 Nov 2026: "too jaggy
like it bounces a bit on collapsing and uncollpasing, make it smooth"). A
dragged divider still follows the pointer at once, and with less motion
asked for the fold is instant. The panel carries the left page's cover on
behind its header ("the right panel is also not wired to the background
theme"), and every card has an icon ("The right panel cards are missing
icons"). The ⋮ in its header, like the middle header's, reaches 6px into the
gap on each side, so there are 24px between every icon in both headers
("the icon spacing of the right panel has to match with the spacing from the
middle panel"). It opens at the Side
panels right width, the narrowest it drags to. On a screen under 1280px wide
it is the bottom bar's Right panel, and opening a row slides it up
(`dashboard-on-a-phone.md`). Its first card follows Settings → Styling →
Panel cards → Opacity, as every side panel's does, through the frame it shares
with the Bots dashboard's right panels (`OpenRunPanel`). Before 13 Nov 2026
that frame's body was not marked as a side panel, so the setting missed it.

## What the panel shows

Each part is a folding card, flush against the next with no gap (11 Nov
2026), remembered open or shut in this browser, in
this order: Summary, Sales (or Grid sales), Earlier trades on the coin, then
for a DCA ladder its steps, Rules you skipped on a finished trade, and Buys and
sells last (Tyler, 11 Nov 2026: "Move sales card under summary. Move earlier
trades under sales card").

- **Summary.** For a position: made or lost now, its value, side and
  leverage, fees, slippage, wallet and who placed it. For a finished trade:
  made or lost, return, how it ended, when it opened and closed, how long it
  was held, entry, exit, size, what was put in, fees, slippage, wallet and who
  placed it. A grid's settings are a Grid group at the foot of the Summary:
  which way it starts, how many levels, the spacing, the share of the wallet,
  leverage and when it started (Tyler, 11 Nov 2026: "Combine grid settings
  into summary"). An open position shows no Price now, Size or Entry, and the
  Grid group no Range, Take profit or Times the whole grid sold (Tyler, 11 Nov
  2026: "Remove all these datas ... theyre not useful"). The Stop and target
  card and the Grid levels card were taken out the same day ("Remove stop and
  target, grid levels").
- **DCA steps.** Leverage, take profit and when it started, then each step's
  price, dollars, and whether it has bought.
- **Sales.** Every sale the grid or ladder has made since it was placed, with
  the level that sold and what the sale made, and the total.
- **Grid sales.** A finished trade a grid made lists the sales inside it.
- **Rules you skipped.** The trading rules the entry went out against.
- **Buys and sells.** Every fill as a table, newest first, with headings
  that sort: Trade (a green dot for a buy, a red one for a sell, then how much
  of the coin), Date ("11/10/26 9:27 PM"), Value (what the coins cost or
  fetched) and Fee in grey, blank under a cent (Tyler, 11 Nov 2026: "revamp
  the buy and sales card", then "remove the under 0.01 label. replace the buy
  and sell chip with just a red or green dot. Use this format for the date
  01/23/26 5:12 AM" and "Maybe try resize the font by 10%"). The text is
  10.8px. In a panel under 18rem wide Fee drops out, and under 13rem the coin
  amount too, so nothing is cut short. The table reaches the card's edges.
  The newest hundred show first, with Show all under them.
- **Earlier trades on the coin.** What they made together, how many out of
  how many made money, a small line of the money added up trade by trade, and
  the newest fifty. Pressing one opens it in the Journal.

### Every sale, not the newest few

The page only holds your newest 4,000 fills across every wallet, so a grid
that has run for weeks has sales older than any of them. Opening a grid or a
ladder asks the server for every fill on that wallet's coin since it was
placed (`src/server/trade/coin-fills.ts`, up to 20,000). Until that answer
lands, the card lists what the page already holds and says "Made by the sales
so far". After it lands it says "Made by every sale". A sale made while the
panel is open joins the list on the next poll. If the read fails the card says
so and offers Try again. Past 20,000 fills it says the oldest sales are not
there.

A sale is counted the same way the Grid block's popover counts it
(`src/lib/trade/smart-order-sales.ts`): a grid's sale is worth what its own
level made, and a sale the exchange gave no figure for is left out of the
total and named under it.

### Who placed it

Each fill carries the smart order, and the bot when a bot placed it
(`src/server/trade/fill-owners.ts`). A bot's order is matched exactly by its
order id. Anything else is matched on when: one smart order works a coin per
wallet, so a fill on that coin while a grid or ladder was working is that
order's. A trade then reads Copied, Bot, Grid, DCA, Signal or By hand, in that
order (`src/lib/trade/trade-maker.ts`). A watched price is a plain order, so
its fill reads By hand. Bot links to the bot on the Bots dashboard, and Copied
to the trader's page.

## The buttons

- **A position's footer:** two buttons and nothing else, Close trade (the
  row's own close window; Sell all for a coin owned outright) and Close all
  trades (the same Close all list as the middle header's ⋮), side by side with
  room and one under the other without (Tyler, 11 Nov 2026: "The footer should
  only have 2 buttons with icon [Close trade] [Close all trades]"). Add to
  position, Stop and target and Share as a picture are in the ⋮.
- **A coin with nothing held:** the footer says "Nothing is held on BTC right
  now." ("this goes into the footer").
- **A Journal trade's footer:** the bin, which asks first, then Show on chart.
  The ⋮ has Show on chart, Share as a picture and Remove.
- **Share as a picture** downloads a 1200 by 630 picture of the coin, its
  side, the money and the dates. With the hide-profit switch on, the money is
  left off the picture.

## Right-click, Mass select and the Journal filter

- **Right-click a Positions row:** Mass select, Add to position, Stop and
  target, then Close position in red.
- **Right-click a Journal row:** Mass select, then Delete in red, which asks
  first. A still-open row offers only Mass select.
- **Mass select** shows the tick boxes, which are hidden otherwise. A press on
  a row, or its coin's name, then ticks it. The header shows Close (n) on
  Positions or Remove (n) on the Journal, and Hide select. Close (n) asks
  first and closes only the ticked positions, the real ones in one request.
- **Filter** sits in the Journal's header: Placed by, with a count beside each
  choice, and a Hide practice trades switch. Both are kept on the account.

## Where the code is

- The panel: `src/components/trade/details/trade-details-panel.tsx`, drawn by
  the middle panel (`activity-panel.tsx`) into the dashboard's third panel
  (`trade-workspace.tsx`) through a portal.
- The panel widths' key: `trade-workspace-horizontal-6` in
  `src/lib/trade/panel-keys.ts`, moved from 5 when the panel came in.
