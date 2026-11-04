# Big files

Video takes a video of any size up to Cloudflare's own 5TB, edits it, and
exports a project of any length. Tyler, 31 Oct 2026: "Don't have upload limit.
File can be as big as 100gig or more", for Video only. Every other app keeps
5GB. The task is `workspace/tasks/big-files/01-big-file-features.md`.

The upload itself (pieces, picking up after a closed tab, Pause, the upload
line in the corner, storage used and its cost) is the shell's and is written
up once, in the repo's `docs/shell/big-uploads.md`. This file is what Video
does with a big file once it has it.

## How Video lifts the ceiling

- **One line in `src/app/options.ts`:** `media: { videoMaxBytes: "bucket" }`.
  The shell reads it on both sides, in the browser before anything is sent and
  on the server at every step.
- **Pieces grow with the file.** A 100GB file goes in 9,310 pieces of 11MB, a
  500GB file in 9,847 pieces of 52MB, always 10,000 or fewer.

## Copies kept on the server's disk

A file downloaded once stays on the server's disk, and every later job reads
it from there (`src/server/video/file-cache.ts`).

- **What fills it:** the original, when its smooth copy is made, and the smooth
  copy itself, moved straight in once it is stored. Captions and Tighten add
  the smooth copy when they first read its sound.
- **How big:** `VIDEO_FILE_CACHE_GB` when set. Unset, a quarter of the disk
  it is on and never more than 100GB, so on a small disk the copies cannot
  crowd out the database. When a new file would pass it, the files used
  longest ago go first. A file a job is reading is never deleted under it.
- **Where:** `VIDEO_FILE_CACHE_DIR`, or a folder in the system's temporary
  folder.
- **A file bigger than the whole cap** is downloaded for its one job and
  deleted after, as every download was before.
- **Deleted files go too.** Every ten minutes the media worker deletes the kept
  copy of any file no longer in the library. The library's delete is the
  shell's, so this sweep is how a deleted file leaves this disk.
- **One folder per container.** The website and the worker each keep their
  own.

## Waiting for room on the disk

Before a job downloads a file, or an export writes one, it checks the disk has
that much free plus 2GB (`src/server/video/disk-space.ts`). On 24 Oct 2026 a
full disk crashed the German server and took Trade's database with it.

- **The job waits instead of failing.** It goes back in its queue without
  using up a try, and that queue claims nothing for a minute.
- **It says so in words**: "Waiting for room on the server's disk: this needs
  22 GB free and 8 GB is. It tries again in a minute." The Media panel shows
  "Waiting for room on the server's disk" under the file, and the Export
  window shows the whole sentence under the export.
- **An export's room** is worked out from its length: 60MB a minute at Best,
  30 at Good, 15 at Small, twice that when the sound is evened out. The
  biggest file measured was 40MB a minute.
- **Disk size is never a reason to refuse a file.** Tyler, 31 Oct 2026: "we'll
  solve the hdd issue with getting hetzner dedicated server".

## The smooth copy of a big video

- **Time to match the video.** A smooth copy may take twice the video's own
  length, and never less than 30 minutes (`proxyTimeoutMs`). An hour of 4K is
  no longer cut off at 30 minutes.
- **Sent to storage from disk**, in pieces, so a smooth copy over 2GB no longer
  fails at the last step.
- **A notice when it is ready**, in the bell, wherever in the app you are:
  "beach.mov is ready to edit", or "could not be got ready to edit" after its
  last try. Every video gets one, small ones included.
- **Everything else waits for it on a file over 1GB.** The frames, the sound
  shape, the cleaned sound and the beats are made from the smooth copy, so the
  20GB original is downloaded once and never again for them. If the smooth
  copy fails, they say "This video is too big to read without its smooth
  copy" rather than download the original. A smaller file keeps today's order.

## Frames along a long video

- **A frame every 5 seconds** on anything longer than four minutes, however
  long. Up to four minutes it is every 2 seconds, as before. An hour has 720.
- **Spread over pictures of up to 120 frames**, 10 across and 12 down, called
  sheets (`src/lib/video/filmstrip-sheets.ts`). An hour is six sheets. The
  frames route serves one per `?sheet=` and says how many there are.
- **The timeline shows as many as fit**, one every 48 pixels of the clip, so
  zoomed in on an hour-long clip every frame shows.
- **Strips made before this keep their one picture** of up to 120 frames, so
  a long video uploaded before 3 Nov 2026 still shows a frame every 30
  seconds or so. Nothing makes them again: Try again in the Media panel only
  appears on a strip that failed.

## Exports and saved frames read only what they use

