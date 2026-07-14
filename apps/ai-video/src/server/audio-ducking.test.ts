import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  computeDuckEnvelope,
  dbToGain,
  duckEnvelopeToVolumeExpr,
  mergeIntervals,
  sampleEnvelope,
  type GainKeyframe,
} from "../lib/audio-ducking.ts"

const DUCK = 0.25 // stand-in ducked level for readable assertions
const FADE_IN = 150
const FADE_OUT = 300

function envelope(voiceIntervals: { startMs: number; endMs: number }[], durationMs = 60_000) {
  return computeDuckEnvelope({
    voiceIntervals,
    durationMs,
    duckGain: DUCK,
    fadeInMs: FADE_IN,
    fadeOutMs: FADE_OUT,
  })
}

function times(keyframes: GainKeyframe[]) {
  return keyframes.map((k) => k.tMs)
}

describe("dbToGain", () => {
  it("maps 0 dB to unity and −12 dB to ~0.251", () => {
    assert.equal(dbToGain(0), 1)
    assert.ok(Math.abs(dbToGain(-12) - 0.2512) < 0.001)
    assert.ok(dbToGain(-6) < 1 && dbToGain(-6) > dbToGain(-12))
  })
})

describe("mergeIntervals", () => {
  it("drops empty intervals and sorts", () => {
    assert.deepEqual(mergeIntervals([{ startMs: 10, endMs: 10 }]), [])
    assert.deepEqual(
      mergeIntervals([
        { startMs: 500, endMs: 800 },
        { startMs: 0, endMs: 100 },
      ]),
      [
        { startMs: 0, endMs: 100 },
        { startMs: 500, endMs: 800 },
      ]
    )
  })

  it("merges overlapping and exactly-touching intervals", () => {
    assert.deepEqual(
      mergeIntervals([
        { startMs: 0, endMs: 1000 },
        { startMs: 800, endMs: 1500 }, // overlaps
        { startMs: 1500, endMs: 2000 }, // touches
      ]),
      [{ startMs: 0, endMs: 2000 }]
    )
  })
})

describe("computeDuckEnvelope", () => {
  it("returns no keyframes when there is no voice (track stays at full volume)", () => {
    assert.deepEqual(envelope([]), [])
  })

  it("builds a down-ramp, hold, and up-ramp around a single voice clip", () => {
    const keys = envelope([{ startMs: 10_000, endMs: 12_000 }])
    assert.deepEqual(keys, [
      { tMs: 9_850, gain: 1 }, // start fading down 150ms before
      { tMs: 10_000, gain: DUCK }, // ducked at voice start
      { tMs: 12_000, gain: DUCK }, // held through voice
      { tMs: 12_300, gain: 1 }, // restored 300ms after
    ])
  })

  it("keeps two well-separated clips as independent dips", () => {
    const keys = envelope([
      { startMs: 5_000, endMs: 6_000 },
      { startMs: 20_000, endMs: 21_000 },
    ])
    // Two full down/up cycles; times strictly increasing.
    assert.equal(keys.length, 8)
    assert.deepEqual(times(keys), [4_850, 5_000, 6_000, 6_300, 19_850, 20_000, 21_000, 21_300])
    for (let i = 1; i < keys.length; i++) assert.ok(keys[i].tMs > keys[i - 1].tMs)
  })

  it("stays ducked across a gap too small to ramp back up and down", () => {
    // 200ms gap < fadeOut(300)+fadeIn(150), so it must not pop back to full.
    const keys = envelope([
      { startMs: 5_000, endMs: 6_000 },
      { startMs: 6_200, endMs: 7_000 },
    ])
    assert.deepEqual(keys, [
      { tMs: 4_850, gain: 1 },
      { tMs: 5_000, gain: DUCK },
      { tMs: 7_000, gain: DUCK }, // held straight across the gap
      { tMs: 7_300, gain: 1 },
    ])
  })

  it("merges overlapping voice clips before building the envelope", () => {
    const keys = envelope([
      { startMs: 5_000, endMs: 6_000 },
      { startMs: 5_500, endMs: 8_000 },
    ])
    assert.deepEqual(keys, [
      { tMs: 4_850, gain: 1 },
      { tMs: 5_000, gain: DUCK },
      { tMs: 8_000, gain: DUCK },
      { tMs: 8_300, gain: 1 },
    ])
  })

  it("shortens the pre-roll fade when a clip starts near the beginning", () => {
    const keys = envelope([{ startMs: 100, endMs: 2_000 }])
    // start-fadeIn = -50 clamps to 0, so it's a 100ms down-ramp, not 150ms.
    assert.deepEqual(keys[0], { tMs: 0, gain: 1 })
    assert.deepEqual(keys[1], { tMs: 100, gain: DUCK })
    assert.equal(keys.at(-1)?.tMs, 2_300)
  })

  it("starts already ducked when a clip begins exactly at t=0 (no pre-roll)", () => {
    const keys = envelope([{ startMs: 0, endMs: 2_000 }])
    // The full-volume pre-roll keyframe collapses onto t=0 and yields to duck.
    assert.deepEqual(keys[0], { tMs: 0, gain: DUCK })
    assert.deepEqual(keys.at(-1), { tMs: 2_300, gain: 1 })
  })

  it("clamps the tail fade to the timeline duration", () => {
    const keys = envelope([{ startMs: 1_000, endMs: 2_000 }], 2_100)
    assert.equal(keys.at(-1)?.tMs, 2_100) // 2_300 clamped to duration
  })
})

describe("sampleEnvelope", () => {
  const keys = envelope([{ startMs: 10_000, endMs: 12_000 }])
  // keyframes: (9_850,1) (10_000,DUCK) (12_000,DUCK) (12_300,1)

  it("holds full volume before and after the envelope", () => {
    assert.equal(sampleEnvelope(keys, 0), 1)
    assert.equal(sampleEnvelope(keys, 9_850), 1)
    assert.equal(sampleEnvelope(keys, 20_000), 1)
  })

  it("is fully ducked through the voice region", () => {
    assert.equal(sampleEnvelope(keys, 10_000), DUCK)
    assert.equal(sampleEnvelope(keys, 11_000), DUCK)
    assert.equal(sampleEnvelope(keys, 12_000), DUCK)
  })

  it("interpolates linearly on the fade ramps", () => {
    // Halfway down the 150ms pre-roll ramp.
    assert.ok(Math.abs(sampleEnvelope(keys, 9_925) - (1 + DUCK) / 2) < 1e-9)
    // Halfway up the 300ms tail ramp.
    assert.ok(Math.abs(sampleEnvelope(keys, 12_150) - (DUCK + 1) / 2) < 1e-9)
  })

  it("returns full gain for an empty envelope", () => {
    assert.equal(sampleEnvelope([], 1_234), 1)
  })
})

describe("duckEnvelopeToVolumeExpr", () => {
  it("returns constant 1 for an empty envelope", () => {
    assert.equal(duckEnvelopeToVolumeExpr([]), "1")
  })

  it("emits a t-based nested-if expression referencing the boundary gains", () => {
    const keys = envelope([{ startMs: 10_000, endMs: 12_000 }])
    const expr = duckEnvelopeToVolumeExpr(keys)
    assert.match(expr, /^if\(lt\(t,/) // nested-if in terms of t
    assert.ok(expr.includes("0.25")) // the ducked gain appears
    assert.ok(expr.includes("9.85")) // pre-roll start (seconds)
  })
})
