# The dashboard on a phone

Below 1280px the Trade dashboard is the chart, with a bar of four buttons
along the bottom of the screen that slides the other panels up over it (Tyler,
13 Nov 2026: "The main thing is a way to access the left and right panel. I'm
thinking 4 sticky buttons in the bottom. Left panel, positions, browse market,
right panel."). The bar replaced the Page / market / Trade pills that sat at
the top until then. Below 768px the top row folds too, as described here.

## The bottom bar

Left to right: **Left panel**, **Positions**, **Browse** and **Right panel**
(Tyler: "rename browse market to just Browse"). The bar is drawn by
`src/components/trade/narrow-panel-bar.tsx` and wired in `trade-workspace.tsx`.

- **Left panel** is the dashboard's page: Protocols, Grid trades and the other
  blocks (`dashboard-blocks.md`).
- **Positions** is the Positions, Open orders and Journal tables, with their
  tabs on top. It opens on Positions the first time and on whichever table was
  open after that. Its button carries the count of open positions, and no
  number while that count is not known yet.
- **Browse** is the market list the header's search box opens on a wide
  screen, drawn straight into the panel. It cannot be pinned or dragged there,
  and its search starts empty each time.
- **Right panel** is the open trade (`trade-details-panel.md`).

How a panel behaves:

- **It slides up over the chart** and stops a tenth of the way down, so the
  top of the chart still shows, dimmed. The panel has no frame of its own: its
  card runs edge to edge, and the knob that shuts it sits on the card's own
  header (Tyler, 13 Nov 2026: "remove these paddings ... put the knob right on
  top of the panel header"). Positions and Browse leave room under the knob
  ("add some padding under here"), since their first row is tabs or a search
  box rather than a header.
- **Four ways shut it:** its own button again, a tap on the dimmed chart, a
  drag down on the knob, or Escape. Pressing another button swaps straight to
  that panel.
- **Nothing reloads.** Left panel, Positions and Right panel stay on the page
  while shut, the same as the three panels side by side on a wide screen.
- **Picking a coin** in Left panel or Browse shuts the panel and shows that
  coin's chart.
- **Opening a row** in Positions or the Journal swaps to Right panel with that
  row open. A widget's Manage widgets opens Left panel.
- **Overview** has no Positions or Right panel, so its bar is Left panel and
  Browse. Browse is left out too when no market can be picked.
- **The full-screen chart** hides the bar, and leaving it brings the bar back.
- **On an iPhone** the bar sits above the home line.

The tables are drawn into the Positions panel from the same middle panel that
draws them beside the chart on a wide screen, so nothing is read twice.

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

The chart's name as a heading with a chart icon, then the picked timeframe,
Indicators, View options and the ⋮ with Wallet and Close all. The table tabs
and Browse are in the bottom bar instead, so the name is not a tab and has no
underline (Tyler, 13 Nov 2026: "we dont need this underline if theres no tab").
The "i" after it still opens the market's facts.

The Left panel's header has a chart icon before "Trade" in the place the wide
screen's collapse button takes, since there is nothing to collapse (Tyler:
"need icon for the left panel header in mobile", "that should be a chart
icon").

- **The timeframe is one button.** Pressing `4h` opens every timeframe.
  Favourite timeframes are a wide-screen convenience and are not drawn here.
- **The note about where the older bars came from is not drawn here.** It is a
  sentence, and the fact it carries is about the chart's history rather than
  anything to press.
- **Folders and Pin to top are in the chart header's ⋮**, beside Wallet and
  Close all, as on a wide screen.

## The tables

Positions, Open orders and the Journal are tabs at the top of the Positions
panel, with each table's own buttons (Close or Remove the ticked rows, Hide
select, the Journal's filter) beside them.

- The tab row slides sideways when it runs out of room, and the tab you open is
  slid fully into view so its count is never the part hanging off the end.
- **Remove keeps its count and loses its word** on a phone, so the bin and the
  number of ticked rows fit beside the tabs.

## What it does on the way in

The page is built on the server, which cannot measure a window it never sees,
so it assumes a desktop and the browser corrects it. On a phone that means the
wide layout is painted once before the one-row layout replaces it. This is the
shell's own behaviour for everything that asks whether the window is phone-width
— the sidebar toggle in the header does the same — and the 1280px line does not,
because that one is remembered in a cookie the server can read.

## Checking it

The dev server for this app is on the port in the repo's `local-apps.json`.
Open `/trade?view=hyperliquid` at 390×844 and check:

1. The bar along the bottom reads Left panel, Positions (with its count),
   Browse and Right panel, nothing is wider than the screen, and the chart
   runs down to the bar.
2. Each button slides its panel up over the chart, and the same button shuts
   it. So do a tap on the dimmed chart and a drag down on the knob.
3. Picking a coin in Left panel or Browse shows its chart with the panel shut.
4. A row tapped in Positions opens Right panel on that trade.
5. `/trade?view=overview` shows only Left panel and Browse.
6. The full-screen button in the chart's corner hides the bar.
7. The top row is the sidebar toggle, the exchange's name, the search
   magnifier if it is switched on, the bell and three dots, with no cog
   (plus Goal and Active trades if either is set to "Menu bar"). The
   three dots hold, in order, the pinned markets under their heading, the goal
   and active-trades buttons on one line, the three settings rows and colour
   mode. Nothing in there wraps onto a second line.

The chart itself on a narrow screen is in `charts/chart-on-a-narrow-screen.md`.