An export, a saved frame, a project's picture and an export's cover read each
video straight from its storage address, and ffmpeg asks for only the bytes it
needs (`src/server/video/render-sources.ts`).

- **A 10-second clip of a 20GB recording fetches about those 10 seconds**, plus
  the file's index. Nothing is downloaded whole.
- **A copy already on the server's disk wins**, so a video whose smooth copy
  was made on this server reads nothing over the network.
- **A dropped connection is picked up again.** ffmpeg reconnects for up to 30
  seconds and asks again from where it was. If a file still cannot be read,
  the export fails and is tried again, rather than going out with that clip's
  sound missing.
- **A Small export reads the smooth copies** where they are made: 720p is more
  than the 480p a Small export is drawn at. Best and Good read the originals.
- **Pictures and sound are fetched whole**, as before: they are small.
- **The storage address serves these files.** The bucket's public address
  covers every key, `video/` ones included, though the app shows exports and
  frames through its own routes. Checked 3 Nov 2026 on the local bucket: a
  ranged request for the first 1,024 bytes of a real export and a real smooth
  copy each came back 206 with exactly 1,024 bytes.
- **Measured, 3 Nov 2026, from a local server that answers like the bucket:**
  exporting 5 seconds of a 60-second, 30.8MB file fetched 6.7MB. Saving one
  frame fetched 1.8MB, and 4.8MB when the Mac was busy, because the server
  sends some way ahead of what ffmpeg reads. The extra few megabytes beyond
  the clip stay the same however big the file is
  (`render-sources.test.ts`).

## Exporting part of a project

- **The Export window has a Start and an End**, the whole project unless
  changed. They take "45", "10:00" or "1:05:00".
- **Exporting 10:00 to 12:00 gives a two-minute file** starting at 10:00.
- **The part is cut out of the timeline before the render sees it**, the way
  the editor's split cuts a clip: a clip under the start loses its fade in and
  any blend in, a clip under the end loses its fade out, and a caption's lit
  words keep their moments (`src/lib/video/export-stretch.ts`). The file's AI
  parts and scene lines describe the part.
- **Kept on the export** (`range_start_ms` and `range_end_ms`,
  `drizzle/0147_video_export_part.sql`). The Export window shows "9:16 · 10:00
  to 12:00" beside one made of a part.
- **Refused in words** when the end is before the start, past the project's
  end, or less than a second after the start.

## Captions and Tighten on big and long recordings

- **No size limit.** The 100MB refusal is gone. The sound is read from the
  smooth copy once it is made (`src/server/video/sound-source.ts`).
- **Before the smooth copy is made**, a stretch of a clip (Tighten's quiet
  parts, Hook's opening) is read straight from storage. Writing down the
  whole of a video over 1GB waits instead, saying "This video is too big to
  write down until its smooth copy is made." Streaming 20GB just to keep its
  sound would outlast the ten minutes one listen is allowed. A smaller video
  is streamed through.
- **No length limit.** The 30-minute refusal is gone. An hour goes in six
  pieces of ten minutes, four sent at a time, and comes back as one row on the
  meter. The price shows before you press, as before
  ([price-before-you-press.md](price-before-you-press.md)).

## A whole hour on the timeline

- **Fully zoomed out, an hour is 72 pixels**, so a project of up to about 16
  hours fits a 1,200-pixel timeline. Fit the whole project uses it.
- **The slider and the zoom buttons move by a share of the zoom**, a quarter
  each press, so a press means as much fully out as fully in.
- **The ruler spaces its labels at least 54 pixels apart** and writes long
  times as a clock: an hour on 1,200 pixels is labelled every five minutes,
  "5:00", "10:00".

## Finding what was said

- **The Transcript panel has a search box** once a clip's words are shown.
  Typing lists every place it was said, with the time and a few words either
  side. Clicking one moves the playhead there.
- **Capitals and punctuation are ignored**, so "pricing" finds "Pricing,". The
  last word may be half typed. Several words are found only where they were
  said one after another.
- **Words already cut from the film are never found.** The words themselves
  are marked in the list too.

## Not built yet

- **The smooth copy on every core at once** (part 13). Not started: nothing
  could be timed without real 4K footage, and joining slices risks the sound
  drifting against the picture.
- **A rough 360p copy first** (part 14). Not started.
- **HDR phone footage** (part 18). Not started. Converting HDR properly needs
  ffmpeg's `zscale` filter, which the Mac's ffmpeg does not have, so nothing
  could be tried. Which phones Tyler films on is still open.
- **Split at scene changes** (part 27), **import from a Drive or Dropbox link**
  (part 28) and **trim an original to the parts used** (part 29). Not started.
  Whether Drive and Dropbox need app keys of Tyler's own is still open.
