import { describe, expect, it } from "vitest"

import { roundedPct, sharePct, signedPct, signedUsd } from "./backtest-kpi"

/**
 * The rounding every figure on the backtest screen reads through. Two decimals
 * were noise on a made-up pot — "+1117.82%" is "+1,118%" — but under ten the
 * small part is the whole story, so it survives there.
 */

describe("signedPct", () => {
  it("drops the decimals on a figure big enough not to need them", () => {
    expect(signedPct(1117.82)).toBe("+1,118%")
    expect(signedPct(-22.04)).toBe("-22%")
  })

  it("keeps a tenth under ten, where the small part is the answer", () => {
    expect(signedPct(0.2)).toBe("+0.2%")
    expect(signedPct(-4.36)).toBe("-4.4%")
  })

  it("does not write a tenth that is zero", () => {
    expect(signedPct(5)).toBe("+5%")
    expect(signedPct(0)).toBe("+0%")
  })

  it("always carries its sign", () => {
    expect(signedPct(43)).toBe("+43%")
    expect(signedPct(-43)).toBe("-43%")
  })
})

describe("roundedPct", () => {
  it("is the same rule without a sign in front", () => {
    expect(roundedPct(46.31)).toBe("46%")
    expect(roundedPct(0.24)).toBe("0.2%")
  })

  it("reads a negative as its size, for callers that write their own sign", () => {
    expect(roundedPct(-46.31)).toBe("46%")
  })
})

describe("signedUsd", () => {
  it("drops the pence above a hundred dollars", () => {
    expect(signedUsd(111_782.38)).toBe("+$111,782")
    expect(signedUsd(-65_737.4)).toBe("-$65,737")
  })

  it("keeps them below it, where they are the figure", () => {
    expect(signedUsd(52.68)).toBe("+$52.68")
    expect(signedUsd(-0.45)).toBe("-$0.45")
  })
})

describe("sharePct", () => {
  it("says nothing rather than dividing by nothing", () => {
    expect(sharePct(0, 0)).toBe("—")
  })

  it("counts wins out of trades", () => {
    expect(sharePct(269, 681)).toBe("40%")
  })
})
