import { describe, expect, it } from "vitest"

import {
  boundingBox,
  snapMove,
  snapResize,
  snapThreshold,
} from "@/lib/video/carousel-snap"

const PULL = 0.01

describe("snapMove", () => {
  it("lands a box dragged near the middle exactly on the slide's centre", () => {
    const result = snapMove({
      box: { x: 0.296, y: 0.3, width: 0.4, height: 0.2 },
      others: [],
      thresholdX: PULL,
      thresholdY: PULL,
    })
    expect(result.box.x).toBeCloseTo(0.3, 10)
    expect(result.lines).toContainEqual({ axis: "x", at: 0.5 })
  })

  it("leaves a box alone when nothing is within the pull", () => {
    const box = { x: 0.2, y: 0.33, width: 0.2, height: 0.2 }
    const result = snapMove({
      box,
      others: [],
      thresholdX: PULL,
      thresholdY: PULL,
    })
    expect(result.box).toEqual(box)
    expect(result.lines).toEqual([])
  })

  it("snaps a box's left edge to another layer's right edge", () => {
    const result = snapMove({
      box: { x: 0.505, y: 0.6, width: 0.1, height: 0.1 },
      others: [{ x: 0.1, y: 0.1, width: 0.4, height: 0.1 }],
      thresholdX: PULL,
      thresholdY: 0,
    })
    expect(result.box.x).toBeCloseTo(0.5, 10)
  })

  it("spaces a box evenly between two neighbours", () => {
    // Two cards with a gap of 0.4 between them; a card 0.2 wide fits with
    // 0.1 on each side.
    const result = snapMove({
      box: { x: 0.405, y: 0.4, width: 0.2, height: 0.2 },
      others: [
        { x: 0.0, y: 0.4, width: 0.3, height: 0.2 },
        { x: 0.7, y: 0.4, width: 0.3, height: 0.2 },
      ],
      thresholdX: PULL,
      thresholdY: 0,
    })
    expect(result.box.x).toBeCloseTo(0.4, 10)
    expect(result.gaps).toHaveLength(2)
    const [first, second] = result.gaps
    expect(first.to - first.from).toBeCloseTo(second.to - second.from, 10)
  })

  it("puts a third box at the same gap after a pair", () => {
    const result = snapMove({
      box: { x: 0.693, y: 0.1, width: 0.2, height: 0.2 },
      others: [
        { x: 0.0, y: 0.1, width: 0.2, height: 0.2 },
        { x: 0.35, y: 0.1, width: 0.2, height: 0.2 },
      ],
      thresholdX: PULL,
      thresholdY: 0,
    })
    expect(result.box.x).toBeCloseTo(0.7, 10)
  })

  it("does nothing when snapping is off, as Alt asks", () => {
    const box = { x: 0.296, y: 0.296, width: 0.4, height: 0.4 }
    const result = snapMove({ box, others: [], thresholdX: 0, thresholdY: 0 })
    expect(result.box).toEqual(box)
  })
})

describe("snapResize", () => {
  it("moves only the dragged side and keeps the opposite one put", () => {
    const result = snapResize({
      box: { x: 0.2, y: 0.2, width: 0.3, height: 0.3 },
      handle: "w",
      dx: -0.1,
      dy: 0.5,
      others: [],
      thresholdX: 0,
      thresholdY: 0,
      minSize: 0.06,
    })
    expect(result.box.x).toBeCloseTo(0.1, 10)
    expect(result.box.x + result.box.width).toBeCloseTo(0.5, 10)
    expect(result.box.y).toBe(0.2)
    expect(result.box.height).toBe(0.3)
  })

  it("resizes from a top corner without passing the slide's edge", () => {
    const result = snapResize({
      box: { x: 0.2, y: 0.2, width: 0.3, height: 0.3 },
      handle: "ne",
      dx: 0.9,
      dy: -0.9,
      others: [],
      thresholdX: 0,
      thresholdY: 0,
      minSize: 0.06,
    })
    expect(result.box).toEqual({ x: 0.2, y: 0, width: 0.8, height: 0.5 })
  })

  it("never shrinks a box under the smallest size", () => {
    const result = snapResize({
      box: { x: 0.2, y: 0.2, width: 0.3, height: 0.3 },
      handle: "e",
      dx: -0.9,
      dy: 0,
      others: [],
      thresholdX: 0,
      thresholdY: 0,
      minSize: 0.06,
    })
    expect(result.box.width).toBeCloseTo(0.06, 10)
  })

  it("snaps the dragged edge to the slide's centre", () => {
    const result = snapResize({
      box: { x: 0.1, y: 0.1, width: 0.3, height: 0.3 },
      handle: "e",
      dx: 0.095,
      dy: 0,
      others: [],
      thresholdX: PULL,
      thresholdY: PULL,
      minSize: 0.06,
    })
    expect(result.box.x + result.box.width).toBeCloseTo(0.5, 10)
    expect(result.lines).toEqual([{ axis: "x", at: 0.5 }])
  })
})

describe("helpers", () => {
  it("holds every box in one bounding box", () => {
    expect(
      boundingBox([
        { x: 0.1, y: 0.2, width: 0.2, height: 0.2 },
        { x: 0.5, y: 0.1, width: 0.1, height: 0.5 },
      ])
    ).toEqual({ x: 0.1, y: 0.1, width: 0.5, height: 0.5 })
  })

  it("pulls the same number of screen pixels at any zoom", () => {
    expect(snapThreshold(600)).toBeCloseTo(6 / 600, 10)
    expect(snapThreshold(0)).toBe(0)
  })
})
