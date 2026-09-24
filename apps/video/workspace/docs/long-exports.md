# Long exports

A project can be up to thirty minutes long and still export. Anything longer
is refused when Export is pressed, with "This project is longer than 30
minutes, which is as much as one export can take". The ceiling is
`MAX_TIMELINE_MS` in `src/lib/video/render.ts`, and the server checks it twice:
when the export is asked for, and again when the render starts, because the
project can change in between.

Until 24 Sep 2026 the ceiling was ten minutes.

## Why thirty and not longer

- **The finished file is read into memory whole.** The render writes the MP4
  to a scratch folder, then reads all of it into the server's memory and hands
  it to storage in one piece (`uploadToR2` in the shell's
  `src/server/media/storage.ts`, which only takes bytes held in memory).
- **Node refuses to read a file over 2 GB that way.** A longer export would
  render to the end and then fail with "The export could not be made".
- **Thirty minutes stays well under it.** The biggest file measured, a wide
  export at Best, runs at about 40 MB a minute, so thirty minutes is about
  1.2 GB. Busier footage than the test clip makes a bigger file, and 1.2 GB
  leaves room for that.
- **Memory rises with the file.** The thirty-minute wide Best export pushed
  the process making it to 2.5 GB, about twice the file. Whichever process
  renders (the website or `npm run worker`) needs that much room to spare.
- **Going past thirty needs a shell change.** Storage would have to take the
  file straight from disk in parts, so nothing large sits in memory. That is
  the same work as bigger uploads
  (`workspace/tasks/features/31-bigger-uploads-shell.md`) and belongs in
  Custom Shell.

## What moved with the ceiling

- **The time ffmpeg is allowed.** Each ffmpeg run of an export may now take as
  long as the finished file plays, and never less than ten minutes
  (`exportTimeoutMs` in `src/server/video/render.ts`). A thirty-minute export
  gets thirty minutes for each pass. Before, every run had a flat ten minutes,
  which a long export would have hit halfway and failed.
- **Why the export's own length is enough.** The heaviest export measured, ten
  minutes of captions with every word lit and the Pop entrance, took 217
  seconds of its 600 (see [word-by-word-captions.md](word-by-word-captions.md)).
  That is about a third of the allowance, so a slower server still has room.
  A run that is truly stuck is still stopped.
- **Other ffmpeg jobs keep ten minutes.** Transcribing and jump cuts look at
  ten minutes of sound at most, and a new voiceover is only read for its
  length, which takes a moment.

## What did not need to move

- **The lease.** A render holds its row for sixty seconds at a time and renews
  it every twenty (`LEASE_SECONDS` and `HEARTBEAT_MS` in
  `src/server/video/render-queue.ts`). The renewal runs on a timer beside the
  render, so it keeps going however long the render takes.
- **Measured, it never came close.** In every export timed below, including
  three at thirty minutes made by a separate worker process while the
  website's own worker was also running, the lease never had less than 40
  seconds left. Every export finished on its first attempt.
- **Why it could fail anyway.** Only if the server's own code stopped running
  for over forty seconds at a stretch. The one part of a render that runs in
  the server's code rather than in ffmpeg is drawing caption pictures, and it
  pauses after every picture to write it to disk, so the renewal gets its turn.
- **One export at a time.** Exports still run one after another on each server
  (`VIDEO_RENDER_CONCURRENCY`, default 1). A thirty-minute wide export at
  Best held that one slot for nine to eleven minutes on this Mac, and
  everything else waits behind it. Stop and Try again
  ([stopping-an-export.md](stopping-an-export.md),
  [retrying-an-export.md](retrying-an-export.md)) are what make that
  bearable.

## Measured

Timed on 24 Sep 2026 on this Mac (an M1 Pro with 8 cores), through the real
queue: clips downloaded from storage, rendered, the sound evened out, and the
file uploaded back. The project was one four-minute 1080p test clip laid end
to end, with its own sound and the brand kit's end card. In the tall, square
and 4:3 shapes the clip was set to fill the frame, the way footage shot in
that shape would. Other work was running on the Mac the whole time, with a
load between about 6 and 48 on 8 cores, and that moves the numbers.

