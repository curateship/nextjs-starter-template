import { describe, expect, it } from "vitest"

import {
  formatDirectoryCategories,
  formatDirectoryDistance,
  formatDirectoryNearPoint,
  parseDirectoryNearPoint,
  readDirectoryCategories,
  readDirectoryMinRating,
  readDirectoryNearRadius,
  toggleDirectoryCategory,
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

describe("the ticked categories in the address", () => {
  it("reads one slug, several slugs, and drops the rubbish between them", () => {
    expect(readDirectoryCategories("italian")).toEqual(["italian"])
    expect(readDirectoryCategories("italian,sushi,pub-food")).toEqual([
      "italian",
      "sushi",
      "pub-food",
    ])
    // Spaces, empties and a repeat: a hand-edited address is tidied rather
    // than refused, because a stale link should still show the directory.
    expect(readDirectoryCategories(" italian , ,sushi,italian")).toEqual([
      "italian",
      "sushi",
    ])
    expect(readDirectoryCategories(undefined)).toEqual([])
    expect(readDirectoryCategories(["italian"])).toEqual([])
  })

  it("keeps twelve slugs and stops there", () => {
    const many = Array.from({ length: 30 }, (_, index) => `c${index}`).join(",")
    expect(readDirectoryCategories(many)).toHaveLength(12)
  })

  it("adds and takes away one box at a time", () => {
    expect(toggleDirectoryCategory("italian", "sushi")).toBe("italian,sushi")
    expect(toggleDirectoryCategory("italian,sushi", "italian")).toBe("sushi")
    // The last box unticked leaves the key out of the address entirely.
    expect(toggleDirectoryCategory("italian", "italian")).toBeUndefined()
    expect(formatDirectoryCategories([])).toBeUndefined()
  })
})

describe("the lowest rating in the address", () => {
  it("takes only the rungs offered", () => {
    expect(readDirectoryMinRating(4)).toBe(4)
    expect(readDirectoryMinRating("4.5")).toBe(4.5)
    // A hand-typed 9 is any rating rather than an empty page.
    expect(readDirectoryMinRating(9)).toBeUndefined()
    expect(readDirectoryMinRating("good")).toBeUndefined()
  })
})
