# Live figures on the public front page

Two rows an admin can place on the front page: hours focused in the last seven
days, and rooms running right now. They are the only thing in this app aimed at
somebody who is not a member yet.

A visitor who has never heard of the app lands on a working timer with no sign
that anybody else uses it. One true number fixes that.

## A quiet week says nothing

Each row carries a floor, and a row under its floor comes off the page entirely.
Tyler's call on 29 Sep 2026, out of three options: hide the row, round up to a
floor, or always show the real number.

- Hours focused starts at a floor of 20 hours.
- Rooms running starts at a floor of 1, so it appears whenever anybody is in a
  room.
- The floor is a box in the row's own settings, inside the shell's row window.
  Zero means always show it.
- Rounding up was refused on purpose: a floor the figure is rounded *up* to
  stops the number being true, and the whole point of publishing it is that it
  is true.

## Where they draw

`/` in this app is the timer, not the shell's front page, so nothing else would
ever draw a front page row here. They are drawn under the timer.

- **Guests only.** A member already knows the app is used. Nothing is read for a
  signed-in person, so they cost that page no queries at all.
- **Only this app's own kinds.** A Text or Hero row placed in the builder is for
  the shell's front page and is not drawn here.
- Each row still gets its heading, its line beneath, its alignment and its
  Visibility switches from the shell's own row renderer.

## No visitor causes a read the page was not already paying

Three things keep the front page's cost flat.

- **The saved rows are free.** They come from the branding the root route has
  already loaded, so finding out whether a live-figure row is on the page costs
  nothing. A front page with none of these rows makes no extra call at all,
  which is the state every deployment starts in.
- **The figures are asked for once per page, not per row.** One call fills every
  row on it.
- **The figures themselves are held**: five minutes for the week's hours, one
  minute for the open rooms. Two windows, because the two numbers move at
  different speeds. A week's total barely shifts in five minutes, while a room
  opening should show up inside a minute. Every visitor inside a window is
  served the held number, so a busy front page costs the same as a quiet one.

The figures arrive just after the page does, rather than with it. That is the
price of not reading the settings a second time on every visit, and it is the
right trade for a strip below the timer.

## What the figures are

- **Hours focused** sums `daily_focus_stats.focus_seconds` over the last seven
  UTC calendar days and floors it to whole hours, so the page never claims an
  hour that was not focused. UTC because a public page has no viewer whose
  timezone could anchor a week, and the figure is a total across everybody's
  days anyway.
- **Rooms running** counts rooms in the waiting, focus, short-break and
  long-break phases. A booked room that has not opened and a room that is over
  are not running.
- **Neither names anybody.** One total and one count, with no account, no display
  name and no task in either.

## The door that fills them is open on purpose

The endpoint that fills these rows answers a visitor with no account, because
that is who the rows are for. It is written down as such in the shell's
exception list in `src/server/guards.test.ts`, which is the only way an endpoint
ships without a guard on it.

It is safe to leave open because it takes nothing from the caller. The rows come
from the saved front page and the site from the address that was visited, so
nobody can ask it about a row that is not on that page, and the two figures it
returns name nobody.

## The featured shared file

Under the timer, beside these rows and also for visitors only, a small card
shows the one shared file an admin featured from Member uploads, with play and
its credit (uploads-and-sharing task 05, part 8). It is read the same way: held
for a minute, so a visit costs no query. It disappears once the file is
unshared. See [Shared sounds and backgrounds](shared-media.md).

## Where the code is

- `src/lib/pomodoro/front-page-rows.ts` — the two keys, their wording, the floor
  and the cleaning that makes a stored setting safe to read.
- `src/server/pomodoro/front-page-rows.ts` — the two readers and the two held
  figures.
- `src/components/pomodoro/front-page-row-panels.tsx` — the floor box in the
  shell's row window.
- `src/components/pomodoro/public/front-page-rows.tsx` — what each row draws.
- `src/app/options.ts` and `src/app/server-options.ts` — the two halves the shell
  requires, the drawing in one and the reading in the other.
