# Zoom in on a moment

A video clip can go closer for a stretch and then come back, like a punch-in on
a key line. Tyler, 4 Nov 2026: "One-press punch-in".

## Making one

- **One press.** Pick a video clip, put the playhead where the zoom should
  start, and press Zoom in at the playhead on the clip's Zoom card in the
  right panel. The zoom lasts 2 seconds, or less when the clip ends sooner or
  another zoom starts sooner.
- **On the timeline.** Each zoom is a thin band along the top of the clip.
  Drag either end of the band to make it start or end elsewhere. A zoom
  stays at least 0.3 seconds long and never overlaps another.
- **On the card.** Each zoom on the clip has a row with its times, a Length
  in seconds box, a Size slider from 1.1x to 2x (1.3x to start), How it goes
  in (Ease in and out, or Jump) and Delete.
- **Length.** Type how long the zoom lasts and press Enter or leave the box.
  The start stays put and the end moves. A length longer than there is room
  for stops at the clip's end or the next zoom, and a message says how long
  it could be. Tyler, 5 Nov 2026: "I need to be able to set how long a zoom
  in is".
- **Undo.** Adding, dragging, a typed length, sizing and deleting are each
  one Undo step. A
  Size drag is one step, not one per value.

## How it is drawn

- **About the middle of the frame.** The picture grows from the frame's
  middle, which is the middle of whatever part the crop spot shows
  ([clip-frame-fit.md](clip-frame-fit.md)). It never follows a face.
- **Ease** takes 0.3 seconds to go in and 0.3 to come out, smoothed so it
  starts and stops gently. A zoom shorter than 0.9 seconds eases over a third
  of its length each way. **Jump** cuts straight to the closer framing and
  back.
- **Preview and export agree.** Both work out the size at each moment from
  `punchScaleAt` in `src/lib/video/punch-ins.ts`. The preview scales the
  frame-sized player. The export redraws each frame with ffmpeg's
  `perspective`, which places the picture to a fraction of a pixel, for the
  reason [clip-motion.md](clip-motion.md) gives against `zoompan`.
  `render-editor-features.test.ts` exports a doubled zoom and measures the
  frame before, during and after it.

## Kept in the file's time

A zoom is stored as a start and end in the file's own milliseconds
(`punchIns` on the clip: `sourceStartMs`, `sourceEndMs`, `scale`, `ease`), not
counted from the clip's start. That is a change from the task's wording, made
so a zoom stays on the same moment of footage whatever happens to the clip:

- **Trimming** either end leaves every zoom where it was in the footage.
- **Splitting** gives both pieces the same list. Each piece draws only the
  zooms inside its own stretch of the file, so a zoom across the cut is drawn
  partly on each side.
- **Speed** changes how long a zoom lasts on the timeline, because the
  footage under it plays faster or slower. The ease stays 0.3 seconds of
  timeline time.
- **Replacing the media** drops every zoom, because the new file's times mean
  nothing for the old one's moments.

## Only on a video that fills the frame

A zoom needs a video clip at full size with a plain rectangle shape. A smaller
box, a split half or a bubble would need its own crop in the preview, and the
preview could then show something the export does not. On such a clip the card
says so instead of offering the button. Zooms already on a clip are kept but
not drawn while it is smaller than the frame. Setting it back to full size
brings them back as they were.

A still picture has its own slow moves instead ([clip-motion.md](clip-motion.md)).
