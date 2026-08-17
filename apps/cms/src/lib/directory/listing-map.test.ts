import { describe, expect, it } from "vitest"

import {
  DIRECTORY_MAP_LISTING_LIMIT,
  directoryMapCapNotice,
  directoryMapCentre,
} from "@/lib/directory/listing-map"

/**
 * The two decisions the map makes without touching a database: whether to warn
 * that something is missing, and where to open.
 *
 * The cap sentence is the one worth pinning down. Off by one in either
 * direction is a real bug — too eager and every full map nags about nothing,
 * too shy and a map silently drops a listing.
 */

describe("directoryMapCapNotice", () => {
  it("says nothing when every matching listing is on the map", () => {
    expect(directoryMapCapNotice(100, 100)).toBeNull()
    expect(directoryMapCapNotice(7, 7)).toBeNull()
    expect(directoryMapCapNotice(0, 0)).toBeNull()
  })

  it("speaks up at one more than the cap", () => {
    const notice = directoryMapCapNotice(DIRECTORY_MAP_LISTING_LIMIT, 101)
    expect(notice).toContain("100")
    expect(notice).toContain("101")
    expect(notice).toContain("narrow")
  })

  it("counts in listings, not in pages", () => {
    expect(directoryMapCapNotice(100, 4_000)).toBe(
      "Showing 100 of 4000 listings on the map. Search or pick a category to narrow it down."
    )
  })
})

describe("directoryMapCentre", () => {
  it("has nowhere to open with no points", () => {
    expect(directoryMapCentre([])).toBeNull()
  })

  it("sits between the points it is given", () => {
    expect(
      directoryMapCentre([
        { latitude: 10, longitude: 20 },
        { latitude: 20, longitude: 40 },
      ])
    ).toEqual({ latitude: 15, longitude: 30 })
  })
})
