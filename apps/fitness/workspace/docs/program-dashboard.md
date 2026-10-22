# A program's dashboard

Every program has its own three-column dashboard at `/programs/<id>`, reached from the Programs dashboard after the program is made. Tyler, 18 Oct 2026: "I create a program via modal, choose a routine, input my starting data then create. Only then I get to the 3 panel dashboard."

It follows the UI standard's three-column rules (`.agents/skills/Ui-standards/SKILL.md`, "Three-column dashboards") and sits on the shell's own frame, `src/components/shared/three-panels.tsx`, copied unchanged from the shell.

## Tyler's calls

- 18 Oct 2026: the panels' contents as he drew them, the day's menu and Start workout on every view, and the fixed week.
- 20 Oct 2026, asked through the options tool, all four replacing his 18 Oct calls where they differ:
  - The cog: "Settings window", in place of the cog dropdown.
  - Pictures: "Pictures card in settings", in place of clicking the picture to open the picker.
  - The main button: "Start workout + New dropdown".
  - History: "Add them", meaning search, Filter and Views, where on 18 Oct he took search out.

## The three panels

- **Left: the program and its week.** The header holds the arrow back to Programs, the program's name, the three-dot actions and the cog. Under it, the round picture with the name, routine type and status, "Week 5 of 12" for a program with a length (`program-length.md`), then the This week card (`the-week.md`).
- **Middle: the view.** Day, Calendar, History, Progress and Photos as words with a line under the open one, on the header's bottom edge. Five tabs take the line, not pills, because the standard draws three or more that way. The row scrolls sideways when it doesn't fit, which is also how it fits a phone. While a workout is being logged the tabs give way to the live workout (`workout-logger.md`).
- **Right: what is open.** An exercise in the day, a calendar date, a workout, a lift or a photo day. Its header holds the title, the item's own icons and an × that closes it. With nothing open, the header names what will show there, then an icon and one line saying what to click.

## The middle header

Right of the tabs, in this order:

1. **The view's own tools.** History has the search, Filter and Views (`history.md`). Photos has Timeline and Compare as two pills (`before-and-after-photos.md`).
2. **The day's menu**, the three dots, on every view. Away from the Day view it acts on the weekday last picked, today's by default.
3. **The view's "New …"**, outlined:
   - Day, on a workout day: New exercise.
   - Day, on a rest day: New workout.
   - Progress: New weigh-in.
   - Photos: New photo day.
   - Calendar and History have none, because nothing is made there. Workouts only come from Start workout.
4. **Start workout**, the one filled button, for the person who trains.

New exercise, New workout and New weigh-in open a small dropdown, not a window. Its fields come first and "Create …" sits at the bottom right. Clicking away keeps what was typed for the next time. New photo day opens its window, because a photo day asks for its date and measurements when it is made, which the standard allows.

In a narrow panel, New and Start workout keep their icon and drop their words. Their names show on hover.

## Banner and picture

Both are optional, both come from the person's own uploads, and both are set in the settings window's Pictures card (`drizzle/0099_fitness_program_pictures.sql`).

- **The banner** lies behind the left panel's header and top at 30 out of 100 strength and fades into the panel, so the header still reads over it. Over a banner the header's bottom line goes see-through.
- **The picture** is a circle with a 2px edge at the banner's foot, with the name, routine type and status beside it.
- With neither there is no banner and no picture. The routine type and status take a line of their own, and nothing stands in for the picture. A picture whose address no longer loads is left out rather than drawn broken.
- The server refuses any address that isn't one of the uploads of the person saving it, the same rule as a profile photo, so a program never shows an outside picture (`setProgramPictures` in `src/server/fitness/programs.ts`).

## The cog and the three dots

**The cog opens Program settings,** a window with five cards that fold and remember it:

