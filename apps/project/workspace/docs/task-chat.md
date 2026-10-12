# Task chat, following, notes and files

Everything said about a task, and everything attached to it, lives on the
task. A small team asks most of its questions about one task at a time, so a
task carries its own conversation instead of sending people somewhere else.
Tyler asked for the chat on 10 Oct 2026. His rules are in
[What this app is](what-this-app-is.md), which wins wherever this file
disagrees.

Each project also has a chat of its own, the Chat tab on the project page.
It works the same as a task's chat, except for who it tells (see
[Projects and tasks](projects-and-tasks.md#the-projects-chat)).

## The chat

- **A running conversation.** Messages read oldest at the top and newest at
  the bottom, each with the writer's photo, name and how long ago ("3 minutes
  ago"), with the exact date and time on hover. The box to write in sits
  under them.
- **Enter sends, Shift+Enter starts a new line.** A message goes once however
  fast Enter is pressed, and anything typed while it sends stays in the box.
- **Who sees it:** everyone who can open the task, which is the project's
  members plus the team's owner and admins. An archived project's chat can be
  read but not written in.
- **Messages from before tags existed** read exactly as they were written.
- **Typing indicators, read receipts, online status, custom reaction emoji
  and email copies of chat are left out.** Tyler left online status out of
  the app on 10 Oct 2026.

## Live updates

- **A message shows on everyone else's screen as it is sent**, within about
  a second, and so do edits, deletes, reactions and files. A status change
  moves the card on everyone's Board and List the same way.
- **Project's own stream.** Tyler chose this on 12 Oct 2026 over checking
  every 15 seconds. The shell's bell stream only says "you have a new
  notice", so it can't carry chat. A page showing a project, or one of its
  tasks, holds one connection to `/api/project/live/<project id>`.
- **Only ids travel.** The stream says "task T changed" or "the project's
  chat changed", never any words. The page then loads the task or the chat
  the normal way, which checks the person can still see it.
- **The database says what changed.** Triggers on tasks, messages,
  reactions, files, steps, labels and field values call `pg_notify` on the
  `project_live` channel, so no way of changing a task can forget to. The
  nudge waits for the change to be saved and is never sent for one that
  failed.
- **A hidden tab holds no connection.** It closes when the tab is hidden and
  opens again when the tab comes back, which also reloads what was missed.
- **A dropped connection catches up too.** The browser reconnects by itself
  after a server restart or a network blip, and each reconnect reloads what
  changed in the gap.
- **Someone taken off the project stops hearing about it.** The stream
  checks again every 5 minutes or so, and closes for anyone who can no
  longer see the project.
- **One listening connection per server process**, outside the database
  pool, the same way the bell does it.

## Reactions

- **Five fixed reactions** under any message: thumbs up, tick, eyes, heart
  and laugh. The smiley button offers them; a reaction already given shows
  as a small button with its count.
- **Hovering a reaction says who gave it**: "Ben and Leo Hart", or "Ben, Leo
  Hart and 2 more".
- **One of each per person per message.** Pressing one I gave takes it off.
- **A reaction tells nobody.** It is how to say "seen it" without a notice.
- **A deleted message drops its reactions**, and takes no new ones.

## Replying to a message

- **Reply on a message's menu** puts a quote of it above the box. The X, or
  Escape, stops replying.
- **The sent message shows the quote.** Clicking it scrolls to the message
  replied to and lights it up for a moment. In a project's chat, a quote of
  a message further back than the ones loaded says "Show earlier messages to
  find it."
- **A reply to a message deleted later** reads "Message deleted" in the quote.
- **The person replied to gets the same notice as any comment**, "Anna
  commented on a task", even if they wouldn't otherwise be told about the
  task. Never a second one: tagged as well, they get only "asked you about".
- **A reply must be to a message in the same chat**, and one that isn't
  deleted. Anything else is refused with "The message you're replying to
  isn't in this chat any more."

## Tagging someone with @

- **Typing @ lists the project's members**, narrowing as more of a name is
  typed. Arrow keys move through the list, Enter or Tab picks, Escape closes
  it. Typing "@Leo Hart" in full works too.
- **A tagged person gets "Anna asked you about a task"** in their bell, and
  clicking it opens the task in the middle panel of its project page.
- **Only people on the project can be tagged.** Tagging anyone else refuses
  the whole message with "You can only tag people who are on this project."
- **Tagging yourself sends nothing.**
- **Tagging someone away says so.** While a tagged person is on time off,
  "Leo is away until Dec 4." shows under the box before the message is sent,
  and goes when the tag is taken out. The message still sends. Only the dates
  show, never the reason for the time off.
- **The same box as the check-in's notes.** The @ list lives in
  `src/components/project/tag-textarea.tsx`, which the check-in's three notes
  use too.
- **One notice per person per message.** Someone tagged who would also have
  been told about the message (the assignee, a follower) gets only the "asked
  you about" notice.
- **How a tag is saved.** Inside the message as `@[Leo Hart](<user id>)`, and
  in `project_comment_mentions`. The message shows each tag as the person's
  current name. The rows are what an edit compares against.

## Editing and deleting a message

- **The writer can edit their own message.** It then says "edited". Its # links
  stay links.
- **Editing tells only people newly tagged.** Tyler chose this on 10 Oct 2026.
  Someone tagged before the edit is not told again.
- **The writer, the owner and admins can delete a message.** It stays in its
  place as "Message deleted", so the conversation around it still makes sense.
  Its words, tags and reactions are wiped, and it no longer counts on the
  task's card.
- **A message with files asks about them.** "Delete its 2 files too" is
  unticked to start with, so the files stay: under "Message deleted", and on
  the task's Files card. Ticked, they are deleted from storage first, so a
  failed removal deletes nothing. Files kept this way can be deleted later
  from the deleted message's menu.
- **Nobody else can do either.** The server refuses, and the menu doesn't
  offer it.

## Following a task

- **Anyone who can see a task can follow it** with the Follow button at the
  top of the task. It reads "Following" while on, and pressing it again stops.
- **A follower gets the chat, Stuck and Done notices** without being assigned.
- **Someone removed from the project stops being told**, because every notice
  first checks the person can still see the project. Their follow is kept, so
  being added back resumes it.

## Files in chat messages

- **The paperclip beside the box, or dropping files on the box**, adds files
  to the message. They show as names above the box, each with an X to leave
  it out, and go when Send is pressed. A message can be files alone.
- **Up to 5 files per message**, so one send stays one upload of at most
  50 MB. More in one go are left out with the reason.
- **In a task's chat, the files are the task's files.** They show in the
  message and on the Files card, and count toward the task's 10 files of
  10 MB each and the team's 5 GB. A message whose files don't fit is refused
  whole, and nothing is stored for it.
- **In a project's chat there is no count.** Each file is still at most
  10 MB, and counts toward the team's 5 GB (Tyler, 12 Oct 2026).
- **Pictures show small in the message** and open full size in a new tab.
  Anything else is its name and size, to download.
- **Downloads follow the existing rule:** only people who can see the task,
  or the project for a project chat's files, through
  `/api/project/task-files/<id>`.
- **The files go up first, then the message and the files are saved
  together.** A refused message takes its files back out of storage.

## Linking a task with #

- **Typing # in a chat message or in a task's notes lists tasks by title**,
  from every project the writer can see, newest change first. The list shows
  each task's project under its title. Arrow keys, Enter or Tab and Escape
  work as in the @ list.
- **The link shows the task's title and opens the task** on its project
  page. The title is read live, so a renamed task shows its new name.
- **A reader who can't see the linked task reads "a task you can't see"**,
  never its title, and it isn't a link. A task in a bin, or gone, reads
  "deleted task". Whether a task someone can't see is in a bin is not shown
  either.
- **The title never leaves the server for someone who can't see the task.**
  The link is saved with the title as written, and the server swaps it for
  each reader before sending (`src/server/project/task-links.ts`). The words
  a search reads from a task's notes leave linked titles out for the same
  reason.
- **The writer can only link tasks they can open right now.** Anything else
  is refused with "You can only link tasks you can see that aren't in a bin."
- **A bell notice names a linked task only when it is in the same project**,
  because everyone told can see that project. A link to another project's
  task reads "#a task" in the bell.
- **How a link is saved.** In a message, as `#[Fix the contact
  form](<task id>)`, beside the `@[Name](<user id>)` tags. In notes, as an
  ordinary link to the task's address, `/projects/<project>?task=<task>`.

## Notes

- **Notes are formatted text.** Select words in the editor for bold, italic,
  lists, a quote or a link. It is the template's shared editor
  (`DocumentEditor`). Typing # links a task (above). The # list rides on an
  optional `extensions` slot Tyler allowed adding to the shell's editor on
  12 Oct 2026.
- **Edits save when the editor is left and when Done is pressed.**
- **Links open in a new tab**, so the task stays where it is. A link to a
  task opens that task instead.
- **Notes written before 10 Oct 2026 are plain text** and show exactly as they
  were typed, line breaks and spaces included, until someone edits them.
- **What is saved** is the editor's document as JSON, cleaned on the server to
  the shapes a note may hold. It is drawn by turning each piece into a screen
  element, never as HTML, so nothing typed can run. A link to anything but a
  web, email or phone address loses its link and keeps its words.

## Earlier versions of the notes

- **An accidental delete of a task's brief isn't permanent.** "Earlier
  versions" beside the notes opens a window listing the notes as they were,
  newest first, each with who saved it, when, and its first words.
- **One version per editing session.** The notes save when the editor is
  left, and leaving it for the link box and coming back is the same session.
  Each session keeps one version however often it saves, never one per key.
- **The first edit also keeps the notes from before**, listed as "The notes
  before anyone edited them", with no person or time.
- **Bring back** makes that version the notes again, and saves it as a new
  version, so the notes it replaced are kept too and nothing is lost either
  way.
- **The last 20 earlier versions are kept.** Older ones are deleted as new
  ones come.
- **Who sees them:** everyone who can see the task. Bringing one back is for
  anyone who can change the task, and not in an archived project.
- **Where:** `project_task_note_versions`, one row per session, keyed by a
  session id the editor makes when it opens
  (`src/server/project/task-note-versions.ts`).

## Files

- **Files sent in the chat** are on the Files card too (above).
- **A task type's File fields hold files too** (see
  [Task types](task-types.md)). They count toward the same 10 and 5 GB, and
  the Files card leaves them out.
