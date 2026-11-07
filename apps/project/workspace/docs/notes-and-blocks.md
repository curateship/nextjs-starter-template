# Notes and the "/" blocks

A task's notes take blocks as well as words. So do New task's and quick new
task's Description, a project's page in its left panel, each of a
project's notes ([Project notes](project-notes.md)), and the site admin's own
page on My dashboard.
Typing "/" opens a list of them. Meeting notes take words
only. A task template's starting notes took them too, until task templates
and their fields were removed on 6 Nov 2026 (Tyler: "We need to remove the
tasks templates feature too").

## Tyler's rules, 5 Nov 2026

- "Add the same feature from travel app that added blocks to the tiptap
  editor to this app. Add image, video and suggest other blocks that you
  think is helpful".
- He picked Task card, File, Callout, Checklist, Divider, Fold section, the
  Video or Promo card and Web page, on top of Image and Video.
- Image is "Same as Travel": upload, Unsplash search, or a web address. An
  upload becomes one of the task's "private files". He asked "What do you
  mean taks 10 files?" first: a task holds at most 10 files of 10 MB each,
  and a picture in the notes uses one of the 10.
- Video is "Travel's + Loom": YouTube, TikTok, Instagram and Loom.
- "Every notes box" takes "/", except meeting notes.
- The Task card shows "Name, status, person, due".
- File is "Pick or upload". In New task and quick new task: "Leave File out
  there".
- Callout is "Note, Warning, Decision".
- Checklist is "Tick only". Only "Anyone who can write notes" can tick.
- A Fold section folds for "Only that person".
- The Video or Promo card is the "Task's record, with name + picture".
- Web page takes "Any https page".
- Divider is a "Plain line".
- The blocks are Project's own, copied from Travel's
  (`apps/travel/workspace/docs/notes-and-blocks.md`). The shell's own "/"
  menu for every app is planned in
  `apps/shell/workspace/tasks/features/contacts/block-panels.md` and may
  replace this one later.

## The "/" list

- **Where it opens:** a "/" typed at the start of a line or after a space.
  A "/" inside a web address never opens it.
- **No +:** a + in the margin beside each line opened the list for a while
  on 5 Nov 2026 ("Add a + icon here to click to open the blocks"), and came
  out again the same day, from the project's page and then from a task's
  notes (Tyler: "Remove the + hover over icon", "why is the + not removed",
  "still here in task"). "/" is the one way in, and the words line up with
  the panel as they did before.
- **Right-click opens it too** (Tyler, 6 Nov 2026: "enable right click on
  left and right panel to open the blocks"): anywhere in a notes box that can
  be written in, such as the site admin's page on My dashboard and a task's
  notes in the right panel. The cursor goes where the click was (or to the
  end, past the last words), the list hangs from the pointer, and the picked
  block goes there. A pick, Escape or a click elsewhere closes it. With words
  selected, the browser's own menu shows instead, for Copy (`openAt` in
  `use-note-blocks.ts`, the handler in `note-editor.tsx`).
- **Two groups** (Tyler, 6 Nov 2026: "divider the blocks into basic blocks
  and advanced blocks"), each under a small grey heading with one line
  between them, edge to edge:
  - **Basic blocks:** what the writer types or pastes in themselves. Image,
    Video, Checklist, Callout, Divider, Fold section, Web page and Links.
  - **Advanced blocks:** blocks that show something live from the app. Task
    card, File, Comments and Video or Promo where the box offers them, and on
    the site admin's own page Projects, Daily card, Rating calendar and
    Rating trend, and on a team's page Check-ins, Workload, Attention, This
    week and Members.
  - The arrow keys walk the list as it shows, through the basic blocks and
    on into the advanced ones. Narrowing it by typing keeps only the headings
    whose group still has a block (`BLOCKS` in `note-block-nodes.ts`, drawn
    by `note-blocks-menu.tsx`).
- **Names only:** each row is the block's icon and name, with no grey line
  under it (Tyler, 6 Nov 2026: "remove all the sublabel").
- **Narrowing it:** letters after the "/" keep only the blocks whose name
  starts with them, so "/che" leaves Checklist and "/task" leaves Task card.
- **Keys:** the up and down arrows move through it, and Enter or Tab picks.
  Esc closes it and leaves the "/" as typed. So does a click anywhere else.
- **What each box offers:** every block in a task's own notes, with Video or
  Promo only when the task points at a record. New task, quick new task,
  a project's page and a project's notes leave out File and Video
  or Promo, because there is no task to hold a file or a record.
- **The site admin's own page** offers what a project's page does, plus four
  blocks no other note has: Projects, Daily card, Rating calendar and Rating trend
  (Tyler, 6 Nov 2026: "Your My dashboard page only"). Their habits and
  ratings are theirs alone, and a Projects block filters My tasks, which only
  that page sits beside. The Daily card block, like Comments, goes in once. Every other save drops the four, on the server too
  (`DASHBOARD_ATOM_TYPES` in `src/lib/project/note-blocks.ts`). What each one
  shows is in [My dashboard](my-dashboard.md#their-pages-blocks).
- **A team's page** on the Team dashboard offers what a project's page does,
  plus five blocks no other note has: Check-ins, Workload, Attention, This
  week and Members (Tyler, 7 Nov 2026: "checkins, workload and attention
  becomes blocks for the left panel"). Each shows the whole team, so each goes
  in once. Every other save drops the five, the site admin's own page too, on
  the server as well (`TEAM_ATOM_TYPES` in `src/lib/project/note-blocks.ts`).
  What each one shows is in
  [Teams and invites](teams-and-invites.md#the-team-dashboard).
- **Blocks on a left panel's page stand 15px apart**, on My dashboard and a
  team's page, the same as the panel's own edge on either side (Tyler, 7 Nov
  2026: "Make the gutter equal to the left and right"), while writing and
  while reading (`BLOCK_GAP_WRITING` and `BLOCK_GAP_READING` in
  `project-page-notes.tsx`). A project's page keeps the usual space.
- **Words already on the line** stay where they are. Checklist, Callout and
  Fold section start on the next line.
- **After a block with no writing in it** (a picture, a divider, a card),
  the cursor moves to the line under it, so typing on never replaces it.
- **Above a page's first block** (Tyler, 7 Nov 2026: "i cant click at the
  very upper editor here to insert content because the block is in it"): on
  the site admin's page, a team's page, a project's page and a project's note, a click in
  the 12px of panel edge above a first block, such as the Daily card, puts a
  new line there with the cursor in it. On a page that starts with writing,
  the click puts the cursor at the start of it. A click inside the page, or
  in a menu or dialog the page opened, never adds a line (`lineAbove` in
  `project-page-notes.tsx`).

## The blocks

- **Image.** An empty Image block offers Upload a picture, Unsplash, and a
  "Web address" field.
  - An upload becomes one of the task's files. It shows in the Files tab,
    counts toward the task's 10, and only people who can see the task can
    open it. New task and quick new task have no task yet, so they
    offer Unsplash and the web address only.
  - A web address has to start with `https://`.
  - The Unsplash search opens inside the block, not in a window, because a
    note can sit inside New task's window. A picked photo always shows its
    credit line, and picking one tells Unsplash it was used. With no
    Unsplash key on the server, the button isn't there.
  - A picture that stops loading shows "This picture no longer loads".
- **Video.** An empty Video block asks for a link. It takes YouTube links
  (Shorts too), full TikTok links, Instagram reels and posts, and Loom share
  links. Anything else gets "Paste a YouTube, TikTok, Instagram or Loom
  link." A short TikTok link gets told to open it and paste the full one.
  The block shows a still with a Play button, and the player loads only when
  pressed. YouTube gets a real still; the others show a plain box with the
  site's name. Pointing at a video shows "Open on YouTube" (or the other
  site) beside the bin.
- **Task card.** An empty Task card shows "Find a task", a search of the
  tasks this person can see, newest change first. Picking one shows the
  task's name, its status, who is on it and its due date. They are read
  fresh each time the note opens, in one request for every card in the note.
  Clicking the card opens that task in the right panel. A task the reader
  can't see shows "A task you can't see." with nothing to click. A deleted
  one shows "Removed: this task was deleted."
- **File.** An empty File block lists the task's files to pick from, with
  Upload a file under them. It is the one way to add a file to a task from
  its panel; the project's Files tab lists every one. The block
  shows the file's name, its size and a download button. Downloading follows
  the task's rule: only people who can see the task. Its corner holds
  Remove block, which takes the block out and keeps the file, and, for
  whoever may delete the file, Delete file, which asks "Delete brief.pdf?"
  and then deletes the file from the task (Tyler, 6 Nov 2026, once the task
  panel's Files box went). The block goes with it; any other block still
  showing that file reads "Removed: this file was deleted."
- **Comments.** The task's comments, with the box to write in, wherever the
  block is placed (Tyler, 6 Nov 2026: "Make comments a block"). It holds
  nothing of its own: it draws the task's stored chat, so the messages,
  @-tags, files, reactions, live updates, "3 new" and bell notices work as
  they always have (see [Task chat](task-chat.md)). One per task: picking
  Comments again only takes away the "/". Removing the block deletes no
  comment; a task with comments and no block shows them under its notes.
  Typing in its box never writes in the notes. Task notes only: New task
  and quick new task don't offer it, and copying notes onto a page with no
  task, such as a project's, leaves it out.
- **Checklist.** Lines with tick boxes. A ticked line is crossed out. A line
  is never a task or a step. Ticking saves at once, not a second later as
  typing does. Someone who can only read the task sees the ticks but can't
  change them.
- **Callout.** A tinted box of words with its icon: Note (grey), Warning
  (amber) or Decision (green), in Project's own chip tints. Pressing its
  icon changes the kind, so the bin is its only button, in the same corner as
  every other block's (Tyler, 5 Nov 2026: "the icons are not aligned"). It holds paragraphs and lists, never another block. Enter on an
  empty last line steps out of the box, so a callout at the end of a note
  isn't a trap.
- **Divider.** A plain line across the note, in the divider colour from
  Settings → Styling.
- **Fold section.** A bold heading line with an arrow. The arrow hides
  everything under the heading, up to the next Fold section or the end of
  the note. Enter at the end of the heading starts a normal line under it.
  Folding is each reader's own: it is remembered on their computer
  by the section's id and never saved in the note, so two people can fold
  the same note differently. A new section starts open. Splitting a heading
  in two gives the second half its own id.
- **Video or Promo.** Only in a task that points at a Video or Promo record
  (`connected-apps.md`).
  - The person assigned and the site admin see the record's name and
    picture, with the same Edit video or Open in Promo button.
  - Everyone else on the task reads the line the task panel already shows.
    The spec didn't say who sees the name, so the card keeps to the
    button's rule.
  - Project's server asks Video or Promo for the name and picture each time
    the card opens and keeps no copy. An app that is down or doesn't answer
    within 3 seconds leaves the card with the app's name and no picture.
- **Web page.** An empty Web page block asks for an address starting with
  `https://`. The card shows the page's title, its site icon and picture,
  and the address. Clicking opens the page in a new tab. A page that can't
  be read still gets a card with its site's name.
- **Links.** Labelled web addresses, one a line, each opening in a new tab
  (Tyler, 5 Nov 2026: "a links block"). An empty Links block shows "Words to
  show" and "Web address" with Add. A line with no words shows its address
  without "https://". Pointing at the block shows a cog that opens the same
  fields with a × on each line, and Done. Addresses start with `https://`; up
  to 30 lines, words up to 80 characters.
- **Removing a block:** each block has a bin that shows while it's pointed
  at, focused or selected (always on a phone). Selecting a block and
  pressing Backspace removes it too. The bin sits inside the block's
  top-right corner, level with its first line.
- **Filling a block in** (picking a task or file, adding a link) puts the
  cursor on the line under it, so the notes don't count it as clicking away.
- **Clicking away never takes a block back.** The notes are drawn again from
  what was saved only when someone else changed them. A late copy of one of
  your own earlier saves is ignored, and drawing the editor never saves
  anything by itself (Tyler, 5 Nov 2026: "80% of the time the block does not
  save. Clicking away and it just disapeared").
- **A block not filled in is never saved.** An empty Image, Video, Task
  card, File, Web page or Links stays only while the notes are open.

## How Project's server reads a web page

This is the one place Project's server visits an address someone typed, so
the refusals come first (`src/server/project/page-preview.ts`).

- Only `https://` on the usual port, with no name or password in the
  address. Names with no dot, `.local`, `.localhost` and `.internal` are
  refused, with or without a dot at the end (`localhost.`).
- Private, local and cloud addresses are refused, including every way of
  carrying an IPv4 address inside IPv6 (`::ffff:`, the old `::` form, 6to4
  and the translation ranges). The check runs as the connection is made, so a name can't point
  at a public address for the check and a private one for the visit.
- Redirects are followed by hand, at most three, each checked the same way.
- At most 256 KB is read, from an HTML page only, within 5 seconds.
- A card is kept in memory for 10 minutes. The note saves only the address.
- Each person can ask for 120 cards in 10 minutes, and only someone on a
  team or the site admin can ask at all. The same goes for Unsplash search,
  and the "it was used" call to Unsplash only goes to a photo's own download
  address.

## Locking

- **A task's notes** lock from the task's ⋮ menu with Lock the notes (Tyler,
  5 Nov 2026: "add lock page for task too"). Anyone who can change the task
  can lock or unlock them. While they're locked they read only for everyone:
  links open and folds fold for each reader, but nothing can be typed or
  ticked. The menu hides Delete the notes and offers Unlock the notes. The
  Versions tab still lists earlier versions, but bringing one back is refused
  while they're locked.
- **A project's page** locks from the project's ⋮ with Lock page, which only
  the site admin has (see "The project's page" in
  [projects-and-tasks.md](projects-and-tasks.md)).
- **The server holds the lock:** a save to locked notes or a locked page is
  refused with a message saying where to unlock it, so an editor left open
  in another tab can't write over it. Saved in `project_tasks.notes_locked`
  (`drizzle/0147`) and `project_projects.notes_locked` (`drizzle/0146`). A
  copied project keeps its page's lock; a copied or repeated task
  starts with its notes unlocked.

## Copying notes

- **Copy project** points each Task card at the copied task. Files stay
  behind, so File blocks and uploaded pictures go.
- **Duplicate and a repeating task's next copy** drop File blocks and
  uploaded pictures too, because the files stay on the old task. A page with
  no task, such as a project's, also drops the Video or Promo card and the
  Comments block (`noTask` in `src/lib/project/note-blocks.ts`).

## What a saved note may hold

- **Words:** what a shell written page may hold: paragraphs, headings, lists,
  quotes, bold, italic, strikethrough and links.
- **Blocks:** only the eleven above, each with only its own few values. An
  Image keeps its address (`https://` only) or its task file's id, its
  description and its Unsplash credit. A Video keeps its plain link, and the
  player's address is always built from it. A Task card keeps one task id,
  a File one file id, a Web page its address, and Links its lines' words and
  addresses. A Callout keeps its kind,
  a Checklist line its tick, and a Fold section its id. Anything else is
  dropped.
- **The same cleaning runs three times:** in the editor on every change, when
  the notes are read, and on the server before every save. On a task the
  server also drops any File block or picture whose file isn't on that task.
- **Notes written before blocks** read exactly as they did.
- **Search** reads the words inside a Callout, a Checklist and a Fold
  heading, never a block's addresses or ids.

## Where it lives

- `src/lib/project/note-blocks.ts`: what a note may hold, and the copy rules.
- `src/lib/project/notes.ts`: reading and saving notes, and the plain rules
  meeting notes keep.
- `src/lib/project/video-links.ts`: reading the four sites' links.
- `src/components/project/notes/`: the "/" list (`note-slash.ts`,
  `use-note-blocks.ts`, `note-blocks-menu.tsx`), the blocks
  (`note-block-nodes.ts`, `note-block-views.tsx`, `note-block-drawings.tsx`),
  the drawing for readers (`note-reader.tsx`), the folds (`note-folds.ts`),
  the Unsplash search (`unsplash-picker.tsx`), and the editor all four boxes
  share (`note-editor.tsx`).
- `src/server/project/note-blocks.ts`: Task cards, the file check on save,
  and the Video or Promo card's request.
- `src/server/project/page-preview.ts` and `src/server/project/unsplash.ts`.
- `src/lib/api/project/note-blocks.ts`: the server functions.
- Video and Promo each answer the card at `/api/connect/project/record-card`
  (their `workspace/docs/project-guests.md`).