- **Pictures:** the banner and the picture.
- **Starting data:** a summary line under its heading ("66 kg · 172 cm · Build muscle"), then Body, Training, the equipment you have and your best lifts. "Add lift" opens a dropdown list of lifts, not a second window.
- **Weight rules** and **Training blocks** (`weight-rules-and-blocks.md`). A Calisthenics program has **Step-up rules** in their place (`calisthenics.md`).
- **Program length** (`program-length.md`).

Each field saves as it changes, so the window ends with Done. Closing it saves the field being typed in, and a save that fails says so in a toast. Delete program sits at the foot on the left. Pressing it closes the window first, then asks.

**The three dots hold what is done to the program as a whole:** Rename, Make it the active program (only when it isn't), Pause program or Resume program, Share (the owner's alone), Copy to a client (a coach's own program only, `coaching.md`), then Archive or Bring back. Rename, Pause and Share open their own window.

## Opening on arrival

The dashboard never opens with an empty right panel, and it goes back to where it was left (UI standard, Tyler, 19 Oct 2026).

- Opened at its bare address, it puts back the view, weekday, open item and History filters it had last time on this program, in this browser, for this person. An address that already says something, such as a bell notice's link, wins.
- With nothing open after that, it opens the view's first row: the day's first exercise, the newest workout in History (after the filters), the first lift in Records, or the newest photo day.
- The Calendar loads its own months, so nothing on it opens by itself. A rest day has nothing to open either.
- A remembered item that has gone gives way to the first row.
- A workout being logged is never put back.
- On a narrow screen the middle stays in front, and the item opened by itself waits behind its pill.

The panels resize by dragging the lines between them, and the widths are remembered in this browser (`fitness-program-horizontal`). A side panel shuts when dragged closed or double-clicked on blank space, and a tab on the edge brings it back. Below 1280px wide one panel shows at a time, with a pill for each.

## The address

Everything that decides what shows is in the address (`src/lib/fitness/program-search.ts`), so a link, a bell notice or a reload opens the same thing:

- `view`: Day (unset), Calendar, History, Progress or Photos.
- `day`: the weekday the Day view shows, 0 is Sunday. Unset is today's weekday.
- `open`: what the right panel shows. Before 20 Oct 2026 this was `pick`. Migration `0100_fitness_saved_views.sql` moved the record notices already sent over to `open`.
- `workout`: a workout being logged, which takes over the middle panel.
- `at`: the lift open on the right of that workout, "pos-2". It is kept apart from `open` and never remembered, so coming back to a program never asks for "pos-2" as a date or a workout. Opening or closing a workout empties it.
- `compare`: two photo days side by side.
- `new`: "photo-day" opens New photo day on Photos, for the photo day reminder's link. Closing the window takes it out.
- `q`, `name`, `status`, `exercise`, `group`: History's search, filters and grouping. Any change of view empties them: a tab, a weekday on the left, or a finished workout landing on History. The search keeps at most 80 characters.

Picking a weekday or an item never reloads the page. Changing the view or opening a workout does, and each view loads only its own data (`src/lib/fitness/program-page.ts`).

## Who sees what

The owner sees and changes everything. A coach the owner said yes to can open the program and change its week, starting data, rules and pictures, but can't start, log or change a workout, and doesn't see Share, New weigh-in or New photo day. A coach's saved History views are their own. Anyone else gets "That program doesn't exist or you can't see it."

## Code

- Route: `src/routes/_authenticated/programs_.$programId.tsx`.
- Frame and header: `src/components/fitness/dashboard/program-dashboard.tsx`, with the panel pieces in `panel-parts.tsx` and each view's rows in `view-rows.ts`.
- Left panel: `program/program-hero.tsx`. The three dots and settings window: `program/program-actions.tsx`.
- Tabs: `src/components/fitness/underline-tabs.tsx`, copied from Project's `UnderlineTabs` until it moves to the shell.
- From the shell, unchanged: `three-panels.tsx`, `new-record-dropdown.tsx`, `filter-popover.tsx` and `search-toggle.tsx` in `src/components/shared/`, and `src/lib/layout/dashboard-place.ts`.
