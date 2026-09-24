# Project pictures on the projects list

Each project on the projects list shows a small picture of its first clip, so
last week's work can be found by recognising it instead of by reading names
given in a hurry.

## Which frame it is

- **The first video or picture clip on the timeline.** That is the one that
  starts earliest. When two start at the same moment, the one on the higher
  lane wins, because it is drawn on top. `firstPictureSource` in
  `src/server/video/project-thumbnails.ts` holds the rule.
- **A video is taken at the moment it starts playing from.** A clip trimmed to
  start 4 seconds into its file shows the frame 4 seconds into the file, not
  the file's first frame.
- **The bare clip, nothing on top.** Words, stickers, colour changes and the
  frame fit are left out. Tyler chose this on 24 Sep 2026 over drawing the
  finished frame, because the finished frame would download the full original
  video every time the first clip changed.
- **Sound and words never count.** They have no picture of their own, however
  early they start.

## When it is made and remade

- **The background worker makes it, never a save.** Saving happens every few
  seconds while somebody edits, and a picture costs an ffmpeg pass, so saving
  is left exactly as fast as it was. The step rides the media worker's
  15-second tick (`videoMediaTick` in `src/server/video/media-workers.ts`).
- **Each tick looks again at every project saved since the last look.** It
  works out the first clip, and queues a new picture only when a different
  file or a different starting moment is now first. Trimming the end of the
  first clip, moving a later clip or renaming the project changes nothing.
- **The old picture stays up until the new one is ready.** The list never
  blanks while a new picture is being made.
- **How long it takes:** the picture shows up within one or two ticks of the
  save, so 15 to 30 seconds. A new project, or a copy made with Duplicate,
  gets its picture the same way.
- **What it reads:** a video's 720p playback copy when that is ready, and the
  upload otherwise. A picture clip's own file. Only the project owner's own
  file is ever read.
- **What it keeps:** a JPEG at most 320 pixels across or tall, in storage under
  `video/project-thumbnails/`. It never goes into the media library. Each new
  picture gets a new file name, and the old file is deleted once the new one
  is in.
- **How the list loads it:** straight from the storage bucket's public
  address, the same way every clip and library file loads. The file name holds
  the owner, the project and a random part, so nobody can guess it. Going
  through an app route instead failed in local development: the dev server
  never hands a request made by an `<img>` to the app, so every picture came
  back 404 (seen on 24 Sep 2026).

## When there is no picture

- **The list shows the film icon in the same 64 by 40 box.** The picture fills
  that box when it arrives, so nothing on the row moves.
- **A project with only sound, only words, or nothing at all** is marked
  `none` in `video_project_thumbnails` and is never tried. It stays at zero
  tries however many ticks go by. Adding a video or picture clip later queues
  one.
- **Taking the last video or picture clip out** marks the project `none` and
  deletes the old picture, so the icon comes back.
- **The first clip's file was deleted from the library:** the worker gives up
  after one try, because trying again reads the same missing file. The row is
  marked `error`, and the list shows the icon.
- **Anything else going wrong:** three tries in all, then `error`. The real
  reason goes to the server log. A project stuck at `error` is tried again only
  when its first clip changes.

## While the list is open

The list asks the server again every 5 seconds while any project on it is
waiting for a picture, and stops once none is. That is how a picture appears
while you watch, without a reload.

## Deleting a project

The picture's file is removed from storage before the project row goes. If the
file will not come out, the project is kept and the list says so, the same rule
as export files, so no file is ever left with nothing pointing at it.

## Where it lives in the code

- `drizzle/0087_video_project_thumbnails.sql` adds the queue table and removes
  the old `thumbnail_media_id` column from projects. That column was meant to
  point at a media library picture, and nothing ever set it.
- `src/server/video/project-thumbnails.ts` finds the first clip, queues and
  makes the picture.
