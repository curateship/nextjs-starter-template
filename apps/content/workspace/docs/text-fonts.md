# Text fonts

Video text clips, captions, carousel text and thumbnail words can be drawn in eight faces.
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
| Fredoka | Soft and round, for study timers and thumbnails | SIL Open Font License 1.1 |
| Instrument Serif | A tall, light serif, for a big place name on a thumbnail | SIL Open Font License 1.1 |
| Geist Mono | Every letter the same width, for a small, wide-spaced line in capitals | SIL Open Font License 1.1 |

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

Fredoka joined on 14 Nov 2026 for study videos: the timer's digits and a
thumbnail's "25/05" (Tyler picked "Fredoka" as the rounded face). Its files
are Google Fonts' own build, unmodified: the static SemiBold ttf and the latin
and latin-ext woff2 files Google Fonts serves for weight 600. Its licence is
the google/fonts repository's `OFL.txt`, as
`src/server/assets/Fredoka-LICENSE.txt`. Its letter widths were measured by
drawing a sample line with the server's own rasterizer (resvg), which read
every other face within 0.02 of its shipped number.

Instrument Serif and Geist Mono joined on 26 Nov 2026 for a thumbnail
Tyler designed: "Toronto" in Instrument Serif over a park photo, with
"TRINITY BELLWOODS" under it in Geist Mono capitals spaced 0.3 of the
letter size apart ([thumbnails.md](thumbnails.md), "Toronto neighbourhood").
Instrument Serif has one weight, its Regular (400), so it is drawn at 400 like
Anton. Geist Mono is drawn at Medium (500), the weight the design used.

- **Instrument Serif's files:** `InstrumentSerif-Regular.ttf` is from the
  google/fonts repository, unmodified, with that repository's `OFL.txt` as
  `InstrumentSerif-LICENSE.txt`. The latin and latin-ext woff2 files came from
  Fontsource (cdn.jsdelivr.net/fontsource), which cuts them from the Google
  Fonts build.
- **Geist Mono's files:** Google Fonts only keeps Geist Mono as one file
  holding every weight, and the server's rasterizer can't pick a weight out
  of one of those. So the ttf is the static `GeistMono-Medium.ttf` from Geist's
  own repository (vercel/geist-font), unmodified. The latin and latin-ext Medium woff2
  files came from Fontsource, like Instrument Serif's. The licence is the
  google/fonts repository's `OFL.txt`, as `GeistMono-LICENSE.txt`. The ttf's
  family is "Geist Mono" with Medium as its style, which is the name the
  export asks for.
- **Letter widths** were measured with resvg on the same sample line as
  Fredoka, in the same run that read the other six within 0.01 of their
  numbers: Instrument Serif 0.34 → 0.39 (capitals 0.41 → 0.47), and Geist Mono
  0.60 → 0.68 for small letters and capitals alike, because every letter in it
  is the same width.

## Where to pick one

- A text clip in the video editor: the Font dropdown in the clip's "The words"
  card, `src/components/video-editor/studio-inspector.tsx`.
- Captions: the Font pick in the caption look, on Settings, Captions and in
  the Captions window ([caption-look.md](caption-look.md)).
- Carousel text: the Font buttons in the text layer's inspector, and the Fonts
  shelf in the left panel that starts a new text layer in a face,
  `src/components/carousel-studio/carousel-studio.tsx`.
- Thumbnail words: the Font dropdown in the right panel when a words layer is
  picked on the Thumbnail board,
  `src/components/video-thumbnails/thumbnail-inspector.tsx`.

## The same face on both ends

Every face ships twice, and the two copies must stay in step or an export
wraps its lines differently from the preview:

- The browser loads woff2 files from `public/fonts/`. Four are declared in
  `src/theme.css`. Anton, Fredoka, Instrument Serif and Geist Mono are
  declared in the app's own
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

The seven faces beside Inter add nothing to a page that does not use them. When one is
used, the browser downloads its woff2 files once:

- Playfair Display: 23 KB (latin) + 13 KB (accented latin), 36 KB together
- Space Grotesk: 13 KB + 12 KB, 25 KB together
- Caveat: 50 KB + 19 KB, 69 KB together

- Anton: 12 KB (latin) + 21 KB (accented latin), 33 KB together
- Fredoka: 16 KB (latin) + 3 KB (accented latin), 19 KB together
- Instrument Serif: 21 KB + 12 KB, 33 KB together
- Geist Mono: 10 KB + 7 KB, 17 KB together

All seven together are 232 KB, about the size of one small photo. The server
ttf files (69–252 KB each) never reach the browser.
