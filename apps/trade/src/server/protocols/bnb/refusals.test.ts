import { describe, expect, it } from "vitest"
import { BaseError } from "viem"
import {
  bnbNodeRefusalCode,
  bnbRefusalError,
  bnbRefusalSentence,
  explainBnbError,
  kyberRefusalCode,
  type BnbRefusal,
} from "./refusals"
import fixture from "./refusals.fixture.json"
const hash = `0x${"a".repeat(64)}`
const secret = "FAKE_SECRET_do_not_display https://rpc.example/?key=FAKE_KEY"
describe("BNB refusals", () => {
  it.each(fixture.live)(
    "translates the saved $name answer",
    ({ body, expected }) => {
      expect(kyberRefusalCode(body)).toBe(expected)
      expect(bnbRefusalError(expected as BnbRefusal).message).toMatch(
        /^LIVE_ORDER_REFUSED:/
      )
    }
  )
  it.each(fixture.documented)(
    "translates documented code $code without carrying its text",
    (body) => {
      const code = kyberRefusalCode({ ...body, message: secret })!
      expect(code).not.toBe("unknown")
      expect(bnbRefusalSentence(code)).not.toContain(secret)
      expect(bnbRefusalSentence(code)).toContain("No new transaction fee")
    }
  )
  it.each([
    ["Return amount is not enough", "slippage"],
    ["TRANSFER_FROM_FAILED", "approval"],
    ["insufficient funds for gas * price + value", "gas"],
    ["transaction was replaced", "replaced"],
    ["transaction stuck", "pending"],
    ["HTTP 429 Too Many Requests", "node-busy"],
  ] as const)("translates nested node failure %s", (message, code) => {
    expect(
      bnbNodeRefusalCode(
        new BaseError("RPC failed", {
          cause: new Error(`${message} ${secret}`),
        })
      )
    ).toBe(code)
    expect(
      explainBnbError(new Error(`${message} ${secret}`)).message
    ).not.toContain(secret)
  })
  it("keeps the reserve, allowance, paid gas and explorer hash in plain words", () => {
    expect(bnbRefusalSentence("gas")).toContain("0.005 BNB")
    expect(bnbRefusalSentence("kyber-busy")).toContain("30 per 10 seconds")
    const message = bnbRefusalSentence("slippage", {
      hash,
      feeWei: 21000000000000n,
    })
    expect(message).toContain('"Worst fill allowed %"')
    expect(message).toContain("0.000021 BNB was spent")
    expect(message).toContain(hash)
    expect(message).toContain("bscscan.com")
  })
  it("does not claim pending or replaced transactions failed or paid no fee", () => {
    for (const code of [
      "pending",
      "replaced",
      "unknown",
      "gas",
      "slippage",
    ] as const) {
      const message = bnbRefusalSentence(code, { hash, pending: true })
      expect(message).toContain("fee is not confirmed")
      expect(message).not.toMatch(
        /no coins moved|No swap coins moved|No new transaction fee/
      )
      expect(message).toContain("before placing another trade")
    }
  })
  it("drops forged prefixes, unknown bodies, invalid hashes and cyclic causes", () => {
    for (const prefix of ["", "LIVE_ORDER_REFUSED:", "EXCHANGE_BUSY:"]) {
      const error = explainBnbError(new Error(prefix + secret))
      expect(error.message).toContain(
        "BNB Chain refused the trade, and no coins moved."
      )
      expect(error.message).not.toContain("FAKE_")
      expect(error.cause).toBeUndefined()
      expect(error.stack).not.toContain(secret)
    }
    expect(kyberRefusalCode({ code: 989898, message: secret })).toBe("unknown")
    expect(bnbRefusalSentence("unknown", { hash: secret })).not.toContain(
      secret
    )
    const cycle: { cause?: unknown } = {}
    cycle.cause = cycle
    expect(bnbNodeRefusalCode(cycle)).toBe("unknown")
  })
  it("preserves trusted sentences and accounts for earlier approvals", () => {
    const error = bnbRefusalError("no-route")
    const mapped = explainBnbError(error, { approvalFeeWei: 1000000000000n })
    expect(mapped.message).toContain(
      "Confirmed approvals spent 0.000001 BNB separately."
    )
    expect(
      explainBnbError(mapped, { approvalFeeWei: 1000000000000n }).message
    ).toBe(mapped.message)
  })
})
