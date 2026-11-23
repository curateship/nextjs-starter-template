import { describe, expect, it } from "vitest"

import {
  builderFeePercent,
  builderFeeTenthsBps,
  copyFee,
  copySettingsProblem,
  copySkipWords,
  decideCopy,
  type CopySettings,
} from "@/lib/trade/copy/copy-rules"

const SETTINGS: CopySettings = {
  walletId: "w1",
  dollarsPerTrade: 200,
  maxOpenUsd: 1_000,
  maxLeverage: 5,
  coins: null,
  priceAllowance: 0.01,
  lossLimitUsd: null,
}

describe("what one trader trade means for a copy", () => {
  it("opens a new leg when the trader buys from nothing", () => {
    expect(
      decideCopy(null, { delta: 27.7, px: 180, heldAfter: 27.7, dir: "Open Long" })
    ).toEqual({
      kind: "open",
      side: "buy",
      leg: { traderSz: 27.7 },
      adding: false,
    })
  })

  it("opens a short the same way", () => {
    expect(
      decideCopy(null, { delta: -5, px: 180, heldAfter: -5, dir: "Open Short" })
    ).toMatchObject({ kind: "open", side: "sell", leg: { traderSz: -5 } })
  })

  it("adds when a followed position grows", () => {
    expect(
      decideCopy(
        { traderSz: 10 },
        { delta: 5, px: 180, heldAfter: 15, dir: "Open Long" }
      )
    ).toEqual({ kind: "open", side: "buy", leg: { traderSz: 15 }, adding: true })
  })

  it("takes off the same share the trader took off", () => {
    // Sam held 100 SOL and sold 40: the copy sells 40 out of every 100 of its own.
    const decision = decideCopy(
      { traderSz: 100 },
      { delta: -40, px: 198, heldAfter: 60, dir: "Close Long" }
    )
    expect(decision).toMatchObject({ kind: "reduce", leg: { traderSz: 60 } })
    expect(decision.kind === "reduce" && decision.share).toBeCloseTo(0.4, 10)
  })

  it("measures the share against what the exchange says the trader held, not the copy's memory", () => {
    // The copy remembered 100, but Sam had added 100 more by hand while the
    // copy was paused. Selling 100 of 200 is half, not all.
    const decision = decideCopy(
      { traderSz: 100 },
      { delta: -100, px: 198, heldAfter: 100, dir: "Close Long" }
    )
    expect(decision.kind === "reduce" && decision.share).toBeCloseTo(0.5, 10)
  })

  it("closes everything when the trader is out, whatever stopped them", () => {
    expect(
      decideCopy(
        { traderSz: 10 },
        { delta: -10, px: 170, heldAfter: 0, dir: "Close Long" }
      )
    ).toEqual({ kind: "reduce", share: 1, leg: null })
  })

  it("closes and does not follow a trader who turned round in one trade", () => {
    expect(
      decideCopy(
        { traderSz: 10 },
        { delta: -15, px: 170, heldAfter: -5, dir: "Long > Short" }
      )
    ).toEqual({ kind: "reduce", share: 1, leg: null, turned: true })
  })

  it("skips an add to a position the trader held before the copy began", () => {
    expect(
      decideCopy(null, { delta: 5, px: 180, heldAfter: 15, dir: "Open Long" })
    ).toEqual({ kind: "skip", reason: "held-before" })
  })

  it("ignores a sale of a position the copy never followed", () => {
    expect(
      decideCopy(null, { delta: -5, px: 180, heldAfter: 10, dir: "Close Long" })
    ).toEqual({ kind: "ignore" })
  })

  it("falls back on the copy's own memory when the exchange could not be read", () => {
    const decision = decideCopy(
      { traderSz: 20 },
      { delta: -5, px: 180, heldAfter: null, dir: "Close Long" }
    )
    expect(decision).toMatchObject({ kind: "reduce", leg: { traderSz: 15 } })
    expect(decision.kind === "reduce" && decision.share).toBeCloseTo(0.25, 10)
  })

  it("trusts the exchange's own Open with no read and no memory", () => {
    expect(
      decideCopy(null, { delta: 3, px: 180, heldAfter: null, dir: "Open Long" })
    ).toMatchObject({ kind: "open", leg: { traderSz: 3 } })
    expect(
      decideCopy(null, { delta: -3, px: 180, heldAfter: null, dir: "Close Long" })
    ).toEqual({ kind: "ignore" })
  })
})

describe("the fee", () => {
  it("charges 0.1% of a real copied trade and owes the trader half", () => {
    // The task's own worked example: a $200 copy opens, and closes at $219.80.
    const opening = copyFee({
      notionalUsd: 200,
      real: true,
      feeRate: 0.001,
      traderShare: 0.5,
    })
    const closing = copyFee({
      notionalUsd: 219.8,
      real: true,
      feeRate: 0.001,
      traderShare: 0.5,
    })
    expect(opening.feeUsd).toBeCloseTo(0.2, 10)
    expect(closing.feeUsd).toBeCloseTo(0.2198, 10)
    expect(opening.traderShareUsd + closing.traderShareUsd).toBeCloseTo(0.2099, 10)
  })

  it("charges nothing on a practice copy", () => {
    expect(
      copyFee({ notionalUsd: 200, real: false, feeRate: 0.001, traderShare: 0.5 })
    ).toEqual({ feeUsd: 0, traderShareUsd: 0 })
  })

  it("writes the rate the way Hyperliquid counts it", () => {
    expect(builderFeeTenthsBps(0.001)).toBe(100)
    expect(builderFeeTenthsBps(0.0005)).toBe(50)
    expect(builderFeePercent(0.001)).toBe("0.1%")
    expect(builderFeePercent(0.0005)).toBe("0.05%")
  })
})

describe("the copier's settings", () => {
  it("accepts the Copy window's defaults", () => {
    expect(copySettingsProblem(SETTINGS)).toBeNull()
  })

  it("refuses a cap smaller than one trade", () => {
    expect(
      copySettingsProblem({ ...SETTINGS, maxOpenUsd: 100 })
    ).toMatchObject({ field: "maxOpenUsd" })
  })

  it("refuses an empty coin list", () => {
    expect(copySettingsProblem({ ...SETTINGS, coins: [] })).toMatchObject({
      field: "coins",
    })
  })

  it("refuses a price allowance over $5 in every $100", () => {
    expect(
      copySettingsProblem({ ...SETTINGS, priceAllowance: 0.06 })
    ).toMatchObject({ field: "priceAllowance" })
  })
})

describe("skip sentences", () => {
  it("names the cap in dollars", () => {
    expect(
      copySkipWords(
        { kind: "cap", wouldBeUsd: 1_200, maxOpenUsd: 1_000 },
        "@sam",
        "SOL"
      )
    ).toBe(
      "This copy would bring your copied positions to $1,200, above your $1,000 limit."
    )
  })

  it("names the price move and the allowance", () => {
    expect(
      copySkipWords(
        { kind: "price-moved", traderPx: 180, nowPx: 182.5, allowance: 0.01 },
        "@sam",
        "SOL"
      )
    ).toBe(
      "SOL moved from $180 to $182.5 before the copy could start, more than the $1 in every $100 you allow."
    )
  })
})
