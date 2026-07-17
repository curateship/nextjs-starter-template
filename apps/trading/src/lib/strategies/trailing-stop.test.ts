import { describe, expect, it } from "vitest"

import type { ProtectionSettings } from "./settings"
import {
  effectiveStopPx,
  nextTrailState,
  trailingStopPath,
} from "./trailing-stop"

const long = (entryPx = 100) => ({ szi: 1, entryPx })
const short = (entryPx = 100) => ({ szi: -1, entryPx })

describe("nextTrailState", () => {
  it("is null while flat", () => {
    expect(nextTrailState(null, null, 100)).toBeNull()
    expect(
      nextTrailState({ dir: 1, extremePx: 110 }, { szi: 0, entryPx: 100 }, 100)
    ).toBeNull()
    expect(nextTrailState(null, { szi: 0, entryPx: 100 }, 100)).toBeNull()
  })

  it("seeds from entry and only ratchets in the trade's favor", () => {
    const seeded = nextTrailState(null, long(), 99)
    expect(seeded).toEqual({ dir: 1, extremePx: 100 })
    const up = nextTrailState(seeded, long(), 104)
    expect(up).toEqual({ dir: 1, extremePx: 104 })
    // A pullback never lowers a long's extreme.
    expect(nextTrailState(up, long(), 101)).toBe(up)
  })

  it("mirrors for shorts: the extreme only falls", () => {
    const seeded = nextTrailState(null, short(), 101)
    expect(seeded).toEqual({ dir: -1, extremePx: 100 })
    const down = nextTrailState(seeded, short(), 95)
    expect(down).toEqual({ dir: -1, extremePx: 95 })
    expect(nextTrailState(down, short(), 99)).toBe(down)
  })

  it("reseeds when the position flips sides", () => {
    const oldLong = { dir: 1 as const, extremePx: 120 }
    expect(nextTrailState(oldLong, short(100), 100)).toEqual({
      dir: -1,
      extremePx: 100,
    })
  })

  it("returns the same object when nothing changed", () => {
    const trail = { dir: 1 as const, extremePx: 110 }
    expect(nextTrailState(trail, long(), 105)).toBe(trail)
  })
})

describe("effectiveStopPx", () => {
  const fixed: ProtectionSettings = { stopLossPct: 2 }
  const trailing: ProtectionSettings = { stopLossPct: 2, stopLossMode: "trailing" }

  it("fixed mode matches the classic entry-distance formula", () => {
    expect(effectiveStopPx(fixed, long(), null)).toBe(98)
    expect(effectiveStopPx(fixed, short(), null)).toBe(102)
    // A trail extreme is ignored in fixed mode.
    expect(effectiveStopPx(fixed, long(), { dir: 1, extremePx: 150 })).toBe(98)
  })

  it("returns null without a stop or while flat", () => {
    expect(effectiveStopPx({}, long(), null)).toBeNull()
    expect(effectiveStopPx(fixed, null, null)).toBeNull()
    expect(effectiveStopPx(fixed, { szi: 0, entryPx: 100 }, null)).toBeNull()
  })

  it("trailing follows the extreme at the distance, floored at the fixed level", () => {
    // No extreme yet → entry-based stop, exactly like fixed mode.
    expect(effectiveStopPx(trailing, long(), null)).toBe(98)
    expect(
      effectiveStopPx(trailing, long(), { dir: 1, extremePx: 110 })
    ).toBeCloseTo(107.8, 10)
    // Any favorable move ratchets immediately when no activation is set.
    expect(
      effectiveStopPx(trailing, long(), { dir: 1, extremePx: 100.5 })
    ).toBeCloseTo(98.49, 10)
    // A stale extreme below entry can never widen the stop past fixed.
    expect(effectiveStopPx(trailing, long(), { dir: 1, extremePx: 95 })).toBe(
      98
    )
    // Shorts mirror: extreme 90 → stop 91.8.
    expect(
      effectiveStopPx(trailing, short(), { dir: -1, extremePx: 90 })
    ).toBeCloseTo(91.8, 10)
  })

  it("waits for the activation threshold before trailing", () => {
    const gated: ProtectionSettings = {
      stopLossPct: 2,
      stopLossMode: "trailing",
      trailActivationPct: 5,
    }
    // Up 4% — not activated, stop waits at the fixed distance.
    expect(effectiveStopPx(gated, long(), { dir: 1, extremePx: 104 })).toBe(98)
    // Up 5% — activated, trails from the extreme.
    expect(
      effectiveStopPx(gated, long(), { dir: 1, extremePx: 105 })
    ).toBeCloseTo(102.9, 10)
    // Short mirrored: down 5% activates.
    expect(effectiveStopPx(gated, short(), { dir: -1, extremePx: 96 })).toBe(102)
    expect(
      effectiveStopPx(gated, short(), { dir: -1, extremePx: 95 })
    ).toBeCloseTo(96.9, 10)
  })

  it("an opposite-side trail state is ignored", () => {
    expect(
      effectiveStopPx(trailing, long(), { dir: -1, extremePx: 90 })
    ).toBe(98)
  })
})

describe("trailingStopPath", () => {
  it("paints a ratchet that rises with highs and holds on pullbacks", () => {
    const settings: ProtectionSettings = {
      stopLossPct: 2,
      stopLossMode: "trailing",
    }
    const bars = [
      { t: 1, h: 100, l: 96 },
      { t: 2, h: 110, l: 99 },
      { t: 3, h: 105, l: 101 },
    ]
    const points = trailingStopPath(settings, "long", 100, bars)
    expect(points.map((point) => point.time)).toEqual([1, 2, 3])
    expect(points[0].value).toBeCloseTo(98, 10)
    expect(points[1].value).toBeCloseTo(107.8, 10)
    // The pullback bar holds the ratcheted level — it never gives back.
    expect(points[2].value).toBeCloseTo(107.8, 10)
  })

  it("is empty when the config has no stop", () => {
    expect(trailingStopPath({}, "long", 100, [{ t: 1, h: 101, l: 99 }])).toEqual(
      []
    )
  })
})
