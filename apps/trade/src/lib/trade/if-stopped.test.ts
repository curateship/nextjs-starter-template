import { describe, expect, it } from "vitest"

import { ifStoppedChange } from "@/lib/trade/if-stopped"

describe("ifStoppedChange", () => {
  it("loses the distance to a stop below a long", () => {
    expect(ifStoppedChange({ szi: 2, mark: 100, stopPx: 90 })).toBe(-20)
  })

  it("banks a gain from a stop that sits above the price on a long", () => {
    expect(ifStoppedChange({ szi: 2, mark: 100, stopPx: 105 })).toBe(10)
  })

  it("flips the sign for a short", () => {
    expect(ifStoppedChange({ szi: -2, mark: 100, stopPx: 110 })).toBe(-20)
    expect(ifStoppedChange({ szi: -2, mark: 100, stopPx: 95 })).toBe(10)
  })

  it("is zero when the stop sits on today's price", () => {
    expect(ifStoppedChange({ szi: 3, mark: 100, stopPx: 100 })).toBe(0)
  })
})
