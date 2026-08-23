import { describe, expect, it } from "vitest"

import {
  asterRefusalError,
  asterRefusalSentence,
} from "@/server/protocols/aster/refusals"

describe("Aster refusals", () => {
  it.each([
    [401, "401", "ASTER_AUTH"],
    [400, "-1021", "ASTER_CLOCK"],
    [429, "-1003", "EXCHANGE_BUSY"],
    [418, "418", "ASTER_IP_BANNED"],
    [400, "-4164", "ASTER_ORDER_TOO_SMALL"],
    [400, "-4014", "ASTER_PRICE_STEP"],
    [400, "-4161", "ASTER_LEVERAGE_OPEN_POSITION"],
    [400, "-4168", "ASTER_ISOLATED_MULTI_ASSET"],
    [400, "-5019", "ASTER_REGION"],
    [400, "-2013", "ASTER_ORDER_GONE"],
  ])("maps %s and %s to %s", (status, code, expected) => {
    expect(asterRefusalError({ status, code }).message).toMatch(
      new RegExp(`^${expected}:`)
    )
  })

  it("does not expose text from an unknown refusal", () => {
    const key = `0x${"a".repeat(64)}`
    const message = asterRefusalError({
      status: 400,
      code: "-9999",
      message: `bad ${key}`,
    }).message
    expect(message).not.toContain(key)
    expect(message).not.toContain("bad")
    expect(message).toContain("reason Trade does not recognize")
    expect(message).toContain("code -9999")
  })

  it("does not call Aster's firewall refusal a bad key", () => {
    expect(
      asterRefusalError({ status: 403, code: "403", message: "WAF" }).message
    ).toMatch(/^ASTER_REFUSED:/)
    expect(
      asterRefusalError({ status: 403, code: "403", message: "WAF" }).message
    ).not.toContain("WAF")
  })

  it("gives every named refusal a next step", () => {
    expect(asterRefusalSentence("ASTER_CLOCK")).toContain("measure")
    expect(asterRefusalSentence("ASTER_IP_BANNED")).toContain("will not retry")
    expect(asterRefusalSentence("ASTER_ISOLATED_MULTI_ASSET")).toContain(
      "Single-Asset Mode"
    )
    expect(asterRefusalSentence("ASTER_REGION")).toContain("No order was sent")
  })
})
