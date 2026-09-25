# Text fonts

Video text clips and carousel text can be drawn in four faces. Inter is the
default and is what every clip made before fonts were a choice keeps — a clip
saved with no font written down always draws as Inter.

## The faces and their licences

| Face | What it looks like | Licence |
| --- | --- | --- |
| Inter | The app's own everyday face | SIL Open Font License 1.1 |
| Playfair Display | A serif with thick-and-thin strokes, like a magazine headline | SIL Open Font License 1.1 |
| Space Grotesk | A squarish face with a technical feel | SIL Open Font License 1.1 |
| Caveat | Handwriting | SIL Open Font License 1.1 |

Each licence text sits beside its font file as
`src/server/assets/<Face>-LICENSE.txt`. The SIL licence allows bundling,
serving and selling work made with the fonts; the only thing it forbids is
selling the font files by themselves. Every shipped file is Google Fonts'
own build, unmodified — that matters because Playfair Display's licence
reserves its name, so a version modified here could not keep calling itself
Playfair Display.

## Where to pick one

- A text clip in the video editor: the Font dropdown in the clip's "The words"
  card, `src/components/video-editor/studio-inspector.tsx`.
- Carousel text: the Font buttons in the text layer's inspector, and the Fonts
  shelf in the left panel that starts a new text layer in a face,
  `src/components/carousel-studio/carousel-studio.tsx`.

## The same face on both ends

Every face ships twice, and the two copies must stay in step or an export
wraps its lines differently from the preview:

- The browser loads weight-600 woff2 files from `public/fonts/`, declared in
  `src/theme.css`. A face is only downloaded once something on screen uses it.
- The server's rasterizer loads weight-600 ttf files from
  `src/server/assets/`, listed in `src/server/video/text-font-files.ts`. The
  family name inside each ttf must match the `svgFamily` in
  `src/lib/video/text-fonts.ts`, because the rasterizer silently falls back to
  Inter when a name does not match. A test in
  `src/server/video/carousel-export.test.ts` renders the same words in every
  face and fails if two come out identical.

## The width ratio

The preview guesses where a line wraps from `widthRatio` in
`src/lib/video/text-fonts.ts`: the average letter width as a fraction of the
font size. Each face has its own measured number — Caveat's letters are about
a third narrower than Inter's, so a copied number would wrap it a line early.

The numbers were measured on 24 Sep 2026 from the shipped ttf files: the mean
advance width of a sample of caption text, then scaled up by the same ~1.14
margin Inter's shipped 0.55 carries over its measured 0.48, because wrapping a
word early is invisible and wrapping late pushes words off the frame.
Measured, then shipped: Inter 0.48 → 0.55, Playfair Display 0.45 → 0.52,
Space Grotesk 0.48 → 0.55, Caveat 0.34 → 0.38.

## What it costs

The three new faces add nothing to a page that does not use them. When one is
used, the browser downloads its woff2 files once:

- Playfair Display: 23 KB (latin) + 13 KB (accented latin), 36 KB together
- Space Grotesk: 13 KB + 12 KB, 25 KB together
- Caveat: 50 KB + 19 KB, 69 KB together

All three together are 130 KB, about the size of one small photo. The server
ttf files (69–252 KB each) never reach the browser.
