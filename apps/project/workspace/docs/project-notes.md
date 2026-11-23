# Project notes

A project has its own list of notes, its Notes dashboard: the list in the
middle panel and the open note on the right, picked from the Dashboards block
on the project's page. They work like a trip's notes in Travel. The tasks
are `workspace/tasks/project-notes/01-project-notes.md` and
`workspace/tasks/Misc/writing-canvas.md`.

## Tyler's rules

On 6 Nov 2026:

- "Add a note feature here ... like in travel app", pointing at the gap
  between the pin and the ⋮ on the project page.
- He picked: the note icon and list, "/" blocks, Duplicate and Delete, team
  or private notes (taken out later that day), who wrote it and when,
  pinning a note to the top, notes on
  "Just me" lists, deleted notes going to the Bin, linking a note with #, and
  dragging notes into order.
- Who writes a team note: "Everyone on the project".
- Pins and the dragged order: "Same for everyone".
- Delete: "Bin with Undo, no ask". The Undo went with every success toast on
  11 Nov 2026 (Tyler: "remove them"); the Bin brings a note back.
- Later the same day: "remove the privacy feature". There are no private
  notes. Whoever can see the project sees every note on it.
- 15 Nov 2026: "Turn notes into block", pointing at the note icon. He then
  picked a block that shows the list and opens a note inside itself, added
  "Only through /". There is no note icon any more.
- 16 Nov 2026: "remove the notes and milestone block and instead create a
  dashboards for it. Also need to create a fixed block for link dashboards."
  He picked the list in the middle and the open note on the right, where it
  can be written in.

## The Notes dashboard

- **Notes in the page's Dashboards block** opens it, with its count in the
  row's pill (see "The project page's dashboards" in
  [Projects and tasks](projects-and-tasks.md)). The Notes block that held
  the list on the page from 15 Nov 2026 is gone, and a page saved with it
  drops it.
- **The middle** has the notebook icon, "Notes", a search box that is always
  there and narrows the list by each note's first line, and New note.
- **The notes are a table** (Tyler, 16 Nov 2026: "add proper table to both
  notes and milestones"), the shell's `CrmTable` as on the CRM and Admin:
  each row is the writer's face, the note's first line with a yellow pin
  when pinned, Written by, Changed, and a cog and a bin. Once a note is
  pinned, Pinned and Notes headings with their counts fold the rows under
  them. The open row has the sliding bar before its name. The order everyone
  shares shows until a column heading sorts the notes; a third press on the
  same heading goes back to it. Written by drops out as the middle narrows.
- **The right panel** is the open note, drawn as the other apps' right panels
  are, Travel's open activity first among them (Tyler, 16 Nov 2026: "look at
  the other apps right panel and do it again"): the notebook in its square,
  the note's first line, its ⋮ and the button that hides the panel; the body
  is the note, written in place; the footer says who wrote it and when it
  last changed. The ⋮ is the task's own menu look, a General tab of action
  rows: Pin to top, Duplicate, Move up, Move down, then Delete note in red
  under a line. It is never empty: with no note in the address it shows the
  first, and a project with no notes says to press New note.
- **The address keeps the open note** (`?note=`), so a reload or a pasted
  link opens it again.
- **Everyone on the project writes notes**, employees too, and the site admin
  with Lock blocks on the page. Who may write a note comes from the notes,
  not from the page.
- **A note's name is its first line of words.** A note that starts with a
  picture is named by the first words under it, and a note with no words is
  "Empty note". The words of a # link inside it are left out of the name,
  because not every reader may see what it points at.
- **A writer whose account was deleted** shows as "A deleted account". One
  who only left the team keeps their name.

## Writing a note

- **A new note opens on the right with the cursor in it.** It is the same
  editor as the project's page in the left panel, with the same "/" blocks: everything a
  task's notes have except File and the Video or Promo card, which belong to
  a task.
- **Pictures come from Unsplash or a web address.** There's no upload,
  because an uploaded picture becomes a task's file and a project note has no
  task. The project's page works the same way.
- **It saves itself** 700ms after the last letter and when it's left. A save
  that fails says why and is tried again with the next letter.
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
  same as the list. A "Just me" list has no page, so no Dashboards block: its
  notes open only from a # link, which shows its Notes dashboard.

## Right-click, pins and order

- **Right-click a note**, or use the ⋮ over the open one, for Pin to top (or
  Unpin), Duplicate, Move up, Move down and Delete. Deleting the open note shows the first one left.
  Where the notes read only, right-click does nothing.
- **Pinned notes sit above the rest,** and a pin is the same for everyone on
  the project. Pinning puts a note at the top of the pinned ones. Unpinning
  puts it at the top of the rest.
- **Duplicate** makes a copy at the top of the unpinned notes. Whoever made
  the copy is its writer.
- **Move up and Move down** in the same menus change the order, the same for
  everyone. A pinned note only moves among pinned notes, and an unpinned
  note among the rest. Until the notes became a table on 16 Nov 2026 a note
  was dragged by a handle instead; the table's rows don't drag.
- **A new note** goes to the top of the unpinned ones.

## Deleting

- **Delete doesn't ask,** from the menus or a row's bin. The note goes to the project's Bin, where Bring
  back puts it back where it was. Nothing pops up.
- **Right-click a note for Mass select too**, first in the menu, as on the
  task List (Tyler, 16 Nov 2026: "right clicking does not show mass
  select"). It turns the tick boxes on with this note ticked, and reads
  "Hide select" while they are on. The open note's ⋮ doesn't have it.
- **Mass select deletes many at once** (Tyler, 16 Nov 2026: "Add mass
  selection delete fucntion for both milestone and notes"). Select in the
  middle's header, after the search, shows a tick box on each note and a
  tick-all box in the heading. Ticked notes make the "N selected" button left
  of the search, whose menu has Delete. They go to the Bin without asking,
  as one note's Delete does. Ticks on notes the search hides are left out.
  If the open note goes, the right panel moves to another.
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
- **The link shows the note's first line** and opens the project page on its
  Notes dashboard with that note open on the right. A note that has since
  been renamed shows its new first line.
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
- **Opening a note from a link** keeps `?note=` in the address, as the open
  task's `?task=` is kept. On a screen under 1280px wide the note opens on
  the Note tab.

## What it doesn't do

- **Notes don't update live.** A teammate's new note or change shows the
  next time the project page opens.
- **There are no earlier versions, no @ tags and no lock** on a project
  note. Tyler was offered them on 6 Nov 2026 and didn't pick them. The search
  box came with the dashboard, and looks at first lines only.
- **There are no private notes.** They were built on 6 Nov 2026 and taken
  out the same day ("remove the privacy feature").

## Where it lives

- `drizzle/0148_project_notes.sql`: the `project_notes` table, one row per
  note, with its writer, body, pinned, place in the order and bin columns.
- `src/server/project/project-notes.ts`: every rule above, on the server.
- `src/lib/project/project-notes.ts`: a note's name from its first line.
- `src/lib/api/project/project-notes.ts`: the calls the screen makes, and the
  # list's search across tasks and notes.
- `src/components/project/project-notes-panel.tsx`: the dashboard's middle
  and right panels, and `src/lib/project/use-project-notes.ts` the list they
  share, loaded once by `project-workspace.tsx`. `project-page-notes.tsx`
  holds the editor shared with the project's page.
- `src/server/project/project-notes.test.ts`: who sees what, the cap, the
  order, the Bin and # links.
