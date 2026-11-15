# The Library dashboard

`/library` is one dashboard on the shell's three-panel design (Tyler, 15 Nov
2026: "We need to revamp the ui to the new shell 3 panel ui", then "I think
the library should live as a left panel dashboard block"). The left panel is
the person's own page, with every library in a fixed Libraries block and the
"/" blocks of the library picked. The middle holds that library's notes under
three tabs. The right panel is the open note. On a phone the three are pills.

The design is `.agents/skills/Design/admin-3-panel-design/SKILL.md`, and every
piece of it the shell has is the shell's own copy, imported.

## Tyler's rules

### 15 Nov 2026

- The libraries live in the left panel as a dashboard block, one row per
  library. The `/library` table of libraries went. ("I think the library should
  live as a left panel dashboard block")
- All notes, Pinned, Plan steps and Quotes are tabs in the middle's one
  header. Archived and Trash are a Show choice in Filter. ("remove the pinned
  block and move them as middle tab")
- There are no folders. ("Remove folder block and folder feature")
- The left page has no Authors or Recently opened block. ("Remove the authors
  block. Remove the recenetly opened block")
- The open note's footer holds Analyse alone; its price is Analyse's tooltip.
  No word count or reading time. ("remove these labels", "replace it as a
  tooltip when hover over the analyze button")
- A notes row has the shell's cog, the shell's bin and a right-click menu, all
  three. ("shell has icons and right click", "its not either or, its both")
- Anything the shell already draws is built the shell's way, with no question
  asked. ("are you not following the shell standard? why are you asking these
  questions")

### 20 Oct 2026, still true

- A note is the only record. Videos and X posts come in as notes with the same
  fields plus their link. ("collapse video and post into notes")
- Every note has the same built-in fields: tags, priority and source.
  ("Fixed columns only")
- A note written by hand shows "Note" with a grey dot as its source. ("Note")
- An author is not a tag. ("I dont think tag make sense for author")
- Authors group by name, so two accounts edited to one name are one. Pressing
  an author's name on a note shows only their notes. ("Group by name")
- Filter has Source, Priority, Tag, Author, Analysed and Plan progress.
- The "N selected" menu has Move to library, Add tag, Remove
  tag, Set priority, Pin, Unpin, Archive, Unarchive, Analyse many, One plan
  from many and Move to Trash.
- Notes keep History, templates, Markdown in and out, and links between notes.
- Only a library's owner sees it. ("Only its owner")
- Notes can move to another library. ("notes can move to diff libraries")
- The app's left menu has one Library link. ("One "Library" link")

## Defaults Tyler was offered and did not change

- Tags and authors belong to one library. A note holds up to 25
  tags, kept in lowercase.
- New notes are Normal priority.
- Up to 1,000 notes show at once. Past that the list asks for a search or a
  filter.
- Deleting a library asks first, says how many notes go with it, and deletes
  them for good. There is no Trash for libraries.
- The Save to Note button saves into the library opened last, or makes one
  called "My library" for somebody with none.

## The address

- `/library` opens the library opened last (`lastOpenedLibraryId` in
  `src/server/note/library/page.ts`). Somebody with no library sees the same
  dashboard with only the Libraries block and its +.
- `/library/<id>` is one library. `?tab=` is `pinned`, `steps` or `quotes`;
  none is All notes. `?show=` is `archived` or `trash`; none is every other
  note. `?author=` is an author's name.
- `?sort=` is the column the table is sorted by: `title`, `source`,
  `priority` or `edited`, with a `-` in front for the other way
  round. None is the newest edited first.
- `?q=` is the search, and `?source=`, `?priority=`, `?tag=`, `?author=`,
  `?analysed=`, `?progress=` are the Filter picks. `?view=` is the saved view
  applied. `?open=` is the open note.
- **The dashboard remembers where it was** in this browser, one place per
  library, person and site. Opened at its bare address it goes back there.
  Once that place's list has arrived, the first row opens when no note is open,
  or when the remembered note has gone. Both moves replace the address, so Back
  leaves the dashboard. The shell's `ThreePanels` does this through its
  `place`, under `libraryPlaceKey` in `src/lib/note/view-key.ts`.
- **Picking another library is an arrival.** The frame stays, so the left page
  never draws again, and the new library's first note opens.
- **Opening a library marks it as the one opened last**, which is where the
  Save to Note button saves.

## Left panel

`src/components/note-library/library-left-panel.tsx`, its blocks in
`library-blocks.tsx`, the library menus in `library-menus.tsx`.

- **The header** is the collapse button, "Library", and the ⋮: General holds
  the page's Cover photo, and its footer holds Lock the notes.
- **The page** is the person's own, one per person in `note_library_pages`
  (`drizzle/0122_note_library_page.sql`). It saves itself 700ms after typing
  stops, cleaned on the server by `LIBRARY_PAGE_BLOCK_TYPES`
  (`src/lib/note/library/library-page.ts`). A locked page refuses a save.
- **A new page starts with** Libraries, then Tags, then an empty line. A page
  saved with the Pinned, Folders, Authors or Recently opened blocks loses them
  on its next read.
- **Libraries** is the fixed block. It is never in the "/" list, the editor
  refuses to take it off, the server puts it back at the top of a page saved
  without it, and its ⋮ only moves it up or down. Each library is a row with
  its colour dot and note count, pinned ones first, the picked one dark with
  the sliding bar. Its ⋮ holds New library, which opens a window with the
  name and colour, then Create library, which opens it. No block has a + in
  its heading; every "New …" is in the block's ⋮ (Tyler, 15 Nov 2026: "all the
  + icon must move into the dotted icon dropdown"). While the page is read, the
  Libraries block is drawn on its own, since it is the only way between
  libraries.
- **A library row's ⋮** is a tabbed menu. General holds Name and Colour, the
  two things the block shows, each saving itself, then Pin to the top and
  Delete library. Templates lists the library's templates, each with a bin.
  A description and a picture showed only on the old `/library` table, so they
  left the ⋮ and New library (Tyler, 15 Nov 2026: "most of the options here do
  not apply anymore since we merge the library as one dashboard"). Both stay
  stored, unshown.
- **Tags** lists every tag with its count. Pressing one filters the list to it;
  pressing it again takes the filter off. A row's ⋮ has Rename and Delete tag.
- **Renaming a tag** changes it on every note of the library, Archived and
  Trash included, and in the saved views that filter on it. A name another tag
  already has merges the two: the window says "hooks is already a tag here, so
  the two become one" and its button reads Merge. Renaming an author for the
  whole library went with the Authors block; Edit author in a note's ⋮ changes
  one note.
  Deleting a tag asks first and takes it off every note.
- **The cover photo** lies behind the left header, and the right panel carries
  the same picture behind the open note's header.
- `note_libraries.banner_url` stays stored and is no longer shown anywhere.

## Middle panel

`src/components/note-library/notes-list-panel.tsx`.

- **One header**: the tabs All notes, Pinned, Plan steps and Quotes with their
  counts,
  then the "N selected" menu while rows are ticked, the search box, Select,
  Filter, Views and New note. Trash has a ⋮ with Empty trash and no New note;
  Archived has no New note. On a phone the tabs keep at least 112px and scroll
  sideways.
- **New note** first asks how: Write a note, one of the import sources
  (`importing-a-note.md`), or Import Markdown. Write a note asks for the
  title, priority and template. Import Markdown picks .md files and makes a
  note of each, opening the last; it was a folder's ⋮ until folders went.
- **Filter** has Show first (All notes, Archived, Trash), then the
  filters above, then Clear and Save as view. A saved view keeps the filters,
  not Show.
- **The table** is the shell's: Note, Source, Priority, Edited, then each
  row's cog and bin. On All notes the pinned notes are grouped first under
  "Pinned", the rest under "Notes", each heading folding its rows. The Pinned
  tab is the pinned notes alone, in one list. Names are grey, dark while
  pointed at and while open, and the open row has the sliding bar. Columns
  drop out as the panel narrows.
- **A row's cog** opens the note. **Its bin** moves the note to Trash.
  **A right-click** opens Mass select, Pin, Archive, Duplicate, then Move to
  Trash under a line. In Trash the row has Restore and a bin that deletes for
  good, asking first.
- **Every column heading sorts the table.** The first click puts names A to Z,
  High first and the newest first; a second click turns it round. Trash keeps
  its own order, newest trashed first.
- **A spinner beside a title** means it is importing or being analysed. The list
  asks again every three seconds while any row is, and stops when none is.
- **A list that will not load** says "These notes could not be loaded." with
  Try again.
- **No matches** says so with a Clear filters button.
- **Search** reads the title, the note's own text, the post's words, the
  transcript, the summary, the tags and the author.
- **Mass select**: Select shows the tick boxes, and the "N selected" menu holds
  Tyler's list above. Analyse many takes up to 10 imported notes with the price
  first. One plan from many takes two to ten notes with a plan and makes a new
  note in the library that links to them.

## Plan steps and Quotes

`src/components/note-library/gathered-lists.tsx`, under the same header.

- **Plan steps**: every note's Action plan, grouped under the note's title,
  newest note first. Only unticked steps show until Show done. Ticking saves
  that note's plan and the tab's count drops. The title opens the note.
- **Quotes**: every quote in the library, then the transcript lines marked
  yellow, newest note first. The search box reads the words and the author.
  Pressing one opens its note, and a video's quote plays from its moment.

## Right panel

`src/components/note-library/note-panel.tsx`.

- **The frame** is the shell's right panel: the left page's cover behind the
  header, then the source's icon, the note's name typed in place to rename it,
  the pencil that shows or hides the text toolbar, the ⋮, and the collapse
  button at the edge. A note in Trash shows Restore and Delete for good in
  place of the pencil and ⋮.
- **The ⋮** is a tabbed menu. General has Details (Priority, Tags),
  Author (opens Edit author) and Place (Library, which moves the note), then
  Pin, Archive, Duplicate, Duplicate to library, Save as template, Download as
  Markdown and Download video, and Move to Trash in its footer. Outline lists
  the headings; one press scrolls there. Versions lists the earlier copies;
  one press opens History on it (`note-editor.md`).
- **The body**: the author with their picture, the text edge to edge, then for
  an import the Video or Post card and the Summary, Action plan, Quotes and
  Transcript cards (`importing-a-note.md`, `analysing-a-note.md`), then
  Linked from.
- **The cards sit in the panel gutter**, so Settings → Styling → Panel cards →
  Edge to edge moves them as it moves every side panel's cards (Tyler, 15 Nov
  2026: "right panel outer padding is not wired to settings"). The author line
  and the text sit 15px in, on the same gutter.
- **The footer** is on an imported note only. It holds Analyse, whose price
  shows when it is pointed at, or where an import or analysis has got to.
- **Under the player**: "Add time to note" and the speed, 1x, 1.25x, 1.5x or 2x,
  remembered in this browser.
- **The video starts where it was stopped.** Its place is saved on pause, every
  15 seconds while it plays, and when the note closes, in
  `note_notes.played_seconds`. Stopped within 5 seconds of the end counts as
  finished.
- **While a note loads** the panel shows its name in the header and nothing
  under it, with no spinner (Tyler, 20 Oct 2026).
- **With no notes at all** the panel says "No notes here. New note writes one
  or imports a link."

## Duplicate

`duplicateNote` in `src/server/note/library/notes.ts`. Duplicate in the note's ⋮
or a row's right-click menu makes "Copy of <title>" and opens it. Duplicate
to library makes it in another library, where its "[[" links become plain
text, as a move does.

- **The copy carries** the text, tags, priority, author, the import, the AI's
  cards and the ticks. It starts with no History, not pinned or archived, and
  from the start of its video.
- **The copy shares the saved video and pictures** rather than storing them
  twice. Deleting either note keeps a file the other still uses
  (`removeNoteFiles` in `src/server/note/library/files.ts` looks at this
  person's other notes with the same link first). The last of the two takes
  the file with it.
- **A link is one note per library.** A copy in the same library does not keep
  the site's id, so importing the link again opens the original. A copy in a
  library that does not have the link yet keeps it.
- **Refused** while the note is importing, its X video is saving, or it is
  being analysed.

## Download video

Download video (or Download sound) in the note's ⋮ saves the note's file under
its title, from `/api/v1/note/<id>/video`
(`src/routes/api/v1/note/$noteId/video.ts`). A plain link to the file would
not do: it lives on the bucket's own address, and a browser plays a link to
another address rather than saving it. Another person's note answers 404.

## Moving a note to another library

From the note's ⋮ (Place, Library) or the "N selected" menu. Tags and author
go with it. A "[[" link to a note left
behind becomes its plain title, and links from the old library to it go. A link
the other library already has is skipped.

## Trash

A note in Trash stays 30 days, then the `note-imports` worker deletes it for
good with its saved files. Restore puts it back. Empty trash and Delete for good ask first.

## Where the code is

- Tables: `src/server/note/schema.ts`. SQL in `drizzle/0102_note_library.sql`,
  `drizzle/0104_note_pins_and_play_place.sql` for the video's place,
  `drizzle/0122_note_library_page.sql` for the left page, and
  `drizzle/0123_note_remove_folders.sql`, which dropped the folders, each
  note's folder, the old pinned rows and each note's last-opened time.
- Server code: `src/server/note/library/` (`libraries.ts`, `notes.ts`,
  `cards.ts`, `page.ts`).
- Server functions: `src/lib/api/note/library.ts`, `notes.ts` and
  `library-page.ts`.
- Browser code: `src/lib/note/library/`.
- Screens: `src/components/note-library/`. The routes are
  `src/routes/_authenticated/library.index.tsx` and `library.$libraryId.tsx`.

## The left menu link

Migration `0103_note_library_menu.sql` changed every saved left menu, each
site's admin menu and the members' menu. The Library link
(`item-note-library`, icon "library") took the place of the first of the
Videos, Notes and Posts links the menu had, kept that link's visibility and
roles, and the other two went. `/library` is not under `/admin`, so members see
it. The videos, posts and notes saved before 20 Oct 2026 were deleted, not
converted. ("Start fresh, delete them")
