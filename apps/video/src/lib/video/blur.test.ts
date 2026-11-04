import { describe, expect, it } from "vitest"

import {
  blurBoxAt,
  blurExpressions,
  blurFollowMoments,
  blurSigma,
  blurStrength,
  cleanBlurTrack,
  MAX_BLUR_TRACK_POINTS,
  trackCentreAt,
} from "./blur"
import { requireCanonicalTimeline } from "./timeline-schema"

const placed = { kind: "shape", shape: "blur", x: 0.6, y: 0.5, toX: 0.2, toY: 0.3 }

describe("a blur's box", () => {
  it("spans its two points whichever corner each is", () => {
    const box = blurBoxAt(placed, 0)
    expect(box.left).toBeCloseTo(0.2)
    expect(box.top).toBeCloseTo(0.3)
    expect(box.width).toBeCloseTo(0.4)
    expect(box.height).toBeCloseTo(0.2)
  })

  it("moves its middle onto the followed place and keeps its size", () => {
    const followed = {
      ...placed,
      blurTrack: [
        { atMs: 0, x: 0.3, y: 0.5 },
        { atMs: 1_000, x: 0.7, y: 0.5 },
      ],
    }
    const halfway = blurBoxAt(followed, 500)
    expect(halfway.left + halfway.width / 2).toBeCloseTo(0.5)
    expect(halfway.width).toBeCloseTo(0.4)
  })

  it("stays whole inside the frame when the place is near an edge", () => {
    const box = blurBoxAt({ ...placed, blurTrack: [{ atMs: 0, x: 0.99, y: 0.01 }] }, 0)
    expect(box.left + box.width).toBeCloseTo(1)
    expect(box.top).toBe(0)
  })
})

describe("following", () => {
  const track = [
    { atMs: 0, x: 0, y: 0 },
    { atMs: 500, x: 1, y: 0.5 },
  ]

  it("goes in a straight line between places and holds past either end", () => {
    expect(trackCentreAt(track, 250)).toEqual({ x: 0.5, y: 0.25 })
    expect(trackCentreAt(track, -10)).toEqual({ x: 0, y: 0 })
    expect(trackCentreAt(track, 9_000)).toEqual({ x: 1, y: 0.5 })
    expect(trackCentreAt(undefined, 100)).toBeNull()
  })

  it("tidies what a model sent back before it is kept", () => {
    const tidy = cleanBlurTrack(
      [
        { atMs: 1_000, x: 1.4, y: 0.2 },
        { atMs: 500, x: 0.5, y: -1 },
        { atMs: 500, x: 0.1, y: 0.1 },
        { atMs: 5_000, x: 0.5, y: 0.5 },
        { atMs: Number.NaN, x: 0.5, y: 0.5 },
      ],
      2_000
    )
    expect(tidy).toEqual([
      { atMs: 500, x: 0.5, y: 0 },
      { atMs: 1_000, x: 1, y: 0.2 },
    ])
  })

  it("looks every half second, and no more than the cap", () => {
    expect(blurFollowMoments(1_200)).toEqual([0, 500, 1_000])
    expect(blurFollowMoments(10 * 60_000)).toHaveLength(MAX_BLUR_TRACK_POINTS)
  })
})

describe("the export's numbers", () => {
  const frame = { width: 1080, height: 1920 }

  it("counts strength on a 1080 short side", () => {
    expect(blurSigma({ blurStrength: 20 }, frame)).toBe(20)
    expect(blurSigma({ blurStrength: 20 }, { width: 540, height: 960 })).toBe(10)
    expect(blurStrength({ blurStrength: 999 })).toBe(60)
    expect(blurStrength({})).toBe(20)
  })

  it("gives a still blur plain numbers and an even size", () => {
    const box = blurExpressions({ ...placed, durationMs: 1_000 }, frame, 2)
    expect(box).toEqual({ width: 432, height: 384, x: "216", y: "576" })
  })

  it("gives a followed blur expressions of the film's time", () => {
    const box = blurExpressions(
      {
        ...placed,
        durationMs: 1_000,
        blurTrack: [
          { atMs: 0, x: 0.4, y: 0.4 },
          { atMs: 1_000, x: 0.6, y: 0.4 },
        ],
      },
      frame,
      2
    )
    expect(box.x).toBe("if(lt(t,3.000),216+(216)*clip((t-2.000)/1.000,0,1),432)")
  })
})

describe("saving a blur", () => {
  const timeline = (extra: Record<string, unknown>) => ({
    aspect: "9:16",
    tracks: [
      {
        id: "t",
        muted: false,
        clips: [{ id: "b", name: "Blur", kind: "shape", shape: "blur", startMs: 0, durationMs: 1_000, trimStartMs: 0, ...extra }],
      },
    ],
  })

  it("keeps its shape, strength and places", () => {
    const saved = requireCanonicalTimeline(
      timeline({ blurShape: "oval", blurStrength: 30, blurTrack: [{ atMs: 0, x: 0.5, y: 0.5 }] })
    )
    expect(saved.tracks[0].clips[0].blurShape).toBe("oval")
  })

  it("refuses a strength past the slider", () => {
    expect(() => requireCanonicalTimeline(timeline({ blurStrength: 61 }))).toThrow()
  })
})
