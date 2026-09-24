import { describe, expect, it } from "vitest"

import {
  estimateExportSeconds,
  exportEstimateSentence,
  MAX_TIMELINE_MS,
  TIMELINE_TOO_LONG_MESSAGE,
} from "@/lib/video/render"

const THIRTY_MINUTES = 30 * 60_000

describe("the longest project an export takes", () => {
  it("is thirty minutes, and the refusal says so", () => {
    expect(MAX_TIMELINE_MS).toBe(THIRTY_MINUTES)
    expect(TIMELINE_TOO_LONG_MESSAGE).toContain("30 minutes")
  })
})

describe("how long an export is expected to take", () => {
  const base = {
    projectMs: THIRTY_MINUTES,
    quality: "high" as const,
    aspects: ["16:9" as const],
    normalizeLoudness: true,
  }

  it("grows in step with the project", () => {
    const thirty = estimateExportSeconds(base)
    const ten = estimateExportSeconds({ ...base, projectMs: 10 * 60_000 })
    expect(thirty).toBeCloseTo(ten * 3)
  })

  it("adds each shape, since they are made one after another", () => {
    const one = estimateExportSeconds(base)
    const two = estimateExportSeconds({ ...base, aspects: ["16:9", "9:16"] })
    expect(two).toBeGreaterThan(one * 1.5)
  })

  it("is shorter without evening out the sound", () => {
    expect(
      estimateExportSeconds({ ...base, normalizeLoudness: false })
    ).toBeLessThan(estimateExportSeconds(base))
  })

  it("is shorter at a smaller quality", () => {
    expect(estimateExportSeconds({ ...base, quality: "low" })).toBeLessThan(
      estimateExportSeconds(base)
    )
  })

  it("is nothing when no shape is ticked", () => {
    expect(estimateExportSeconds({ ...base, aspects: [] })).toBe(0)
  })
})

describe("what the export window says about the wait", () => {
  it("says nothing under a minute", () => {
    expect(exportEstimateSentence(59, 1)).toBeNull()
  })

  it("rounds to whole minutes", () => {
    expect(exportEstimateSentence(60, 1)).toBe("Making it takes about a minute.")
    expect(exportEstimateSentence(400, 1)).toBe(
      "Making it takes about 7 minutes."
    )
  })

  it("names how many shapes are made in turn", () => {
    expect(exportEstimateSentence(900, 3)).toBe(
      "Making all 3 takes about 15 minutes, one after another."
    )
  })
})
