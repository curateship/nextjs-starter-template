import { describe, expect, it } from "vitest"

import { sixDigitBrandColor } from "@/lib/video/brand-kit"
import { carouselTextItemSchema } from "@/lib/video/carousel-schema"

describe("sixDigitBrandColor", () => {
  it("writes a short kit colour out in full, which a slide can save", () => {
    expect(sixDigitBrandColor("#FaB")).toBe("#ffaabb")
    expect(
      carouselTextItemSchema.shape.color.safeParse(sixDigitBrandColor("#fff"))
        .success
    ).toBe(true)
  })

  it("lower-cases a full colour and leaves its digits alone", () => {
    expect(sixDigitBrandColor("#22C55E")).toBe("#22c55e")
  })
})
