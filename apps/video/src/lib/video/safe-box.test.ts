import { describe, expect, it } from "vitest"

import {
  DEFAULT_SAFE_BOXES,
  placeInSafeBox,
  readSafeBoxes,
  SAFE_BOX_TOO_NARROW_MESSAGE,
  safeBoxesSchema,
  safeBoxProblem,
} from "./safe-box"

const caption = {
  text: "Said out loud",
  fontId: "inter" as const,
  fontSize: 64,
  boxed: false,
  strokeWidth: 0,
  y: 0.78,
}

describe("safe boxes", () => {
  it("starts from numbers its own check accepts", () => {
    expect(safeBoxesSchema.safeParse(DEFAULT_SAFE_BOXES).success).toBe(true)
    expect(readSafeBoxes(null)).toEqual(DEFAULT_SAFE_BOXES)
  })

  it("refuses a box that leaves no room across, in words", () => {
    expect(safeBoxProblem({ top: 0, bottom: 0, left: 400, right: 400 })).toBe(
      SAFE_BOX_TOO_NARROW_MESSAGE
    )
    expect(safeBoxProblem({ top: 0, bottom: 0, left: 0, right: 900 })).toBe(
      SAFE_BOX_TOO_NARROW_MESSAGE
    )
    expect(safeBoxProblem({ top: 0, bottom: 0, left: -1, right: 0 })).toBe(
      "Each number is whole pixels, from 0 up"
    )
    expect(safeBoxProblem(DEFAULT_SAFE_BOXES.reels)).toBeNull()
  })

  it("puts a caption too tall for the box in the box's middle", () => {
    const tall = { ...caption, text: Array(40).fill("word").join(" "), fontSize: 140 }
    const place = placeInSafeBox(tall, { top: 700, bottom: 700, left: 0, right: 0 })
    expect(place.y).toBe(0.5)
  })

  it("keeps the top edge below a box's top", () => {
    const place = placeInSafeBox({ ...caption, y: 0.05 }, DEFAULT_SAFE_BOXES.reels)
    const halfHeight = (64 * 1.15) / 2 / 1080
    expect(place.y - halfHeight).toBeGreaterThanOrEqual(269 / 1920 - 0.0001)
  })
})
