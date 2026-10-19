# Project history

A project keeps up to twenty earlier versions of its timeline, which you can
look at and bring back from the History panel at the foot of the editor's
rail. Undo still holds the last fifty steps, but only in the open tab, and it
is gone on reload. History is what survives.

## What is kept, and when

A version is always the timeline **as it was just before a save replaced
it**. Saving is the only moment anything is lost, so it is the only moment
anything needs keeping. The rule is `versionDue` and `keepVersionBeforeSave`
in `src/server/video/project-versions.ts`, called from `writeProjectTimeline`
in `src/server/video/projects.ts`.

- **After a break.** When a save arrives and the timeline was last saved 30
  minutes ago or more, the old timeline is kept first. This is the version you
  came back to, such as yesterday's cut. It is kept at your first change
  rather than the moment the project opens, because opening changes nothing.
  If you only look, the project still holds that cut, so nothing is lost.
- **Every hour of editing.** When the newest version is an hour old or more,
  the next save keeps the timeline it replaces. A brand-new project counts its
  hour from when it was made.
- **Before restoring.** Restoring always keeps what you had first, so a
  restore can be undone (see below).
- **Never an empty one.** A timeline with no clips is never kept by the first
  two rules. There is nothing in it worth getting back.
- **Twenty per project.** After a version is kept, anything past the newest
  twenty is deleted. Deleting the project deletes its versions.
- **Never twice.** A timeline already in History is not kept again, whatever
  the reason. Two timelines count as the same when their clips and shape
  match. Media addresses are left out of the comparison, because the editor
  fills them in when it opens a project and every read looks them up again.
  Before this rule, restoring back and forth between two cuts added a
  "Before restoring" copy on every press (Tyler, 19 Oct 2026).
- **A save right after a restore keeps nothing.** A version kept after the
  project's last save, such as "Before restoring", already holds what that
  save replaces, so the save does not even look.

How a save does this:

- **One locked read.** The save reads the project row with a lock, and the
  time of its newest version in the same query. A save that keeps nothing
  costs one extra trip to the database, and two saves can never both decide
  a version is due.
- **A failed keep never stops the save.** Keeping a version runs in a
  savepoint of its own. If it fails, the failure goes to the server log and
  the save still lands. A missing version costs less than work that never
  saved. Restore is the exception (below).

A version stores the timeline, the shape, how many clips it had, how long it
ran, who saved it, when that timeline was saved and why it was kept
(`video_project_versions`, migration `0118`).

The 30 minutes is a choice made while building this, not a number Tyler gave.
It is `BREAK_MS` in `src/lib/video/project-versions.ts`.

## What two hours of editing leaves

Open a project last touched yesterday and edit from 9:00 to 11:00 without
stopping. Three versions are kept:

1. **9:00**, at the first change: yesterday's cut, as you left it.
2. **10:00**: the timeline as it stood a moment before.
3. **11:00**: the same again.

The 11:00 to 11:30 work stays in the project itself. It becomes a version at
the first change after the next break.

## Looking at one

Clicking a version in the History panel opens it in a window with its own
player. The window has its own copy of the timeline and its own playhead, so
playing it, scrubbing it and closing it change nothing in the project. Only
the Restore button does.

Under the picture is the version's timeline, drawn by the editor's own
timeline (`StudioTimeline` with `readOnly`), so it looks the way the project
did: frames on video clips, sound shapes, names, lengths and lane icons.
Tyler asked for this on 19 Oct 2026, after a plain coloured bar "tells me
nothing about the clip".

- **What is left out:** the toolbar, and each lane's grip, mute and delete
  buttons, because none of them could change anything here. A muted lane
  still shows its muted icon.
- **What still works:** scrolling, and clicking the ruler to move the
  playhead. It opens fitted to the window, at the closest zoom the editor
  allows, so a long project needs a scroll sideways, the same as in the
  editor.
- **Keys stay in the window:** Space, Delete, Escape and copy and paste do
  nothing to the editor behind an open window (`studio-editor.tsx`). Space
  on the window's Play button plays the version. Before this, a Delete
  pressed in the window removed the clip selected in the project behind it,
  found by the audit on 19 Oct 2026.
- **Your real timeline's place is kept:** the preview neither reads nor
  writes the remembered zoom and scroll (`remembered-view.md`), so the
  project reopens where you left it.

## Restoring, and undoing a restore

Restore does three things in order:

1. Sends any edit still waiting to save, so the server holds what is on
   screen.
2. Keeps that timeline as a version marked "Before restoring", unless
   History already holds it. If that fails, nothing is restored and the error says so, because a restore you
   cannot take back is the thing this rule exists to prevent.
3. Puts the chosen version on the timeline as one edit. The timeline's Undo
   button takes it back while the tab is open, and the next autosave stores it.

To undo a restore after a reload, open History and restore the "Before
restoring" version at the top. You can go back and forth between the two as
often as you like. The list stays at two rows, because each cut is already
in it.

- **The shape comes back too.** A version restores its shape as well as its
  clips. Undo takes back the clips but not the shape, the same as changing
  the shape by hand. The "Before restoring" version has both.
- **A read-only window cannot restore.** It says so and offers a reload, the
  same as any other change in that window (`two-windows.md`).
- **A deleted file stays deleted.** A restored clip whose file has since gone
  from the media library shows a broken picture, the same as a clip in the
  project today would.
- **Restoring the oldest of twenty.** Keeping "Before restoring" pushes the
  oldest version out. If that was the one restored, it leaves the list, but
  its timeline is now the project's.

## Storage

Measured on 19 Oct 2026 on the local database with `pg_column_size`, which
is the size on disk after Postgres's own compression.

- **The 20 local projects:** 296 bytes to 1,548 bytes each, 839 bytes on
  average. The largest has 8 clips and is 3.1 KB as plain text.
- **Twenty versions of that largest one:** 20 x 1,548 bytes = about 31 KB.
- **A heavy project, made up for the test:** 200 clips, such as a three
  minute video with word-by-word captions, built by repeating the largest
  project's clips. It is 75 KB as text and 10 KB on disk. Repeated clips
  squeeze down unusually well, so a real 200-clip project lands somewhere
  between 10 KB and 75 KB.
- **Twenty versions of the heavy one:** 200 KB to 1.5 MB.
- **A thousand projects like the local ones:** 1,000 x 31 KB = about 31 MB.

The History list never reads a timeline. It reads the shape, clip count and
length stored beside it, so a long list costs the same as a short one.

## Where it shows

- **The History panel** is the last button at the foot of the editor's rail,
  under Copy and Exports. Each row is the time that timeline was saved, then
  why it was kept, its clips, its length and its shape.
- **Not on a phone.** At phone width the editor shows only the picture and has
  no rail, so History, like every other panel, is not reachable there.
- **The list is read when the panel opens** and again after a restore. A
  version kept while the panel stays open shows the next time it is opened.
