/**
 * The faces text clips and carousel text can be drawn in. Each one ships
 * twice: as woff2 files in `public/fonts` for the browser, and as a ttf in
 * `src/server/assets` for the server's rasterizer, so the export matches the
 * preview. Four are SemiBold; Anton comes in one weight only, its own heavy
 * Regular. All five are free under the SIL Open Font License 1.1 — each
 * licence sits beside its ttf as `<Face>-LICENSE.txt`.
 *
 * `family` is what the browser draws with, `svgFamily` is the exact family
 * name inside the ttf, which is what the export's SVG must say.
 *
 * `widthRatio` is the average letter width as a fraction of the font size. It
 * is what lets the preview guess where a line wraps without measuring it.
 * Each number was measured from its ttf (the mean advance width of a sample
 * of caption text), then scaled by the same ~1.14 safety margin Inter's
 * shipped 0.55 carries over its measured 0.48 — wrapping a word early is
 * invisible, wrapping late pushes words off the frame.
 *
 * `capitalsWidthRatio` is the same number measured on the same sample in
 * capitals, for words written all in capitals (the Bold caption preset).
 * Capitals are up to a fifth wider than small letters, so guessing them with
 * the small-letter number wraps late. Measured on 21 Oct 2026 the same way.
 *
 * `ascent` and `descent` are how far the face reaches above and below the
 * line it sits on, as a share of the font size, read from each ttf's `hhea`
 * table on 20 Oct 2026. A browser centres those on each line, so the export
 * uses them to put its lines, and the box behind highlighted words, where
 * the canvas does.
 */

export const TEXT_FONTS = [
  {
    id: "inter",
    label: "Inter",
    family: "var(--app-font-sans)",
    svgFamily: "Inter",
    weight: 600,
    widthRatio: 0.55,
    capitalsWidthRatio: 0.66,
    ascent: 0.969,
    descent: 0.241,
  },
  {
    id: "playfair-display",
    label: "Playfair Display",
    family: '"Playfair Display", Georgia, serif',
    svgFamily: "Playfair Display",
    weight: 600,
    widthRatio: 0.52,
    capitalsWidthRatio: 0.65,
    ascent: 1.082,
    descent: 0.251,
  },
  {
    id: "space-grotesk",
    label: "Space Grotesk",
    family: '"Space Grotesk", ui-sans-serif, sans-serif',
    svgFamily: "Space Grotesk",
    weight: 600,
    widthRatio: 0.55,
    capitalsWidthRatio: 0.6,
    ascent: 0.984,
    descent: 0.292,
  },
  {
    id: "caveat",
    label: "Caveat",
    family: '"Caveat", cursive',
    svgFamily: "Caveat",
    weight: 600,
    widthRatio: 0.38,
    capitalsWidthRatio: 0.52,
    ascent: 0.96,
    descent: 0.3,
  },
  {
    id: "anton",
    label: "Anton",
    family: '"Anton", Impact, sans-serif',
    svgFamily: "Anton",
    weight: 400,
    widthRatio: 0.45,
    capitalsWidthRatio: 0.46,
    ascent: 1.176,
    descent: 0.329,
  },
] as const

export type TextFont = (typeof TEXT_FONTS)[number]
export type TextFontId = TextFont["id"]

const DEFAULT_TEXT_FONT = TEXT_FONTS[0]

export const DEFAULT_TEXT_FONT_ID = DEFAULT_TEXT_FONT.id
export const TEXT_FONT_IDS = TEXT_FONTS.map((font) => font.id) as [
  TextFontId,
  ...TextFontId[],
]

const TEXT_FONT_BY_ID = new Map<TextFontId, TextFont>(
  TEXT_FONTS.map((font) => [font.id, font])
)

/**
 * No font at all means Inter: text clips saved before fonts were a choice
 * carry no `fontId`, and they must keep looking the way they always did.
 * A font id that is written down but unknown is still an error.
 */
export function requireTextFont(fontId: TextFontId | undefined): TextFont {
  if (fontId === undefined) return DEFAULT_TEXT_FONT
  const font = TEXT_FONT_BY_ID.get(fontId)
  if (!font) {
    throw new Error(`Unsupported text font: ${fontId}`)
  }
  return font
}

/**
 * The letter width a line of text is guessed at: the capitals number when the
 * words have letters and none of them is small, the ordinary one otherwise.
 */
export function lineWidthRatio(font: TextFont, text: string) {
  const allCapitals = /\p{Lu}/u.test(text) && !/\p{Ll}/u.test(text)
  return allCapitals ? font.capitalsWidthRatio : font.widthRatio
}
