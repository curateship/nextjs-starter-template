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

## Round bubble and border

Every video and picture clip has a Shape card: Rectangle, Rounded or Circle,
and a Border switch with a colour and a thickness from 1 to 30 (pixels of a
frame whose short side is 1080). Tyler picked circle or rounded corners with
an optional border on 4 Nov 2026. The card first showed only on a clip
already smaller than the frame, which he found "too confusing", so it now
shows on every clip:

- **On a full-frame clip,** picking Rounded or Circle, or switching on the
  border, shrinks the clip into the corner box first, in the same Undo. The
  card says so before anything is picked.

- **Circle** makes the box square, the biggest square the frame holds, then
  shrinks it by the clip's size. On a tall project the corner box becomes a
  324-pixel circle instead of a 324 by 576 rectangle.
- **Rounded** rounds the corners by a share of the box's shorter side, 15 out
  of 100 to start, from 2 to 50.
- **Both** set the clip to Fill. A shape is drawn only on a filled clip,
  because only then is the picture exactly its box in both the preview and the
  export. A clip switched back to Fit draws as a plain rectangle with no
  border; picking the shape again sets Fill again.
- **The border** sits just inside the edge, so the clip stays the same size
  with or without it.

The preview rounds the element with `border-radius` and draws the border as an
outline pulled inside the edge. The export draws a mask at the picture's exact
pixel size, cuts the clip out with ffmpeg's `alphamerge`, and lays a picture
of the ring over it before the clip is placed. Both take their sums from
`src/lib/video/clip-frame-shape.ts`. `render-frame-shape.test.ts` exports a
white bubble over black and checks a circle's corners, a rounded corner, the
border's colour, and that a fitted clip is left square.

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
