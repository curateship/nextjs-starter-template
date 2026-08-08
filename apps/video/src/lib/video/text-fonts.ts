/**
 * The face text clips are drawn in: the app's own, the same Inter every other
 * screen here uses. Nothing extra is bundled — a second family would mean a
 * second set of font files to ship, and every video would look like a different
 * app made it.
 *
 * `widthRatio` is the average letter width as a fraction of the font size. It
 * is what lets the preview guess where a line wraps without measuring it.
 */

export const TEXT_FONTS = [
  {
    id: "inter",
    label: "Inter",
    family: "var(--app-font-sans)",
    weight: 600,
    widthRatio: 0.55,
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

export function requireTextFont(fontId: TextFontId | undefined) {
  const font = fontId ? TEXT_FONT_BY_ID.get(fontId) : undefined
  if (!font) {
    throw new Error(`Unsupported text font: ${fontId ?? "(none)"}`)
  }
  return font
}
