# Stopping an export

The export window has a **Stop it** button for as long as an export is waiting
or being made. Pressing it ends the export within about a second, and nothing
is kept.

## What happens when you press it

- **The row changes first.** The export's row in `video_render_jobs` moves to
  `cancelled` and lets go of its lease in the same write. The window says "You
  stopped this export, so no file was made." in grey, never red, and the editor
  shows no error.
- **A waiting export never starts.** No worker will pick up a row that says
  `cancelled`, so nothing else has to happen.
- **A running export is stopped by the worker making it.** The web request
  never touches a process. The worker checks its own row once a second
  (`STOP_CHECK_MS` in `src/server/video/render-queue.ts`). When the row stops
  being its own, it kills its ffmpeg outright. That works the same whether the
  render is in the website's process or the separate `npm run worker` program.
- **A stop during a download does not wait for it.** Before ffmpeg starts, the
  render pulls each source video out of storage. A stop abandons the file
  being pulled instead of letting a large video finish coming down.
- **The next export starts straight away.** Once ffmpeg has gone, the worker's
  slot is free and it takes the next waiting export on the spot, without
  waiting for the fifteen second pass. In the test on 24 Sep 2026, ffmpeg was
  gone 396 ms after the click and the next export started 147 ms after the
  stop was saved.

## What it leaves behind

Nothing.

- **The scratch folder goes.** The render deletes its temporary folder once
  ffmpeg has exited, and not before. The order matters, because a process still
  writing into a folder that is being deleted puts files back.
- **No file reaches storage.** The worker checks for a stop before each upload.
  If the stop lands while an upload is already under way, the file that arrives
  is deleted straight after.
- **No lease is left to run out.** The stop clears the lease itself, so the
  row never sits waiting for the sixty second expiry.

## The same check catches two other cases

A render also stops early when its project is deleted, or when another worker
has taken the job back after this one's lease ran out. Before, those renders ran
to the end and then threw their file away.

## Edge cases

- **Stopping just as it finishes.** If the export finished a moment before the
  stop arrived, the stop is refused with "There is no export to stop", and the
  window shows the finished export on its next check two seconds later.
- **A worker that has died.** The stop still works, because it is a write to
  the row. There is no process left to kill.
- **A database blip.** One failed check is not taken as a stop. The render
  carries on and checks again a second later.
