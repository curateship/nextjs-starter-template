import { describe, expect, it } from "vitest"

import {
  clampTransitionMs,
  dipOpacityAt,
  DEFAULT_TRANSITION_MS,
  isTransitionableKind,
  MAX_TRANSITION_MS,
  MIN_TRANSITION_MS,
  precedingClipOnTrack,
  resolveIncomingTransition,
  transitionReachState,
} from "./clip-transitions"

function clip(over: {
  id: string
  kind?: string
  startMs: number
  durationMs: number
  transition?: { kind: "crossfade" | "dip" | "slide"; durationMs: number }
}) {
  return { kind: "video", ...over }
}

describe("isTransitionableKind", () => {
  it("accepts only visual media", () => {
    expect(isTransitionableKind("video")).toBe(true)
    expect(isTransitionableKind("image")).toBe(true)
    expect(isTransitionableKind("audio")).toBe(false)
    expect(isTransitionableKind("text")).toBe(false)
  })
})

describe("clampTransitionMs", () => {
  it("clamps to the shorter neighbour", () => {
    // 900ms requested but the incoming clip is only 400ms long.
    expect(clampTransitionMs(900, 5000, 400)).toBe(400)
  })

  it("respects the min and max bounds", () => {
    expect(clampTransitionMs(10, 5000, 5000)).toBe(MIN_TRANSITION_MS)
    expect(clampTransitionMs(99999, 5000, 5000)).toBe(MAX_TRANSITION_MS)
  })

  it("returns 0 when a clip has no length", () => {
    expect(clampTransitionMs(DEFAULT_TRANSITION_MS, 0, 1000)).toBe(0)
    expect(clampTransitionMs(DEFAULT_TRANSITION_MS, 1000, 0)).toBe(0)
  })
})

describe("precedingClipOnTrack", () => {
  it("finds the clip with the largest start earlier than this one", () => {
    const a = clip({ id: "a", startMs: 0, durationMs: 1000 })
    const b = clip({ id: "b", startMs: 1000, durationMs: 1000 })
    const c = clip({ id: "c", startMs: 2000, durationMs: 1000 })
    expect(precedingClipOnTrack([a, b, c], c)?.id).toBe("b")
    expect(precedingClipOnTrack([a, b, c], a)).toBeNull()
  })
})

describe("resolveIncomingTransition", () => {
  const prev = clip({ id: "a", startMs: 0, durationMs: 2000 })
  const withTransition = (over: Parameters<typeof clip>[0]) =>
    clip({ transition: { kind: "crossfade", durationMs: 500 }, ...over })

  it("returns null without a transition descriptor", () => {
    const b = clip({ id: "b", startMs: 2000, durationMs: 2000 })
    expect(resolveIncomingTransition(b, prev)).toBeNull()
  })

  it("resolves a clamped transition for adjacent visual clips", () => {
    const b = withTransition({ id: "b", startMs: 2000, durationMs: 2000 })
    expect(resolveIncomingTransition(b, prev)).toEqual({
      kind: "crossfade",
      durationMs: 500,
    })
  })

  it("returns null when there is a real gap before the clip", () => {
    // Butts at 2000; a start of 2100 leaves a 100ms gap > tolerance.
    const b = withTransition({ id: "b", startMs: 2100, durationMs: 2000 })
    expect(resolveIncomingTransition(b, prev)).toBeNull()
  })

  it("returns null when either side is not visual", () => {
    const audioPrev = clip({
      id: "a",
      kind: "audio",
      startMs: 0,
      durationMs: 2000,
    })
    const b = withTransition({ id: "b", startMs: 2000, durationMs: 2000 })
    expect(resolveIncomingTransition(b, audioPrev)).toBeNull()

    const textIn = withTransition({
      id: "b",
      kind: "text",
      startMs: 2000,
      durationMs: 2000,
    })
    expect(resolveIncomingTransition(textIn, prev)).toBeNull()
  })

  it("returns null when there is no preceding clip", () => {
    const b = withTransition({ id: "b", startMs: 2000, durationMs: 2000 })
    expect(resolveIncomingTransition(b, null)).toBeNull()
  })

  it("clamps to the shorter neighbour at the seam", () => {
    const shortPrev = clip({ id: "a", startMs: 0, durationMs: 300 })
    const b = clip({
      id: "b",
      startMs: 300,
      durationMs: 5000,
      transition: { kind: "dip", durationMs: 2000 },
    })
    expect(resolveIncomingTransition(b, shortPrev)).toEqual({
      kind: "dip",
      durationMs: 300,
    })
  })
})

describe("transitionReachState", () => {
  const seam = 2000
  const dur = 500

  it("crossfade ramps opacity 0->1 across the reach-back", () => {
    expect(transitionReachState("crossfade", seam, dur, seam - dur)).toEqual({
      opacity: 0,
      translateXPct: 0,
    })
    expect(
      transitionReachState("crossfade", seam, dur, seam - dur / 2)
    ).toEqual({ opacity: 0.5, translateXPct: 0 })
  })

  it("slide travels in from the right at full opacity", () => {
    const start = transitionReachState("slide", seam, dur, seam - dur)
    expect(start.opacity).toBe(1)
    expect(start.translateXPct).toBe(100)
    const mid = transitionReachState("slide", seam, dur, seam - dur / 2)
    expect(mid.translateXPct).toBe(50)
  })

  it("settles to the resting look at and after the seam", () => {
    expect(transitionReachState("crossfade", seam, dur, seam)).toEqual({
      opacity: 1,
      translateXPct: 0,
    })
    expect(transitionReachState("slide", seam, dur, seam + 100)).toEqual({
      opacity: 1,
      translateXPct: 0,
    })
  })
})

describe("dipOpacityAt", () => {
  it("peaks at full black on the seam and is clear at the edges", () => {
    const seam = 2000
    const dur = 400 // half = 200
    expect(dipOpacityAt(seam, dur, seam)).toBe(1)
    expect(dipOpacityAt(seam, dur, seam - 100)).toBe(0.5)
    expect(dipOpacityAt(seam, dur, seam + 100)).toBe(0.5)
    expect(dipOpacityAt(seam, dur, seam - 200)).toBe(0)
    expect(dipOpacityAt(seam, dur, seam + 500)).toBe(0)
  })
})
