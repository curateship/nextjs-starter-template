# Arrows and circles

An arrow or a circle drawn over the video, to point at something. Tutorials and
screen recordings need them all the time.

## Adding one

The Text panel has **Arrow** and **Circle** under Shapes. Each lands on a lane
at the playhead, above whatever would hide it, and runs for 3 seconds like
any other clip. New shapes land in the upper part of the frame, not the
middle, because the preview's Play button sits in the middle while the video
is paused and would take the press meant for the shape.

## Placing it

- **The whole shape:** drag the dashed box round it on the preview.
- **One end:** a picked shape shows a dot at each end. On an arrow they are its
  tail and its tip. On a circle they are two opposite corners of the box the
  oval fills.
- **Undo:** one Undo puts back a whole drag.
- **The rest:** the right-hand panel switches it between arrow and circle, and
  sets its colour (red to start) and how thick its line is, 2 to 40 pixels on
  a frame whose short side is 1080, 12 to start. Fades and timing work as on
  a picture.

## Drawing itself on

A new shape draws itself on: the arrow grows out of its tail with its head
riding on the end, and the circle traces round from the top, both over half a
second, quick at first and slowing as they finish. **Draws itself on** in the
panel turns that off, and the shape is simply there.

While a shape is picked and the video is paused, the preview draws it whole,
even at its first frame. Otherwise one just added at the playhead would show
nothing at all while it is being placed. Playing, or picking another clip,
shows it as the export will.

## How it is stored and drawn

- **Saved:** a clip of the kind `shape`, with `shape` (arrow or circle), `x`
  and `y` for one point, `toX` and `toY` for the other, `color`, `lineWidth`
  and `drawOn` (`src/lib/video/shapes.ts`). A shape clip with no `shape` is
  refused when the project is saved.
- **One set of sums:** the preview and the export draw the same SVG paths from
  `shapeStrokes`. The preview puts them over the stage and redraws them while
  the shape draws on. The export draws them to a picture with resvg, one per
  frame of the film during the half second, then one still for the rest, the
  way animated captions are drawn.
- **Colour:** anything that is not a plain six-digit colour is drawn red, so a
  hand-edited project cannot slip markup into the drawing.
- **Checked against a real export:** a white arrow across the middle of the
  frame, drawing on, had reached the left fifth of its shaft a tenth of a
  second in and not the right side. A second in it reached the right side.
- **Checked in the browser:** dragging the box moved the arrow 40 pixels
  across and 30 down, and dragging the tip dot moved only the tip.
