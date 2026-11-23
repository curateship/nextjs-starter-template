# Working without signal

The Trips dashboard and every trip opened on a phone open again with no signal,
read only (Tyler, 3 Nov 2026: "Read only", built in the shell and copied into
Travel). How the keeping works, and when it is emptied, is the shell's: see
the repo's `docs/shell/offline-pages.md`.

## What is kept

- **`/trips` and every `/trips/<id>`,** each time it is opened with signal,
  with its data and code. A trip opened on Monday with signal opens on
  Tuesday with none, as it was on Monday.
- **Only what was opened.** A trip never opened on this phone shows a plain
  "No signal" page saying to open it once with signal first.
- **Nothing else.** Settings, the admin pages and the rest of the site aren't
  kept.

## With no signal

A line under the trip page's tabs, and above the Trips dashboard, reads "No
signal. This is the copy from your last visit, and changes are off until
you're back online."

Everything that reads still works: the Board, List, Calendar and Map tabs,
moving between days on a phone, opening a card to read its notes, the left
panel's description, money and notes, search and Filter.

Every change is off:

- **The board:** no dragging cards or days, no Done tick, no right-click
  menu, no "+" on a day, no day menu, no "+" after the last day, no Move
  button on a shut day, and a day's description shows without editing.
- **The header:** no "+ Add", no ⋮ after "+ Add", no Mass select.
- **The panels:** no ⋮ on the trip or the activity, notes and the description
  show faded and can't be typed in, the budget field is off, and the trip's
  notes have no New note and no right-click menu.
- **The Calendar tab** on a trip with no start date has no date picker.
- **The Trips dashboard:** the Trips table shows the kept trips, with no New
  trip, Mass select or right-click menu, and the picked trip has no ⋮ and no
  buttons at its foot. Places has no New place or Mass select, and a place's
  stars, fields and buttons are off.
- **What the dashboard reads afresh** needs signal: the left page, Overview's
  widgets and the Places lists say they could not be read, with Try again.
  The Dashboards block still moves between the sections.

When signal comes back, all of it comes back at once, with no reload. The
board still shows the kept copy until the next change or reload brings the
latest.

## Where it lives

`src/components/travel/use-travel-offline.ts` keeps the pages and says
whether there is signal, and `no-signal-line.tsx` is the line. The trip page
hands `readOnly` to every panel through the trip's context
(`trip-context.tsx`). The shell parts are `public/offline-worker.js` and
`src/lib/hooks/use-offline-pages.ts`, the same files as `apps/shell`.
