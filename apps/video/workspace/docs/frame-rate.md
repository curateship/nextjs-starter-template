# Frame rate

An export is made at 30 or 60 frames a second. The choice sits in the export
window under the quality rows, headed "How smooth the movement is". The two
rows read "30 frames a second, What most videos use" and "60 frames a second,
Smoother movement, larger file". Thirty is picked when a project is opened in
the editor. A different pick stays picked each time the window reopens, until
the editor is left, the same as the quality choice.

## What the choice does

- **60 keeps footage shot at 60 at 60.** A phone clip shot at 60 used to come
  out at 30, with every other frame dropped. At 60 every frame is kept, so fast
  movement looks smoother.
- **60 does nothing for footage shot at 30.** Each frame is shown twice. The
  picture moves exactly as it did at 30.
- **The length never changes.** A project that runs 23 seconds is 23 seconds
  at either rate. Only the number of frames inside it doubles.
- **The choice is kept on the export.** It is the `frame_rate` column of
  `video_render_jobs`, added by `drizzle/0086_video_render_job_frame_rate.sql`.
  The database takes only 30 or 60. A failed export tried again keeps its
  rate, because it is the same row.
- **Every export made before this is marked 30**, which is what it was made
  at. A request for a new export must name its rate. One that does not is
  refused, so an out-of-date page cannot quietly make a 30 by mistake.

## Where the renderer reads it

`renderTimeline` in `src/server/video/render.ts` takes `frameRate` and uses it
everywhere 30 used to be written in:

- **The file itself.** The `-r` setting on the finished MP4 and the black
  frame everything is laid on.
- **The end card and the dips to black.** Both are drawn frames of their own.
- **Captions.** They are pictures listed for ffmpeg counting in the film's
  frames, so the lit word changes on the same moment at either rate
  (`captionLayerSegments` in `src/server/video/caption-layer.ts`).
- **Still pictures that move.** A slow move is worked out one output frame at
  a time, so at 60 it takes twice as many steps over the same seconds.

Everything else is timed in seconds already: clip places, trims, speed,
crossfades, slides and fades.

## Checked on 24 Sep 2026

Four projects were made at both rates through the real renderer, all at Best,
with the end card and watermark off. Lengths and frame counts are from
`ffprobe`.

| Project | Length at 30 | Length at 60 | Frames at 30 | Frames at 60 |
| --- | ---: | ---: | ---: | ---: |
| A screen recording shot at 60, 64.8 s, wide | 64.800 s | 64.800 s | 1,944 | 3,888 |
| A talking clip shot at 30, 2 min, wide | 120.000 s | 120.000 s | 3,600 | 7,200 |
| A moving still, a slide and a caption, 12.01 s, 4:3 | 12.000 s | 12.017 s | 360 | 721 |
| Captions lit word by word, 13.09 s, tall | 13.100 s | 13.091 s | 393 | 785 |

- **The small differences are rounding to a whole frame.** The last two
  projects end partway through a frame. Each file rounds to its own nearest
  frame, which is at most a thirtieth of a second.
- **Things landed at the same moment.** Frames pulled from both files at the
  same times showed the same lit word, the same caption and the moving still
  at the same size.
- **An export pressed in the browser at 60** came out at 60, with 1,380 frames
  over 23.000 seconds. The same project's earlier export at 30 had 690 frames
  over the same 23.000 seconds.

## What it costs

**File size, measured.** File size depends on the picture, not on the
machine, so these numbers hold on the server too.

| Project | File at 30 | File at 60 | Difference |
| --- | ---: | ---: | ---: |
| Screen recording shot at 60, 64.8 s | 7.95 MB | 8.30 MB | 4 in 100 bigger |
| Talking clip shot at 30, 2 min | 84.7 MB | 81.0 MB | 4 in 100 smaller |
| Moving still, slide and caption, 12 s | 1.08 MB | 1.17 MB | 8 in 100 bigger |
| Captions lit word by word, 13 s | 278 KB | 301 KB | 8 in 100 bigger |

- **Doubling the frames did not double the file.** The encoder only stores
  what changed from the frame before, and at 60 there is half as much change
  between one frame and the next.
- **None of these clips has fast movement.** The only footage shot at 60 in
  the library is a screen recording of a chart that barely moves. Sport, a
  phone panning or anything busy has not been measured, and is where 60 costs
  the most.
- **A clip shot at 30 does not get bigger at 60.** Its extra frames are copies
  and cost almost nothing to store.

**Render time, not measured yet.** Exports are rendered on the Hetzner server,
so that is where the time has to be taken. Until it is, the export window
shows no time estimate when 60 is picked. Every figure in
`EXPORT_SECONDS_PER_MINUTE` in `src/lib/video/render.ts` was timed at 30, and
reusing it at 60 would promise a time that runs short, because the renderer
draws twice as many frames.

## Why 30 stays the default

- **For footage shot at 30, 60 adds nothing.** The picture moves the same,
  and the render has twice the frames to draw. Five of the seven videos in the
  local library on 24 Sep 2026 were shot at 30.
- **Every export before this was 30.** Keeping 30 as the default means nothing
  changes for anyone who never touches the choice.
