# Blurring a spot

A blur hides one spot of the video, such as a stranger's face, a number
plate or a screen with an email on it. It can stay in one place, or follow
something that moves.

## Adding one

- **From the Text panel:** under Shapes, **Blur** sits beside Arrow and
  Circle. It lands at the playhead on a lane above what it covers, for 3
  seconds.
- **From a clip:** right-click a picture or video clip on the timeline and
  pick **Blur a spot**. It is the same blur. It starts at the playhead when
  the playhead is on that clip, and at the clip's start otherwise. It runs 3
  seconds, or to the end of the clip when that comes sooner.
- **Placing it:** drag the dashed box on the preview to move it, and drag
  either dot to resize it. A new blur lands in the upper middle of the frame,
  not the middle, because the preview's Play button sits there while the
  video is paused.

## The right-hand panel

- **Box or Oval:** a box for a screen or a plate, an oval for a face. The
  oval is the one that fits inside the box.
- **Strength:** 1 to 60, starting at 20. It is counted on a frame whose short
  side is 1080 pixels, the same way a shape's line thickness is, so 20 is the
  same softness on a tall video and a wide one.
- **Fades and timing:** the same as on any shape.

## What it blurs

A blur softens everything on the lanes under it and nothing on the lanes
above it. A caption on a higher lane stays sharp over a blurred face. Moving
the blur's lane up or down changes what it covers, the same way it does for
any clip.

## Blur that follows

The **Follow** card in the right-hand panel keeps the blur on something that
moves. Both of its buttons use AI and show their price before you press,
such as "Follow what's under it · about 4¢". A guest sent from Project
doesn't get the card.

- **Follow what's under it:** whatever is inside the blur at its first moment
  is followed through the rest of the blur's time.
- **Find faces:** Video finds the faces on the blur's first frame and numbers
  them on the preview. Clicking a number moves the blur onto that face, made
  a little bigger so hair and chin are covered, and follows it.
- **Stop following:** the blur goes back to standing still where it was put.
- **Follow again:** follows once more from where the blur now starts.
- **Moving a following blur by hand:** dragging it moves its whole path by
  the same amount, so it keeps following, just further over. The dots still
  resize it.

### How following works

- **What is looked at:** a small picture of the frame every half second
  across the blur's time, at most 384 pixels on its longer side, drawn from
  the lanes under the blur only. The blur itself, and anything over it, never
  hides what is being followed. The pictures are drawn from the smooth copies
  by the export's own code (`renderTimelineStills` in
  `src/server/video/render.ts`).
- **Who reads them:** Gemini 3.8 Flash, in asks of up to 24 frames. Each ask
  starts with the blur's first frame and the box around the thing, so every
  ask knows what to look for.
- **What is kept:** where the box's middle is in each frame, saved on the
  clip as `blurTrack`, one place every half second. The box keeps the size it
  was given. The preview and the export slide it in a straight line from one
  place to the next.
- **A frame it lost:** a frame where Gemini can't see the thing is left out,
  and the blur slides straight across that gap. Fast movement can slip out
  from under the blur for a moment, so watch a followed blur back before
  exporting.
- **How long:** four minutes of places at most (480). A longer blur follows
  its first four minutes and then holds still.
- **The price:** worked out by `blurFollowCostCents` in
  `src/lib/video/ai-estimates.ts`. It counts each picture as 1,120 tokens,
  which is what Google's Gemini 3 models read a picture at unless told
  otherwise. No real run has been measured against the meter yet. The spend
  line names these "Blur that follows" and "Find faces".

## How it is stored and drawn

- **Saved:** a clip of the kind `shape` with `shape: "blur"`, `blurShape`
  (box or oval), `blurStrength`, the two corners as `x`, `y`, `toX` and
  `toY`, and `blurTrack` when it follows something
  (`src/lib/video/timeline-schema.ts`). No migration was needed, because a
  timeline is stored whole.
- **One set of sums:** `src/lib/video/blur.ts` works out the box at any
  moment for both ends.
- **The preview:** a box with the browser's backdrop blur, rounded into an
  oval when it is one. The blur's spread is the strength scaled to the
  stage's short side.
- **The export:** each blur is one step in the layer chain. It crops its box
  out of everything drawn so far, runs ffmpeg's `gblur` on that copy, cuts it
  to an oval with a mask picture when it is one, and lays it back in the same
  place while the clip is on. A following blur moves its crop and its overlay
  by the same expression of the film's time. A saved frame goes through the
  same code, so it shows the blur too.
- **Checked against real exports** (`src/server/video/render-blur.test.ts`):
  on a checkerboard, the detail left inside a blurred box was under 20 out of
  a sharp board's 127, the rest of the frame kept over 90, an oval's corners
  stayed sharp, a white square on the lane above stayed pure white, and a
  following blur had moved from the left of the frame to the right.
- **Not yet checked:** how closely the browser's blur matches the export's
  at each strength. The two use the same spread, but nothing has measured
  them side by side yet.
