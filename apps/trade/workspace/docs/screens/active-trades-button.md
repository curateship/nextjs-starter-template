# The active trades button in the header

The button beside the bell says how much money is in open trades and what those
trades have made. Pressing it opens a panel listing every one of them.

## It opens on a click, not a hover

It used to open the moment the pointer crossed it, and shut itself a fifth of a
second after the pointer left. Crossing the header on the way somewhere else
threw a panel of trades over the page. Tyler's call, 4 October 2026: click to
open, click or Escape to close. The panel stays put while the pointer is
anywhere else, which is what makes it readable.

## The panel is 576px, and the table fits it exactly

Every column in that table is sized to its content and none of them wrap, so
the table does not shrink when the panel does — it simply hangs over the edge
and gets clipped. At the page's own cell padding it came to 621px inside a
576px panel, and the percentage fell off the end of the P/L column.

Two things make it fit, and both are set where the header renders the panel
rather than on the table itself, because the same table has all the room it
needs on the dashboard:

- **Tighter cells**, `px-2.5` instead of `px-5`. Five columns of padding is
  200px at the page's figure and 100px here.
- **The ticker gives way, and nothing else does.** Padding alone cannot make
  the table fit, because the longest coin name sets a floor under it —
  MARSCOINUSDTM held the panel 4px open after the padding came off. A clipped
  ticker is still readable and the full name is on the chart one click away. A
  clipped figure is money with a digit missing, so the P/L column never gives.

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
