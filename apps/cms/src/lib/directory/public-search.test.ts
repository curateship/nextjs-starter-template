import { describe, expect, it } from "vitest"

import {
  formatDirectoryDistance,
  formatDirectoryNearPoint,
  parseDirectoryNearPoint,
  readDirectoryNearRadius,
} from "./public-search"

describe("nearby directory search", () => {
  it("rounds shared locations and rejects invalid ones", () => {
    expect(
      formatDirectoryNearPoint({ latitude: 43.65321, longitude: -79.38318 })
    ).toBe("43.653,-79.383")
    expect(parseDirectoryNearPoint("43.65321,-79.38318")).toEqual({
      latitude: 43.653,
      longitude: -79.383,
    })
    expect(parseDirectoryNearPoint("95,-79")).toBeNull()
  })

  it("accepts only offered distances and uses natural labels", () => {
    expect(readDirectoryNearRadius("25")).toBe(25)
    expect(readDirectoryNearRadius("11")).toBeUndefined()
    expect(formatDirectoryDistance(0.1)).toBe("100 m away")
    expect(formatDirectoryDistance(2)).toBe("2.0 km away")
    expect(formatDirectoryDistance(30)).toBe("30 km away")
  })
})
