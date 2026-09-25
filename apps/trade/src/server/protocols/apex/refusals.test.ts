import { describe, expect, it } from "vitest"

import fixture from "./apex.fixture.json"
import { apexRefusalError } from "@/server/protocols/apex/refusals"

function said(input: { status?: number; code: number | string; msg?: string }, context = {}) {
  return apexRefusalError(
    { status: input.status ?? 200, code: String(input.code), msg: input.msg },
    context
  ).message
}

describe("ApeX Omni's refusals in plain words", () => {
  it("names a refused timestamp, from two real answers", () => {
    for (const answer of [fixture.refusals.noTimestamp, fixture.refusals.staleTimestamp]) {
      expect(said(answer)).toMatch(/^LIVE_ORDER_REFUSED:ApeX Omni refused the request's time\. Trade re-read ApeX's clock/)
    }
  })

  it("names bad API values from a real answer, without the key ApeX quoted back", () => {
    const refusal = said(fixture.refusals.badKey)
    expect(refusal).toMatch(/did not accept these API values/)
    expect(refusal).toMatch(/secret or passphrase/)
    expect(refusal).not.toContain("11111111-2222")
    expect(refusal).not.toContain("rpc error")
  })

  it("says what not having enough cash means, in dollars", () => {
    expect(
      said({ code: 1, msg: "ORDER_THERE_IS_NOT_ENOUGH_MARGIN_TO_OPEN_POSITION" }, { freeUsd: 12.4, needUsd: 25 })
    ).toBe("LIVE_ORDER_REFUSED:ApeX Omni says the account has $12.40 free and this order needs $25.00. Use a smaller size or free some cash first.")
  })

  it("says the smallest order in dollars", () => {
    expect(
      said({ code: 1, msg: "ORDER_SIZE_SMALLER_THAN_SYMBOL_MIN_ORDER_SIZE Order size 0.0001 smaller than symbol BTC-USDT min order size 0.001" }, { minUsd: 84 })
    ).toBe("LIVE_ORDER_REFUSED:ApeX Omni's smallest order on this market is about $84.00 at today's price. Use a bigger size.")
  })

  it("translates each documented key it knows", () => {
    expect(said({ code: 1, msg: "INVALID_L2_SIGNATURE" })).toMatch(/refused the order's signature/)
    expect(said({ code: 1, msg: "ORDER_NOT_FOUND This order does not exist. 123" })).toMatch(/not open any more/)
    expect(said({ code: 1, msg: "ORDER_OPEN_ORDER_COUNT_LIMIT_EXCEED You have 200 open orders" })).toMatch(/200 open orders/)
    expect(said({ code: 1, msg: "ORDER_WITH_THIS_PRICE_CANNOT_REDUCE_POSITION_ONLY" })).toMatch(/reduce-only/)
    expect(said({ code: 1, msg: "ORDER_SYMBOL_DISABLE_TRADE Symbol X disable trade" })).toMatch(/not taking new orders on this market/)
    expect(said({ code: 1, msg: "ORDER_LIMIT_FEE_NOT_ENOUGH" })).toMatch(/fee this order was allowed to pay/)
    expect(said({ code: 1, msg: "rpc error: code = PermissionDenied desc = x" })).toMatch(/API key is not allowed/)
    expect(said({ code: 3, msg: "invalid symbol: BTCUSDT" })).toMatch(/does not know that market/)
  })

  it("throws away an unknown refusal's words, secrets and all, and keeps only its number", () => {
    const refusal = said({
      code: 99123,
      msg: "boom secret=sAVchdqy_n9zY7TOIDsqkyg0we3uF0_gGbvyIoob passphrase=Ri08mFrOt2Uaiym 0xdeadbeef",
    })
    expect(refusal).toBe(
      "LIVE_ORDER_REFUSED:ApeX Omni refused it (code 99123). Nothing else is known about why. Check the order on ApeX's own site before trying again."
    )
  })

  it("keeps even the number out when it is not a number", () => {
    expect(said({ code: "<script>", msg: "x" })).toMatch(/\(code unknown\)/)
  })
})