- **Drop files on the Files card or browse for them.** Pictures (PNG, JPEG,
  GIF, WebP) show small and open full size in a new tab. Anything else is a
  name to download.
- **The limits are Tyler's, 10 Oct 2026:** 10 files of 10 MB each per task,
  and 5 GB for the whole team. A file over 10 MB is refused with its size. An
  eleventh file, or one that would take the team past 5 GB, is refused with
  the reason. The server checks again under a lock, so two uploads at once
  can't both squeeze into the last space.
- **A full task says so before anything is picked.** At 10 files the card
  reads "This task has 10 files. Delete one to add another." and Browse is
  greyed out. A drop while files are still going up is ignored, and a finished
  upload says "2 files added."
- **Only people who can see the task can download its files.** Files are kept
  in the template's storage bucket under a random name that never leaves the
  server. People download through `/api/project/task-files/<id>`, which checks
  they can see the task first. Anyone else, and an id that doesn't exist, get
  the same "doesn't exist or you can't see it".
- **Downloads are always a download.** Only the four picture types are ever
  shown inside the page. Every other file, SVG included, is sent as a file to
  save, so nothing uploaded can run in the app.
- **Deleting a file** is for whoever added it, the owner and admins, and takes
  it out of storage as well.
- **The pictures are fetched, then drawn.** The local dev server sends every
  image request a browser makes to its own static files, which answer 404 for
  this address. Fetching the picture first works on both the dev server and
  the live one.

