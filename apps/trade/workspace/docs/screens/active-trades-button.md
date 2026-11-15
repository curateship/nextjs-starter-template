# The active trades button in the header

The button beside the bell says how much money is in open trades and what those
trades have made. Pressing it opens a panel listing every one of them.

## The same panel is a phone's Positions

Under 1280px the bottom bar's Positions panel draws this panel's body, tabs,
Filter, ⋮ and all (`dashboard-on-a-phone.md`). The button and that panel share
one read of the trades every 15 seconds and one saved choice of columns, in
`src/components/trade/use-active-trades.ts`, so having both on a page asks the
exchanges once. The read starts with the first of them to appear and stops,
forgetting what it held, when the last one goes. The panel's body is
`ActiveTradesPanelBody` in `active-trades-panel.tsx`, with the narrow-place
cell spacing and ticker cap both use.

## It opens on a click, not a hover

It used to open the moment the pointer crossed it, and shut itself a fifth of a
second after the pointer left. Crossing the header on the way somewhere else
threw a panel of trades over the page. Tyler's call, 4 October 2026: click to
open, click or Escape to close. The panel stays put while the pointer is
anywhere else, which is what makes it readable.

## The panel is as wide as the table it shows

The panel sizes itself to the table on screen (Tyler, 13 Nov 2026: "make the
width of the trades dropdown auto adjust"). It grows or shrinks when a column
is hidden or the tab changes, and it never gets wider than the window.

- **It has a floor of 384px, or the window's width on a phone**, so the tabs, Filter and ⋮ stay on one line when
  the table is narrow or says it is empty.
- **The cells are tighter than on the dashboard**, `px-2.5` instead of `px-5`,
  set where the header draws the panel, so the Overview widget keeps its own.
- **A ticker longer than 144px is cut short**, and nothing else ever is.
  MARSCOINUSDTM once held the panel 4px past its edge. A clipped ticker is
  still readable and the full name is on the chart one click away. A clipped
  figure is money with a digit missing, so the P/L column never gives.

## Its tabs follow the Dashboard tabs setting

Active trades and Watching are drawn the way Settings → Styling → Dashboard
tabs says, as grey pills or as words over a sliding line (Tyler, 13 Nov 2026:
"Wire these tabs into the tabs setting"). They are the shell's `DashboardTabs`,
the same tabs every dashboard uses, so they are words and a count with no icon.

## The ⋮ hides columns

A ⋮ sits after the Filter (Tyler, 13 Nov 2026: "Add a 3 vertical dot icon here
for a drop down for me to hide/unhide cols"). It lists the showing tab's
columns, each with an open eye while it shows and an eye with a slash while it
is hidden. One press swaps it and the menu stays open for the next.

- **Each tab keeps its own choice.** Active trades can hide Type, Order, Value
  and P/L. Watching can hide Order, Wallet and Distance.
- **The Ticker always shows**, so a row always says which coin it is.
- **The Total row drops the same columns as the rows**, so a total never sits
  under the wrong heading.
- **A hidden column stops being the sort.** The rows go A to Z by ticker,
  because an order nothing on screen explains is no use.
- **The choice is saved on the account**, in `trade_prefs.panel_layouts`
  beside the Bots trades popover's, never in the browser. It is read once when
  the header loads. Until it lands every column shows, and a failed read leaves
  them all showing. A failed save says so in an error toast.

## It shows the last figures it knew while it reads fresh ones

**The button never sits on two dashes any more.** It reads several exchanges at
once, and a read where one of them stays quiet has no total in it — a sum
missing a venue is not the account's total, so `activeTradesFigures` returns
nothing rather than a figure that looks complete and is not.

That is right for one read and wrong for the button. Measured on 4 October
2026, after a reload: the first read answered at 8 seconds with a venue
missing, the next at 26 seconds, and only then did two reads merge into a
complete picture. The button showed "— —" for 26 seconds.

So the last complete pair is remembered, in `trade_header_figures`, one row per
person, written only when a read comes out whole. A second server call asks for
it alongside the real read and answers in a fraction of the time, because it
touches no exchange. Tyler, 4 October 2026: "Just show the old numbers until
theres a new one."

Measured after the change: numbers on screen 4.3 seconds after a reload instead
of 26, and what remains is the page booting before any request can be made.

- **A fresh total always wins.** The remembered pair only ever fills figures
  that are still empty, so a late answer can never put an old total back over a
  new one.
- **It is kept in the database, not the browser.** This app runs inside an
  embedded preview where localStorage writes are silently dropped, and an
  in-memory cache would be cold for whichever container a rolling deploy handed
  the next page load to.
- **Only a complete total is ever written**, so what comes back was true when
  it was measured, and a partial sum never gets remembered as a whole one.
