import { describe, expect, it } from "vitest"

import { marketBelongsInTab } from "@/lib/trade/market-tabs"

describe("market list tabs", () => {
  const favorites = new Set(["starred"])

  it("keeps Fav to the starred ones", () => {
    expect(marketBelongsInTab("fav", "starred", favorites)).toBe(true)
    expect(marketBelongsInTab("fav", "anything", favorites)).toBe(false)
  })

  it("lets everything through All", () => {
    expect(marketBelongsInTab("all", "anything", favorites)).toBe(true)
    expect(marketBelongsInTab("all", "starred", favorites)).toBe(true)
  })
})
