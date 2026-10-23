import { describe, expect, it } from "vitest"

import { dealCountsText } from "@/lib/promotions/deal-counts"

describe("dealCountsText", () => {
  it("says both numbers for a deal with a code", () => {
    expect(dealCountsText({ views: 300, codeTaps: 45 })).toBe(
      "300 views · 45 tapped Show code"
    )
  })

  it("says the views alone for a deal with no Show code button", () => {
    expect(dealCountsText({ views: 1, codeTaps: null })).toBe("1 view")
  })

  it("says nobody has looked yet as 0", () => {
    expect(dealCountsText({ views: 0, codeTaps: 0 })).toBe(
      "0 views · 0 tapped Show code"
    )
  })

  it("puts commas in big numbers", () => {
    expect(dealCountsText({ views: 12_345, codeTaps: null })).toBe("12,345 views")
  })
})
