import { describe, expect, it } from "vitest"

import type {
  CarouselSlide,
  CarouselTextItem,
} from "@/lib/video/carousel-schema"
import { TEXT_FONTS } from "@/lib/video/text-fonts"
import {
  carouselSlideSvg,
  renderCarouselSlidePng,
} from "@/server/video/carousel-export"

const textItem: CarouselTextItem = {
  id: "text-1",
  type: "text",
  text: "Safe <words> & symbols",
  x: 0.1,
  y: 0.1,
  width: 0.8,
  height: 0.3,
  zIndex: 2,
  fontId: "inter",
  fontSize: 64,
  color: "#ffffff",
  align: "center",
}

const slide: CarouselSlide = {
  id: "slide-1",
  title: "Test",
  backgroundColor: "#112233",
  items: [
    textItem,
    {
      id: "shadow-1",
      type: "gradient-shadow",
      x: 0,
      y: 0.5,
      width: 1,
      height: 0.5,
      zIndex: 1,
      color: "#000000",
      opacity: 70,
      direction: "up",
    },
  ],
}

describe("carousel slide export", () => {
  it("escapes text before adding it to the SVG", () => {
    const svg = carouselSlideSvg(slide, "4:5")

    expect(svg).toContain("Safe &lt;words&gt; &amp; symbols")
    expect(svg).not.toContain("Safe <words>")
  })

  it("renders the chosen format with the bundled font", () => {
    const png = renderCarouselSlidePng(slide, "4:5")

    expect([...png.slice(0, 8)]).toEqual([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ])
    expect(new DataView(png.buffer).getUint32(16)).toBe(1080)
    expect(new DataView(png.buffer).getUint32(20)).toBe(1350)
  })

  it("draws each face with its own font file", () => {
    // The same words in every face. If a family name in an SVG did not match
    // its ttf, that render would silently fall back to Inter and come out
    // pixel-identical to Inter's — so every render must be different.
    const renders = TEXT_FONTS.map((font) => {
      const oneFace = {
        ...slide,
        items: [{ ...textItem, fontId: font.id }],
      }
      expect(carouselSlideSvg(oneFace, "1:1")).toContain(
        `font-family="${font.svgFamily}"`
      )
      return renderCarouselSlidePng(oneFace, "1:1").join(",")
    })
    expect(new Set(renders).size).toBe(TEXT_FONTS.length)
  })
})