**Ten minutes of project, sound evened out, seconds from start to finished:**

| Quality | Wide 16:9 | Tall 9:16 | Square 1:1 | Classic 4:3 |
| --- | ---: | ---: | ---: | ---: |
| Best | 131, 120 | 125 | 102 | 116 |
| Good | 80 | 90 | 71 | 77 |
| Small | 90, 70 | 65 | 63 | 62 |

- **Where the time goes in the wide Best export:** 66 seconds drawing the
  video, 32 seconds for the two sound passes, and 21 seconds reading the
  405 MB file and uploading it.
- **Evening out the sound costs about 32 seconds per ten minutes** in every
  shape and quality. It is two more passes over the whole file.
- **The biggest file is wide at Best:** 405 MB for ten minutes and 1,215 MB
  for thirty.
- **Wide at Small ran twice** because the first run, at 90 seconds, was
  slower than Good. The second took 70.

**Thirty minutes, rendered by a separate worker process:**

| Export | Estimate | Real | Lease never below | File |
| --- | ---: | ---: | ---: | ---: |
| Wide, Best, sound evened | 378 s | 522 s, then 683 s | 40 s | 1,215 MB |
| Tall, Good, sound evened | 270 s | 317 s | 40 s | 324 MB |
| Square, Small, sound left | 93 s | 95 s | 40 s | 65 MB |

- **Drawing the video grew in step with the length:** 66 seconds for ten
  minutes, then 230 and 245 seconds for thirty.
- **The two sound passes did not.** On the 1,215 MB file they took 223
  seconds, then 369 seconds on a second run while the Mac's load reached 39.
  They read and rewrite the whole file, so a big file on a busy disk is slow.
- **So the estimate runs short for long Best exports:** by a third on the
  quieter run and more on the busy one. It was close for Good and Small.
- **None of this was timed where exports are made.** Exports render on the
  Hetzner server, not on a Mac. That server has its own cores, disk and
  memory, and it uploads from a data centre. Every time above has to be taken
  again there. The file sizes and the memory per file do not depend on the
  machine, so the thirty-minute ceiling still holds.

## The estimate in the export window

Below the quality choices, the window says how long the export will take,
for example "Making it takes about 6 minutes." or "Making all 3 takes about
18 minutes, one after another." It changes as the shapes, the quality and the
sound switch change.

- **The numbers are stand-ins until the Hetzner server is timed.** They are
  the ten-minute Mac table above, turned into seconds per minute of project
  with the sound passes taken out (`EXPORT_SECONDS_PER_MINUTE` in
  `src/lib/video/render.ts`). Where one combination ran twice, the two runs
  are averaged.
- **The sound passes are added on** at 3.2 seconds a minute when the switch
  is on.
- **Each ticked shape is added,** because exports run one after another.
- **It is left out under a minute,** which covers most short projects.
- **It does not count exports waiting ahead.** Once the export is queued, the
  window already says how many are ahead of it.
- **It is left out at 60 frames a second.** Every render above was made at
  30, and 60 has not been timed yet ([frame-rate.md](frame-rate.md)).
- **It assumes a picture that moves the whole time.** Stills are quicker.
  Captions add about 2 to 4 seconds a minute
  ([word-by-word-captions.md](word-by-word-captions.md)).

## Other ten-minute limits that are still there

These belong to single tools, not to exports, and a thirty-minute project does
not lift them.

- **Captions** transcribe at most ten minutes of one clip's sound
  (`CAPTIONS_MAX_SOURCE_MS` in `src/lib/video/captions.ts`).
- **Jump cuts** look at most ten minutes of one clip
  (`JUMP_CUT_MAX_WINDOW_MS` in `src/lib/video/jump-cuts.ts`).
- **Uploads** stop at 100 MB a video, which is set by the shell. A long talk
  has to come in as several clips.
