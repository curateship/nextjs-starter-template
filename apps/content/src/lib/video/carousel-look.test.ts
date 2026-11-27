import { describe, expect, it } from "vitest"

import { applyCarouselLook, captionWithFooter } from "@/lib/video/carousel-look"
import type { CarouselSlide } from "@/lib/video/carousel-schema"

/** A carousel project's look and footer (workspace/docs/carousel-project-carousels.md). */

function words(id: string, fontSize: number) {
  return {
    id,
    type: "text" as const,
    text: id,
    x: 0.1,
    y: 0.1,
    width: 0.8,
    height: 0.2,
    zIndex: 1,
    fontId: "inter" as const,
    fontSize,
    color: "#ffffff",
    align: "left" as const,
  }
}

const draft: CarouselSlide[] = [
  { id: "s1", title: "One", backgroundColor: "#111827", items: [words("headline", 88), words("body", 40)] },
]

describe("applyCarouselLook", () => {
  it("makes the largest words the project's size and keeps the rest in step", () => {
    const [slide] = applyCarouselLook(draft, { fontSize: 66, textColor: "#ff0000" })
    expect(slide.items.map((item) => (item.type === "text" ? [item.fontSize, item.color] : null))).toEqual([
      [66, "#ff0000"],
      [30, "#ff0000"],
    ])
  })

  it("leaves everything the look does not set as it was", () => {
    expect(applyCarouselLook(draft, {})).toEqual(draft)
  })
})

describe("captionWithFooter", () => {
  it("puts the footer under the caption, or alone", () => {
    expect(captionWithFooter("Swipe for more  ", " #tips ")).toBe("Swipe for more\n\n#tips")
    expect(captionWithFooter("", "#tips")).toBe("#tips")
    expect(captionWithFooter("Words", "  ")).toBe("Words")
  })
})
