import { describe, expect, it } from "vitest"

import {
  formatChange,
  formatCompactUsd,
  formatFeeUsd,
  formatFunding,
  formatWholeUsd,
  formatPrice,
  formatSignedUsd,
  formatSize,
  formatUsd,
  formatUsdRounded,
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

  it("prints money someone owns to the cent", () => {
    expect(formatUsd(9999.78)).toBe("$9,999.78")
    expect(formatUsd(0)).toBe("$0.00")
    expect(formatUsd(1_240)).toBe("$1,240.00")
  })

  it("always signs a gain or a loss, but never a plain zero", () => {
    expect(formatSignedUsd(412.65)).toBe("+$412.65")
    expect(formatSignedUsd(-18.9)).toBe("-$18.90")
    expect(formatSignedUsd(0)).toBe("$0.00")
  })

  it("puts a whole-dollar loss sign before the dollar sign", () => {
    expect(formatWholeUsd(1_250.4)).toBe("$1,250")
    expect(formatWholeUsd(-1_250.4)).toBe("-$1,250")
    expect(formatWholeUsd(-0.4)).toBe("$0")
  })
})

describe("money in a column of amounts", () => {
  it("drops the cents once they stop mattering", () => {
    // The ladder panel's Buy size column. Nine buys on a ramp of 2 run from
    // pennies to hundreds, and "$1,250.00" beside "$0.62" is four digits of
    // noise on the one that needs none.
    expect(formatUsdRounded(1_250)).toBe("$1,250")
    expect(formatUsdRounded(100)).toBe("$100")
    expect(formatUsdRounded(99.9)).toBe("$99.90")
    expect(formatUsdRounded(0.62)).toBe("$0.62")
    expect(formatUsdRounded(0)).toBe("$0.00")
  })

  it("treats a negative the same way round", () => {
    expect(formatUsdRounded(-1_250)).toBe("-$1,250")
    expect(formatUsdRounded(-0.62)).toBe("-$0.62")
  })
})

describe("how much of the coin", () => {
  it("cuts the float noise off a size that has been through arithmetic", () => {
    expect(formatSize(0.1 + 0.2)).toBe("0.3")
    expect(formatSize(1.005 * 3)).toBe("3.015")
    // $1,000 of a $68,069 bitcoin. The exchange fills five decimals; the rest
    // is what dividing left behind.
    expect(formatSize(1000 / 68069)).toBe("0.014691")
  })

  it("keeps the digits a real order size needs", () => {
    expect(formatSize(0.0125)).toBe("0.0125")
    expect(formatSize(0.000001)).toBe("0.000001")
  })

  it("groups a big size the way every other figure is grouped", () => {
    expect(formatSize(1_500)).toBe("1,500")
  })
})

describe("what a position has cost in fees", () => {
  it("shows a charge as money leaving and a rebate as money coming back", () => {
    expect(formatFeeUsd(0.05)).toBe("-$0.05")
    expect(formatFeeUsd(12.4)).toBe("-$12.40")
    expect(formatFeeUsd(-0.02)).toBe("+$0.02")
  })

  it("says a sub-cent charge in words rather than rounding it to nothing", () => {
    // A real Hyperliquid sub-exchange position had been charged four
    // ten-thousandths of a dollar, and dollars-and-cents printed "-$0.00",
    // which reads as nothing charged. That is the one thing a fee total may
    // never say.
    expect(formatFeeUsd(0.0004)).toBe("under $0.01")
    expect(formatFeeUsd(0.004)).toBe("under $0.01")
    expect(formatFeeUsd(-0.0004)).toBe("back under $0.01")
  })

  it("keeps true zero as zero, which means nothing was charged", () => {
    expect(formatFeeUsd(0)).toBe("$0.00")
  })
})
