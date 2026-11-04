import { describe, expect, it } from "vitest"

import {
  clipFrameBorder,
  clipFrameShape,
  frameShapeCss,
  frameMaskSvg,
  hasFrameShaping,
  shapedPictureSize,
  squareBox,
} from "@/lib/video/clip-frame-shape"

const corner = { kind: "video", scale: 0.3, x: 0.7, y: 0.75, fit: "cover" }

describe("a clip's shape", () => {
  it("is drawn only on a filled clip smaller than the frame", () => {
    expect(clipFrameShape({ ...corner, frameShape: "circle" })).toBe("circle")
    expect(clipFrameShape({ ...corner, fit: "contain", frameShape: "circle" })).toBe("rectangle")
    expect(clipFrameShape({ kind: "video", fit: "cover", frameShape: "circle" })).toBe("rectangle")
    expect(clipFrameShape({ ...corner, kind: "text", frameShape: "circle" })).toBe("rectangle")
  })

  it("has a border only with a thickness, and a white one when the colour is unreadable", () => {
    expect(clipFrameBorder(corner)).toBeNull()
    expect(clipFrameBorder({ ...corner, borderWidth: 8, borderColor: "red" })).toEqual({
      color: "#ffffff",
      width: 8,
    })
    expect(hasFrameShaping({ ...corner, borderWidth: 8 })).toBe(true)
    expect(hasFrameShaping(corner)).toBe(false)
  })
})

describe("making a circle round", () => {
  it("takes the biggest square the frame holds", () => {
    expect(squareBox(9 / 16)).toEqual({ boxWidth: 1, boxHeight: 0.563 })
    expect(squareBox(16 / 9)).toEqual({ boxWidth: 0.563, boxHeight: 1 })
  })
})

describe("the picture's size in the export", () => {
  it("is the box shrunk by the size, in even pixels, as the export's scale does", () => {
    expect(shapedPictureSize(corner, { width: 1080, height: 1920 })).toEqual({
      width: 324,
      height: 576,
    })
    expect(
      shapedPictureSize({ ...corner, ...squareBox(9 / 16) }, { width: 1080, height: 1920 })
    ).toEqual({ width: 324, height: 324 })
  })
})

describe("the preview's corners and border", () => {
  it("rounds a circle all the way and a rounded box by its corner share", () => {
    const stage = { width: 540, height: 960 }
    expect(frameShapeCss({ ...corner, frameShape: "circle" }, stage).borderRadius).toBe("50%")
    // 0.2 of the shorter side, 162 pixels of a 540 by 960 stage.
    expect(
      frameShapeCss({ ...corner, frameShape: "rounded", cornerRadius: 0.2 }, stage).borderRadius
    ).toBe("32.4px")
  })

  it("draws the border inside the edge, scaled to the stage", () => {
    const css = frameShapeCss({ ...corner, borderWidth: 20, borderColor: "#ff0000" }, {
      width: 540,
      height: 960,
    })
    expect(css.outline).toBe("10px solid #ff0000")
    expect(css.outlineOffset).toBe("-10px")
  })
})

describe("the export's mask", () => {
  it("is the picture's size with the shape in white", () => {
    const svg = frameMaskSvg({ ...corner, frameShape: "circle" }, 324, 324)
    expect(svg).toContain('width="324" height="324"')
    expect(svg).toContain('<ellipse cx="162" cy="162" rx="162" ry="162" fill="#ffffff"/>')
  })
})
