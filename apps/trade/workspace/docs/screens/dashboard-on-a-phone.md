# The dashboard on a phone

Below 1280px the exchange dashboard shows one panel at a time behind a pill
row: Blocks, the market's name, Market (the Admin 3 panel design, 7 Nov 2026,
`dashboard-blocks.md`). It opens on the chart. Below 768px the top row folds
too, as described here.

768px is the width the shell already calls a phone, in
`src/hooks/use-mobile.ts`. It is not the 1280px line the side panels fold away
at, so a tablet keeps the fuller row it has always had.

## The top row

The sidebar toggle, the exchange's name, the market search as a magnifier, the
bell, and then three dots. Every other Trade header control and the settings
cog fold into those three dots, because Tyler drew it that way on 16 Oct 2026.
A control switched off in Settings → Top right menu is drawn nowhere, so with
the search switched off the row is just the name, the bell and the dots. Before that, today's goal and
the active-trades figure stayed in the row and squeezed the sidebar toggle to
14px. Which controls fold is the app's own choice, through `foldsOnPhone` on
each one in `src/app/options.ts`. The cog folding with them is the shell's, and
it is written down once in the repo's `docs/shell/shell-and-apps.md`.

- **Goal and Active trades can come back into the row.** Each one's chip in
  Settings → Top right menu has a phone button reading "Dropdown" or "Menu
  bar". A press moves it, and it saves itself. Both start in the dropdown.
  Tyler asked for the choice on 17 Oct 2026: "I want an option to bring it out
  of the dropdown in mobile or not to the navigation". With both in the row a
  390px phone is tight, and the exchange's name is what gives way first.
- **The exchange's name is never cut short.** The button takes the room the
  name needs and gives way only when the row genuinely runs out.

## What the top three dots hold

A panel the width of the phone less a small gutter each side, top to bottom:

1. **Pinned markets**, under that heading. Each pin is its own grey pill with
   the day's change and a cross to unpin it. The row slides sideways and fades
   out under the right edge where it carries on, and there is blank room after
   the last pin so it reads in full once slid to the end. With nothing pinned
   the section says so rather than leaving the heading over a gap.
2. **Today's goal and the active-trades figure**, on one line. They are the
   real buttons, so each still opens its own panel. The line never wraps: when
   the buttons are wider than the phone it slides sideways and fades out under
   the right edge, the same as the pins.
3. **Hide profit and loss, Public profile and Following**, the cog's own rows.
4. **Colour mode**, last.

The market search is not in here. Tyler's drawing leaves it out, and its field
is wider than a phone's line of buttons, so it stays in the row as a magnifier
that opens the results with a field on top, the way it does on a tablet.

- **The pins are read once, not twice.** Both places read the same store, and
  the clock that refreshes them stays mounted in the header at every width.
- **Everything in the dropdown is packed to the left.**

## The middle header

The same one header as on a wide screen: the tabs, Browse market, the picked
timeframe, Indicators, View options and the ⋮ with Wallet and Close all.

- **The timeframe is one button.** Pressing `4h` opens every timeframe.
  Favourite timeframes are a wide-screen convenience and are not drawn here.
- **The note about where the older bars came from is not drawn here.** It is a
  sentence, and the fact it carries is about the chart's history rather than
  anything to press.
- **The star and Pin to top are in the market's ⋮** on the Market pill, as on
  a wide screen.

## The tables

Positions, Open orders and the Journal are tabs beside the chart in the middle
panel, as on a wide screen.

- The tab row slides sideways, and the tab you open is slid fully into view so
  its count is never the part hanging off the end. The word stays on the tab
  that is open; the others keep their picture and their count. A screen reader
  still reads the full name of each.
- **Open P&L is not drawn on a phone.** It is a link to another page rather
  than something done to this table, and the sidebar already carries PnL.
- **Remove keeps its count and loses its word** on a phone, so the bin and the
  number of ticked rows sit beside Close all without crowding it.

## What it does on the way in

The page is built on the server, which cannot measure a window it never sees,
so it assumes a desktop and the browser corrects it. On a phone that means the
wide layout is painted once before the one-row layout replaces it. This is the
shell's own behaviour for everything that asks whether the window is phone-width
— the sidebar toggle in the header does the same — and the 1280px line does not,
because that one is remembered in a cookie the server can read.

## Checking it

The dev server for this app is on the port in the repo's `local-apps.json`.
Open `/protocols/hyper-liquid` at 390×844 and check:

1. The pill row reads Blocks, the market's name and Market, and opens on the
   chart.
2. The middle panel's tab row slides sideways and never runs under the
   header's controls.
3. Blocks shows the exchange's page, and picking a coin there goes back to the
   chart.
4. The top row is the sidebar toggle, the exchange's name, the search
   magnifier if it is switched on, the bell and three dots, with no cog
   (plus Goal and Active trades if either is set to "Menu bar"). The
   three dots hold, in order, the pinned markets under their heading, the goal
   and active-trades buttons on one line, the three settings rows and colour
   mode. Nothing in there wraps onto a second line.
5. Open the Journal: its tab reads in full with its count.
6. Nothing is drawn under the chart.
