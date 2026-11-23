import { describe, expect, it } from "vitest"

import {
  DEFAULT_TEXT_FONT_ID,
  requireTextFont,
  TEXT_FONTS,
  type TextFontId,
} from "@/lib/video/text-fonts"

describe("text fonts", () => {
  it("keeps Inter for clips saved before fonts were a choice", () => {
    // Old text clips carry no fontId at all. They must draw as they always
    // did, not fail the render.
    expect(requireTextFont(undefined).id).toBe("inter")
    expect(DEFAULT_TEXT_FONT_ID).toBe("inter")
  })

  it("refuses a font id it does not know", () => {
    expect(() => requireTextFont("comic-sans" as TextFontId)).toThrow(
      "Unsupported text font"
    )
  })

  it("gives every face its own measured width ratio", () => {
    // A copied ratio would make the preview wrap one font by another font's
    // letter widths. Caveat is much narrower than the rest, so equal numbers
    // across the board would be a copy, not a measurement.
    const ratios = TEXT_FONTS.map((font) => font.widthRatio)
    expect(Math.min(...ratios)).toBeLessThan(0.45)
    for (const ratio of ratios) {
      expect(ratio).toBeGreaterThan(0.2)
      expect(ratio).toBeLessThan(0.8)
    }
  })
})
