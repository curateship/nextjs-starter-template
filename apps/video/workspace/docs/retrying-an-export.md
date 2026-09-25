# Trying a failed export again

An export that ended in an error has a Try again button on the Exports page,
beside Delete. One press puts the same export back in the queue.

## Where it is

- **The Exports page lists failed exports.** Each one shows "Failed ·" and the
  reason under its name, in red, so the reason is readable without opening
  anything. A failed row has no Download or Settings button, because there is no
  file.
- **The page watches what it started.** Exports that are waiting or being made
  are listed too, with "Waiting to start…" or "Making it now…". While any of
  them is on the list, the page asks again every three seconds, so a retried
  export can be watched until it lands.
- **Stopped exports are not listed.** Stopping one was a choice, not a failure.

## When a retry is allowed

- **Only a failed export.** An export that is ready, waiting or rendering is
  refused with "Only an export that failed can be tried again".
- **Not while the same shape is on its way.** If the same project already has an
  export waiting or rendering in the same shape, the retry is refused with "A
  9:16 export of this project is already being made. Wait for it to finish, or
  stop it first." A different shape of the same project does not block it. The
  rule is explained in [export-shapes.md](export-shapes.md).
- **Not when the project cannot be exported.** An empty project, or one longer
  than thirty minutes, is refused with the same message Export would give.
- **Not past the person's own limit** of twenty exports waiting or rendering.

## What a retry resets

`retryRenderJob` in `src/server/video/render-queue.ts` changes the same row. It
does not make a new one.

- **The error goes.** The status goes back to waiting, and the reason and the
  finish time are cleared.
- **The attempt count starts again from nothing.** An export gets two tries at
  surviving a server restart mid-render. A retry gives it two more.
- **It joins the back of the queue.** Its asked-for time becomes the moment of
  the retry, so it does not jump ahead of exports asked for since.
- **What stays the same.** The shape, the quality, the sound setting and the
  name are kept exactly as they were first asked for.
- **What it renders.** The project as it is now, like every export. A fix to the
  project made after the failure is in the retried file.
