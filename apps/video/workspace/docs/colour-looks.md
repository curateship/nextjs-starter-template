# Film looks and your own looks

The Colour card on a video or picture clip starts with a Look field: eight
film looks, then your own saved looks. Tyler picked "Film looks + your own" on
4 Nov 2026.

## The eight film looks

- **Warm:** golden, late-afternoon light.
- **Cool:** clean blue daylight.
- **Teal and orange:** teal shadows and warm skin, the blockbuster look.
- **Faded film:** milky blacks and soft colour.
- **Vintage:** warm and faded, a little green in the shadows.
- **Noir:** black and white with deep shadows.
- **Bleach bypass:** silvery, low colour, hard contrast.
- **Vivid:** punchy colour for the feed.

A look goes on first and the brightness, contrast and saturation sliders after
it, so the sliders adjust the look. Reset colour takes off the look and the
sliders in one Undo.

## Your own looks

"Save as a look" keeps the clip's look and its three sliders under a name, such
as "Kitchen, evening". Your looks are listed after the film looks as "Yours:
Kitchen, evening" in every project, and picking one sets the look and all
three sliders in one Undo. Saving a name you already have replaces it. Each
person keeps up to 50. The Save popover lists them with a delete each, which
asks first. Clips that used a deleted look keep their colour.

A guest sent from Project sees the film looks only, because saved looks are
the owner's.

## How the preview and the export match

Each film look is one colour file, a LUT: for every colour in, the colour out.
Video writes its own looks as sums in `src/lib/video/film-looks.ts`, so there
is no outside file and no licence to keep. Each look is two steps:

1. A colour mix, where colour is taken away or pushed further.
2. A curve for each of red, green and blue, given as 9 points from black to
   white joined by straight lines. This is where shadows go one colour and
   highlights another, and where blacks are lifted.

The preview draws those two steps as an SVG colour matrix and a 9-value table
per channel, put before the sliders' matrix in the clip's filter. The export
writes the same two steps out as a `.cube` LUT of 33 × 33 × 33 colours in its
scratch folder and runs ffmpeg's `lut3d` before the sliders' `eq`.

`film-looks.test.ts` runs every look's LUT through the real `lut3d` on 125
colour patches and compares each with the preview's sums: all eight agree
within 3 levels out of 255. `render-frame-shape.test.ts` exports a white clip
through Faded film and checks it comes out about 242, 242, 237, as the look's
curves say. The preview and the export still read a video's colours through
the sliders' BT.601 sums, as clip-colour.md describes.

## Where it lives

- `src/lib/video/film-looks.ts`: the looks, the preview's tables and the LUT.
- `src/components/video-editor/colour-look-field.tsx`: the Look field and Save.
- `src/server/video/colour-looks.ts`: your own looks, `video_colour_looks`
  (migration 0150).
