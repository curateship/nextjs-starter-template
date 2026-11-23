# Stick to a moving thing

Text, an arrow or circle, a sticker, or a small video can follow a person or
object that moves under it. Tyler, 4 Nov 2026, picked all four. It's built on
the blur's own following ([blur.md](blur.md)).

## Using it

- **Pick the item** and open its Follow card in the right panel. It shows on
  text, arrows and circles, social stickers, and any picture or video smaller
  than the frame (a sticker, a corner video, a split half). A full-frame
  video has nowhere to move, so it gets no card.
- **Follow what's under it** looks for one part of the first frame in the
  later frames:
  - an arrow: what its tip points at
  - a circle: what's inside it
  - text, a sticker or a small video: a box round its middle, a fifth of the
    frame wide
- **Find faces** finds the faces on the item's first frame, numbers them on
  the preview, and follows the one you click.
- **Stop following** clears it. **Follow again** looks again.
- Both buttons show their price first and use the project's AI spend, priced
  the same as a blur's (`blurFollowCostCents`, `findFacesCostCents`). A guest
  sent from Project doesn't get the card, because it uses AI.

## How it moves

- **It keeps its distance.** The item stays where you put it and moves by
  however far the thing has moved since the first frame. A label set above a
  head stays above it, instead of jumping onto the face the way a blur
  does.
- **Size stays the same.** An arrow keeps its length and angle and slides
  whole.
- **Dragging it afterwards** moves it to the new place and keeps it
  following, which is the same as moving every place by the drag.
- **Between places** it slides in a straight line. Places are half a second
  apart. A frame the thing is missing from is left out, and the item slides
  across it.

## Where it's kept

- `followTrack` on the clip: the thing's middle, every half second from the
  clip's start, as shares of the frame (`src/lib/video/follow-track.ts`). Its
  shape is the same as a blur's `blurTrack`, and a blur keeps its own field.
- **Splitting** gives the left piece the places up to the cut. The right piece
  starts where the item had got to and counts its places from its own start,
  so neither piece jumps.
- The server side is `followUnderItem` and `findFacesUnderItem` in
  `src/server/video/blur-follow.ts`. They share every step with the blur's
  calls, with their own meter features, `follow_thing` and `follow_faces`.

## Preview and export

Both move the item by `followOffsetAt`. The preview adds a CSS translate. The
export adds the same move, as an ffmpeg expression of time, to the layer's
overlay position. A following caption is drawn as a layer of its own, never
merged with the captions around it, because the whole layer moves.
`render-editor-features.test.ts` exports a small box following a path from the
left third to the right third and measures both ends.

The dashed box that drags a shape on the preview stays where the shape was
placed. Only the drawn lines move.
