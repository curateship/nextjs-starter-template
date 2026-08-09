import { describe, expect, it } from "vitest"

import {
  carouselSlidesSchema,
  SAVED_CAROUSEL_INVALID_MESSAGE,
  requireCanonicalCarouselSlides,
} from "@/lib/video/carousel-schema"

const validSlide = {
  id: "slide-1",
  title: "Hook",
  backgroundColor: "#111827",
  items: [
    {
      id: "text-1",
      type: "text" as const,
      text: "Keep swiping",
      x: 0.1,
      y: 0.2,
      width: 0.8,
      height: 0.2,
      zIndex: 1,
      fontId: "inter" as const,
      fontSize: 64,
      color: "#ffffff",
      align: "left" as const,
    },
  ],
}

describe("carousel slide schema", () => {
  it("accepts the document the studio draws", () => {
    expect(carouselSlidesSchema.parse([validSlide])).toEqual([validSlide])
  })

  it("refuses more than 20 slides", () => {
    expect(
      carouselSlidesSchema.safeParse(
        Array.from({ length: 21 }, (_, index) => ({
          ...validSlide,
          id: `slide-${index}`,
        }))
      ).success
    ).toBe(false)
  })

  it("refuses more than 50 layers on one slide", () => {
    expect(
      carouselSlidesSchema.safeParse([
        {
          ...validSlide,
          items: Array.from({ length: 51 }, (_, index) => ({
            ...validSlide.items[0],
            id: `text-${index}`,
          })),
        },
      ]).success
    ).toBe(false)
  })

  it("refuses unknown fields instead of quietly storing them", () => {
    expect(
      carouselSlidesSchema.safeParse([{ ...validSlide, mystery: true }]).success
    ).toBe(false)
  })

  it("uses a plain recovery message for corrupt saved data", () => {
    expect(() => requireCanonicalCarouselSlides({ nope: true })).toThrowError(
      SAVED_CAROUSEL_INVALID_MESSAGE
    )
  })
})
