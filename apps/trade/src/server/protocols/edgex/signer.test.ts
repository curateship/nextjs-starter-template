import { describe, expect, it } from "vitest"

import { toEdgexCatalogue } from "@/server/protocols/edgex/catalogue"
import { edgexSignature, edgexSignedValue } from "@/server/protocols/edgex/client"
import {
  edgexNonce,
  edgexSignerAddress,
  signEdgexOrder,
} from "@/server/protocols/edgex/signer"

import saved from "./edgex.fixture.json"
import sdk from "./sdk-signatures.fixture.json"

/**
 * `sdk-signatures.fixture.json` was written by edgeX's own Python SDK 2.0.1
 * (`OrderClient.create_order` and `build_hmac_signature`), with the SDK's own made-up test key, a made-up
 * secret and the clock frozen at `nowMs`. The metadata it signed against is
 * the real 24 Sep 2026 answer in `edgex.fixture.json`.
 */
const catalogue = toEdgexCatalogue(saved.metadata)
const facts = catalogue.signing!
const credential = {
  accountId: sdk.accountId,
  signerKey: sdk.signerKey as `0x${string}`,
}

function contractNamed(contractId: string) {
  const found = catalogue.contracts.find((one) => one.contractId === contractId)
  if (!found) throw new Error(`no contract ${contractId}`)
  return found
}

describe("edgeX's order signature", () => {
  it("reads the chain and contract to sign for from the metadata", () => {
    expect(facts).toEqual({
      chainId: 3343,
      verifyingContract: "0xeeb3fb05cca17745cbdf193a9b16537efb68fac8",
      collateralCoinId: "1000",
      collateralResolution: 1_000_000n,
    })
  })

  it("derives the signer's address as the SDK does", () => {
    expect(edgexSignerAddress(credential.signerKey)).toBe(sdk.signerAddress)
  })

  it.each(sdk.orders.map((order) => [order.name, order] as const))(
    "signs %s byte for byte with the SDK",
    async (_name, order) => {
      const body = order.body as Record<string, string | boolean | null>
      const signed = await signEdgexOrder({
        credential,
        facts,
        contract: contractNamed(String(body.contractId)),
        side: body.side as "BUY" | "SELL",
        size: String(body.size),
        l2Price: order.l2Price,
        clientOrderId: String(body.clientOrderId),
        now: sdk.nowMs,
      })
      expect(signed.l2Nonce).toBe(body.l2Nonce)
      expect(signed.expireTime).toBe(body.expireTime)
      expect(signed.l2ExpireTime).toBe(body.l2ExpireTime)
      expect(signed.l2Value).toBe(body.l2Value)
      expect(signed.l2Size).toBe(body.l2Size)
      expect(signed.l2LimitFee).toBe(body.l2LimitFee)
      // The SDK writes the signature without 0x; edgeX's page and its Go SDK
      // send it with, which is what the app sends.
      expect(signed.l2Signature).toBe(`0x${body.l2Signature}`)
    }
  )

  it("takes the nonce from the first 32 bits of the client order id's hash", () => {
    expect(edgexNonce("trade-abc123")).toBe(2296946694)
    expect(edgexNonce("trade-abc123")).toBeLessThan(2 ** 32)
  })
})

describe("edgeX's request signature", () => {
  it.each(sdk.orders.map((order) => [order.name, order] as const))(
    "signs the %s body as the SDK does",
    (_name, order) => {
      // The SDK sends every field, nulls included. Trade leaves out a field
      // with nothing in it, so the same body without its nulls must sign the
      // same way as the SDK's text once the SDK's empty fields are dropped
      // from both.
      expect(edgexSignedValue(order.body)).toBe(order.signedBody)
      expect(
        edgexSignature({
          timestamp: Number(order.timestamp),
          method: "POST",
          path: "/api/v2/private/order/createOrder",
          body: order.signedBody,
          secret: sdk.secret,
        })
      ).toBe(order.hmac)
    }
  )

  it("signs a GET as the SDK does", () => {
    expect(
      edgexSignature({
        timestamp: Number(sdk.getHmac.timestamp),
        method: "GET",
        path: sdk.getHmac.path,
        body: sdk.getHmac.query,
        secret: sdk.secret,
      })
    ).toBe(sdk.getHmac.signature)
  })
})
