# Video on top of video

A picture or video clip can be smaller than the frame and sit over the clips
on the lanes below it. That covers a face in the corner of a screen recording,
and the two splits Shorts use: one clip on top and one underneath, or one on
each side.

## Placing a clip by hand

- **Size:** the **Size** slider in **The frame** card shrinks the clip from
  100% down to 10% of its box.
- **Moving it:** a clip smaller than the frame drags around the preview like
  text, and snaps to the frame's centre lines. Alt while dragging turns the
  snapping off.
- **What is saved:** `scale`, `x` and `y`, the same three numbers a picture
  sticker has always used (see [clip-frame-fit.md](clip-frame-fit.md)).

## The four layout buttons

The **Layout** card under **The frame** has four buttons. Each one only sets
those numbers, so the result can be dragged and resized afterwards.

- **Corner box:** the clip at 30% of the frame, filled so its edge is exactly
  where the numbers say, in the bottom-right corner. It keeps 3% of the frame
  clear of the edge. On a tall project with a platform picked on Settings →
  Captions it also keeps clear of the strip that platform covers (see
  [safe-box.md](safe-box.md)), so TikTok's buttons do not sit on a face.
- **Top and bottom:** the picked clip fills the top half. The clip on the lane
  directly below it, the one sharing the most time with it, fills the bottom
  half.
- **Side by side:** the same, left and right.
- **Full frame:** clears every placing number, and the clip is the whole
  frame again.

Both halves of a split change in one step, so one Undo puts both back. A split
with nothing visual on the lane below moves only the picked clip, and a note
says to put a clip on the lane below.

## The box a split clip sits in

A half of a split is not a smaller copy of the frame. A tall 1080 by 1920 frame
has a top half 1080 by 960, which is a different shape. So a clip also has a
box: `boxWidth` and `boxHeight`, as shares of the frame. The clip is fitted or
filled into that box instead of the whole frame, then shrunk by its size.

- **The top half:** a box 1 wide and 0.5 tall, with its middle at 0.5 across
  and 0.25 down.
- **Absent means the frame:** a clip with no box saved is fitted to the whole
  frame, as every clip was before this. Nothing is saved for a full side.
- **Make it move refuses a clip in a box,** the same way it refuses a picture
  smaller than the frame.

## How the preview and the export agree

- **The preview** plays every clip of one file through one shared `<video>`
  element. That element only ever shows one clip of its file at a time, so
  the playback loop sets its place, size, fit and crop spot from whichever
  clip that is, once a frame, and only touches the element when a number
  changed (`src/components/video-editor/editor-preview.tsx`).
- **The export** fits or fills each clip into its box's pixels, shrinks it by
  its size, and overlays it with its middle on the same spot
  (`pictureBoxSize` and `pictureOverlayPosition` in
  `src/lib/video/clip-size.ts`, used in `src/server/video/render.ts`).
- **Checked against real exports:** a white clip in the corner box over a grey
  one came out with the box from 67% to 97% across and down, white inside it
  and grey outside. A top and bottom split came out white above the middle and
  grey below it. The tests are in
  `src/server/video/render-editor-features.test.ts`.
- **Checked in the browser:** after Corner box the preview's video measured
  67% across, 67% down and 30% wide and tall of the stage. After Top and
  bottom it filled the top 50%.

## What it costs

Each video on screen is one more file the export decodes at the same time, so
a split takes roughly as long as two exports of one clip. Nobody has timed it
on the Hetzner server that renders.
