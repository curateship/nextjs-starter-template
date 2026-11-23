import { describe, expect, it } from "vitest"

import {
  coinForSlug,
  convert,
  formatAge,
  formatConvertedCoins,
  formatConvertedUsd,
  isPriceOld,
  pairSlug,
  thousandOf,
} from "./price-converter"

describe("converting", () => {
  it("turns coins into dollars and dollars into coins", () => {
    expect(convert(0.5, 64_000, "coin-to-usd")).toBe(32_000)
    expect(formatConvertedCoins(convert(1000, 150, "usd-to-coin")!)).toBe(
      "6.666667"
    )
  })

  it("has no answer without a usable price", () => {
    expect(convert(1, null, "coin-to-usd")).toBeNull()
    expect(convert(1, 0, "usd-to-coin")).toBeNull()
    expect(convert(1, Number.NaN, "coin-to-usd")).toBeNull()
  })

  it("answers zero for zero", () => {
    expect(convert(0, 150, "usd-to-coin")).toBe(0)
    expect(formatConvertedUsd(0)).toBe("$0.00")
  })
})

describe("the coin addresses", () => {
  const coins = [{ symbol: "BTC" }, { symbol: "kPEPE" }]

  it("goes from coin to address and back, ignoring capitals", () => {
    expect(pairSlug("kPEPE")).toBe("kpepe-usd")
    expect(coinForSlug(coins, "btc-usd")?.symbol).toBe("BTC")
    expect(coinForSlug(coins, "KPEPE-USD")?.symbol).toBe("kPEPE")
  })

  it("finds nothing for an unlisted coin or another currency", () => {
    expect(coinForSlug(coins, "doge-usd")).toBeNull()
    expect(coinForSlug(coins, "btc-eur")).toBeNull()
    expect(coinForSlug(coins, "-usd")).toBeNull()
  })
})

describe("how old a price is", () => {
  it("marks a price old only past a minute", () => {
    expect(isPriceOld(60_000)).toBe(false)
    expect(isPriceOld(60_001)).toBe(true)
  })

  it("says the age in words", () => {
    expect(formatAge(3_400)).toBe("3 seconds ago")
    expect(formatAge(1_000)).toBe("1 second ago")
    expect(formatAge(61_000)).toBe("1 minute ago")
    expect(formatAge(2 * 3_600_000)).toBe("2 hours ago")
  })
})

describe("showing the answer", () => {
  it("keeps cents from a dollar up and digits below it", () => {
    expect(formatConvertedUsd(32_000)).toBe("$32,000.00")
    expect(formatConvertedUsd(0.018342)).toBe("$0.018342")
  })

  it("names what a k-coin is a thousand of", () => {
    expect(thousandOf("kPEPE")).toBe("PEPE")
    expect(thousandOf("BTC")).toBeNull()
    expect(thousandOf("KAITO")).toBeNull()
  })
})
