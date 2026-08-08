import { describe, expect, it } from "vitest"

import {
  computeDuckEnvelope,
  dbToGain,
  duckEnvelopeToVolumeExpr,
  mergeIntervals,
  sampleEnvelope,
  type GainKeyframe,
} from "./audio-ducking"

const DUCK = 0.25 // a round ducked level, so the numbers below read clearly
const FADE_IN = 150
const FADE_OUT = 300

function envelope(
  voiceIntervals: { startMs: number; endMs: number }[],
  durationMs = 60_000
) {
  return computeDuckEnvelope({
    voiceIntervals,
    durationMs,
    duckGain: DUCK,
    fadeInMs: FADE_IN,
    fadeOutMs: FADE_OUT,
  })
}

function times(keyframes: GainKeyframe[]) {
  return keyframes.map((keyframe) => keyframe.tMs)
}

describe("dbToGain", () => {
  it("maps 0 dB to full volume and −12 dB to about a quarter", () => {
    expect(dbToGain(0)).toBe(1)
    expect(Math.abs(dbToGain(-12) - 0.2512)).toBeLessThan(0.001)
    expect(dbToGain(-6)).toBeLessThan(1)
    expect(dbToGain(-6)).toBeGreaterThan(dbToGain(-12))
  })
})

describe("mergeIntervals", () => {
  it("drops empty ranges and sorts the rest", () => {
    expect(mergeIntervals([{ startMs: 10, endMs: 10 }])).toEqual([])
    expect(
      mergeIntervals([
        { startMs: 500, endMs: 800 },
        { startMs: 0, endMs: 100 },
      ])
    ).toEqual([
      { startMs: 0, endMs: 100 },
      { startMs: 500, endMs: 800 },
    ])
  })

  it("merges ranges that overlap or touch exactly", () => {
    expect(
      mergeIntervals([
        { startMs: 0, endMs: 1000 },
        { startMs: 800, endMs: 1500 },
        { startMs: 1500, endMs: 2000 },
      ])
    ).toEqual([{ startMs: 0, endMs: 2000 }])
  })
})

describe("computeDuckEnvelope", () => {
  it("leaves the volume alone when nothing else is making a sound", () => {
    expect(envelope([])).toEqual([])
  })

  it("fades down, holds, and comes back up around one piece of speech", () => {
    expect(envelope([{ startMs: 10_000, endMs: 12_000 }])).toEqual([
      { tMs: 9_850, gain: 1 },
      { tMs: 10_000, gain: DUCK },
      { tMs: 12_000, gain: DUCK },
      { tMs: 12_300, gain: 1 },
    ])
  })

  it("keeps two well-separated clips as two separate dips", () => {
    const keys = envelope([
      { startMs: 5_000, endMs: 6_000 },
      { startMs: 20_000, endMs: 21_000 },
    ])
    expect(keys).toHaveLength(8)
    expect(times(keys)).toEqual([
      4_850, 5_000, 6_000, 6_300, 19_850, 20_000, 21_000, 21_300,
    ])
  })

  it("stays quiet across a gap too short to come back up and go down again", () => {
    expect(
      envelope([
        { startMs: 5_000, endMs: 6_000 },
        { startMs: 6_200, endMs: 7_000 },
      ])
    ).toEqual([
      { tMs: 4_850, gain: 1 },
      { tMs: 5_000, gain: DUCK },
      { tMs: 7_000, gain: DUCK },
      { tMs: 7_300, gain: 1 },
    ])
  })

  it("shortens the run-up when the speech starts near the beginning", () => {
    const keys = envelope([{ startMs: 100, endMs: 2_000 }])
    expect(keys[0]).toEqual({ tMs: 0, gain: 1 })
    expect(keys[1]).toEqual({ tMs: 100, gain: DUCK })
    expect(keys.at(-1)?.tMs).toBe(2_300)
  })

  it("starts already quiet when the speech begins at the very start", () => {
    const keys = envelope([{ startMs: 0, endMs: 2_000 }])
    expect(keys[0]).toEqual({ tMs: 0, gain: DUCK })
    expect(keys.at(-1)).toEqual({ tMs: 2_300, gain: 1 })
  })

  it("never runs past the end of the project", () => {
    const keys = envelope([{ startMs: 1_000, endMs: 2_000 }], 2_100)
    expect(keys.at(-1)?.tMs).toBe(2_100)
  })
})

