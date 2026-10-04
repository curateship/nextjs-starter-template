# The dashboard on a phone

Below 768px the exchange dashboard is the chart and two rows of buttons.
Everything else is one press away behind a three-dot button. Above 768px
nothing on this page changes, and the layout the other docs describe is the one
that is drawn.

768px is the width the shell already calls a phone, in
`src/hooks/use-mobile.ts`. It is not the 1280px line the side panels fold away
at, so a tablet keeps the fuller row it has always had.

## The top row

The sidebar toggle, the exchange's name, the bell, the settings cog, and then
three dots.

Today's goal and the active-trades figure stay in the row, because they are
numbers somebody opens the page to read and a press to see them is a press too
many. The three dots hold the two controls that are not: the market search and
the pinned markets. Which of an app's controls fold is the app's own choice,
through `foldsOnPhone` on each one.

- **The search is the field itself**, a whole row of the dropdown, rather than
  a magnifier you press to get a field. The dropdown is a list, so there is
  room for it, and the results open under it as you type. They are the real
controls rather than copies, so each one still opens its own panel. This fold
belongs to the shell and happens in every app built on it, so it is written
down once in the repo's `docs/shell/shell-and-apps.md`.

- **The exchange's name is never cut short.** The button takes the room the
  name needs and gives way only when the row genuinely runs out. It used to be
  capped at 112px, which left "Hyper Li…" on a header with room to spare.
- **The pinned markets sit at the bottom**, on a line of their own under the
  heading "Pinned markets". They are a list rather than a button, and in the
  row with the buttons they read as one more of them. The heading is the
  control's own label, drawn by the shell because `ownSection: true` is set on
  it in `src/app/options.ts`.
- **With nothing pinned the section says so**, rather than leaving the heading
  over a gap. The shell draws the heading whether or not the control under it
  has anything to show.
- **Everything in the dropdown is packed to the left.**
- **A pinned market shows its day's change in here**, which it only does above
  1280px along the header itself. The dropdown is a list rather than a row, so
  it has the width.
- **The pins are read once, not twice.** Both places read the same store, and
  the clock that refreshes them stays mounted in the header at every width.

## The market row

In order: the markets list, the market itself, the timeframe, the smart orders
robot, the three dots.

- **The market button carries its own star.** The star sits where the coin's
  picture sits on a wider screen, and the leverage follows the name. The arrow
  goes: nothing else in the row opens a list, so the arrow was saying what the
  row only has one of.
- **The timeframe is one button.** Pressing `4h` opens every timeframe.
  Favourite timeframes are a wide-screen convenience and are not drawn here.
- **The two panel buttons stay.** Markets on the left, smart orders on the
  right, each sliding its panel in from that side, exactly as they do between
  768px and 1280px.
- **The note about where the older bars came from is not drawn here.** It is a
  sentence, the row is five controls wide, and the fact it carries is about the
  chart's history rather than anything to press.

## What the three dots hold

A sheet up from the bottom of the screen, in this order:

| Line | What it opens |
| --- | --- |
| Indicators | The indicator list, with the number switched on beside the word |
| View options | The chart's view options |
| Wallet | The wallet menu |
| Alerts | The price and drawing alerts, with the fired count beside the word |
| Pin to top | Pins this market to the header, or unpins it |
| Watchlists | The saved market folders |
| Contract info | The exchange's facts about this market |
| Positions | The positions table |
| Open orders | The open orders table |
| Journal | The journal |

The sheet is deliberately not a modal window. Every line opens a panel of its
own, and those panels are drawn at the end of the page rather than inside the
sheet. A modal window switches the rest of the page off for the pointer, which
would leave each of those panels on screen and dead to the touch.

## The three tables

There is no table under the chart on a phone. Each table is a screen's worth of
columns, and sharing 844 points of height with one left the chart too short to
read a candle on.

- The three lines at the end of the sheet slide the table up over the chart at
  85% of the screen's height.
- The panel keeps its own tabs inside, so the other two tables are one press
  away without going back to the menu.
- Pressing a market in the table, or a trade in the Journal, closes the sheet,
  because both of those put something on the chart behind it.
- The tab row slides sideways rather than painting over Close all beside it,
  and the tab you open is slid fully into view so its count is never the part
  hanging off the end. The word stays on the tab that is open; the other two
  keep their picture and their count. A screen reader still reads the full name
  of all three.
- **Open P&L is not drawn on a phone.** It is a link to another page rather
  than something done to this table, the sidebar already carries PnL, and it
  was the second button that squeezed the Journal's own tab down to four
  letters.
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

1. The market row is one line, and the market's name is not cut short.
2. The three dots in the market row open ten lines, and Wallet, Alerts,
   Indicators and Contract info each open a panel without the sheet closing.
3. Open orders opens the table over the chart, with Close all beside the tabs
   and no words sitting on top of each other.
4. The three dots after the settings cog hold the search field and, under a
   "Pinned markets" heading, the pinned markets. Typing three letters in the
   field lists markets from every exchange.
5. Open the Journal: its tab reads in full with its count, and Close all sits
   clear of it.
6. Nothing is drawn under the chart.
