import { describe, expect, it } from "vitest"

import { pctToBps, uniqueCopyName } from "./template-config"

describe("pctToBps", () => {
  it("converts a fee percent to basis points", () => {
    expect(pctToBps(0.045)).toBe(4.5)
    expect(pctToBps(0.03)).toBe(3)
    expect(pctToBps(0.5)).toBe(50)
    expect(pctToBps(0)).toBe(0)
  })

  it("strips floating-point noise", () => {
    // 0.029 * 100 === 2.9000000000000004 without rounding.
    expect(pctToBps(0.029)).toBe(2.9)
  })
})

describe("uniqueCopyName", () => {
  it("appends 'copy' when the name is free", () => {
    expect(uniqueCopyName("Aggressive", [])).toBe("Aggressive copy")
    expect(uniqueCopyName("Main default", ["Other"])).toBe("Main default copy")
  })

  it("increments the suffix on collision", () => {
    expect(uniqueCopyName("Aggressive", ["Aggressive copy"])).toBe(
      "Aggressive copy 2"
    )
    expect(
      uniqueCopyName("Aggressive", ["Aggressive copy", "Aggressive copy 2"])
    ).toBe("Aggressive copy 3")
  })
})
