# A program's dashboard

Every program has its own three-panel dashboard at `/programs/<id>`, reached from the Programs dashboard after the program is made. Tyler, 18 Oct 2026: "I create a program via modal, choose a routine, input my starting data then create. Only then I get to the 3 panel dashboard." It is laid out like the Project app's pages, from copies of Project's `three-panels.tsx` and `panel-card.tsx`.

## The three panels

- **Left: the program and its week.** A back arrow to Programs, the program's name, its routine type, Active, Paused or Archived, and the cog with everything about the program (see "The cog" below). Under it, the week Monday to Sunday (`the-week.md`).
- **Middle: the view.** Tabs for Day, Calendar, History, Progress and Photos; on a phone the same choice is a dropdown. While a workout is being logged the tabs give way to the live workout (`workout-logger.md`).
- **Right: what is picked.** An exercise in the day, a calendar date, a workout, a lift or a photo day. With nothing picked it only says what to pick.

## The cog

Everything about the program as a whole sits in one dropdown under the cog beside its name, at the top of the left panel. Tyler, 18 Oct 2026: "All of these settings should be in a cog icon dropdown here and all the other options should live within this dropdown". It opens to the right of the cog, over the middle panel, not back over the left menu. It is the same shape as Project's My settings:

- **The actions at the top:** Rename, Make active, Pause or Resume, Share (the owner's alone), Archive or Bring back, and Delete. Rename, Pause, Share and Delete open their own window, so the dropdown closes first.
- **The program's settings below, as cards that fold open:** Starting data, Weight rules and Training blocks. Each field saves as it changes, and closing the dropdown saves the field being typed in.

The panels resize by dragging the lines between them, and the widths are remembered in this browser (`fitness-program-horizontal`). A side panel shuts when dragged closed, and a tab on the edge brings it back. Below 1280px wide one panel shows at a time, with a tab for each; picking something switches to the right panel's tab.

## The address

Everything that decides what shows is in the address (`src/lib/fitness/program-search.ts`), so a link, a bell notice or a reload opens the same thing:

- `view`: Day (unset), Calendar, History, Progress or Photos.
- `day`: the weekday the Day view shows, 0 is Sunday. Unset is today's weekday.
- `pick`: what the right panel shows.
- `workout`: a workout being logged, which takes over the middle panel.
- `compare`: two photo days side by side.

Picking a weekday or an item never reloads the page. Changing the view or opening a workout does, and each view loads only its own data (`src/lib/fitness/program-page.ts`).

## Who sees what

The owner sees and changes everything. A coach the owner said yes to can open the program and change its week, starting data and rules, but can't start, log or change a workout, and doesn't see Share. Anyone else gets "That program doesn't exist or you can't see it."

## Code

Route `src/routes/_authenticated/programs_.$programId.tsx`; frame `src/components/fitness/dashboard/program-dashboard.tsx`; the Day and Calendar parts in `src/components/fitness/program/`.
