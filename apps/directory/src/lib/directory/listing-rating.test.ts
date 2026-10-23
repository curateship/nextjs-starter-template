import { describe, expect, it } from "vitest"

import {
  listingRatingFromText,
  LISTING_RATING_ERROR,
} from "@/lib/directory/listing-rating"

describe("listing rating input", () => {
  it("keeps blank ratings empty and accepts Directory's decimal values", () => {
    expect(listingRatingFromText(" ")).toBeNull()
    expect(listingRatingFromText("0")).toBe(0)
    expect(listingRatingFromText(".5")).toBe(0.5)
    expect(listingRatingFromText("4.5")).toBe(4.5)
    expect(listingRatingFromText("4.6")).toBe(4.6)
    expect(listingRatingFromText("5.0")).toBe(5)
  })

  it("refuses letters, extra decimal places, and values outside the range", () => {
    for (const value of [
      "stars",
      "0x4",
      "4e0",
      "4.25",
      "4.50",
      "-0.5",
      "5.5",
    ]) {
      expect(() => listingRatingFromText(value)).toThrow(LISTING_RATING_ERROR)
    }
  })
})
