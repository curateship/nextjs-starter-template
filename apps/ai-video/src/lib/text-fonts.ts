type TextFontConfig = {
  id: string
  label: string
  family: string
  fileName: string
  weight: number
  widthRatio: number
}

export const TEXT_FONTS = [
  {
    id: "inter",
    label: "Inter",
    family: "Inter",
    fileName: "Inter-SemiBold.ttf",
    weight: 600,
    widthRatio: 0.55,
  },
  {
    id: "anton",
    label: "Anton",
    family: "Anton",
    fileName: "Anton-Regular.ttf",
    weight: 400,
    widthRatio: 0.55,
  },
  {
    id: "bebas-neue",
    label: "Bebas Neue",
    family: "Bebas Neue",
    fileName: "BebasNeue-Regular.ttf",
    weight: 400,
    widthRatio: 0.48,
  },
  {
    id: "playfair-display",
    label: "Playfair Display",
    family: "Playfair Display",
    fileName: "PlayfairDisplay[wght].ttf",
    weight: 600,
    widthRatio: 0.53,
  },
  {
    id: "space-grotesk",
    label: "Space Grotesk",
    family: "Space Grotesk",
    fileName: "SpaceGrotesk[wght].ttf",
    weight: 600,
    widthRatio: 0.54,
  },
] as const satisfies readonly TextFontConfig[]

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

export function getTextFont(fontId: TextFontId) {
  const font = TEXT_FONT_BY_ID.get(fontId)
  if (!font) {
    throw new Error(`Unsupported text font: ${fontId}`)
  }
  return font
}

export function requireTextFont(fontId: TextFontId | undefined) {
  if (!fontId) {
    throw new Error("Text clip is missing a font")
  }
  return getTextFont(fontId)
}
