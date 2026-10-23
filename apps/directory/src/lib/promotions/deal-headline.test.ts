import { describe, expect, it } from "vitest"

import {
  builtHeadline,
  readDealAmount,
  shownHeadline,
} from "@/lib/promotions/deal-headline"

describe("a built headline", () => {
  it("writes money off with cents only when there are some", () => {
    expect(builtHeadline("money_off", 5)).toBe("$5 off")
    expect(builtHeadline("money_off", 5.5)).toBe("$5.50 off")
    expect(builtHeadline("money_off", 1000)).toBe("$1,000 off")
    expect(builtHeadline("money_off", 99_999.99).length).toBeLessThanOrEqual(24)
  })

  it("writes percent off", () => {
    expect(builtHeadline("percent_off", 20)).toBe("20% off")
    expect(builtHeadline("percent_off", 100)).toBe("100% off")
  })
})

describe("reading the typed number", () => {
  it("takes dollars and cents, with or without the sign", () => {
    expect(readDealAmount("money_off", "5")).toBe(5)
    expect(readDealAmount("money_off", " $5.50 ")).toBe(5.5)
    for (const bad of ["", "0", "-5", "5.555", "five", "100000"]) {
      expect(() => readDealAmount("money_off", bad)).toThrow(
        "Type the money off in dollars"
      )
    }
  })

  it("takes a whole percent from 1 to 100", () => {
    expect(readDealAmount("percent_off", "20")).toBe(20)
    expect(readDealAmount("percent_off", "20%")).toBe(20)
    for (const bad of ["", "0", "101", "12.5", "lots"]) {
      expect(() => readDealAmount("percent_off", bad)).toThrow(
        "Type the percent off as a whole number from 1 to 100."
      )
    }
  })
})

describe("the shown headline", () => {
  it("is 'Deal' for a deal made before headlines", () => {
    expect(shownHeadline("")).toBe("Deal")
    expect(shownHeadline("Free dessert")).toBe("Free dessert")
  })
})
