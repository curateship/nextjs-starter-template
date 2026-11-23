import { describe, expect, it } from "vitest"

import {
  absoluteBracketPrice,
  bracketPercent,
  bracketPrice,
  bracketTyped,
} from "@/lib/trade/brackets"

describe("bracketPercent", () => {
  it("says how far a price sits from the entry", () => {
    expect(bracketPercent(100, 105)).toBe("5")
    expect(bracketPercent(100, 98)).toBe("2")
  })

  it("is empty when there is nothing to measure", () => {
    expect(bracketPercent(100, null)).toBe("")
    expect(bracketPercent(0, 105)).toBe("")
  })
})

describe("bracketPrice", () => {
  it("puts a long's target above the entry and its stop below", () => {
    expect(
      bracketPrice({ entryPx: 100, percent: "5", long: true, winning: true })
    ).toBe(105)
    expect(
      bracketPrice({ entryPx: 100, percent: "2", long: true, winning: false })
    ).toBe(98)
  })

  it("swaps both sides on a short", () => {
    expect(
      bracketPrice({ entryPx: 100, percent: "5", long: false, winning: true })
    ).toBe(95)
    expect(
      bracketPrice({ entryPx: 100, percent: "2", long: false, winning: false })
    ).toBe(102)
  })

  it("accepts the percent sign people naturally type", () => {
    expect(
      bracketPrice({
        entryPx: 100,
        percent: " 2% ",
        long: true,
        winning: false,
      })
    ).toBe(98)
  })

  it("refuses a distance that takes the price through zero", () => {
    // A long's stop is the side that can: 120% below the entry is nowhere.
    expect(
      bracketPrice({ entryPx: 100, percent: "120", long: true, winning: false })
    ).toBeNull()
    // The same 120% as a long's target is fine — it is above the entry.
    expect(
      bracketPrice({ entryPx: 100, percent: "120", long: true, winning: true })
    ).toBeCloseTo(220, 9)
  })

  it("treats empty, nonsense and zero as no line at all", () => {
    for (const percent of ["", "   ", "abc", "0", "-3"]) {
      expect(
        bracketPrice({ entryPx: 100, percent, long: true, winning: true })
      ).toBeNull()
    }
  })
})

describe("absoluteBracketPrice", () => {
  const at = (price: string, long: boolean, winning: boolean) =>
    absoluteBracketPrice({ entryPx: 100, price, long, winning })

  it("accepts a stop only on the losing side of a long or short entry", () => {
    expect(at("95", true, false)).toBe(95)
    expect(at("105", false, false)).toBe(105)
    expect(at("105", true, false)).toBeNull()
    expect(at("95", false, false)).toBeNull()
  })

  it("accepts an exit only on the winning side of a long or short entry", () => {
    expect(at("110", true, true)).toBe(110)
    expect(at("90", false, true)).toBe(90)
    expect(at("90", true, true)).toBeNull()
    expect(at("110", false, true)).toBeNull()
    expect(at("100", true, true)).toBeNull()
  })

  it("refuses an empty, invalid, or zero price", () => {
    for (const price of ["", "nope", "0", "-1"]) {
      expect(at(price, true, false)).toBeNull()
      expect(at(price, false, true)).toBeNull()
    }
  })
})

describe("bracketTyped", () => {
  it("is true only when something typed does not work out", () => {
    expect(bracketTyped("abc", null)).toBe(true)
    expect(bracketTyped("", null)).toBe(false)
    expect(bracketTyped("5", 105)).toBe(false)
  })
})
