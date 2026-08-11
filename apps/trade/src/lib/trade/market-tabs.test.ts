import { describe, expect, it } from "vitest"

import { marketBelongsInTab } from "@/lib/trade/market-tabs"

describe("market list tabs", () => {
  const favorites = new Set(["starred"])
  const watched = new Set(["smart-order"])

  it("shows an active smart-order market in Watch without requiring a star", () => {
    expect(
      marketBelongsInTab("watch", "smart-order", favorites, watched)
    ).toBe(true)
    expect(marketBelongsInTab("watch", "starred", favorites, watched)).toBe(
      false
    )
  })

  it("keeps Fav and All independent from Watch", () => {
    expect(marketBelongsInTab("fav", "starred", favorites, watched)).toBe(true)
    expect(marketBelongsInTab("fav", "smart-order", favorites, watched)).toBe(
      false
    )
    expect(marketBelongsInTab("all", "anything", favorites, watched)).toBe(
      true
    )
  })
})
