import { describe, expect, it } from "vitest"

import {
  formatChange,
  formatCompactUsd,
  formatFunding,
  formatPrice,
} from "@/lib/trade/format"

describe("trade figures", () => {
  it("prints prices at five significant digits", () => {
    expect(formatPrice(67412.9)).toBe("$67,413")
    expect(formatPrice(142.38)).toBe("$142.38")
    expect(formatPrice(0.02341112)).toBe("$0.023411")
  })

  it("compacts big dollar figures the way traders say them", () => {
    expect(formatCompactUsd(1_240_000_000)).toBe("$1.24b")
    expect(formatCompactUsd(88_600_000)).toBe("$88.6m")
    expect(formatCompactUsd(532_000)).toBe("$532k")
    expect(formatCompactUsd(890)).toBe("$890")
  })

  it("always signs a day's move", () => {
    expect(formatChange(0.0241)).toBe("+2.41%")
    expect(formatChange(-0.007)).toBe("-0.70%")
    expect(formatChange(0)).toBe("+0.00%")
  })

  it("prints funding in its fourth decimal", () => {
    expect(formatFunding(0.0000125)).toBe("0.0013%")
  })
})
