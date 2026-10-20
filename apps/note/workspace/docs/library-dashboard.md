# The library dashboard

`/library/<id>` is one library as a three-column dashboard, drawn from Tyler's
picture of 20 Oct 2026 (`workspace/docs/assets/pasted-image-1792499120360947000.png`,
the left panel close up in `pasted-image-1792500098085205000.png`): the library,
its folders, authors, Recently opened and tags on the left, its notes as a table
in the middle, and the open note on the right. On a phone the three are pills.

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

- `?folder=` is a folder's id, `loose`, `archived` or `trash`; none is All
  notes. `?author=` is an author's name, in place of a folder.
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
  where the Save from x.com button saves.

## Left panel

`src/components/note-library/library-left-panel.tsx`.

- **The header**: back to the Library list, the colour dot and name, + (a
  dropdown with the new folder's name), pin, and the cog, which opens Library
  settings with its templates listed for deleting.
- **The banner** lies faintly behind the header, and the picture sits at its
  foot with the name and the note count. The description shows on the Library
  list only (Tyler, 20 Oct 2026: "remove").
- **LIBRARY and FOLDERS sit in one grey card** like the cards under them (Tyler,
  20 Oct 2026: "put this in card").
- **LIBRARY**: All notes and Loose notes, each with its count.
- **FOLDERS**: each folder with its count, then Archived and Trash. On hover a
  folder's count gives way to its cog (Rename, Import Markdown) and its bin.
  Deleting a folder sends its notes to Trash, and restoring one brings it back
  as a loose note, since its folder has gone.
- **Authors**: everyone the notes came from, most notes first, with the X
  picture where there is one. Clicking one shows their notes; clicking it again
  shows every note.
- **Recently opened**: the last three notes opened here, with when.
- **Tags**: every tag with its count. Clicking one filters the list to it;
  clicking it again takes the filter off.
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
  The newest edited come first in each.
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

## Right panel

`src/components/note-library/note-panel.tsx`.

- **The header** is the note's name, typed in place to rename it, then the
  pencil that shows or hides the text toolbar, and the ⋮ menu (Tyler, 20 Oct
  2026: "move all these into the 3 dotted dropdown"). There is no ×; another
  note is opened from the list.
  A note in Trash shows Restore and Delete for good instead.
- **The ⋮ menu**: Priority, Folder, Tags and Outline step into lists of their
  own with a back arrow, each row showing its current value on the right. Then
  History, Pin, Archive, Edit author, Move to library, Save as template,
  Download as Markdown and Move to Trash. Tags is the tags box: Enter adds, the
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
- **Video** or **Post**, and **Summary, Action plan, Quotes**, for an import
  (`importing-a-note.md`, `analysing-a-note.md`). A card's own icons (Open on
  YouTube, the bin) and its fold arrow show only on hover.
- **Linked from**: the notes that link here with "[[".
- **While a note loads** the panel shows its name in the header and nothing
  under it, with no spinner (Tyler, 20 Oct 2026).
- **A change made from the row's cog** in the middle shows here too.

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

- Tables: `src/server/note/schema.ts`, SQL in `drizzle/0102_note_library.sql`.
- Server code: `src/server/note/library/` (`libraries.ts`, `notes.ts`,
  `cards.ts`).
- Server functions: `src/lib/api/note/library.ts` and `notes.ts`.
- Browser code: `src/lib/note/library/`.
- Screens: `src/components/note-library/`. The route is
  `src/routes/_authenticated/library.$libraryId.tsx`.
