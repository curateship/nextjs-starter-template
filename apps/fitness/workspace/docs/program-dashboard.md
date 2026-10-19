# A program's dashboard

Every program has its own three-panel dashboard at `/programs/<id>`, reached from the Programs dashboard after the program is made. Tyler, 18 Oct 2026: "I create a program via modal, choose a routine, input my starting data then create. Only then I get to the 3 panel dashboard." It is laid out like the Project app's pages, from copies of Project's `three-panels.tsx` and `panel-card.tsx`.

## The three panels

Tyler redrew all three on 18 Oct 2026, and the screens follow his drawings.

- **Left: the program and its week.** A banner across the top with the back arrow to Programs and the cog on it (see "The cog" below). The program's square picture overlaps the banner's foot, with its name beside it, then its routine type and a green Active tag (or Paused or Archived). Under that, the This week card (`the-week.md`).
- **Middle: the view.** Tabs for Day, Calendar, History, Progress and Photos; on a phone the same choice is a dropdown. The same row holds the day's menu (the three dots) and Start workout on every view, as Tyler drew Progress on 18 Oct 2026; away from the Day view they act on the weekday last picked, today's by default. While a workout is being logged the tabs give way to the live workout (`workout-logger.md`).
- **Right: what is picked.** An exercise in the day, a calendar date, a workout, a lift or a photo day. With nothing picked it only says what to pick.

## Banner and picture

Both are optional and both come from the person's own uploads, through the shell's media picker (`drizzle/0099_fitness_program_pictures.sql`).

- **The banner:** while the pointer is over the top of the panel, a picture button shows beside the cog, and a second one to take the banner off when there is one. The picture button opens the media picker straight away; Tyler, 18 Oct 2026: "why not just open the picker". Clicking the banner itself does nothing, after a menu that opened over the name was a bug. With no banner, the top is a soft grey fade into the panel.
- **The picture:** clicking it opens the media picker straight away. While the pointer is over the panel, a small x on its corner takes it off. With none, it shows the program's initials: "fsf" is FS, "Push Pull Legs" is PP.
- The server refuses any address that isn't one of the uploads of the person saving it, the same rule as a profile photo, so a program never shows an outside picture (`setProgramPictures` in `src/server/fitness/programs.ts`).
- Whoever can change the program can change them: the owner, or their coach. An archived program can't.

## The cog

Everything about the program as a whole sits in one dropdown under the cog on the banner. Tyler, 18 Oct 2026: "All of these settings should be in a cog icon dropdown here and all the other options should live within this dropdown". It opens to the right of the cog, over the middle panel, not back over the left menu. Laid out as Tyler drew it the same day:

- **The program's settings at the top, as cards that fold open, scrolling on their own:** Starting data, then Weight rules and Training blocks under it. Starting data has a summary line under its heading ("66 kg · 172 cm · Build muscle"), then Body (bodyweight, height and five measurements, two to a row, each with its unit written inside the box), Training (what you want most and how long you have lifted, each a segmented row), the equipment you have and your best lifts. Each field saves as it changes, and closing the dropdown saves the field being typed in. Nothing says Saved: Tyler took that word out on 18 Oct 2026, and a save that fails says so in a toast.
- **The actions under them, as a plain menu:** Rename, Make it the active program (only when it isn't), Pause program or Resume program, Share (the owner's alone), Archive or Bring back, a line, then Delete program in red. Rename, Pause, Share and Delete open their own window, so the dropdown closes first.

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
