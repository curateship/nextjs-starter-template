import { describe, expect, it } from "vitest"

import { formatDuration } from "@/lib/format/format-time"

describe("formatDuration", () => {
  it("keeps the useful smaller part at each size", () => {
    expect(formatDuration(20_000)).toBe("20s")
    expect(formatDuration(9 * 60_000)).toBe("9m")
    expect(formatDuration((3 * 60 + 12) * 60_000)).toBe("3h 12m")
    expect(formatDuration((3 * 24 + 4) * 60 * 60_000)).toBe("3d 4h")
  })

  it("does not add an empty smaller part", () => {
    expect(formatDuration(3 * 60 * 60_000)).toBe("3h")
    expect(formatDuration(3 * 24 * 60 * 60_000)).toBe("3d")
  })

  it("lets a caller say what zero means", () => {
    expect(formatDuration(0, { zero: "under one candle" })).toBe(
      "under one candle"
    )
  })
})
