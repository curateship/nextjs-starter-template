# The notes dashboard

`/notes` is where a person writes their own notes. It is one screen of three
panels: folders on the left, the notes in the middle as a list, a table or a
board, and the open note on the right.

## Tyler's rules, 18 Oct 2026

These are his answers, in his words where he gave words. They outrank the code.

- Every signed-in member gets a "Notes" left menu link, and each person sees
  only their own notes. Same as Videos.
- Notes have their own folder list. Videos' folders stay as they are.
- Folders can sit inside folders.
- Three panels like Videos. On a phone they become three tabs.
- A folder opens on the List view the first time.
- Deleting a folder sends it, the folders inside it and all their notes to
  Trash together. Restoring the folder brings everything back with its fields.
  ("All go to Trash together")
- Trash keeps a deleted note 30 days. Empty trash clears it sooner.
- Turned down: a calendar view, public share links, a relation field, a Cmd+K
  jump box, asking AI across all notes, voice notes, saving a web page, a
  default template per folder and a daily note ("Drop the daily note").

## Who sees what

- **Every signed-in member gets in, not only admins.** The shell's `/admin`
  layout turns non-admins away, so the screen lives at `/notes` under
  `_authenticated` (`src/routes/_authenticated/notes.tsx`).
- **Each person sees only their own notes and folders.** Every query in
  `src/server/note/notes/` is scoped to the signed-in person, including the
  search and the "[[" note picker.
- **The Notes link in the left menu** was added by migration
  `0099_note_notes_menu.sql`, right after the Videos link in every saved menu
  (each site's admin menu and the members' menu). A menu with no Videos link
  gets it after the first entry of the first section. A menu that already links
  to `/notes` is left alone, and a menu never saved has nothing to add it to.

## The address

`?folder=<id>` is the folder showing (or `loose`, `archived`, `trash`; no
`folder` means All notes), `?view=<id>` is the saved view, and `?open=<id>` is
the open note. A reload, a shared link or a reminder in the bell comes back to
the same place.

## Left panel: folders

- **Recently opened** sits at the top: the last 3 notes this person opened,
  newest first. Opening a note on any device counts, because the time is kept
  on the note (`last_opened_at`).
- **All notes and Loose notes** come next. A loose note is one in no folder; it
  has no fields.
- **The folders are a tree.** The arrow beside a folder with folders inside
  opens and shuts it, and this browser remembers which are shut.
- **The grip drags a folder.** Up and down reorders it among its neighbours.
  Dragging it to the right puts it inside the folder above it, one level per
  16px. The tree moves at once and comes back if the save is refused. A folder
  can never go inside itself or one of its own folders, and the tree stops at
  six levels deep.
- **The folder's icon** is a button that opens the icon picker.
- **The cog opens the folder's menu:** Fields, Templates, Import Markdown,
  Rename, New folder inside, and Move into (the same move as dragging, with no
  mouse).
- **The bin sends the folder to Trash** with the folders inside and every note
  in them. The confirm says how many notes and folders go with it.
- **Archived and Trash** sit at the foot with their counts.

## Middle panel: the notes

- **The view tabs** (folders only) start with List, then each saved view. The
  cog beside an active saved view renames it, moves it left or right, or deletes
  it. Deleting a view never deletes a note.
- **The toolbar** has the search box, then for a folder Filter, Sort, Group by
  (board only) and the List, Table and Board buttons, then New note. Archived
  has no New note and Trash has Empty trash instead.
- **Changing a filter, the sort, the board's grouping, a total or the layout**
  changes the screen at once. The tabs then offer Save (on a saved view) and
  Save as new view.
- **List** shows a card per note: icon, title, first line, how much of its
  checklist is done, and up to three field values. Pinned notes come first,
  then the newest edited.
- **Table** shows a column per field plus Title and Edited. Clicking a heading
  sorts by it. Under each number column a total can be set to Sum, Average or
  nothing.
- **Board** shows a column per option of one choice field, plus No value.
  Dragging a card to another column sets that option on the note. The card moves
  at once and goes back if the save is refused. A folder with no choice field
  says so and offers its Fields window.
- **Search** reads titles, the text of every note and every field value, in the
  folder showing, or everywhere on All notes. Archived notes show with an
  Archived badge. Trash is never searched from the other rows.
- **Up to 1,000 notes** come back for one folder or search. Past that the list
  says so and asks for a search or a folder.
- **Tick boxes** on cards and rows pick notes for a change to many at once:
  Move to folder, Set a field (in a folder), Pin, Unpin, Archive or Unarchive,
  and Move to Trash. Each is one request, and the toast says how many changed
  and how many were already that way.

## Right panel: the open note

`note-editor.md` covers the text itself. Around it:

- **The header** shows the note's icon, title and folder, then Outline (the
  headings, click one to scroll to it), History, and the menu: Pin, Archive,
  Move to folder, Save as template (in a folder), Download as Markdown, Move to
  Trash.
- **The icon and cover** sit above the title. The cover uses the shell's own
  picture picker, so it is stored as a picture address from the media library.
- **Fields** is a grey card under the title in a folder. A loose note says to
  move it into a folder to give it fields. `note-fields.md` covers them.
- **Video** links the note to one of the person's saved videos.
  `note-fields.md` covers that too.
- **Under the text** sit the word count and reading time ("412 words, 2 min
  read", at 200 words a minute) and Linked from, the notes that link here.

## Pinned, archived and Trash

- **Pin** keeps a note above the rest in its folder, newest pinned first.
- **Archive** takes a note out of its folder and views. It stays in search, with
  a badge, and on the Archived row, where Unarchive puts it back.
- **Move to Trash** keeps a note 30 days. Restore puts it back in its folder, or
  loose (and without its field values) when that folder is gone or in Trash.
  Delete for good removes it and its earlier copies at once.
- **A note that went to Trash with its folder** is not listed on its own and
  comes back only with its folder.
- **A folder in Trash** shows on the Trash row with how many notes went with it,
  and Restore brings it and exactly what went with it back. A folder whose own
  parent is gone comes back at the top level, and a name taken meanwhile gets
  " (restored)" on the end.
- **The `note-notes` worker** deletes for good whatever has been in Trash over
  30 days, on the shell's 15-second background pass
  (`src/server/note/notes/jobs.ts`, registered in `src/app/server-options.ts`).

## Before the first note

An empty Notes screen shows "No notes yet. New note makes one, and folders on
the left keep them sorted." and the New note button. There is no made-up
sample: Tyler had it taken out on 19 Oct 2026.

## Where the code is

- Tables: `src/server/note/schema.ts`, SQL in `drizzle/0098_note_notes.sql`.
- Server code: `src/server/note/notes/`.
- Server functions: `src/lib/api/note/notes.ts` and `notes-folders.ts`, every
  one on `userGet` or `userPost`.
- Browser code: `src/lib/note/notes/`.
- Screens: `src/components/note-notes/`.
