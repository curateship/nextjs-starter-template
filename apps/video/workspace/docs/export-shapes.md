# Exporting in several shapes

One press of Export can make the same project as a tall reel, a square post, a
wide video and a 4:3 video, one file for each shape ticked. Shape belongs to the
export now, not only to the project.

## What the export window does

- **Which shapes.** The window lists all four shapes a project can be, each
  with its own tick box. The project's own shape is ticked every time the window
  opens, and is marked "this project".
- **Nothing ticked.** Pressing Export with every box empty is refused with "Tick
  at least one shape to export", the boxes are marked, and nothing is queued.
- **One press, several files.** The button reads "Export 3 shapes" when three
  are ticked. Each shape becomes its own row in `video_render_jobs` with the same
  name, quality and sound setting. They wait in the queue like any other export.
- **Watching them.** The window lists the newest export in each shape the
  project has ever been exported in, with its progress and its own download
  button. That list comes from `getLatestRenderJobs` in
  `src/server/video/render-queue.ts`.
- **Stopping.** "Stop it" becomes "Stop all 3" when several are on their way,
  and stops every shape of the project at once. See
  [stopping-an-export.md](stopping-an-export.md).

## One at a time per project and shape

- **The rule.** A project can have one export waiting or rendering in each
  shape. A tall, a square and a wide export of one project can all wait at the
  same time. A second tall one cannot.
- **What a refusal says.** "A 9:16 export of this project is already being made.
  Wait for it to finish, or stop it first." It names the shape. If any ticked
  shape is already on its way, the whole press is refused and none of it is
  queued.
- **Why the database enforces it.** The partial unique index
  `ux_video_render_jobs_project_aspect_active` covers project and shape. Two
  presses landing at the same instant cannot both get in, and because every
  shape of one press goes in as one statement, a refusal leaves none of them
  behind.
- **The person's own limit still holds.** Twenty exports waiting or rendering at
  once, counted per export, so ticking four shapes uses four.

## Where the shape is read

- **The renderer.** `renderTimeline` in `src/server/video/render.ts` takes the
  export's `aspect` and sizes the frame from it: 1080×1920 tall, 1080×1080
  square, 1920×1080 wide, 1440×1080 for 4:3, scaled down for the smaller
  qualities.
- **The Exports page.** A Shape column says which one each file is, and each
  cover is shown whole, so a tall one reads as tall.

## What happens to words and pictures

Nothing in the project is rearranged for a different shape. Check each shape by
eye before posting it.

- **Position.** Every clip's position is a share of the frame. A caption placed
  in the middle stays in the middle, and one placed near the bottom stays near
  the bottom.
- **Size of words.** Words are sized against the frame's height, from a
  1080-tall design. A tall frame is 1920 high, so words there come out 1.78
  times bigger than the same words in a wide frame, which is 1080 high. In the
  test on 24 Sep 2026, one line of words wrapped onto two lines in the tall
  file, filled about four fifths of the square file's width, and filled under
  half of the wide file's width.
- **Long lines.** Words wrap at nine tenths of the frame's width. A line that
  wrapped onto two lines in a tall frame may sit on one line in a wide one.
- **Videos and pictures.** Each clip keeps its own Fit or Fill choice. A tall
  clip set to Fit shows black bands down the sides of a wide frame, and set to
  Fill loses its top and bottom. See [clip-frame-fit.md](clip-frame-fit.md).

## Exports made before this

The column was added by `drizzle/0084_video_render_job_aspect.sql`. A finished
export was given the shape its own file came out as, read from its width and
height, which is right even when the project's shape was changed afterwards.
Every other old row took its project's shape, because that is what it would
have been made in.
