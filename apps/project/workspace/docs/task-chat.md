# Task chat, following, notes and files

Everything said about a task, and everything attached to it, lives on the
task. A small team asks most of its questions about one task at a time, so a
task carries its own conversation instead of sending people somewhere else.
Tyler asked for the chat on 10 Oct 2026. His rules are in
[What this app is](what-this-app-is.md), which wins wherever this file
disagrees.

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
- **No live updates yet.** A new message from someone else shows the next time
  the task loads. Typing indicators, reactions and read receipts are left out.

## Tagging someone with @

- **Typing @ lists the project's members**, narrowing as more of a name is
  typed. Arrow keys move through the list, Enter or Tab picks, Escape closes
  it. Typing "@Leo Hart" in full works too.
- **A tagged person gets "Anna asked you about a task"** in their bell, and
  clicking it opens the task in the middle panel of its project page.
- **Only people on the project can be tagged.** Tagging anyone else refuses
  the whole message with "You can only tag people who are on this project."
- **Tagging yourself sends nothing.**
- **One notice per person per message.** Someone tagged who would also have
  been told about the message (the assignee, a follower) gets only the "asked
  you about" notice.
- **How a tag is saved.** Inside the message as `@[Leo Hart](<user id>)`, and
  in `project_comment_mentions`. The message shows each tag as the person's
  current name. The rows are what an edit compares against.

## Editing and deleting a message

- **The writer can edit their own message.** It then says "edited".
- **Editing tells only people newly tagged.** Tyler chose this on 10 Oct 2026.
  Someone tagged before the edit is not told again.
- **The writer, the owner and admins can delete a message.** It stays in its
  place as "Message deleted", so the conversation around it still makes sense.
  Its words and tags are wiped, and it no longer counts on the task's card.
- **Nobody else can do either.** The server refuses, and the menu doesn't
  offer it.

## Following a task

- **Anyone who can see a task can follow it** with the Follow button at the
  top of the task. It reads "Following" while on, and pressing it again stops.
- **A follower gets the chat, Stuck and Done notices** without being assigned.
- **Someone removed from the project stops being told**, because every notice
  first checks the person can still see the project. Their follow is kept, so
  being added back resumes it.

## Notes

- **Notes are formatted text.** Select words in the editor for bold, italic,
  lists, a quote or a link. It is the template's shared editor
  (`DocumentEditor`).
- **Edits save when the editor is left and when Done is pressed.**
- **Links open in a new tab**, so the task stays where it is.
- **Notes written before 10 Oct 2026 are plain text** and show exactly as they
  were typed, line breaks and spaces included, until someone edits them.
- **What is saved** is the editor's document as JSON, cleaned on the server to
  the shapes a note may hold. It is drawn by turning each piece into a screen
  element, never as HTML, so nothing typed can run. A link to anything but a
  web, email or phone address loses its link and keeps its words.

## Files

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
  `project_task_files`.
- **Rules:** `src/server/project/task-chat.ts`, `task-followers.ts` and
  `task-files.ts`. Tests in `src/server/project/task-chat.test.ts`.
- **Tags and notes shared by the server and the screens:**
  `src/lib/project/mentions.ts` and `src/lib/project/notes.ts`.
- **Endpoints:** `src/lib/api/project/tasks.ts` and `task-files.ts`, and the
  download address in `src/routes/api/project/task-files.$fileId.ts`.
- **Screens:** `src/components/project/task-chat.tsx`, `task-notes.tsx` and
  `task-files-card.tsx`.
