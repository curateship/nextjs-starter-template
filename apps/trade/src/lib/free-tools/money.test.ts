import { describe, expect, it } from "vitest"

import { formatToolMoney, formatToolPercent, readDecimal } from "./money"

describe("reading a typed number", () => {
  it("takes decimals, thousands commas and a trailing point", () => {
    expect(readDecimal("1,000")).toBe(1000)
    expect(readDecimal(" 1.27 ")).toBe(1.27)
    expect(readDecimal(".5")).toBe(0.5)
    expect(readDecimal("12.")).toBe(12)
  })

  it("refuses text, blanks, signs and two points", () => {
    for (const text of ["", "abc", "-5", "1.2.3", "1e3"]) {
      expect(readDecimal(text), text).toBeNull()
    }
  })
})

describe("showing money and percents", () => {
  it("rounds to dollars above $100 and names runaway amounts", () => {
    expect(formatToolMoney(37783.43)).toBe("$37,783")
    expect(formatToolMoney(Infinity)).toBe("Over $1 quadrillion")
    expect(formatToolPercent(0.012697)).toBe("1.27%")
  })
})
