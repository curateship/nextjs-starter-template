import { describe, expect, it } from "vitest"

import {
  clipColour,
  colourEqFilter,
  colourMatrix,
  isColourTouched,
  UNTOUCHED_COLOUR,
} from "./clip-colour"

// What the preview's matrix does to one red, green, blue pixel from 0 to 255.
function applyMatrix(matrix: number[], rgb: [number, number, number]) {
  return [0, 1, 2].map((row) => {
    const [r, g, b, , constant] = matrix.slice(row * 5, row * 5 + 5)
    const value =
      r * (rgb[0] / 255) + g * (rgb[1] / 255) + b * (rgb[2] / 255) + constant
    return Math.min(255, Math.max(0, value * 255))
  })
}

describe("clipColour", () => {
  it("reads a clip with nothing set as untouched", () => {
    expect(clipColour({})).toEqual(UNTOUCHED_COLOUR)
    expect(isColourTouched(clipColour({}))).toBe(false)
  })

  it("reads any one setting as touched", () => {
    expect(isColourTouched(clipColour({ saturation: 0 }))).toBe(true)
  })
})

describe("colourEqFilter", () => {
  it("adds no filter at all for a clip left alone", () => {
    expect(colourEqFilter(UNTOUCHED_COLOUR)).toBeNull()
  })

  it("nudges brightness so eq lands on the hundredth asked for", () => {
    expect(
      colourEqFilter({ brightness: -0.2, contrast: 0.7, saturation: 1.3 })
    ).toBe("eq=brightness=-0.199999:contrast=0.7:saturation=1.3")
  })
})

describe("colourMatrix", () => {
  it("leaves every pixel alone when nothing is set", () => {
    expect(colourMatrix(UNTOUCHED_COLOUR)).toEqual([
      1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0,
    ])
  })

  // ffmpeg's eq at brightness 0.1 lifted the pixel 64, 128, 192 to 93, 157,
  // 222: 25 luma levels, which is 29 on each channel.
  it("lifts a pixel by what eq was measured lifting it", () => {
    const lifted = applyMatrix(
      colourMatrix({ brightness: 0.1, contrast: 1, saturation: 1 }),
      [64, 128, 192]
    )
    expect(lifted.map(Math.round)).toEqual([93, 157, 221])
  })

  it("turns every colour grey at saturation 0 without moving its light", () => {
    const grey = applyMatrix(
      colourMatrix({ brightness: 0, contrast: 1, saturation: 0 }),
      [200, 40, 40]
    )
    expect(Math.max(...grey) - Math.min(...grey)).toBeLessThan(4)
    const light = 0.299 * 200 + 0.587 * 40 + 0.114 * 40
    expect(Math.abs(grey[1] - light)).toBeLessThan(3)
  })

  it("spreads light and dark apart around the middle with contrast", () => {
    const matrix = colourMatrix({ brightness: 0, contrast: 1.5, saturation: 1 })
    const [dark] = applyMatrix(matrix, [60, 60, 60])
    const [light] = applyMatrix(matrix, [190, 190, 190])
    expect(dark).toBeLessThan(60)
    expect(light).toBeGreaterThan(190)
  })

  it("never touches alpha", () => {
    expect(
      colourMatrix({ brightness: 0.3, contrast: 1.8, saturation: 0.2 }).slice(
        15
      )
    ).toEqual([0, 0, 0, 1, 0])
  })
})
