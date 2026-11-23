import { describe, expect, it } from "vitest"

import {
  atempoFilters,
  clipMsAt,
  clipSpeed,
  clipVolume,
  DEFAULT_CLIP_SPEED,
  DEFAULT_CLIP_VOLUME,
  sourceEndMs,
  sourceMsAt,
  sourceSpanMs,
  storedPlaybackValue,
} from "@/lib/video/clip-playback"

describe("clipVolume", () => {
  it("is full when nothing is stored", () => {
    expect(clipVolume({})).toBe(DEFAULT_CLIP_VOLUME)
  })

  it("keeps a stored value", () => {
    expect(clipVolume({ volume: 0.2 })).toBe(0.2)
  })

  it("holds a value outside the range at the nearest end", () => {
    expect(clipVolume({ volume: -1 })).toBe(0)
    expect(clipVolume({ volume: 5 })).toBe(1)
  })

  it("falls back to full on a value that is not a number", () => {
    expect(clipVolume({ volume: Number.NaN })).toBe(1)
  })
})

describe("clipSpeed", () => {
  it("is normal when nothing is stored", () => {
    expect(clipSpeed({})).toBe(DEFAULT_CLIP_SPEED)
  })

  it("holds a value outside the range at the nearest end", () => {
    expect(clipSpeed({ speed: 0.1 })).toBe(0.25)
    expect(clipSpeed({ speed: 99 })).toBe(4)
  })
})

describe("where a clip sits in its file", () => {
  const clip = { durationMs: 4000, trimStartMs: 1000, speed: 2 }

  it("eats its own length times its speed", () => {
    expect(sourceSpanMs(clip)).toBe(8000)
    expect(sourceEndMs(clip)).toBe(9000)
  })

  it("turns clip time into file time and back", () => {
    expect(sourceMsAt(clip, 1000)).toBe(3000)
    expect(clipMsAt(clip, 3000)).toBe(1000)
  })

  it("leaves a normal clip's times alone", () => {
    const plain = { durationMs: 4000, trimStartMs: 1000 }
    expect(sourceMsAt(plain, 1500)).toBe(2500)
    expect(clipMsAt(plain, 2500)).toBe(1500)
    expect(sourceSpanMs(plain)).toBe(4000)
  })
})

describe("storedPlaybackValue", () => {
  it("stores nothing at all when the value is the normal one", () => {
    expect(storedPlaybackValue(1, 1)).toBeUndefined()
  })

  it("rounds off what a slider hands back", () => {
    expect(storedPlaybackValue(0.30000000000000004, 1)).toBe(0.3)
  })
})

describe("atempoFilters", () => {
  it("asks for nothing at normal speed", () => {
    expect(atempoFilters(1)).toEqual([])
  })

  it("uses one stage inside what atempo accepts", () => {
    expect(atempoFilters(1.5)).toEqual(["atempo=1.500000"])
  })

  it("chains stages to reach four times as fast", () => {
    expect(atempoFilters(4)).toEqual(["atempo=2", "atempo=2.000000"])
  })

  it("chains stages to reach a quarter speed", () => {
    expect(atempoFilters(0.25)).toEqual(["atempo=0.5", "atempo=0.500000"])
  })

  it("multiplies out to the speed asked for", () => {
    for (const speed of [0.25, 0.4, 0.5, 0.75, 1.5, 2, 3, 4]) {
      const product = atempoFilters(speed).reduce(
        (total, stage) => total * Number(stage.split("=")[1]),
        1
      )
      expect(product).toBeCloseTo(speed, 5)
    }
  })
})
