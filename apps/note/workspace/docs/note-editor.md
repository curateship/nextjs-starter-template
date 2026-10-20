# The note editor

The text of a note is written in a Tiptap editor of the app's own
(`src/components/note-library/note-editor.tsx`). In the right panel it runs
edge to edge with the panel's own inset (`inset`), and its toolbar shows only
after the pencil in the panel's header is pressed (`tools`). Tyler, 20 Oct
2026: "Just add an edit icon here and if clicked the tool appears at the top",
after a toolbar that appeared on hover pushed the text down, one at the bottom
was "worse", and one floating over the text covered the first line. What a note may hold is one
list, `noteBodyExtensions` in `src/lib/note/notes/body.ts`, and the server
checks every save against the same list.

## Why it is not the shell's editor

The shell's `DocumentEditor` (`src/components/shared/rich-text-editor.tsx`)
cleans everything it saves down to what a written page may hold, and its own
comment says extensions "may not add new kinds of content". Checklists,
tables, toggles, pictures and note links are all new kinds, so they would be
thrown away. The note editor copies that file's toolbar and bubble menu and
leaves the shell file untouched.

## What a note can hold

- **Text** with headings 1 to 3, bulleted and numbered lists, quotes, code
  blocks and dividers.
- **Checklists**: tick-box lines. The card in the list shows "3 of 5 done".
- **Toggles**: a summary line with a fold-away body. Open or shut is saved
  with the note.
- **Callouts**: a box for a note, tip, warning or problem (grey, blue, yellow,
  red). The icon in its corner changes the colour.
- **Tables**: rows and columns with a header row. While the cursor is in a table
  a bar offers add a row, add a column, header row on or off, and delete row,
  column or table. On a phone a wide table scrolls sideways inside the note.
- **Pictures**: dragged in, pasted, or picked from the Image button or "/". They
  upload to the shell's media library first (its own size and type limits) and
  only then go into the note, so a failed upload leaves no broken picture
  behind, only the reason. A line above the text says "Uploading a picture…"
  meanwhile.
- **Highlight and text colour**: six of each in the bar over selected text. Each
  is stored as a name and has a dark-mode shade (`src/lib/note/notes/colours.ts`).
- **Links to other notes**, typed with "[[" (below).
- **Video times**: a small chip such as "▶ 4:12" for a moment in the note's own
  video. Clicking it plays the video from there. On a note with no video now
  (removed with the bin) it shows the time and does nothing.

## Ways in

- **"/"** at the start of a line or after a space opens the block list: Text,
  Heading 1 to 3, Bulleted list, Numbered list, Checklist, Toggle, Callout,
  Quote, Code, Divider, Table, Image, Link to a note, and Video time while the
  note's video can play. Typing narrows it, arrows
  move, Enter picks, Escape closes.
- **The toolbar above the text** has the same blocks as buttons.
- **The bar over selected text** has bold, italic, strikethrough, inline code,
  link, highlight and text colour. The colours open as a second row in the same
  bar.

## Video times

`VideoTime` in `src/lib/note/notes/body.ts`, drawn by `VideoTimeView` in the
editor.

- **"Add time to note"** under the player puts the player's time at the cursor,
  or on a new line at the end when the text was never clicked into.
- **"/" Video time** does the same, offered only while the note's video can
  play, with the time it is at as the hint.
- **Only the time is stored**, in whole milliseconds. The server drops a time
  that is not a whole number from 0 to a day.
- **Markdown** writes it as "[4:12]". Reading Markdown back in leaves "[4:12]"
  as plain words.
- **Search and the word count** read it as "4:12".

## Links between notes

- **"[[" opens a search of the note titles in the same library.** Picking one puts in a
  link that shows the note's current title, so a rename shows everywhere.
- **Clicking a link opens that note.** A link to a note in Trash shows its title
  struck through. A link to a note deleted for good shows "Deleted note" and
  does nothing.
- **Linked from**, under the text, lists the notes that link to this one.
- **The server rewrites the links on every save** from the text itself, only to
  notes in the same library (`note_links`). A note moved to another library
  loses its links to the notes left behind, which become plain text.

## Saving

`src/lib/note/notes/use-note-autosave.ts`.

- **Saves happen by themselves**: 700ms after the last change, at once when the
  title box is left or the note is closed, and when the tab is hidden. One save
  at a time. The page header says Saving and Saved.
- **Every save carries the revision it started from.** If the note moved on
  since (another tab or device saved first), the save is refused and a window
  asks: "Keep this tab's version" saves what is on screen over the other one,
  which stays in History; "Use the other version" throws away what this tab had
  not saved and shows the other one.
- **A save that fails for any other reason** (a dropped connection) keeps the
  change in this browser under the note's id, says "Not saved yet, trying
  again", and tries every 10 seconds and the moment the browser is back online.
- **A save the server turns down for a reason** (the note is too long, it went
  to Trash in another tab, the session ended) says why in the error toast and
  is not sent again until the next change, so it never repeats on its own.
- **A note that is closed is not retried from.** Its last save still goes, and
  if that fails the change waits in this browser for the next time it opens.
- **Opening the note again in this browser** picks a kept change up and sends
  it. If the note changed elsewhere meanwhile, the same version window asks
  first.
- **Tags, priority, folder, author and the AI's cards save separately** and
  never count as a revision, so they cannot collide with the text.
- **Opening a note never saves it.** The editor tidies a note as it first draws
  it, which arrives as a change with the very same text; the editor hands on
  only a real change (`docText` in `note-editor.tsx`). Before 20 Oct 2026 every
  opening saved, and two copies of the panel could clash and ask which version
  to keep.

## History

- **A copy of the note as it was is kept before a title or text change**, at
  most one per five minutes of editing, and the newest 100 copies stay (Tyler,
  18 Oct 2026). Older ones are deleted as new ones arrive.
- **History in the note's header** lists the copies by time. Picking one shows
  it as it was; Restore puts it back. The note as it is now is kept as a copy
  first, so a restore can be undone the same way.

## What the server checks on every save

`cleanNoteBody` in `src/lib/note/notes/body.ts`:

- The body is the editor's JSON document, never HTML, and must fit the editor's
  own block list, block by block. Anything else is refused with "That note could
  not be saved as it is. Reload it and try again."
- A link is kept only to a web, email or phone address. A picture is kept only
  from a web address or one on this site (no `data:` or script addresses). A
  colour must be one of the named ones. A note link's id must look like an id.
- A body over about 400,000 characters of JSON is refused with "That note is too
  long to save. Split it into two notes."
- The plain words are stored beside the body (`body_text`) for search and the
  word count, with the first line, the checklist counts and the word count.
