import { describe, expect, it } from "vitest"

import {
  phemexRefusalCode,
  phemexRefusalError,
} from "@/server/protocols/phemex/refusals"

describe("Phemex refusals", () => {
  it.each([
    ["PHEMEX_11150:TE_OI_LIMIT_REDUCE_ONLY", "PHEMEX_OPEN_INTEREST"],
    ["PHEMEX_39108:invalid leverages", "PHEMEX_LEVERAGE"],
    ["PHEMEX_11005:not enough balance", "PHEMEX_MARGIN_BALANCE"],
    ["PHEMEX_11006:no position", "PHEMEX_MARGIN_POSITION_GONE"],
    ["PHEMEX_11007:cross margin", "PHEMEX_MARGIN_CROSS"],
    ["PHEMEX_11008:cannot remove margin", "PHEMEX_MARGIN_TOO_MUCH"],
    ["PHEMEX_20004:TE_ERR_INCONSISTENT_POS_MODE", "PHEMEX_POSITION_MODE"],
    ["PHEMEX_11043:TE_RISING_TRIGGER_DIRECTLY", "PHEMEX_TRIGGER_SIDE"],
    ["PHEMEX_10002:OM_ORDER_NOT_FOUND", "PHEMEX_ORDER_GONE"],
    ["PHEMEX_AUTH", "PHEMEX_AUTH"],
    ["PHEMEX_HTTP_429:/orders", "PHEMEX_BUSY"],
  ])("maps %s", (reason, code) => {
    expect(phemexRefusalCode(reason)).toBe(code)
    expect(phemexRefusalError(reason).message).toContain("Phemex")
  })

  it("keeps an unknown exchange reason", () => {
    const message = phemexRefusalError("PHEMEX_777:new reason").message
    expect(message).toContain("reason Trade does not recognize")
    expect(message).toContain("PHEMEX_777:new reason")
  })

  it("strikes a key-shaped value from an unknown reason", () => {
    const key = `0x${"a".repeat(64)}`
    expect(phemexRefusalError(`PHEMEX_777:${key}`).message).not.toContain(key)
  })
})
