import { describe, expect, it } from "vitest"

import saved from "./edgex.fixture.json"
import { closedSentence, edgexRefusalError } from "@/server/protocols/edgex/refusals"

function said(status: number, code: string, context = {}): string {
  return edgexRefusalError({ status, code }, context).message
}

describe("edgeX's refusals in plain words", () => {
  it("says the key was not accepted for the real bogus-key answer", () => {
    expect(said(401, saved.badKey.code)).toMatch(/^LIVE_ORDER_REFUSED:edgeX did not accept this API key\./)
  })

  it("tells a request signature apart from an order signature", () => {
    expect(said(401, "INVALID_SIGNATURE")).toContain("check the secret and the passphrase")
    expect(said(400, "L2_SIGNATURE_INVALID")).toContain("signer key does not belong to this account")
    expect(said(400, "INVALID_L2_NONCE")).toContain("signer key")
  })

  it("names the clock, the passphrase and the missing order", () => {
    expect(said(400, "INVALID_TIMESTAMP")).toContain("re-read edgeX's clock")
    expect(said(401, "INVALID_PASSPHRASE")).toContain("passphrase")
    expect(said(200, "ORDER_NOT_FOUND")).toContain("not open any more")
  })

  it("says not enough cash and too small in dollars", () => {
    expect(said(200, "INSUFFICIENT_AVAILABLE_BALANCE", { freeUsd: 12.4, needUsd: 25 })).toContain(
      "edgeX says the account has $12.40 free and this order needs $25.00"
    )
    expect(said(200, "ORDER_SIZE_LESS_THAN_MIN", { minUsd: 84.4 })).toContain("about $84.40")
  })

  it("says a trigger on the wrong side and a leverage change blocked by open orders", () => {
    expect(said(200, "TRIGGER_PRICE_INVALID")).toContain("wrong side of the price")
    expect(said(200, "ACCOUNT_UPDATE_LEVERAGE_FAILED_ORDER")).toContain("Cancel the resting orders")
  })

  it("says a stock market is closed, without inventing when it opens", () => {
    expect(said(200, "STOCK_MARKET_CLOSED", { market: "SAMSUNG" })).toContain(
      "SAMSUNG's market on edgeX is closed right now"
    )
    expect(closedSentence()).toContain("edgeX does not say when it reopens")
  })

  it("throws an unknown code away, secret-looking text and all", () => {
    const message = said(200, "SOMETHING_NEW_sk_live_1234567890abcdef")
    expect(message).toBe(
      "LIVE_ORDER_REFUSED:edgeX refused it and said nothing Trade can put in words. Check the order and the account on edgeX's own site before trying again."
    )
    expect(message).not.toContain("sk_live")
    expect(message).not.toContain("SOMETHING_NEW")
  })

  it("answers edgeX's own server trouble and a refused value", () => {
    expect(said(502, "HTTP_502")).toContain("problem on its own side")
    expect(said(400, saved.pageSize.code)).toContain("refused a value in the request")
  })
})
