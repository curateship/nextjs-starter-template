import { describe, expect, it } from "vitest"

import {
  CLIP_MOTIONS,
  clipMotion,
  motionFilter,
  motionPoseAt,
  motionTransformCss,
} from "./clip-motion"

describe("clipMotion", () => {
  it("reads a picture with nothing set as still", () => {
    expect(clipMotion({ kind: "image" })).toBeNull()
  })

  it("reads a picture's move", () => {
    expect(clipMotion({ kind: "image", motion: "drift-left" })).toBe(
      "drift-left"
    )
  })

  it("never moves anything but a picture", () => {
    expect(clipMotion({ kind: "video", motion: "push-in" })).toBeNull()
    expect(clipMotion({ kind: "text", motion: "push-in" })).toBeNull()
  })

  it("reads a move it does not know as still", () => {
    expect(clipMotion({ kind: "image", motion: "spin" })).toBeNull()
  })
})

describe("motionPoseAt", () => {
  it("starts a push in at the frame's own size and ends 1.1x", () => {
    expect(motionPoseAt("push-in", 0, 4000)).toEqual({ scale: 1, shiftX: 0 })
    expect(motionPoseAt("push-in", 2000, 4000).scale).toBeCloseTo(1.05)
    expect(motionPoseAt("push-in", 4000, 4000).scale).toBeCloseTo(1.1)
  })

  it("moves at an even speed", () => {
    const steps = [0, 1000, 2000, 3000, 4000].map(
      (ms) => motionPoseAt("drift-right", ms, 4000).shiftX
    )
    const gaps = steps.slice(1).map((value, index) => value - steps[index])
    for (const gap of gaps) expect(gap).toBeCloseTo(gaps[0])
  })

  it("holds the first pose before the clip starts and the last after", () => {
    expect(motionPoseAt("pull-out", -500, 4000)).toEqual(
      motionPoseAt("pull-out", 0, 4000)
    )
    expect(motionPoseAt("pull-out", 9000, 4000)).toEqual(
      motionPoseAt("pull-out", 4000, 4000)
    )
  })

  it("holds the first pose on a clip with no length", () => {
    expect(motionPoseAt("push-in", 0, 0)).toEqual({ scale: 1, shiftX: 0 })
  })

  it("never lets the edge of the picture into the frame", () => {
    for (const motion of CLIP_MOTIONS) {
      for (let ms = 0; ms <= 4000; ms += 100) {
        const { scale, shiftX } = motionPoseAt(motion, ms, 4000)
        expect(scale).toBeGreaterThanOrEqual(1)
        expect(Math.abs(shiftX)).toBeLessThanOrEqual((scale - 1) / 2 + 1e-9)
      }
    }
  })
})

describe("motionTransformCss", () => {
  it("shifts by a share of the frame and scales about its middle", () => {
    expect(motionTransformCss({ scale: 1.1, shiftX: -0.04 })).toBe(
      "translateX(-4%) scale(1.1)"
    )
  })
})

describe("motionFilter", () => {
  it("pads to the frame and redraws each frame from a moving rectangle", () => {
    expect(motionFilter("push-in", 1080, 1920, 120)).toBe(
      "format=rgba," +
        "pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=black@0," +
        "perspective=" +
        "x0='W*(0.5-(0.5+(0))/(1+(0.1)*min(1,in/120)))':" +
        "y0='H*(0.5-0.5/(1+(0.1)*min(1,in/120)))':" +
        "x1='W*(0.5+(0.5-(0))/(1+(0.1)*min(1,in/120)))':" +
        "y1='H*(0.5-0.5/(1+(0.1)*min(1,in/120)))':" +
        "x2='W*(0.5-(0.5+(0))/(1+(0.1)*min(1,in/120)))':" +
        "y2='H*(0.5+0.5/(1+(0.1)*min(1,in/120)))':" +
        "x3='W*(0.5+(0.5-(0))/(1+(0.1)*min(1,in/120)))':" +
        "y3='H*(0.5+0.5/(1+(0.1)*min(1,in/120)))':" +
        "interpolation=cubic:eval=frame"
    )
  })
})
