# Text fonts

Video text clips, captions and carousel text can be drawn in five faces.
Inter is the default and is what every clip made before fonts were a choice
keeps — a clip saved with no font written down always draws as Inter.

## The faces and their licences

| Face | What it looks like | Licence |
| --- | --- | --- |
| Inter | The app's own everyday face | SIL Open Font License 1.1 |
| Playfair Display | A serif with thick-and-thin strokes, like a magazine headline | SIL Open Font License 1.1 |
| Space Grotesk | A squarish face with a technical feel | SIL Open Font License 1.1 |
| Caveat | Handwriting | SIL Open Font License 1.1 |
| Anton | Tall, narrow and heavy, for captions in capitals | SIL Open Font License 1.1 |

Each licence text sits beside its font file as
`src/server/assets/<Face>-LICENSE.txt`. The SIL licence allows bundling,
serving and selling work made with the fonts; the only thing it forbids is
selling the font files by themselves. Every shipped file is Google Fonts'
own build, unmodified — that matters because Playfair Display's licence
reserves its name, so a version modified here could not keep calling itself
Playfair Display.

Anton joined on 21 Oct 2026 for the Bold caption preset, after Tyler chose a
real heavy face over Inter in capitals. Its files are Google Fonts' own
build, unmodified: `Anton-Regular.ttf` from the google/fonts repository and
the latin and latin-ext woff2 files Google Fonts serves. Its licence, copied
from the same repository's `OFL.txt`, is
`src/server/assets/Anton-LICENSE.txt`. It has one weight only, its own heavy
Regular (400), so it is the one face not drawn at 600.

## Where to pick one

- A text clip in the video editor: the Font dropdown in the clip's "The words"
  card, `src/components/video-editor/studio-inspector.tsx`.
- Captions: the Font pick in the caption look, on Settings, Captions and in
  the Captions window ([caption-look.md](caption-look.md)).
- Carousel text: the Font buttons in the text layer's inspector, and the Fonts
  shelf in the left panel that starts a new text layer in a face,
  `src/components/carousel-studio/carousel-studio.tsx`.

## The same face on both ends

Every face ships twice, and the two copies must stay in step or an export
wraps its lines differently from the preview:

- The browser loads woff2 files from `public/fonts/`. Four are declared in
  `src/theme.css`. Anton is declared in the app's own
  `src/components/video-editor/text-fonts.css`, because `theme.css` belongs to
  the shell and must not be edited again; the editor, the carousel studio and
  the caption look's fields import it. A face is only downloaded once
  something on screen uses it.
- The server's rasterizer loads ttf files from
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

Words all in capitals are wider, up to a fifth, so each face also carries
`capitalsWidthRatio`, measured on 21 Oct 2026 the same way on the same sample
in capitals and scaled by the same margin: Inter 0.58 → 0.66, Playfair
Display 0.57 → 0.65, Space Grotesk 0.53 → 0.60, Caveat 0.46 → 0.52, Anton
0.40 → 0.46. Anton's small letters measured 0.40 too, shipped as 0.45. A
line with letters and none of them small is guessed with the capitals number.

The video export no longer guesses at all: from 22 Oct 2026 it measures each
line in the ttf (`src/server/video/text-measure.ts`), as the carousel export
already did. The guess is still what the safe box uses to tell how tall a
caption will stand ([safe-box.md](safe-box.md)).

## What it costs

The four extra faces add nothing to a page that does not use them. When one is
used, the browser downloads its woff2 files once:

- Playfair Display: 23 KB (latin) + 13 KB (accented latin), 36 KB together
- Space Grotesk: 13 KB + 12 KB, 25 KB together
- Caveat: 50 KB + 19 KB, 69 KB together

- Anton: 12 KB (latin) + 21 KB (accented latin), 33 KB together

All four together are 163 KB, about the size of one small photo. The server
ttf files (69–252 KB each) never reach the browser.
