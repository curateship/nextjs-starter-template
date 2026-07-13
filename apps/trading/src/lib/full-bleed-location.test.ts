import { describe, expect, it } from "vitest"

import { isFullBleedLocation } from "@/lib/full-bleed-location"

describe("isFullBleedLocation", () => {
  it("removes the outer gutter from a backtest run", () => {
    expect(
      isFullBleedLocation({
        pathname: "/backtest",
        search: { run: "run-id" },
      })
    ).toBe(true)
  })

  it("keeps the outer gutter on backtest lists", () => {
    expect(
      isFullBleedLocation({ pathname: "/backtest", search: {} })
    ).toBe(false)
    expect(
      isFullBleedLocation({ pathname: "/backtest/group-id", search: {} })
    ).toBe(false)
  })
})
