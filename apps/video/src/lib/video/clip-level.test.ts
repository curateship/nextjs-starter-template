import { describe, expect, it } from "vitest"

import {
  levelDbFor,
  levelFilter,
  levelGain,
  MAX_LEVEL_RAISE_DB,
  previewLevelGain,
} from "@/lib/video/clip-level"

describe("even loudness between clips", () => {
  it("brings a file to -18 LUFS, raising at most 12 dB", () => {
    expect(levelDbFor(-10)).toBe(-8)
    expect(levelDbFor(-24)).toBe(6)
    expect(levelDbFor(-60)).toBe(MAX_LEVEL_RAISE_DB)
  })

  it("leaves a file alone when it is close, silent or unmeasured", () => {
    expect(levelDbFor(-18.2)).toBeUndefined()
    expect(levelDbFor(null)).toBeUndefined()
    expect(levelDbFor(undefined)).toBeUndefined()
  })

  it("plays a lowering in the preview and a raise only in the export", () => {
    expect(previewLevelGain({ levelDb: -6 })).toBeCloseTo(0.501, 3)
    expect(previewLevelGain({ levelDb: 6 })).toBe(1)
    expect(levelGain({ levelDb: 6 })).toBeCloseTo(1.995, 3)
    expect(levelFilter({ levelDb: 6 })).toEqual(["volume=6dB"])
    expect(levelFilter({})).toEqual([])
  })
})
