# Colour and brightness on a clip

A clip shot in a dark room can be lifted here until faces show, without
fixing it in another app and uploading it again. The controls are in the
inspector on the right, in the **Colour** card, on video and picture clips.
Sound has no picture, and text is drawn in the colour it is set to, so neither
gets the card.

## The three sliders

- **Brightness** makes the whole picture lighter or darker by the same
  amount everywhere. It runs from -50 to +50, and 0 changes nothing. +20 lifts
  every part of the picture about a fifth of the way from black towards
  white, so a dark face and a dark wall come up together.
- **Contrast** pushes the light parts lighter and the dark parts darker, or
  pulls them both towards the middle grey. It runs from 50% to 200%, and 100%
  changes nothing. Above 100% a flat, washed-out shot looks crisper. Below it,
  a harsh one looks softer.
- **Saturation** makes the colours stronger or weaker without changing how
  light anything is. It runs from 0% to 200%, and 100% changes nothing. 0% is
  black and white.

For a dark room, brightness does most of the work. A little extra contrast,
around 110%, stops the lifted picture looking grey and misty.

**Reset colour** puts all three back to no change at once. One press of undo
brings all three back. A slider drag is one undo step, however far it went.

## The preview and the export use the same numbers

The three values saved on the clip are ffmpeg's own `eq` numbers. The export
runs `eq` with them. The preview can't run ffmpeg, so it does the same sums
as `eq` in the browser, as a colour matrix, and points the clip's picture at
it with a CSS `filter`.

The two were compared in Chrome on a test picture of 18 colour patches: skin
tones from dark to light, a grey scale, and six strong colours. It was tried
with six settings, as a picture and as a video. Every patch in the preview
was within 4 levels out of 255 of the same patch in the export, and most were
within 1. An untouched clip already differs by up to 2 levels between the two,
from how the export is compressed. A real export of a lifted clip from the
editor agreed with the paused preview within 2 levels on every area without
text.

Two details had to be right for that:

- **`eq`'s real sums.** For ordinary settings `eq` uses a faster sum with
  whole numbers, not the formula in its documentation, and the matrix copies
  that sum. `eq` also reads brightness in whole hundredths and rounds down,
  after storing it slightly short, so -0.2 would land on -0.21. The export
  adds one millionth to brightness so it lands on the hundredth that was set.
- **The colour conversion.** ffmpeg uses BT.601 when it turns a picture into
  video, and writes the export without a colour tag, so players read it back
  with BT.601 as well. The matrix uses BT.601 too. With BT.709 instead, black
  and white came out 17 levels lighter in the preview than in the export on a
  strong green.

## Nothing is set, so nothing changes

A clip with nothing saved has no colour change. Every project saved before
this setting existed has no value on any clip, so those projects look and
export exactly as they did. A slider set back to its middle removes the value
rather than saving it, and so does the reset. An untouched clip gets no
colour step in the export at all, and no filter in the preview, so it costs
nothing. A value outside the sliders' ends fails the whole timeline rather
than being quietly corrected.

A colour step on a 10-second HD clip added about a fifth of a second to a
1.3-second export, which is inside the run-to-run noise.

## Where it lives

`src/lib/video/clip-colour.ts` holds the limits, the reader that turns an
absent value into no change, the `eq` filter and the matrix.

- `src/lib/video/timeline-schema.ts` takes `brightness`, `contrast` and
  `saturation` as optional numbers, with the limits from that file.
- `src/server/video/render.ts` adds `eq` straight after the clip is fitted to
  the frame. Doing it after the fit means `eq` works on a frame-sized picture
  rather than on a 4K original.
- `src/components/video-editor/editor-preview.tsx` draws one hidden SVG
  `feColorMatrix` per clip that has colour set. A picture points its CSS
  `filter` at its matrix. A video gets its filter written by the playback
  loop on every frame, because clips of the same file share one `<video>`
  element and two clips of that file may be set differently.
- `src/components/video-editor/studio-inspector.tsx` has the card.
