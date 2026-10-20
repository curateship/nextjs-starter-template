# The library dashboard

`/library/<id>` is one library as a three-column dashboard, drawn from Tyler's
picture of 20 Oct 2026 (`workspace/docs/assets/pasted-image-1792499120360947000.png`,
the left panel close up in `pasted-image-1792500098085205000.png`): the library,
its pinned folders, folders, authors, Recently opened and tags on the left, its
notes as a table in the middle, and the open note on the right. On a phone the
three are pills.

## Tyler's rules, 20 Oct 2026

- A note is the only record. Videos and X posts come in as notes with the same
  fields plus their link. ("collapse video and post into notes")
- Every note has the same built-in fields: tags, priority, source and folder.
  Per-folder fields, the Board view and column totals are gone. ("Fixed columns
  only")
- Folders are one level. Folders inside folders went.
- Importing files a note in a folder named after its source, made the first
  time. ("Import files it there")
- A note written with New note shows "Note" with a grey dot as its source.
  ("Note")
- An author is not a tag. ("I dont think tag make sense for author")
- An Authors card sits in the left panel; clicking an author, or an author's
  name on a note, shows only that author's notes. Authors group by name, so two
  accounts edited to one name are one row. ("Yes, Authors card", "Group by
  name")
- The Filter popover has Source, Priority, Tag, Author, Analysed and Plan
  progress.
- The "N selected" menu has Move to folder, Move to library, Add tag, Remove
  tag, Set priority, Pin, Unpin, Archive, Unarchive, Analyse many, One plan
  from many and Move to Trash.
- Notes features kept: History, templates, Markdown in and out, links between
  notes.
- A Pinned card sits above LIBRARY, folders are pinned from their row, and the
  LIBRARY card folds. ("Add a collapsible pinned card above library", "Add a
  pin icon here", "Make library card collapsible too", and on what the pin
  does: "Pin a folder")
- Every row of the LIBRARY card pins too, and LIBRARY is drawn as the same
  card as the others. ("I should be able to pin library folders too",
  "library should use the same card Ui as the other cards", with his picture
  `workspace/docs/assets/pasted-image-1792526100699094000.png`)
- Plan steps and Quotes are two rows in the LIBRARY card, with their list in
  the middle. ("Rows in the LIBRARY card")

## Defaults Tyler was offered and did not change

- The left header is a Project's: back arrow, colour dot, name, a + for a new
  folder, pin and cog. The banner and picture sit behind and under it.
- A row's cog opens Pin, Archive, Move to folder, Move to library and Priority.
  The row's bin moves the note to Trash.
- Tags, Authors and Recently opened belong to one library. A note holds up to 25
  tags, kept in lowercase.
- New notes are Normal priority.
- Up to 1,000 notes show at once; past that the list asks for a search or a
  folder.

## The address

- `?folder=` is a folder's id, `loose`, `archived`, `trash`, `steps` or
  `quotes`; none is All notes. `?author=` is an author's name, in place of a
  folder.
- `?sort=` is the column the table is sorted by: `title`, `source`,
  `priority`, `folder` or `edited`, with a `-` in front for the other way
  round. None is the newest edited first.
- `?q=` is the search, and `?source=`, `?priority=`, `?tag=`, `?author=`,
  `?analysed=`, `?progress=` are the Filter picks. `?view=` is the saved view
  applied. `?open=` is the open note.
- A reload, a shared link and a bell notice come back to the same place
  (`src/lib/note/library/address.ts`).
- **The dashboard remembers where it was** in this browser, one place per
  library. Opened at its bare address it goes back there. Once that place's
  list has arrived, the first row opens when no note is open, or when the
  remembered note has gone from the list (UI standard, three-column
  dashboards). Both moves replace the address, so Back leaves the dashboard,
  and on a phone the list stays in front of the note opened by itself.
- **Opening the dashboard marks the library as the one opened last**, which is
  where the Save to Note button saves.

## Left panel

`src/components/note-library/library-left-panel.tsx`.

- **The header**: back to the Library list, the colour dot and name, + (a
  dropdown with the new folder's name), pin, and the cog, which opens Library
  settings with its templates listed for deleting.
- **The banner** lies faintly behind the header, and the picture sits at its
  foot with the name and the note count. The description shows on the Library
  list only (Tyler, 20 Oct 2026: "remove").
- **Pinned**, a folding card above LIBRARY: the pinned folders and the pinned
  LIBRARY rows (All notes, Loose notes, Plan steps, Quotes, Archived, Trash)
  together, the first pinned at the top, each with its icon and count.
  Clicking one shows it. On hover a filled pin shows left of the row's count,
  and unpins it. With nothing pinned it says "Pin a folder, or any row of
  Library, to keep it here." A pinned row stays in LIBRARY too. A folder's pin
  is `note_folders.pinned_at`; a LIBRARY row's is in the library's
  `note_libraries.pinned_rows`, with when it was pinned.
- **LIBRARY and FOLDERS sit in one card** (Tyler, 20 Oct 2026: "put this in
  card"), the same `PanelCard` as Pinned, Authors, Recently opened and Tags:
  "Library" as its heading, the fold arrow on hover, open or shut remembered
  in this browser. FOLDERS stays a small heading inside it.
- **Every row of LIBRARY has a pin on hover**, left of its count, as a folder
  has.
- **A row's icons show just left of its count, and nothing moves** (Tyler,
  20 Oct 2026: "THe pinned tab should be beside the count, not overlap it.
  same goes for the cog icon too", "the pinned should be on the left",
  "hovering over the items moves it up and down"). On hover or keyboard
  focus, and always on a phone, the pin, cog and bin appear between the name
  and the count. The count stays where it was, every row keeps its height
  (32px, a tag chip 28px), and a tag chip keeps room for its cog so the chips
  never shift; a long name is cut short instead. The row's button is
  stretched under the whole row, so a click anywhere but an icon opens it.
  The icons are muted with no background, hovered or not, as the cards' own
  cog is.
- **LIBRARY**: All notes, Loose notes, Plan steps (counting the unticked steps)
  and Quotes (counting the quotes and the highlighted transcript lines), each
  with its count. Archived notes and Trash are not counted.
- **The middle header keeps its icon while a list loads.** No spinning circle
  takes its place (Tyler, 20 Oct 2026: "remove the circle loading here").
- **FOLDERS**: each folder with its count, then Archived and Trash. On hover a
  folder shows its pin, its cog (Rename, Import Markdown) and its bin left of
  its count. Deleting a folder sends its notes to Trash, and restoring one brings
  it back as a loose note, since its folder has gone.
- **Authors**: everyone the notes came from, most notes first, with the X
  picture where there is one. Clicking one shows their notes; clicking it again
  shows every note. On hover a cog with Rename shows left of the count.
- **Recently opened**: the last three notes opened here, with when.
- **Tags**: every tag with its count. Clicking one filters the list to it;
  clicking it again takes the filter off. On hover a cog with Rename and
  Delete shows left of the count, inside the chip.
- **Renaming a tag or an author** changes it on every note of the library,
  Archived and Trash included, and in the saved views that filter on it. A name
  another tag or author already has merges the two: the window says "hooks is
  already a tag here, so the two become one" and its button reads Merge. Each
  note keeps a tag once, and its own handle and picture. Deleting a tag asks
  first and takes it off every note; a view that filtered on it then says the
  tag has gone. (`renameTag`, `deleteTag`, `renameAuthor` in
  `src/server/note/library/notes.ts`)
- **Every card's fold arrow shows only on hover**, and always on a phone.

## Middle panel

`src/components/note-library/notes-list-panel.tsx`.

- **The header** names what is showing and how many notes: "Loose notes · 5
  notes", or the author's name. The toolbar: the "N selected" button while rows
  are ticked, search, Filter, Views, Import and New note. Trash has Empty trash
  in place of Import and New note, and Archived has neither. In a narrow panel
  the buttons keep their icons and drop their words.
- **The table**: Note (a pin mark and the title), Source (a coloured dot and
  the name), Priority (High with an up arrow, Normal, Low with a down arrow),
  Folder, Edited, then the cog and the bin. Tags are not drawn on the rows
  (Tyler, 20 Oct 2026: "dont show tags"); the Tags card and Filter find them.
  Columns hide as the panel narrows, Folder first. Import is a borderless
  button. The open note's row is shaded and has a 2px bar down its left edge,
  dark in light mode and light in dark mode.
- **Pinned notes are grouped first** under "Pinned 2", the rest under "Notes 9".
  The newest edited come first in each, unless a column is sorted.
- **Every column heading sorts the table** (Note, Source, Priority, Folder,
  Edited). The first click puts names A to Z, High first and the newest first;
  a second click turns it round. The sort is in the address (`?sort=`) and the
  remembered place, and the server sorts, so the 1,000-note limit keeps the
  right end. Pinned notes stay grouped first, sorted the same way inside.
  Trash keeps its own order, newest trashed first, and its headings do not
  sort.
- **A spinner beside a title** means it is importing or being analysed. The list
  asks again every three seconds while any row is, and stops when none is. A
  missed answer is asked again three seconds later, without a toast.
- **A list that will not load** says "These notes could not be loaded." with
  Try again, rather than waiting for ever.
- **Search** reads the title, the note's own text, the post's words, the
  transcript, the summary, the tags and the author, in the folder showing or the
  whole library on All notes. Archived notes show in a search; Trash only on
  Trash.
- **Filter**: a Select per filter, then Clear and Save as view. Analysed is
  Analysed, Not analysed, Still importing or Failed; Plan progress is No plan,
  Not started, Part done or All done.
- **Views**: a library's saved filter sets. Opening one sets the same filters.
  A view whose tag or author has gone says so. Delete views turns the rows into
  delete buttons; deleting a view never deletes a note.
- **Mass select**: the chip beside the Note heading shows the tick boxes. The
  "N selected" menu holds Tyler's list above. Analyse many takes up to 10
  imported notes with the price first, and skips written notes. One plan from
  many takes two to ten notes with a plan and makes a new note in Loose notes,
  "Plan from 3 notes", that links to them.
- **Import and New note** are `importing-a-note.md` and a dropdown with the
  title, folder, priority and template.
- **The row's cog** also has Duplicate (below).

## Plan steps and Quotes

`src/components/note-library/gathered-lists.tsx`. Clicking either row in the
LIBRARY card shows its list in the middle in place of the table. The notes
under them are All notes, so the right panel still opens the first note on
arrival.

- **Plan steps**: every note's Action plan, grouped under the note's title,
  newest note first by when it was made, so a tick never moves its group. Only
  unticked steps show until Show done. Ticking saves that note's plan the way
  its own card does, one save at a time, and the left panel's count drops. The
  title opens the note. Archived and Trash are left out. No due dates, editing
  or dragging here.
- **Quotes**: every quote in the library, then the transcript lines marked
  yellow, newest note first, each with its author, its note and its time. The
  search box reads the words and the author. Clicking one opens its note, and a
  video's quote plays from its moment.

## Right panel

`src/components/note-library/note-panel.tsx`.

- **The header** is the note's name, typed in place to rename it, then the
  pencil that shows or hides the text toolbar, and the ⋮ menu (Tyler, 20 Oct
  2026: "move all these into the 3 dotted dropdown"). There is no ×; another
  note is opened from the list.
  A note in Trash shows Restore and Delete for good instead.
- **The ⋮ menu**: Priority, Folder, Tags and Outline step into lists of their
  own with a back arrow, each row showing its current value on the right. Then
  History, Pin, Archive, Edit author, Move to library, Duplicate, Duplicate to
  library, Save as template, Download as Markdown, Download video (only with a
  saved file) and Move to Trash. Tags is the tags box: Enter adds, the
  × on a tag takes it off, and tags already in the library show as you type.
- **The author**, with their picture, sits at the top of the body. Clicking the
  name shows their notes.
- **Edit author** changes the name and handle, gives a written note an author,
  and with an empty name takes it off.
- **The text** runs edge to edge as part of the panel, with no card around it
  (`note-editor.md`). Its toolbar shows at the top only after the header's
  pencil is pressed, and stays shown or hidden as other notes are opened. Under
  the author it gets a line above it. The word count and reading time sit under
  the text.
- **Video** or **Post**, and **Summary, Action plan, Quotes, Transcript**, for
  an import (`importing-a-note.md`, `analysing-a-note.md`). A card's own icons
  (Open on YouTube, the bin) and its fold arrow show only on hover.
- **Under the player**: "Add time to note" (`note-editor.md`) and the speed,
  1x, 1.25x, 1.5x or 2x. The speed is remembered in this browser for every
  video, and one picked in the player's own menu is kept too.
- **The video starts where it was stopped.** Its place is saved on pause,
  every 15 seconds while it plays, and when the note closes, in
  `note_notes.played_seconds`. Saving it is not an edit, so the note's Edited
  time stays. Stopped within 5 seconds of the end counts as finished, and the
  next play starts at the start (`src/components/note-library/player-tools.tsx`).
- **Linked from**: the notes that link here with "[[".
- **While a note loads** the panel shows its name in the header and nothing
  under it, with no spinner (Tyler, 20 Oct 2026).
- **A change made from the row's cog** in the middle shows here too.

## Duplicate

`duplicateNote` in `src/server/note/library/notes.ts`. Duplicate in the ⋮ menu
or the row's cog makes "Copy of <title>" in the same folder and opens it.
Duplicate to library makes it in another library: an import goes into that
library's folder for its source, a written note goes loose, and its "[["
links become plain text, as a move does.

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

Download video (or Download sound) in the ⋮ menu saves the note's file under
its title, from `/api/v1/note/<id>/video`
(`src/routes/api/v1/note/$noteId/video.ts`). A plain link to the file would
not do: it lives on the bucket's own address, and a browser plays a link to
another address rather than saving it. Another person's note answers 404.

## Moving a note to another library

From the row's cog, the note's menu or the "N selected" menu. An import goes
into the other library's folder for its source, made if it needs to be; a
written note goes loose. Tags and author go with it. A "[[" link to a note left
behind becomes its plain title, and links from the old library to it go. A link
the other library already has is skipped, and the toast says how many.

## Trash

A note in Trash stays 30 days, then the `note-imports` worker deletes it for
good with its saved files. Restore puts it back in its folder, or loose when
that folder has gone. Empty trash and Delete for good ask first.

## Where the code is

- Tables: `src/server/note/schema.ts`, SQL in `drizzle/0102_note_library.sql`,
  and `drizzle/0104_note_pins_and_play_place.sql` for the folder and row pins,
  the video's place and the three newer sources.
- Server code: `src/server/note/library/` (`libraries.ts`, `notes.ts`,
  `cards.ts`).
- Server functions: `src/lib/api/note/library.ts` and `notes.ts`.
- Browser code: `src/lib/note/library/`.
- Screens: `src/components/note-library/`. The route is
  `src/routes/_authenticated/library.$libraryId.tsx`.
