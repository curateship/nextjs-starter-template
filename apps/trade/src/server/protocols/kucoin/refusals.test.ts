import { describe, expect, it } from "vitest"

import {
  kucoinRefusalCode,
  kucoinRefusalError,
} from "@/server/protocols/kucoin/refusals"

describe("KuCoin refusals", () => {
  it.each([
    ["KUCOIN_300009:No open positions to close.", "KUCOIN_POSITION_GONE"],
    ["KUCOIN_330005:Switch margin mode.", "KUCOIN_MARGIN_MODE"],
    ["KUCOIN_106164:Quantity too low", "KUCOIN_ORDER_TOO_SMALL"],
    ["KUCOIN_106168:Base step size mismatch", "KUCOIN_SIZE_STEP"],
    ["KUCOIN_106169:Price step size mismatch", "KUCOIN_PRICE_STEP"],
    ["KUCOIN_300003:Balance not enough", "KUCOIN_MARGIN"],
    ["KUCOIN_429000:Too Many Requests", "KUCOIN_BUSY"],
    ["KUCOIN_300012:Order price cannot be lower", "KUCOIN_PRICE_RANGE"],
    ["KUCOIN_300005:Maximum risk limit", "KUCOIN_RISK_LIMIT"],
  ])("maps %s", (reason, code) => {
    expect(kucoinRefusalCode(reason)).toBe(code)
    expect(kucoinRefusalError(reason).message).toContain("KuCoin")
  })

  it("keeps an unknown exchange reason", () => {
    const message = kucoinRefusalError("KUCOIN_777:new reason").message
    expect(message).toContain("reason Trade does not recognize")
    expect(message).toContain("KUCOIN_777:new reason")
  })

  it("strikes a key-shaped value from an unknown reason", () => {
    const key = `0x${"a".repeat(64)}`
    expect(kucoinRefusalError(`KUCOIN_777:${key}`).message).not.toContain(key)
  })
})
