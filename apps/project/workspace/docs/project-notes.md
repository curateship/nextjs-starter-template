# Project notes

A project has its own list of notes behind the note icon in the left panel's
header, between the pin and the ⋮. They work like a trip's notes in Travel.
The task is `workspace/tasks/project-notes/01-project-notes.md`.

## Tyler's rules, 6 Nov 2026

- "Add a note feature here ... like in travel app", pointing at the gap
  between the pin and the ⋮ on the project page.
- He picked: the note icon and list, "/" blocks, Duplicate and Delete, team
  or private notes (taken out later that day), who wrote it and when,
  pinning a note to the top, notes on
  "Just me" lists, deleted notes going to the Bin, linking a note with #, and
  dragging notes into order.
- Who writes a team note: "Everyone on the project".
- Pins and the dragged order: "Same for everyone".
- Delete: "Bin with Undo, no ask".
- Later the same day: "remove the privacy feature". There are no private
  notes. Whoever can see the project sees every note on it.

## The icon and the list

- **The icon** is Lucide's NotebookPen. It bends into an × while the notes
  show and back when they close, with the same motion as the inbox and Look
  back icons (`NotesMorphIcon` in `src/components/project/inbox-morph-icon.tsx`).
- **The notes take the panel's place.** The page, Lead, Client, Time and
  Milestones come back when the notes close. The header keeps the project's
  name, its dot and its back arrow.
- **With no notes** the panel is one dashed area, Add a note, that makes the
  first one. An archived project with no notes says "No notes on this
  project." instead.
- **With notes,** each row shows the writer's face, the note's first line,
  and the writer's name with the day it last changed, such as "Anna, Nov 6,
  2026". A pinned note has a yellow pin.
  New note sits under the list.
- **A note's name is its first line of words.** A note that starts with a
  picture is named by the first words under it, and a note with no words is
  "Empty note". The words of a # link inside it are left out of the name,
  because not every reader may see what it points at.
- **A writer whose account was deleted** shows as "A deleted account". One
  who only left the team keeps their name.

## Writing a note

- **A new note opens with the cursor in it.** It is the same editor as the
  project's page above the notes, with the same "/" blocks: everything a
  task's notes have except File and the Video or Promo card, which belong to
  a task.
- **Pictures come from Unsplash or a web address.** There's no upload,
  because an uploaded picture becomes a task's file and a project note has no
  task. The project's page works the same way.
- **It saves itself** 700ms after the last letter and when it's left. A save
  that fails says why and is tried again with the next letter.
- **Back to notes,** right under the note, goes back to the list.
- **Everyone who can see the project writes its team notes:** its members
  and the site admin. An archived project's notes read only.
- **At most 200 notes a project.** One more is refused with "A project can
  hold at most 200 notes. Delete one to add another." Notes in the Bin don't
  count.

## Who sees a note

- **Every note on a project is seen by everyone who can see the project:**
  its members and the site admin. There's no private note. The server checks
  who can see the project on every read and every change, not just the
  screen.
- **A "Just me" list's notes** are its person's and the site admin's, the
  same as the list. The note icon is the only button in that header, because
  a "Just me" list has no pin and no ⋮.

## Right-click, pins and order

- **Right-click a note** for Pin to top (or Unpin), Duplicate and Delete.
  Where the notes read only, right-click does nothing.
- **Pinned notes sit above the rest,** and a pin is the same for everyone on
  the project. Pinning puts a note at the top of the pinned ones. Unpinning
  puts it at the top of the rest.
- **Duplicate** makes a copy at the top of the unpinned notes. Whoever made
  the copy is its writer.
- **Drag a note by its handle** to change the order. The handle shows when
  the row is pointed at, and always on a phone. The order is the same for
  everyone. A pinned note can only move among pinned notes, and an unpinned
  note among the rest.
- **A new note** goes to the top of the unpinned ones.

## Deleting

- **Delete doesn't ask.** The note goes to the project's Bin and "Note moved
  to the bin." shows with Undo, which puts it back where it was.
- **The Bin,** under the tasks panel's More menu, lists deleted notes beside
  deleted tasks, newest first. Each note says "Note, deleted by Ben" and when.
  Bring back works for everyone who can see the project.
- **After 30 days** a note in the Bin is deleted for good, in the same daily
  clean-up as tasks. Empty bin, the site admin's, takes the notes too.

## Linking a note with #

- **Typing # in a task's notes or in a chat** lists project notes after the
  tasks, each with a notebook icon and its project's name. Only notes on
  projects the writer can see are offered. The list looks through the 500 most recently
  changed notes the writer can see.
- **The link shows the note's first line** and opens the project page with
  the notes open on that note. A note that has since been renamed shows its
  new first line.
- **A reader who can't see the note's project reads "a note you can't
  see",** and it isn't a link. A note in the Bin, or gone, reads "deleted note".
- **The writer can only link notes they can open right now.** Anything else
  is refused with "You can only link notes you can see that aren't in a bin."
- **In a bell notice** a link to a note in another project reads "#a note".
- **How a link is saved.** In a message, as `#[Meeting notes](note:<note
  id>)`. In notes, as an ordinary link to `/projects/<project>?note=<note>`.
  Both go through the same reading as task links
  (`src/server/project/task-links.ts`); see "Linking a task with #" in
  [Task chat](task-chat.md).
- **Opening a note from a link** reads `?note=` once and then takes it out of
  the address, so the same link works again. On a screen under 1280px wide
  the left panel stays behind its Details pill until it's tapped.

## What it doesn't do

- **Notes don't update live.** A teammate's new note or change shows the
  next time the notes open or Back to notes is pressed.
- **There's no search, no earlier versions, no @ tags and no lock** on a
  project note. Tyler was offered them on 6 Nov 2026 and didn't pick them.
- **There are no private notes.** They were built on 6 Nov 2026 and taken
  out the same day ("remove the privacy feature").

## Where it lives

- `drizzle/0148_project_notes.sql`: the `project_notes` table, one row per
  note, with its writer, body, pinned, place in the order and bin columns.
- `src/server/project/project-notes.ts`: every rule above, on the server.
- `src/lib/project/project-notes.ts`: a note's name from its first line.
- `src/lib/api/project/project-notes.ts`: the calls the screen makes, and the
  # list's search across tasks and notes.
- `src/components/project/project-notes-panel.tsx`: the list and the open
  note. `project-page-notes.tsx` holds the editor shared with the project's
  page, and `project-details-panel.tsx` the icon.
- `src/server/project/project-notes.test.ts`: who sees what, the cap, the
  order, the Bin and # links.
