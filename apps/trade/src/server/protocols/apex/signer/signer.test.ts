import { describe, expect, it } from "vitest"

import fixture from "./connector-signatures.fixture.json"
import {
  apexOrderSlots,
  apexPublicKeyOf,
  scaleBy1e18,
  signApexContract,
} from "@/server/protocols/apex/signer"

/**
 * Every signature here was made by ApeX's own connector code at the commit
 * `PROVENANCE.md` names. `index.ts` shares none of its libraries, so a match
 * byte for byte is the proof that an order signed here is the order ApeX's
 * connector would have signed.
 */
describe("ApeX Omni's zkLink signer", () => {
  for (const { input, output } of fixture.cases) {
    it(`matches the connector's signature for ${input.clientId}`, async () => {
      const slots = apexOrderSlots(input.clientId, fixture.accountId)
      expect(String(slots.accountId)).toBe(output.accountId)
      expect(String(slots.slotId)).toBe(output.slotId)
      expect(String(slots.nonce)).toBe(output.nonce)
      expect(scaleBy1e18(input.size)).toBe(output.size)
      expect(scaleBy1e18(input.price)).toBe(output.price)
      const signed = await signApexContract(fixture.omniKey, {
        accountId: fixture.accountId,
        clientOrderId: input.clientId,
        l2PairId: Number(input.pairId),
        size: input.size,
        price: input.price,
        side: input.side as "BUY" | "SELL",
        makerFeeRate: input.makerFeeRate,
        takerFeeRate: input.takerFeeRate,
      })
      expect(signed).toEqual({ signature: output.signature, pubKey: output.pubKey })
    })
  }

  it("signs twice in a row, because it makes a fresh signer each time", async () => {
    const first = await apexPublicKeyOf(fixture.omniKey)
    const second = await apexPublicKeyOf(fixture.omniKey.slice(2))
    expect(first).toBe(fixture.cases[0].output.pubKey)
    expect(second).toBe(first)
  })

  it("refuses an omni key of the wrong length without repeating it", async () => {
    const refusal = await apexPublicKeyOf("0x1234abcd").catch((error: Error) => error.message)
    expect(refusal).toMatch(/^KEY_NOT_APPROVED:The omni key could not be read/)
    expect(refusal).not.toContain("1234abcd")
  })

  it("refuses a client id the connector would hash as hex", () => {
    expect(() => apexOrderSlots("0xabc", "1")).toThrow("LIVE_ORDER_ID")
  })
})
