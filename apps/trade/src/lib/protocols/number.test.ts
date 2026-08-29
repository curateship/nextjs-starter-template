import { describe, expect, it } from "vitest"

import { num as asterNum } from "@/lib/protocols/aster/translate"
import { num as hyperliquidNum } from "@/lib/protocols/hyperliquid/translate"
import { num as kucoinNum } from "@/lib/protocols/kucoin/translate"
import { num as lighterNum } from "@/lib/protocols/lighter/translate"
import { num } from "@/lib/protocols/number"
import { num as phemexNum } from "@/lib/protocols/phemex/translate"

describe("exchange numbers", () => {
  it("accepts finite strings and numbers", () => {
    expect(num(" 12.5 ")).toBe(12.5)
    expect(num(7)).toBe(7)
  })

  it.each(["", "   ", "not-a-number", Number.NaN, Number.POSITIVE_INFINITY])(
    "refuses %j",
    (value) => expect(num(value)).toBeNull()
  )

  it("gives all five exchanges the same whitespace rule", () => {
    for (const exchangeNum of [
      asterNum,
      hyperliquidNum,
      kucoinNum,
      lighterNum,
      phemexNum,
    ]) {
      expect(exchangeNum(" \t ")).toBeNull()
      expect(exchangeNum("10.25")).toBe(10.25)
    }
  })
})
