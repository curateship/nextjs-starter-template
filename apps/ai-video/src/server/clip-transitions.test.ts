import assert from "node:assert/strict"
import { describe, it } from "node:test"

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
} from "../lib/clip-transitions.ts"

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
    assert.equal(isTransitionableKind("video"), true)
    assert.equal(isTransitionableKind("image"), true)
    assert.equal(isTransitionableKind("audio"), false)
    assert.equal(isTransitionableKind("text"), false)
  })
})

describe("clampTransitionMs", () => {
  it("clamps to the shorter neighbour", () => {
    // 900ms requested but the incoming clip is only 400ms long.
    assert.equal(clampTransitionMs(900, 5000, 400), 400)
  })
  it("respects the min and max bounds", () => {
    assert.equal(clampTransitionMs(10, 5000, 5000), MIN_TRANSITION_MS)
    assert.equal(clampTransitionMs(99999, 5000, 5000), MAX_TRANSITION_MS)
  })
  it("returns 0 when a clip has no length", () => {
    assert.equal(clampTransitionMs(DEFAULT_TRANSITION_MS, 0, 1000), 0)
    assert.equal(clampTransitionMs(DEFAULT_TRANSITION_MS, 1000, 0), 0)
  })
})

describe("precedingClipOnTrack", () => {
  it("finds the clip with the largest start earlier than this one", () => {
    const a = clip({ id: "a", startMs: 0, durationMs: 1000 })
    const b = clip({ id: "b", startMs: 1000, durationMs: 1000 })
    const c = clip({ id: "c", startMs: 2000, durationMs: 1000 })
    assert.equal(precedingClipOnTrack([a, b, c], c)?.id, "b")
    assert.equal(precedingClipOnTrack([a, b, c], a), null)
  })
})

describe("resolveIncomingTransition", () => {
  const prev = clip({ id: "a", startMs: 0, durationMs: 2000 })
  const withTransition = (over: Parameters<typeof clip>[0]) =>
    clip({ transition: { kind: "crossfade", durationMs: 500 }, ...over })

  it("returns null without a transition descriptor", () => {
    const b = clip({ id: "b", startMs: 2000, durationMs: 2000 })
    assert.equal(resolveIncomingTransition(b, prev), null)
  })

  it("resolves a clamped transition for adjacent visual clips", () => {
    const b = withTransition({ id: "b", startMs: 2000, durationMs: 2000 })
    assert.deepEqual(resolveIncomingTransition(b, prev), {
      kind: "crossfade",
      durationMs: 500,
    })
  })

  it("returns null when there is a real gap before the clip", () => {
    // Butts at 2000; a start of 2100 leaves a 100ms gap > tolerance.
    const b = withTransition({ id: "b", startMs: 2100, durationMs: 2000 })
    assert.equal(resolveIncomingTransition(b, prev), null)
  })

  it("returns null when either side is not visual", () => {
    const audioPrev = clip({
      id: "a",
      kind: "audio",
      startMs: 0,
      durationMs: 2000,
    })
    const b = withTransition({ id: "b", startMs: 2000, durationMs: 2000 })
    assert.equal(resolveIncomingTransition(b, audioPrev), null)

    const textIn = withTransition({
      id: "b",
      kind: "text",
      startMs: 2000,
      durationMs: 2000,
    })
    assert.equal(resolveIncomingTransition(textIn, prev), null)
  })

  it("returns null when there is no preceding clip", () => {
    const b = withTransition({ id: "b", startMs: 2000, durationMs: 2000 })
    assert.equal(resolveIncomingTransition(b, null), null)
  })

  it("clamps to the shorter neighbour at the seam", () => {
    const shortPrev = clip({ id: "a", startMs: 0, durationMs: 300 })
    const b = clip({
      id: "b",
      startMs: 300,
      durationMs: 5000,
      transition: { kind: "dip", durationMs: 2000 },
    })
    assert.deepEqual(resolveIncomingTransition(b, shortPrev), {
      kind: "dip",
      durationMs: 300,
    })
  })
})

describe("transitionReachState", () => {
  const seam = 2000
  const dur = 500

  it("crossfade ramps opacity 0->1 across the reach-back", () => {
    assert.deepEqual(transitionReachState("crossfade", seam, dur, seam - dur), {
      opacity: 0,
      translateXPct: 0,
    })
    assert.deepEqual(
      transitionReachState("crossfade", seam, dur, seam - dur / 2),
      { opacity: 0.5, translateXPct: 0 }
    )
  })

  it("slide travels in from the right at full opacity", () => {
    const start = transitionReachState("slide", seam, dur, seam - dur)
    assert.equal(start.opacity, 1)
    assert.equal(start.translateXPct, 100)
    const mid = transitionReachState("slide", seam, dur, seam - dur / 2)
    assert.equal(mid.translateXPct, 50)
  })

  it("settles to the resting look at and after the seam", () => {
    assert.deepEqual(transitionReachState("crossfade", seam, dur, seam), {
      opacity: 1,
      translateXPct: 0,
    })
    assert.deepEqual(transitionReachState("slide", seam, dur, seam + 100), {
      opacity: 1,
      translateXPct: 0,
    })
  })
})

describe("dipOpacityAt", () => {
  it("peaks at full black on the seam and is clear at the edges", () => {
    const seam = 2000
    const dur = 400 // half = 200
    assert.equal(dipOpacityAt(seam, dur, seam), 1)
    assert.equal(dipOpacityAt(seam, dur, seam - 100), 0.5)
    assert.equal(dipOpacityAt(seam, dur, seam + 100), 0.5)
    assert.equal(dipOpacityAt(seam, dur, seam - 200), 0)
    assert.equal(dipOpacityAt(seam, dur, seam + 500), 0)
  })
})