## Where it lives

- **Tables:** `drizzle/0097_project_task_chat_and_files.sql`:
  `edited_at` and `deleted_at` on `project_task_comments`,
  `project_comment_mentions`, `project_task_followers` and
  `project_task_files`. `drizzle/0109_project_chat_and_talking.sql`: the
  project chat's `project_id` and the reply's `reply_to_comment_id` on
  `project_task_comments` (a message has a task or a project, never both),
  `project_comment_reactions`, `comment_id` on `project_task_files`,
  `project_task_note_versions`, and the live-update triggers.
- **Rules:** `src/server/project/task-chat.ts` (both chats), `task-links.ts`,
  `task-note-versions.ts`, `task-followers.ts`, `task-files.ts` and `live.ts`.
  Tests in `src/server/project/task-chat.test.ts` and
  `chat-and-talking.test.ts`.
- **Tags, links and notes shared by the server and the screens:**
  `src/lib/project/mentions.ts` and `src/lib/project/notes.ts`.
- **Endpoints:** `src/lib/api/project/chat.ts`, `tasks.ts` and
  `task-files.ts`, the download address in
  `src/routes/api/project/task-files.$fileId.ts`, and the live stream in
  `src/routes/api/project/live.$projectId.ts`.
- **Screens:** `src/components/project/task-chat.tsx` (the chat both places
  use), `tag-textarea.tsx` (the @ and # lists), `task-notes.tsx` with
  `task-link-extension.ts`, and `task-files-card.tsx`. The browser's side of
  live updates is `src/lib/project/use-project-live.ts`.