describe("sampleEnvelope", () => {
  const keys = envelope([{ startMs: 10_000, endMs: 12_000 }])

  it("is at full volume before and after", () => {
    expect(sampleEnvelope(keys, 0)).toBe(1)
    expect(sampleEnvelope(keys, 9_850)).toBe(1)
    expect(sampleEnvelope(keys, 20_000)).toBe(1)
  })

  it("is fully quiet through the speech", () => {
    expect(sampleEnvelope(keys, 10_000)).toBe(DUCK)
    expect(sampleEnvelope(keys, 11_000)).toBe(DUCK)
    expect(sampleEnvelope(keys, 12_000)).toBe(DUCK)
  })

  it("slides evenly down and up the ramps", () => {
    expect(Math.abs(sampleEnvelope(keys, 9_925) - (1 + DUCK) / 2)).toBeLessThan(
      1e-9
    )
    expect(Math.abs(sampleEnvelope(keys, 12_150) - (1 + DUCK) / 2)).toBeLessThan(
      1e-9
    )
  })

  it("is full volume with no curve at all", () => {
    expect(sampleEnvelope([], 1_000)).toBe(1)
  })
})

describe("the same curve, written for the renderer", () => {
  const keys = envelope([{ startMs: 10_000, endMs: 12_000 }])

  it("is plain full volume when there is nothing to duck under", () => {
    expect(duckEnvelopeToVolumeExpr([])).toBe("1")
  })

  it("holds the ends and slides between the points", () => {
    const expr = duckEnvelopeToVolumeExpr(keys)
    // Before the first point it is full volume, and after the last it is again.
    expect(expr).toMatch(/^if\(lt\(t,9\.85\d*\),1,/)
    expect(evaluateVolumeExpr(expr, 0)).toBe(1)
    expect(evaluateVolumeExpr(expr, 30)).toBe(1)
    // And the stretch in between sits at the ducked level.
    expect(evaluateVolumeExpr(expr, 11)).toBeCloseTo(0.25, 4)
  })

  it("says the same thing at a given moment as the preview does", () => {
    // Both sides read one curve, so a spot check of the written form against
    // the sampled one is what keeps export and preview honest.
    for (const tMs of [0, 9_900, 10_000, 11_000, 12_100, 20_000]) {
      const expected = sampleEnvelope(keys, tMs)
      expect(evaluateVolumeExpr(duckEnvelopeToVolumeExpr(keys), tMs / 1000)).toBeCloseTo(
        expected,
        4
      )
    }
  })
})

/**
 * Works out what ffmpeg would, for the two shapes this expression can take:
 * a choice on the time, and a straight line between two points.
 */
function evaluateVolumeExpr(expr: string, t: number): number {
  const conditional = expr.match(/^if\(lt\(t,([-\d.]+)\),(.*)\)$/)
  if (conditional) {
    const [, boundary, rest] = conditional
    const split = splitTopLevel(rest)
    return t < Number(boundary)
      ? evaluateVolumeExpr(split[0], t)
      : evaluateVolumeExpr(split[1], t)
  }
  const line = expr.match(
    /^\(([-\d.]+)\+([-\d.]+)\*\(t-([-\d.]+)\)\/([-\d.]+)\)$/
  )
  if (line) {
    const [, from, change, at, over] = line
    return Number(from) + (Number(change) * (t - Number(at))) / Number(over)
  }
  return Number(expr)
}

/** Splits "a,b" on the comma that is not inside brackets. */
function splitTopLevel(value: string): [string, string] {
  let depth = 0
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index]
    if (character === "(") depth += 1
    else if (character === ")") depth -= 1
    else if (character === "," && depth === 0) {
      return [value.slice(0, index), value.slice(index + 1)]
    }
  }
  return [value, "1"]
}
